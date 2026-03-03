import { ipcMain, dialog } from 'electron';
import { getDb } from '../database/connection';
import * as fs from 'fs';
import * as Papa from 'papaparse';
import { jsPDF } from 'jspdf';

// --- Type definitions ---

interface AccountBalance {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  opening_balance: number;
  total_debits: number;
  total_credits: number;
  closing_balance: number;
}

interface AccountRow {
  id: number;
  workbook_id: number;
  code: string;
  name: string;
  account_type: string;
  parent_code: string | null;
  is_active: number;
  description: string | null;
}

interface DebitCreditRow {
  account_id: number;
  total_debits: number;
  total_credits: number;
}

interface JournalLineWithAccount {
  entry_date: string;
  entry_description: string | null;
  debit_amount: number;
  credit_amount: number;
  account_type: string;
  account_code: string;
}

interface CsvJournalRow {
  entry_date?: string;
  date?: string;
  description?: string;
  account_code?: string;
  debit_amount?: string;
  debit?: string;
  credit_amount?: string;
  credit?: string;
  reference?: string;
  line_description?: string;
  [key: string]: string | undefined;
}

// --- Helper functions ---

function getAccountBalances(workbookId: number): AccountBalance[] {
  const db = getDb();

  const accounts = db
    .prepare('SELECT * FROM accounts WHERE workbook_id = ? ORDER BY code')
    .all(workbookId) as AccountRow[];

  const totals = db
    .prepare(
      `SELECT
        jel.account_id,
        COALESCE(SUM(jel.debit_amount), 0) AS total_debits,
        COALESCE(SUM(jel.credit_amount), 0) AS total_credits
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.workbook_id = ?
      GROUP BY jel.account_id`
    )
    .all(workbookId) as DebitCreditRow[];

  const totalsMap = new Map<number, { total_debits: number; total_credits: number }>();
  for (const row of totals) {
    totalsMap.set(row.account_id, {
      total_debits: row.total_debits,
      total_credits: row.total_credits,
    });
  }

  return accounts.map((account) => {
    const t = totalsMap.get(account.id) || { total_debits: 0, total_credits: 0 };
    const openingBalance = 0; // Opening balance is 0 for now

    // For assets and expenses, debits increase the balance
    // For liabilities, equity, and revenue, credits increase the balance
    let closingBalance: number;
    if (account.account_type === 'asset' || account.account_type === 'expense') {
      closingBalance = openingBalance + t.total_debits - t.total_credits;
    } else {
      closingBalance = openingBalance + t.total_credits - t.total_debits;
    }

    return {
      account_id: account.id,
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      opening_balance: openingBalance,
      total_debits: t.total_debits,
      total_credits: t.total_credits,
      closing_balance: closingBalance,
    };
  });
}

function generateReportData(
  workbookId: number,
  reportType: string
): { headers: string[]; rows: string[][] } {
  if (reportType === 'trialBalance') {
    const balances = getAccountBalances(workbookId);
    const headers = [
      'Account Code',
      'Account Name',
      'Type',
      'Opening Balance',
      'Debits',
      'Credits',
      'Closing Balance',
    ];
    const rows = balances.map((b) => [
      b.code,
      b.name,
      b.account_type,
      b.opening_balance.toFixed(2),
      b.total_debits.toFixed(2),
      b.total_credits.toFixed(2),
      b.closing_balance.toFixed(2),
    ]);
    return { headers, rows };
  }

  if (reportType === 'balanceSheet') {
    const balances = getAccountBalances(workbookId);
    const headers = ['Account Code', 'Account Name', 'Type', 'Balance'];
    const relevantTypes = ['asset', 'liability', 'equity'];
    const rows = balances
      .filter((b) => relevantTypes.includes(b.account_type))
      .map((b) => [b.code, b.name, b.account_type, b.closing_balance.toFixed(2)]);
    return { headers, rows };
  }

  if (reportType === 'incomeStatement') {
    const balances = getAccountBalances(workbookId);
    const headers = ['Account Code', 'Account Name', 'Type', 'Balance'];
    const relevantTypes = ['revenue', 'expense'];
    const rows = balances
      .filter((b) => relevantTypes.includes(b.account_type))
      .map((b) => [b.code, b.name, b.account_type, b.closing_balance.toFixed(2)]);
    return { headers, rows };
  }

  // Default: trial balance
  const balances = getAccountBalances(workbookId);
  const headers = [
    'Account Code',
    'Account Name',
    'Type',
    'Opening Balance',
    'Debits',
    'Credits',
    'Closing Balance',
  ];
  const rows = balances.map((b) => [
    b.code,
    b.name,
    b.account_type,
    b.opening_balance.toFixed(2),
    b.total_debits.toFixed(2),
    b.total_credits.toFixed(2),
    b.closing_balance.toFixed(2),
  ]);
  return { headers, rows };
}

