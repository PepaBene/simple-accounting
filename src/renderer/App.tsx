import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from '@renderer/components/common/ErrorBoundary';
import AppShell from '@renderer/components/layout/AppShell';
import WorkbookList from '@renderer/components/workbook/WorkbookList';
import WorkbookSettings from '@renderer/components/workbook/WorkbookSettings';
import ChartOfAccounts from '@renderer/components/accounts/ChartOfAccounts';
import JournalEntryList from '@renderer/components/journal/JournalEntryList';
import JournalEntryForm from '@renderer/components/journal/JournalEntryForm';
import JournalEntryDetail from '@renderer/components/journal/JournalEntryDetail';
import TAccountGrid from '@renderer/components/ledger/TAccountGrid';
import TrialBalance from '@renderer/components/reports/TrialBalance';
import BalanceSheet from '@renderer/components/reports/BalanceSheet';
import IncomeStatement from '@renderer/components/reports/IncomeStatement';
import CashFlowStatement from '@renderer/components/reports/CashFlowStatement';
import EquityStatement from '@renderer/components/reports/EquityStatement';

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<WorkbookList />} />
          <Route path="/workbook/:id" element={<AppShell />}>
            <Route index element={<Navigate to="journal" replace />} />
            <Route path="accounts" element={<ErrorBoundary><ChartOfAccounts /></ErrorBoundary>} />
            <Route path="journal" element={<ErrorBoundary><JournalEntryList /></ErrorBoundary>} />
            <Route path="journal/new" element={<ErrorBoundary><JournalEntryForm /></ErrorBoundary>} />
            <Route path="journal/:entryId" element={<ErrorBoundary><JournalEntryDetail /></ErrorBoundary>} />
            <Route path="journal/:entryId/edit" element={<ErrorBoundary><JournalEntryForm /></ErrorBoundary>} />
            <Route path="ledger" element={<ErrorBoundary><TAccountGrid /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><WorkbookSettings /></ErrorBoundary>} />
            <Route path="reports/trial-balance" element={<ErrorBoundary><TrialBalance /></ErrorBoundary>} />
            <Route path="reports/balance-sheet" element={<ErrorBoundary><BalanceSheet /></ErrorBoundary>} />
            <Route path="reports/income-statement" element={<ErrorBoundary><IncomeStatement /></ErrorBoundary>} />
            <Route path="reports/cash-flow" element={<ErrorBoundary><CashFlowStatement /></ErrorBoundary>} />
            <Route path="reports/equity" element={<ErrorBoundary><EquityStatement /></ErrorBoundary>} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
