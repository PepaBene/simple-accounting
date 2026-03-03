import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { JournalEntry } from '@renderer/types/accounting';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import Button from '@renderer/components/common/Button';
import Table from '@renderer/components/common/Table';
import Modal from '@renderer/components/common/Modal';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDateTimeCZ(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
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

// ── Component ────────────────────────────────────────────────────────────────

export default function JournalEntryDetail() {
  const navigate = useNavigate();
  const { entryId } = useParams<{ entryId: string }>();
  const { activeWorkbook } = useWorkbookStore();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Load entry ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!entryId) return;
    loadEntry();
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEntry() {
    if (!entryId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.journal.getById(Number(entryId));
      if (result.success) {
        setEntry(result.data);
      } else {
        setError('Nepodařilo se načíst účetní zápis.');
      }
    } catch {
      setError('Nepodařilo se načíst účetní zápis.');
    } finally {
      setLoading(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!entry) return;
    setDeleting(true);
    try {
      const result = await window.api.journal.delete(entry.id);
      if (result.success) {
        setDeleteModalOpen(false);
        navigate('..', { relative: 'path' });
      } else {
        setError('Nepodařilo se smazat zápis.');
      }
    } catch {
      setError('Nepodařilo se smazat zápis.');
    } finally {
      setDeleting(false);
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

  if (error && !entry) {
    return (
      <div className="p-6">
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
        <Button variant="secondary" onClick={() => navigate('..', { relative: 'path' })}>
          {cs.common.back}
        </Button>
      </div>
    );
  }

  if (!entry) return null;

  // ── Computed values ────────────────────────────────────────────────────────

  const totalDebit = entry.lines.reduce((sum, l) => sum + (l.debit_amount ?? 0), 0);
  const totalCredit = entry.lines.reduce((sum, l) => sum + (l.credit_amount ?? 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
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

      {/* ── Header ──────────────────────────────────────────────────────────── */}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {entry.description || 'Účetní zápis'}
          </h1>
          {entry.reference && (
            <p className="text-sm text-gray-500">
              Číslo dokladu: <span className="font-medium text-gray-700">{entry.reference}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('..', { relative: 'path' })}>
            {cs.common.back}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate(`edit`, { relative: 'path' })}
          >
            {cs.common.edit}
          </Button>
          <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
            {cs.common.delete}
          </Button>
        </div>
      </div>

      {/* ── Metadata ────────────────────────────────────────────────────────── */}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded border border-gray-200">
        <div>
          <p className="text-xs uppercase font-semibold text-gray-500 mb-0.5">{cs.journal.date}</p>
          <p className="text-sm font-medium text-gray-900">{formatDateCZ(entry.entry_date)}</p>
        </div>
        <div>
          <p className="text-xs uppercase font-semibold text-gray-500 mb-0.5">Číslo dokladu</p>
          <p className="text-sm font-medium text-gray-900">{entry.reference || '\u2014'}</p>
        </div>
        <div>
          <p className="text-xs uppercase font-semibold text-gray-500 mb-0.5">Vytvořeno</p>
          <p className="text-sm font-medium text-gray-900">
            {entry.created_at ? formatDateTimeCZ(entry.created_at) : '\u2014'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase font-semibold text-gray-500 mb-0.5">Stav</p>
          {isBalanced ? (
            <span className="inline-flex items-center text-sm font-medium text-green-700">
              Vyrovnáno &#x2713;
            </span>
          ) : (
            <span className="inline-flex items-center text-sm font-medium text-red-700">
              Nevyrovnáno &#x2717;
            </span>
          )}
        </div>
      </div>

      {/* ── Lines table ─────────────────────────────────────────────────────── */}

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Řádky zápisu</h2>

        <Table
          headers={[
            cs.journal.account,
            cs.journal.description,
            cs.journal.debit,
            cs.journal.credit,
          ]}
        >
          {entry.lines.map((line) => (
            <tr key={line.id}>
              <td className="whitespace-nowrap">
                {line.account_code ? (
                  <span>
                    <span className="font-mono text-xs text-gray-500 mr-1.5">
                      {line.account_code}
                    </span>
                    <span className="text-gray-800">
                      {line.account_name ?? ''}
                    </span>
                  </span>
                ) : (
                  <span className="text-gray-400">Účet #{line.account_id}</span>
                )}
              </td>
              <td className="text-gray-600">{line.description || '\u2014'}</td>
              <td className="text-right tabular-nums whitespace-nowrap">
                {line.debit_amount > 0 ? `${formatAmount(line.debit_amount)} Kč` : ''}
              </td>
              <td className="text-right tabular-nums whitespace-nowrap">
                {line.credit_amount > 0 ? `${formatAmount(line.credit_amount)} Kč` : ''}
              </td>
            </tr>
          ))}

          {/* Totals row */}
          <tr className="!bg-gray-50 font-semibold border-t-2 !border-t-gray-300">
            <td colSpan={2} className="text-xs uppercase text-gray-500">
              Celkem
            </td>
            <td className="text-right tabular-nums whitespace-nowrap">
              {formatAmount(totalDebit)} Kč
            </td>
            <td className="text-right tabular-nums whitespace-nowrap">
              {formatAmount(totalCredit)} Kč
            </td>
          </tr>
        </Table>
      </div>

      {/* ── Delete confirmation modal ───────────────────────────────────────── */}

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={cs.journal.delete}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{cs.journal.confirmDelete}</p>
          <p className="text-sm font-medium text-gray-900">
            {formatDateCZ(entry.entry_date)} &ndash;{' '}
            {entry.description || entry.reference || `#${entry.id}`}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
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
