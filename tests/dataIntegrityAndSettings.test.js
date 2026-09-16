import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  db,
  getActiveUserId,
  setActiveUserId,
  seedDefaultHabits,
  HabitService,
  GoalService,
  JournalService,
  MoneyService,
  PreferenceService,
  UserService,
  DEFAULT_HABIT_TEMPLATES
} from '../src/db/index.js';
import { AuthService } from '../src/auth/index.js';
import { ThemeManager } from '../src/router/index.js';

describe('GLOW UP: Data Integrity & Real Settings Test Suite', () => {
  const TEST_UID_A = 'test-user-alpha-' + Date.now();
  const TEST_UID_B = 'test-user-beta-' + Date.now();

  beforeEach(async () => {
    setActiveUserId(TEST_UID_A);
  });

  describe('1. Clean Initial Data State', () => {
    it('seeds exactly 16 approved habit definitions with 0 initial completions', async () => {
      expect(DEFAULT_HABIT_TEMPLATES).toHaveLength(16);
      expect(DEFAULT_HABIT_TEMPLATES[0].name).toBe('Wake before 7 AM');
      expect(DEFAULT_HABIT_TEMPLATES[15].name).toBe('Talk to someone I care about');

      const habits = await HabitService.getAll(false, true);
      expect(habits).toHaveLength(16);

      // Verify all habits start unchecked
      const today = '2026-09-16';
      const stats = await HabitService.getDailyCompletionStats(today, habits);
      expect(stats.completed).toBe(0);
      expect(stats.total).toBe(16);
      expect(stats.percentage).toBe(0);
    });

    it('initializes with 0 goals, 0 journals, 0 transactions, 0 trading accounts, and 0 trades', async () => {
      const goals = await GoalService.getAll();
      expect(goals).toHaveLength(0);

      const journals = await JournalService.getAll();
      expect(journals).toHaveLength(0);

      const transactions = await MoneyService.getAllTransactions();
      expect(transactions).toHaveLength(0);

      const accounts = await db.tradingAccounts.where('userId').equals(TEST_UID_A).toArray();
      expect(accounts).toHaveLength(0);

      const trades = await db.trades.where('userId').equals(TEST_UID_A).toArray();
      expect(trades).toHaveLength(0);
    });

    it('calculates money statistics as zero with zero records', async () => {
      const stats = await MoneyService.getFinancialStats();
      expect(stats.totalIncome).toBe(0);
      expect(stats.totalExpenses).toBe(0);
      expect(stats.netBalance).toBe(0);
      expect(stats.savingsRate).toBe(0);
    });
  });

  describe('2. User Profile CRUD & Persistence', () => {
    it('persists and retrieves user profile fields including name, username, DOB, and avatarUrl', async () => {
      const profileData = {
        name: 'Jordan Rivera',
        username: '@jordan_growth',
        email: 'jordan@glowup.test',
        dob: '1998-04-12',
        avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        intention: 'Master trading discipline and consistency.',
        primaryFocus: 'Trading'
      };

      const saved = await UserService.saveProfile(profileData, TEST_UID_A);
      expect(saved.name).toBe('Jordan Rivera');
      expect(saved.username).toBe('@jordan_growth');
      expect(saved.dob).toBe('1998-04-12');
      expect(saved.avatarUrl).toContain('data:image/png');

      const retrieved = await UserService.getProfile(TEST_UID_A);
      expect(retrieved).toBeDefined();
      expect(retrieved.name).toBe('Jordan Rivera');
      expect(retrieved.username).toBe('@jordan_growth');
      expect(retrieved.dob).toBe('1998-04-12');
      expect(retrieved.primaryFocus).toBe('Trading');
    });

    it('updates profile fields incrementally without losing other fields', async () => {
      await UserService.saveProfile({ intention: 'New updated daily mantra' }, TEST_UID_A);
      const updated = await UserService.getProfile(TEST_UID_A);
      expect(updated.name).toBe('Jordan Rivera');
      expect(updated.intention).toBe('New updated daily mantra');
    });
  });

  describe('3. Notifications & Preferences Persistence', () => {
    it('persists and retrieves notification switch settings', async () => {
      await PreferenceService.set('daily_habit_reminder', true);
      await PreferenceService.set('journal_reminder', false);
      await PreferenceService.set('budget_reminder', true);

      expect(await PreferenceService.get('daily_habit_reminder')).toBe(true);
      expect(await PreferenceService.get('journal_reminder')).toBe(false);
      expect(await PreferenceService.get('budget_reminder')).toBe(true);

      const allPrefs = await PreferenceService.getAll();
      expect(allPrefs.daily_habit_reminder).toBe(true);
      expect(allPrefs.journal_reminder).toBe(false);
    });

    it('persists auto-lock duration and app lock preferences', async () => {
      await PreferenceService.set('auto_lock_duration', '5 min');
      await PreferenceService.set('app_lock_enabled', true);

      expect(await PreferenceService.get('auto_lock_duration')).toBe('5 min');
      expect(await PreferenceService.get('app_lock_enabled')).toBe(true);

      // Switch to Immediately
      await PreferenceService.set('auto_lock_duration', 'Immediately');
      expect(await PreferenceService.get('auto_lock_duration')).toBe('Immediately');
    });

    it('persists appearance theme and applies theme mode', async () => {
      await ThemeManager.setTheme('dark');
      expect(await ThemeManager.getTheme()).toBe('dark');

      await ThemeManager.setTheme('light');
      expect(await ThemeManager.getTheme()).toBe('light');

      await ThemeManager.setTheme('system');
      expect(await ThemeManager.getTheme()).toBe('system');
    });
  });

  describe('4. Habit Checking and Unchecking', () => {
    it('supports checking and unchecking habits on a specific date', async () => {
      const habits = await HabitService.getAll(false, true);
      const testHabit = habits[0];
      const today = '2026-09-16';

      // 1. Initially unchecked
      let isDone = await HabitService.isCompleted(testHabit.id, today);
      expect(isDone).toBe(false);

      // 2. Check habit
      const checked = await HabitService.toggleCompletion(testHabit.id, today);
      expect(checked).toBe(true);

      isDone = await HabitService.isCompleted(testHabit.id, today);
      expect(isDone).toBe(true);

      let stats = await HabitService.getDailyCompletionStats(today, habits);
      expect(stats.completed).toBe(1);

      // 3. Uncheck habit
      const unchecked = await HabitService.toggleCompletion(testHabit.id, today);
      expect(unchecked).toBe(false);

      isDone = await HabitService.isCompleted(testHabit.id, today);
      expect(isDone).toBe(false);

      stats = await HabitService.getDailyCompletionStats(today, habits);
      expect(stats.completed).toBe(0);
    });
  });

  describe('5. Data Isolation Across Multiple Users', () => {
    it('isolates user data between User Alpha and User Beta', async () => {
      // User Alpha creates a goal and transaction
      setActiveUserId(TEST_UID_A);
      await GoalService.create({
        name: 'Alpha Confidential Goal',
        category: 'Trading',
        targetDate: '2026-12-31'
      });
      await MoneyService.createTransaction({
        name: 'Alpha Salary',
        type: 'income',
        category: 'Income',
        amount: 5000,
        date: '2026-09-16'
      });

      // User Beta logs in
      setActiveUserId(TEST_UID_B);
      const betaGoals = await GoalService.getAll();
      expect(betaGoals).toHaveLength(0);

      const betaTransactions = await MoneyService.getAllTransactions();
      expect(betaTransactions).toHaveLength(0);

      const betaProfile = await UserService.getProfile(TEST_UID_B);
      expect(betaProfile).toBeFalsy();

      // User Beta creates their own goal
      await GoalService.create({
        name: 'Beta Personal Goal',
        category: 'Health',
        targetDate: '2026-11-30'
      });

      // User Alpha switches back
      setActiveUserId(TEST_UID_A);
      const alphaGoals = await GoalService.getAll();
      expect(alphaGoals).toHaveLength(1);
      expect(alphaGoals[0].name).toBe('Alpha Confidential Goal');
    });
  });

  describe('6. Session & Data Persistence', () => {
    it('does not delete user data when signing out', async () => {
      setActiveUserId(TEST_UID_A);
      const habits = await HabitService.getAll(false, false);
      expect(habits.length).toBeGreaterThan(0);

      // Sign out
      await AuthService.signOut();
      expect(AuthService.getCurrentUser()).toBeNull();
      expect(getActiveUserId()).toBe('default_user');

      // Re-activate User Alpha (simulating logging back in)
      setActiveUserId(TEST_UID_A);
      const recoveredHabits = await HabitService.getAll(false, false);
      expect(recoveredHabits.length).toBe(habits.length);

      const recoveredProfile = await UserService.getProfile(TEST_UID_A);
      expect(recoveredProfile.name).toBe('Jordan Rivera');
    });
  });
});
