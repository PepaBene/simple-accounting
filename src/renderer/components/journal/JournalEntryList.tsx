import { Fragment, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { JournalEntry } from '@renderer/types/accounting';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import Button from '@renderer/components/common/Button';
import Table from '@renderer/components/common/Table';
import Modal from '@renderer/components/common/Modal';
import Input from '@renderer/components/common/Input';

// ---------- helpers ----------

function formatDateCZ(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateStr;
  }
}

function formatAmount(value: number): string {
  if (value === 0) return '0,00';
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function entryTotalDebit(entry: JournalEntry): number {
  return entry.lines.reduce((sum, l) => sum + (l.debit_amount ?? 0), 0);
}

function entryTotalCredit(entry: JournalEntry): number {
  return entry.lines.reduce((sum, l) => sum + (l.credit_amount ?? 0), 0);
}

// ---------- component ----------

export default function JournalEntryList() {
  const navigate = useNavigate();
  const { activeWorkbook } = useWorkbookStore();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // ---------- data loading ----------

  useEffect(() => {
    if (!activeWorkbook) return;
    loadEntries();
  }, [activeWorkbook?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEntries() {
    if (!activeWorkbook) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.journal.getByWorkbook(activeWorkbook.id);
      if (result.success) {
        setEntries(result.data);
      } else {
        setError('Nepodařilo se načíst účetní zápisy.');
      }
    } catch {
      setError('Nepodařilo se načíst účetní zápisy.');
    } finally {
      setLoading(false);
    }
  }

  // ---------- filtering & sorting ----------

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = entries;
    if (q) {
      list = list.filter(
        (e) =>
          (e.description ?? '').toLowerCase().includes(q) ||
          (e.reference ?? '').toLowerCase().includes(q),
      );
    }
    // sort newest first
    return [...list].sort(
      (a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime(),
    );
  }, [entries, searchQuery]);

  // ---------- delete ----------

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await window.api.journal.delete(deleteTarget.id);
      if (result.success) {
        setDeleteTarget(null);
        await loadEntries();
      } else {
        setError('Nepodařilo se smazat zápis.');
      }
    } catch {
      setError('Nepodařilo se smazat zápis.');
    } finally {
      setDeleting(false);
    }
  }

  // ---------- seed mock data ----------

  async function handleSeedMockData() {
    if (!activeWorkbook) return;
    setSeeding(true);
    setError(null);
    try {
      const result = await window.api.seed.mockEntries(activeWorkbook.id);
      if (result.success) {
        await loadEntries();
      } else {
        setError(result.error ?? 'Nepodařilo se vygenerovat testovací data.');
      }
    } catch {
      setError('Nepodařilo se vygenerovat testovací data.');
    } finally {
      setSeeding(false);
    }
  }

  // ---------- expand / collapse ----------

  function toggleExpand(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // ---------- loading / empty states ----------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">{cs.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{cs.journal.title}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSeedMockData}
            disabled={seeding}
          >
            {seeding ? 'Generuji...' : 'Vygenerovat testovací data'}
          </Button>
          <Button onClick={() => navigate('new')}>+ Nový účetní zápis</Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 ml-4"
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Search */}
      <div className="max-w-sm">
        <Input
          placeholder="Hledat dle popisu nebo reference..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-1">
            {searchQuery
              ? 'Nebyly nalezeny žádné výsledky.'
              : 'Zatím nemáte žádné účetní zápisy.'}
          </p>
          {!searchQuery && (
            <p className="text-xs text-gray-400 mb-4">
              Vytvořte svůj první účetní zápis a začněte účtovat.
            </p>
          )}
          {!searchQuery && (
            <Button onClick={() => navigate('new')}>+ Nový účetní zápis</Button>
          )}
        </div>
      ) : (
        /* Entry table */
        <Table
          headers={[
            cs.journal.date,
            'Číslo',
            cs.journal.description,
            'MD celkem',
            'D celkem',
            'Akce',
          ]}
        >
          {filtered.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const totalDebit = entryTotalDebit(entry);
            const totalCredit = entryTotalCredit(entry);

            return (
              <Fragment key={entry.id}>
                {/* Header row */}
                <tr
                  className="cursor-pointer select-none"
                  onClick={() => toggleExpand(entry.id)}
                >
                  <td className="whitespace-nowrap">{formatDateCZ(entry.entry_date)}</td>
                  <td className="whitespace-nowrap">{entry.reference || '\u2014'}</td>
                  <td>{entry.description || '\u2014'}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">
                    {formatAmount(totalDebit)} Kč
                  </td>
                  <td className="text-right tabular-nums whitespace-nowrap">
                    {formatAmount(totalCredit)} Kč
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${entry.id}/edit`);
                        }}
                      >
                        {cs.common.edit}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(String(entry.id));
                        }}
                      >
                        Detail
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(entry);
                        }}
                      >
                        {cs.common.delete}
                      </Button>
                    </div>
                  </td>
                </tr>

                {/* Expanded lines */}
                {isExpanded && entry.lines.length > 0 && (
                  <tr className="!bg-gray-50/80">
                    <td colSpan={6} className="!p-0">
                      <div className="px-6 py-2">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left pb-1 pr-3 font-medium">
                                {cs.journal.account}
                              </th>
                              <th className="text-left pb-1 pr-3 font-medium">
                                {cs.journal.description}
                              </th>
                              <th className="text-right pb-1 pr-3 font-medium">
                                {cs.journal.debit}
                              </th>
                              <th className="text-right pb-1 font-medium">
                                {cs.journal.credit}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.lines.map((line) => (
                              <tr key={line.id} className="border-t border-gray-200/60">
                                <td className="py-1 pr-3 text-gray-700">
                                  {line.account_code
                                    ? `${line.account_code} – ${line.account_name ?? ''}`
                                    : `Účet #${line.account_id}`}
                                </td>
                                <td className="py-1 pr-3 text-gray-500">
                                  {line.description || '\u2014'}
                                </td>
                                <td className="py-1 pr-3 text-right tabular-nums text-gray-800">
                                  {line.debit_amount > 0
                                    ? `${formatAmount(line.debit_amount)} Kč`
                                    : ''}
                                </td>
                                <td className="py-1 text-right tabular-nums text-gray-800">
                                  {line.credit_amount > 0
                                    ? `${formatAmount(line.credit_amount)} Kč`
                                    : ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </Table>
      )}

      {/* Delete confirmation */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={cs.journal.delete}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{cs.journal.confirmDelete}</p>
          {deleteTarget && (
            <p className="text-sm font-medium text-gray-900">
              {formatDateCZ(deleteTarget.entry_date)} &ndash;{' '}
              {deleteTarget.description || deleteTarget.reference || `#${deleteTarget.id}`}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              {cs.common.cancel}
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? cs.common.loading : cs.common.delete}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
