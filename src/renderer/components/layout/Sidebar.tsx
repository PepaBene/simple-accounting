import { NavLink } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { useUIStore } from '@renderer/stores/uiStore';

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const linkBase =
    'flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors duration-150';
  const linkActive = 'bg-blue-600 text-white font-medium';
  const linkInactive = 'text-gray-700 hover:bg-gray-100';

  const getLinkClass = ({ isActive }: { isActive: boolean }) =>
    `${linkBase} ${isActive ? linkActive : linkInactive}`;

  return (
    <aside
      className={`flex flex-col border-r border-gray-300 bg-gray-50 transition-all duration-200 ${
        sidebarCollapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-300 px-3 py-4">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-700">&#167;</span>
            <span className="text-lg font-bold text-gray-900 tracking-tight">
              Účetnictví
            </span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-gray-200 text-gray-500"
          title={sidebarCollapsed ? 'Rozbalit' : 'Sbalit'}
        >
          {sidebarCollapsed ? '\u25B6' : '\u25C0'}
        </button>
      </div>

      {/* Navigation */}
      {!sidebarCollapsed && (
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          <NavLink to="accounts" className={getLinkClass} end>
            {cs.nav.accounts}
          </NavLink>
          <NavLink to="journal" className={getLinkClass} end>
            {cs.nav.journal}
          </NavLink>
          <NavLink to="ledger" className={getLinkClass} end>
            {cs.nav.ledger}
          </NavLink>

          {/* Reports section */}
          <div className="pt-3 pb-1 px-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {cs.nav.reports}
            </span>
          </div>
          <NavLink to="reports/trial-balance" className={getLinkClass}>
            {cs.nav.trialBalance}
          </NavLink>
          <NavLink to="reports/balance-sheet" className={getLinkClass}>
            {cs.nav.balanceSheet}
          </NavLink>
          <NavLink to="reports/income-statement" className={getLinkClass}>
            {cs.nav.incomeStatement}
          </NavLink>
          <NavLink to="reports/cash-flow" className={getLinkClass}>
            {cs.nav.cashFlow}
          </NavLink>
          <NavLink to="reports/equity" className={getLinkClass}>
            {cs.nav.equityStatement}
          </NavLink>
        </nav>
      )}

      {/* Bottom: Home link */}
      {!sidebarCollapsed && (
        <div className="border-t border-gray-300 px-2 py-3">
          <NavLink
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-100 transition-colors duration-150"
          >
            <span>&larr;</span>
            <span>Pracovní sešity</span>
          </NavLink>
        </div>
      )}
    </aside>
  );
}
