import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { Account, JournalEntry, JournalEntryLine } from '@renderer/types/accounting';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import Button from '@renderer/components/common/Button';
import Input from '@renderer/components/common/Input';
import AmountInput from '@renderer/components/common/AmountInput';

// ── Types ────────────────────────────────────────────────────────────────────

interface FormLine {
  key: string;
  account_id: number | null;
  debit_amount: number;
  credit_amount: number;
  description: string;
}

function createEmptyLine(): FormLine {
  return {
    key: crypto.randomUUID(),
    account_id: null,
    debit_amount: 0,
    credit_amount: 0,
    description: '',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number): string {
  if (value === 0) return '0,00';
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── AccountPicker (inline searchable select) ─────────────────────────────────

interface AccountPickerProps {
  accounts: Account[];
  value: number | null;
  onChange: (accountId: number | null) => void;
  tabIndex?: number;
}

function AccountPicker({ accounts, value, onChange, tabIndex }: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = useMemo(
    () => (value ? accounts.find((a) => a.id === value) ?? null : null),
    [accounts, value],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return accounts.filter((a) => a.is_active);
    return accounts.filter(
      (a) =>
        a.is_active &&
        (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)),
    );
  }, [accounts, search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  function handleOpen() {
    setOpen(true);
    setSearch('');
    // Focus the search input next tick
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleSelect(account: Account) {
    onChange(account.id);
    setOpen(false);
    setSearch('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setSearch('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
    }
    if (e.key === 'Enter' && filtered.length === 1) {
      e.preventDefault();
      handleSelect(filtered[0]);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        tabIndex={tabIndex}
        onClick={handleOpen}
        onFocus={handleOpen}
        className={`w-full flex items-center justify-between rounded border px-2.5 py-1.5 text-sm text-left transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 ${
          open ? 'border-blue-400 ring-2 ring-blue-400' : 'border-gray-300'
        } ${selectedAccount ? 'text-gray-900' : 'text-gray-400'}`}
      >
        <span className="truncate">
          {selectedAccount
            ? `${selectedAccount.code} \u2013 ${selectedAccount.name}`
            : 'Vyberte účet...'}
        </span>
        {selectedAccount && (
          <span
            role="button"
            onClick={handleClear}
            className="ml-1 text-gray-400 hover:text-gray-600 shrink-0"
          >
            &#x2715;
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-56 flex flex-col">
          {/* Search input */}
          <div className="p-1.5 border-b border-gray-200">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hledat účet..."
              className="w-full rounded border border-gray-200 px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                Účet nenalezen
              </div>
            ) : (
              filtered.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => handleSelect(acc)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                    acc.id === value ? 'bg-blue-50 font-medium' : ''
                  }`}
                >
                  <span className="font-mono text-xs text-gray-500 w-12 shrink-0">
                    {acc.code}
                  </span>
                  <span className="truncate text-gray-800">{acc.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function JournalEntryForm() {
  const navigate = useNavigate();
  const { entryId } = useParams<{ entryId: string }>();
  const { activeWorkbook } = useWorkbookStore();

  const isEditMode = !!entryId && entryId !== 'new';

  // ── Form state ─────────────────────────────────────────────────────────────

  const [entryDate, setEntryDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine(), createEmptyLine()]);

  // ── Data state ─────────────────────────────────────────────────────────────

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refs for tab navigation ────────────────────────────────────────────────

  const descriptionRef = useRef<HTMLInputElement>(null);

  // ── Load accounts ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeWorkbook) return;
    loadData();
  }, [activeWorkbook?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!activeWorkbook) return;
    setLoading(true);
    setError(null);
    try {
      // Load accounts
      const accResult = await window.api.accounts.getByWorkbook(activeWorkbook.id);
      if (accResult.success) {
        setAccounts(accResult.data as Account[]);
      }

      // If editing, load existing entry
      if (isEditMode) {
        const entryResult = await window.api.journal.getById(Number(entryId));
        if (entryResult.success) {
          const entry: JournalEntry = entryResult.data;
          setEntryDate(entry.entry_date);
          setDescription(entry.description ?? '');
          setReference(entry.reference ?? '');
          setLines(
            entry.lines.map((l: JournalEntryLine) => ({
              key: crypto.randomUUID(),
              account_id: l.account_id,
              debit_amount: l.debit_amount ?? 0,
              credit_amount: l.credit_amount ?? 0,
              description: l.description ?? '',
            })),
          );
        } else {
          setError('Nepodařilo se načíst účetní zápis.');
        }
      }
    } catch {
      setError('Nepodařilo se načíst data.');
    } finally {
      setLoading(false);
    }
  }

  // ── Line management ────────────────────────────────────────────────────────

  const updateLine = useCallback((key: string, field: keyof FormLine, value: unknown) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const updated = { ...line, [field]: value };

        // Enforce mutual exclusivity: debit vs. credit
        if (field === 'debit_amount' && (value as number) > 0) {
          updated.credit_amount = 0;
        } else if (field === 'credit_amount' && (value as number) > 0) {
          updated.debit_amount = 0;
        }

        return updated;
      }),
    );
  }, []);

  function addLine() {
    setLines((prev) => [...prev, createEmptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((l) => l.key !== key);
    });
  }

  // ── Computed totals ────────────────────────────────────────────────────────

  const totalDebit = useMemo(
    () => lines.reduce((sum, l) => sum + (l.debit_amount ?? 0), 0),
    [lines],
  );

  const totalCredit = useMemo(
    () => lines.reduce((sum, l) => sum + (l.credit_amount ?? 0), 0),
    [lines],
  );

  const isBalanced = useMemo(
    () => Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0,
    [totalDebit, totalCredit],
  );

  // ── Validation ─────────────────────────────────────────────────────────────

  const canSave = useMemo(() => {
    if (!entryDate) return false;
    if (!description.trim()) return false;
    if (!isBalanced) return false;
    // Every line must have an account and either debit or credit > 0
    for (const line of lines) {
      if (!line.account_id) return false;
      if (line.debit_amount <= 0 && line.credit_amount <= 0) return false;
    }
    return true;
  }, [entryDate, description, isBalanced, lines]);

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!activeWorkbook || !canSave) return;
    setSaving(true);
    setError(null);

    const payload = {
      workbook_id: activeWorkbook.id,
      entry_date: entryDate,
      description: description.trim(),
      reference: reference.trim(),
      lines: lines.map((l) => ({
        account_id: l.account_id!,
        debit_amount: l.debit_amount,
        credit_amount: l.credit_amount,
        description: l.description.trim(),
      })),
    };

    try {
      let result;
      if (isEditMode) {
        result = await window.api.journal.update(Number(entryId), payload);
      } else {
        result = await window.api.journal.create(payload);
      }

      if (result.success) {
        // Always navigate back to journal list (handles both /new and /:id/edit paths)
        const basePath = `/workbook/${activeWorkbook.id}/journal`;
        navigate(basePath, { replace: true });
      } else {
        setError('Nepodařilo se uložit účetní zápis.');
      }
    } catch {
      setError('Nepodařilo se uložit účetní zápis.');
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">{cs.common.loading}</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {isEditMode ? 'Upravit účetní zápis' : 'Nový účetní zápis'}
        </h1>
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

      {/* ── Header fields ──────────────────────────────────────────────────── */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Input
          label={cs.journal.date}
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          required
        />
        <Input
          ref={descriptionRef}
          label={cs.journal.description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Popis účetního zápisu"
          required
        />
        <Input
          label="Číslo dokladu"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Volitelné"
        />
      </div>

      {/* ── Lines table ────────────────────────────────────────────────────── */}

      <div className="mb-2">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Řádky zápisu</h2>
      </div>

      <div className="overflow-visible border border-gray-300 rounded mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 w-[280px]">
                {cs.journal.account}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200">
                {cs.journal.description}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 w-[160px]">
                {cs.journal.debit}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 w-[160px]">
                {cs.journal.credit}
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 w-[44px]">
                {/* remove column */}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr
                key={line.key}
                className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/50"
              >
                {/* Account picker */}
                <td className="px-2 py-1.5 border-r border-gray-200">
                  <AccountPicker
                    accounts={accounts}
                    value={line.account_id}
                    onChange={(accountId) => updateLine(line.key, 'account_id', accountId)}
                    tabIndex={100 + idx * 4}
                  />
                </td>

                {/* Line description */}
                <td className="px-2 py-1.5 border-r border-gray-200">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                    tabIndex={101 + idx * 4}
                    placeholder="Popis řádku"
                    className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                  />
                </td>

                {/* Debit amount */}
                <td className="px-2 py-1.5 border-r border-gray-200">
                  <AmountInput
                    value={line.debit_amount}
                    onChange={(val) => updateLine(line.key, 'debit_amount', val)}
                    disabled={line.credit_amount > 0}
                  />
                </td>

                {/* Credit amount */}
                <td className="px-2 py-1.5 border-r border-gray-200">
                  <AmountInput
                    value={line.credit_amount}
                    onChange={(val) => updateLine(line.key, 'credit_amount', val)}
                    disabled={line.debit_amount > 0}
                  />
                </td>

                {/* Remove button */}
                <td className="px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length <= 2}
                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                    title={cs.journal.removeLine}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}

            {/* Totals row */}
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-medium">
              <td className="px-3 py-2 border-r border-gray-200 text-xs uppercase text-gray-500" colSpan={2}>
                Celkem
              </td>
              <td className="px-3 py-2 text-right tabular-nums border-r border-gray-200 whitespace-nowrap">
                {formatAmount(totalDebit)} Kč
              </td>
              <td className="px-3 py-2 text-right tabular-nums border-r border-gray-200 whitespace-nowrap">
                {formatAmount(totalCredit)} Kč
              </td>
              <td className="px-1 py-2" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Add line button */}
      <div className="mb-6">
        <Button variant="secondary" size="sm" onClick={addLine}>
          + {cs.journal.addLine}
        </Button>
      </div>

      {/* ── Balance indicator & actions ─────────────────────────────────────── */}

      <div className="flex items-center justify-between border-t border-gray-200 pt-5">
        {/* Balance indicator */}
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{cs.journal.totalDebit}:</span>{' '}
            <span className="tabular-nums font-semibold">{formatAmount(totalDebit)} Kč</span>
          </div>
          <div className="text-sm text-gray-600">
            <span className="font-medium">{cs.journal.totalCredit}:</span>{' '}
            <span className="tabular-nums font-semibold">{formatAmount(totalCredit)} Kč</span>
          </div>
          <div className="px-2.5 py-0.5 rounded text-sm font-medium">
            {isBalanced ? (
              <span className="text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded">
                Vyrovnáno &#x2713;
              </span>
            ) : (
              <span className="text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded">
                Nevyrovnáno &#x2717;
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (activeWorkbook) {
                navigate(`/workbook/${activeWorkbook.id}/journal`, { replace: true });
              } else {
                navigate('..', { relative: 'path' });
              }
            }}
          >
            {cs.journal.cancel}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? cs.common.loading : cs.journal.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
