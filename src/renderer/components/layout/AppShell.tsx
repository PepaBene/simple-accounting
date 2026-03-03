import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useWorkbookStore } from '@renderer/stores/workbookStore';
import { cs } from '@renderer/i18n/cs';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell() {
  const { id } = useParams<{ id: string }>();
  const { activeWorkbook, setActiveWorkbook } = useWorkbookStore();

  useEffect(() => {
    if (!id) return;

    const workbookId = parseInt(id, 10);
    if (isNaN(workbookId)) return;

    // Only reload if the active workbook differs from the URL param
    if (activeWorkbook && activeWorkbook.id === workbookId) return;

    let cancelled = false;

    async function loadWorkbook() {
      try {
        const workbook = await window.api.workbooks.getById(workbookId);
        if (!cancelled) {
          setActiveWorkbook(workbook);
        }
      } catch (err) {
        console.error('Failed to load workbook:', err);
      }
    }

    loadWorkbook();

    return () => {
      cancelled = true;
    };
  }, [id, activeWorkbook, setActiveWorkbook]);

  // Cleanup active workbook on unmount
  useEffect(() => {
    return () => {
      setActiveWorkbook(null);
    };
  }, [setActiveWorkbook]);

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto bg-gray-50/50">
          {activeWorkbook ? (
            <Outlet />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">{cs.common.loading}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