// --- Register handlers ---

export function registerReportHandlers(): void {
  // Trial Balance
  ipcMain.handle('reports:trialBalance', (_event, workbookId: number) => {
    try {
      const balances = getAccountBalances(workbookId);

      // Transform to debit/credit column format expected by the frontend
      const rows = balances.map((b) => {
        const isDebitNormal = b.account_type === 'asset' || b.account_type === 'expense';
        let closing_debit = 0;
        let closing_credit = 0;

        if (isDebitNormal) {
          if (b.closing_balance >= 0) {
            closing_debit = b.closing_balance;
          } else {
            closing_credit = Math.abs(b.closing_balance);
          }
        } else {
          if (b.closing_balance >= 0) {
            closing_credit = b.closing_balance;
          } else {
            closing_debit = Math.abs(b.closing_balance);
          }
        }

        return {
          account_id: b.account_id,
          code: b.code,
          name: b.name,
          account_type: b.account_type,
          opening_debit: 0,
          opening_credit: 0,
          turnover_debit: b.total_debits,
          turnover_credit: b.total_credits,
          closing_debit,
          closing_credit,
        };
      });

      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Balance Sheet
  ipcMain.handle('reports:balanceSheet', (_event, workbookId: number) => {
    try {
      const balances = getAccountBalances(workbookId);

      const assets: { code: string; name: string; amount: number }[] = [];
      const liabilities: { code: string; name: string; amount: number }[] = [];
      const equity: { code: string; name: string; amount: number }[] = [];

      for (const b of balances) {
        const item = { code: b.code, name: b.name, amount: b.closing_balance };

        if (b.account_type === 'asset') {
          assets.push(item);
        } else if (b.account_type === 'liability') {
          liabilities.push(item);
        } else if (b.account_type === 'equity') {
          equity.push(item);
        }
      }

      const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
      const totalLiabilitiesAndEquity =
        liabilities.reduce((sum, a) => sum + a.amount, 0) +
        equity.reduce((sum, a) => sum + a.amount, 0);

      return {
        success: true,
        data: { assets, liabilities, equity, totalAssets, totalLiabilitiesAndEquity },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Income Statement
  ipcMain.handle('reports:incomeStatement', (_event, workbookId: number) => {
    try {
      const balances = getAccountBalances(workbookId);

      const revenue: { code: string; name: string; amount: number }[] = [];
      const expenses: { code: string; name: string; amount: number }[] = [];

      for (const b of balances) {
        const item = { code: b.code, name: b.name, amount: b.closing_balance };

        if (b.account_type === 'revenue') {
          revenue.push(item);
        } else if (b.account_type === 'expense') {
          expenses.push(item);
        }
      }

      const totalRevenue = revenue.reduce((sum, a) => sum + a.amount, 0);
      const totalExpenses = expenses.reduce((sum, a) => sum + a.amount, 0);
      const netIncome = totalRevenue - totalExpenses;

      return {
        success: true,
        data: { revenue, expenses, totalRevenue, totalExpenses, netIncome },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Cash Flow Statement (simplified)
  ipcMain.handle('reports:cashFlowStatement', (_event, workbookId: number) => {
    try {
      const db = getDb();

      // Get all journal entry lines with account info for this workbook
      const lines = db
        .prepare(
          `SELECT
            je.entry_date,
            je.description AS entry_description,
            jel.debit_amount,
            jel.credit_amount,
            a.account_type,
            a.code AS account_code
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          JOIN accounts a ON a.id = jel.account_id
          WHERE je.workbook_id = ?
          ORDER BY je.entry_date`
        )
        .all(workbookId) as JournalLineWithAccount[];

      // Simplified classification:
      // Operating: revenue and expense account movements
      // Investing: asset account movements (non-cash assets)
      // Financing: liability and equity account movements
      const operating: { description: string; amount: number }[] = [];
      const investing: { description: string; amount: number }[] = [];
      const financing: { description: string; amount: number }[] = [];

      // Group by entry description for readability
      const operatingMap = new Map<string, number>();
      const investingMap = new Map<string, number>();
      const financingMap = new Map<string, number>();

      for (const line of lines) {
        const desc = line.entry_description || 'Unspecified';
        const netAmount = line.debit_amount - line.credit_amount;

        if (line.account_type === 'revenue' || line.account_type === 'expense') {
          operatingMap.set(desc, (operatingMap.get(desc) || 0) + netAmount);
        } else if (line.account_type === 'asset') {
          investingMap.set(desc, (investingMap.get(desc) || 0) + netAmount);
        } else if (line.account_type === 'liability' || line.account_type === 'equity') {
          financingMap.set(desc, (financingMap.get(desc) || 0) + netAmount);
        }
      }

      Array.from(operatingMap.entries()).forEach(([description, amount]) => {
        operating.push({ description, amount });
      });
      Array.from(investingMap.entries()).forEach(([description, amount]) => {
        investing.push({ description, amount });
      });
      Array.from(financingMap.entries()).forEach(([description, amount]) => {
        financing.push({ description, amount });
      });

      const totalOperating = operating.reduce((sum, item) => sum + item.amount, 0);
      const totalInvesting = investing.reduce((sum, item) => sum + item.amount, 0);
      const totalFinancing = financing.reduce((sum, item) => sum + item.amount, 0);
      const netChange = totalOperating + totalInvesting + totalFinancing;

      return {
        success: true,
        data: {
          operating,
          investing,
          financing,
          totalOperating,
          totalInvesting,
          totalFinancing,
          netChange,
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Equity Statement
  ipcMain.handle('reports:equityStatement', (_event, workbookId: number) => {
    try {
      const db = getDb();

      const equityAccounts = db
        .prepare(
          "SELECT * FROM accounts WHERE workbook_id = ? AND account_type = 'equity' ORDER BY code"
        )
        .all(workbookId) as AccountRow[];

      const items = equityAccounts.map((account) => {
        const totals = db
          .prepare(
            `SELECT
              COALESCE(SUM(jel.debit_amount), 0) AS total_debits,
              COALESCE(SUM(jel.credit_amount), 0) AS total_credits
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.workbook_id = ? AND jel.account_id = ?`
          )
          .get(workbookId, account.id) as { total_debits: number; total_credits: number };

        const openingBalance = 0;
        const increases = totals.total_credits;
        const decreases = totals.total_debits;
        const closingBalance = openingBalance + increases - decreases;

        return {
          code: account.code,
          name: account.name,
          openingBalance,
          increases,
          decreases,
          closingBalance,
        };
      });

      const totalOpening = items.reduce((sum, a) => sum + a.openingBalance, 0);
      const totalClosing = items.reduce((sum, a) => sum + a.closingBalance, 0);

      return {
        success: true,
        data: { items, totalOpening, totalClosing },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Export CSV
  ipcMain.handle(
    'reports:exportCsv',
    async (_event, workbookId: number, reportType: string) => {
      try {
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Export Report as CSV',
          defaultPath: `${reportType}-report.csv`,
          filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: 'Export cancelled' };
        }

        const { headers, rows } = generateReportData(workbookId, reportType);

        const csvData = Papa.unparse({
          fields: headers,
          data: rows,
        });

        fs.writeFileSync(filePath, csvData, 'utf-8');

        return { success: true, data: { filePath } };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Export PDF
  ipcMain.handle(
    'reports:exportPdf',
    async (_event, workbookId: number, reportType: string) => {
      try {
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Export Report as PDF',
          defaultPath: `${reportType}-report.pdf`,
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: 'Export cancelled' };
        }

        const { headers, rows } = generateReportData(workbookId, reportType);

        const doc = new jsPDF({ orientation: 'landscape' });

        // Title
        const titleMap: Record<string, string> = {
          trialBalance: 'Trial Balance',
          balanceSheet: 'Balance Sheet',
          incomeStatement: 'Income Statement',
          cashFlowStatement: 'Cash Flow Statement',
          equityStatement: 'Statement of Changes in Equity',
        };
        const title = titleMap[reportType] || 'Report';
        doc.setFontSize(16);
        doc.text(title, 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, 14, 28);

        // Table
        const startY = 35;
        const cellPadding = 4;
        const lineHeight = 8;
        const pageWidth = doc.internal.pageSize.getWidth();
        const colWidth = (pageWidth - 28) / headers.length;

        // Header row
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        headers.forEach((header, i) => {
          doc.text(header, 14 + i * colWidth, startY);
        });

        // Draw header underline
        doc.setLineWidth(0.5);
        doc.line(14, startY + 2, pageWidth - 14, startY + 2);

        // Data rows
        doc.setFont('helvetica', 'normal');
        let currentY = startY + lineHeight;

        for (const row of rows) {
          // Check if we need a new page
          if (currentY > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            currentY = 20;

            // Re-draw headers on new page
            doc.setFont('helvetica', 'bold');
            headers.forEach((header, i) => {
              doc.text(header, 14 + i * colWidth, currentY);
            });
            doc.line(14, currentY + 2, pageWidth - 14, currentY + 2);
            doc.setFont('helvetica', 'normal');
            currentY += lineHeight;
          }

          row.forEach((cell, i) => {
            doc.text(String(cell), 14 + i * colWidth, currentY);
          });
          currentY += lineHeight - cellPadding + cellPadding;
        }

        const pdfBuffer = doc.output('arraybuffer');
        fs.writeFileSync(filePath, Buffer.from(pdfBuffer));

        return { success: true, data: { filePath } };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Import CSV
  ipcMain.handle('reports:importCsv', async (_event, workbookId: number) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import Journal Entries from CSV',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        properties: ['openFile'],
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: 'Import cancelled' };
      }

      const csvContent = fs.readFileSync(filePaths[0], 'utf-8');

      const parsed = Papa.parse<CsvJournalRow>(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      });

      if (parsed.errors.length > 0) {
        const errorMessages = parsed.errors
          .slice(0, 5)
          .map((e) => `Row ${e.row}: ${e.message}`)
          .join('; ');
        return { success: false, error: `CSV parsing errors: ${errorMessages}` };
      }

      const db = getDb();

      // Build a map of account codes to account IDs for this workbook
      const accounts = db
        .prepare('SELECT id, code FROM accounts WHERE workbook_id = ?')
        .all(workbookId) as Array<{ id: number; code: string }>;

      const accountCodeMap = new Map<string, number>();
      for (const account of accounts) {
        accountCodeMap.set(account.code, account.id);
      }

      // Group CSV rows into journal entries
      // Expected CSV columns: entry_date (or date), description, account_code,
      //   debit_amount (or debit), credit_amount (or credit), reference, line_description
      // Rows with the same date + description + reference are grouped into one entry

      interface PendingLine {
        account_id: number;
        debit_amount: number;
        credit_amount: number;
        description: string | null;
      }

      interface PendingEntry {
        entry_date: string;
        description: string;
        reference: string | null;
        lines: PendingLine[];
      }

      const entriesMap = new Map<string, PendingEntry>();

      for (const row of parsed.data) {
        const entryDate = row.entry_date || row.date || '';
        const description = row.description || '';
        const accountCode = row.account_code || '';
        const debitAmount = parseFloat(row.debit_amount || row.debit || '0') || 0;
        const creditAmount = parseFloat(row.credit_amount || row.credit || '0') || 0;
        const reference = row.reference || null;
        const lineDescription = row.line_description || null;

        if (!entryDate || !accountCode) {
          continue; // Skip rows without required fields
        }

        const accountId = accountCodeMap.get(accountCode);
        if (accountId === undefined) {
          return {
            success: false,
            error: `Account code "${accountCode}" not found in workbook`,
          };
        }

        const key = `${entryDate}||${description}||${reference || ''}`;
        if (!entriesMap.has(key)) {
          entriesMap.set(key, {
            entry_date: entryDate,
            description,
            reference,
            lines: [],
          });
        }

        entriesMap.get(key)!.lines.push({
          account_id: accountId,
          debit_amount: debitAmount,
          credit_amount: creditAmount,
          description: lineDescription,
        });
      }

      // Insert all entries in a transaction
      const insertEntries = db.transaction(() => {
        let count = 0;

        const insertEntry = db.prepare(
          'INSERT INTO journal_entries (workbook_id, entry_date, description, reference) VALUES (?, ?, ?, ?)'
        );

        const insertLine = db.prepare(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)'
        );

        for (const entry of Array.from(entriesMap.values())) {
          // Validate that debits equal credits for this entry
          const totalDebits = entry.lines.reduce((sum, l) => sum + l.debit_amount, 0);
          const totalCredits = entry.lines.reduce((sum, l) => sum + l.credit_amount, 0);

          if (Math.abs(totalDebits - totalCredits) > 0.001) {
            throw new Error(
              `Entry "${entry.description}" on ${entry.entry_date}: debits (${totalDebits.toFixed(2)}) do not equal credits (${totalCredits.toFixed(2)})`
            );
          }

          const result = insertEntry.run(
            workbookId,
            entry.entry_date,
            entry.description,
            entry.reference
          );

          const entryId = result.lastInsertRowid;

          for (const line of entry.lines) {
            insertLine.run(
              entryId,
              line.account_id,
              line.debit_amount,
              line.credit_amount,
              line.description
            );
          }

          count++;
        }

        return count;
      });

      const count = insertEntries();

      return { success: true, data: { count } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
