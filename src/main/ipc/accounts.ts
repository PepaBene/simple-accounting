import { ipcMain } from 'electron';
import { getDb } from '../database/connection';

interface CreateAccountData {
  workbook_id: number;
  code: string;
  name: string;
  account_type: string;
  parent_code?: string;
  description?: string;
}

interface UpdateAccountData {
  name: string;
  account_type: string;
  description?: string;
}

export function registerAccountHandlers(): void {
  ipcMain.handle('accounts:getByWorkbook', (_event, workbookId: number) => {
    try {
      const db = getDb();
      const accounts = db
        .prepare('SELECT * FROM accounts WHERE workbook_id = ? ORDER BY code')
        .all(workbookId);
      return { success: true, data: accounts };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('accounts:create', (_event, data: CreateAccountData) => {
    try {
      const db = getDb();
      const result = db
        .prepare(
          'INSERT INTO accounts (workbook_id, code, name, account_type, parent_code, description) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          data.workbook_id,
          data.code,
          data.name,
          data.account_type,
          data.parent_code ?? null,
          data.description ?? null
        );

      const newAccount = db
        .prepare('SELECT * FROM accounts WHERE id = ?')
        .get(result.lastInsertRowid);

      return { success: true, data: newAccount };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'accounts:update',
    (_event, id: number, data: UpdateAccountData) => {
      try {
        const db = getDb();
        const result = db
          .prepare(
            'UPDATE accounts SET name = ?, account_type = ?, description = ? WHERE id = ?'
          )
          .run(data.name, data.account_type, data.description ?? null, id);

        if (result.changes === 0) {
          return { success: false, error: 'Account not found' };
        }

        const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
        return { success: true, data: updated };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('accounts:delete', (_event, id: number) => {
    try {
      const db = getDb();
      const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);

      if (result.changes === 0) {
        return { success: false, error: 'Account not found' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'accounts:loadTemplate',
    (_event, workbookId: number, standard: string) => {
      try {
        const db = getDb();
        const templates = db
          .prepare('SELECT * FROM account_templates WHERE standard = ? ORDER BY code')
          .all(standard) as Array<{
          code: string;
          name: string;
          account_type: string;
          parent_code: string | null;
          description: string | null;
        }>;

        if (templates.length === 0) {
          return { success: false, error: `No templates found for standard: ${standard}` };
        }

        const insertStmt = db.prepare(
          'INSERT INTO accounts (workbook_id, code, name, account_type, parent_code, description) VALUES (?, ?, ?, ?, ?, ?)'
        );

        const insertAll = db.transaction(() => {
          let count = 0;
          for (const template of templates) {
            insertStmt.run(
              workbookId,
              template.code,
              template.name,
              template.account_type,
              template.parent_code,
              template.description
            );
            count++;
          }
          return count;
        });

        const count = insertAll();
        return { success: true, data: { count } };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('accounts:getTemplates', (_event, standard: string) => {
    try {
      const db = getDb();
      const templates = db
        .prepare('SELECT * FROM account_templates WHERE standard = ? ORDER BY code')
        .all(standard);
      return { success: true, data: templates };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
