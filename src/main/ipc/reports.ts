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

// --- Czech account classification for Rozvaha (per Vyhlaska 500/2002 Sb.) ---

interface RozvahaGroup {
  mark: string;
  label: string;
  accounts: AccountBalance[];
  total: number;
}

function classifyCzechAsset(code: string): string {
  const num = parseInt(code, 10);
  // B.I. Dlouhodoby nehmotny majetek (01x, 07x contra)
  if ((num >= 10 && num < 20) || (num >= 70 && num < 80)) return 'B.I.';
  // B.I.5. Nedokonceny DNM, zalohy (041, 051)
  if (num === 41 || num === 51) return 'B.I.';
  // B.II. Dlouhodoby hmotny majetek (02x, 03x, 08x contra)
  if ((num >= 20 && num < 40) || (num >= 80 && num < 100)) return 'B.II.';
  // B.II.5. Nedokonceny DHM, zalohy (042, 052)
  if (num === 42 || num === 52) return 'B.II.';
  // B.III. Dlouhodoby financni majetek (06x)
  if (num >= 60 && num < 70) return 'B.III.';
  // C.I. Zasoby (1xx)
  if (num >= 100 && num < 200) return 'C.I.';
  // C.IV. Penezni prostredky (211 Pokladna, 213 Ceniny, 221 Bank, 261 Penize na ceste)
  if (num === 211 || num === 213 || num === 221 || num === 261) return 'C.IV.';
  // C.III. Kratkodoby financni majetek (251, 253)
  if (num >= 250 && num < 260) return 'C.III.';
  // D. Casove rozliseni aktiv (381, 385, 388)
  if (num === 381 || num === 385 || num === 388) return 'D.';
  // C.II. Pohledavky (31x, 335, 351, 355, 391)
  return 'C.II.';
}

function classifyCzechLiability(code: string): string {
  const num = parseInt(code, 10);
  // B. Rezervy (45x)
  if (num >= 451 && num < 460) return 'B.';
  // C.I. Dlouhodobe zavazky (461, 471, 479)
  if (num >= 461 && num < 480) return 'C.I.';
  // D. Casove rozliseni pasiv (383, 384, 389)
  if (num === 383 || num === 384 || num === 389) return 'D.';
  // C.II. Kratkodobe zavazky (everything else: 23x, 24x, 32x, 33x, 34x, 36x)
  return 'C.II.';
}

function classifyCzechEquity(code: string): string {
  const num = parseInt(code, 10);
  // A.I. Zakladni kapital (411)
  if (num === 411) return 'A.I.';
  // A.II. Azio a kapitalove fondy (412, 413, 414)
  if (num >= 412 && num <= 414) return 'A.II.';
  // A.III. Fondy ze zisku (421, 423, 427)
  if (num >= 421 && num <= 427) return 'A.III.';
  // A.IV. VH minulych let (428, 429)
  if (num >= 428 && num <= 429) return 'A.IV.';
  // A.V. VH bezneho ucetniho obdobi (431)
  if (num === 431) return 'A.V.';
  // Class 7 closing accounts - skip or group into A.V.
  if (num >= 700) return 'A.V.';
  return 'A.I.';
}

// --- Czech VZZ classification (per Vyhlaska 500/2002 Sb., druhove cleneni) ---

function classifyCzechRevenue(code: string): string {
  const num = parseInt(code, 10);
  // I. Trzby z prodeje vyrobku a sluzeb (601, 602)
  if (num === 601 || num === 602) return 'I.';
  // II. Trzby za prodej zbozi (604)
  if (num === 604) return 'II.';
  // B. Zmena stavu zasob vlastni cinnosti (611-613)
  if (num >= 611 && num <= 613) return 'B.';
  // C. Aktivace (621-624)
  if (num >= 621 && num <= 624) return 'C.';
  // III. Ostatni provozni vynosy (641-648)
  if (num >= 641 && num <= 648) return 'III.';
  // VI. Vynosove uroky (662)
  if (num === 662) return 'VI.';
  // VII. Ostatni financni vynosy (663, 664, 668)
  if (num >= 663 && num <= 668) return 'VII.';
  return 'III.'; // default: other operating
}

