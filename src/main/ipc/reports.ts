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

interface TrialBalanceRow {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  opening_debit: number;
  opening_credit: number;
  turnover_debit: number;
  turnover_credit: number;
  closing_debit: number;
  closing_credit: number;
}

interface AccountSummary {
  account_id: number;
  code: string;
  name: string;
  balance: number;
}

interface BalanceSheetSection {
  label: string;
  items: AccountSummary[];
  subtotal: number;
}

interface BalanceSheetResult {
  longTermAssets: BalanceSheetSection;
  currentAssets: BalanceSheetSection;
  totalAssets: number;
  equity: BalanceSheetSection;
  longTermLiabilities: BalanceSheetSection;
  currentLiabilities: BalanceSheetSection;
  totalLiabilitiesAndEquity: number;
}

interface IncomeStatementSection {
  label: string;
  items: AccountSummary[];
  subtotal: number;
}

interface IncomeStatementResult {
  operatingRevenue: IncomeStatementSection;
  operatingExpenses: IncomeStatementSection;
  operatingIncome: number;
  financialRevenue: IncomeStatementSection;
  financialExpenses: IncomeStatementSection;
  financialIncome: number;
  netIncome: number;
}

interface CashFlowCategory {
  description: string;
  amount: number;
}

interface CashFlowStatementResult {
  operating: CashFlowCategory[];
  investing: CashFlowCategory[];
  financing: CashFlowCategory[];
  totalOperating: number;
  totalInvesting: number;
  totalFinancing: number;
  netCashChange: number;
}

interface EquityChange {
  account_id: number;
  code: string;
  name: string;
  opening_balance: number;
  contributions: number;
  withdrawals: number;
  net_income_effect: number;
  closing_balance: number;
}

