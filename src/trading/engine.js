import { db, AchievementService, getActiveUserId, matchesActiveUser, queueSyncMutation } from '../db/index.js';

export const Result = {
  ok: (data) => ({ success: true, data, error: null }),
  err: (error) => ({ success: false, data: null, error })
};

export class TradingEngine {
  /**
   * Create a new trading account with customizable rules
   */
  static async createAccount({
    name,
    type = 'challenge',
    accountType,
    broker = 'Tradovate',
    accountNumberOrNickname = '',
    currency = 'USD',
    accountSize = 10000,
    startingBalance = 10000,
    riskPerTradePercent = 1.0,
    riskPerTradePct,
    dailyLossLimitPercent = 5.0,
    dailyLossLimit,
    maximumDrawdownPercent = 10.0,
    maxDrawdown,
    profitTargetPercent = 10.0,
    profitTarget,
    challengeDeadline = '',
    deadline,
    minimumTradingDays = 5,
    maximumTradesPerDay = 5,
    weekendHoldingAllowed = false,
    newsTradingAllowed = true,
    notes = ''
  }) {
    if (!name || !name.trim()) {
      return Result.err('Account name is required');
    }

    const resolvedType = (accountType || type || 'challenge').toLowerCase();
    const size = parseFloat(startingBalance || accountSize) || 10000;
    const startBal = parseFloat(startingBalance || accountSize) || size;

    // Risk per trade: percentage
    const riskPct = parseFloat(riskPerTradePct !== undefined ? riskPerTradePct : (riskPerTradePercent !== undefined ? riskPerTradePercent : 1.0));
    const riskAmount = parseFloat((size * (riskPct / 100)).toFixed(2));

    // Daily loss limit: could be passed as dollar amount or percent
    let dailyLossPct = 5.0;
    let dailyLossAmount = parseFloat((size * 0.05).toFixed(2));
    if (dailyLossLimit !== undefined) {
      const val = parseFloat(dailyLossLimit);
      if (val > 100 || val > size * 0.5) {
        dailyLossAmount = val;
        dailyLossPct = parseFloat(((val / size) * 100).toFixed(2));
      } else {
        dailyLossPct = val;
        dailyLossAmount = parseFloat((size * (val / 100)).toFixed(2));
      }
    } else if (dailyLossLimitPercent !== undefined) {
      dailyLossPct = parseFloat(dailyLossLimitPercent);
      dailyLossAmount = parseFloat((size * (dailyLossPct / 100)).toFixed(2));
    }

    // Maximum drawdown: could be passed as dollar amount or percent
    let maxDdPct = 10.0;
    let maxDdAmount = parseFloat((size * 0.10).toFixed(2));
    if (maxDrawdown !== undefined) {
      const val = parseFloat(maxDrawdown);
      if (val > 100 || val > size * 0.5) {
        maxDdAmount = val;
        maxDdPct = parseFloat(((val / size) * 100).toFixed(2));
      } else {
        maxDdPct = val;
        maxDdAmount = parseFloat((size * (val / 100)).toFixed(2));
      }
    } else if (maximumDrawdownPercent !== undefined) {
      maxDdPct = parseFloat(maximumDrawdownPercent);
      maxDdAmount = parseFloat((size * (maxDdPct / 100)).toFixed(2));
    }

    // Profit target: could be passed as dollar amount or percent
    let profitTargetPct = 10.0;
    let profitTargetAmount = parseFloat((size * 0.10).toFixed(2));
    if (profitTarget !== undefined) {
      const val = parseFloat(profitTarget);
      if (val > 100 || val > size * 0.5) {
        profitTargetAmount = val;
        profitTargetPct = parseFloat(((val / size) * 100).toFixed(2));
      } else {
        profitTargetPct = val;
        profitTargetAmount = parseFloat((size * (val / 100)).toFixed(2));
      }
    } else if (profitTargetPercent !== undefined) {
      profitTargetPct = parseFloat(profitTargetPercent);
      profitTargetAmount = parseFloat((size * (profitTargetPct / 100)).toFixed(2));
    }

    const resolvedDeadline = challengeDeadline || deadline || '';

    const account = {
      name: name.trim(),
      type: resolvedType,
      accountType: resolvedType,
      broker: broker.trim(),
      accountNumberOrNickname: accountNumberOrNickname.trim() || `ACC-${Date.now().toString().slice(-4)}`,
      currency: currency.toUpperCase(),
      accountSize: size,
      startingBalance: startBal,
      currentBalance: startBal,
      currentEquity: startBal,
      equity: startBal,
      peakBalance: startBal,
      dailyPL: 0,
      totalPL: 0,
      status: 'ACTIVE', // 'ACTIVE', 'BLOWN', 'PASSED', 'FAILED', 'COMPLETED'
      riskPerTradePercent: riskPct,
      riskPerTradePct: riskPct,
      riskPerTradeAmount: riskAmount,
      dailyLossLimitPercent: dailyLossPct,
      dailyLossLimitAmount: dailyLossAmount,
      dailyLossLimit: dailyLossAmount,
      maximumDrawdownPercent: maxDdPct,
      maximumDrawdownAmount: maxDdAmount,
      maxDrawdown: maxDdAmount,
      profitTargetPercent: profitTargetPct,
      profitTargetAmount: profitTargetAmount,
      profitTarget: profitTargetAmount,
      challengeDeadline: resolvedDeadline,
      deadline: resolvedDeadline,
      minimumTradingDays: parseInt(minimumTradingDays, 10) || 5,
      maximumTradesPerDay: parseInt(maximumTradesPerDay, 10) || 5,
      weekendHoldingAllowed: !!weekendHoldingAllowed,
      newsTradingAllowed: !!newsTradingAllowed,
      notes: notes.trim(),
      userId: getActiveUserId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blownAt: null,
      passedAt: null,
      failedAt: null
    };

    const id = await db.tradingAccounts.add(account);
    await queueSyncMutation('tradingAccounts', id, 'create', { id, ...account });
    return Result.ok({ id, ...account });
  }

