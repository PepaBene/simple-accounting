import { useState, useEffect, useMemo } from 'react';
import { TrialBalanceRow } from '@renderer/types/reports';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import ReportExport from '@renderer/components/reports/ReportExport';

// -- helpers ------------------------------------------------------------------

function formatCZK(value: number): string {
  if (value === 0) return '0,00';
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateCZ(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// -- component ----------------------------------------------------------------

export default function TrialBalance() {
  const { activeWorkbook } = useWorkbookStore();

  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkbook) return;
    loadData();
  }, [activeWorkbook?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!activeWorkbook) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.reports.trialBalance(activeWorkbook.id);
      if (result.success) {
        setRows(result.data);
      } else {
        setError('Nepoda\u0159ilo se na\u010d\u00edst obratovou p\u0159edvahu.');
      }
    } catch {
      setError('Nepoda\u0159ilo se na\u010d\u00edst obratovou p\u0159edvahu.');
    } finally {
      setLoading(false);
    }
  }

  // -- totals -----------------------------------------------------------------

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        openingDebit: acc.openingDebit + row.opening_debit,
        openingCredit: acc.openingCredit + row.opening_credit,
        turnoverDebit: acc.turnoverDebit + row.turnover_debit,
        turnoverCredit: acc.turnoverCredit + row.turnover_credit,
        closingDebit: acc.closingDebit + row.closing_debit,
        closingCredit: acc.closingCredit + row.closing_credit,
      }),
      {
        openingDebit: 0,
        openingCredit: 0,
        turnoverDebit: 0,
        turnoverCredit: 0,
        closingDebit: 0,
        closingCredit: 0,
      },
    );
  }, [rows]);

  const isBalanced =
    Math.abs(totals.closingDebit - totals.closingCredit) < 0.005;

  // -- loading state ----------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Na\u010d\u00edt\u00e1n\u00ed...</p>
      </div>
    );
  }

  // -- render -----------------------------------------------------------------

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Obratov\u00e1 p\u0159edvaha
          </h1>
          {activeWorkbook && (
            <p className="text-sm text-gray-500 mt-0.5">
              {activeWorkbook.name} &mdash; ke dni {formatDateCZ(new Date())}
            </p>
          )}
        </div>
        {activeWorkbook && (
          <ReportExport
            workbookId={activeWorkbook.id}
            reportType="trialBalance"
          />
        )}
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

      {/* Empty state */}
      {!error && rows.length === 0 ? (
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
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-1">\u017d\u00e1dn\u00e1 data k zobrazen\u00ed.</p>
          <p className="text-xs text-gray-400">
            Za\u00fa\u010dtujte transakce v \u00fa\u010detn\u00edm den\u00edku pro vygenerov\u00e1n\u00ed obratov\u00e9 p\u0159edvahy.
          </p>
        </div>
      ) : (
        /* Data table */
        <div className="overflow-x-auto border border-gray-300 rounded">
          <table className="w-full text-sm border-collapse">
            {/* Column headers */}
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200"
                  rowSpan={2}
                >
                  \u00da\u010det
                </th>
                <th
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200"
                  rowSpan={2}
                >
                  N\u00e1zev
                </th>
                <th
                  className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 border-b border-gray-200"
                  colSpan={2}
                >
                  Po\u010d\u00e1te\u010dn\u00ed stav
                </th>
                <th
                  className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 border-b border-gray-200"
                  colSpan={2}
                >
                  Obrat
                </th>
                <th
                  className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 border-b border-gray-200"
                  colSpan={2}
                >
                  Kone\u010dn\u00fd stav
                </th>
              </tr>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 whitespace-nowrap">
                  MD
                </th>
                <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 whitespace-nowrap">
                  D
                </th>
                <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 whitespace-nowrap">
                  MD
                </th>
                <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 whitespace-nowrap">
                  D
                </th>
                <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 whitespace-nowrap">
                  MD
                </th>
                <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 whitespace-nowrap">
                  D
                </th>
              </tr>
            </thead>

            {/* Data rows */}
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.account_id}
                  className={`border-b border-gray-200 hover:bg-blue-50 ${
                    i % 2 === 1 ? 'bg-gray-50' : 'bg-white'
                  }`}
                >
                  <td className="px-3 py-1.5 font-mono text-xs font-medium text-gray-900 border-r border-gray-200 whitespace-nowrap">
                    {row.code}
                  </td>
                  <td className="px-3 py-1.5 text-gray-800 border-r border-gray-200">
                    {row.name}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(row.opening_debit)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(row.opening_credit)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(row.turnover_debit)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(row.turnover_credit)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(row.closing_debit)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 whitespace-nowrap">
                    {formatCZK(row.closing_credit)}
                  </td>
                </tr>
              ))}

              {/* Totals row */}
              {rows.length > 0 && (
                <tr className="bg-gray-100 border-t-2 border-gray-400 font-bold">
                  <td className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200" colSpan={2}>
                    Celkem
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(totals.openingDebit)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(totals.openingCredit)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(totals.turnoverDebit)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(totals.turnoverCredit)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 border-r border-gray-200 whitespace-nowrap">
                    {formatCZK(totals.closingDebit)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 whitespace-nowrap">
                    {formatCZK(totals.closingCredit)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Balance check indicator */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border ${
              isBalanced
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isBalanced ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            {isBalanced
              ? 'P\u0159edvaha je vyrovnan\u00e1 (MD = D)'
              : `P\u0159edvaha nen\u00ed vyrovnan\u00e1 \u2014 rozd\u00edl: ${formatCZK(Math.abs(totals.closingDebit - totals.closingCredit))} K\u010d`}
          </span>
        </div>
      )}
    </div>
  );
}
