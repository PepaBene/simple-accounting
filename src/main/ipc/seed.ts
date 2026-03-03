import { ipcMain } from 'electron';
import { getDb } from '../database/connection';

interface AccountRow {
  id: number;
  code: string;
  name: string;
  account_type: string;
  description: string | null;
  is_active: number;
}

/**
 * Find an account by type and keyword match (searches name and description).
 * Falls back to the first account of the given type if no keyword matches.
 */
function findAccount(accounts: AccountRow[], type: string, keywords: string[]): AccountRow | undefined {
  const pool = accounts.filter(a => a.account_type === type);
  for (const kw of keywords) {
    const found = pool.find(
      a =>
        a.name.toLowerCase().includes(kw.toLowerCase()) ||
        (a.description || '').toLowerCase().includes(kw.toLowerCase()),
    );
    if (found) return found;
  }
  return pool[0];
}

export function registerSeedHandlers(): void {
  ipcMain.handle('seed:mockEntries', (_event, workbookId: number) => {
    try {
      const db = getDb();

      // Load all active accounts for this workbook
      const accounts = db
        .prepare('SELECT id, code, name, account_type, description, is_active FROM accounts WHERE workbook_id = ? AND is_active = 1 ORDER BY code')
        .all(workbookId) as AccountRow[];

      if (accounts.length === 0) {
        return {
          success: false,
          error: 'Nejprve načtěte šablonu účtového rozvrhu.',
        };
      }

      // Find accounts by purpose – works across Czech, General, IFRS, US GAAP
      const bank = findAccount(accounts, 'asset', ['Bankovní', 'Banka', 'bank', 'Peněžní prostředky na bank']);
      const cash = findAccount(accounts, 'asset', ['Pokladna', 'hotovost', 'cash']);
      const equipment = findAccount(accounts, 'asset', ['Vybavení', 'zařízení', 'Hmotné', 'Stroj', 'Samostatné', 'equipment']);
      const receivables = findAccount(accounts, 'asset', ['Odběratel', 'Pohledávk', 'receivabl']);
      const inventory = findAccount(accounts, 'asset', ['Materiál', 'materiál', 'Zásob', 'sklad']);
      const depreciation = findAccount(accounts, 'asset', ['Oprávk', 'odpis', 'deprec', 'Kumulované odpisy']);

      const payables = findAccount(accounts, 'liability', ['Dodavatel', 'Závazky z obch', 'payable']);
      const wagesPayable = findAccount(accounts, 'liability', ['Zaměstnanc', 'mzd', 'wage', 'Závazky vůči zam', 'Nevyplacené']);
      const socialPayable = findAccount(accounts, 'liability', ['Sociální', 'pojištění', 'social', 'OSSZ']);
      const longTermLoan = findAccount(accounts, 'liability', ['Dlouhodobé', 'úvěr', 'loan', 'Bankovní úvěr']);

      const capital = findAccount(accounts, 'equity', ['Základní kapitál', 'Kapitál', 'capital', 'Vklad']);

      const salesServices = findAccount(accounts, 'revenue', ['služby', 'Tržby za služby', 'service']);
      const salesGoods = findAccount(accounts, 'revenue', ['zboží', 'Tržby za zboží', 'goods', 'prodej']);
      const interestRevenue = findAccount(accounts, 'revenue', ['Úrok', 'interest', 'finanční výnos']);

      const materialExpense = findAccount(accounts, 'expense', ['Spotřeba materiál', 'materiálu', 'Spotřeba', 'Náklady na prod']);
      const wageExpense = findAccount(accounts, 'expense', ['Mzd', 'plat', 'wage', 'salary']);
      const socialExpense = findAccount(accounts, 'expense', ['Sociální', 'pojištění', 'social']);
      const rentExpense = findAccount(accounts, 'expense', ['Nájemné', 'Nájem', 'rent', 'Ostatní služby']);
      const depreciationExpense = findAccount(accounts, 'expense', ['Odpis', 'deprec', 'amort']);
      const interestExpense = findAccount(accounts, 'expense', ['Úrok', 'interest', 'finanční náklad']);

      // We need at least a bank/cash account and capital account
      const mainCash = bank || cash;
      if (!mainCash) {
        return {
          success: false,
          error: 'Nelze najít účet pro peněžní prostředky. Načtěte šablonu účtového rozvrhu.',
        };
      }

      const insertEntry = db.prepare(
        'INSERT INTO journal_entries (workbook_id, entry_date, description, reference) VALUES (?, ?, ?, ?)',
      );
      const insertLine = db.prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)',
      );

      const insertAll = db.transaction(() => {
        let count = 0;

        function addEntry(
          date: string,
          desc: string,
          ref: string,
          lines: Array<{ accountId: number; debit: number; credit: number }>,
        ): void {
          const result = insertEntry.run(workbookId, date, desc, ref);
          const entryId = result.lastInsertRowid;
          for (const line of lines) {
            insertLine.run(entryId, line.accountId, line.debit, line.credit, null);
          }
          count++;
        }

        // 1. Owner capital contribution
        if (capital) {
          addEntry('2026-01-02', 'Vklad základního kapitálu', 'VKL-001', [
            { accountId: mainCash.id, debit: 500000, credit: 0 },
            { accountId: capital.id, debit: 0, credit: 500000 },
          ]);
        }

        // 2. Purchase of equipment
        if (equipment) {
          addEntry('2026-01-05', 'Nákup vybavení kanceláře', 'FAP-001', [
            { accountId: equipment.id, debit: 120000, credit: 0 },
            { accountId: mainCash.id, debit: 0, credit: 120000 },
          ]);
        }

        // 3. Long-term loan received
        if (longTermLoan) {
          addEntry('2026-01-10', 'Přijatý bankovní úvěr', 'UV-001', [
            { accountId: mainCash.id, debit: 200000, credit: 0 },
            { accountId: longTermLoan.id, debit: 0, credit: 200000 },
          ]);
        }

        // 4. Sales of services – invoice
        if (salesServices && receivables) {
          addEntry('2026-01-15', 'Tržby za služby – leden', 'FV-001', [
            { accountId: receivables.id, debit: 85000, credit: 0 },
            { accountId: salesServices.id, debit: 0, credit: 85000 },
          ]);
        }

        // 5. Purchase of materials
        if (materialExpense && payables) {
          addEntry('2026-01-20', 'Nákup materiálu', 'FAP-002', [
            { accountId: materialExpense.id, debit: 18000, credit: 0 },
            { accountId: payables.id, debit: 0, credit: 18000 },
          ]);
        }

        // 6. Office supplies – cash
        if (materialExpense && cash && cash.id !== mainCash.id) {
          addEntry('2026-01-25', 'Nákup kancelářských potřeb', 'FAP-003', [
            { accountId: materialExpense.id, debit: 3500, credit: 0 },
            { accountId: cash.id, debit: 0, credit: 3500 },
          ]);
        } else if (materialExpense) {
          addEntry('2026-01-25', 'Nákup kancelářských potřeb', 'FAP-003', [
            { accountId: materialExpense.id, debit: 3500, credit: 0 },
            { accountId: mainCash.id, debit: 0, credit: 3500 },
          ]);
        }

        // 7. Wages
        if (wageExpense && wagesPayable) {
          addEntry('2026-01-31', 'Mzdy zaměstnanců – leden', 'MZD-001', [
            { accountId: wageExpense.id, debit: 65000, credit: 0 },
            { accountId: wagesPayable.id, debit: 0, credit: 65000 },
          ]);
        }

        // 8. Social & health insurance
        if (socialExpense && socialPayable) {
          addEntry('2026-01-31', 'Sociální a zdravotní pojištění – zaměstnavatel', 'POJ-001', [
            { accountId: socialExpense.id, debit: 22100, credit: 0 },
            { accountId: socialPayable.id, debit: 0, credit: 22100 },
          ]);
        }

        // 9. Rent
        if (rentExpense && payables) {
          addEntry('2026-01-31', 'Nájem kanceláře – leden', 'FAP-004', [
            { accountId: rentExpense.id, debit: 15000, credit: 0 },
            { accountId: payables.id, debit: 0, credit: 15000 },
          ]);
        }

        // 10. Depreciation
        if (depreciationExpense && depreciation) {
          addEntry('2026-01-31', 'Odpisy vybavení – leden', 'ODP-001', [
            { accountId: depreciationExpense.id, debit: 2000, credit: 0 },
            { accountId: depreciation.id, debit: 0, credit: 2000 },
          ]);
        }

        // 11. Customer payment
        if (receivables) {
          addEntry('2026-02-05', 'Úhrada od odběratele', 'BV-001', [
            { accountId: mainCash.id, debit: 85000, credit: 0 },
            { accountId: receivables.id, debit: 0, credit: 85000 },
          ]);
        }

        // 12. More sales
        if (salesServices && receivables) {
          addEntry('2026-02-10', 'Tržby za služby – únor', 'FV-002', [
            { accountId: receivables.id, debit: 95000, credit: 0 },
            { accountId: salesServices.id, debit: 0, credit: 95000 },
          ]);
        }

        // 13. Goods sales
        if (salesGoods && receivables) {
          addEntry('2026-02-15', 'Tržby za zboží', 'FV-003', [
            { accountId: receivables.id, debit: 42000, credit: 0 },
            { accountId: salesGoods.id, debit: 0, credit: 42000 },
          ]);
        }

        // 14. Pay supplier
        if (payables) {
          addEntry('2026-02-20', 'Úhrada závazku dodavateli', 'BV-002', [
            { accountId: payables.id, debit: 33000, credit: 0 },
            { accountId: mainCash.id, debit: 0, credit: 33000 },
          ]);
        }

        // 15. Pay wages
        if (wagesPayable) {
          addEntry('2026-02-25', 'Výplata mezd', 'BV-003', [
            { accountId: wagesPayable.id, debit: 65000, credit: 0 },
            { accountId: mainCash.id, debit: 0, credit: 65000 },
          ]);
        }

        // 16. February wages
        if (wageExpense && wagesPayable) {
          addEntry('2026-02-28', 'Mzdy zaměstnanců – únor', 'MZD-002', [
            { accountId: wageExpense.id, debit: 65000, credit: 0 },
            { accountId: wagesPayable.id, debit: 0, credit: 65000 },
          ]);
        }

        // 17. February rent
        if (rentExpense && payables) {
          addEntry('2026-02-28', 'Nájem kanceláře – únor', 'FAP-005', [
            { accountId: rentExpense.id, debit: 15000, credit: 0 },
            { accountId: payables.id, debit: 0, credit: 15000 },
          ]);
        }

        // 18. February depreciation
        if (depreciationExpense && depreciation) {
          addEntry('2026-02-28', 'Odpisy vybavení – únor', 'ODP-002', [
            { accountId: depreciationExpense.id, debit: 2000, credit: 0 },
            { accountId: depreciation.id, debit: 0, credit: 2000 },
          ]);
        }

        // 19. Interest expense
        if (interestExpense) {
          addEntry('2026-02-28', 'Úroky z bankovního úvěru', 'BV-004', [
            { accountId: interestExpense.id, debit: 1500, credit: 0 },
            { accountId: mainCash.id, debit: 0, credit: 1500 },
          ]);
        }

        // 20. Interest revenue
        if (interestRevenue) {
          addEntry('2026-02-28', 'Úroky z bankovního účtu', 'BV-005', [
            { accountId: mainCash.id, debit: 250, credit: 0 },
            { accountId: interestRevenue.id, debit: 0, credit: 250 },
          ]);
        }

        return count;
      });

      const count = insertAll();
      return { success: true, data: { count } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