  /**
   * Validate account and trade risk before execution
   */
  static async validateTradeRisk(account, proposedRiskAmount = 0, enforceRiskCap = false) {
    if (!account) return Result.err('Account not found');
    if (account.status !== 'ACTIVE') {
      return Result.err(`Cannot place trade: Account status is ${account.status}. Only ACTIVE accounts can receive new trades.`);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const todayTrades = await db.trades
      .where('accountId').equals(account.id)
      .filter(t => t.closeDate && t.closeDate.startsWith(todayStr))
      .toArray();

    // 1. Trades per day limit
    if (account.maximumTradesPerDay && todayTrades.length >= account.maximumTradesPerDay) {
      return Result.err(`Daily trade cap reached: Maximum ${account.maximumTradesPerDay} trades allowed per day.`);
    }

    // 2. Today's loss tracking
    const todayLosses = Math.abs(
      todayTrades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0)
    );
    const dailyLimit = account.dailyLossLimitAmount || account.dailyLossLimit || 500;
    const dailyLossRemaining = Math.max(0, dailyLimit - todayLosses);

    // 3. Drawdown check
    const starting = account.startingBalance || account.accountSize || 10000;
    const equity = account.currentEquity || account.equity || account.currentBalance || starting;
    const currentDrawdown = Math.max(0, starting - equity);
    const maxDd = account.maximumDrawdownAmount || account.maxDrawdown || 1000;
    if (currentDrawdown >= maxDd) {
      return Result.err(`Maximum drawdown reached (-$${maxDd.toLocaleString()}). Account is BLOWN.`);
    }

    // 4. Proposed risk vs configured risk cap (when enforceRiskCap is true)
    if (enforceRiskCap && proposedRiskAmount > 0) {
      const allowedRisk = account.riskPerTradeAmount || (account.accountSize * ((account.riskPerTradePct || account.riskPerTradePercent || 1) / 100));
      if (proposedRiskAmount > (allowedRisk + 0.05)) {
        return Result.err(`Risk violation: Proposed risk of $${proposedRiskAmount.toFixed(2)} exceeds account cap of $${allowedRisk.toFixed(2)} (${account.riskPerTradePercent || account.riskPerTradePct}%).`);
      }
      if (proposedRiskAmount > (dailyLossRemaining + 0.05)) {
        return Result.err(`Risk violation: Proposed risk of $${proposedRiskAmount.toFixed(2)} exceeds daily loss remaining ($${dailyLossRemaining.toFixed(2)}).`);
      }
    }

    return Result.ok({ dailyLossRemaining, currentDrawdown });
  }

