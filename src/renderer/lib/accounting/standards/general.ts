import type { AccountType, Account } from '@renderer/types/accounting';
import type { AccountingStandard, ValidationResult, AccountClassification } from './types';

const GENERAL_ACCOUNT_CLASSES: Record<string, string> = {
  '1': 'Assets',
  '2': 'Liabilities',
  '3': 'Equity',
  '4': 'Revenue',
  '5': 'Expenses',
};

function getAccountClassDigit(code: string): string {
  return code.charAt(0);
}

export const generalStandard: AccountingStandard = {
  id: 'general',
  name: 'General Accounting Principles',

  validateEntry(
    entry: { lines: Array<{ account_id: number; debit_amount: number; credit_amount: number }> },
    _accounts: Account[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Relaxed validation: only check balance
    if (!entry.lines || entry.lines.length === 0) {
      errors.push('Journal entry must have at least one line');
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of entry.lines) {
      totalDebits += line.debit_amount;
      totalCredits += line.credit_amount;
    }

    // Check balance
    if (Math.abs(totalDebits - totalCredits) > 0.005) {
      errors.push(
        `Entry is not balanced: debits ${totalDebits.toFixed(2)} != credits ${totalCredits.toFixed(2)}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  },

  getAccountTypes(): AccountType[] {
    return ['asset', 'liability', 'equity', 'revenue', 'expense'];
  },

  classifyAccount(code: string, type: AccountType): AccountClassification {
    const classDigit = getAccountClassDigit(code);
    const className = GENERAL_ACCOUNT_CLASSES[classDigit] || 'Other';

    let normalBalance: 'debit' | 'credit';

    switch (classDigit) {
      case '1': // Assets
        normalBalance = 'debit';
        break;
      case '2': // Liabilities
        normalBalance = 'credit';
        break;
      case '3': // Equity
        normalBalance = 'credit';
        break;
      case '4': // Revenue
        normalBalance = 'credit';
        break;
      case '5': // Expenses
        normalBalance = 'debit';
        break;
      default:
        normalBalance = this.getNormalBalance(type);
    }

    return {
      class: classDigit,
      category: className,
      normalBalance,
    };
  },

  getNormalBalance(type: AccountType): 'debit' | 'credit' {
    switch (type) {
      case 'asset':
        return 'debit';
      case 'expense':
        return 'debit';
      case 'liability':
        return 'credit';
      case 'equity':
        return 'credit';
      case 'revenue':
        return 'credit';
    }
  },

  getAccountClassName(code: string): string {
    const classDigit = getAccountClassDigit(code);
    return GENERAL_ACCOUNT_CLASSES[classDigit] || 'Other';
  },
};
