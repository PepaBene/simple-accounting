import { useState, useEffect } from 'react';
import { BalanceSheetReport, BalanceSheetItem } from '@renderer/types/reports';
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

// -- sub-components -----------------------------------------------------------

function SectionTable({
  title,
  items,
  subtotalLabel,
  subtotal,
}: {
  title: string;
  items: BalanceSheetItem[];
  subtotalLabel: string;
  subtotal: number;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 px-1">
        {title}
      </h3>
      <div className="overflow-x-auto border border-gray-300 rounded">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 w-20">
                Účet
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200">
                Název
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 w-36">
                Částka
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr
                key={item.code}
                className={`border-b border-gray-200 hover:bg-blue-50 ${
                  i % 2 === 1 ? 'bg-gray-50' : 'bg-white'
                }`}
              >
                <td className="px-3 py-1.5 font-mono text-xs font-medium text-gray-900 border-r border-gray-200 whitespace-nowrap">
                  {item.code}
                </td>
                <td className="px-3 py-1.5 text-gray-800 border-r border-gray-200">
                  {item.name}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 whitespace-nowrap">
                  {formatCZK(item.amount)}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-100 border-t-2 border-gray-400 font-bold">
              <td
                className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200"
                colSpan={2}
              >
                {subtotalLabel}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 whitespace-nowrap">
                {formatCZK(subtotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -- component ----------------------------------------------------------------

export default function BalanceSheet() {
  const { activeWorkbook } = useWorkbookStore();

  const [report, setReport] = useState<BalanceSheetReport | null>(null);
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
      const result = await window.api.reports.balanceSheet(activeWorkbook.id);
      if (result.success) {
        setReport(result.data);
      } else {
        setError('Nepodařilo se načíst rozvahu.');
      }
    } catch {
      setError('Nepodařilo se načíst rozvahu.');
    } finally {
      setLoading(false);
    }
  }

  const isEmpty =
    report &&
    report.assets.length === 0 &&
    report.liabilities.length === 0 &&
    report.equity.length === 0;

  const isBalanced =
    report != null &&
    Math.abs(report.totalAssets - report.totalLiabilitiesAndEquity) < 0.005;

  // -- loading state ----------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Načítání...</p>
      </div>
    );
  }

  // -- render -----------------------------------------------------------------

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rozvaha</h1>
          {activeWorkbook && (
            <p className="text-sm text-gray-500 mt-0.5">
              {activeWorkbook.name} &mdash; ke dni {formatDateCZ(new Date())}
            </p>
          )}
        </div>
        {activeWorkbook && (
          <ReportExport
            workbookId={activeWorkbook.id}
            reportType="balanceSheet"
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
      {!error && isEmpty ? (
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
          <p className="text-sm text-gray-500 mb-1">Žádná data k zobrazení.</p>
          <p className="text-xs text-gray-400">
            Zaúčtujte transakce v účetním deníku pro vygenerování rozvahy.
          </p>
        </div>
      ) : (
        report && (
          <>
            {/* Two-column layout: AKTIVA | PASIVA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left column — AKTIVA */}
              <div className="space-y-4">
                <SectionTable
                  title="Aktiva"
                  items={report.assets}
                  subtotalLabel="Aktiva celkem"
                  subtotal={report.totalAssets}
                />
              </div>

              {/* Right column — PASIVA */}
              <div className="space-y-4">
                <SectionTable
                  title="Závazky"
                  items={report.liabilities}
                  subtotalLabel="Závazky celkem"
                  subtotal={report.liabilities.reduce(
                    (sum, item) => sum + item.amount,
                    0,
                  )}
                />
                <SectionTable
                  title="Vlastní kapitál"
                  items={report.equity}
                  subtotalLabel="Vlastní kapitál celkem"
                  subtotal={report.equity.reduce(
                    (sum, item) => sum + item.amount,
                    0,
                  )}
                />

                {/* Pasiva grand total */}
                <div className="overflow-x-auto border-2 border-gray-400 rounded">
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      <tr className="bg-gray-100 font-bold">
                        <td className="px-3 py-2 text-xs text-gray-900">
                          Pasiva celkem
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 whitespace-nowrap w-36">
                          {formatCZK(report.totalLiabilitiesAndEquity)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Balance check indicator */}
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
                  ? 'Rozvaha je vyrovnaná (Aktiva = Pasiva)'
                  : `Rozvaha není vyrovnaná \u2014 rozdíl: ${formatCZK(Math.abs(report.totalAssets - report.totalLiabilitiesAndEquity))} Kč`}
              </span>
            </div>
          </>
        )
      )}
    </div>
  );
}
