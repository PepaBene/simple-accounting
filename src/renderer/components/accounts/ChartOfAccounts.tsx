import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { Account, AccountType, AccountingStandardId } from '@renderer/types/accounting';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import Button from '@renderer/components/common/Button';
import Input from '@renderer/components/common/Input';
import Modal from '@renderer/components/common/Modal';
import Table from '@renderer/components/common/Table';

// ── Account type badge styling ──────────────────────────────────────────────

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

const accountTypeOptions: { value: AccountType; label: string }[] = [
  { value: 'asset', label: cs.accounts.types.asset },
  { value: 'liability', label: cs.accounts.types.liability },
  { value: 'equity', label: cs.accounts.types.equity },
  { value: 'revenue', label: cs.accounts.types.revenue },
  { value: 'expense', label: cs.accounts.types.expense },
];

// ── Account class labels (first digit of code) ─────────────────────────────

const accountClassLabels: Record<string, string> = {
  '0': '0 – Dlouhodobý majetek',
  '1': '1 – Zásoby',
  '2': '2 – Krátkodobý finanční majetek a peněžní prostředky',
  '3': '3 – Zúčtovací vztahy',
  '4': '4 – Kapitálové účty a dlouhodobé závazky',
  '5': '5 – Náklady',
  '6': '6 – Výnosy',
  '7': '7 – Závěrkové a podrozvahové účty',
  '8': '8 – Vnitropodnikové účetnictví',
  '9': '9 – Podrozvahové účty',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function ChartOfAccounts() {
  const { id } = useParams<{ id: string }>();
  const { activeWorkbook } = useWorkbookStore();
  const workbookId = Number(id) || activeWorkbook?.id;

  // Data state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter / search
  const [searchQuery, setSearchQuery] = useState('');

  // Collapsible account classes
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(new Set());

  // Add / Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AccountType>('asset');
  const [formParentCode, setFormParentCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Template loading confirmation
  const [templateConfirmOpen, setTemplateConfirmOpen] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (workbookId) {
      loadAccounts();
    }
  }, [workbookId]);

  async function loadAccounts() {
    if (!workbookId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.accounts.getByWorkbook(workbookId);
      if (result.success) {
        setAccounts(result.data as Account[]);
      } else {
        setError(result.error ?? 'Nepodařilo se načíst účty.');
      }
    } catch {
      setError('Nepodařilo se načíst účty.');
    } finally {
      setLoading(false);
    }
  }

  // ── Filtering + grouping ─────────────────────────────────────────────────

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    const q = searchQuery.toLowerCase().trim();
    return accounts.filter(
      (acc) =>
        acc.code.toLowerCase().includes(q) ||
        acc.name.toLowerCase().includes(q)
    );
  }, [accounts, searchQuery]);

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    for (const acc of filteredAccounts) {
      const classKey = acc.code.charAt(0);
      if (!groups[classKey]) {
        groups[classKey] = [];
      }
      groups[classKey].push(acc);
    }
    // Sort keys numerically
    const sorted = Object.keys(groups).sort();
    return sorted.map((key) => ({
      classKey: key,
      label: accountClassLabels[key] ?? `${key} – Ostatní`,
      accounts: groups[key],
    }));
  }, [filteredAccounts]);

  // ── Collapse toggle ──────────────────────────────────────────────────────

  function toggleClass(classKey: string) {
    setCollapsedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classKey)) {
        next.delete(classKey);
      } else {
        next.add(classKey);
      }
      return next;
    });
  }

  // ── Form helpers ─────────────────────────────────────────────────────────

  function openAddModal() {
    setEditingAccount(null);
    setFormCode('');
    setFormName('');
    setFormType('asset');
    setFormParentCode('');
    setFormDescription('');
    setFormOpen(true);
  }

  function openEditModal(account: Account) {
    setEditingAccount(account);
    setFormCode(account.code);
    setFormName(account.name);
    setFormType(account.account_type);
    setFormParentCode(account.parent_code ?? '');
    setFormDescription(account.description ?? '');
    setFormOpen(true);
  }

  async function handleFormSubmit() {
    if (!workbookId || !formCode.trim() || !formName.trim()) return;
    setFormSaving(true);
    setError(null);
    try {
      if (editingAccount) {
        // Update
        const result = await window.api.accounts.update(editingAccount.id, {
          name: formName.trim(),
          account_type: formType,
          description: formDescription.trim() || undefined,
        });
        if (result.success) {
          setFormOpen(false);
          await loadAccounts();
        } else {
          setError(result.error ?? 'Nepodařilo se upravit účet.');
        }
      } else {
        // Create
        const result = await window.api.accounts.create({
          workbook_id: workbookId,
          code: formCode.trim(),
          name: formName.trim(),
          account_type: formType,
          parent_code: formParentCode.trim() || undefined,
          description: formDescription.trim() || undefined,
        });
        if (result.success) {
          setFormOpen(false);
          await loadAccounts();
        } else {
          setError(result.error ?? 'Nepodařilo se vytvořit účet.');
        }
      }
    } catch {
      setError(editingAccount ? 'Nepodařilo se upravit účet.' : 'Nepodařilo se vytvořit účet.');
    } finally {
      setFormSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await window.api.accounts.delete(deleteTarget.id);
      if (result.success) {
        setDeleteTarget(null);
        await loadAccounts();
      } else {
        setError(result.error ?? 'Nepodařilo se smazat účet.');
      }
    } catch {
      setError('Nepodařilo se smazat účet.');
    } finally {
      setDeleting(false);
    }
  }

  // ── Load template ────────────────────────────────────────────────────────

  async function handleLoadTemplate() {
    if (!workbookId || !activeWorkbook) return;
    setLoadingTemplate(true);
    setError(null);
    try {
      const result = await window.api.accounts.loadTemplate(
        workbookId,
        activeWorkbook.standard
      );
      if (result.success) {
        setTemplateConfirmOpen(false);
        setSuccessMsg(cs.accounts.templateLoaded);
        await loadAccounts();
        // Auto-dismiss success message after 3 seconds
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(result.error ?? 'Nepodařilo se načíst šablonu.');
      }
    } catch {
      setError('Nepodařilo se načíst šablonu.');
    } finally {
      setLoadingTemplate(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-gray-500 text-sm">{cs.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-gray-900">{cs.accounts.title}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setTemplateConfirmOpen(true)}>
            {cs.accounts.loadTemplate}
          </Button>
          <Button onClick={openAddModal}>+ {cs.accounts.add}</Button>
        </div>
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

      {/* Success banner */}
      {successMsg && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center justify-between">
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-green-500 hover:text-green-700 ml-4"
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Search filter */}
      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Hledat podle kódu nebo názvu..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Empty state */}
      {accounts.length === 0 ? (
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
          <p className="text-gray-500 text-sm mb-1">{cs.common.noData}</p>
          <p className="text-gray-400 text-xs mb-4">
            Přidejte účty ručně nebo načtěte šablonu účtového rozvrhu.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setTemplateConfirmOpen(true)}>
              {cs.accounts.loadTemplate}
            </Button>
            <Button onClick={openAddModal}>+ {cs.accounts.add}</Button>
          </div>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-gray-500 text-sm">
            Žádné účty odpovídající &quot;{searchQuery}&quot;
          </p>
        </div>
      ) : (
        /* Grouped account table */
        <div className="space-y-3">
          {groupedAccounts.map((group) => (
            <div
              key={group.classKey}
              className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden"
            >
              {/* Group header */}
              <button
                onClick={() => toggleClass(group.classKey)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200 text-left"
              >
                <span className="text-sm font-semibold text-gray-700">
                  {group.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {group.accounts.length}{' '}
                    {group.accounts.length === 1
                      ? 'účet'
                      : group.accounts.length >= 2 && group.accounts.length <= 4
                        ? 'účty'
                        : 'účtů'}
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
                      collapsedClasses.has(group.classKey) ? '' : 'rotate-180'
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
                </div>
              </button>

              {/* Group content */}
              {!collapsedClasses.has(group.classKey) && (
                <Table
                  headers={[
                    cs.accounts.code,
                    cs.accounts.name,
                    cs.accounts.type,
                    'Stav',
                    '',
                  ]}
                >
                  {group.accounts.map((acc) => {
                    const badge = accountTypeBadge[acc.account_type];
                    return (
                      <tr key={acc.id}>
                        <td className="font-mono text-xs font-medium text-gray-900 w-24">
                          {acc.code}
                        </td>
                        <td className="text-sm text-gray-800">{acc.name}</td>
                        <td className="w-32">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="w-24">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              acc.is_active
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-gray-100 text-gray-500 border border-gray-200'
                            }`}
                          >
                            {acc.is_active ? 'Aktivní' : 'Neaktivní'}
                          </span>
                        </td>
                        <td className="w-20 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(acc)}
                              className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title={cs.accounts.edit}
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
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeleteTarget(acc)}
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title={cs.accounts.delete}
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
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Account Modal ──────────────────────────────────────── */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingAccount ? cs.accounts.edit : cs.accounts.add}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleFormSubmit();
          }}
          className="space-y-4"
        >
          <Input
            label={cs.accounts.code}
            value={formCode}
            onChange={(e) => setFormCode(e.target.value)}
            placeholder="Např. 211"
            required
            autoFocus
            disabled={!!editingAccount}
          />

          <Input
            label={cs.accounts.name}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Např. Pokladna"
            required
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {cs.accounts.type}
            </label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value as AccountType)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm bg-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            >
              {accountTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {!editingAccount && (
            <Input
              label={cs.accounts.parentCode}
              value={formParentCode}
              onChange={(e) => setFormParentCode(e.target.value)}
              placeholder="Např. 21 (volitelné)"
            />
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {cs.accounts.description}
            </label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
              placeholder="Volitelný popis účtu..."
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(false)}
            >
              {cs.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={formSaving || !formCode.trim() || !formName.trim()}
            >
              {formSaving ? cs.common.loading : cs.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={cs.accounts.delete}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{cs.accounts.confirmDelete}</p>
          {deleteTarget && (
            <p className="text-sm font-medium text-gray-900">
              {deleteTarget.code} – {deleteTarget.name}
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

      {/* ── Template Loading Confirmation Modal ───────────────────────────── */}
      <Modal
        isOpen={templateConfirmOpen}
        onClose={() => setTemplateConfirmOpen(false)}
        title={cs.accounts.loadTemplate}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Načíst šablonu účtového rozvrhu pro standard{' '}
            <strong>
              {activeWorkbook
                ? ({
                    czech: cs.standards.czech,
                    ifrs: cs.standards.ifrs,
                    usgaap: cs.standards.usgaap,
                    general: cs.standards.general,
                  } as Record<AccountingStandardId, string>)[activeWorkbook.standard]
                : ''}
            </strong>
            ?
          </p>
          {accounts.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Upozornění: Šablona přidá nové účty ke stávajícím. Duplicitní kódy mohou
              způsobit chybu.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setTemplateConfirmOpen(false)}
            >
              {cs.common.cancel}
            </Button>
            <Button onClick={handleLoadTemplate} disabled={loadingTemplate}>
              {loadingTemplate ? cs.common.loading : cs.common.confirm}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
