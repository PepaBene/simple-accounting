import type { AccountingStandardId, AccountType, Account } from '@renderer/types/accounting';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AccountClassification {
  class: string;
  category: string;
  normalBalance: 'debit' | 'credit';
}

export interface AccountingStandard {
  id: AccountingStandardId;
  name: string;

  validateEntry(
    entry: { lines: Array<{ account_id: number; debit_amount: number; credit_amount: number }> },
    accounts: Account[]
  ): ValidationResult;
  getAccountTypes(): AccountType[];
  classifyAccount(code: string, type: AccountType): AccountClassification;
  getNormalBalance(type: AccountType): 'debit' | 'credit';
  getAccountClassName(code: string): string;
}
