import { useState, useEffect } from 'react';
import { IncomeStatementReport, IncomeStatementSection } from '@renderer/types/reports';
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

function SectionBlock({
  section,
  colorClass,
}: {
  section: IncomeStatementSection;
  colorClass: string;
}) {
  if (section.items.length === 0) return null;

  return (
    <div className="mb-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 px-1">
        {section.label}
      </h4>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <tbody>
            {section.items.map((item, i) => (
              <tr
                key={item.code}
                className={`border-b border-gray-100 hover:bg-blue-50/50 ${
                  i % 2 === 1 ? 'bg-gray-50/50' : ''
                }`}
              >
                <td className="px-3 py-1.5 font-mono text-xs font-medium text-gray-700 w-20">
                  {item.code}
                </td>
                <td className="px-3 py-1.5 text-gray-800">{item.name}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-gray-800 whitespace-nowrap w-32">
                  {formatCZK(item.balance)}
                </td>
              </tr>
            ))}
            <tr className={`border-t border-gray-300 font-semibold ${colorClass}`}>
              <td colSpan={2} className="px-3 py-1.5 text-xs text-gray-700">
                {section.label} celkem
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-gray-900 whitespace-nowrap w-32">
                {formatCZK(section.subtotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  isHighlighted,
}: {
  label: string;
  value: number;
  isHighlighted?: boolean;
}) {
  const borderClass = isHighlighted ? 'border-2 border-gray-400' : 'border border-gray-300';
  const bgClass = isHighlighted ? 'bg-gray-100' : 'bg-gray-50';

  return (
    <div className={`${borderClass} rounded overflow-hidden mb-2`}>
      <table className="w-full text-sm border-collapse">
        <tbody>
          <tr className={`${bgClass} font-bold`}>
            <td className="px-3 py-2 text-xs text-gray-900">
              {label}
            </td>
            <td
              className={`px-3 py-2 text-right font-mono text-xs tabular-nums whitespace-nowrap w-32 ${
                value >= 0 ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {formatCZK(value)} Kč
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// -- component ----------------------------------------------------------------

export default function IncomeStatement() {
  const { activeWorkbook } = useWorkbookStore();

  const [report, setReport] = useState<IncomeStatementReport | null>(null);
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
      const result = await window.api.reports.incomeStatement(activeWorkbook.id);
      if (result.success) {
        setReport(result.data);
      } else {
        setError('Nepodařilo se načíst výkaz zisku a ztráty.');
      }
    } catch {
      setError('Nepodařilo se načíst výkaz zisku a ztráty.');
    } finally {
      setLoading(false);
    }
  }

  const isEmpty =
    report &&
    report.operatingRevenue.items.length === 0 &&
    report.operatingExpenses.items.length === 0 &&
    report.financialRevenue.items.length === 0 &&
    report.financialExpenses.items.length === 0;

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
            Výkaz zisku a ztráty
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
            reportType="incomeStatement"
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
            Zaúčtujte transakce v účetním deníku pro vygenerování výkazu zisku a ztráty.
          </p>
        </div>
      ) : (
        report && (
          <>
            {/* I. Provozní výsledek hospodaření */}
            <div>
              <h2 className="text-sm font-bold text-gray-900 mb-3 px-1 pb-2 border-b-2 border-emerald-500">
                I. Provozní výsledek hospodaření
              </h2>
              <SectionBlock section={report.operatingRevenue} colorClass="bg-emerald-50" />
              <SectionBlock section={report.operatingExpenses} colorClass="bg-red-50" />
              <ResultRow
                label="Provozní výsledek hospodaření"
                value={report.operatingIncome}
              />
            </div>

            {/* II. Finanční výsledek hospodaření */}
            <div>
              <h2 className="text-sm font-bold text-gray-900 mb-3 px-1 pb-2 border-b-2 border-blue-500">
                II. Finanční výsledek hospodaření
              </h2>
              <SectionBlock section={report.financialRevenue} colorClass="bg-blue-50" />
              <SectionBlock section={report.financialExpenses} colorClass="bg-red-50" />
              <ResultRow
                label="Finanční výsledek hospodaření"
                value={report.financialIncome}
              />
            </div>

            {/* III. Výsledek hospodaření za účetní období */}
            <ResultRow
              label="Výsledek hospodaření za účetní období"
              value={report.netIncome}
              isHighlighted
            />

            {/* Profit / Loss label */}
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border ${
                  report.netIncome >= 0
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    report.netIncome >= 0 ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                {report.netIncome >= 0 ? 'Zisk' : 'Ztráta'}:{' '}
                {formatCZK(Math.abs(report.netIncome))} Kč
              </span>
            </div>
          </>
        )
      )}
    </div>
  );
}
