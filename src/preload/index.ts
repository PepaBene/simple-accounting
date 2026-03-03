import { contextBridge, ipcRenderer } from 'electron';

// Type-safe API exposed to the renderer process
const api = {
  // Workbooks
  workbooks: {
    getAll: () => ipcRenderer.invoke('workbooks:getAll'),
    getById: (id: number) => ipcRenderer.invoke('workbooks:getById', id),
    create: (data: { name: string; description: string; standard: string }) =>
      ipcRenderer.invoke('workbooks:create', data),
    update: (id: number, data: { name: string; description: string }) =>
      ipcRenderer.invoke('workbooks:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('workbooks:delete', id),
  },

  // Accounts
  accounts: {
    getByWorkbook: (workbookId: number) =>
      ipcRenderer.invoke('accounts:getByWorkbook', workbookId),
    create: (data: {
      workbook_id: number;
      code: string;
      name: string;
      account_type: string;
      parent_code?: string;
      description?: string;
    }) => ipcRenderer.invoke('accounts:create', data),
    update: (
      id: number,
      data: { name: string; account_type: string; description?: string }
    ) => ipcRenderer.invoke('accounts:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('accounts:delete', id),
    loadTemplate: (workbookId: number, standard: string) =>
      ipcRenderer.invoke('accounts:loadTemplate', workbookId, standard),
    getTemplates: (standard: string) =>
      ipcRenderer.invoke('accounts:getTemplates', standard),
  },

  // Journal entries
  journal: {
    getByWorkbook: (workbookId: number) =>
      ipcRenderer.invoke('journal:getByWorkbook', workbookId),
    getById: (id: number) => ipcRenderer.invoke('journal:getById', id),
    create: (data: {
      workbook_id: number;
      entry_date: string;
      description: string;
      reference?: string;
      lines: Array<{
        account_id: number;
        debit_amount: number;
        credit_amount: number;
        description?: string;
      }>;
    }) => ipcRenderer.invoke('journal:create', data),
    update: (
      id: number,
      data: {
        entry_date: string;
        description: string;
        reference?: string;
        lines: Array<{
          account_id: number;
          debit_amount: number;
          credit_amount: number;
          description?: string;
        }>;
      }
    ) => ipcRenderer.invoke('journal:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('journal:delete', id),
  },

  // Seed / testing
  seed: {
    mockEntries: (workbookId: number) =>
      ipcRenderer.invoke('seed:mockEntries', workbookId),
  },

  // Reports
  reports: {
    trialBalance: (workbookId: number) =>
      ipcRenderer.invoke('reports:trialBalance', workbookId),
    balanceSheet: (workbookId: number) =>
      ipcRenderer.invoke('reports:balanceSheet', workbookId),
    incomeStatement: (workbookId: number) =>
      ipcRenderer.invoke('reports:incomeStatement', workbookId),
    cashFlowStatement: (workbookId: number) =>
      ipcRenderer.invoke('reports:cashFlowStatement', workbookId),
    equityStatement: (workbookId: number) =>
      ipcRenderer.invoke('reports:equityStatement', workbookId),
    exportCsv: (workbookId: number, reportType: string) =>
      ipcRenderer.invoke('reports:exportCsv', workbookId, reportType),
    exportPdf: (workbookId: number, reportType: string) =>
      ipcRenderer.invoke('reports:exportPdf', workbookId, reportType),
    importCsv: (workbookId: number) =>
      ipcRenderer.invoke('reports:importCsv', workbookId),
    seedDemoData: (workbookId: number) =>
      ipcRenderer.invoke('reports:seedDemoData', workbookId),
  },
};

contextBridge.exposeInMainWorld('api', api);

// Export type for use in renderer
export type ElectronAPI = typeof api;
