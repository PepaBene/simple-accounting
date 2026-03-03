import { useMemo } from 'react';
import { cs } from '@renderer/i18n/cs';
import { Account, AccountType } from '@renderer/types/accounting';

// ── Types ────────────────────────────────────────────────────────────────────

interface TAccountEntry {
  journal_entry_id: number;
  date: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
}

export interface TAccountCardProps {
  account: Account;
  entries: TAccountEntry[];
  onEntryClick?: (journalEntryId: number) => void;
  onDirectEntry?: (accountId: number, side: 'debit' | 'credit') => void;
}

// ── Account type badge styling ───────────────────────────────────────────────

const accountTypeBadge: Record<AccountType, { className: string; label: string }> = {
  asset: {
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    label: cs.accounts.types.asset,
  },
  liability: {
    className: 'bg-purple-100 text-purple-800 border-purple-200',
    label: cs.accounts.types.liability,
  },
  equity: {
    className: 'bg-green-100 text-green-800 border-green-200',
    label: cs.accounts.types.equity,
  },
  revenue: {
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    label: cs.accounts.types.revenue,
  },
  expense: {
    className: 'bg-red-100 text-red-800 border-red-200',
    label: cs.accounts.types.expense,
  },
};

// ── Account types where debit is the "normal" balance side ───────────────────
// Assets and Expenses normally have a debit balance.
// Liabilities, Equity, and Revenue normally have a credit balance.

