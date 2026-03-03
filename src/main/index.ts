import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initDatabase } from './database/connection';
import { registerWorkbookHandlers } from './ipc/workbooks';
import { registerAccountHandlers } from './ipc/accounts';
import { registerJournalHandlers } from './ipc/journal';
import { registerReportHandlers } from './ipc/reports';
import { registerSeedHandlers } from './ipc/seed';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Účetnictví',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Vite dev server URL or production file
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  // Initialize SQLite database
  initDatabase();

  // Register IPC handlers
  registerWorkbookHandlers();
  registerAccountHandlers();
  registerJournalHandlers();
  registerReportHandlers();
  registerSeedHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Vite dev server URL declaration
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
