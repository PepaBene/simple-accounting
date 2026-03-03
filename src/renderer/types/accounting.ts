export type AccountingStandardId = 'czech' | 'ifrs' | 'usgaap' | 'general';
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Workbook {
  id: number;
  name: string;
  description: string;
  standard: AccountingStandardId;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: number;
  workbook_id: number;
  code: string;
  name: string;
  account_type: AccountType;
  parent_code: string | null;
  is_active: number;
  description: string;
}

export interface JournalEntry {
  id: number;
  workbook_id: number;
  entry_date: string;
  description: string;
  reference: string;
  created_at: string;
  lines: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: number;
  journal_entry_id: number;
  account_id: number;
  debit_amount: number;
  credit_amount: number;
  description: string;
  account_code?: string;
  account_name?: string;
}

export interface AccountTemplate {
  code: string;
  name: string;
  account_type: AccountType;
  parent_code: string | null;
  description: string;
}

export interface FiscalPeriod {
  id: number;
  workbook_id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: number;
}
