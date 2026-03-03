import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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
    <HashRouter>
      <Routes>
        <Route path="/" element={<WorkbookList />} />
        <Route path="/workbook/:id" element={<AppShell />}>
          <Route index element={<Navigate to="journal" replace />} />
          <Route path="accounts" element={<ChartOfAccounts />} />
          <Route path="journal" element={<JournalEntryList />} />
          <Route path="journal/new" element={<JournalEntryForm />} />
          <Route path="journal/:entryId" element={<JournalEntryDetail />} />
          <Route path="journal/:entryId/edit" element={<JournalEntryForm />} />
          <Route path="ledger" element={<TAccountGrid />} />
          <Route path="settings" element={<WorkbookSettings />} />
          <Route path="reports/trial-balance" element={<TrialBalance />} />
          <Route path="reports/balance-sheet" element={<BalanceSheet />} />
          <Route path="reports/income-statement" element={<IncomeStatement />} />
          <Route path="reports/cash-flow" element={<CashFlowStatement />} />
          <Route path="reports/equity" element={<EquityStatement />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