function classifyCzechExpense(code: string): string {
  const num = parseInt(code, 10);
  // A.1. Naklady vynalozene na prodane zbozi (504)
  if (num === 504) return 'A.1.';
  // A.2. Spotreba materialu a energie (501-503)
  if (num >= 501 && num <= 503) return 'A.2.';
  // A.3. Sluzby (511-518)
  if (num >= 511 && num <= 518) return 'A.3.';
  // D. Osobni naklady (521-528)
  if (num >= 521 && num <= 528) return 'D.';
  // E. Upravy hodnot v provozni oblasti (551, 557, 558)
  if (num === 551 || num === 557 || num === 558) return 'E.';
  // F.3. Dane a poplatky (531-538)
  if (num >= 531 && num <= 538) return 'F.3.';
  // F.4. Rezervy (552)
  if (num === 552) return 'F.4.';
  // F.5. Jine provozni naklady (541-549)
  if (num >= 541 && num <= 549) return 'F.5.';
  // J. Nakladove uroky (562)
  if (num === 562) return 'J.';
  // K. Ostatni financni naklady (563-569)
  if (num >= 563 && num <= 569) return 'K.';
  // L. Dan z prijmu (591, 592)
  if (num >= 591 && num <= 592) return 'L.';
  return 'F.5.'; // default: other operating expense
}

// --- generateReportData ---

