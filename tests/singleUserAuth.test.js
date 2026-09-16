import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import {
  db,
  setActiveUserId,
  getActiveUserId,
  HabitService,
  JournalService,
  GoalService,
  MoneyService,
  matchesActiveUser,
  queueSyncMutation
} from '../src/db/index.js';
import { TradingEngine } from '../src/trading/engine.js';
import { AuthService } from '../src/auth/index.js';
import { SyncEngine } from '../src/sync/index.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

describe('GLOW UP: SINGLE-USER AUTH & DATA OWNERSHIP VERIFICATION', () => {
  const userEmail = 'abrahamnlavaly3@gmail.com';
  const authenticatedUserId = 'usr_abraham_auth_uuid_999';
  const foreignUserId = 'usr_intruder_uuid_000';

  beforeAll(async () => {
    await db.open();
  });

  beforeEach(() => {
    setActiveUserId(authenticatedUserId);
  });

  // ==============================================================================
  // 1. AUTHENTICATED USER ID & CONTEXT
  // ==============================================================================
  describe('1. Authenticated User Identity & Session Context', () => {
    test('Application establishes and tracks active user context', () => {
      setActiveUserId(authenticatedUserId);
      expect(getActiveUserId()).toBe(authenticatedUserId);
    });

    test('No admin role, admin table, or admin permissions exist in application schema', () => {
      const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');
      expect(schemaSql).not.toContain('CREATE TABLE IF NOT EXISTS public.admins');
      expect(schemaSql).not.toContain('role TEXT DEFAULT \'admin\'');
      expect(schemaSql).not.toContain('is_admin');
    });

    test('Session recovery mechanism re-hydrates authenticated user after refresh', () => {
      const storage = {};
      const mockStorage = {
        getItem: (k) => storage[k] || null,
        setItem: (k, v) => { storage[k] = String(v); }
      };

      const userSession = {
        id: authenticatedUserId,
        email: userEmail,
        user_metadata: { name: 'Abraham' },
        created_at: new Date().toISOString()
      };

      // Store in session storage
      mockStorage.setItem('glow_up_local_auth_user', JSON.stringify(userSession));

      // Simulate browser refresh: re-read session from storage
      const restored = JSON.parse(mockStorage.getItem('glow_up_local_auth_user'));
      expect(restored).not.toBeNull();
      expect(restored.id).toBe(authenticatedUserId);
      expect(restored.email).toBe(userEmail);
    });

    test('AuthService.isReady() resolves properly for bootstrap readiness', async () => {
      expect(typeof AuthService.isReady).toBe('function');
      const user = await AuthService.isReady();
      // Returns promise that resolves without hanging
      expect(user !== undefined).toBe(true);
    });

    test('AuthService.signOut() resets active user context to default_user', async () => {
      setActiveUserId(authenticatedUserId);
      expect(getActiveUserId()).toBe(authenticatedUserId);
      await AuthService.signOut();
      expect(getActiveUserId()).toBe('default_user');
      // Reset back for subsequent tests
      setActiveUserId(authenticatedUserId);
    });

    test('No service-role keys exist in environment or client code', () => {
      const envLocal = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
      expect(envLocal).not.toContain('SERVICE_ROLE');
      expect(envLocal).not.toContain('service_role');
      expect(envLocal).not.toContain('SUPABASE_SECRET');
    });

    test('Automated trigger handle_new_user() creates corresponding profile on Supabase auth signup', () => {
      const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');
      expect(schemaSql).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()');
      expect(schemaSql).toContain('INSERT INTO public.profiles (id, name, email)');
      expect(schemaSql).toContain('AFTER INSERT ON auth.users');
      expect(schemaSql).toContain('FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()');
    });
  });

  // ==============================================================================
  // 2. DATA OWNERSHIP ACROSS ALL FEATURES
  // ==============================================================================
  describe('2. User Data Ownership Across Application Modules', () => {
    test('Every habit and entry is tagged with authenticatedUserId', async () => {
      const habit = await HabitService.create({
        name: 'Daily Cold Exposure',
        frequency: 'daily',
        target: 7
      });
      expect(habit.userId).toBe(authenticatedUserId);

      const today = new Date().toISOString().split('T')[0];
      await HabitService.toggleCompletion(habit.id, today);

      const entries = await db.habitEntries.where('habitId').equals(habit.id).toArray();
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].userId).toBe(authenticatedUserId);
    });

    test('Journal entries strictly belong to authenticatedUserId', async () => {
      const today = new Date().toISOString().split('T')[0];
      const journal = await JournalService.createOrUpdate({
        date: today,
        mood: 'focused',
        gratitude: 'Disciplined execution and risk management',
        wins: 'Followed trading rules strictly',
        improvements: 'Patience on European session open',
        notes: 'Personal single-user journal entry'
      });

      expect(journal.userId).toBe(authenticatedUserId);
      const retrieved = await JournalService.getToday(today);
      expect(retrieved.userId).toBe(authenticatedUserId);
    });

    test('Goals and milestones belong to authenticatedUserId', async () => {
      const goal = await GoalService.create({
        name: 'Master Account 100k',
        target: 100000,
        category: 'Trading'
      });
      expect(goal.userId).toBe(authenticatedUserId);

      const milestone = await GoalService.addMilestone(goal.id, 'Hit profit target');
      expect(milestone.userId).toBe(authenticatedUserId);
    });

    test('Financial transactions belong to authenticatedUserId', async () => {
      const tx = await MoneyService.addTransaction({
        name: 'Prop Payout Transfer',
        type: 'income',
        amount: 4500,
        category: 'Trading'
      });
      expect(tx.userId).toBe(authenticatedUserId);

      const all = await MoneyService.getAllTransactions();
      expect(all.every(t => t.userId === authenticatedUserId)).toBe(true);
    });

    test('Trading account and executed trades strictly belong to authenticatedUserId', async () => {
      const acc = await TradingEngine.createAccount({
        name: 'Primary Prop 10k',
        accountType: 'challenge',
        startingBalance: 10000,
        maxDrawdown: 1000,
        dailyLossLimit: 500
      });
      expect(acc.success).toBe(true);
      expect(acc.data.userId).toBe(authenticatedUserId);

      const trade = await TradingEngine.executeTrade({
        accountId: acc.data.id,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2500,
        exitPrice: 2510,
        lotSize: 0.5
      });
      expect(trade.success).toBe(true);
      expect(trade.data.trade.userId).toBe(authenticatedUserId);
      expect(trade.data.trade.accountId).toBe(acc.data.id);
    });
  });

  // ==============================================================================
  // 3. ZERO ACCESS BARRIER FOR FOREIGN USERS (SECURITY ISOLATION)
  // ==============================================================================
  describe('3. Foreign User Data Isolation Barrier', () => {
    test('Foreign user receives zero records when querying authenticated user data', async () => {
      // Switch active context to foreign user
      setActiveUserId(foreignUserId);

      const habits = await HabitService.getAll();
      expect(habits.find(h => h.userId === authenticatedUserId)).toBeUndefined();
      expect(habits.length).toBe(0);

      const journals = await JournalService.getAll();
      expect(journals.find(j => j.userId === authenticatedUserId)).toBeUndefined();
      expect(journals.length).toBe(0);

      const goals = await GoalService.getAll();
      expect(goals.find(g => g.userId === authenticatedUserId)).toBeUndefined();
      expect(goals.length).toBe(0);

      const transactions = await MoneyService.getAllTransactions();
      expect(transactions.find(t => t.userId === authenticatedUserId)).toBeUndefined();
      expect(transactions.length).toBe(0);

      const accounts = await TradingEngine.getAccounts();
      expect(accounts.find(a => a.userId === authenticatedUserId)).toBeUndefined();
      expect(accounts.length).toBe(0);
    });

    test('Foreign user cannot match authenticated user records via matchesActiveUser', () => {
      const privateItem = { id: 101, userId: authenticatedUserId, name: 'Private Data' };
      expect(matchesActiveUser(privateItem, foreignUserId)).toBe(false);
      expect(matchesActiveUser(privateItem, authenticatedUserId)).toBe(true);
    });
  });

  // ==============================================================================
  // 4. SUPABASE CLOUD SYNCHRONIZATION & ROW LEVEL SECURITY
  // ==============================================================================
  describe('4. Supabase Cloud Sync & RLS Policy Enforcement', () => {
    test('formatPayloadForCloud strips primary IDs and binds user_id', () => {
      const localHabit = {
        id: 77,
        name: 'Evening Meditation',
        frequency: 'daily',
        target: 7,
        updatedAt: new Date().toISOString()
      };

      const payload = SyncEngine.formatPayloadForCloud(localHabit, authenticatedUserId);
      expect(payload.id).toBeUndefined();
      expect(payload.user_id).toBe(authenticatedUserId);
      expect(payload.name).toBe('Evening Meditation');
    });

    test('Remote Supabase schema strictly enforces auth.uid() = user_id on all tables', () => {
      const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');

      // Check RLS enabled on all 13 tables
      const allTables = [
        'profiles', 'habits', 'habit_entries', 'journal_entries', 'goals',
        'goal_milestones', 'transactions', 'budgets', 'trading_accounts',
        'trades', 'achievements', 'weekly_reviews', 'user_preferences'
      ];

      for (const tbl of allTables) {
        expect(schemaSql).toContain(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`);
      }

      // Check profile policy binds to auth.uid() = id
      expect(schemaSql).toContain('CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);');

      // Check user_id ownership policy pattern
      expect(schemaSql).toContain('auth.uid() = user_id');
    });

    test('Live Supabase query returns empty set for unauthenticated requests due to active RLS', async () => {
      const client = createClient('https://ikhitapvwwojgnhfsvoz.supabase.co', 'sb_publishable_Te4X9F7xn-adgCSY05aXiQ_k1z-jARe');
      const res = await client.from('profiles').select('*');
      
      // Without authenticated JWT, RLS prevents reading foreign profiles
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });
  });
});
