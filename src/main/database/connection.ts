import { app } from 'electron';
import path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from './schema';
import { czechAccounts } from './seeds/czech-accounts';
import { ifrsAccounts } from './seeds/ifrs-accounts';
import { usgaapAccounts } from './seeds/usgaap-accounts';
import { generalAccounts } from './seeds/general-accounts';
import type { AccountTemplate } from './seeds/czech-accounts';

let db: Database.Database | null = null;

/**
 * Returns the singleton database instance.
 * Must be called after `initDatabase()`.
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error(
      'Database has not been initialised. Call initDatabase() first.'
    );
  }
  return db;
}

/**
 * Initialise the SQLite database:
 *   1. Open (or create) the database file in the user-data directory.
 *   2. Enable WAL journal mode and foreign keys.
 *   3. Run schema migrations (CREATE TABLE IF NOT EXISTS …).
 *   4. Seed account templates on first run.
 */
export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'accounting.db');

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Enable foreign key constraint enforcement
  db.pragma('foreign_keys = ON');

  // Run schema migrations (creates tables if they don't exist)
  runMigrations(db);

  // Seed account templates on first run
  seedTemplates(db);
}

/**
 * Seeds account_templates for every standard if they don't already exist.
 * Uses a transaction for atomicity.
 */
function seedTemplates(database: Database.Database): void {
  const seedStandard = (
    standard: string,
    accounts: AccountTemplate[]
  ): void => {
    // Check whether templates for this standard have already been seeded
    const existing = database
      .prepare('SELECT COUNT(*) AS cnt FROM account_templates WHERE standard = ?')
      .get(standard) as { cnt: number };

    if (existing.cnt > 0) {
      return; // Already seeded
    }

    const insert = database.prepare(`
      INSERT INTO account_templates (standard, code, name, account_type, parent_code, description)
      VALUES (@standard, @code, @name, @account_type, @parent_code, @description)
    `);

    for (const account of accounts) {
      insert.run({
        standard,
        code: account.code,
        name: account.name,
        account_type: account.account_type,
        parent_code: account.parent_code,
        description: account.description,
      });
    }
  };

  // Wrap all seed operations in a single transaction
  const seedAll = database.transaction(() => {
    seedStandard('czech', czechAccounts);
    seedStandard('ifrs', ifrsAccounts);
    seedStandard('usgaap', usgaapAccounts);
    seedStandard('general', generalAccounts);
  });

  seedAll();
}