function generateReportData(
  workbookId: number,
  reportType: string
): { headers: string[]; rows: string[][] } {
  const standard = getWorkbookStandard(workbookId);
  const f = formatCzechAmount;

  // Helper: group accounts by classifier
  function groupBy(items: AccountBalance[], classifier: (code: string) => string): Map<string, AccountBalance[]> {
    const map = new Map<string, AccountBalance[]>();
    for (const item of items) {
      const key = classifier(item.code);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }

  function sumBalances(items: AccountBalance[]): number {
    return items.reduce((s, b) => s + b.closing_balance, 0);
  }

  function addSection(rows: string[][], mark: string, label: string, items: AccountBalance[], total: number): void {
    rows.push([mark, label, f(total)]);
    for (const b of items) {
      rows.push([b.code, '  ' + b.name, f(b.closing_balance)]);
    }
  }

  // ── Obratová předvaha ─────────────────────────────────────────────
  if (reportType === 'trialBalance') {
    const tbRows = getTrialBalanceRows(workbookId);
    const headers = [
      'Cislo uctu', 'Nazev uctu',
      'Pocatecni stav MD', 'Pocatecni stav D',
      'Obrat MD', 'Obrat D',
      'Konecny zustatek MD', 'Konecny zustatek D',
    ];

    const rows = tbRows.map((r) => [
      r.code, r.name,
      f(r.opening_debit), f(r.opening_credit),
      f(r.turnover_debit), f(r.turnover_credit),
      f(r.closing_debit), f(r.closing_credit),
    ]);

    // Totals row
    const tot = tbRows.reduce((a, r) => ({
      od: a.od + r.opening_debit, oc: a.oc + r.opening_credit,
      td: a.td + r.turnover_debit, tc: a.tc + r.turnover_credit,
      cd: a.cd + r.closing_debit, cc: a.cc + r.closing_credit,
    }), { od: 0, oc: 0, td: 0, tc: 0, cd: 0, cc: 0 });
    rows.push(['', 'CELKEM', f(tot.od), f(tot.oc), f(tot.td), f(tot.tc), f(tot.cd), f(tot.cc)]);

    return { headers, rows };
  }

  // ── Rozvaha (per Vyhlaska 500/2002 Sb., Priloha c. 1) ─────────────
  if (reportType === 'balanceSheet') {
    const balances = getAccountBalances(workbookId);
    const headers = ['Oznaceni', 'Nazev polozky', 'Netto'];
    const rows: string[][] = [];

    const assets = balances.filter(b => b.account_type === 'asset');
    const equityAccs = balances.filter(b => b.account_type === 'equity');
    const liabilities = balances.filter(b => b.account_type === 'liability');

    if (standard === 'czech') {
      // --- AKTIVA ---
      const assetGroups = groupBy(assets, classifyCzechAsset);
      const equityGroups = groupBy(equityAccs, classifyCzechEquity);
      const liabGroups = groupBy(liabilities, classifyCzechLiability);

      // B. Stala aktiva
      const bi = assetGroups.get('B.I.') || [];
      const bii = assetGroups.get('B.II.') || [];
      const biii = assetGroups.get('B.III.') || [];
      const biTotal = sumBalances(bi);
      const biiTotal = sumBalances(bii);
      const biiiTotal = sumBalances(biii);
      const stalaAktivaTotal = biTotal + biiTotal + biiiTotal;

      // C. Obezna aktiva
      const ci = assetGroups.get('C.I.') || [];
      const cii = assetGroups.get('C.II.') || [];
      const ciii = assetGroups.get('C.III.') || [];
      const civ = assetGroups.get('C.IV.') || [];
      const ciTotal = sumBalances(ci);
      const ciiTotal = sumBalances(cii);
      const ciiiTotal = sumBalances(ciii);
      const civTotal = sumBalances(civ);
      const obeznaAktivaTotal = ciTotal + ciiTotal + ciiiTotal + civTotal;

      // D. Casove rozliseni
      const dAktiva = assetGroups.get('D.') || [];
      const dAktivaTotal = sumBalances(dAktiva);

      const totalAssets = stalaAktivaTotal + obeznaAktivaTotal + dAktivaTotal;

      rows.push(['', 'AKTIVA CELKEM', f(totalAssets)]);
      rows.push(['', '', '']);

      // B. Stala aktiva
      rows.push(['B.', 'Stala aktiva', f(stalaAktivaTotal)]);
      if (bi.length > 0) addSection(rows, 'B.I.', 'Dlouhodoby nehmotny majetek', bi, biTotal);
      if (bii.length > 0) addSection(rows, 'B.II.', 'Dlouhodoby hmotny majetek', bii, biiTotal);
      if (biii.length > 0) addSection(rows, 'B.III.', 'Dlouhodoby financni majetek', biii, biiiTotal);

      // C. Obezna aktiva
      rows.push(['C.', 'Obezna aktiva', f(obeznaAktivaTotal)]);
      if (ci.length > 0) addSection(rows, 'C.I.', 'Zasoby', ci, ciTotal);
      if (cii.length > 0) addSection(rows, 'C.II.', 'Pohledavky', cii, ciiTotal);
      if (ciii.length > 0) addSection(rows, 'C.III.', 'Kratkodoby financni majetek', ciii, ciiiTotal);
      if (civ.length > 0) addSection(rows, 'C.IV.', 'Penezni prostredky', civ, civTotal);

      // D. Casove rozliseni aktiv
      if (dAktiva.length > 0) addSection(rows, 'D.', 'Casove rozliseni aktiv', dAktiva, dAktivaTotal);

      rows.push(['', '', '']);

      // --- PASIVA ---
      // A. Vlastni kapital
      const ai = equityGroups.get('A.I.') || [];
      const aii = equityGroups.get('A.II.') || [];
      const aiii = equityGroups.get('A.III.') || [];
      const aiv = equityGroups.get('A.IV.') || [];
      const av = equityGroups.get('A.V.') || [];
      const aiTotal = sumBalances(ai);
      const aiiTotal = sumBalances(aii);
      const aiiiTotal = sumBalances(aiii);
      const aivTotal = sumBalances(aiv);
      const avTotal = sumBalances(av);
      const vlastniKapitalTotal = aiTotal + aiiTotal + aiiiTotal + aivTotal + avTotal;

      // B. Rezervy
      const bRezervy = liabGroups.get('B.') || [];
      const bReservyTotal = sumBalances(bRezervy);

      // C. Zavazky
      const ciLiab = liabGroups.get('C.I.') || [];
      const ciiLiab = liabGroups.get('C.II.') || [];
      const ciLiabTotal = sumBalances(ciLiab);
      const ciiLiabTotal = sumBalances(ciiLiab);
      const zavazkyTotal = ciLiabTotal + ciiLiabTotal;

      // D. Casove rozliseni pasiv
      const dPasiva = liabGroups.get('D.') || [];
      const dPasivaTotal = sumBalances(dPasiva);

      const totalPasiva = vlastniKapitalTotal + bReservyTotal + zavazkyTotal + dPasivaTotal;

      rows.push(['', 'PASIVA CELKEM', f(totalPasiva)]);
      rows.push(['', '', '']);

      // A. Vlastni kapital
      rows.push(['A.', 'Vlastni kapital', f(vlastniKapitalTotal)]);
      if (ai.length > 0) addSection(rows, 'A.I.', 'Zakladni kapital', ai, aiTotal);
      if (aii.length > 0) addSection(rows, 'A.II.', 'Azio a kapitalove fondy', aii, aiiTotal);
      if (aiii.length > 0) addSection(rows, 'A.III.', 'Fondy ze zisku', aiii, aiiiTotal);
      if (aiv.length > 0) addSection(rows, 'A.IV.', 'Vysledek hospodareni minulych let (+/-)', aiv, aivTotal);
      if (av.length > 0) addSection(rows, 'A.V.', 'Vysledek hospodareni bezneho ucetniho obdobi (+/-)', av, avTotal);

      // B. Rezervy
      if (bRezervy.length > 0) addSection(rows, 'B.', 'Rezervy', bRezervy, bReservyTotal);

      // C. Zavazky
      rows.push(['C.', 'Zavazky', f(zavazkyTotal)]);
      if (ciLiab.length > 0) addSection(rows, 'C.I.', 'Dlouhodobe zavazky', ciLiab, ciLiabTotal);
      if (ciiLiab.length > 0) addSection(rows, 'C.II.', 'Kratkodobe zavazky', ciiLiab, ciiLiabTotal);

      // D. Casove rozliseni pasiv
      if (dPasiva.length > 0) addSection(rows, 'D.', 'Casove rozliseni pasiv', dPasiva, dPasivaTotal);
    } else {
      // Non-Czech standards: simplified format
      const ltAssets = assets.filter(b => isLongTermAsset(b.code, standard));
      const curAssets = assets.filter(b => !isLongTermAsset(b.code, standard));
      const ltLiab = liabilities.filter(b => isLongTermLiability(b.code, standard));
      const curLiab = liabilities.filter(b => !isLongTermLiability(b.code, standard));
      const ltAssetsTotal = sumBalances(ltAssets);
      const curAssetsTotal = sumBalances(curAssets);
      const equityTotal = sumBalances(equityAccs);
      const ltLiabTotal = sumBalances(ltLiab);
      const curLiabTotal = sumBalances(curLiab);

      rows.push(['', 'AKTIVA CELKEM', f(ltAssetsTotal + curAssetsTotal)]);
      rows.push(['', '', '']);
      addSection(rows, 'A.', 'Stala aktiva', ltAssets, ltAssetsTotal);
      addSection(rows, 'B.', 'Obezna aktiva', curAssets, curAssetsTotal);
      rows.push(['', '', '']);
      rows.push(['', 'PASIVA CELKEM', f(equityTotal + ltLiabTotal + curLiabTotal)]);
      rows.push(['', '', '']);
      addSection(rows, 'A.', 'Vlastni kapital', equityAccs, equityTotal);
      rows.push(['B.', 'Cizi zdroje', f(ltLiabTotal + curLiabTotal)]);
      if (ltLiab.length > 0) addSection(rows, 'B.I.', 'Dlouhodobe zavazky', ltLiab, ltLiabTotal);
      if (curLiab.length > 0) addSection(rows, 'B.II.', 'Kratkodobe zavazky', curLiab, curLiabTotal);
    }

    return { headers, rows };
  }

  // ── Výkaz zisku a ztráty (per Vyhlaska 500/2002 Sb., druhove cleneni) ──
  if (reportType === 'incomeStatement') {
    const balances = getAccountBalances(workbookId);
    const headers = ['Oznaceni', 'Nazev polozky', 'Castka'];
    const rows: string[][] = [];

    const revenues = balances.filter(b => b.account_type === 'revenue');
    const expenses = balances.filter(b => b.account_type === 'expense');

    if (standard === 'czech') {
      const revGroups = groupBy(revenues, (code) => classifyCzechRevenue(code));
      const expGroups = groupBy(expenses, (code) => classifyCzechExpense(code));

      const getGroup = (groups: Map<string, AccountBalance[]>, key: string) => groups.get(key) || [];

      // === PROVOZNÍ ČÁST ===

      // I. Trzby z prodeje vyrobku a sluzeb
      const grpI = getGroup(revGroups, 'I.');
      const totalI = sumBalances(grpI);
      addSection(rows, 'I.', 'Trzby z prodeje vyrobku a sluzeb', grpI, totalI);

      // II. Trzby za prodej zbozi
      const grpII = getGroup(revGroups, 'II.');
      const totalII = sumBalances(grpII);
      if (grpII.length > 0) addSection(rows, 'II.', 'Trzby za prodej zbozi', grpII, totalII);

      // A. Vykonova spotreba
      const grpA1 = getGroup(expGroups, 'A.1.');
      const grpA2 = getGroup(expGroups, 'A.2.');
      const grpA3 = getGroup(expGroups, 'A.3.');
      const totalA = sumBalances(grpA1) + sumBalances(grpA2) + sumBalances(grpA3);
      rows.push(['A.', 'Vykonova spotreba', f(totalA)]);
      if (grpA1.length > 0) addSection(rows, 'A.1.', '  Naklady vynalozene na prodane zbozi', grpA1, sumBalances(grpA1));
      if (grpA2.length > 0) addSection(rows, 'A.2.', '  Spotreba materialu a energie', grpA2, sumBalances(grpA2));
      if (grpA3.length > 0) addSection(rows, 'A.3.', '  Sluzby', grpA3, sumBalances(grpA3));

      // B. Zmena stavu zasob vlastni cinnosti
      const grpB = getGroup(revGroups, 'B.');
      if (grpB.length > 0) addSection(rows, 'B.', 'Zmena stavu zasob vlastni cinnosti (+/-)', grpB, sumBalances(grpB));

      // C. Aktivace
      const grpC = getGroup(revGroups, 'C.');
      if (grpC.length > 0) addSection(rows, 'C.', 'Aktivace (-)', grpC, sumBalances(grpC));

      // D. Osobni naklady
      const grpD = getGroup(expGroups, 'D.');
      if (grpD.length > 0) addSection(rows, 'D.', 'Osobni naklady', grpD, sumBalances(grpD));

      // E. Upravy hodnot v provozni oblasti
      const grpE = getGroup(expGroups, 'E.');
      if (grpE.length > 0) addSection(rows, 'E.', 'Upravy hodnot v provozni oblasti', grpE, sumBalances(grpE));

      // III. Ostatni provozni vynosy
      const grpIII = getGroup(revGroups, 'III.');
      if (grpIII.length > 0) addSection(rows, 'III.', 'Ostatni provozni vynosy', grpIII, sumBalances(grpIII));

      // F. Ostatni provozni naklady
      const grpF3 = getGroup(expGroups, 'F.3.');
      const grpF4 = getGroup(expGroups, 'F.4.');
      const grpF5 = getGroup(expGroups, 'F.5.');
      const totalF = sumBalances(grpF3) + sumBalances(grpF4) + sumBalances(grpF5);
      if (totalF > 0) {
        rows.push(['F.', 'Ostatni provozni naklady', f(totalF)]);
        if (grpF3.length > 0) addSection(rows, 'F.3.', '  Dane a poplatky', grpF3, sumBalances(grpF3));
        if (grpF4.length > 0) addSection(rows, 'F.4.', '  Rezervy v provozni oblasti', grpF4, sumBalances(grpF4));
        if (grpF5.length > 0) addSection(rows, 'F.5.', '  Jine provozni naklady', grpF5, sumBalances(grpF5));
      }

      // * Provozni vysledek hospodareni
      const provozniVynosy = totalI + totalII + sumBalances(grpB) + sumBalances(grpC) + sumBalances(grpIII);
      const provozniNaklady = totalA + sumBalances(grpD) + sumBalances(grpE) + totalF;
      const provozniVH = provozniVynosy - provozniNaklady;
      rows.push(['*', 'Provozni vysledek hospodareni (+/-)', f(provozniVH)]);
      rows.push(['', '', '']);

      // === FINANČNÍ ČÁST ===

      // VI. Vynosove uroky
      const grpVI = getGroup(revGroups, 'VI.');
      if (grpVI.length > 0) addSection(rows, 'VI.', 'Vynosove uroky a podobne vynosy', grpVI, sumBalances(grpVI));

      // J. Nakladove uroky
      const grpJ = getGroup(expGroups, 'J.');
      if (grpJ.length > 0) addSection(rows, 'J.', 'Nakladove uroky a podobne naklady', grpJ, sumBalances(grpJ));

      // VII. Ostatni financni vynosy
      const grpVII = getGroup(revGroups, 'VII.');
      if (grpVII.length > 0) addSection(rows, 'VII.', 'Ostatni financni vynosy', grpVII, sumBalances(grpVII));

      // K. Ostatni financni naklady
      const grpK = getGroup(expGroups, 'K.');
      if (grpK.length > 0) addSection(rows, 'K.', 'Ostatni financni naklady', grpK, sumBalances(grpK));

      // * Financni vysledek hospodareni
      const financniVynosy = sumBalances(grpVI) + sumBalances(grpVII);
      const financniNaklady = sumBalances(grpJ) + sumBalances(grpK);
      const financniVH = financniVynosy - financniNaklady;
      rows.push(['*', 'Financni vysledek hospodareni (+/-)', f(financniVH)]);
      rows.push(['', '', '']);

      // ** VH pred zdanenim
      const vhPredZdanenim = provozniVH + financniVH;
      rows.push(['**', 'Vysledek hospodareni pred zdanenim (+/-)', f(vhPredZdanenim)]);

      // L. Dan z prijmu
      const grpL = getGroup(expGroups, 'L.');
      if (grpL.length > 0) addSection(rows, 'L.', 'Dan z prijmu', grpL, sumBalances(grpL));

      // *** VH po zdaneni
      const vhPoZdaneni = vhPredZdanenim - sumBalances(grpL);
      rows.push(['***', 'Vysledek hospodareni po zdaneni (+/-)', f(vhPoZdaneni)]);

      // **** VH za ucetni obdobi
      rows.push(['****', 'Vysledek hospodareni za ucetni obdobi (+/-)', f(vhPoZdaneni)]);

      // Cisty obrat
      const cistyObrat = sumBalances(revenues);
      rows.push(['', 'Cisty obrat za ucetni obdobi', f(cistyObrat)]);
    } else {
      // Non-Czech standards: simplified format
      const opRev = revenues.filter(b => !isFinancialRevenue(b.code, standard));
      const opExp = expenses.filter(b => !isFinancialExpense(b.code, standard));
      const finRev = revenues.filter(b => isFinancialRevenue(b.code, standard));
      const finExp = expenses.filter(b => isFinancialExpense(b.code, standard));

      const opRevTotal = sumBalances(opRev);
      const opExpTotal = sumBalances(opExp);
      const finRevTotal = sumBalances(finRev);
      const finExpTotal = sumBalances(finExp);
      const opIncome = opRevTotal - opExpTotal;
      const finIncome = finRevTotal - finExpTotal;

      addSection(rows, 'I.', 'Provozni vynosy', opRev, opRevTotal);
      addSection(rows, 'II.', 'Provozni naklady', opExp, opExpTotal);
      rows.push(['*', 'Provozni vysledek hospodareni', f(opIncome)]);
      rows.push(['', '', '']);
      if (finRev.length > 0) addSection(rows, 'III.', 'Financni vynosy', finRev, finRevTotal);
      if (finExp.length > 0) addSection(rows, 'IV.', 'Financni naklady', finExp, finExpTotal);
      rows.push(['*', 'Financni vysledek hospodareni', f(finIncome)]);
      rows.push(['', '', '']);
      rows.push(['***', 'Vysledek hospodareni za ucetni obdobi', f(opIncome + finIncome)]);
    }

    return { headers, rows };
  }

  // ── Přehled o peněžních tocích (per CUS 023, neprima metoda) ────────
  if (reportType === 'cashFlowStatement') {
    const db = getDb();
    const balances = getAccountBalances(workbookId);
    const headers = ['Oznaceni', 'Nazev polozky', 'Castka'];
    const rows: string[][] = [];

    // Compute net income (VH) for indirect method
    const revenues = balances.filter(b => b.account_type === 'revenue');
    const expenses = balances.filter(b => b.account_type === 'expense');
    const netIncome = sumBalances(revenues) - sumBalances(expenses);

    // Compute depreciation (accounts 551, 55x or similar)
    const depreciationAccs = expenses.filter(b => {
      const num = parseInt(b.code, 10);
      if (standard === 'czech') return num === 551 || num === 557;
      return b.name.toLowerCase().includes('odpis') || b.name.toLowerCase().includes('deprec');
    });
    const depreciation = sumBalances(depreciationAccs);

    // Compute changes in working capital from journal lines
    const lines = db
      .prepare(
        `SELECT
          jel.debit_amount,
          jel.credit_amount,
          a.account_type,
          a.code AS account_code,
          a.name AS account_name
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        JOIN accounts a ON a.id = jel.account_id
        WHERE je.workbook_id = ?`
      )
      .all(workbookId) as Array<{
        debit_amount: number;
        credit_amount: number;
        account_type: string;
        account_code: string;
        account_name: string;
      }>;

    // Working capital changes: receivables, inventory, payables
    let receivablesChange = 0;
    let inventoryChange = 0;
    let payablesChange = 0;
    let investingTotal = 0;
    let financingTotal = 0;

    for (const line of lines) {
      const num = parseInt(line.account_code, 10);
      const net = line.debit_amount - line.credit_amount;

      if (line.account_type === 'asset') {
        if (standard === 'czech') {
          // Cash/bank (21x, 22x, 261) - excluded from working capital
          if (num === 211 || num === 213 || num === 221 || num === 261) continue;
          // Long-term assets (0xx) - investing
          if (num < 100) { investingTotal += net; continue; }
          // Inventories (1xx)
          if (num >= 100 && num < 200) { inventoryChange += net; continue; }
          // Short-term receivables (31x, 33x, 35x)
          receivablesChange += net;
        } else {
          const codeLower = line.account_name.toLowerCase();
          if (codeLower.includes('pokladna') || codeLower.includes('banka') || codeLower.includes('bank') || codeLower.includes('cash')) continue;
          if (codeLower.includes('vybavení') || codeLower.includes('stroj') || codeLower.includes('hmotné') || codeLower.includes('equipment')) {
            investingTotal += net; continue;
          }
          if (codeLower.includes('materiál') || codeLower.includes('zásob') || codeLower.includes('sklad')) {
            inventoryChange += net; continue;
          }
          receivablesChange += net;
        }
      } else if (line.account_type === 'liability') {
        if (standard === 'czech') {
          // Long-term (46x, 47x) - financing
          if (num >= 461 && num < 480) { financingTotal += net; continue; }
          // Short-term payables - working capital
          payablesChange += net;
        } else {
          const codeLower = line.account_name.toLowerCase();
          if (codeLower.includes('dlouhodobé') || codeLower.includes('úvěr') || codeLower.includes('loan')) {
            financingTotal += net; continue;
          }
          payablesChange += net;
        }
      } else if (line.account_type === 'equity') {
        financingTotal += net;
      }
    }

    // P. Stav PP na zacatku
    rows.push(['P.', 'Stav peneznich prostredku na zacatku ucetniho obdobi', f(0)]);
    rows.push(['', '', '']);

    // A. Provozni cinnost (indirect method)
    rows.push(['Z.', 'Ucetni zisk nebo ztrata z bezne cinnosti pred zdanenim', f(netIncome)]);
    rows.push(['A.1.', 'Upravy o nepenezni operace', f(depreciation)]);
    if (depreciation !== 0) rows.push(['A.1.1.', '  Odpisy stalych aktiv (+)', f(depreciation)]);
    const aStarTotal = netIncome + depreciation;
    rows.push(['A.*', 'Cisty penezni tok z provozni cinnosti pred zmenami pracovniho kapitalu', f(aStarTotal)]);
    rows.push(['A.2.', 'Zmena stavu nepeneznich slozek pracovniho kapitalu', f(-receivablesChange - inventoryChange - payablesChange)]);
    if (receivablesChange !== 0) rows.push(['A.2.1.', '  Zmena stavu pohledavek z provozni cinnosti (+/-)', f(-receivablesChange)]);
    if (payablesChange !== 0) rows.push(['A.2.2.', '  Zmena stavu kratkodobych zavazku z provozni cinnosti (+/-)', f(-payablesChange)]);
    if (inventoryChange !== 0) rows.push(['A.2.3.', '  Zmena stavu zasob (+/-)', f(-inventoryChange)]);
    const aTotal = aStarTotal - receivablesChange - inventoryChange - payablesChange;
    rows.push(['A.***', 'Cisty penezni tok z provozni cinnosti', f(aTotal)]);
    rows.push(['', '', '']);

    // B. Investicni cinnost
    rows.push(['B.', 'Penezni toky z investicni cinnosti', '']);
    if (investingTotal !== 0) rows.push(['B.1.', '  Vydaje spojene s nabytim stalych aktiv (-)', f(-investingTotal)]);
    const bTotal = -investingTotal;
    rows.push(['B.***', 'Cisty penezni tok vztahujici se k investicni cinnosti', f(bTotal)]);
    rows.push(['', '', '']);

    // C. Financni cinnost
    rows.push(['C.', 'Penezni toky z financni cinnosti', '']);
    if (financingTotal !== 0) rows.push(['C.1.', '  Dopady zmen dlouhodobych zavazku a vlastniho kapitalu', f(-financingTotal)]);
    const cTotal = -financingTotal;
    rows.push(['C.***', 'Cisty penezni tok vztahujici se k financni cinnosti', f(cTotal)]);
    rows.push(['', '', '']);

    // F. Ciste zvyseni/snizeni
    const fTotal = aTotal + bTotal + cTotal;
    rows.push(['F.', 'Ciste zvyseni nebo snizeni peneznich prostredku', f(fTotal)]);
    rows.push(['R.', 'Stav peneznich prostredku na konci ucetniho obdobi', f(fTotal)]);

    return { headers, rows };
  }

  // ── Přehled o změnách vlastního kapitálu (per NUR I-32) ────────────
  if (reportType === 'equityStatement') {
    const db = getDb();

    // Get equity accounts and their balances
    const equityAccounts = db
      .prepare("SELECT * FROM accounts WHERE workbook_id = ? AND account_type = 'equity' ORDER BY code")
      .all(workbookId) as AccountRow[];

    // Build column headers: Transakce + one column per equity account + Celkem
    const accountNames: string[] = [];
    const accountIds: number[] = [];
    for (const account of equityAccounts) {
      // Skip class 7 closing accounts for column headers
      const num = parseInt(account.code, 10);
      if (num >= 700) continue;
      accountNames.push(account.name);
      accountIds.push(account.id);
    }

    const headers = ['Transakce', ...accountNames, 'Celkem'];

    // Get debits and credits per account
    const accountData = accountIds.map(accId => {
      const totals = db
        .prepare(
          `SELECT
            COALESCE(SUM(jel.debit_amount), 0) AS total_debits,
            COALESCE(SUM(jel.credit_amount), 0) AS total_credits
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.workbook_id = ? AND jel.account_id = ?`
        )
        .get(workbookId, accId) as { total_debits: number; total_credits: number };
      return totals;
    });

    const rows: string[][] = [];

    // Row 1: Pocatecni zustatek
    const openingRow = ['Pocatecni zustatek'];
    let openingTotal = 0;
    for (let i = 0; i < accountIds.length; i++) {
      openingRow.push(f(0));
    }
    openingRow.push(f(openingTotal));
    rows.push(openingRow);

    // Row 2: Zvyseni (credits to equity)
    const increaseRow = ['Zvyseni (vklady, zisk)'];
    let increaseTotal = 0;
    for (let i = 0; i < accountIds.length; i++) {
      const inc = accountData[i].total_credits;
      increaseRow.push(f(inc));
      increaseTotal += inc;
    }
    increaseRow.push(f(increaseTotal));
    rows.push(increaseRow);

    // Row 3: Snizeni (debits to equity)
    const decreaseRow = ['Snizeni (vybery, ztrata)'];
    let decreaseTotal = 0;
    for (let i = 0; i < accountIds.length; i++) {
      const dec = accountData[i].total_debits;
      decreaseRow.push(f(dec));
      decreaseTotal += dec;
    }
    decreaseRow.push(f(decreaseTotal));
    rows.push(decreaseRow);

    // Row 4: Koncovy zustatek
    const closingRow = ['Koncovy zustatek'];
    let closingTotal = 0;
    for (let i = 0; i < accountIds.length; i++) {
      const closing = accountData[i].total_credits - accountData[i].total_debits;
      closingRow.push(f(closing));
      closingTotal += closing;
    }
    closingRow.push(f(closingTotal));
    rows.push(closingRow);

    return { headers, rows };
  }

  // Fallback: trial balance
  return generateReportData(workbookId, 'trialBalance');
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
        doc.setFontSize(14);
        doc.text(title, 14, 18);
        doc.setFontSize(9);
        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
        doc.text(`Ke dni: ${dateStr}`, 14, 25);

        // Compute column widths based on content
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        const tableWidth = pageWidth - margin * 2;
        const colCount = headers.length;

        // Simple column width: first column narrow, distribute rest
        const colWidths: number[] = [];
        if (colCount <= 3) {
          // Oznaceni, Text, Castka — or Ucet, Nazev, ...
          colWidths.push(tableWidth * 0.12); // label col
          colWidths.push(tableWidth * 0.58); // text col
          colWidths.push(tableWidth * 0.30); // amount col
        } else {
          // Trial balance / equity: even distribution with first two cols wider
          const narrowWidth = tableWidth / (colCount + 1);
          colWidths.push(narrowWidth * 0.8);  // code
          colWidths.push(narrowWidth * 1.8);  // name
          for (let i = 2; i < colCount; i++) colWidths.push(narrowWidth * ((colCount - 0.6) / (colCount - 2)));
        }

        const startY = 30;
        const lineHeight = 6;
        doc.setFontSize(7);

        // Helper to draw one row
        function drawRow(y: number, cells: string[], bold: boolean): void {
          doc.setFont('helvetica', bold ? 'bold' : 'normal');
          let x = margin;
          for (let i = 0; i < cells.length; i++) {
            const w = colWidths[i] || colWidths[colWidths.length - 1];
            // Right-align numeric columns (index >= 2)
            if (i >= 2) {
              const textWidth = doc.getTextWidth(String(cells[i]));
              doc.text(String(cells[i]), x + w - textWidth - 1, y);
            } else {
              doc.text(String(cells[i]), x + 1, y);
            }
            x += w;
          }
        }

        // Header row
        drawRow(startY, headers, true);
        doc.setLineWidth(0.3);
        doc.line(margin, startY + 1.5, pageWidth - margin, startY + 1.5);

        // Data rows
        let currentY = startY + lineHeight;

        for (const row of rows) {
          if (currentY > doc.internal.pageSize.getHeight() - 15) {
            doc.addPage();
            currentY = 15;
            drawRow(currentY, headers, true);
            doc.line(margin, currentY + 1.5, pageWidth - margin, currentY + 1.5);
            currentY += lineHeight;
          }

          // Skip fully empty rows
          if (row.every(cell => cell === '')) {
            currentY += lineHeight * 0.5;
            continue;
          }

          drawRow(currentY, row, false);
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
