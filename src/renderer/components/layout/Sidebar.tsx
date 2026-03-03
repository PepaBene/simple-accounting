import { NavLink } from 'react-router-dom';
import { cs } from '@renderer/i18n/cs';
import { useUIStore } from '@renderer/stores/uiStore';

// ── SVG icon components (small, inline) ─────────────────────────────────────

function IconAccounts({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function IconJournal({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconLedger({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function IconReport({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconSettings({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconHome({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const linkBase =
    'flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors duration-150';
  const linkActive = 'bg-blue-600 text-white font-medium';
  const linkInactive = 'text-gray-700 hover:bg-gray-100';

  const getLinkClass = ({ isActive }: { isActive: boolean }) =>
    `${linkBase} ${isActive ? linkActive : linkInactive}`;

  const collapsed = sidebarCollapsed;

  return (
    <aside
      className={`flex flex-col border-r border-gray-300 bg-gray-50 transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Header */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} border-b border-gray-300 px-3 py-4`}>
        {!collapsed && (
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
          title={collapsed ? 'Rozbalit' : 'Sbalit'}
        >
          {collapsed ? '\u25B6' : '\u25C0'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <NavLink to="accounts" className={getLinkClass} end title={collapsed ? cs.nav.accounts : undefined}>
          <IconAccounts />
          {!collapsed && <span>{cs.nav.accounts}</span>}
        </NavLink>
        <NavLink to="journal" className={getLinkClass} end title={collapsed ? cs.nav.journal : undefined}>
          <IconJournal />
          {!collapsed && <span>{cs.nav.journal}</span>}
        </NavLink>
        <NavLink to="ledger" className={getLinkClass} end title={collapsed ? cs.nav.ledger : undefined}>
          <IconLedger />
          {!collapsed && <span>{cs.nav.ledger}</span>}
        </NavLink>

        {/* Reports section */}
        {!collapsed && (
          <div className="pt-3 pb-1 px-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {cs.nav.reports}
            </span>
          </div>
        )}
        {collapsed && <div className="h-px bg-gray-200 mx-1 my-2" />}

        <NavLink to="reports/trial-balance" className={getLinkClass} title={collapsed ? cs.nav.trialBalance : undefined}>
          <IconReport />
          {!collapsed && <span>{cs.nav.trialBalance}</span>}
        </NavLink>
        <NavLink to="reports/balance-sheet" className={getLinkClass} title={collapsed ? cs.nav.balanceSheet : undefined}>
          <IconReport />
          {!collapsed && <span>{cs.nav.balanceSheet}</span>}
        </NavLink>
        <NavLink to="reports/income-statement" className={getLinkClass} title={collapsed ? cs.nav.incomeStatement : undefined}>
          <IconReport />
          {!collapsed && <span>{cs.nav.incomeStatement}</span>}
        </NavLink>
        <NavLink to="reports/cash-flow" className={getLinkClass} title={collapsed ? cs.nav.cashFlow : undefined}>
          <IconReport />
          {!collapsed && <span>{cs.nav.cashFlow}</span>}
        </NavLink>
        <NavLink to="reports/equity" className={getLinkClass} title={collapsed ? cs.nav.equityStatement : undefined}>
          <IconReport />
          {!collapsed && <span>{cs.nav.equityStatement}</span>}
        </NavLink>
      </nav>

      {/* Bottom: Settings + Home */}
      <div className="border-t border-gray-300 px-2 py-3 space-y-1">
        <NavLink
          to="settings"
          className={getLinkClass}
          title={collapsed ? cs.nav.settings : undefined}
        >
          <IconSettings />
          {!collapsed && <span>{cs.nav.settings}</span>}
        </NavLink>
        <NavLink
          to="/"
          className="flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-100 transition-colors duration-150"
          title={collapsed ? 'Pracovní sešity' : undefined}
        >
          <IconHome />
          {!collapsed && <span>Pracovní sešity</span>}
        </NavLink>
      </div>
    </aside>
  );
}