const debitNormalTypes: Set<AccountType> = new Set(['asset', 'expense']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number): string {
  if (value === 0) return '0,00';
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateCZ(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}.`;
  } catch {
    return dateStr;
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TAccountCard({
  account,
  entries,
  onEntryClick,
  onDirectEntry,
}: TAccountCardProps) {
  const badge = accountTypeBadge[account.account_type];
  const isDebitNormal = debitNormalTypes.has(account.account_type);

  // Split entries into debit and credit sides
  const debitEntries = useMemo(
    () => entries.filter((e) => e.debit_amount > 0),
    [entries],
  );

  const creditEntries = useMemo(
    () => entries.filter((e) => e.credit_amount > 0),
    [entries],
  );

  // Totals
  const totalDebits = useMemo(
    () => entries.reduce((sum, e) => sum + e.debit_amount, 0),
    [entries],
  );

  const totalCredits = useMemo(
    () => entries.reduce((sum, e) => sum + e.credit_amount, 0),
    [entries],
  );

  // Balance
  const balance = totalDebits - totalCredits;
  const hasDebitBalance = balance > 0;
  const hasCreditBalance = balance < 0;
  const absBalance = Math.abs(balance);

  // Is the balance on the "wrong" (non-normal) side?
  const isReversedBalance =
    (isDebitNormal && hasCreditBalance) || (!isDebitNormal && hasDebitBalance);

  // Determine the maximum number of rows to align columns visually
  const maxRows = Math.max(debitEntries.length, creditEntries.length);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* ── Header: account code + name + type badge ─── the top bar of the T */}
      <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-bold text-gray-900 shrink-0">
            {account.code}
          </span>
          <span className="text-[3px] text-gray-300 select-none">{'\u2014'}</span>
          <span className="text-sm text-gray-700 truncate">
            {account.name}
          </span>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {/* ── Thick horizontal line: the top of the classic T shape ──────── */}
      <div className="h-[3px] bg-gray-800" />

      {/* ── T-shape body: two columns divided by a thick vertical line ── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left column: Ma dati (MD) -- Debits ──────────────────────── */}
        <div className="flex-1 flex flex-col border-r-[3px] border-gray-800">
          {/* Column header */}
          <div className="px-3 py-1.5 bg-blue-50/60 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {cs.ledger.debit} (MD)
              </span>
              {onDirectEntry && (
                <button
                  onClick={() => onDirectEntry(account.id, 'debit')}
                  className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
                  title={cs.ledger.enterDirectly}
                >
                  + {cs.common.add}
                </button>
              )}
            </div>
          </div>

          {/* Debit entries */}
          <div className="flex-1 min-h-0">
            {debitEntries.length === 0 && maxRows === 0 ? (
              <div className="px-3 py-4 text-center">
                <span className="text-xs text-gray-300">{cs.ledger.noTransactions}</span>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {debitEntries.map((entry, idx) => (
                  <li key={`d-${entry.journal_entry_id}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => onEntryClick?.(entry.journal_entry_id)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-blue-50/40 transition-colors group"
                    >
                      <span className="text-[11px] text-gray-400 group-hover:text-gray-600 truncate mr-2">
                        <span className="font-mono">{formatDateCZ(entry.date)}</span>
                        {' '}
                        {truncate(entry.description, 20)}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-gray-800 shrink-0">
                        {formatAmount(entry.debit_amount)}
                      </span>
                    </button>
                  </li>
                ))}
                {/* Spacer rows if credit column is longer */}
                {Array.from({ length: maxRows - debitEntries.length }).map((_, i) => (
                  <li key={`ds-${i}`} className="h-[30px]" />
                ))}
              </ul>
            )}
          </div>

          {/* Debit totals */}
          <div className="border-t-2 border-gray-400 px-3 py-1.5 bg-gray-50/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-500 uppercase">
                Obrat
              </span>
              <span className="text-xs font-bold tabular-nums text-gray-900">
                {formatAmount(totalDebits)}
              </span>
            </div>
          </div>

          {/* Debit balance (shown only if balance is on debit side) */}
          {hasDebitBalance && (
            <div
              className={`px-3 py-1 border-t border-gray-200 ${
                isReversedBalance
                  ? 'bg-amber-50'
                  : 'bg-blue-50/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-semibold uppercase ${
                    isReversedBalance ? 'text-amber-700' : 'text-blue-700'
                  }`}
                >
                  {cs.ledger.balance}
                </span>
                <span
                  className={`text-xs font-bold tabular-nums ${
                    isReversedBalance ? 'text-amber-800' : 'text-blue-800'
                  }`}
                >
                  {formatAmount(absBalance)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: Dal (D) -- Credits ─────────────────────────── */}
        <div className="flex-1 flex flex-col">
          {/* Column header */}
          <div className="px-3 py-1.5 bg-green-50/60 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {cs.ledger.credit} (D)
              </span>
              {onDirectEntry && (
                <button
                  onClick={() => onDirectEntry(account.id, 'credit')}
                  className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
                  title={cs.ledger.enterDirectly}
                >
                  + {cs.common.add}
                </button>
              )}
            </div>
          </div>

          {/* Credit entries */}
          <div className="flex-1 min-h-0">
            {creditEntries.length === 0 && maxRows === 0 ? (
              <div className="px-3 py-4 text-center">
                <span className="text-xs text-gray-300">{cs.ledger.noTransactions}</span>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {creditEntries.map((entry, idx) => (
                  <li key={`c-${entry.journal_entry_id}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => onEntryClick?.(entry.journal_entry_id)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-green-50/40 transition-colors group"
                    >
                      <span className="text-[11px] text-gray-400 group-hover:text-gray-600 truncate mr-2">
                        <span className="font-mono">{formatDateCZ(entry.date)}</span>
                        {' '}
                        {truncate(entry.description, 20)}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-gray-800 shrink-0">
                        {formatAmount(entry.credit_amount)}
                      </span>
                    </button>
                  </li>
                ))}
                {/* Spacer rows if debit column is longer */}
                {Array.from({ length: maxRows - creditEntries.length }).map((_, i) => (
                  <li key={`cs-${i}`} className="h-[30px]" />
                ))}
              </ul>
            )}
          </div>

          {/* Credit totals */}
          <div className="border-t-2 border-gray-400 px-3 py-1.5 bg-gray-50/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-500 uppercase">
                Obrat
              </span>
              <span className="text-xs font-bold tabular-nums text-gray-900">
                {formatAmount(totalCredits)}
              </span>
            </div>
          </div>

          {/* Credit balance (shown only if balance is on credit side) */}
          {hasCreditBalance && (
            <div
              className={`px-3 py-1 border-t border-gray-200 ${
                isReversedBalance
                  ? 'bg-amber-50'
                  : 'bg-green-50/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-semibold uppercase ${
                    isReversedBalance ? 'text-amber-700' : 'text-green-700'
                  }`}
                >
                  {cs.ledger.balance}
                </span>
                <span
                  className={`text-xs font-bold tabular-nums ${
                    isReversedBalance ? 'text-amber-800' : 'text-green-800'
                  }`}
                >
                  {formatAmount(absBalance)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Zero-balance indicator (when balance is exactly 0 and there are entries) */}
      {balance === 0 && entries.length > 0 && (
        <div className="px-3 py-1 border-t border-gray-200 bg-gray-50/60 text-center">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">
            {cs.ledger.balance}: 0,00
          </span>
        </div>
      )}
    </div>
  );
}
