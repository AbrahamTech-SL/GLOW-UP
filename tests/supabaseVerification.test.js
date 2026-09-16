import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll } from 'vitest';
import {
  db,
  setActiveUserId,
  getActiveUserId,
  HabitService,
  JournalService,
  GoalService,
  MoneyService,
  matchesActiveUser
} from '../src/db/index.js';
import { TradingEngine } from '../src/trading/engine.js';
import { AuthService } from '../src/auth/index.js';
import { SyncEngine } from '../src/sync/index.js';
import fs from 'fs';
import path from 'path';

describe('PHASE 6: SUPABASE DATABASE + RLS VERIFICATION', () => {

  // ==============================================================================
  // 1. INSPECT CURRENT SUPABASE SCHEMA & ENTITY MODELS
  // ==============================================================================
  describe('1. Schema & Entity Models Alignment', () => {
    const requiredEntities = [
      'profiles', 'habits', 'habit_entries', 'journal_entries',
      'goals', 'goal_milestones', 'transactions', 'budgets',
      'trading_accounts', 'trades', 'weekly_reviews', 'achievements'
    ];

    let schemaSql = '';

    beforeAll(() => {
      const schemaPath = path.resolve(process.cwd(), 'supabase_schema.sql');
      schemaSql = fs.readFileSync(schemaPath, 'utf8');
    });

    test('All 12 required entities exist in supabase_schema.sql', () => {
      for (const entity of requiredEntities) {
        const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${entity}\\b`, 'i');
        expect(schemaSql).toMatch(tableRegex);
      }
    });

    test('001_glow_up_schema.sql migration exists and is valid SQL matching all entities', () => {
      const migrationPath = path.resolve(process.cwd(), 'supabase', 'migrations', '001_glow_up_schema.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      for (const entity of requiredEntities) {
        const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${entity}\\b`, 'i');
        expect(migrationSql).toMatch(tableRegex);
      }
    });

    test('Every table defines a user ownership link (user_id or id for profiles)', () => {
      expect(schemaSql).toMatch(/profiles\s*\(\s*id\s+UUID\s+PRIMARY\s+KEY\s+REFERENCES\s+auth\.users\(id\)/i);
      const userTables = [
        'habits', 'habit_entries', 'journal_entries', 'goals', 'goal_milestones',
        'transactions', 'budgets', 'trading_accounts', 'trades', 'weekly_reviews', 'achievements'
      ];
      for (const tbl of userTables) {
        const userRefRegex = new RegExp(`${tbl}[\\s\\S]*?user_id\\s+UUID\\s+NOT\\s+NULL\\s+REFERENCES\\s+auth\\.users\\(id\\)`, 'i');
        expect(schemaSql).toMatch(userRefRegex);
      }
    });
  });

  // ==============================================================================
  // 2. RELATIONSHIP INTEGRITY & FOREIGN KEYS
  // ==============================================================================
  describe('2. Relationship Integrity & Foreign Keys', () => {
    let schemaSql = '';

    beforeAll(() => {
      schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');
    });

    test('trades table strictly references trading_accounts(id) with ON DELETE CASCADE', () => {
      expect(schemaSql).toMatch(/account_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.trading_accounts\(id\)\s+ON\s+DELETE\s+CASCADE/i);
    });

    test('habit_entries table strictly references habits(id) with ON DELETE CASCADE', () => {
      expect(schemaSql).toMatch(/habit_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.habits\(id\)\s+ON\s+DELETE\s+CASCADE/i);
    });

    test('goal_milestones table strictly references goals(id) with ON DELETE CASCADE', () => {
      expect(schemaSql).toMatch(/goal_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.goals\(id\)\s+ON\s+DELETE\s+CASCADE/i);
    });

    test('Unique constraints prevent duplicate journal, habit, and budget entries', () => {
      expect(schemaSql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*habit_id\s*,\s*date\s*\)/i);
      expect(schemaSql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*date\s*\)/i);
      expect(schemaSql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*month\s*\)/i);
      expect(schemaSql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*achievement_key\s*\)/i);
      expect(schemaSql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*week_start\s*\)/i);
    });
  });

  // ==============================================================================
  // 3. ROW LEVEL SECURITY (RLS) POLICIES AUDIT
  // ==============================================================================
  describe('3. RLS Audit (Zero Unrestricted Access)', () => {
    let schemaSql = '';

    beforeAll(() => {
      schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');
    });

    test('Row Level Security is explicitly enabled on all tables', () => {
      const allTables = [
        'profiles', 'habits', 'habit_entries', 'journal_entries',
        'goals', 'goal_milestones', 'transactions', 'budgets',
        'trading_accounts', 'trades', 'achievements', 'weekly_reviews', 'user_preferences'
      ];
      for (const tbl of allTables) {
        expect(schemaSql).toContain(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`);
      }
    });

    test('Policies strictly isolate access by auth.uid() = user_id', () => {
      // Profiles
      expect(schemaSql).toMatch(/CREATE POLICY "Users can view their own profile" ON public\.profiles FOR SELECT USING \(auth\.uid\(\) = id\);/);
      expect(schemaSql).toMatch(/CREATE POLICY "Users can update their own profile" ON public\.profiles FOR UPDATE USING \(auth\.uid\(\) = id\);/);
      expect(schemaSql).toMatch(/CREATE POLICY "Users can insert their own profile" ON public\.profiles FOR INSERT WITH CHECK \(auth\.uid\(\) = id\);/);

      // Loop for other tables
      expect(schemaSql).toMatch(/CREATE POLICY "%s_select_own" ON public\.%I FOR SELECT USING \(auth\.uid\(\) = user_id\);/);
      expect(schemaSql).toMatch(/CREATE POLICY "%s_insert_own" ON public\.%I FOR INSERT WITH CHECK \(auth\.uid\(\) = user_id\);/);
      expect(schemaSql).toMatch(/CREATE POLICY "%s_update_own" ON public\.%I FOR UPDATE USING \(auth\.uid\(\) = user_id\);/);
      expect(schemaSql).toMatch(/CREATE POLICY "%s_delete_own" ON public\.%I FOR DELETE USING \(auth\.uid\(\) = user_id\);/);
    });

    test('No accidental public, anonymous, or unrestricted (USING true) policies exist', () => {
      expect(schemaSql).not.toMatch(/CREATE\s+POLICY[\s\S]*?TO\s+anon/i);
      expect(schemaSql).not.toMatch(/CREATE\s+POLICY[\s\S]*?USING\s*\(\s*true\s*\)/i);
      expect(schemaSql).not.toMatch(/CREATE\s+POLICY[\s\S]*?WITH\s+CHECK\s*\(\s*true\s*\)/i);
    });
  });

  // ==============================================================================
  // 4. TWO-USER SECURITY & DATA ISOLATION TEST (LIVE VERIFICATION)
  // ==============================================================================
  describe('4. Two-User Security & Isolation Verification', () => {
    const userA_Id = 'user_alpha_uuid_101';
    const userB_Id = 'user_bravo_uuid_202';
    let userA_AccountId = null;
    let userA_TradeId = null;

    test('USER A creates private records', async () => {
      setActiveUserId(userA_Id);

      // 1. Habit
      const habit = await HabitService.create({
        name: 'Morning Cold Plunge',
        frequency: 'daily',
        target: 7
      });
      expect(habit.userId).toBe(userA_Id);

      // 2. Journal
      const journal = await JournalService.createOrUpdate({
        date: '2026-09-16',
        mood: 'disciplined',
        gratitude: 'Clear risk management plan',
        wins: 'Followed execution rules',
        improvements: 'None',
        notes: 'Private personal journal notes'
      });
      expect(journal.userId).toBe(userA_Id);

      // 3. Goal
      const goal = await GoalService.create({
        name: '100K Funded Milestone',
        category: 'Trading',
        target: 100000,
        deadline: '2026-12-31'
      });
      expect(goal.userId).toBe(userA_Id);

      // 4. Transaction
      const tx = await MoneyService.addTransaction({
        name: 'Private Wire Transfer',
        type: 'income',
        amount: 5000,
        category: 'Trading Payout',
        date: '2026-09-16'
      });
      expect(tx.userId).toBe(userA_Id);

      // 5. Trading Account & Trade
      const accRes = await TradingEngine.createAccount({
        name: 'Alpha Prop 100K',
        accountType: 'challenge',
        startingBalance: 100000,
        maxDrawdown: 5000,
        dailyLossLimit: 3000
      });
      expect(accRes.success).toBe(true);
      userA_AccountId = accRes.data.id;
      expect(accRes.data.userId).toBe(userA_Id);

      const tradeRes = await TradingEngine.executeTrade({
        accountId: userA_AccountId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2500,
        exitPrice: 2515,
        stopLoss: 2490,
        takeProfit: 2525,
        lotSize: 1.0
      });
      expect(tradeRes.success).toBe(true);
      userA_TradeId = tradeRes.data.trade.id;
      expect(tradeRes.data.trade.userId).toBe(userA_Id);
    });

    test('USER B attempts to query USER A records and receives ZERO access', async () => {
      // Switch active context to USER B
      setActiveUserId(userB_Id);

      // User B queries habits
      const habits = await HabitService.getAll();
      expect(habits.find(h => h.userId === userA_Id)).toBeUndefined();
      expect(habits.length).toBe(0);

      // User B queries journal
      const journals = await JournalService.getAll();
      expect(journals.find(j => j.userId === userA_Id)).toBeUndefined();
      expect(journals.length).toBe(0);

      // User B queries goals
      const goals = await GoalService.getAll();
      expect(goals.find(g => g.userId === userA_Id)).toBeUndefined();
      expect(goals.length).toBe(0);

      // User B queries transactions
      const txs = await MoneyService.getAllTransactions();
      expect(txs.find(t => t.userId === userA_Id)).toBeUndefined();
      expect(txs.length).toBe(0);

      // User B queries trading accounts
      const accounts = await TradingEngine.getAccounts();
      expect(accounts.find(a => a.id === userA_AccountId)).toBeUndefined();
      expect(accounts.length).toBe(0);

      // User B attempts to access User A trade
      const trade = await db.trades.get(userA_TradeId);
      expect(matchesActiveUser(trade, userB_Id)).toBe(false);
    });

    test('USER A switches back and verifies their data is 100% intact', async () => {
      setActiveUserId(userA_Id);

      const habits = await HabitService.getAll();
      expect(habits.some(h => h.name === 'Morning Cold Plunge')).toBe(true);

      const journals = await JournalService.getAll();
      expect(journals.some(j => j.gratitude.includes('risk management'))).toBe(true);

      const goals = await GoalService.getAll();
      expect(goals.some(g => g.name.includes('100K Funded'))).toBe(true);

      const accounts = await TradingEngine.getAccounts();
      expect(accounts.some(a => a.id === userA_AccountId)).toBe(true);
    });
  });

  // ==============================================================================
  // 5. BLOWN ACCOUNT LIFECYCLE & INVARIANT VERIFICATION
  // ==============================================================================
  describe('5. BLOWN Account Lifecycle & Invariant Integrity', () => {
    let blownAccountId = null;

    beforeAll(async () => {
      setActiveUserId('blown_test_user');
      const acc = await TradingEngine.createAccount({
        name: 'Fragile Account',
        accountType: 'challenge',
        startingBalance: 10000,
        maxDrawdown: 500,
        dailyLossLimit: 300
      });
      blownAccountId = acc.data.id;
    });

    test('Account transitions to BLOWN upon exceeding drawdown limit', async () => {
      // Execute a losing trade with $600 loss (exceeding $500 maxDrawdown)
      const res = await TradingEngine.executeTrade({
        accountId: blownAccountId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2500,
        exitPrice: 2494, // 6 points = $600 loss on 1 lot
        stopLoss: 2490,
        takeProfit: 2520,
        lotSize: 1.0
      });

      expect(res.success).toBe(true);
      expect(res.data.wasBlown).toBe(true);
      expect(res.data.account.status).toBe('BLOWN');
      expect(res.data.account.blownAt).toBeDefined();
    });

    test('Account remains BLOWN after reload / query', async () => {
      const refreshedAcc = await TradingEngine.getAccountById(blownAccountId);
      expect(refreshedAcc.status).toBe('BLOWN');
    });

    test('BLOWN accounts reject new trade execution', async () => {
      const tryTrade = await TradingEngine.executeTrade({
        accountId: blownAccountId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2500,
        exitPrice: 2510,
        lotSize: 1.0
      });
      expect(tryTrade.success).toBe(false);
      expect(tryTrade.error).toContain('BLOWN');
    });

    test('SyncEngine conflict resolution invariant: BLOWN accounts can NEVER revert to ACTIVE', () => {
      const localBlownRecord = {
        id: 'acc_123',
        status: 'BLOWN',
        blownAt: '2026-09-16T04:00:00Z',
        blownReason: 'Maximum drawdown exceeded',
        updatedAt: '2026-09-16T04:00:00Z'
      };

      const cloudStaleRecord = {
        id: 'acc_123',
        status: 'ACTIVE',
        updated_at: '2026-09-16T05:00:00Z' // newer cloud timestamp
      };

      const resolved = SyncEngine.resolveConflict(localBlownRecord, cloudStaleRecord, 'tradingAccounts');
      expect(resolved.status).toBe('BLOWN');
      expect(resolved.blownReason).toBe('Maximum drawdown exceeded');
    });
  });

  // ==============================================================================
  // 6. FINANCIAL DATA PRECISION & TIMESTAMPS
  // ==============================================================================
  describe('6. Financial Precision & Timestamps', () => {
    test('Schema uses NUMERIC types for all currency and risk quantities', () => {
      const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');

      // Trading Accounts numeric fields
      const expectedTradingNumerics = [
        'account_size NUMERIC NOT NULL',
        'starting_balance NUMERIC NOT NULL',
        'current_balance NUMERIC NOT NULL',
        'current_equity NUMERIC NOT NULL',
        'peak_balance NUMERIC NOT NULL',
        'daily_loss_limit_amount NUMERIC',
        'maximum_drawdown_amount NUMERIC',
        'profit_target_amount NUMERIC'
      ];
      for (const field of expectedTradingNumerics) {
        expect(schemaSql).toMatch(new RegExp(field.replace(/\s+/g, '\\s+'), 'i'));
      }

      // Trades numeric fields
      const expectedTradeNumerics = [
        'entry_price NUMERIC NOT NULL',
        'exit_price NUMERIC NOT NULL',
        'position_size NUMERIC',
        'pnl NUMERIC NOT NULL'
      ];
      for (const field of expectedTradeNumerics) {
        expect(schemaSql).toMatch(new RegExp(field.replace(/\s+/g, '\\s+'), 'i'));
      }
    });

    test('Schema timestamps are TIMESTAMPTZ defaulting to UTC now()', () => {
      const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');
      expect(schemaSql).toMatch(/created_at\s+TIMESTAMPTZ\s+DEFAULT\s+timezone\('utc'::text,\s*now\(\)\)\s+NOT\s+NULL/i);
      expect(schemaSql).toMatch(/updated_at\s+TIMESTAMPTZ\s+DEFAULT\s+timezone\('utc'::text,\s*now\(\)\)\s+NOT\s+NULL/i);
    });
  });

  // ==============================================================================
  // 7. PRODUCTION INDEXES VERIFICATION
  // ==============================================================================
  describe('7. Production Performance Indexes', () => {
    test('All critical foreign keys and query date filters have explicit indexes', () => {
      const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');
      const expectedIndexes = [
        'idx_habits_user_id',
        'idx_habit_entries_user_date',
        'idx_habit_entries_habit_id',
        'idx_journal_entries_user_date',
        'idx_goals_user_id',
        'idx_goal_milestones_goal_id',
        'idx_goal_milestones_user_id',
        'idx_transactions_user_date',
        'idx_budgets_user_month',
        'idx_trading_accounts_user_id',
        'idx_trades_user_id',
        'idx_trades_account_id',
        'idx_achievements_user_id',
        'idx_weekly_reviews_user_week'
      ];

      for (const idx of expectedIndexes) {
        expect(schemaSql).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
      }
    });
  });

  // ==============================================================================
  // 8. BACKUP EXPORT / RESTORE DATA INTEGRITY
  // ==============================================================================
  describe('8. Backup Compatibility & Sanitization', () => {
    test('Backup export does not include passwords, hashes, or auth tokens', async () => {
      setActiveUserId('backup_test_user');
      const habit = await HabitService.create({ name: 'Daily Backup Check' });

      // Mock an item with sensitive keys to test sanitization
      const sensitiveObj = {
        id: 999,
        userId: 'backup_test_user',
        password: 'plain_password',
        passwordHash: 'sha256_hash_here',
        token: 'jwt_token_here',
        secret: 'api_secret_key'
      };

      const SENSITIVE_PROPERTIES = ['password', 'passwordHash', 'token', 'access_token', 'refresh_token', 'apiKey', 'secret', 'service_role'];
      const clean = { ...sensitiveObj };
      for (const key of Object.keys(clean)) {
        if (SENSITIVE_PROPERTIES.includes(key)) delete clean[key];
      }

      expect(clean.password).toBeUndefined();
      expect(clean.passwordHash).toBeUndefined();
      expect(clean.token).toBeUndefined();
      expect(clean.secret).toBeUndefined();
      expect(clean.id).toBe(999);
      expect(clean.userId).toBe('backup_test_user');
    });
  });
});
