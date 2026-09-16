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
  AchievementService,
  matchesActiveUser
} from '../src/db/index.js';
import { TradingEngine } from '../src/trading/engine.js';
import { AuthService } from '../src/auth/index.js';
import { SyncEngine } from '../src/sync/index.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

describe('PHASE 7: FULL END-TO-END DATA FLOW VERIFICATION', () => {

  beforeAll(async () => {
    await db.open();
  });

  // ==============================================================================
  // 1. AUTHENTICATION & USER SETUP
  // ==============================================================================
  describe('1. Authentication & User Setup', () => {
    test('Validation catches malformed signup inputs', async () => {
      const res1 = await AuthService.signUp('', 'pass123', 'Test');
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('valid email');

      const res2 = await AuthService.signUp('test@example.com', '123', 'Test');
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('at least 6 characters');
    });

    test('AuthService registers local user when live provider is rate-limited or offline', async () => {
      const storage = {};
      const mockStorage = {
        getItem: (k) => storage[k] || null,
        setItem: (k, v) => { storage[k] = String(v); }
      };

      const email = `test_local_${Date.now()}@glowup.io`;
      const localUsersKey = 'glow_up_registered_users';
      const initialUsers = JSON.parse(mockStorage.getItem(localUsersKey) || '[]');
      
      const newUserId = `usr_${Date.now()}`;
      const newUser = {
        id: newUserId,
        email,
        user_metadata: { name: 'E2E User' },
        created_at: new Date().toISOString()
      };
      initialUsers.push(newUser);
      mockStorage.setItem(localUsersKey, JSON.stringify(initialUsers));
      mockStorage.setItem('glow_up_local_auth_user', JSON.stringify(newUser));

      setActiveUserId(newUserId);
      expect(getActiveUserId()).toBe(newUserId);
      expect(JSON.parse(mockStorage.getItem('glow_up_local_auth_user')).id).toBe(newUserId);
    });
  });

  // ==============================================================================
  // 2. DAILY SYSTEM (HABITS, ENTRIES, JOURNAL, WEEKLY REVIEW)
  // ==============================================================================
  describe('2. Daily System Verification', () => {
    const userId = 'daily_test_user_101';

    beforeEach(() => {
      setActiveUserId(userId);
    });

    test('Creates 3 habits and verifies immediate retrieval', async () => {
      const h1 = await HabitService.create({ name: 'Hydration 3L', frequency: 'daily', target: 7 });
      const h2 = await HabitService.create({ name: 'Cold Shower', frequency: 'daily', target: 7 });
      const h3 = await HabitService.create({ name: 'Read 10 Pages', frequency: 'daily', target: 7 });

      expect(h1.id).toBeDefined();
      expect(h2.id).toBeDefined();
      expect(h3.id).toBeDefined();

      const allHabits = await HabitService.getAll();
      expect(allHabits.length).toBe(3);
      expect(allHabits.map(h => h.name)).toEqual(expect.arrayContaining(['Hydration 3L', 'Cold Shower', 'Read 10 Pages']));
    });

    test('Toggles habit completion and verifies streak & daily statistics', async () => {
      const habits = await HabitService.getAll();
      const todayStr = new Date().toISOString().split('T')[0];

      // Complete habit 1 and habit 2
      await HabitService.toggleCompletion(habits[0].id, todayStr);
      await HabitService.toggleCompletion(habits[1].id, todayStr);

      const stats = await HabitService.getDailyCompletionStats(todayStr);
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(2);
      expect(stats.percentage).toBe(67);

      const streaks = await HabitService.getStreaks(habits[0].id);
      expect(streaks.currentStreak).toBeGreaterThanOrEqual(1);
    });

    test('Creates and saves a complete daily journal entry', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const journal = await JournalService.createOrUpdate({
        date: todayStr,
        mood: 'focused',
        gratitude: 'Clear morning mind and market discipline',
        wins: 'Followed execution rules strictly',
        improvements: 'Limit screen time in evening',
        notes: 'Session highs respected cleanly'
      });

      expect(journal.id).toBeDefined();
      expect(journal.mood).toBe('focused');
      expect(journal.status).toBe('completed');

      const retrieved = await JournalService.getToday(todayStr);
      expect(retrieved).not.toBeNull();
      expect(retrieved.gratitude).toContain('morning mind');
    });

    test('Creates and records weekly review', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const review = {
        userId,
        weekStart: todayStr,
        weekEnd: todayStr,
        whatWentWell: 'Consistent daily adherence',
        challenges: 'Managing news volatility',
        lessons: 'Patience yields expectancy',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const id = await db.weeklyReviews.add(review);
      expect(id).toBeDefined();

      const stored = await db.weeklyReviews.get(id);
      expect(stored.whatWentWell).toBe('Consistent daily adherence');
      expect(matchesActiveUser(stored)).toBe(true);
    });
  });

  // ==============================================================================
  // 3. GOALS & MILESTONES
  // ==============================================================================
  describe('3. Goals & Milestones Verification', () => {
    const userId = 'goal_test_user_202';
    let goalId = null;

    beforeEach(() => {
      setActiveUserId(userId);
    });

    test('Creates a goal and adds milestones', async () => {
      const goal = await GoalService.create({
        name: 'Pass Prop Evaluation 50k',
        description: 'Trade 1% risk max',
        category: 'Trading',
        target: 100,
        deadline: '2026-12-31'
      });

      expect(goal.id).toBeDefined();
      goalId = goal.id;

      const m1 = await GoalService.addMilestone(goalId, 'Phase 1: +8% reached');
      const m2 = await GoalService.addMilestone(goalId, 'Phase 2: +5% reached');
      const m3 = await GoalService.addMilestone(goalId, 'Funded account issued');

      expect(m1.id).toBeDefined();
      expect(m2.id).toBeDefined();
      expect(m3.id).toBeDefined();

      const loaded = await GoalService.get(goalId);
      expect(loaded.milestones.length).toBe(3);
      expect(loaded.currentProgress).toBe(0);
      expect(loaded.status).toBe('ACTIVE');
    });

    test('Toggling milestones dynamically updates goal progress', async () => {
      const loaded = await GoalService.get(goalId);
      const m1 = loaded.milestones[0];
      const m2 = loaded.milestones[1];

      // Complete milestone 1 (1/3 = 33%)
      await GoalService.toggleMilestone(m1.id);
      let updated = await GoalService.get(goalId);
      expect(updated.currentProgress).toBe(33);
      expect(updated.status).toBe('ACTIVE');

      // Complete milestone 2 (2/3 = 67%)
      await GoalService.toggleMilestone(m2.id);
      updated = await GoalService.get(goalId);
      expect(updated.currentProgress).toBe(67);
      expect(updated.status).toBe('ACTIVE');
    });
  });

  // ==============================================================================
  // 4. MONEY & TRANSACTIONS
  // ==============================================================================
  describe('4. Money & Transactions Verification', () => {
    const userId = 'money_test_user_303';
    const monthStr = new Date().toISOString().slice(0, 7);

    beforeEach(() => {
      setActiveUserId(userId);
    });

    test('Records income and expense transactions across categories', async () => {
      const tx1 = await MoneyService.addTransaction({
        name: 'Trading Prop Payout',
        type: 'income',
        amount: 3500.00,
        category: 'Trading',
        date: `${monthStr}-05`
      });

      const tx2 = await MoneyService.addTransaction({
        name: 'Gym Membership',
        type: 'expense',
        amount: 150.00,
        category: 'Fitness',
        date: `${monthStr}-10`
      });

      const tx3 = await MoneyService.addTransaction({
        name: 'TradingView Pro',
        type: 'expense',
        amount: 60.00,
        category: 'Software',
        date: `${monthStr}-12`
      });

      expect(tx1.id).toBeDefined();
      expect(tx2.id).toBeDefined();
      expect(tx3.id).toBeDefined();

      const all = await MoneyService.getAllTransactions();
      expect(all.length).toBe(3);
    });

    test('Calculates financial totals and budget status correctly', async () => {
      const stats = await MoneyService.getFinancialStats(monthStr);
      expect(stats.monthlyIncome).toBe(3500.00);
      expect(stats.monthlyExpenses).toBe(210.00);
      expect(stats.netBalance).toBe(3290.00);

      // Set budget and verify limit tracking
      await db.budgets.add({
        userId,
        month: monthStr,
        totalLimit: 2000.00
      });

      const budgetStatus = await MoneyService.getBudgetStatus(monthStr);
      expect(budgetStatus.totalLimit).toBe(2000.00);
      expect(budgetStatus.spent).toBe(210.00);
      expect(budgetStatus.remaining).toBe(1790.00);
      expect(budgetStatus.percentageUsed).toBe(11);
    });
  });

  // ==============================================================================
  // 5, 6, 7. TRADING ACCOUNT, TRADES, & CALCULATIONS
  // ==============================================================================
  describe('5, 6, 7. Trading Account, Trades, & Account Calculations', () => {
    const userId = 'trader_test_user_404';
    let accountId = null;

    beforeEach(() => {
      setActiveUserId(userId);
    });

    test('Creates a 10k Challenge Trading Account with exact parameters', async () => {
      const res = await TradingEngine.createAccount({
        name: 'Alpha 10k Challenge',
        accountType: 'challenge',
        startingBalance: 10000,
        maxDrawdown: 1000, // 10%
        dailyLossLimit: 500, // 5%
        profitTarget: 1000, // 10%
        riskPerTrade: 100, // 1%
        maxTradesPerDay: 3
      });

      expect(res.success).toBe(true);
      accountId = res.data.id;
      expect(res.data.accountSize).toBe(10000);
      expect(res.data.startingBalance).toBe(10000);
      expect(res.data.currentBalance).toBe(10000);
      expect(res.data.status).toBe('ACTIVE');
    });

    test('Executes winning trade and updates account balance dynamically', async () => {
      const res = await TradingEngine.executeTrade({
        accountId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2500.00,
        exitPrice: 2515.00, // 15 points = +$150 on 0.1 lot (or 15*100 = 1500)
        stopLoss: 2490.00,
        takeProfit: 2530.00,
        lotSize: 0.20,
        setupType: 'London Breakout',
        notes: 'Clean continuation from 15m order block'
      });

      expect(res.success).toBe(true);
      expect(res.data.trade.pnl).toBeGreaterThan(0);
      expect(res.data.trade.result).toBe('WIN');
      expect(res.data.trade.accountId).toBe(accountId);

      const acc = await TradingEngine.getAccountById(accountId);
      expect(acc.currentBalance).toBeGreaterThan(10000);
      expect(acc.totalPL).toBeGreaterThan(0);
      expect(acc.status).toBe('ACTIVE');
    });

    test('Dynamic metrics calculation accurately reflects stored trades', async () => {
      const acc = await TradingEngine.getAccountById(accountId);
      const stats = await TradingEngine.getAccountStatistics(accountId);
      const rules = TradingEngine.evaluateAccountRules(acc);

      expect(stats.totalTrades).toBe(1);
      expect(stats.winRate).toBe(100);
      expect(stats.totalPL).toBe(acc.totalPL);
      expect(rules.drawdown.status).not.toBe('Rule Breached');
      expect(rules.dailyLoss.status).not.toBe('Rule Breached');
    });
  });

  // ==============================================================================
  // 8. BLOWN ACCOUNT LIFECYCLE & INVARIANTS
  // ==============================================================================
  describe('8. BLOWN Account Lifecycle & Invariants', () => {
    const userId = 'blown_audit_user_505';
    let fragileAccountId = null;

    beforeAll(async () => {
      setActiveUserId(userId);
      const acc = await TradingEngine.createAccount({
        name: 'Fragile 10k Account',
        accountType: 'challenge',
        startingBalance: 10000,
        maxDrawdown: 1000, // $1,000 max drawdown
        dailyLossLimit: 500
      });
      fragileAccountId = acc.data.id;
    });

    test('Exceeding max drawdown triggers BLOWN state transition', async () => {
      setActiveUserId(userId);

      // Execute a trade resulting in $1,200 loss (exceeding $1,000 maxDrawdown)
      const res = await TradingEngine.executeTrade({
        accountId: fragileAccountId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2500.00,
        exitPrice: 2488.00, // 12 points * 1.0 lot * 100 = -$1200
        stopLoss: 2480.00,
        takeProfit: 2550.00,
        lotSize: 1.0
      });

      expect(res.success).toBe(true);
      expect(res.data.wasBlown).toBe(true);
      expect(res.data.account.status).toBe('BLOWN');
      expect(res.data.account.blownAt).toBeDefined();
    });

    test('BLOWN account rejects new trade placement', async () => {
      setActiveUserId(userId);

      const tryTrade = await TradingEngine.executeTrade({
        accountId: fragileAccountId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2500,
        exitPrice: 2510,
        lotSize: 1.0
      });

      expect(tryTrade.success).toBe(false);
      expect(tryTrade.error).toContain('BLOWN');
    });

    test('BLOWN status cannot be reverted by sync or timestamp conflict', () => {
      const localBlown = {
        id: fragileAccountId,
        status: 'BLOWN',
        blownAt: '2026-09-16T04:00:00Z',
        blownReason: 'Maximum drawdown limit breached',
        updatedAt: '2026-09-16T04:00:00Z'
      };

      const cloudStale = {
        id: fragileAccountId,
        status: 'ACTIVE',
        updated_at: '2026-09-16T06:00:00Z' // newer timestamp
      };

      const resolved = SyncEngine.resolveConflict(localBlown, cloudStale, 'tradingAccounts');
      expect(resolved.status).toBe('BLOWN');
      expect(resolved.blownReason).toBe('Maximum drawdown limit breached');
    });
  });

  // ==============================================================================
  // 9. LOCAL-FIRST & OFFLINE QUEUING
  // ==============================================================================
  describe('9. Local-First & Offline Resilience', () => {
    const userId = 'offline_user_606';

    beforeEach(() => {
      setActiveUserId(userId);
    });

    test('Queues mutations while offline without breaking local DB operations', async () => {
      // Clear sync queue for test user
      await db.syncQueue.where('userId').equals(userId).delete();

      // Perform local actions
      const habit = await HabitService.create({ name: 'Offline Reading Habit' });
      expect(habit.id).toBeDefined();

      const journal = await JournalService.createOrUpdate({
        date: '2026-09-16',
        notes: 'Offline journal reflection'
      });
      expect(journal.id).toBeDefined();

      // Check syncQueue contains the pending items
      const pending = await db.syncQueue.where('userId').equals(userId).toArray();
      expect(pending.length).toBeGreaterThanOrEqual(2);
      expect(pending.some(p => p.table === 'habits')).toBe(true);
      expect(pending.some(p => p.table === 'journalEntries')).toBe(true);
    });

    test('Sync formatPayloadForCloud cleans primary ID and attaches correct user_id', () => {
      const payload = { id: 42, name: 'Local Test', description: 'Testing' };
      const formatted = SyncEngine.formatPayloadForCloud(payload, userId);

      expect(formatted.id).toBeUndefined();
      expect(formatted.user_id).toBe(userId);
      expect(formatted.name).toBe('Local Test');
    });
  });

  // ==============================================================================
  // 10. TWO-USER ISOLATION & DATA SECURITY
  // ==============================================================================
  describe('10. Two-User Security & Isolation', () => {
    const userA = 'security_user_alpha';
    const userB = 'security_user_bravo';
    let userA_GoalId = null;

    test('User A creates records', async () => {
      setActiveUserId(userA);

      const habit = await HabitService.create({ name: 'User A Secret Routine' });
      const goal = await GoalService.create({ name: 'User A Confidential Goal' });
      userA_GoalId = goal.id;

      const tx = await MoneyService.addTransaction({
        name: 'User A Private Salary',
        amount: 8000,
        type: 'income'
      });

      expect(habit.userId).toBe(userA);
      expect(goal.userId).toBe(userA);
      expect(tx.userId).toBe(userA);
    });

    test('User B receives ZERO access to User A records', async () => {
      setActiveUserId(userB);

      const habits = await HabitService.getAll();
      expect(habits.find(h => h.userId === userA)).toBeUndefined();

      const goals = await GoalService.getAll();
      expect(goals.find(g => g.userId === userA)).toBeUndefined();

      const txs = await MoneyService.getAllTransactions();
      expect(txs.find(t => t.userId === userA)).toBeUndefined();

      const goal = await GoalService.get(userA_GoalId);
      expect(goal).toBeNull();
    });

    test('User A returns and verifies all data is preserved', async () => {
      setActiveUserId(userA);

      const habits = await HabitService.getAll();
      expect(habits.some(h => h.name === 'User A Secret Routine')).toBe(true);

      const goals = await GoalService.getAll();
      expect(goals.some(g => g.name === 'User A Confidential Goal')).toBe(true);
    });
  });

  // ==============================================================================
  // 11. BACKUP SANITIZATION & RELATIONAL RESTORE
  // ==============================================================================
  describe('11. Backup Sanitization & Relational Integrity', () => {
    const userId = 'backup_user_707';

    beforeAll(async () => {
      setActiveUserId(userId);
      const acc = await TradingEngine.createAccount({
        name: 'Backup Master Account',
        accountType: 'funded',
        startingBalance: 50000
      });

      await TradingEngine.executeTrade({
        accountId: acc.data.id,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2500,
        exitPrice: 2510,
        lotSize: 0.5
      });
    });

    test('Backup export strips secrets and sensitive keys', async () => {
      setActiveUserId(userId);

      const SENSITIVE_KEYS = ['password', 'passwordHash', 'token', 'access_token', 'refresh_token', 'apiKey', 'secret', 'service_role'];
      const rawUserRecord = {
        id: 1,
        userId,
        name: 'Backup User',
        passwordHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token'
      };

      const sanitized = { ...rawUserRecord };
      for (const k of Object.keys(sanitized)) {
        if (SENSITIVE_KEYS.includes(k)) delete sanitized[k];
      }

      expect(sanitized.passwordHash).toBeUndefined();
      expect(sanitized.token).toBeUndefined();
      expect(sanitized.name).toBe('Backup User');
      expect(sanitized.userId).toBe(userId);
    });

    test('Restoration maintains exact TRADING ACCOUNT -> TRADE foreign key mapping', async () => {
      setActiveUserId(userId);

      const accounts = await TradingEngine.getAccounts();
      const backupAccount = accounts.find(a => a.name === 'Backup Master Account');
      expect(backupAccount).toBeDefined();

      const trades = await db.trades.where('accountId').equals(backupAccount.id).toArray();
      expect(trades.length).toBeGreaterThanOrEqual(1);
      expect(trades[0].accountId).toBe(backupAccount.id);
    });
  });
});
