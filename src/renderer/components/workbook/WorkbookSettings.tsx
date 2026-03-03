import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { Workbook, AccountingStandardId } from '@renderer/types/accounting';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import Button from '@renderer/components/common/Button';
import Input from '@renderer/components/common/Input';
import Modal from '@renderer/components/common/Modal';

const standardLabels: Record<AccountingStandardId, string> = {
  czech: cs.standards.czech,
  ifrs: cs.standards.ifrs,
  usgaap: cs.standards.usgaap,
  general: cs.standards.general,
};

const standardBadgeColors: Record<AccountingStandardId, string> = {
  czech: 'bg-blue-100 text-blue-800 border-blue-200',
  ifrs: 'bg-green-100 text-green-800 border-green-200',
  usgaap: 'bg-amber-100 text-amber-800 border-amber-200',
  general: 'bg-gray-100 text-gray-700 border-gray-200',
};

function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function WorkbookSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeWorkbook, setActiveWorkbook } = useWorkbookStore();

  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Seed demo data
  const [seeding, setSeeding] = useState(false);

  const workbookId = Number(id);

  useEffect(() => {
    loadWorkbook();
  }, [workbookId]);

  async function loadWorkbook() {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.workbooks.getById(workbookId);
      if (result.success) {
        const wb = result.data as Workbook;
        setWorkbook(wb);
        setName(wb.name);
        setDescription(wb.description);
      } else {
        setError(result.error ?? 'Nepodařilo se načíst účetní knihu.');
      }
    } catch {
      setError('Nepodařilo se načíst účetní knihu.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.api.workbooks.update(workbookId, {
        name: name.trim(),
        description: description.trim(),
      });
      if (result.success) {
        const updated = result.data as Workbook;
        setWorkbook(updated);
        setSuccess('Nastavení bylo uloženo.');
        // Update the active workbook in the store if it matches
        if (activeWorkbook?.id === workbookId) {
          setActiveWorkbook(updated);
        }
      } else {
        setError(result.error ?? 'Nepodařilo se uložit nastavení.');
      }
    } catch {
      setError('Nepodařilo se uložit nastavení.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await window.api.workbooks.delete(workbookId);
      if (result.success) {
        if (activeWorkbook?.id === workbookId) {
          setActiveWorkbook(null);
        }
        navigate('/');
      } else {
        setError(result.error ?? 'Nepodařilo se smazat účetní knihu.');
      }
    } catch {
      setError('Nepodařilo se smazat účetní knihu.');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  async function handleSeedDemoData() {
    setSeeding(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.api.reports.seedDemoData(workbookId);
      if (result.success) {
        setSuccess(`Ukázková data byla úspěšně vytvořena (${result.data.count} zápisů).`);
      } else {
        setError(result.error ?? 'Nepodařilo se vytvořit ukázková data.');
      }
    } catch {
      setError('Nepodařilo se vytvořit ukázková data.');
    } finally {
      setSeeding(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-gray-500 text-sm">{cs.common.loading}</p>
      </div>
    );
  }

  if (!workbook) {
    return (
      <div className="p-8">
        <p className="text-red-600 text-sm">
          {error ?? 'Účetní kniha nebyla nalezena.'}
        </p>
      </div>
    );
  }

  const hasChanges = name.trim() !== workbook.name || description.trim() !== workbook.description;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-bold text-gray-900 mb-6">{cs.nav.settings}</h1>

      {/* Error / Success banners */}
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
      {success && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center justify-between">
          <span>{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-green-500 hover:text-green-700 ml-4"
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Settings form */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="p-5 space-y-4">
          {/* Name */}
          <Input
            label={cs.workbook.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {cs.workbook.description}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none"
            />
          </div>

          {/* Standard (read-only) */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {cs.workbook.standard}
            </label>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium border ${standardBadgeColors[workbook.standard]}`}
              >
                {standardLabels[workbook.standard] ?? workbook.standard}
              </span>
              <span className="text-xs text-gray-400">
                (nelze změnit po vytvoření)
              </span>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Vytvořeno</p>
              <p className="text-sm text-gray-800">{formatDateTime(workbook.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Poslední úprava</p>
              <p className="text-sm text-gray-800">{formatDateTime(workbook.updated_at)}</p>
            </div>
          </div>
        </div>

        {/* Seed demo data */}
        <div className="px-5 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Ukázková data</p>
              <p className="text-xs text-gray-400">
                Vytvořte vzorové účetní zápisy pro testování a výuku.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSeedDemoData}
              disabled={seeding}
            >
              {seeding ? cs.common.loading : 'Vytvořit ukázková data'}
            </Button>
          </div>
        </div>

        {/* Actions footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            {cs.workbook.delete}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !hasChanges}
          >
            {saving ? cs.common.loading : cs.common.save}
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={cs.workbook.delete}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {cs.workbook.confirmDelete}
          </p>
          <p className="text-sm font-medium text-gray-900">{workbook.name}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteOpen(false)}
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
