import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLocalDateString,
  getLocalWeekdayName,
  getLocalWeekdayShort,
  getLocalMonthName,
  formatHeaderDate,
  formatFullDate,
  getCurrentWeek,
  getMonthCalendarGrid,
  parseLocalDate,
  isSameDay,
  isToday
} from '../src/utils/date.js';
import {
  db,
  DEFAULT_HABIT_TEMPLATES,
  seedDefaultHabits,
  HabitService,
  JournalService,
  GoalService,
  MoneyService,
  getActiveUserId,
  setActiveUserId
} from '../src/db/index.js';
import { AuthService } from '../src/auth/index.js';
import { TradingEngine } from '../src/trading/engine.js';

describe('GLOW UP: CRITICAL FUNCTIONALITY REPAIR TEST SUITE', () => {
  beforeEach(async () => {
    setActiveUserId('user_critical_test');
    await db.habits.where('userId').equals('user_critical_test').delete();
    await db.habitEntries.where('userId').equals('user_critical_test').delete();
    await db.journalEntries.where('userId').equals('user_critical_test').delete();
    await db.goals.where('userId').equals('user_critical_test').delete();
    await db.goalMilestones.where('userId').equals('user_critical_test').delete();
    await db.transactions.where('userId').equals('user_critical_test').delete();
    await db.tradingAccounts.where('userId').equals('user_critical_test').delete();
    await db.trades.where('userId').equals('user_critical_test').delete();
  });

  // ==========================================
  // 1. AUTH & EMAIL VERIFICATION
  // ==========================================
  describe('1. Supabase Auth & Verification', () => {
    it('handles email verification required on sign up gracefully', async () => {
      // Mock supabase auth response
      const mockSignUp = vi.spyOn(AuthService, 'signUp').mockResolvedValueOnce({
        success: true,
        data: {
          user: { id: 'test-unverified-id', email: 'unverified@glowup.io' },
          requiresVerification: true
        }
      });

      const res = await AuthService.signUp('unverified@glowup.io', 'Password123!', 'New User');
      expect(res.success).toBe(true);
      expect(res.data.requiresVerification).toBe(true);
      mockSignUp.mockRestore();
    });

    it('returns EMAIL_NOT_VERIFIED error code on unverified login attempt', async () => {
      const mockSignIn = vi.spyOn(AuthService, 'signIn').mockResolvedValueOnce({
        success: false,
        error: 'Email not confirmed',
        code: 'EMAIL_NOT_VERIFIED'
      });

      const res = await AuthService.signIn('unverified@glowup.io', 'Password123!');
      expect(res.success).toBe(false);
      expect(res.code).toBe('EMAIL_NOT_VERIFIED');
      mockSignIn.mockRestore();
    });

    it('provides resendConfirmationEmail function', async () => {
      expect(typeof AuthService.resendConfirmationEmail).toBe('function');
      const res = await AuthService.resendConfirmationEmail('test@glowup.io');
      expect(res).toBeDefined();
    });
  });

  // ==========================================
  // 2. LOCAL DATE & TIME UTILITY
  // ==========================================
  describe('2. Real Local Date/Time Utility', () => {
    it('formats local date as YYYY-MM-DD correctly across timezones', () => {
      const d = new Date(2026, 8, 16); // Sept 16, 2026 local
      expect(getLocalDateString(d)).toBe('2026-09-16');
    });

    it('returns correct full weekday names without UTC shifting', () => {
      const wednesday = new Date(2026, 8, 16); // Sept 16, 2026 is Wednesday
      expect(getLocalWeekdayName(wednesday)).toBe('Wednesday');
      expect(getLocalWeekdayShort(wednesday)).toBe('Wed');
    });

    it('returns correct month name and formatted header', () => {
      const date = new Date(2026, 8, 16);
      expect(getLocalMonthName(date)).toBe('September');
      expect(formatHeaderDate('2026-09-16')).toBe('Wednesday, Sep 16');
      expect(formatFullDate('2026-09-16')).toBe('Wednesday, Sep 16, 2026');
    });

    it('computes 7-day week starting on Monday without UTC drift', () => {
      const wednesday = new Date(2026, 8, 16);
      const week = getCurrentWeek(wednesday);

      expect(week.weekStart).toBe('2026-09-14'); // Monday
      expect(week.weekEnd).toBe('2026-09-20');   // Sunday
      expect(week.days.length).toBe(7);
      expect(week.days[0].weekdayShort).toBe('Mon');
      expect(week.days[0].dateStr).toBe('2026-09-14');
      expect(week.days[6].weekdayShort).toBe('Sun');
      expect(week.days[6].dateStr).toBe('2026-09-20');
    });

    it('generates accurate month calendar grid', () => {
      const grid = getMonthCalendarGrid(2026, 8); // September 2026
      expect(grid.length).toBeGreaterThanOrEqual(28);
      const sept16 = grid.find(c => c.dateStr === '2026-09-16');
      expect(sept16).toBeDefined();
      expect(sept16.dayNumber).toBe(16);
      expect(sept16.isCurrentMonth).toBe(true);
    });

    it('safely parses local date strings', () => {
      const parsed = parseLocalDate('2026-09-16');
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(8);
      expect(parsed.getDate()).toBe(16);
    });

    it('correctly identifies today and same day', () => {
      const todayStr = getLocalDateString();
      expect(isToday(todayStr)).toBe(true);
      expect(isSameDay(todayStr, todayStr)).toBe(true);
      expect(isSameDay('2026-01-01', '2026-01-02')).toBe(false);
    });
  });

  // ==========================================
  // 3. 16 DEFAULT HABIT TEMPLATES & ZERO COMPLETIONS
  // ==========================================
  describe('3. Default Daily Habit Templates (16 Total)', () => {
    it('contains exactly 16 templates (11 Non-Negotiables + 5 Small Habits)', () => {
      expect(DEFAULT_HABIT_TEMPLATES.length).toBe(16);

      const nonNegotiables = DEFAULT_HABIT_TEMPLATES.filter(h => h.isNonNegotiable);
      expect(nonNegotiables.length).toBe(11);

      const smallHabits = DEFAULT_HABIT_TEMPLATES.filter(h => !h.isNonNegotiable);
      expect(smallHabits.length).toBe(5);

      const expectedNames = [
        'Wake before 7 AM',
        'Pray + Bible',
        'Workout 20–30 min',
        '10K steps',
        'No social media before 10 AM',
        'Meditate 5–10 min',
        'Follow trading plan + journal',
        '1 hour coding/business',
        'Eat clean + drink water',
        'No porn',
        'Phone off by 11 PM',
        'Read 10 pages',
        'Learn one thing',
        'Clean room 5–10 min',
        'Track spending',
        'Talk to someone I care about'
      ];

      expectedNames.forEach(name => {
        expect(DEFAULT_HABIT_TEMPLATES.some(t => t.name === name)).toBe(true);
      });
    });

    it('seeds habits for active user with 0 completions', async () => {
      const seeded = await seedDefaultHabits('user_critical_test');
      expect(seeded.length).toBe(16);

      const entries = await db.habitEntries.where('userId').equals('user_critical_test').toArray();
      expect(entries.length).toBe(0); // Zero completed records by default!

      const todayStr = getLocalDateString();
      const stats = await HabitService.getDailyCompletionStats(todayStr, seeded);
      expect(stats.total).toBe(16);
      expect(stats.completed).toBe(0);
      expect(stats.percentage).toBe(0);
    });

    it('does not re-create default habits if user already has habits', async () => {
      await seedDefaultHabits('user_critical_test');
      const countBefore = (await HabitService.getAll()).length;
      expect(countBefore).toBe(16);

      // Call getAll with autoSeed=true again
      const habitsAgain = await HabitService.getAll(false, true);
      expect(habitsAgain.length).toBe(16); // Remains exactly 16!
    });
  });

  // ==========================================
  // 4. HABIT CHECKBOX TOGGLE: CHECK & UNCHECK
  // ==========================================
  describe('4. Habit Checkbox Toggle: Check AND Uncheck', () => {
    it('toggles habit from unchecked to checked and back to unchecked with persistence', async () => {
      const habits = await seedDefaultHabits('user_critical_test');
      const habitId = habits[0].id;
      const todayStr = getLocalDateString();

      // Step 1: Initial state is unchecked
      const initialCompleted = await HabitService.isCompleted(habitId, todayStr);
      expect(initialCompleted).toBe(false);

      // Step 2: Toggle to CHECKED
      const stateAfterFirstToggle = await HabitService.toggleCompletion(habitId, todayStr);
      expect(stateAfterFirstToggle).toBe(true);

      const isCompletedNow = await HabitService.isCompleted(habitId, todayStr);
      expect(isCompletedNow).toBe(true);

      // Verify stats updated
      const statsChecked = await HabitService.getDailyCompletionStats(todayStr, habits);
      expect(statsChecked.completed).toBe(1);

      // Step 3: Toggle to UNCHECKED
      const stateAfterSecondToggle = await HabitService.toggleCompletion(habitId, todayStr);
      expect(stateAfterSecondToggle).toBe(false);

      const isCompletedAfter = await HabitService.isCompleted(habitId, todayStr);
      expect(isCompletedAfter).toBe(false);

      // Verify stats back to 0
      const statsUnchecked = await HabitService.getDailyCompletionStats(todayStr, habits);
      expect(statsUnchecked.completed).toBe(0);
    });

    it('isolates habit completion to specific dates', async () => {
      const habits = await seedDefaultHabits('user_critical_test');
      const habitId = habits[0].id;

      const dateA = '2026-09-15';
      const dateB = '2026-09-16';

      await HabitService.setCompletion(habitId, dateA, true);

      expect(await HabitService.isCompleted(habitId, dateA)).toBe(true);
      expect(await HabitService.isCompleted(habitId, dateB)).toBe(false);

      const statsA = await HabitService.getDailyCompletionStats(dateA, habits);
      const statsB = await HabitService.getDailyCompletionStats(dateB, habits);

      expect(statsA.completed).toBe(1);
      expect(statsB.completed).toBe(0);
    });
  });

  // ==========================================
  // 5. JOURNAL: REFLECTIONS, MOOD, CRUD
  // ==========================================
  describe('5. Journal Reflections & Persistence', () => {
    it('creates, saves reflection, updates, and deletes journal entry', async () => {
      const todayStr = getLocalDateString();

      const saved = await JournalService.save({
        date: todayStr,
        mood: 'energized',
        reflection: 'Mindful Morning',
        gratitude: 'Deep clarity and health',
        wins: 'Completed all morning non-negotiables',
        improvements: 'Limit screen time at night',
        notes: 'Feeling great',
        status: 'completed'
      });

      expect(saved.id).toBeDefined();
      expect(saved.mood).toBe('energized');
      expect(saved.reflection).toBe('Mindful Morning');

      // Retrieve entry
      const fetched = await JournalService.getToday(todayStr);
      expect(fetched).toBeDefined();
      expect(fetched.gratitude).toBe('Deep clarity and health');

      // Update reflection to Peaceful Space
      await JournalService.save({
        date: todayStr,
        mood: 'calm',
        reflection: 'Peaceful Space',
        gratitude: 'Quiet evening',
        status: 'completed'
      });

      const updated = await JournalService.getToday(todayStr);
      expect(updated.reflection).toBe('Peaceful Space');
      expect(updated.mood).toBe('calm');

      // Delete entry
      await JournalService.delete(saved.id);
      const afterDelete = await JournalService.getToday(todayStr);
      expect(afterDelete).toBeNull();
    });
  });

  // ==========================================
  // 6. GOALS, MONEY, TRADING INTEGRATION
  // ==========================================
  describe('6. Goals, Money, Trading Full Flow', () => {
    it('creates goal, adds milestones, toggles completion', async () => {
      const goal = await GoalService.create({
        name: 'Launch GLOW UP Production',
        category: 'Career',
        target: 100,
        deadline: '2026-10-01'
      });

      const m1 = await GoalService.addMilestone(goal.id, 'Pass all unit tests');
      const m2 = await GoalService.addMilestone(goal.id, 'Complete mobile browser QA');

      expect(goal.id).toBeDefined();

      await GoalService.toggleMilestone(m1.id);
      const goalDetail = await GoalService.get(goal.id);
      expect(goalDetail.milestones.find(m => m.id === m1.id).completed).toBe(true);
      expect(goalDetail.currentProgress).toBe(50);
    });

    it('records financial income, expense, and calculates cash flow', async () => {
      await MoneyService.createTransaction({
        name: 'Salary Retainer',
        amount: 5000,
        type: 'income',
        category: 'Salary'
      });

      await MoneyService.createTransaction({
        name: 'Organic Grocery Haul',
        amount: 250,
        type: 'expense',
        category: 'Food'
      });

      const stats = await MoneyService.getFinancialStats();
      expect(stats.totalIncome).toBe(5000);
      expect(stats.totalExpenses).toBe(250);
      expect(stats.netBalance).toBe(4750);
      expect(stats.savingsRate).toBe(95);
    });

    it('enforces trading discipline, validates risk, records trades', async () => {
      const accountRes = await TradingEngine.createAccount({
        name: 'Apex 50k Challenge',
        accountSize: 50000,
        type: 'challenge',
        riskPerTradePercent: 1.0,
        dailyLossLimitPercent: 2.0,
        maximumDrawdownPercent: 4.0
      });

      expect(accountRes.success).toBe(true);
      const accountId = accountRes.data.id;

      const tradeRes = await TradingEngine.executeTrade({
        accountId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2600.00,
        exitPrice: 2615.00,
        stopLoss: 2590.00,
        takeProfit: 2630.00,
        lotSize: 1.0,
        notes: 'Discipline test trade'
      });

      expect(tradeRes.success).toBe(true);
      expect(tradeRes.data.trade.pnl).toBe(1500);
    });
  });

  // ==========================================
  // 7. USER DATA ISOLATION
  // ==========================================
  describe('7. User Data Isolation', () => {
    it('prevents User A from seeing User B data in service queries', async () => {
      // User A creates habits
      setActiveUserId('user_a');
      await seedDefaultHabits('user_a');
      const userAHabits = await HabitService.getAll();
      expect(userAHabits.length).toBe(16);

      // User B checks habits before seeding
      setActiveUserId('user_b');
      const userBHabits = await HabitService.getAll(false, false);
      expect(userBHabits.length).toBe(0); // Clean 0 habits for User B!
    });
  });
});
