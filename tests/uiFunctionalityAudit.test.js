import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import {
  db,
  seedInitialData,
  cleanResetUserData,
  getActiveUserId,
  setActiveUserId,
  HabitService,
  JournalService,
  GoalService,
  MoneyService,
  AchievementService,
  matchesActiveUser
} from '../src/db/index.js';
import { TradingEngine } from '../src/trading/engine.js';
import { screensData } from '../src/screens/screensData.js';

describe('GLOW UP UI FUNCTIONALITY AUDIT & LIFECYCLE TESTS', () => {
  beforeAll(async () => {
    await db.open();
  });

  beforeEach(async () => {
    // Reset to completely clean personal state before each test
    const uid = getActiveUserId();
    await cleanResetUserData(uid);
    await seedInitialData();
  });

  // =========================================================================
  // 1. CLEAN PERSONAL APP BASELINE
  // =========================================================================
  describe('1. Clean Personal App Baseline', () => {
    test('User starts with exactly zero personal entries', async () => {
      const habits = await HabitService.getAll(false);
      const journals = await JournalService.getAll();
      const goals = await GoalService.getAll();
      const transactions = await MoneyService.getAllTransactions();
      const { active, blown } = await TradingEngine.getAccountsPartitioned();
      const trades = await db.trades.toArray();
      const weeklyReviews = await db.weeklyReviews.toArray();

      expect(habits).toHaveLength(0);
      expect(journals).toHaveLength(0);
      expect(goals).toHaveLength(0);
      expect(transactions).toHaveLength(0);
      expect(active).toHaveLength(0);
      expect(blown).toHaveLength(0);
      expect(trades).toHaveLength(0);
      expect(weeklyReviews).toHaveLength(0);
    });

    test('Achievements catalog is present but 100% locked', async () => {
      const achievements = await AchievementService.getAll();
      expect(achievements.length).toBeGreaterThan(0);
      const unlocked = achievements.filter(a => a.unlocked);
      expect(unlocked).toHaveLength(0);
    });
  });

  // =========================================================================
  // 2. HABITS LIFECYCLE (CRUD)
  // =========================================================================
  describe('2. Habits Interactive Lifecycle', () => {
    test('User can create, toggle, update, and delete a habit', async () => {
      // 1. Create
      const habit = await HabitService.create({
        name: 'Morning Meditation',
        category: 'Mindfulness',
        frequency: 'daily',
        targetDays: 7,
        reminderTime: '07:00'
      });
      expect(habit.id).toBeDefined();
      expect(habit.name).toBe('Morning Meditation');

      // 2. Verify in list
      let allHabits = await HabitService.getAll(false);
      expect(allHabits).toHaveLength(1);

      // 3. Toggle completion for today
      const todayStr = new Date().toISOString().split('T')[0];
      const completed = await HabitService.toggle(habit.id, todayStr);
      expect(completed).toBe(true);

      const isDone = await HabitService.isCompletedToday(habit.id, todayStr);
      expect(isDone).toBe(true);

      // 4. Update
      await HabitService.update(habit.id, { name: 'Deep Meditation 20m' });
      const updated = await HabitService.get(habit.id);
      expect(updated.name).toBe('Deep Meditation 20m');

      // 5. Delete (archive or permanent)
      await HabitService.delete(habit.id);
      allHabits = await HabitService.getAll(false);
      expect(allHabits).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. JOURNAL LIFECYCLE
  // =========================================================================
  describe('3. Journal Interactive Lifecycle', () => {
    test('User can save a multi-section journal reflection and retrieve it', async () => {
      const todayStr = new Date().toISOString().split('T')[0];

      // Save journal
      const saved = await JournalService.save({
        date: todayStr,
        mood: 'energized',
        gratitude: 'Morning sunlight and quiet focused work.',
        wins: 'Shipped functionality pass with zero errors.',
        improvements: 'Limit late night blue light exposure.',
        notes: 'Steady execution beats hasty rushing.',
        status: 'completed'
      });

      expect(saved.id).toBeDefined();
      expect(saved.mood).toBe('energized');
      expect(saved.gratitude).toContain('Morning sunlight');

      // Retrieve today
      const todayEntry = await JournalService.getToday(todayStr);
      expect(todayEntry).not.toBeNull();
      expect(todayEntry.wins).toContain('Shipped functionality');

      // Check history
      const allJournals = await JournalService.getAll();
      expect(allJournals).toHaveLength(1);

      // Delete
      await JournalService.delete(saved.id);
      const afterDelete = await JournalService.getAll();
      expect(afterDelete).toHaveLength(0);
    });
  });

  // =========================================================================
  // 4. GOALS & MILESTONES LIFECYCLE (CRUD + CASCADE)
  // =========================================================================
  describe('4. Goals & Milestones Lifecycle', () => {
    test('User can create goal, add milestones, toggle milestones with progress recalculation, and delete', async () => {
      // 1. Create Goal
      const goal = await GoalService.create({
        name: 'Launch Tech Venture',
        description: 'Build and deploy production MVP',
        category: 'Career',
        target: 100,
        deadline: '2026-12-31'
      });
      expect(goal.id).toBeDefined();
      expect(goal.currentProgress).toBe(0);

      // 2. Add Milestones
      const m1 = await GoalService.addMilestone(goal.id, 'Design System Locked');
      const m2 = await GoalService.addMilestone(goal.id, 'Backend DB Integrated');
      const m3 = await GoalService.addMilestone(goal.id, 'Production Deploy Ready');

      let goalWithMilestones = await GoalService.get(goal.id);
      expect(goalWithMilestones.milestones).toHaveLength(3);
      expect(goalWithMilestones.currentProgress).toBe(0);

      // 3. Toggle Milestone 1
      await GoalService.toggleMilestone(m1.id);
      goalWithMilestones = await GoalService.get(goal.id);
      // 1 of 3 = 33%
      expect(goalWithMilestones.currentProgress).toBe(33);

      // 4. Toggle Milestone 2 & 3
      await GoalService.toggleMilestone(m2.id);
      await GoalService.toggleMilestone(m3.id);
      goalWithMilestones = await GoalService.get(goal.id);
      expect(goalWithMilestones.currentProgress).toBe(100);

      // 5. Delete individual milestone
      await GoalService.deleteMilestone(m3.id);
      goalWithMilestones = await GoalService.get(goal.id);
      expect(goalWithMilestones.milestones).toHaveLength(2);
      expect(goalWithMilestones.currentProgress).toBe(100); // 2 of 2 completed = 100%

      // 6. Delete Goal and verify cascade milestone deletion
      await GoalService.delete(goal.id);
      const remainingGoal = await GoalService.get(goal.id);
      expect(remainingGoal).toBeNull();

      const remainingMilestones = await db.goalMilestones.where('goalId').equals(goal.id).toArray();
      expect(remainingMilestones).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. MONEY & TRANSACTIONS LIFECYCLE
  // =========================================================================
  describe('5. Money & Transactions Lifecycle', () => {
    test('User can log income and expenses, recalculate stats, and delete transactions', async () => {
      // 1. Initial empty stats
      let stats = await MoneyService.getFinancialStats();
      expect(stats.totalIncome).toBe(0);
      expect(stats.totalExpenses).toBe(0);
      expect(stats.netBalance).toBe(0);

      // 2. Add Income
      const tx1 = await MoneyService.addTransaction({
        name: 'Client Project Invoice',
        type: 'income',
        amount: 2500.00,
        category: 'Salary',
        date: new Date().toISOString()
      });

      // 3. Add Expense
      const tx2 = await MoneyService.addTransaction({
        name: 'Workspace Rent & Utilities',
        type: 'expense',
        amount: 500.00,
        category: 'Bills',
        date: new Date().toISOString()
      });

      // 4. Verify calculated metrics
      stats = await MoneyService.getFinancialStats();
      expect(stats.totalIncome).toBe(2500);
      expect(stats.totalExpenses).toBe(500);
      expect(stats.netBalance).toBe(2000);
      expect(stats.savingsRate).toBe(80); // (2000/2500) * 100 = 80%

      // 5. Verify transaction list
      let allTx = await MoneyService.getAllTransactions();
      expect(allTx).toHaveLength(2);

      // 6. Delete transaction and verify balance updates
      await MoneyService.deleteTransaction(tx2.id);
      allTx = await MoneyService.getAllTransactions();
      expect(allTx).toHaveLength(1);

      stats = await MoneyService.getFinancialStats();
      expect(stats.totalExpenses).toBe(0);
      expect(stats.netBalance).toBe(2500);
    });
  });

  // =========================================================================
  // 6. TRADING ACCOUNTS & TRADES LIFECYCLE
  // =========================================================================
  describe('6. Trading Accounts & Trades Lifecycle', () => {
    test('User can create account, execute trades, update stats, and delete trades with balance restoration', async () => {
      // 1. Create Trading Account
      const accRes = await TradingEngine.createAccount({
        name: 'Apex 50k Funded',
        broker: 'Apex Trader Funding',
        type: 'FUNDED',
        startingBalance: 50000,
        currency: 'USD',
        riskPerTradePct: 1.0,
        dailyLossLimitUsd: 1500,
        maxTrailingDrawdownUsd: 2500
      });
      expect(accRes.success).toBe(true);
      const acc = accRes.data;
      expect(acc.id).toBeDefined();
      expect(acc.currentBalance).toBe(50000);
      expect(acc.status).toBe('ACTIVE');

      // 2. Execute a profitable trade
      const tradeRes1 = await TradingEngine.executeTrade({
        accountId: acc.id,
        instrument: 'XAUUSD',
        direction: 'BUY',
        lotSize: 0.5,
        entryPrice: 2650.00,
        exitPrice: 2665.00,
        pnl: 750.00,
        rMultiple: 2.5,
        setup: 'London Breakout'
      });
      expect(tradeRes1.success).toBe(true);

      let updatedAcc = await db.tradingAccounts.get(acc.id);
      expect(updatedAcc.currentBalance).toBe(50750);

      // 3. Execute a losing trade
      const tradeRes2 = await TradingEngine.executeTrade({
        accountId: acc.id,
        instrument: 'XAUUSD',
        direction: 'SELL',
        lotSize: 0.5,
        entryPrice: 2660.00,
        exitPrice: 2664.00,
        pnl: -200.00,
        rMultiple: -1.0,
        setup: 'NY Retest'
      });
      expect(tradeRes2.success).toBe(true);

      updatedAcc = await db.tradingAccounts.get(acc.id);
      expect(updatedAcc.currentBalance).toBe(50550);

      // 4. Verify account statistics
      const stats = await TradingEngine.getAccountStatistics(acc.id);
      expect(stats.totalTrades).toBe(2);
      expect(stats.totalWins).toBe(1);
      expect(stats.totalLosses).toBe(1);
      expect(stats.totalPL).toBe(550);

      // 5. Delete the losing trade and verify balance restoration
      await TradingEngine.deleteTrade(tradeRes2.data.trade.id);
      updatedAcc = await db.tradingAccounts.get(acc.id);
      // Balance should restore: 50550 - (-200) = 50750
      expect(updatedAcc.currentBalance).toBe(50750);

      const tradesRemaining = await db.trades.where('accountId').equals(acc.id).toArray();
      expect(tradesRemaining).toHaveLength(1);
    });

    test('Account drawdown breach triggers BLOWN state and disables further trades', async () => {
      const accRes = await TradingEngine.createAccount({
        name: 'Evaluation 25k',
        type: 'CHALLENGE',
        startingBalance: 25000,
        dailyLossLimitUsd: 1000,
        maxTrailingDrawdownUsd: 1500
      });
      expect(accRes.success).toBe(true);
      const acc = accRes.data;

      // Trade that exceeds daily loss limit ($1200 > $1000)
      const res = await TradingEngine.executeTrade({
        accountId: acc.id,
        instrument: 'NAS100',
        direction: 'BUY',
        lotSize: 1.0,
        entryPrice: 20000,
        exitPrice: 19880,
        pnl: -1200.00,
        rMultiple: -2.0
      });

      expect(res.success).toBe(true);
      expect(res.data.wasBlown).toBe(true);

      const blownAcc = await db.tradingAccounts.get(acc.id);
      expect(blownAcc.status).toBe('BLOWN');

      // Attempting another trade on blown account must be rejected
      const rejectRes = await TradingEngine.executeTrade({
        accountId: acc.id,
        instrument: 'NAS100',
        direction: 'BUY',
        lotSize: 0.1,
        pnl: 100
      });

      expect(rejectRes.success).toBe(false);
      expect(rejectRes.error).toContain('BLOWN');
    });
  });

  // =========================================================================
  // 7. WEEKLY REVIEW PERSISTENCE
  // =========================================================================
  describe('7. Weekly Review Lifecycle', () => {
    test('User can persist and retrieve custom reflections without hardcoded boilerplate', async () => {
      const weekStart = '2026-09-14';
      const weekEnd = '2026-09-20';

      const reviewId = await db.weeklyReviews.add({
        userId: getActiveUserId(),
        weekStart,
        weekEnd,
        whatWentWell: 'Strict risk management and zero over-trading.',
        challenges: 'Midweek fatigue during late Asian session.',
        lessons: 'Discipline compounds faster than leverage.',
        nextWeekFocus: 'Sleep by 10 PM and stick to A+ setups.',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const retrieved = await db.weeklyReviews.get(reviewId);
      expect(retrieved).not.toBeNull();
      expect(retrieved.whatWentWell).toBe('Strict risk management and zero over-trading.');
      expect(retrieved.challenges).toBe('Midweek fatigue during late Asian session.');
      expect(retrieved.lessons).toBe('Discipline compounds faster than leverage.');
      expect(retrieved.status).toBe('completed');
    });
  });

  // =========================================================================
  // 8. SCREEN TEMPLATES INTEGRITY
  // =========================================================================
  describe('8. Screen Templates Integrity', () => {
    test('All critical screens have compiled templates in screensData', () => {
      const coreScreens = [
        'home', 'daily', 'habits', 'habit-detail',
        'journal', 'journal-history', 'weekly-review',
        'goals', 'goal-new', 'goal-detail', 'goal-stats',
        'money', 'transactions', 'transaction-new', 'budget', 'financial-stats',
        'trading', 'trading-accounts', 'trading-account-new', 'trading-account-detail',
        'trade-new', 'trade-history', 'trade-open',
        'quick-add', 'menu', 'profile'
      ];

      for (const s of coreScreens) {
        expect(screensData[s]).toBeDefined();
        expect(screensData[s].html.length).toBeGreaterThan(100);
      }
    });
  });
});
