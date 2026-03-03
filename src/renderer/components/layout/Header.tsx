import { useLocation } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import type { AccountingStandardId } from '@renderer/types/accounting';

const standardLabels: Record<AccountingStandardId, string> = {
  czech: 'ČÚS',
  ifrs: 'IFRS',
  usgaap: 'US GAAP',
  general: 'Obecné',
};

const standardColors: Record<AccountingStandardId, string> = {
  czech: 'bg-blue-100 text-blue-800 border-blue-300',
  ifrs: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  usgaap: 'bg-amber-100 text-amber-800 border-amber-300',
  general: 'bg-gray-100 text-gray-700 border-gray-300',
};

function useBreadcrumb(): string | null {
  const location = useLocation();
  const path = location.pathname;

  if (path.includes('/accounts')) return cs.nav.accounts;
  if (path.includes('/journal/new')) return cs.journal.newEntry;
  if (path.includes('/journal')) return cs.nav.journal;
  if (path.includes('/ledger')) return cs.nav.ledger;
  if (path.includes('/reports/trial-balance')) return cs.nav.trialBalance;
  if (path.includes('/reports/balance-sheet')) return cs.nav.balanceSheet;
  if (path.includes('/reports/income-statement')) return cs.nav.incomeStatement;
  if (path.includes('/reports/cash-flow')) return cs.nav.cashFlow;
  if (path.includes('/reports/equity')) return cs.nav.equityStatement;

  return null;
}

export default function Header() {
  const { activeWorkbook } = useWorkbookStore();
  const breadcrumb = useBreadcrumb();

  if (!activeWorkbook) {
    return (
      <header className="flex items-center h-12 px-5 border-b border-gray-300 bg-white">
        <span className="text-sm text-gray-400">{cs.common.loading}</span>
      </header>
    );
  }

  const standard = activeWorkbook.standard;

  return (
    <header className="flex items-center justify-between h-12 px-5 border-b border-gray-300 bg-white">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-gray-900">
          {activeWorkbook.name}
        </h1>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${standardColors[standard]}`}
        >
          {standardLabels[standard]}
        </span>
        {breadcrumb && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-500">{breadcrumb}</span>
          </>
        )}
      </div>
    </header>
  );
}
