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

export interface BalanceSheetReport {
  assets: BalanceSheetItem[];
  liabilities: BalanceSheetItem[];
  equity: BalanceSheetItem[];
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
}

export interface BalanceSheetItem {
  code: string;
  name: string;
  amount: number;
}

export interface IncomeStatementReport {
  revenue: IncomeStatementItem[];
  expenses: IncomeStatementItem[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export interface IncomeStatementItem {
  code: string;
  name: string;
  amount: number;
}

export interface CashFlowReport {
  operating: CashFlowItem[];
  investing: CashFlowItem[];
  financing: CashFlowItem[];
  totalOperating: number;
  totalInvesting: number;
  totalFinancing: number;
  netChange: number;
}

export interface CashFlowItem {
  description: string;
  amount: number;
}

export interface EquityStatementReport {
  items: EquityStatementItem[];
  totalOpening: number;
  totalClosing: number;
}

export interface EquityStatementItem {
  code: string;
  name: string;
  openingBalance: number;
  increases: number;
  decreases: number;
  closingBalance: number;
}
