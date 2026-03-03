import type { AccountType, Account } from '@renderer/types/accounting';
import type { AccountingStandard, ValidationResult, AccountClassification } from './types';

const CZECH_ACCOUNT_CLASSES: Record<string, string> = {
  '0': 'Dlouhodobý majetek',
  '1': 'Zásoby',
  '2': 'Krátkodobý finanční majetek',
  '3': 'Zúčtovací vztahy',
  '4': 'Kapitálové účty',
  '5': 'Náklady',
  '6': 'Výnosy',
  '7': 'Závěrkové účty',
};

function getAccountClassDigit(code: string): string {
  return code.charAt(0);
}

function isReceivableAccount(code: string): boolean {
  const prefix = code.substring(0, 2);
  const receivablePrefixes = ['31', '35', '37'];
  return receivablePrefixes.includes(prefix);
}

function isPayableAccount(code: string): boolean {
  const prefix = code.substring(0, 2);
  const payablePrefixes = ['32', '33', '34', '36', '38'];
  return payablePrefixes.includes(prefix);
}

export const czechStandard: AccountingStandard = {
  id: 'czech',
  name: 'České účetní standardy (ČÚS)',

  validateEntry(
    entry: { lines: Array<{ account_id: number; debit_amount: number; credit_amount: number }> },
    accounts: Account[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    // Check that entry has lines
    if (!entry.lines || entry.lines.length < 2) {
      errors.push('Účetní zápis musí mít alespoň 2 řádky');
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of entry.lines) {
      // Check account exists
      const account = accountMap.get(line.account_id);
      if (!account) {
        errors.push(`Účet s ID ${line.account_id} neexistuje`);
        continue;
      }

      // Check account is active
      if (!account.is_active) {
        warnings.push(`Účet ${account.code} - ${account.name} není aktivní`);
      }

      // Check amounts are positive
      if (line.debit_amount < 0) {
        errors.push(`Částka MD nesmí být záporná (účet ${account.code})`);
      }
      if (line.credit_amount < 0) {
        errors.push(`Částka Dal nesmí být záporná (účet ${account.code})`);
      }

      // Check that at least one side has a positive amount
      if (line.debit_amount === 0 && line.credit_amount === 0) {
        errors.push(`Řádek musí mít nenulovou částku MD nebo Dal (účet ${account.code})`);
      }

      // Warn if both sides have amounts (allowed but unusual)
      if (line.debit_amount > 0 && line.credit_amount > 0) {
        warnings.push(`Řádek má částku na obou stranách (účet ${account.code})`);
      }

      totalDebits += line.debit_amount;
      totalCredits += line.credit_amount;
    }

    // Check balance
    if (Math.abs(totalDebits - totalCredits) > 0.005) {
      errors.push(
        `Zápis není vyrovnaný: MD ${totalDebits.toFixed(2)} != Dal ${totalCredits.toFixed(2)}`
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
    const className = CZECH_ACCOUNT_CLASSES[classDigit] || 'Neznámá třída';

    let normalBalance: 'debit' | 'credit';

    switch (classDigit) {
      case '0': // Long-term assets
      case '1': // Inventories
      case '2': // Short-term financial assets
        normalBalance = 'debit';
        break;
      case '3': // Settlement accounts - depends on whether receivable or payable
        normalBalance = isReceivableAccount(code) ? 'debit' : 'credit';
        break;
      case '4': // Capital accounts
        normalBalance = 'credit';
        break;
      case '5': // Expenses
        normalBalance = 'debit';
        break;
      case '6': // Revenue
        normalBalance = 'credit';
        break;
      case '7': // Closing accounts
        normalBalance = type === 'expense' ? 'debit' : 'credit';
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
    return CZECH_ACCOUNT_CLASSES[classDigit] || 'Neznámá třída';
  },
};
