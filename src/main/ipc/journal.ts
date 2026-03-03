import { ipcMain } from 'electron';
import { getDb } from '../database/connection';

interface JournalLine {
  account_id: number;
  debit_amount: number;
  credit_amount: number;
  description?: string;
}

interface CreateJournalData {
  workbook_id: number;
  entry_date: string;
  description: string;
  reference?: string;
  lines: JournalLine[];
}

interface UpdateJournalData {
  entry_date: string;
  description: string;
  reference?: string;
  lines: JournalLine[];
}

interface RawEntryRow {
  id: number;
  workbook_id: number;
  entry_date: string;
  description: string | null;
  reference: string | null;
  created_at: string;
  line_id: number | null;
  account_id: number | null;
  debit_amount: number | null;
  credit_amount: number | null;
  line_description: string | null;
  account_code: string | null;
  account_name: string | null;
}

interface EntryWithLines {
  id: number;
  workbook_id: number;
  entry_date: string;
  description: string | null;
  reference: string | null;
  created_at: string;
  lines: Array<{
    id: number;
    account_id: number;
    debit_amount: number;
    credit_amount: number;
    description: string | null;
    account_code: string;
    account_name: string;
  }>;
}

function groupEntryWithLines(rows: RawEntryRow[]): EntryWithLines[] {
  const entriesMap = new Map<number, EntryWithLines>();

  for (const row of rows) {
    if (!entriesMap.has(row.id)) {
      entriesMap.set(row.id, {
        id: row.id,
        workbook_id: row.workbook_id,
        entry_date: row.entry_date,
        description: row.description,
        reference: row.reference,
        created_at: row.created_at,
        lines: [],
      });
    }

    const entry = entriesMap.get(row.id)!;

    if (row.line_id !== null) {
      entry.lines.push({
        id: row.line_id,
        account_id: row.account_id!,
        debit_amount: row.debit_amount!,
        credit_amount: row.credit_amount!,
        description: row.line_description,
        account_code: row.account_code!,
        account_name: row.account_name!,
      });
    }
  }

  return Array.from(entriesMap.values());
}

const ENTRY_WITH_LINES_QUERY = `
  SELECT
    je.id,
    je.workbook_id,
    je.entry_date,
    je.description,
    je.reference,
    je.created_at,
    jel.id AS line_id,
    jel.account_id,
    jel.debit_amount,
    jel.credit_amount,
    jel.description AS line_description,
    a.code AS account_code,
    a.name AS account_name
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN accounts a ON a.id = jel.account_id
`;

function validateBalance(lines: JournalLine[]): void {
  const totalDebits = lines.reduce((sum, line) => sum + line.debit_amount, 0);
  const totalCredits = lines.reduce((sum, line) => sum + line.credit_amount, 0);

  // Use a small epsilon for floating point comparison
  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    throw new Error(
      `Debits (${totalDebits.toFixed(2)}) must equal credits (${totalCredits.toFixed(2)})`
    );
  }
}

export function registerJournalHandlers(): void {
  ipcMain.handle('journal:getByWorkbook', (_event, workbookId: number) => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `${ENTRY_WITH_LINES_QUERY}
           WHERE je.workbook_id = ?
           ORDER BY je.entry_date DESC, je.id DESC`
        )
        .all(workbookId) as RawEntryRow[];

      const entries = groupEntryWithLines(rows);
      return { success: true, data: entries };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('journal:getById', (_event, id: number) => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `${ENTRY_WITH_LINES_QUERY}
           WHERE je.id = ?
           ORDER BY jel.id`
        )
        .all(id) as RawEntryRow[];

      if (rows.length === 0) {
        return { success: false, error: 'Journal entry not found' };
      }

      const entries = groupEntryWithLines(rows);
      return { success: true, data: entries[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('journal:create', (_event, data: CreateJournalData) => {
    try {
      const db = getDb();

      if (!data.lines || data.lines.length === 0) {
        return { success: false, error: 'Journal entry must have at least one line' };
      }

      validateBalance(data.lines);

      const createEntry = db.transaction(() => {
        const entryResult = db
          .prepare(
            'INSERT INTO journal_entries (workbook_id, entry_date, description, reference) VALUES (?, ?, ?, ?)'
          )
          .run(
            data.workbook_id,
            data.entry_date,
            data.description,
            data.reference ?? null
          );

        const entryId = entryResult.lastInsertRowid;

        const insertLine = db.prepare(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)'
        );

        for (const line of data.lines) {
          insertLine.run(
            entryId,
            line.account_id,
            line.debit_amount,
            line.credit_amount,
            line.description ?? null
          );
        }

        return entryId;
      });

      const entryId = createEntry();

      // Fetch the created entry with lines
      const rows = db
        .prepare(
          `${ENTRY_WITH_LINES_QUERY}
           WHERE je.id = ?
           ORDER BY jel.id`
        )
        .all(entryId) as RawEntryRow[];

      const entries = groupEntryWithLines(rows);
      return { success: true, data: entries[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('journal:update', (_event, id: number, data: UpdateJournalData) => {
    try {
      const db = getDb();

      if (!data.lines || data.lines.length === 0) {
        return { success: false, error: 'Journal entry must have at least one line' };
      }

      validateBalance(data.lines);

      const updateEntry = db.transaction(() => {
        const result = db
          .prepare(
            'UPDATE journal_entries SET entry_date = ?, description = ?, reference = ? WHERE id = ?'
          )
          .run(data.entry_date, data.description, data.reference ?? null, id);

        if (result.changes === 0) {
          throw new Error('Journal entry not found');
        }

        // Delete old lines and insert new ones
        db.prepare('DELETE FROM journal_entry_lines WHERE journal_entry_id = ?').run(id);

        const insertLine = db.prepare(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)'
        );

        for (const line of data.lines) {
          insertLine.run(
            id,
            line.account_id,
            line.debit_amount,
            line.credit_amount,
            line.description ?? null
          );
        }
      });

      updateEntry();

      // Fetch the updated entry with lines
      const rows = db
        .prepare(
          `${ENTRY_WITH_LINES_QUERY}
           WHERE je.id = ?
           ORDER BY jel.id`
        )
        .all(id) as RawEntryRow[];

      const entries = groupEntryWithLines(rows);
      return { success: true, data: entries[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('journal:delete', (_event, id: number) => {
    try {
      const db = getDb();
      const result = db.prepare('DELETE FROM journal_entries WHERE id = ?').run(id);

      if (result.changes === 0) {
        return { success: false, error: 'Journal entry not found' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
