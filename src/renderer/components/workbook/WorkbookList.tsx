import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { Workbook, AccountingStandardId } from '@renderer/types/accounting';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import Button from '@renderer/components/common/Button';
import Input from '@renderer/components/common/Input';
import Modal from '@renderer/components/common/Modal';

const standardOptions: { value: AccountingStandardId; label: string }[] = [
  { value: 'czech', label: cs.standards.czech },
  { value: 'ifrs', label: cs.standards.ifrs },
  { value: 'usgaap', label: cs.standards.usgaap },
  { value: 'general', label: cs.standards.general },
];

const standardBadgeColors: Record<AccountingStandardId, string> = {
  czech: 'bg-blue-100 text-blue-800 border-blue-200',
  ifrs: 'bg-green-100 text-green-800 border-green-200',
  usgaap: 'bg-amber-100 text-amber-800 border-amber-200',
  general: 'bg-gray-100 text-gray-700 border-gray-200',
};

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function WorkbookList() {
  const navigate = useNavigate();
  const { workbooks, setWorkbooks } = useWorkbookStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createStandard, setCreateStandard] = useState<AccountingStandardId>('czech');
  const [loadTemplate, setLoadTemplate] = useState(true);
  const [creating, setCreating] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Workbook | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadWorkbooks();
  }, []);

  async function loadWorkbooks() {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.workbooks.getAll();
      if (result.success) {
        setWorkbooks(result.data);
      } else {
        setError(result.error ?? 'Nepodařilo se načíst účetní knihy.');
      }
    } catch (err) {
      setError('Nepodařilo se načíst účetní knihy.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setCreateName('');
    setCreateDescription('');
    setCreateStandard('czech');
    setLoadTemplate(true);
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const result = await window.api.workbooks.create({
        name: createName.trim(),
        description: createDescription.trim(),
        standard: createStandard,
      });

      if (result.success) {
        const newWorkbook = result.data as Workbook;

        if (loadTemplate) {
          await window.api.accounts.loadTemplate(newWorkbook.id, newWorkbook.standard);
        }

        setCreateOpen(false);
        await loadWorkbooks();
        navigate(`/workbook/${newWorkbook.id}/journal`);
      } else {
        setError(result.error ?? 'Nepodařilo se vytvořit účetní knihu.');
      }
    } catch {
      setError('Nepodařilo se vytvořit účetní knihu.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await window.api.workbooks.delete(deleteTarget.id);
      if (result.success) {
        setDeleteTarget(null);
        await loadWorkbooks();
      } else {
        setError(result.error ?? 'Nepodařilo se smazat účetní knihu.');
      }
    } catch {
      setError('Nepodařilo se smazat účetní knihu.');
    } finally {
      setDeleting(false);
    }
  }

  function handleCardClick(workbook: Workbook) {
    navigate(`/workbook/${workbook.id}/journal`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-500 text-sm">{cs.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{cs.workbook.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Správa pracovních sešitů a účetních knih
            </p>
          </div>
          <Button onClick={openCreateModal}>
            + Nový pracovní sešit
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
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

        {/* Empty state */}
        {workbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm mb-1">
              Zatím nemáte žádné pracovní sešity
            </p>
            <p className="text-gray-400 text-xs mb-4">
              {cs.workbook.createFirst}
            </p>
            <Button onClick={openCreateModal}>
              + {cs.workbook.create}
            </Button>
          </div>
        ) : (
          /* Workbook card grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workbooks.map((wb) => (
              <div
                key={wb.id}
                className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-150 cursor-pointer group relative"
                onClick={() => handleCardClick(wb)}
              >
                <div className="p-4">
                  {/* Top row: name + standard badge */}
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate pr-2 group-hover:text-blue-700 transition-colors">
                      {wb.name}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${standardBadgeColors[wb.standard]}`}
                    >
                      {standardOptions.find((s) => s.value === wb.standard)?.label ?? wb.standard}
                    </span>
                  </div>

                  {/* Description preview */}
                  {wb.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                      {wb.description}
                    </p>
                  )}

                  {/* Footer: date + delete */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">
                      {formatDate(wb.updated_at)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(wb);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                      title={cs.workbook.delete}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nový pracovní sešit"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="space-y-4"
        >
          <Input
            label={cs.workbook.name}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Např. Firma s.r.o. 2026"
            required
            autoFocus
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {cs.workbook.description}
            </label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Volitelný popis účetní knihy..."
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {cs.workbook.standard}
            </label>
            <select
              value={createStandard}
              onChange={(e) => setCreateStandard(e.target.value as AccountingStandardId)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm bg-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            >
              {standardOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={loadTemplate}
              onChange={(e) => setLoadTemplate(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="text-sm text-gray-700">
              {cs.accounts.loadTemplate}
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
            >
              {cs.common.cancel}
            </Button>
            <Button type="submit" disabled={creating || !createName.trim()}>
              {creating ? cs.common.loading : cs.workbook.create}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={cs.workbook.delete}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {cs.workbook.confirmDelete}
          </p>
          {deleteTarget && (
            <p className="text-sm font-medium text-gray-900">
              {deleteTarget.name}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
            >
              {cs.common.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? cs.common.loading : cs.common.delete}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
