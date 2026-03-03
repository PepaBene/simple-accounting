import { create } from 'zustand';
import { Workbook } from '../types/accounting';

interface WorkbookStore {
  activeWorkbook: Workbook | null;
  workbooks: Workbook[];
  setActiveWorkbook: (workbook: Workbook | null) => void;
  setWorkbooks: (workbooks: Workbook[]) => void;
  loadWorkbooks: () => Promise<void>;
}

export const useWorkbookStore = create<WorkbookStore>((set) => ({
  activeWorkbook: null,
  workbooks: [],
  setActiveWorkbook: (workbook) => set({ activeWorkbook: workbook }),
  setWorkbooks: (workbooks) => set({ workbooks }),
  loadWorkbooks: async () => {
    const result = await window.api.workbooks.getAll();
    if (result.success) {
      set({ workbooks: result.data });
    }
  },
}));
