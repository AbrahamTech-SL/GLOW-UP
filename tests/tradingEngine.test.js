import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll } from 'vitest';
import { TradingEngine } from '../src/trading/engine.js';
import { db } from '../src/db/index.js';

describe('TradingEngine - Core Tests', () => {
  let accountId;

  beforeAll(async () => {
    const accRes = await TradingEngine.createAccount({
      name: 'Evaluation 50K',
      accountType: 'challenge',
      startingBalance: 50000,
      maxDrawdown: 2500,
      dailyLossLimit: 1500,
      riskPerTradePct: 1.0
    });
    accountId = accRes.data.id;
  });

  test('Account creation succeeded', async () => {
    const accRes = await TradingEngine.createAccount({
      name: 'Test Account Init',
      startingBalance: 50000,
      maxDrawdown: 2500
    });
    expect(accRes.success).toBe(true);
    expect(accRes.data.status).toBe('ACTIVE');
    expect(accRes.data.currentBalance).toBe(50000);
  });

  test('Winning trade P/L calculated correctly', async () => {
    const winRes = await TradingEngine.executeTrade({
      accountId,
      instrument: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2500,
      exitPrice: 2510,
      stopLoss: 2490,
      takeProfit: 2520,
      lotSize: 1.0
    });
    expect(winRes.success).toBe(true);
    expect(winRes.data.trade.pnl).toBe(1000);
    expect(winRes.data.account.currentBalance).toBe(51000);
    expect(winRes.data.account.status).toBe('ACTIVE');
    expect(winRes.data.wasBlown).toBe(false);
  });

  test('Account stats: 1 trade, 100% win rate', async () => {
    const stats = await TradingEngine.getAccountStats(accountId);
    expect(stats.totalTrades).toBe(1);
    expect(stats.winRate).toBe(100);
  });

  test('Losing trade triggers blown account', async () => {
    const lossRes = await TradingEngine.executeTrade({
      accountId,
      instrument: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2500,
      exitPrice: 2470,
      stopLoss: 2465,
      takeProfit: 2550,
      lotSize: 1.0
    });
    expect(lossRes.success).toBe(true);
    expect(lossRes.data.wasBlown).toBe(true);
    expect(lossRes.data.account.status).toBe('BLOWN');
    expect(lossRes.data.account.finalBalance).toBe(48000);
    expect(lossRes.data.account.totalLoss).toBe(2000);
    expect(lossRes.data.account.blownReason).toContain('Max Drawdown Breached');
  });

  test('Subsequent trade on BLOWN account rejected', async () => {
    const blocked = await TradingEngine.executeTrade({
      accountId,
      instrument: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.08,
      exitPrice: 1.09,
      stopLoss: 1.075,
      takeProfit: 1.095,
      lotSize: 1.0
    });
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain('BLOWN');
  });

  test('Blown account appears in partitioned blown list', async () => {
    const partitioned = await TradingEngine.getAccountsPartitioned();
    expect(partitioned.blown.some(a => a.id === accountId)).toBe(true);
  });
});