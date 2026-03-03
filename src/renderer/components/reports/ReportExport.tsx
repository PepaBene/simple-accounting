import { useState } from 'react';
import Button from '@renderer/components/common/Button';

interface ReportExportProps {
  workbookId: number;
  reportType: string;
}

export default function ReportExport({ workbookId, reportType }: ReportExportProps) {
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleExportCsv() {
    setExportingCsv(true);
    setMessage(null);
    setIsError(false);
    try {
      const result = await window.api.reports.exportCsv(workbookId, reportType);
      if (result.success) {
        setMessage(`CSV exportov\u00e1no: ${result.data.filePath}`);
        setIsError(false);
      } else {
        setMessage('Nepoda\u0159ilo se exportovat CSV.');
        setIsError(true);
      }
    } catch {
      setMessage('Nepoda\u0159ilo se exportovat CSV.');
      setIsError(true);
    } finally {
      setExportingCsv(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    setMessage(null);
    setIsError(false);
    try {
      const result = await window.api.reports.exportPdf(workbookId, reportType);
      if (result.success) {
        setMessage(`PDF exportov\u00e1no: ${result.data.filePath}`);
        setIsError(false);
      } else {
        setMessage('Nepoda\u0159ilo se exportovat PDF.');
        setIsError(true);
      }
    } catch {
      setMessage('Nepoda\u0159ilo se exportovat PDF.');
      setIsError(true);
    } finally {
      setExportingPdf(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleExportCsv}
        disabled={exportingCsv}
      >
        {exportingCsv ? (
          <span className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Exportuji...
          </span>
        ) : (
          'Export CSV'
        )}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleExportPdf}
        disabled={exportingPdf}
      >
        {exportingPdf ? (
          <span className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Exportuji...
          </span>
        ) : (
          'Export PDF'
        )}
      </Button>

      {message && (
        <span
          className={`text-xs px-2.5 py-1 rounded ${
            isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
