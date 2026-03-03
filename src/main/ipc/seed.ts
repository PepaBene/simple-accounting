import { ipcMain } from 'electron';
import { getDb } from '../database/connection';

/**
 * Mock journal entries for testing. Uses Czech chart of accounts codes.
 * Covers: assets, liabilities, equity, revenue, expenses — enough to
 * populate all five financial statements.
 */
const MOCK_ENTRIES = [
  {
    date: '2026-01-02',
    description: 'Vklad základního kapitálu',
    reference: 'VKL-001',
    lines: [
      { code: '221', debit: 500000, credit: 0 },
      { code: '411', debit: 0, credit: 500000 },
    ],
  },
  {
    date: '2026-01-05',
    description: 'Nákup vybavení kanceláře',
    reference: 'FAP-001',
    lines: [
      { code: '022', debit: 120000, credit: 0 },
      { code: '221', debit: 0, credit: 120000 },
    ],
  },
  {
    date: '2026-01-10',
    description: 'Přijatý bankovní úvěr',
    reference: 'UV-001',
    lines: [
      { code: '221', debit: 200000, credit: 0 },
      { code: '461', debit: 0, credit: 200000 },
    ],
  },
  {
    date: '2026-01-15',
    description: 'Tržby za služby – leden',
    reference: 'FV-001',
    lines: [
      { code: '311', debit: 85000, credit: 0 },
      { code: '602', debit: 0, credit: 85000 },
    ],
  },
  {
    date: '2026-01-20',
    description: 'Nákup materiálu',
    reference: 'FAP-002',
    lines: [
      { code: '501', debit: 18000, credit: 0 },
      { code: '321', debit: 0, credit: 18000 },
    ],
  },
  {
    date: '2026-01-25',
    description: 'Nákup kancelářských potřeb',
    reference: 'FAP-003',
    lines: [
      { code: '501', debit: 3500, credit: 0 },
      { code: '211', debit: 0, credit: 3500 },
    ],
  },
  {
    date: '2026-01-31',
    description: 'Mzdy zaměstnanců – leden',
    reference: 'MZD-001',
    lines: [
      { code: '521', debit: 65000, credit: 0 },
      { code: '331', debit: 0, credit: 65000 },
    ],
  },
  {
    date: '2026-01-31',
    description: 'Sociální a zdravotní pojištění – zaměstnavatel',
    reference: 'POJ-001',
    lines: [
      { code: '524', debit: 22100, credit: 0 },
      { code: '336', debit: 0, credit: 22100 },
    ],
  },
  {
    date: '2026-01-31',
    description: 'Nájem kanceláře – leden',
    reference: 'FAP-004',
    lines: [
      { code: '518', debit: 15000, credit: 0 },
      { code: '321', debit: 0, credit: 15000 },
    ],
  },
  {
    date: '2026-01-31',
    description: 'Odpisy vybavení – leden',
    reference: 'ODP-001',
    lines: [
      { code: '551', debit: 2000, credit: 0 },
      { code: '082', debit: 0, credit: 2000 },
    ],
  },
  {
    date: '2026-02-05',
    description: 'Úhrada od odběratele',
    reference: 'BV-001',
    lines: [
      { code: '221', debit: 85000, credit: 0 },
      { code: '311', debit: 0, credit: 85000 },
    ],
  },
  {
    date: '2026-02-10',
    description: 'Tržby za služby – únor',
    reference: 'FV-002',
    lines: [
      { code: '311', debit: 95000, credit: 0 },
      { code: '602', debit: 0, credit: 95000 },
    ],
  },
  {
    date: '2026-02-15',
    description: 'Tržby za zboží',
    reference: 'FV-003',
    lines: [
      { code: '311', debit: 42000, credit: 0 },
      { code: '604', debit: 0, credit: 42000 },
    ],
  },
  {
    date: '2026-02-20',
    description: 'Úhrada závazku dodavateli',
    reference: 'BV-002',
    lines: [
      { code: '321', debit: 33000, credit: 0 },
      { code: '221', debit: 0, credit: 33000 },
    ],
  },
  {
    date: '2026-02-25',
    description: 'Výplata mezd',
    reference: 'BV-003',
    lines: [
      { code: '331', debit: 65000, credit: 0 },
      { code: '221', debit: 0, credit: 65000 },
    ],
  },
  {
    date: '2026-02-28',
    description: 'Mzdy zaměstnanců – únor',
    reference: 'MZD-002',
    lines: [
      { code: '521', debit: 65000, credit: 0 },
      { code: '331', debit: 0, credit: 65000 },
    ],
  },
  {
    date: '2026-02-28',
    description: 'Nájem kanceláře – únor',
    reference: 'FAP-005',
    lines: [
      { code: '518', debit: 15000, credit: 0 },
      { code: '321', debit: 0, credit: 15000 },
    ],
  },
  {
    date: '2026-02-28',
    description: 'Odpisy vybavení – únor',
    reference: 'ODP-002',
    lines: [
      { code: '551', debit: 2000, credit: 0 },
      { code: '082', debit: 0, credit: 2000 },
    ],
  },
  {
    date: '2026-02-28',
    description: 'Úroky z bankovního úvěru',
    reference: 'BV-004',
    lines: [
      { code: '562', debit: 1500, credit: 0 },
      { code: '221', debit: 0, credit: 1500 },
    ],
  },
  {
    date: '2026-02-28',
    description: 'Úroky z bankovního účtu',
    reference: 'BV-005',
    lines: [
      { code: '221', debit: 250, credit: 0 },
      { code: '662', debit: 0, credit: 250 },
    ],
  },
];

export function registerSeedHandlers(): void {
  ipcMain.handle('seed:mockEntries', (_event, workbookId: number) => {
    try {
      const db = getDb();

      // Build account code → id map for this workbook
      const accounts = db
        .prepare('SELECT id, code FROM accounts WHERE workbook_id = ?')
        .all(workbookId) as Array<{ id: number; code: string }>;

      const codeMap = new Map<string, number>();
      for (const acc of accounts) {
        codeMap.set(acc.code, acc.id);
      }

      // Validate all codes exist before inserting
      for (const entry of MOCK_ENTRIES) {
        for (const line of entry.lines) {
          if (!codeMap.has(line.code)) {
            return {
              success: false,
              error: `Účet ${line.code} nebyl nalezen. Nejprve načtěte šablonu českého účtového rozvrhu.`,
            };
          }
        }
      }

      const insertEntry = db.prepare(
        'INSERT INTO journal_entries (workbook_id, entry_date, description, reference) VALUES (?, ?, ?, ?)',
      );
      const insertLine = db.prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)',
      );

      const insertAll = db.transaction(() => {
        let count = 0;
        for (const entry of MOCK_ENTRIES) {
          const result = insertEntry.run(
            workbookId,
            entry.date,
            entry.description,
            entry.reference,
          );
          const entryId = result.lastInsertRowid;

          for (const line of entry.lines) {
            insertLine.run(entryId, codeMap.get(line.code)!, line.debit, line.credit, null);
          }
          count++;
        }
        return count;
      });

      const count = insertAll();
      return { success: true, data: { count } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