interface EquityStatementResult {
  accounts: EquityChange[];
  totalOpeningEquity: number;
  totalClosingEquity: number;
  totalChange: number;
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

// --- Account classification helpers ---

/**
 * Determines if an asset account is long-term based on its code and the workbook standard.
 * Czech standard: class 0 = long-term assets
 * General standard: codes 150+ = long-term assets
 * IFRS/US GAAP: codes starting with 1 or lower = long-term
 */
function isLongTermAsset(code: string, standard: string): boolean {
  if (standard === 'czech') {
    return code.charAt(0) === '0';
  }
  if (standard === 'general') {
    const num = parseInt(code, 10);
    return num >= 150 && num < 200;
  }
  // IFRS / US GAAP: first digit determines
  const firstDigit = code.charAt(0);
  return firstDigit === '0' || firstDigit === '1';
}

/**
 * Determines if a liability account is long-term.
 * Czech: class 4 liabilities (45x, 46x, 47x) = long-term
 * General: codes 250+ = long-term
 */
function isLongTermLiability(code: string, standard: string): boolean {
  if (standard === 'czech') {
    const firstDigit = code.charAt(0);
    return firstDigit === '4'; // class 4 liabilities (reserves, long-term loans)
  }
  if (standard === 'general') {
    const num = parseInt(code, 10);
    return num >= 250 && num < 300;
  }
  return false;
}

/**
 * Determines if a revenue account is financial (vs operating).
 * Czech: 6x where x >= 6 (662-668 = financial revenues)
 * General: codes 420+ (interest, other financial)
 */
function isFinancialRevenue(code: string, standard: string): boolean {
  if (standard === 'czech') {
    const num = parseInt(code, 10);
    return num >= 660 && num < 700;
  }
  if (standard === 'general') {
    const num = parseInt(code, 10);
    return num >= 420 && num < 500;
  }
  return false;
}

/**
 * Determines if an expense account is financial (vs operating).
 * Czech: 56x-59x = financial expenses and tax
 * General: codes 550+ = financial expenses
 */
function isFinancialExpense(code: string, standard: string): boolean {
  if (standard === 'czech') {
    const num = parseInt(code, 10);
    return num >= 560 && num < 600;
  }
  if (standard === 'general') {
    const num = parseInt(code, 10);
    return num >= 550 && num < 600;
  }
  return false;
}

// --- Helper functions ---

function getWorkbookStandard(workbookId: number): string {
  const db = getDb();
  const row = db.prepare('SELECT standard FROM workbooks WHERE id = ?').get(workbookId) as { standard: string } | undefined;
  return row?.standard ?? 'czech';
}

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
    const openingBalance = 0;

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

function getTrialBalanceRows(workbookId: number): TrialBalanceRow[] {
  const balances = getAccountBalances(workbookId);

  return balances.map((b) => {
    // Opening balance split into MD/D sides
    // For now opening is 0, but structure supports future opening balances
    let openingDebit = 0;
    let openingCredit = 0;
    if (b.opening_balance > 0) {
      if (b.account_type === 'asset' || b.account_type === 'expense') {
        openingDebit = b.opening_balance;
      } else {
        openingCredit = b.opening_balance;
      }
    } else if (b.opening_balance < 0) {
      if (b.account_type === 'asset' || b.account_type === 'expense') {
        openingCredit = Math.abs(b.opening_balance);
      } else {
        openingDebit = Math.abs(b.opening_balance);
      }
    }

    // Turnover = raw debit/credit totals
    const turnoverDebit = b.total_debits;
    const turnoverCredit = b.total_credits;

    // Closing balance: net balance placed on the appropriate side
    const closingNet = (openingDebit - openingCredit) + (turnoverDebit - turnoverCredit);
    let closingDebit = 0;
    let closingCredit = 0;
    if (closingNet > 0) {
      closingDebit = closingNet;
    } else if (closingNet < 0) {
      closingCredit = Math.abs(closingNet);
    }

    return {
      account_id: b.account_id,
      code: b.code,
      name: b.name,
      account_type: b.account_type,
      opening_debit: openingDebit,
      opening_credit: openingCredit,
      turnover_debit: turnoverDebit,
      turnover_credit: turnoverCredit,
      closing_debit: closingDebit,
      closing_credit: closingCredit,
    };
  });
}

function formatCzechAmount(value: number): string {
  if (value === 0) return '0,00';
  const fixed = value.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const isNegative = intPart.startsWith('-');
  const absIntPart = isNegative ? intPart.slice(1) : intPart;
  const formatted = absIntPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (isNegative ? '-' : '') + formatted + ',' + decPart;
}

function generateReportData(
  workbookId: number,
  reportType: string
): { headers: string[]; rows: string[][]; sectionRows?: Array<{ type: 'header' | 'subtotal' | 'total'; label: string; values?: string[] }> } {
  const standard = getWorkbookStandard(workbookId);

  if (reportType === 'trialBalance') {
    const tbRows = getTrialBalanceRows(workbookId);
    const headers = [
      'Ucet',
      'Nazev',
      'Pocatecni stav MD',
      'Pocatecni stav D',
      'Obrat MD',
      'Obrat D',
      'Konecny stav MD',
      'Konecny stav D',
    ];
    const rows = tbRows.map((r) => [
      r.code,
      r.name,
      formatCzechAmount(r.opening_debit),
      formatCzechAmount(r.opening_credit),
      formatCzechAmount(r.turnover_debit),
      formatCzechAmount(r.turnover_credit),
      formatCzechAmount(r.closing_debit),
      formatCzechAmount(r.closing_credit),
    ]);
    return { headers, rows };
  }

  if (reportType === 'balanceSheet') {
    const balances = getAccountBalances(workbookId);
    const headers = ['Ucet', 'Nazev', 'Castka'];
    const rows: string[][] = [];

    // Long-term assets
    rows.push(['', '--- STALA AKTIVA ---', '']);
    const ltAssets = balances.filter(b => b.account_type === 'asset' && isLongTermAsset(b.code, standard));
    for (const b of ltAssets) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const ltAssetsTotal = ltAssets.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Stala aktiva celkem', formatCzechAmount(ltAssetsTotal)]);

    // Current assets
    rows.push(['', '--- OBEZNA AKTIVA ---', '']);
    const curAssets = balances.filter(b => b.account_type === 'asset' && !isLongTermAsset(b.code, standard));
    for (const b of curAssets) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const curAssetsTotal = curAssets.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Obezna aktiva celkem', formatCzechAmount(curAssetsTotal)]);

    rows.push(['', 'AKTIVA CELKEM', formatCzechAmount(ltAssetsTotal + curAssetsTotal)]);
    rows.push(['', '', '']);

    // Equity
    rows.push(['', '--- VLASTNI KAPITAL ---', '']);
    const equityAccs = balances.filter(b => b.account_type === 'equity');
    for (const b of equityAccs) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const equityTotal = equityAccs.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Vlastni kapital celkem', formatCzechAmount(equityTotal)]);

    // Long-term liabilities
    rows.push(['', '--- DLOUHODOBE ZAVAZKY ---', '']);
    const ltLiab = balances.filter(b => b.account_type === 'liability' && isLongTermLiability(b.code, standard));
    for (const b of ltLiab) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const ltLiabTotal = ltLiab.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Dlouhodobe zavazky celkem', formatCzechAmount(ltLiabTotal)]);

    // Current liabilities
    rows.push(['', '--- KRATKODOBE ZAVAZKY ---', '']);
    const curLiab = balances.filter(b => b.account_type === 'liability' && !isLongTermLiability(b.code, standard));
    for (const b of curLiab) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const curLiabTotal = curLiab.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Kratkodobe zavazky celkem', formatCzechAmount(curLiabTotal)]);

    rows.push(['', 'PASIVA CELKEM', formatCzechAmount(equityTotal + ltLiabTotal + curLiabTotal)]);

    return { headers, rows };
  }

  if (reportType === 'incomeStatement') {
    const balances = getAccountBalances(workbookId);
    const headers = ['Ucet', 'Nazev', 'Castka'];
    const rows: string[][] = [];

    const opRev = balances.filter(b => b.account_type === 'revenue' && !isFinancialRevenue(b.code, standard));
    const opExp = balances.filter(b => b.account_type === 'expense' && !isFinancialExpense(b.code, standard));
    const finRev = balances.filter(b => b.account_type === 'revenue' && isFinancialRevenue(b.code, standard));
    const finExp = balances.filter(b => b.account_type === 'expense' && isFinancialExpense(b.code, standard));

    rows.push(['', '--- PROVOZNI VYNOSY ---', '']);
    for (const b of opRev) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const opRevTotal = opRev.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Provozni vynosy celkem', formatCzechAmount(opRevTotal)]);

    rows.push(['', '--- PROVOZNI NAKLADY ---', '']);
    for (const b of opExp) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const opExpTotal = opExp.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Provozni naklady celkem', formatCzechAmount(opExpTotal)]);

    const opIncome = opRevTotal - opExpTotal;
    rows.push(['', 'PROVOZNI VYSLEDEK HOSPODARENI', formatCzechAmount(opIncome)]);
    rows.push(['', '', '']);

    rows.push(['', '--- FINANCNI VYNOSY ---', '']);
    for (const b of finRev) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const finRevTotal = finRev.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Financni vynosy celkem', formatCzechAmount(finRevTotal)]);

    rows.push(['', '--- FINANCNI NAKLADY ---', '']);
    for (const b of finExp) rows.push([b.code, b.name, formatCzechAmount(b.closing_balance)]);
    const finExpTotal = finExp.reduce((s, b) => s + b.closing_balance, 0);
    rows.push(['', 'Financni naklady celkem', formatCzechAmount(finExpTotal)]);

    const finIncome = finRevTotal - finExpTotal;
    rows.push(['', 'FINANCNI VYSLEDEK HOSPODARENI', formatCzechAmount(finIncome)]);
    rows.push(['', '', '']);

    rows.push(['', 'VYSLEDEK HOSPODARENI ZA UCETNI OBDOBI', formatCzechAmount(opIncome + finIncome)]);

    return { headers, rows };
  }

  // Default: trial balance
  const tbRows = getTrialBalanceRows(workbookId);
  const headers = [
    'Ucet',
    'Nazev',
    'Pocatecni stav MD',
    'Pocatecni stav D',
    'Obrat MD',
    'Obrat D',
    'Konecny stav MD',
    'Konecny stav D',
  ];
  const rows = tbRows.map((r) => [
    r.code,
    r.name,
    formatCzechAmount(r.opening_debit),
    formatCzechAmount(r.opening_credit),
    formatCzechAmount(r.turnover_debit),
    formatCzechAmount(r.turnover_credit),
    formatCzechAmount(r.closing_debit),
    formatCzechAmount(r.closing_credit),
  ]);
  return { headers, rows };
}

// --- Register handlers ---

export function registerReportHandlers(): void {
  // Trial Balance
  ipcMain.handle('reports:trialBalance', (_event, workbookId: number) => {
    try {
      const rows = getTrialBalanceRows(workbookId);
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Balance Sheet
  ipcMain.handle('reports:balanceSheet', (_event, workbookId: number) => {
    try {
      const balances = getAccountBalances(workbookId);
      const standard = getWorkbookStandard(workbookId);

      const longTermAssetItems: AccountSummary[] = [];
      const currentAssetItems: AccountSummary[] = [];
      const equityItems: AccountSummary[] = [];
      const longTermLiabItems: AccountSummary[] = [];
      const currentLiabItems: AccountSummary[] = [];

      for (const b of balances) {
        const summary: AccountSummary = {
          account_id: b.account_id,
          code: b.code,
          name: b.name,
          balance: b.closing_balance,
        };

        if (b.account_type === 'asset') {
          if (isLongTermAsset(b.code, standard)) {
            longTermAssetItems.push(summary);
          } else {
            currentAssetItems.push(summary);
          }
        } else if (b.account_type === 'liability') {
          if (isLongTermLiability(b.code, standard)) {
            longTermLiabItems.push(summary);
          } else {
            currentLiabItems.push(summary);
          }
        } else if (b.account_type === 'equity') {
          equityItems.push(summary);
        }
      }

      const ltAssetsTotal = longTermAssetItems.reduce((sum, a) => sum + a.balance, 0);
      const curAssetsTotal = currentAssetItems.reduce((sum, a) => sum + a.balance, 0);
      const equityTotal = equityItems.reduce((sum, a) => sum + a.balance, 0);
      const ltLiabTotal = longTermLiabItems.reduce((sum, a) => sum + a.balance, 0);
      const curLiabTotal = currentLiabItems.reduce((sum, a) => sum + a.balance, 0);

      const result: BalanceSheetResult = {
        longTermAssets: {
          label: 'Stálá aktiva',
          items: longTermAssetItems,
          subtotal: ltAssetsTotal,
        },
        currentAssets: {
          label: 'Oběžná aktiva',
          items: currentAssetItems,
          subtotal: curAssetsTotal,
        },
        totalAssets: ltAssetsTotal + curAssetsTotal,
        equity: {
          label: 'Vlastní kapitál',
          items: equityItems,
          subtotal: equityTotal,
        },
        longTermLiabilities: {
          label: 'Dlouhodobé závazky',
          items: longTermLiabItems,
          subtotal: ltLiabTotal,
        },
        currentLiabilities: {
          label: 'Krátkodobé závazky',
          items: currentLiabItems,
          subtotal: curLiabTotal,
        },
        totalLiabilitiesAndEquity: equityTotal + ltLiabTotal + curLiabTotal,
      };

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Income Statement
  ipcMain.handle('reports:incomeStatement', (_event, workbookId: number) => {
    try {
      const balances = getAccountBalances(workbookId);
      const standard = getWorkbookStandard(workbookId);

      const opRevItems: AccountSummary[] = [];
      const opExpItems: AccountSummary[] = [];
      const finRevItems: AccountSummary[] = [];
      const finExpItems: AccountSummary[] = [];

      for (const b of balances) {
        const summary: AccountSummary = {
          account_id: b.account_id,
          code: b.code,
          name: b.name,
          balance: b.closing_balance,
        };

        if (b.account_type === 'revenue') {
          if (isFinancialRevenue(b.code, standard)) {
            finRevItems.push(summary);
          } else {
            opRevItems.push(summary);
          }
        } else if (b.account_type === 'expense') {
          if (isFinancialExpense(b.code, standard)) {
            finExpItems.push(summary);
          } else {
            opExpItems.push(summary);
          }
        }
      }

      const opRevTotal = opRevItems.reduce((sum, a) => sum + a.balance, 0);
      const opExpTotal = opExpItems.reduce((sum, a) => sum + a.balance, 0);
      const finRevTotal = finRevItems.reduce((sum, a) => sum + a.balance, 0);
      const finExpTotal = finExpItems.reduce((sum, a) => sum + a.balance, 0);

      const operatingIncome = opRevTotal - opExpTotal;
      const financialIncome = finRevTotal - finExpTotal;
      const netIncome = operatingIncome + financialIncome;

      const result: IncomeStatementResult = {
        operatingRevenue: {
          label: 'Provozní výnosy',
          items: opRevItems,
          subtotal: opRevTotal,
        },
        operatingExpenses: {
          label: 'Provozní náklady',
          items: opExpItems,
          subtotal: opExpTotal,
        },
        operatingIncome,
        financialRevenue: {
          label: 'Finanční výnosy',
          items: finRevItems,
          subtotal: finRevTotal,
        },
        financialExpenses: {
          label: 'Finanční náklady',
          items: finExpItems,
          subtotal: finExpTotal,
        },
        financialIncome,
        netIncome,
      };

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Cash Flow Statement (simplified)
  ipcMain.handle('reports:cashFlowStatement', (_event, workbookId: number) => {
    try {
      const db = getDb();

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

      const operating: CashFlowCategory[] = [];
      const investing: CashFlowCategory[] = [];
      const financing: CashFlowCategory[] = [];

      const operatingMap = new Map<string, number>();
      const investingMap = new Map<string, number>();
      const financingMap = new Map<string, number>();

      for (const line of lines) {
        const desc = line.entry_description || 'Nespecifikováno';
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
      const netCashChange = totalOperating + totalInvesting + totalFinancing;

      const result: CashFlowStatementResult = {
        operating,
        investing,
        financing,
        totalOperating,
        totalInvesting,
        totalFinancing,
        netCashChange,
      };

      return { success: true, data: result };
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

      const accounts: EquityChange[] = equityAccounts.map((account) => {
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
        const contributions = totals.total_credits;
        const withdrawals = totals.total_debits;
        const netIncomeEffect = 0;
        const closingBalance = openingBalance + contributions - withdrawals;

        return {
          account_id: account.id,
          code: account.code,
          name: account.name,
          opening_balance: openingBalance,
          contributions,
          withdrawals,
          net_income_effect: netIncomeEffect,
          closing_balance: closingBalance,
        };
      });

      const totalOpeningEquity = accounts.reduce((sum, a) => sum + a.opening_balance, 0);
      const totalClosingEquity = accounts.reduce((sum, a) => sum + a.closing_balance, 0);
      const totalChange = totalClosingEquity - totalOpeningEquity;

      const result: EquityStatementResult = {
        accounts,
        totalOpeningEquity,
        totalClosingEquity,
        totalChange,
      };

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Seed demo data - creates sample journal entries using the workbook's own accounts
  ipcMain.handle('reports:seedDemoData', (_event, workbookId: number) => {
    try {
      const db = getDb();

      // Get workbook standard
      const workbook = db.prepare('SELECT standard FROM workbooks WHERE id = ?').get(workbookId) as { standard: string } | undefined;
      if (!workbook) {
        return { success: false, error: 'Účetní kniha nebyla nalezena.' };
      }

      // Get accounts for this workbook
      const accounts = db
        .prepare('SELECT * FROM accounts WHERE workbook_id = ? AND is_active = 1 ORDER BY code')
        .all(workbookId) as AccountRow[];

      if (accounts.length === 0) {
        return { success: false, error: 'Nejprve načtěte šablonu účtového rozvrhu.' };
      }

      // Build lookup by type
      const byType = (type: string) => accounts.filter(a => a.account_type === type);

      const assets = byType('asset');
      const liabilities = byType('liability');
      const equityAccs = byType('equity');
      const revenues = byType('revenue');
      const expenses = byType('expense');

      // Find specific accounts by purpose (flexible across standards)
      function findAccount(type: string, keywords: string[]): AccountRow | undefined {
        const pool = accounts.filter(a => a.account_type === type);
        for (const kw of keywords) {
          const found = pool.find(a => a.name.toLowerCase().includes(kw.toLowerCase()) || (a.description || '').toLowerCase().includes(kw.toLowerCase()));
          if (found) return found;
        }
        return pool[0]; // fallback to first of that type
      }

      const cashAccount = findAccount('asset', ['Pokladna', 'hotovost', 'cash']);
      const bankAccount = findAccount('asset', ['Bank', 'banka', 'Bankovní']);
      const receivablesAccount = findAccount('asset', ['Odběratel', 'Pohledávk', 'receivabl']);
      const inventoryAccount = findAccount('asset', ['Materiál', 'sklad', 'Zásob', 'inventory']);
      const equipmentAccount = findAccount('asset', ['Vybavení', 'Stroj', 'zařízení', 'Hmotné', 'equipment']);
      const payablesAccount = findAccount('liability', ['Dodavatel', 'Závazky z obch', 'payable']);
      const wagesPayable = findAccount('liability', ['Zaměstnanc', 'mzd', 'wage', 'Závazky vůči zam']);
      const capitalAccount = findAccount('equity', ['Základní kapitál', 'Kapitál', 'capital']);
      const salesRevenue = findAccount('revenue', ['Tržby', 'prodej', 'sale', 'služ']);
      const materialExpense = findAccount('expense', ['Spotřeba materiál', 'Náklady na prod', 'material', 'Spotřeba']);
      const wageExpense = findAccount('expense', ['Mzd', 'plat', 'wage', 'salary']);
      const rentExpense = findAccount('expense', ['Nájemné', 'Ostatní služby', 'rent', 'služby']);

      if (!cashAccount && !bankAccount) {
        return { success: false, error: 'Nelze najít účet pro peněžní prostředky. Načtěte šablonu účtového rozvrhu.' };
      }

      const cash = cashAccount || bankAccount!;
      const bank = bankAccount || cashAccount!;

      const insertEntry = db.prepare(
        'INSERT INTO journal_entries (workbook_id, entry_date, description, reference) VALUES (?, ?, ?, ?)'
      );
      const insertLine = db.prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)'
      );

      const createEntry = db.transaction(() => {
        let count = 0;
        const year = new Date().getFullYear();

        // 1. Owner capital contribution
        if (capitalAccount && bank) {
          const id = insertEntry.run(workbookId, `${year}-01-01`, 'Vklad základního kapitálu', 'VD-001').lastInsertRowid;
          insertLine.run(id, bank.id, 500000, 0, null);
          insertLine.run(id, capitalAccount.id, 0, 500000, null);
          count++;
        }

        // 2. Purchase of equipment
        if (equipmentAccount && bank) {
          const id = insertEntry.run(workbookId, `${year}-01-05`, 'Nákup vybavení kanceláře', 'FP-001').lastInsertRowid;
          insertLine.run(id, equipmentAccount.id, 85000, 0, null);
          insertLine.run(id, bank.id, 0, 85000, null);
          count++;
        }

        // 3. Purchase of materials
        if (inventoryAccount && payablesAccount) {
          const id = insertEntry.run(workbookId, `${year}-01-10`, 'Nákup materiálu na fakturu', 'FP-002').lastInsertRowid;
          insertLine.run(id, inventoryAccount.id, 45000, 0, null);
          insertLine.run(id, payablesAccount.id, 0, 45000, null);
          count++;
        }

        // 4. Sales revenue - cash
        if (salesRevenue && cash) {
          const id = insertEntry.run(workbookId, `${year}-01-15`, 'Tržby za prodej zboží v hotovosti', 'PP-001').lastInsertRowid;
          insertLine.run(id, cash.id, 32000, 0, null);
          insertLine.run(id, salesRevenue.id, 0, 32000, null);
          count++;
        }

        // 5. Sales revenue - invoice
        if (salesRevenue && receivablesAccount) {
          const id = insertEntry.run(workbookId, `${year}-01-20`, 'Faktura za poskytnuté služby', 'FV-001').lastInsertRowid;
          insertLine.run(id, receivablesAccount.id, 120000, 0, null);
          insertLine.run(id, salesRevenue.id, 0, 120000, null);
          count++;
        }

        // 6. Material consumption
        if (materialExpense && inventoryAccount) {
          const id = insertEntry.run(workbookId, `${year}-01-25`, 'Spotřeba materiálu ve výrobě', 'INT-001').lastInsertRowid;
          insertLine.run(id, materialExpense.id, 28000, 0, null);
          insertLine.run(id, inventoryAccount.id, 0, 28000, null);
          count++;
        }

        // 7. Rent payment
        if (rentExpense && bank) {
          const id = insertEntry.run(workbookId, `${year}-02-01`, 'Platba nájemného za únor', 'BD-001').lastInsertRowid;
          insertLine.run(id, rentExpense.id, 25000, 0, null);
          insertLine.run(id, bank.id, 0, 25000, null);
          count++;
        }

        // 8. Wage expense
        if (wageExpense && wagesPayable) {
          const id = insertEntry.run(workbookId, `${year}-02-05`, 'Mzdové náklady za leden', 'INT-002').lastInsertRowid;
          insertLine.run(id, wageExpense.id, 65000, 0, null);
          insertLine.run(id, wagesPayable.id, 0, 65000, null);
          count++;
        }

        // 9. Payment of wages
        if (wagesPayable && bank) {
          const id = insertEntry.run(workbookId, `${year}-02-10`, 'Výplata mezd za leden', 'BD-002').lastInsertRowid;
          insertLine.run(id, wagesPayable.id, 65000, 0, null);
          insertLine.run(id, bank.id, 0, 65000, null);
          count++;
        }

        // 10. Customer payment received
        if (receivablesAccount && bank) {
          const id = insertEntry.run(workbookId, `${year}-02-15`, 'Úhrada faktury od odběratele', 'BP-001').lastInsertRowid;
          insertLine.run(id, bank.id, 120000, 0, null);
          insertLine.run(id, receivablesAccount.id, 0, 120000, null);
          count++;
        }

        // 11. Payment to supplier
        if (payablesAccount && bank) {
          const id = insertEntry.run(workbookId, `${year}-02-20`, 'Úhrada faktury dodavateli', 'BD-003').lastInsertRowid;
          insertLine.run(id, payablesAccount.id, 45000, 0, null);
          insertLine.run(id, bank.id, 0, 45000, null);
          count++;
        }

        // 12. Cash deposit to bank
        if (cash && bank && cash.id !== bank.id) {
          const id = insertEntry.run(workbookId, `${year}-02-25`, 'Odvod hotovosti na bankovní účet', 'INT-003').lastInsertRowid;
          insertLine.run(id, bank.id, 30000, 0, null);
          insertLine.run(id, cash.id, 0, 30000, null);
          count++;
        }

        return count;
      });

      const count = createEntry();
      return { success: true, data: { count } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Export CSV
  ipcMain.handle(
    'reports:exportCsv',
    async (_event, workbookId: number, reportType: string) => {
      try {
        const titleMap: Record<string, string> = {
          trialBalance: 'obratova-predvaha',
          balanceSheet: 'rozvaha',
          incomeStatement: 'vykaz-zisku-a-ztraty',
          cashFlowStatement: 'prehled-o-peneznich-tocich',
          equityStatement: 'prehled-o-zmenach-vk',
        };

        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Exportovat výkaz do CSV',
          defaultPath: `${titleMap[reportType] || reportType}.csv`,
          filters: [{ name: 'CSV soubory', extensions: ['csv'] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: 'Export zrušen' };
        }

        const { headers, rows } = generateReportData(workbookId, reportType);

        // Add BOM for proper Czech character encoding in Excel
        const csvData = '\uFEFF' + Papa.unparse({
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
        const titleMap: Record<string, string> = {
          trialBalance: 'obratova-predvaha',
          balanceSheet: 'rozvaha',
          incomeStatement: 'vykaz-zisku-a-ztraty',
          cashFlowStatement: 'prehled-o-peneznich-tocich',
          equityStatement: 'prehled-o-zmenach-vk',
        };

        const titleLabels: Record<string, string> = {
          trialBalance: 'Obratova predvaha',
          balanceSheet: 'Rozvaha',
          incomeStatement: 'Vykaz zisku a ztraty',
          cashFlowStatement: 'Prehled o peneznich tocich',
          equityStatement: 'Prehled o zmenach vlastniho kapitalu',
        };

        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Exportovat výkaz do PDF',
          defaultPath: `${titleMap[reportType] || reportType}.pdf`,
          filters: [{ name: 'PDF soubory', extensions: ['pdf'] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: 'Export zrušen' };
        }

        const { headers, rows } = generateReportData(workbookId, reportType);

        const doc = new jsPDF({ orientation: 'landscape' });

        // Title
        const title = titleLabels[reportType] || 'Vykaz';
        doc.setFontSize(16);
        doc.text(title, 14, 20);
        doc.setFontSize(10);
        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
        doc.text(`Ke dni: ${dateStr}`, 14, 28);

        // Table
        const startY = 35;
        const lineHeight = 8;
        const pageWidth = doc.internal.pageSize.getWidth();
        const colWidth = (pageWidth - 28) / headers.length;

        // Header row
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        headers.forEach((header, i) => {
          doc.text(header, 14 + i * colWidth, startY);
        });

        doc.setLineWidth(0.5);
        doc.line(14, startY + 2, pageWidth - 14, startY + 2);

        // Data rows
        doc.setFont('helvetica', 'normal');
        let currentY = startY + lineHeight;

        for (const row of rows) {
          if (currentY > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            currentY = 20;

            doc.setFont('helvetica', 'bold');
            headers.forEach((header, i) => {
              doc.text(header, 14 + i * colWidth, currentY);
            });
            doc.line(14, currentY + 2, pageWidth - 14, currentY + 2);
            doc.setFont('helvetica', 'normal');
            currentY += lineHeight;
          }

          // Bold section headers and totals
          const isSection = row[0] === '' && row[1].startsWith('---');
          const isTotal = row[0] === '' && (row[1].includes('celkem') || row[1].includes('CELKEM') || row[1].includes('VYSLEDEK') || row[1].includes('AKTIVA') || row[1].includes('PASIVA'));

          if (isSection) {
            doc.setFont('helvetica', 'bold');
            doc.text(row[1].replace(/---/g, '').trim(), 14, currentY);
            doc.setFont('helvetica', 'normal');
          } else if (isTotal) {
            doc.setFont('helvetica', 'bold');
            row.forEach((cell, i) => {
              doc.text(String(cell), 14 + i * colWidth, currentY);
            });
            doc.setFont('helvetica', 'normal');
          } else {
            row.forEach((cell, i) => {
              doc.text(String(cell), 14 + i * colWidth, currentY);
            });
          }
          currentY += lineHeight;
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
        title: 'Importovat účetní zápisy z CSV',
        filters: [{ name: 'CSV soubory', extensions: ['csv'] }],
        properties: ['openFile'],
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: 'Import zrušen' };
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
          .map((e) => `Řádek ${e.row}: ${e.message}`)
          .join('; ');
        return { success: false, error: `Chyby při zpracování CSV: ${errorMessages}` };
      }

      const db = getDb();

      const accounts = db
        .prepare('SELECT id, code FROM accounts WHERE workbook_id = ?')
        .all(workbookId) as Array<{ id: number; code: string }>;

      const accountCodeMap = new Map<string, number>();
      for (const account of accounts) {
        accountCodeMap.set(account.code, account.id);
      }

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
          continue;
        }

        const accountId = accountCodeMap.get(accountCode);
        if (accountId === undefined) {
          return {
            success: false,
            error: `Účet ${accountCode} nebyl nalezen v účetní knize. Zkontrolujte, zda je účtový rozvrh načten.`,
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

      const insertEntries = db.transaction(() => {
        let count = 0;

        const insertEntry = db.prepare(
          'INSERT INTO journal_entries (workbook_id, entry_date, description, reference) VALUES (?, ?, ?, ?)'
        );

        const insertLine = db.prepare(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)'
        );

        for (const entry of Array.from(entriesMap.values())) {
          const totalDebits = entry.lines.reduce((sum, l) => sum + l.debit_amount, 0);
          const totalCredits = entry.lines.reduce((sum, l) => sum + l.credit_amount, 0);

          if (Math.abs(totalDebits - totalCredits) > 0.001) {
            throw new Error(
              `Zápis "${entry.description}" (${entry.entry_date}): MD (${totalDebits.toFixed(2)}) se nerovná D (${totalCredits.toFixed(2)})`
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
