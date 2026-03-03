import { useState, useMemo } from 'react';
import { cs } from '@renderer/i18n/cs';
import { Account } from '@renderer/types/accounting';
import Button from '@renderer/components/common/Button';
import AmountInput from '@renderer/components/common/AmountInput';
import Input from '@renderer/components/common/Input';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TAccountEntryProps {
  account: Account;
  side: 'debit' | 'credit';
  accounts: Account[]; // all accounts for counter-account picker
  workbookId: number;
  onSave: () => void;
  onCancel: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TAccountEntry({
  account,
  side,
  accounts,
  workbookId,
  onSave,
  onCancel,
}: TAccountEntryProps) {
  const [selectedSide, setSelectedSide] = useState<'debit' | 'credit'>(side);
  const [amount, setAmount] = useState(0);
  const [counterAccountId, setCounterAccountId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [counterQuery, setCounterQuery] = useState('');
  const [counterDropdownOpen, setCounterDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Counter-account search ─────────────────────────────────────────────────

  const filteredCounterAccounts = useMemo(() => {
    // Exclude the current account from the counter-account list
    const available = accounts.filter((a) => a.id !== account.id && a.is_active);
    if (!counterQuery.trim()) return available;
    const q = counterQuery.toLowerCase().trim();
    return available.filter(
      (a) =>
        a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    );
  }, [accounts, account.id, counterQuery]);

  const selectedCounterAccount = useMemo(
    () => accounts.find((a) => a.id === counterAccountId) ?? null,
    [accounts, counterAccountId],
  );

  // ── Submit handler ─────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (amount <= 0) {
      setError('Castka musi byt vetsi nez 0.');
      return;
    }
    if (!counterAccountId) {
      setError('Vyberte protiucet.');
      return;
    }
    if (!date) {
      setError('Zadejte datum.');
      return;
    }

    setSaving(true);
    try {
      // Build the two-line journal entry
      // Line 1: this account on the selected side
      // Line 2: counter-account on the opposite side
      const line1 = {
        account_id: account.id,
        debit_amount: selectedSide === 'debit' ? amount : 0,
        credit_amount: selectedSide === 'credit' ? amount : 0,
        description: description.trim(),
      };

      const line2 = {
        account_id: counterAccountId,
        debit_amount: selectedSide === 'credit' ? amount : 0,
        credit_amount: selectedSide === 'debit' ? amount : 0,
        description: description.trim(),
      };

      const entryData = {
        workbook_id: workbookId,
        entry_date: date,
        description: description.trim() || `${account.code} \u2194 ${selectedCounterAccount?.code ?? ''}`,
        reference: '',
        lines: [line1, line2],
      };

      const result = await window.api.journal.create(entryData);
      if (result.success) {
        onSave();
      } else {
        setError('Nepodarilo se vytvorit zapis.');
      }
    } catch {
      setError('Nepodarilo se vytvorit zapis.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Header */}
      <div className="text-sm font-medium text-gray-700">
        {cs.ledger.enterDirectly}:{' '}
        <span className="font-bold text-gray-900">
          {account.code} &ndash; {account.name}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Side selector */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Strana</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelectedSide('debit')}
            className={`flex-1 px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
              selectedSide === 'debit'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {cs.ledger.debit} (MD)
          </button>
          <button
            type="button"
            onClick={() => setSelectedSide('credit')}
            className={`flex-1 px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
              selectedSide === 'credit'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {cs.ledger.credit} (D)
          </button>
        </div>
      </div>

      {/* Amount */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          {cs.journal.amount}
        </label>
        <AmountInput value={amount} onChange={setAmount} />
      </div>

      {/* Counter-account picker */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Protiucet
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setCounterDropdownOpen(!counterDropdownOpen);
              setCounterQuery('');
            }}
            className={`w-full flex items-center justify-between rounded border px-3 py-1.5 text-sm text-left transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 ${
              counterDropdownOpen
                ? 'border-blue-400 ring-2 ring-blue-400'
                : 'border-gray-300'
            } bg-white`}
          >
            <span
              className={
                selectedCounterAccount ? 'text-gray-900' : 'text-gray-400'
              }
            >
              {selectedCounterAccount
                ? `${selectedCounterAccount.code} \u2013 ${selectedCounterAccount.name}`
                : 'Vyberte protiucet...'}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
                counterDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {counterDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text"
                  value={counterQuery}
                  onChange={(e) => setCounterQuery(e.target.value)}
                  placeholder="Hledat ucet..."
                  autoFocus
                  className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
              </div>

              {/* Results */}
              <ul className="max-h-44 overflow-y-auto py-1">
                {filteredCounterAccounts.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-400 text-center">
                    Zadne vysledky
                  </li>
                ) : (
                  filteredCounterAccounts.map((acc) => (
                    <li
                      key={acc.id}
                      onClick={() => {
                        setCounterAccountId(acc.id);
                        setCounterDropdownOpen(false);
                        setCounterQuery('');
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                        acc.id === counterAccountId
                          ? 'bg-blue-50 text-blue-900'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-mono text-xs font-medium text-gray-500 w-12 shrink-0">
                        {acc.code}
                      </span>
                      <span className="truncate">{acc.name}</span>
                      {acc.id === counterAccountId && (
                        <svg
                          className="w-4 h-4 text-blue-600 ml-auto shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Date */}
      <Input
        label={cs.journal.date}
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />

      {/* Description */}
      <Input
        label={cs.journal.description}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Popis transakce (volitelne)"
      />

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {cs.common.cancel}
        </Button>
        <Button
          type="submit"
          disabled={saving || amount <= 0 || !counterAccountId}
        >
          {saving ? cs.common.loading : cs.common.save}
        </Button>
      </div>
    </form>
  );
}
