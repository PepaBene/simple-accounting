import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Account } from '@renderer/types/accounting';

interface AccountPickerProps {
  workbookId: number;
  value: number | null;
  onChange: (accountId: number) => void;
  placeholder?: string;
}

export default function AccountPicker({
  workbookId,
  value,
  onChange,
  placeholder = 'Vyberte účet...',
}: AccountPickerProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // ── Load accounts ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await window.api.accounts.getByWorkbook(workbookId);
        if (!cancelled && result.success) {
          setAccounts(result.data as Account[]);
        }
      } catch {
        // Silently fail — picker will show empty list
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [workbookId]);

  // ── Close on outside click ───────────────────────────────────────────────

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Selected account ─────────────────────────────────────────────────────

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === value) ?? null,
    [accounts, value]
  );

  // ── Filtered results ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts;
    const q = query.toLowerCase().trim();
    return accounts.filter(
      (acc) =>
        acc.code.toLowerCase().includes(q) ||
        acc.name.toLowerCase().includes(q)
    );
  }, [accounts, query]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [filtered]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-picker-item]');
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleOpen() {
    setOpen(true);
    setQuery('');
    setHighlightIndex(-1);
    // Focus the search input after opening
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleSelect(account: Account) {
    onChange(account.id);
    setOpen(false);
    setQuery('');
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev < filtered.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : filtered.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < filtered.length) {
            handleSelect(filtered[highlightIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [open, filtered, highlightIndex]
  );

  // ── Highlight matching text ──────────────────────────────────────────────

  function highlightMatch(text: string) {
    if (!query.trim()) return text;
    const q = query.trim();
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 text-inherit rounded-sm px-0">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center justify-between rounded border px-3 py-1.5 text-sm text-left transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 ${
          open ? 'border-blue-400 ring-2 ring-blue-400' : 'border-gray-300'
        } bg-white`}
      >
        <span className={selectedAccount ? 'text-gray-900' : 'text-gray-400'}>
          {selectedAccount
            ? `${selectedAccount.code} – ${selectedAccount.name}`
            : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
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

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hledat účet..."
              className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>

          {/* Results list */}
          <ul
            ref={listRef}
            className="max-h-56 overflow-y-auto py-1"
            role="listbox"
          >
            {loading ? (
              <li className="px-3 py-2 text-sm text-gray-400 text-center">
                Načítání...
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 text-center">
                Žádné výsledky
              </li>
            ) : (
              filtered.map((acc, idx) => (
                <li
                  key={acc.id}
                  data-picker-item
                  role="option"
                  aria-selected={acc.id === value}
                  onClick={() => handleSelect(acc)}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                    idx === highlightIndex
                      ? 'bg-blue-50 text-blue-900'
                      : acc.id === value
                        ? 'bg-gray-50 text-gray-900'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-mono text-xs font-medium text-gray-500 w-12 shrink-0">
                    {highlightMatch(acc.code)}
                  </span>
                  <span className="truncate">{highlightMatch(acc.name)}</span>
                  {acc.id === value && (
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
  );
}
