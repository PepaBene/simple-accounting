import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { Account, AccountType, JournalEntry } from '@renderer/types/accounting';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import Button from '@renderer/components/common/Button';
import Input from '@renderer/components/common/Input';
import Modal from '@renderer/components/common/Modal';
import TAccountCard from '@renderer/components/ledger/TAccountCard';
import TAccountEntry from '@renderer/components/ledger/TAccountEntry';

// ── Account-type group definitions (Czech labels) ────────────────────────────

interface AccountTypeGroup {
  type: AccountType;
  label: string;
}

const accountTypeGroups: AccountTypeGroup[] = [
  { type: 'asset', label: 'Aktiva' },
  { type: 'liability', label: 'Pasiva' },
  { type: 'equity', label: 'Vlastni kapital' },
  { type: 'revenue', label: 'Vynosy' },
  { type: 'expense', label: 'Naklady' },
];

// ── Per-account computed ledger data ─────────────────────────────────────────

interface AccountLedgerEntry {
  journal_entry_id: number;
  date: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
}

interface AccountLedgerData {
  account: Account;
  entries: AccountLedgerEntry[];
  totalDebits: number;
  totalCredits: number;
  balance: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TAccountGrid() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeWorkbook } = useWorkbookStore();
  const workbookId = Number(id) || activeWorkbook?.id;

  // Data state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  // Direct entry modal
  const [directEntryAccount, setDirectEntryAccount] = useState<Account | null>(null);
  const [directEntrySide, setDirectEntrySide] = useState<'debit' | 'credit'>('debit');

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!workbookId) return;
    setLoading(true);
    setError(null);
    try {
      const [accountsResult, journalResult] = await Promise.all([
        window.api.accounts.getByWorkbook(workbookId),
        window.api.journal.getByWorkbook(workbookId),
      ]);

      if (accountsResult.success) {
        setAccounts(accountsResult.data as Account[]);
      } else {
        setError('Nepodarilo se nacist ucty.');
      }

      if (journalResult.success) {
        setJournalEntries(journalResult.data as JournalEntry[]);
      } else {
        setError('Nepodarilo se nacist ucetni denik.');
      }
    } catch {
      setError('Nepodarilo se nacist data.');
    } finally {
      setLoading(false);
    }
  }, [workbookId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Compute ledger data per account ────────────────────────────────────────

  const accountLedgerMap = useMemo(() => {
    const map = new Map<number, AccountLedgerEntry[]>();

    for (const entry of journalEntries) {
      for (const line of entry.lines) {
        if (line.debit_amount === 0 && line.credit_amount === 0) continue;

        const ledgerEntry: AccountLedgerEntry = {
          journal_entry_id: entry.id,
          date: entry.entry_date,
          description: line.description || entry.description,
          debit_amount: line.debit_amount,
          credit_amount: line.credit_amount,
        };

        const existing = map.get(line.account_id);
        if (existing) {
          existing.push(ledgerEntry);
        } else {
          map.set(line.account_id, [ledgerEntry]);
        }
      }
    }

    return map;
  }, [journalEntries]);

  // Set of account IDs that have transactions
  const accountsWithTransactions = useMemo(
    () => new Set(accountLedgerMap.keys()),
    [accountLedgerMap],
  );

  // ── Build the full ledger data array ───────────────────────────────────────

  const allLedgerData: AccountLedgerData[] = useMemo(() => {
    return accounts
      .filter((acc) => acc.is_active)
      .map((acc) => {
        const entries = accountLedgerMap.get(acc.id) ?? [];
        const totalDebits = entries.reduce((sum, e) => sum + e.debit_amount, 0);
        const totalCredits = entries.reduce((sum, e) => sum + e.credit_amount, 0);
        return {
          account: acc,
          entries,
          totalDebits,
          totalCredits,
          balance: totalDebits - totalCredits,
        };
      });
  }, [accounts, accountLedgerMap]);

  // ── Apply filters ──────────────────────────────────────────────────────────

  const filteredLedgerData = useMemo(() => {
    let data = allLedgerData;

    // Filter: only accounts with transactions (unless showAllAccounts is true)
    if (!showAllAccounts) {
      data = data.filter((d) => accountsWithTransactions.has(d.account.id));
    }

    // Filter: search by code or name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      data = data.filter(
        (d) =>
          d.account.code.toLowerCase().includes(q) ||
          d.account.name.toLowerCase().includes(q),
      );
    }

    return data;
  }, [allLedgerData, showAllAccounts, searchQuery, accountsWithTransactions]);

  // ── Group by account type ──────────────────────────────────────────────────

  const groupedLedgerData = useMemo(() => {
    const groups: { type: AccountType; label: string; items: AccountLedgerData[] }[] = [];

    for (const group of accountTypeGroups) {
      const items = filteredLedgerData.filter(
        (d) => d.account.account_type === group.type,
      );
      if (items.length > 0) {
        groups.push({ type: group.type, label: group.label, items });
      }
    }

    return groups;
  }, [filteredLedgerData]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleEntryClick(journalEntryId: number) {
    if (!workbookId) return;
    navigate(`/workbook/${workbookId}/journal/${journalEntryId}`);
  }

  function handleDirectEntry(accountId: number, side: 'debit' | 'credit') {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    setDirectEntryAccount(acc);
    setDirectEntrySide(side);
  }

  function handleDirectEntrySave() {
    setDirectEntryAccount(null);
    loadData(); // Refresh all data after a new entry
  }

  function handleDirectEntryCancel() {
    setDirectEntryAccount(null);
  }

  // ── Render: Loading state ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-gray-500 text-sm">{cs.common.loading}</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-gray-900">{cs.ledger.title}</h1>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 ml-4"
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Toolbar: search + filter toggle */}
      <div className="mb-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="w-full sm:max-w-sm">
          <Input
            placeholder="Hledat podle kodu nebo nazvu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAllAccounts(false)}
            className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
              !showAllAccounts
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            S transakcemi
          </button>
          <button
            type="button"
            onClick={() => setShowAllAccounts(true)}
            className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
              showAllAccounts
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Vsechny aktivni ucty
          </button>
        </div>
      </div>

      {/* Empty state */}
      {filteredLedgerData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <svg
              className="w-7 h-7 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-gray-500 text-sm mb-1">{cs.ledger.noTransactions}</p>
          <p className="text-gray-400 text-xs mb-4">
            {showAllAccounts
              ? 'Zadny aktivni ucet neodpovida filtru.'
              : 'Zatim nebyly zauctovany zadne transakce. Prejdete do ucetniho deniku nebo zobrazte vsechny ucty.'}
          </p>
          {!showAllAccounts && (
            <Button variant="secondary" onClick={() => setShowAllAccounts(true)}>
              Zobrazit vsechny ucty
            </Button>
          )}
        </div>
      ) : (
        /* Grouped T-account grid */
        <div className="space-y-8">
          {groupedLedgerData.map((group) => (
            <section key={group.type}>
              {/* Group header */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  {group.label}
                </h2>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">
                  {group.items.length}{' '}
                  {group.items.length === 1
                    ? 'ucet'
                    : group.items.length >= 2 && group.items.length <= 4
                      ? 'ucty'
                      : 'uctu'}
                </span>
              </div>

              {/* Responsive grid: 1 col on small, 2 on medium, 3 on large */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.items.map((ledgerData) => (
                  <TAccountCard
                    key={ledgerData.account.id}
                    account={ledgerData.account}
                    entries={ledgerData.entries}
                    onEntryClick={handleEntryClick}
                    onDirectEntry={handleDirectEntry}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Direct Entry Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={directEntryAccount !== null}
        onClose={handleDirectEntryCancel}
        title={cs.ledger.enterDirectly}
      >
        {directEntryAccount && workbookId && (
          <TAccountEntry
            account={directEntryAccount}
            side={directEntrySide}
            accounts={accounts}
            workbookId={workbookId}
            onSave={handleDirectEntrySave}
            onCancel={handleDirectEntryCancel}
          />
        )}
      </Modal>
    </div>
  );
}
