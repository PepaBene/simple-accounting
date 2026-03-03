import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      standard TEXT NOT NULL DEFAULT 'czech' CHECK (standard IN ('czech', 'ifrs', 'usgaap', 'general')),
      currency TEXT NOT NULL DEFAULT 'CZK',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workbook_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
      parent_code TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      UNIQUE (workbook_id, code),
      FOREIGN KEY (workbook_id) REFERENCES workbooks (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workbook_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL,
      description TEXT,
      reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (workbook_id) REFERENCES workbooks (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      debit_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0,
      description TEXT,
      CHECK (debit_amount >= 0),
      CHECK (credit_amount >= 0),
      CHECK (NOT (debit_amount > 0 AND credit_amount > 0)),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS account_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      standard TEXT NOT NULL CHECK (standard IN ('czech', 'ifrs', 'usgaap', 'general')),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
      parent_code TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS fiscal_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workbook_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_closed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (workbook_id) REFERENCES workbooks (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_workbook_id ON accounts (workbook_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts (workbook_id, code);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_workbook_id ON journal_entries (workbook_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries (workbook_id, entry_date);
    CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry_id ON journal_entry_lines (journal_entry_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON journal_entry_lines (account_id);
    CREATE INDEX IF NOT EXISTS idx_account_templates_standard ON account_templates (standard);
    CREATE INDEX IF NOT EXISTS idx_fiscal_periods_workbook_id ON fiscal_periods (workbook_id);
  `);
}
