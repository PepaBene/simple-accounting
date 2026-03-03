import type { AccountingStandardId, AccountType } from '@renderer/types/accounting';
import type { AccountingStandard } from './standards/types';
import { czechStandard } from './standards/czech';
import { ifrsStandard } from './standards/ifrs';
import { usgaapStandard } from './standards/usgaap';
import { generalStandard } from './standards/general';

const standards: Record<AccountingStandardId, AccountingStandard> = {
  czech: czechStandard,
  ifrs: ifrsStandard,
  usgaap: usgaapStandard,
  general: generalStandard,
};

/**
 * Returns the AccountingStandard implementation for the given standard ID.
 */
export function getStandard(id: AccountingStandardId): AccountingStandard {
  const standard = standards[id];
  if (!standard) {
    throw new Error(`Unknown accounting standard: ${id}`);
  }
  return standard;
}

/**
 * Computes the balance for an account based on its type and total debits/credits.
 * Assets and expenses have normal debit balances (debits - credits).
 * Liabilities, equity, and revenue have normal credit balances (credits - debits).
 */
export function computeAccountBalance(
  accountType: AccountType,
  totalDebits: number,
  totalCredits: number
): number {
  switch (accountType) {
    case 'asset':
    case 'expense':
      return totalDebits - totalCredits;
    case 'liability':
    case 'equity':
    case 'revenue':
      return totalCredits - totalDebits;
  }
}

/**
 * Checks whether a set of journal entry lines is balanced
 * (total debits equal total credits within rounding tolerance).
 */
export function isEntryBalanced(
  lines: Array<{ debit_amount: number; credit_amount: number }>
): boolean {
  let totalDebits = 0;
  let totalCredits = 0;

  for (const line of lines) {
    totalDebits += line.debit_amount;
    totalCredits += line.credit_amount;
  }

  return Math.abs(totalDebits - totalCredits) <= 0.005;
}

/**
 * Formats a number as a Czech-locale currency string.
 * Uses space as thousands separator and comma as decimal separator.
 * Example: 1234.56 -> "1 234,56"
 */
export function formatAmountCZ(amount: number): string {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const isNegative = intPart.startsWith('-');
  const absIntPart = isNegative ? intPart.slice(1) : intPart;

  // Add space as thousands separator
  const formatted = absIntPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

  return (isNegative ? '-' : '') + formatted + ',' + decPart;
}

/**
 * Parses a Czech-formatted amount string back to a number.
 * Handles space thousands separators and comma decimal separators.
 * Example: "1 234,56" -> 1234.56
 */
export function parseAmountCZ(text: string): number {
  // Remove all whitespace (including non-breaking spaces)
  const cleaned = text
    .replace(/\s/g, '')
    .replace(/\u00A0/g, '')
    .replace(',', '.');

  const result = parseFloat(cleaned);

  if (isNaN(result)) {
    return 0;
  }

  return result;
}
