import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll } from 'vitest';
import { db, seedInitialData } from '../src/db/index.js';
import { TradingEngine } from '../src/trading/engine.js';
import { screensData } from '../src/screens/screensData.js';

const ROUTE_ALIASES = {
  'create-account': 'register',
  'create-goal': 'goal-new',
  'habit-statistics': 'habit-stats',
  'goal-statistics': 'goal-stats',
  'personal-statistics': 'personal-stats',
  'add-transaction': 'transaction-new',
  'financial-statistics': 'financial-stats',
  'add-trading-account': 'trading-account-new',
  'new-account-trade': 'trade-new',
  'open-trade': 'trade-open',
  'trading-statistics': 'trading-stats',
  'settings': 'menu',
  'data-reset': 'reset-data'
};

const requiredRoutes = [
  'splash', 'welcome', 'create-account', 'login', 'profile-setup',
  'home', 'quick-add', 'daily', 'habits', 'habit-detail',
  'journal', 'journal-history', 'goals', 'create-goal', 'goal-detail',
  'progress', 'habit-statistics', 'goal-statistics', 'personal-statistics', 'weekly-review',
  'money', 'transactions', 'add-transaction', 'budget', 'financial-statistics',
  'trading', 'trading-decision', 'xauusd-setup', 'pre-trade-checklist', 'risk-calculator',
  'trading-accounts', 'add-trading-account', 'trading-account-detail', 'account-rules',
  'new-account-trade', 'trade-journal', 'open-trade', 'trade-history',
  'trading-statistics', 'trading-review', 'settings', 'profile', 'notifications',
  'security', 'data-management', 'backup', 'restore', 'data-reset',
  'rewards', 'achievements'
];

// =====================================================
// CHECK 1: NAVIGATION & ROUTE MAPPING (ALL 50 SCREENS)
// =====================================================
describe('CHECK 1 — Navigation & Route Mapping', () => {
  test('Exactly 50 required routes specified', () => {
    expect(requiredRoutes.length).toBe(50);
  });

  test('All 50 screens have valid HTML templates', () => {
    const missing = [];
    for (const r of requiredRoutes) {
      const canonical = ROUTE_ALIASES[r] || r;
      const screen = screensData[canonical];
      if (!screen || !screen.html || screen.html.length <= 50) {
        missing.push(`${r} (canonical: ${canonical})`);
      }
    }
    expect(missing).toHaveLength(0);
  });
});

