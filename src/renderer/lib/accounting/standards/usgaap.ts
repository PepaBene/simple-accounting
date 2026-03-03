import type { AccountType, Account } from '@renderer/types/accounting';
import type { AccountingStandard, ValidationResult, AccountClassification } from './types';

const USGAAP_ACCOUNT_CLASSES: Record<string, string> = {
  '1': 'Assets',
  '2': 'Liabilities',
  '3': 'Equity',
  '4': 'Revenue',
  '5': 'Cost of Goods Sold',
  '6': 'Operating Expenses',
  '7': 'Other Expenses',
};

function getAccountClassDigit(code: string): string {
  return code.charAt(0);
}

export const usgaapStandard: AccountingStandard = {
  id: 'usgaap',
  name: 'US Generally Accepted Accounting Principles (US GAAP)',

  validateEntry(
    entry: { lines: Array<{ account_id: number; debit_amount: number; credit_amount: number }> },
    accounts: Account[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    // Check that entry has lines
    if (!entry.lines || entry.lines.length < 2) {
      errors.push('Journal entry must have at least 2 lines');
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of entry.lines) {
      // Check account exists
      const account = accountMap.get(line.account_id);
      if (!account) {
        errors.push(`Account with ID ${line.account_id} does not exist`);
        continue;
      }

      // Check account is active
      if (!account.is_active) {
        warnings.push(`Account ${account.code} - ${account.name} is not active`);
      }

      // Check amounts are positive
      if (line.debit_amount < 0) {
        errors.push(`Debit amount must not be negative (account ${account.code})`);
      }
      if (line.credit_amount < 0) {
        errors.push(`Credit amount must not be negative (account ${account.code})`);
      }

      // Check that at least one side has a positive amount
      if (line.debit_amount === 0 && line.credit_amount === 0) {
        errors.push(`Line must have a non-zero debit or credit amount (account ${account.code})`);
      }

      // Warn if both sides have amounts
      if (line.debit_amount > 0 && line.credit_amount > 0) {
        warnings.push(`Line has amounts on both sides (account ${account.code})`);
      }

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
    const className = USGAAP_ACCOUNT_CLASSES[classDigit] || 'Unknown class';

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
      case '5': // Cost of Goods Sold
      case '6': // Operating Expenses
      case '7': // Other Expenses
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
    return USGAAP_ACCOUNT_CLASSES[classDigit] || 'Unknown class';
  },
};
