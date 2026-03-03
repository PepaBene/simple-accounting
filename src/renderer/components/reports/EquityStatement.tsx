import { useState, useEffect, useMemo } from 'react';
import { EquityStatementReport } from '@renderer/types/reports';
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

export default function EquityStatement() {
  const { activeWorkbook } = useWorkbookStore();

  const [report, setReport] = useState<EquityStatementReport | null>(null);
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
      const result = await window.api.reports.equityStatement(activeWorkbook.id);
      if (result.success) {
        setReport(result.data);
      } else {
        setError('Nepodařilo se načíst přehled o změnách vlastního kapitálu.');
      }
    } catch {
      setError('Nepodařilo se načíst přehled o změnách vlastního kapitálu.');
    } finally {
      setLoading(false);
    }
  }

  // -- totals -----------------------------------------------------------------

  const totals = useMemo(() => {
    if (!report) {
      return {
        totalOpening: 0,
        totalContributions: 0,
        totalWithdrawals: 0,
        totalClosing: 0,
      };
    }
    return report.accounts.reduce(
      (acc, item) => ({
        totalOpening: acc.totalOpening + item.opening_balance,
        totalContributions: acc.totalContributions + item.contributions,
        totalWithdrawals: acc.totalWithdrawals + item.withdrawals,
        totalClosing: acc.totalClosing + item.closing_balance,
      }),
      {
        totalOpening: 0,
        totalContributions: 0,
        totalWithdrawals: 0,
        totalClosing: 0,
      },
    );
  }, [report]);

  const isEmpty = report && report.accounts.length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Načítání...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Přehled o změnách vlastního kapitálu
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
            reportType="equityStatement"
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
            Zaúčtujte transakce v účetním deníku pro vygenerování přehledu o
            změnách vlastního kapitálu.
          </p>
        </div>
      ) : (
        report && (
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
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 w-32">
                    Počáteční stav
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 w-32">
                    Zvýšení
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 w-32">
                    Snížení
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 w-32">
                    Konečný stav
                  </th>
                </tr>
              </thead>

              <tbody>
                {report.accounts.map((item, i) => (
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
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 border-r border-gray-200 whitespace-nowrap">
                      {formatCZK(item.opening_balance)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-green-700 border-r border-gray-200 whitespace-nowrap">
                      {formatCZK(item.contributions)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-red-700 border-r border-gray-200 whitespace-nowrap">
                      {formatCZK(item.withdrawals)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-800 whitespace-nowrap">
                      {formatCZK(item.closing_balance)}
                    </td>
                  </tr>
                ))}

                {/* Totals row */}
                {report.accounts.length > 0 && (
                  <tr className="bg-gray-100 border-t-2 border-gray-400 font-bold">
                    <td
                      className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200"
                      colSpan={2}
                    >
                      Celkem
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 border-r border-gray-200 whitespace-nowrap">
                      {formatCZK(totals.totalOpening)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-green-700 border-r border-gray-200 whitespace-nowrap">
                      {formatCZK(totals.totalContributions)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-red-700 border-r border-gray-200 whitespace-nowrap">
                      {formatCZK(totals.totalWithdrawals)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-900 whitespace-nowrap">
                      {formatCZK(totals.totalClosing)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Summary */}
      {report && report.accounts.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
            Počáteční stav celkem: {formatCZK(totals.totalOpening)} Kč
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
            Konečný stav celkem: {formatCZK(totals.totalClosing)} Kč
          </span>
        </div>
      )}
    </div>
  );
}
