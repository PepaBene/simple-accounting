import { ipcMain } from 'electron';
import { getDb } from '../database/connection';

export function registerWorkbookHandlers(): void {
  ipcMain.handle('workbooks:getAll', () => {
    try {
      const db = getDb();
      const workbooks = db.prepare('SELECT * FROM workbooks ORDER BY updated_at DESC').all();
      return { success: true, data: workbooks };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('workbooks:getById', (_event, id: number) => {
    try {
      const db = getDb();
      const workbook = db.prepare('SELECT * FROM workbooks WHERE id = ?').get(id);
      if (!workbook) {
        return { success: false, error: 'Workbook not found' };
      }
      return { success: true, data: workbook };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'workbooks:create',
    (_event, data: { name: string; description: string; standard: string }) => {
      try {
        const db = getDb();
        const result = db
          .prepare(
            'INSERT INTO workbooks (name, description, standard) VALUES (?, ?, ?)'
          )
          .run(data.name, data.description, data.standard);

        const newWorkbook = db
          .prepare('SELECT * FROM workbooks WHERE id = ?')
          .get(result.lastInsertRowid);

        return { success: true, data: newWorkbook };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    'workbooks:update',
    (_event, id: number, data: { name: string; description: string }) => {
      try {
        const db = getDb();
        const result = db
          .prepare(
            "UPDATE workbooks SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?"
          )
          .run(data.name, data.description, id);

        if (result.changes === 0) {
          return { success: false, error: 'Workbook not found' };
        }

        const updated = db.prepare('SELECT * FROM workbooks WHERE id = ?').get(id);
        return { success: true, data: updated };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('workbooks:delete', (_event, id: number) => {
    try {
      const db = getDb();
      const result = db.prepare('DELETE FROM workbooks WHERE id = ?').run(id);

      if (result.changes === 0) {
        return { success: false, error: 'Workbook not found' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
