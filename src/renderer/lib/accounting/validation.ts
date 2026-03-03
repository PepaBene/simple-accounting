import type { Account } from '@renderer/types/accounting';
import type { AccountingStandard, ValidationResult } from './standards/types';

/**
 * Validates a journal entry against common accounting rules and the
 * given accounting standard's specific validation logic.
 *
 * Checks performed:
 * 1. At least 2 lines
 * 2. All amounts are positive (> 0 on at least one side)
 * 3. All referenced accounts exist and are active
 * 4. Entry is balanced (total debits = total credits)
 * 5. Standard-specific validation
 */
export function validateJournalEntry(
  entry: { lines: Array<{ account_id: number; debit_amount: number; credit_amount: number }> },
  accounts: Account[],
  standard: AccountingStandard
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check at least 2 lines
  if (!entry.lines || entry.lines.length < 2) {
    errors.push('Journal entry must have at least 2 lines');
  }

  if (entry.lines && entry.lines.length > 0) {
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

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

      // Check amounts are not negative
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

      totalDebits += line.debit_amount;
      totalCredits += line.credit_amount;
    }

    // Check balance (sum debits = sum credits)
    if (Math.abs(totalDebits - totalCredits) > 0.005) {
      errors.push(
        `Entry is not balanced: debits ${totalDebits.toFixed(2)} != credits ${totalCredits.toFixed(2)}`
      );
    }
  }

  // Delegate to standard-specific validation
  const standardResult = standard.validateEntry(entry, accounts);

  // Merge standard-specific errors and warnings, avoiding duplicates
  for (const error of standardResult.errors) {
    if (!errors.includes(error)) {
      errors.push(error);
    }
  }
  for (const warning of standardResult.warnings) {
    if (!warnings.includes(warning)) {
      warnings.push(warning);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
