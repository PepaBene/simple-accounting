export interface TrialBalanceRow {
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

export interface BalanceSheetItem {
  code: string;
  name: string;
  balance: number;
}

export interface BalanceSheetSection {
  label: string;
  items: BalanceSheetItem[];
  subtotal: number;
}

export interface BalanceSheetReport {
  longTermAssets: BalanceSheetSection;
  currentAssets: BalanceSheetSection;
  totalAssets: number;
  equity: BalanceSheetSection;
  longTermLiabilities: BalanceSheetSection;
  currentLiabilities: BalanceSheetSection;
  totalLiabilitiesAndEquity: number;
}

export interface IncomeStatementItem {
  code: string;
  name: string;
  balance: number;
}

export interface IncomeStatementSection {
  label: string;
  items: IncomeStatementItem[];
  subtotal: number;
}

export interface IncomeStatementReport {
  operatingRevenue: IncomeStatementSection;
  operatingExpenses: IncomeStatementSection;
  operatingIncome: number;
  financialRevenue: IncomeStatementSection;
  financialExpenses: IncomeStatementSection;
  financialIncome: number;
  netIncome: number;
}

export interface CashFlowReport {
  operating: CashFlowItem[];
  investing: CashFlowItem[];
  financing: CashFlowItem[];
  totalOperating: number;
  totalInvesting: number;
  totalFinancing: number;
  netCashChange: number;
}

export interface CashFlowItem {
  description: string;
  amount: number;
}

export interface EquityStatementReport {
  accounts: EquityStatementItem[];
  totalOpeningEquity: number;
  totalClosingEquity: number;
  totalChange: number;
}

export interface EquityStatementItem {
  code: string;
  name: string;
  opening_balance: number;
  contributions: number;
  withdrawals: number;
  closing_balance: number;
}