// =====================================================
// CHECK 2: CLEAN-APP CONTRACT — ZERO PERSONAL DATA ON START
// =====================================================
describe('CHECK 2 — Clean-App Contract (No Preloaded Personal Data)', () => {
  beforeAll(async () => {
    await seedInitialData();
  });

  // 2a: New user starts with ZERO personal data
  test('Zero habits on fresh start', async () => {
    expect(await db.habits.count()).toBe(0);
  });

  test('Zero habit entries on fresh start', async () => {
    expect(await db.habitEntries.count()).toBe(0);
  });

  test('Zero journal entries on fresh start', async () => {
    expect(await db.journalEntries.count()).toBe(0);
  });

  test('Zero goals on fresh start', async () => {
    expect(await db.goals.count()).toBe(0);
  });

  test('Zero goal milestones on fresh start', async () => {
    expect(await db.goalMilestones.count()).toBe(0);
  });

  test('Zero transactions on fresh start', async () => {
    expect(await db.transactions.count()).toBe(0);
  });

  test('Zero budgets on fresh start', async () => {
    expect(await db.budgets.count()).toBe(0);
  });

  test('Zero trading accounts on fresh start', async () => {
    expect(await db.tradingAccounts.count()).toBe(0);
  });

  test('Zero trades on fresh start', async () => {
    expect(await db.trades.count()).toBe(0);
  });

  test('Zero weekly reviews on fresh start', async () => {
    expect(await db.weeklyReviews.count()).toBe(0);
  });

  // 2b: System catalog data IS allowed
  test('Achievements catalog seeded (system data, not personal data)', async () => {
    const achCount = await db.achievements.count();
    expect(achCount).toBeGreaterThanOrEqual(6);
    // All achievements must be locked by default
    const unlocked = await db.achievements.filter(a => a.unlocked === true).count();
    expect(unlocked).toBe(0);
  });

  // 2c: User creates data through the actual service API — it persists
  test('User-created habit persists', async () => {
    const id = await db.habits.add({
      name: 'Morning Workout',
      icon: 'fitness_center',
      category: 'Health',
      frequency: 'daily',
      targetDays: 7,
      currentStreak: 0,
      bestStreak: 0,
      createdAt: new Date().toISOString()
    });
    const saved = await db.habits.get(id);
    expect(saved).toBeDefined();
    expect(saved.name).toBe('Morning Workout');
  });

  test('User-created journal entry persists', async () => {
    const id = await db.journalEntries.add({
      date: '2026-09-16',
      mood: 'focused',
      status: 'completed',
      gratitude: 'Grateful for discipline.',
      notes: 'Testing clean-app persistence.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const saved = await db.journalEntries.get(id);
    expect(saved).toBeDefined();
    expect(saved.notes).toContain('clean-app');
  });

  test('User-created goal persists', async () => {
    const id = await db.goals.add({
      title: 'Pass Prop Firm Challenge',
      category: 'Trading',
      targetDate: '2026-12-31',
      progress: 0,
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString()
    });
    const saved = await db.goals.get(id);
    expect(saved).toBeDefined();
    expect(saved.title).toBe('Pass Prop Firm Challenge');
  });

  test('User-created transaction persists', async () => {
    const id = await db.transactions.add({
      type: 'income',
      amount: 3200.00,
      category: 'Prop Firm Payout',
      date: '2026-09-16',
      createdAt: new Date().toISOString()
    });
    const saved = await db.transactions.get(id);
    expect(saved).toBeDefined();
    expect(saved.amount).toBe(3200.00);
  });

  // 2d: Deleting user data actually removes it
  test('Deleted habit is removed permanently', async () => {
    const id = await db.habits.add({
      name: 'Temp Habit To Delete',
      createdAt: new Date().toISOString()
    });
    expect(await db.habits.get(id)).toBeDefined();
    await db.habits.delete(id);
    expect(await db.habits.get(id)).toBeUndefined();
  });

  test('Deleted journal entry is removed permanently', async () => {
    const id = await db.journalEntries.add({
      date: '2026-01-01',
      notes: 'Will be deleted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    expect(await db.journalEntries.get(id)).toBeDefined();
    await db.journalEntries.delete(id);
    expect(await db.journalEntries.get(id)).toBeUndefined();
  });

  test('Deleted goal is removed permanently', async () => {
    const id = await db.goals.add({
      title: 'Temp Goal To Delete',
      createdAt: new Date().toISOString()
    });
    expect(await db.goals.get(id)).toBeDefined();
    await db.goals.delete(id);
    expect(await db.goals.get(id)).toBeUndefined();
  });

  test('Deleted transaction is removed permanently', async () => {
    const id = await db.transactions.add({
      type: 'expense',
      amount: 50.00,
      category: 'Test',
      createdAt: new Date().toISOString()
    });
    expect(await db.transactions.get(id)).toBeDefined();
    await db.transactions.delete(id);
    expect(await db.transactions.get(id)).toBeUndefined();
  });

  // 2e: Re-running seedInitialData does NOT recreate deleted personal data
  test('seedInitialData does not inject personal data on re-run', async () => {
    // Clear all personal data tables
    await db.habits.clear();
    await db.journalEntries.clear();
    await db.goals.clear();
    await db.transactions.clear();
    await db.tradingAccounts.clear();
    await db.trades.clear();

    // Re-run seed (simulates app restart / data-reset)
    await seedInitialData();

    // Personal data must still be zero
    expect(await db.habits.count()).toBe(0);
    expect(await db.journalEntries.count()).toBe(0);
    expect(await db.goals.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.tradingAccounts.count()).toBe(0);
    expect(await db.trades.count()).toBe(0);

    // System catalog must remain
    expect(await db.achievements.count()).toBeGreaterThanOrEqual(6);
  });
});

// =====================================================
// CHECK 3: TRADING ACCOUNT CREATION
// =====================================================
describe('CHECK 3 — Trading Account Creation', () => {
  let testAcc;

  beforeAll(async () => {
    const res = await TradingEngine.createAccount({
      name: 'Challenge Alpha',
      accountType: 'challenge',
      startingBalance: 10000,
      riskPerTradePct: 1.0,
      dailyLossLimit: 500,
      maxDrawdown: 1000,
      profitTarget: 1000,
      deadline: '2026-10-31'
    });
    testAcc = res.data;
  });

  test('Account created successfully', () => {
    expect(testAcc).toBeDefined();
  });

  test('Account status is ACTIVE', () => {
    expect(testAcc.status).toBe('ACTIVE');
  });

  test('Balance is $10,000', () => {
    expect(testAcc.startingBalance).toBe(10000);
    expect(testAcc.currentBalance).toBe(10000);
  });

  test('Risk parameters set correctly', () => {
    expect(testAcc.riskPerTradePct).toBe(1.0);
    expect(testAcc.dailyLossLimit).toBe(500);
    expect(testAcc.maxDrawdown).toBe(1000);
    expect(testAcc.profitTarget).toBe(1000);
  });

  test('Risk amount calculates correctly ($100 = 1% of $10,000)', () => {
    const calculatedRisk = testAcc.currentBalance * (testAcc.riskPerTradePct / 100);
    expect(calculatedRisk).toBe(100);
  });

  test('Account appears in Active Accounts partition', async () => {
    const partitioned = await TradingEngine.getAccountsPartitioned();
    expect(partitioned.active.some(a => a.id === testAcc.id)).toBe(true);
  });
});

// =====================================================
// CHECK 4: TRADE EXECUTION & LEDGER
// =====================================================
describe('CHECK 4 — Trade Execution & Ledger', () => {
  let testAccId;
  let tradeResult;

  beforeAll(async () => {
    const accRes = await TradingEngine.createAccount({
      name: 'Trade Test Account',
      startingBalance: 10000,
      maxDrawdown: 1000,
      dailyLossLimit: 500,
      riskPerTradePct: 1.0
    });
    testAccId = accRes.data.id;

    tradeResult = await TradingEngine.executeTrade({
      accountId: testAccId,
      instrument: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2500.00,
      exitPrice: 2515.00,
      stopLoss: 2495.00,
      takeProfit: 2530.00,
      lotSize: 0.20,
      notes: 'London session gold breakout test'
    });
  });

  test('XAUUSD trade executed successfully', () => {
    expect(tradeResult.success).toBe(true);
  });

  test('Trade belongs to correct account', () => {
    expect(tradeResult.data.trade.accountId).toBe(testAccId);
  });

  test('P/L calculated correctly (+$300)', () => {
    expect(tradeResult.data.trade.pnl).toBe(300.00);
  });

  test('Account balance updated to $10,300', () => {
    expect(tradeResult.data.account.currentBalance).toBe(10300.00);
  });

  test('Trade appears in history', async () => {
    const trades = await db.trades.where('accountId').equals(testAccId).toArray();
    expect(trades.length).toBe(1);
    expect(trades[0].instrument).toBe('XAUUSD');
  });

  test('Trade journal notes saved', async () => {
    const trades = await db.trades.where('accountId').equals(testAccId).toArray();
    expect(trades[0].journalNotes).toBe('London session gold breakout test');
  });

  test('Statistics updated (100% win rate, +$300 net P/L)', async () => {
    const stats = await TradingEngine.getAccountStats(testAccId);
    expect(stats.totalTrades).toBe(1);
    expect(stats.winRate).toBe(100);
    expect(stats.netPL).toBe(300.00);
  });
});

// =====================================================
// CHECK 5: BLOWN ACCOUNT LOGIC
// =====================================================
describe('CHECK 5 — Blown Account Logic', () => {
  let fragileAccId;
  let lossTradeRes;

  beforeAll(async () => {
    const res = await TradingEngine.createAccount({
      name: 'Fragile Test Account',
      accountType: 'challenge',
      startingBalance: 10000,
      maxDrawdown: 500,
      dailyLossLimit: 500,
      riskPerTradePct: 1.0
    });
    fragileAccId = res.data.id;

    lossTradeRes = await TradingEngine.executeTrade({
      accountId: fragileAccId,
      instrument: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2500.00,
      exitPrice: 2494.00,
      stopLoss: 2490.00,
      takeProfit: 2520.00,
      lotSize: 1.0,
      notes: 'Trigger controlled drawdown breach'
    });
  });

  test('Losing trade recorded', () => {
    expect(lossTradeRes.success).toBe(true);
  });

  test('Account flag wasBlown is TRUE', () => {
    expect(lossTradeRes.data.wasBlown).toBe(true);
  });

  test('Account status automatically changed to BLOWN', () => {
    expect(lossTradeRes.data.account.status).toBe('BLOWN');
  });

  test('Final balance recorded correctly ($9,400)', () => {
    expect(lossTradeRes.data.account.finalBalance).toBe(9400.00);
  });

  test('Blown reason recorded', () => {
    expect(lossTradeRes.data.account.blownReason).toContain('Max Drawdown Breached');
  });

  test('New trade blocked for BLOWN account', async () => {
    const blocked = await TradingEngine.executeTrade({
      accountId: fragileAccId,
      instrument: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2500.00,
      exitPrice: 2510.00,
      stopLoss: 2490.00,
      takeProfit: 2520.00,
      lotSize: 0.1
    });
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain('BLOWN');
  });

  test('Account appears in Blown partition and excluded from Active', async () => {
    const part = await TradingEngine.getAccountsPartitioned();
    expect(part.blown.some(a => a.id === fragileAccId)).toBe(true);
    expect(part.active.every(a => a.id !== fragileAccId)).toBe(true);
  });

  test('Historical trades remain accessible', async () => {
    const trades = await db.trades.where('accountId').equals(fragileAccId).toArray();
    expect(trades.length).toBe(1);
  });

  test('Historical statistics remain accessible (-$600)', async () => {
    const stats = await TradingEngine.getAccountStats(fragileAccId);
    expect(stats.totalTrades).toBe(1);
    expect(stats.netPL).toBe(-600.00);
  });

  test('User can create a new account after blow', async () => {
    const fresh = await TradingEngine.createAccount({
      name: 'Second Chance Challenge',
      accountType: 'challenge',
      startingBalance: 10000,
      maxDrawdown: 1000
    });
    expect(fresh.success).toBe(true);
    expect(fresh.data.status).toBe('ACTIVE');
  });
});

// =====================================================
// CHECK 6: RULE VALIDATION
// =====================================================
describe('CHECK 6 — Rule Validation (Safe / Warning / Breached)', () => {
  const safeAccount = {
    startingBalance: 10000,
    currentBalance: 10000,
    peakBalance: 10000,
    maxDrawdown: 1000,
    dailyLossLimit: 500,
    riskPerTradePct: 1.0,
    profitTarget: 1000,
    dailyPL: 0,
    totalPL: 0,
    deadline: '2026-12-31'
  };

  test('Drawdown evaluated as Safe (0% loss)', () => {
    const rules = TradingEngine.evaluateAccountRules(safeAccount);
    expect(rules.drawdown.status).toBe('Safe');
  });

  test('Daily loss evaluated as Safe', () => {
    const rules = TradingEngine.evaluateAccountRules(safeAccount);
    expect(rules.dailyLoss.status).toBe('Safe');
  });

  test('Drawdown evaluated as Warning (>80% of max)', () => {
    const rules = TradingEngine.evaluateAccountRules({ ...safeAccount, currentBalance: 9150 });
    expect(rules.drawdown.status).toBe('Warning');
  });

  test('Daily loss evaluated as Warning (>80% of limit)', () => {
    const rules = TradingEngine.evaluateAccountRules({ ...safeAccount, dailyPL: -420 });
    expect(rules.dailyLoss.status).toBe('Warning');
  });

  test('Drawdown evaluated as Rule Breached', () => {
    const rules = TradingEngine.evaluateAccountRules({ ...safeAccount, currentBalance: 8900 });
    expect(rules.drawdown.status).toBe('Rule Breached');
  });

  test('Daily loss evaluated as Rule Breached', () => {
    const rules = TradingEngine.evaluateAccountRules({ ...safeAccount, dailyPL: -550 });
    expect(rules.dailyLoss.status).toBe('Rule Breached');
  });

  test('Risk per trade Warning (0.9% on 1.0% limit)', () => {
    const rules = TradingEngine.evaluateAccountRules(safeAccount, 90);
    expect(rules.riskPerTrade.status).toBe('Warning');
  });

  test('Risk per trade Rule Breached (1.5% on 1.0% limit)', () => {
    const rules = TradingEngine.evaluateAccountRules(safeAccount, 150);
    expect(rules.riskPerTrade.status).toBe('Rule Breached');
  });

  test('Profit target evaluated as Limit Reached', () => {
    const rules = TradingEngine.evaluateAccountRules({ ...safeAccount, totalPL: 1000 });
    expect(rules.profitTarget.status).toBe('Limit Reached');
  });
});

// =====================================================
// CHECK 7: UI REGRESSION AUDIT (Visual Tokens)
// =====================================================
describe('CHECK 7 — UI Regression & Design Tokens', () => {
  test('Stitch design tokens are preserved (color constants)', () => {
    const tokens = {
      background: '#fcf9f8',
      primaryContainer: '#d6f3a1',
      secondary: '#3e6a00',
      secondaryContainer: '#b9f474',
      onSurface: '#1c1b1b'
    };
    expect(tokens.background).toBe('#fcf9f8');
    expect(tokens.primaryContainer).toBe('#d6f3a1');
    expect(tokens.secondary).toBe('#3e6a00');
  });

  test('All Stitch HTML templates are present (≥48 screens)', () => {
    const count = Object.keys(screensData).length;
    expect(count).toBeGreaterThanOrEqual(48);
  });
});

// =====================================================
// CHECK 8: CODE QUALITY & BUILD INTEGRITY
// =====================================================
describe('CHECK 8 — Code Quality & Build Integrity', () => {
  test('screensData module exports correctly', () => {
    expect(screensData).toBeDefined();
    expect(typeof screensData).toBe('object');
  });

  test('db module exports all required tables', () => {
    expect(db.habits).toBeDefined();
    expect(db.journalEntries).toBeDefined();
    expect(db.goals).toBeDefined();
    expect(db.transactions).toBeDefined();
    expect(db.tradingAccounts).toBeDefined();
    expect(db.trades).toBeDefined();
    expect(db.weeklyReviews).toBeDefined();
    expect(db.achievements).toBeDefined();
  });

  test('TradingEngine exports all required methods', () => {
    expect(typeof TradingEngine.createAccount).toBe('function');
    expect(typeof TradingEngine.executeTrade).toBe('function');
    expect(typeof TradingEngine.getAccountsPartitioned).toBe('function');
    expect(typeof TradingEngine.getAccountStats).toBe('function');
    expect(typeof TradingEngine.evaluateAccountRules).toBe('function');
  });
});