  /**
   * Execute and record trade
   */
  static async executeTrade({
    accountId,
    instrument = 'XAUUSD',
    direction = 'BUY',
    entryPrice,
    exitPrice,
    stopLoss,
    takeProfit,
    lotSize,
    positionSize = 1.0,
    setupType = 'Breakout',
    timeframe = '15m',
    reason = '',
    whatWentWell = '',
    whatWentWrong = '',
    lessons = '',
    emotionalState = 'Disciplined',
    notes = ''
  }) {
    if (!accountId) {
      return Result.err('A trading account must be selected. Every trade must belong to an account.');
    }

    const account = await db.tradingAccounts.get(parseInt(accountId, 10));
    if (!account) {
      return Result.err('Selected trading account does not exist.');
    }

    // Pre-execution risk validation
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const sl = parseFloat(stopLoss);
    const tp = parseFloat(takeProfit);
    const size = parseFloat(lotSize !== undefined ? lotSize : positionSize);

    if (!instrument || !instrument.trim()) return Result.err('Instrument is required (e.g. XAUUSD)');
    if (isNaN(entry) || isNaN(exit) || isNaN(size) || size <= 0) {
      return Result.err('Invalid trade prices or position size');
    }

    // Calculate approximate multiplier
    let multiplier = 100;
    const instUpper = instrument.toUpperCase();
    if (instUpper.includes('EUR') || instUpper.includes('GBP') || (instUpper.includes('USD') && !instUpper.includes('XAU'))) {
      multiplier = 100000;
    } else if (instUpper.includes('XAU') || instUpper.includes('GOLD')) {
      multiplier = 100;
    } else {
      multiplier = 10;
    }

    // Calculate risk
    const riskDiff = Math.abs(entry - (isNaN(sl) ? entry : sl));
    const riskAmount = parseFloat((riskDiff * size * multiplier).toFixed(2));

    const preCheck = await this.validateTradeRisk(account, riskAmount);
    if (!preCheck.success) {
      return preCheck;
    }

    // Calculate P/L
    const priceDiff = (direction === 'BUY') ? (exit - entry) : (entry - exit);
    const pnl = parseFloat((priceDiff * size * multiplier).toFixed(2));
    const pnlPercent = parseFloat(((pnl / account.currentBalance) * 100).toFixed(2));
    const result = pnl > 0 ? 'WIN' : (pnl < 0 ? 'LOSS' : 'BE');

    // Potential profit
    const potentialDiff = Math.abs(entry - (isNaN(tp) ? entry : tp));
    const potentialProfit = parseFloat((potentialDiff * size * multiplier).toFixed(2));
    const riskReward = riskAmount > 0 ? parseFloat((potentialProfit / riskAmount).toFixed(2)) : 0;

    // Update Account Balance & Equity
    const newBalance = parseFloat((account.currentBalance + pnl).toFixed(2));
    const newEquity = newBalance; // for closed trades
    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = nowIso.split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const startingBalance = account.startingBalance || account.accountSize || 10000;
    const prevPeak = account.peakBalance || startingBalance;
    const peakBalance = Math.max(prevPeak, newBalance);
    const dailyPL = parseFloat(((account.dailyPL || 0) + pnl).toFixed(2));
    const totalPL = parseFloat((newBalance - startingBalance).toFixed(2));

    // Calculate Trailing / Overall Drawdown from Peak
    const currentDrawdown = Math.max(
      Math.max(0, parseFloat((prevPeak - newEquity).toFixed(2))),
      Math.max(0, parseFloat((startingBalance - newEquity).toFixed(2)))
    );
    const currentDrawdownPercent = parseFloat(((currentDrawdown / startingBalance) * 100).toFixed(2));

    // Calculate Profit & Profit %
    const totalProfit = parseFloat((newBalance - startingBalance).toFixed(2));
    const totalProfitPercent = parseFloat(((totalProfit / startingBalance) * 100).toFixed(2));

    const maxDdAmount = account.maximumDrawdownAmount || account.maxDrawdown || (startingBalance * 0.10);

    // Blown & Challenge Pass Evaluation
    let newStatus = account.status;
    let blownAt = account.blownAt;
    let passedAt = account.passedAt;
    let failedAt = account.failedAt;
    let reasonMessage = '';
    let finalBalance = null;
    let totalLoss = null;
    let blownDate = null;
    let blownTime = null;

    // Check Drawdown Breach
    if (currentDrawdown >= maxDdAmount) {
      newStatus = 'BLOWN';
      blownAt = nowIso;
      failedAt = nowIso;
      blownDate = dateStr;
      blownTime = timeStr;
      finalBalance = newBalance;
      totalLoss = parseFloat(Math.abs(startingBalance - newBalance).toFixed(2));
      reasonMessage = `Max Drawdown Breached: -$${currentDrawdown.toLocaleString()} reached threshold of -$${maxDdAmount.toLocaleString()} (${currentDrawdownPercent}%).`;
    }

    // Check Challenge Target Achievement
    if (newStatus === 'ACTIVE' && (account.type === 'challenge' || account.accountType === 'challenge') && totalProfit >= (account.profitTargetAmount || account.profitTarget || 1000)) {
      const allTradesCount = await db.trades.where('accountId').equals(account.id).count();
      if ((allTradesCount + 1) >= (account.minimumTradingDays || 5)) {
        newStatus = 'PASSED';
        passedAt = nowIso;
        reasonMessage = `Profit target reached: +$${totalProfit.toLocaleString()} (+${totalProfitPercent}%) with required trading days completed.`;
      }
    }

    // Update account record
    const accountUpdates = {
      currentBalance: newBalance,
      currentEquity: newEquity,
      equity: newEquity,
      peakBalance,
      dailyPL,
      totalPL,
      status: newStatus,
      blownAt,
      passedAt,
      failedAt,
      notes: reasonMessage ? `${account.notes || ''} [${reasonMessage}]`.trim() : account.notes,
      updatedAt: nowIso
    };

    if (newStatus === 'BLOWN') {
      accountUpdates.finalBalance = finalBalance;
      accountUpdates.totalLoss = totalLoss;
      accountUpdates.blownDate = blownDate;
      accountUpdates.blownTime = blownTime;
      accountUpdates.blownReason = reasonMessage;
    }

    await db.tradingAccounts.update(account.id, accountUpdates);
    await queueSyncMutation('tradingAccounts', account.id, 'update', { id: account.id, ...accountUpdates });

    // Save Trade
    const tradeEntry = {
      accountId: account.id,
      userId: getActiveUserId(),
      instrument: instUpper,
      direction,
      entryPrice: entry,
      stopLoss: isNaN(sl) ? null : sl,
      takeProfit: isNaN(tp) ? null : tp,
      exitPrice: exit,
      positionSize: size,
      lotSize: size,
      openDate: `${dateStr} ${timeStr}`,
      closeDate: `${dateStr} ${timeStr}`,
      riskAmount,
      riskPercent: parseFloat(((riskAmount / account.currentBalance) * 100).toFixed(2)),
      potentialProfit,
      riskReward,
      pnl,
      pnlPercent,
      result,
      setupType,
      timeframe,
      reason: reason || 'Strategy setup execution',
      whatWentWell: whatWentWell || (result === 'WIN' ? 'Stuck to execution plan' : 'Respected risk limit'),
      whatWentWrong: whatWentWrong || (result === 'LOSS' ? 'Market went against position' : 'None'),
      lessons: lessons || 'Patience pays',
      emotionalState,
      notes: notes || `Trade ${direction} on ${instUpper}`,
      journalNotes: notes || reason || `Trade ${direction} on ${instUpper}`,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const tradeId = await db.trades.add(tradeEntry);
    tradeEntry.id = tradeId;
    await queueSyncMutation('trades', tradeId, 'create', tradeEntry);

    // Check achievements
    await AchievementService.checkAll();

    return Result.ok({
      trade: tradeEntry,
      account: { ...account, ...accountUpdates },
      wasBlown: newStatus === 'BLOWN',
      wasPassed: newStatus === 'PASSED',
      reason: reasonMessage
    });
  }

  /**
   * Calendar aggregation for an account
   */
  static async getAccountCalendar(accountId, monthStr = new Date().toISOString().slice(0, 7)) {
    const allTrades = await db.trades
      .where('accountId').equals(parseInt(accountId, 10))
      .toArray();
    const trades = allTrades.filter(matchesActiveUser);

    const calendarMap = {};

    trades.forEach(t => {
      const date = t.closeDate ? t.closeDate.split(' ')[0] : t.openDate.split(' ')[0];
      if (date && date.startsWith(monthStr)) {
        if (!calendarMap[date]) {
          calendarMap[date] = {
            date,
            tradesCount: 0,
            dailyPL: 0,
            trades: []
          };
        }
        calendarMap[date].tradesCount++;
        calendarMap[date].dailyPL = parseFloat((calendarMap[date].dailyPL + t.pnl).toFixed(2));
        calendarMap[date].trades.push(t);
      }
    });

    Object.values(calendarMap).forEach(d => {
      d.result = d.dailyPL > 0 ? 'WIN' : (d.dailyPL < 0 ? 'LOSS' : 'BE');
    });

    return calendarMap;
  }

  /**
   * Detailed performance metrics for an account
   */
  static async getAccountStatistics(accountId) {
    const aid = parseInt(accountId, 10);
    const account = await db.tradingAccounts.get(aid);
    if (!account || !matchesActiveUser(account)) return null;

    const rawTrades = await db.trades.where('accountId').equals(aid).toArray();
    const trades = rawTrades.filter(matchesActiveUser);
    const totalTrades = trades.length;

    if (totalTrades === 0) {
      return {
        account,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        profitFactor: 0,
        totalPL: 0,
        netPL: 0,
        drawdown: Math.max(0, account.startingBalance - (account.currentEquity || account.equity || account.currentBalance)),
        drawdownPercent: 0,
        profitPercent: 0
      };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const totalWinPL = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLossPL = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    const totalPL = parseFloat((totalWinPL - totalLossPL).toFixed(2));
    const winRate = Math.round((wins.length / totalTrades) * 100);
    const profitFactor = totalLossPL > 0 ? parseFloat((totalWinPL / totalLossPL).toFixed(2)) : (totalWinPL > 0 ? 99 : 0);

    const startingBalance = account.startingBalance || account.accountSize || 10000;
    const currentEquity = account.currentEquity || account.equity || account.currentBalance || startingBalance;
    const drawdown = Math.max(0, parseFloat((startingBalance - currentEquity).toFixed(2)));
    const drawdownPercent = parseFloat(((drawdown / startingBalance) * 100).toFixed(2));
    const profitPercent = parseFloat(((totalPL / startingBalance) * 100).toFixed(2));

    return {
      account,
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      winRate,
      profitFactor,
      totalPL,
      netPL: totalPL,
      drawdown,
      drawdownPercent,
      profitPercent,
      avgWin: wins.length > 0 ? Math.round(totalWinPL / wins.length) : 0,
      avgLoss: losses.length > 0 ? Math.round(totalLossPL / losses.length) : 0
    };
  }

  /**
   * Alias for getAccountStatistics with netPL field
   */
  static async getAccountStats(accountId) {
    return this.getAccountStatistics(accountId);
  }

  /**
   * Evaluate rules status (Safe, Warning, Limit reached, Rule breached)
   */
  static evaluateAccountRules(account, proposedRiskAmount = 0) {
    if (!account) return null;

    const startingBalance = account.startingBalance || account.accountSize || 10000;
    const currentEquity = account.currentEquity || account.equity || account.currentBalance || startingBalance;

    // 1. Drawdown
    const maxDdLimit = account.maximumDrawdownAmount || account.maxDrawdown || (startingBalance * ((account.maximumDrawdownPercent || 10) / 100));
    const currentDrawdown = Math.max(0, startingBalance - currentEquity);
    const ddRatio = maxDdLimit > 0 ? (currentDrawdown / maxDdLimit) : 0;

    let drawdownStatus = 'Safe';
    if (currentDrawdown > maxDdLimit || account.status === 'BLOWN') {
      drawdownStatus = 'Rule Breached';
    } else if (currentDrawdown === maxDdLimit && maxDdLimit > 0) {
      drawdownStatus = 'Limit Reached';
    } else if (ddRatio >= 0.8) {
      drawdownStatus = 'Warning';
    }

    // 2. Daily Loss Limit
    const dailyLimit = account.dailyLossLimitAmount || account.dailyLossLimit || (startingBalance * ((account.dailyLossLimitPercent || 5) / 100));
    let dailyLossStatus = 'Safe';
    const currentDailyLoss = Math.abs(account.dailyPL !== undefined && account.dailyPL < 0 ? account.dailyPL : 0);
    const dailyRatio = dailyLimit > 0 ? (currentDailyLoss / dailyLimit) : 0;

    if (currentDailyLoss > dailyLimit) {
      dailyLossStatus = 'Rule Breached';
    } else if (currentDailyLoss === dailyLimit && dailyLimit > 0) {
      dailyLossStatus = 'Limit Reached';
    } else if (dailyRatio >= 0.8) {
      dailyLossStatus = 'Warning';
    }

    // 3. Risk Per Trade
    const riskPctLimit = account.riskPerTradePercent || account.riskPerTradePct || 1.0;
    const maxRiskDollars = account.riskPerTradeAmount || (account.accountSize || startingBalance) * (riskPctLimit / 100);
    let riskStatus = 'Safe';
    if (proposedRiskAmount > 0) {
      if (proposedRiskAmount > maxRiskDollars) {
        riskStatus = 'Rule Breached';
      } else if (proposedRiskAmount === maxRiskDollars) {
        riskStatus = 'Limit Reached';
      } else if (proposedRiskAmount >= maxRiskDollars * 0.8) {
        riskStatus = 'Warning';
      }
    }

    // 4. Profit Target
    const profitTarget = account.profitTargetAmount || account.profitTarget || (startingBalance * ((account.profitTargetPercent || 10) / 100));
    const currentProfit = Math.max(0, account.totalPL !== undefined ? account.totalPL : (account.currentBalance - startingBalance));
    const profitRatio = profitTarget > 0 ? (currentProfit / profitTarget) : 0;
    let profitStatus = 'Safe';
    if (currentProfit >= profitTarget && profitTarget > 0) {
      profitStatus = 'Limit Reached';
    } else if (account.status === 'PASSED') {
      profitStatus = 'Limit Reached';
    } else if (profitRatio >= 0.8) {
      profitStatus = 'Warning';
    }

    // 5. Challenge Deadline
    let deadlineStatus = 'Safe';
    let daysRemaining = null;
    const dl = account.challengeDeadline || account.deadline;
    if (dl) {
      const deadlineDate = new Date(dl);
      const now = new Date();
      daysRemaining = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      if (daysRemaining < 0) {
        deadlineStatus = 'Rule Breached';
      } else if (daysRemaining === 0) {
        deadlineStatus = 'Limit Reached';
      } else if (daysRemaining <= 3) {
        deadlineStatus = 'Warning';
      }
    }

    return {
      drawdown: {
        limit: maxDdLimit,
        current: currentDrawdown,
        ratio: ddRatio,
        status: drawdownStatus
      },
      dailyLoss: {
        limit: dailyLimit,
        current: currentDailyLoss,
        status: dailyLossStatus
      },
      riskPerTrade: {
        limitPct: riskPctLimit,
        maxDollars: maxRiskDollars,
        status: riskStatus
      },
      profitTarget: {
        target: profitTarget,
        current: currentProfit,
        ratio: profitRatio,
        status: profitStatus
      },
      deadline: {
        date: dl,
        daysRemaining,
        status: deadlineStatus
      }
    };
  }

  static async getAccounts() {
    const rawAll = await db.tradingAccounts.toArray();
    return rawAll.filter(matchesActiveUser);
  }

  static async getAccountById(id) {
    if (!id) return null;
    const numericId = parseInt(id, 10);
    return (await db.tradingAccounts.get(numericId)) || (await db.tradingAccounts.get(id)) || null;
  }

  static async getAccountsPartitioned() {
    const rawAll = await db.tradingAccounts.toArray();
    const all = rawAll.filter(matchesActiveUser);
    return {
      active: all.filter(a => a.status === 'ACTIVE'),
      blown: all.filter(a => a.status === 'BLOWN'),
      passed: all.filter(a => a.status === 'PASSED'),
      all
    };
  }
}
