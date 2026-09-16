import Dexie from 'dexie';

export const db = new Dexie('GlowUpDB');

// Version 2 legacy schema
db.version(2).stores({
  users: '++id, name, email, createdAt',
  habits: '++id, name, frequency, archivedAt, createdAt',
  habitEntries: '++id, [habitId+date], habitId, date, completed',
  journalEntries: '++id, date, status, mood, createdAt',
  goals: '++id, name, category, status, deadline',
  goalMilestones: '++id, goalId, completed',
  transactions: '++id, name, type, category, date, recurring',
  budgets: '++id, month',
  tradingAccounts: '++id, name, type, status, broker',
  trades: '++id, accountId, instrument, direction, result, openDate, closeDate',
  weeklyReviews: '++id, weekStart, weekEnd, status',
  achievements: '++id, achievementKey, unlocked'
});

// Version 3 schema with multi-user isolation & sync queue
db.version(3).stores({
  users: '++id, userId, name, email, createdAt',
  habits: '++id, userId, name, frequency, archivedAt, createdAt',
  habitEntries: '++id, userId, [habitId+date], habitId, date, completed',
  journalEntries: '++id, userId, date, status, mood, createdAt',
  goals: '++id, userId, name, category, status, deadline',
  goalMilestones: '++id, userId, goalId, completed',
  transactions: '++id, userId, name, type, category, date, recurring',
  budgets: '++id, userId, month',
  tradingAccounts: '++id, userId, name, type, status, broker',
  trades: '++id, userId, accountId, instrument, direction, result, openDate, closeDate',
  weeklyReviews: '++id, userId, weekStart, weekEnd, status',
  achievements: '++id, userId, achievementKey, unlocked',
  syncQueue: '++id, userId, table, recordId, action, status, createdAt'
});

// Multi-User Context
let activeUserId = 'default_user';

export function setActiveUserId(uid) {
  activeUserId = uid || 'default_user';
}

export function getActiveUserId() {
  return activeUserId;
}

export async function queueSyncMutation(table, recordId, action, payload = {}) {
  try {
    if (db.syncQueue) {
      await db.syncQueue.add({
        userId: getActiveUserId(),
        table,
        recordId: String(recordId),
        action,
        payload,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    }
  } catch (err) {
    // console.warn('Could not queue sync mutation', err);
  }
}

// User-matching predicate
export function matchesActiveUser(item, targetUid) {
  if (!item) return false;
  const uid = (typeof targetUid === 'string' && targetUid) ? targetUid : getActiveUserId();
  if (item.userId === uid) return true;
  if (!item.userId && uid === 'default_user') return true;
  return false;
}

// ==========================================
// 1. HABIT SERVICE
// ==========================================
export const HabitService = {
  async getAll(includeArchived = false) {
    let habits = await db.habits.filter(h => matchesActiveUser(h)).toArray();
    if (!includeArchived) {
      habits = habits.filter(h => !h.archivedAt);
    }
    return habits;
  },

  async create({ name, description = '', frequency = 'daily', target = 7 }) {
    if (!name || !name.trim()) throw new Error('Habit name is required');
    const habit = {
      userId: getActiveUserId(),
      name: name.trim(),
      description: description.trim(),
      frequency,
      target: parseInt(target, 10) || 7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null
    };
    const id = await db.habits.add(habit);
    await queueSyncMutation('habits', id, 'create', habit);
    return { id, ...habit };
  },

  async update(id, updates) {
    const updated = { ...updates, updatedAt: new Date().toISOString() };
    await db.habits.update(id, updated);
    await queueSyncMutation('habits', id, 'update', updated);
    return db.habits.get(id);
  },

  async archive(id) {
    const updated = { archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await db.habits.update(id, updated);
    await queueSyncMutation('habits', id, 'update', updated);
  },

  async toggleCompletion(habitId, dateStr = new Date().toISOString().split('T')[0]) {
    const existing = await db.habitEntries
      .filter(e => e.habitId === habitId && e.date === dateStr && matchesActiveUser(e))
      .first();
    const nextCompleted = !existing?.completed;

    if (existing) {
      await db.habitEntries.update(existing.id, {
        completed: nextCompleted,
        updatedAt: new Date().toISOString(),
        createdAt: nextCompleted ? new Date().toISOString() : existing.createdAt
      });
      await queueSyncMutation('habitEntries', existing.id, 'update', { completed: nextCompleted });
    } else {
      const entry = {
        userId: getActiveUserId(),
        habitId,
        date: dateStr,
        completed: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const id = await db.habitEntries.add(entry);
      await queueSyncMutation('habitEntries', id, 'create', entry);
    }

    // Check achievement triggers
    await AchievementService.checkAll();
    return nextCompleted;
  },

  async getStreaks(habitId) {
    const entries = await db.habitEntries
      .where('habitId').equals(habitId)
      .toArray();

    const completedDates = new Set(
      entries.filter(e => e.completed).map(e => e.date)
    );

    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    const today = new Date();
    // Check backwards from today or yesterday
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      if (completedDates.has(dateStr)) {
        tempStreak++;
        if (i === 0 || i === 1 && currentStreak === 0) {
          currentStreak = tempStreak;
        }
      } else {
        if (i === 0) {
          // If not completed today, check if active yesterday
          continue;
        }
        bestStreak = Math.max(bestStreak, tempStreak);
        tempStreak = 0;
      }
    }
    bestStreak = Math.max(bestStreak, tempStreak, currentStreak);

    return { currentStreak, bestStreak };
  },

  async getDailyCompletionStats(dateStr = new Date().toISOString().split('T')[0]) {
    const habits = await this.getAll(false);
    if (habits.length === 0) return { total: 0, completed: 0, percentage: 0 };

    const entries = await db.habitEntries.where('date').equals(dateStr).toArray();
    const completedMap = new Set(entries.filter(e => e.completed).map(e => e.habitId));

    const completedCount = habits.filter(h => completedMap.has(h.id)).length;
    const percentage = Math.round((completedCount / habits.length) * 100);

    return {
      total: habits.length,
      completed: completedCount,
      percentage
    };
  }
};

// ==========================================
// 2. JOURNAL SERVICE
// ==========================================
export const JournalService = {
  async getToday(dateStr = new Date().toISOString().split('T')[0]) {
    const all = await db.journalEntries.filter(j => j.date === dateStr && matchesActiveUser(j)).toArray();
    return all[0] || null;
  },

  async getAll() {
    return db.journalEntries.filter(j => matchesActiveUser(j)).reverse().toArray();
  },

  async createOrUpdate(data) {
    return this.save(data);
  },

  async save({ date, mood = 'focused', gratitude = '', wins = '', improvements = '', notes = '', status = 'completed' }) {
    const dateStr = date || new Date().toISOString().split('T')[0];
    const existing = await db.journalEntries.filter(j => j.date === dateStr && matchesActiveUser(j)).first();
    const now = new Date().toISOString();

    const entryData = {
      userId: getActiveUserId(),
      date: dateStr,
      mood,
      gratitude: gratitude.trim(),
      wins: wins.trim(),
      improvements: improvements.trim(),
      notes: notes.trim(),
      status, // 'draft' or 'completed'
      updatedAt: now
    };

    let id;
    if (existing) {
      await db.journalEntries.update(existing.id, entryData);
      id = existing.id;
      await queueSyncMutation('journalEntries', id, 'update', entryData);
    } else {
      entryData.createdAt = now;
      id = await db.journalEntries.add(entryData);
      await queueSyncMutation('journalEntries', id, 'create', entryData);
    }

    if (status === 'completed') {
      await AchievementService.checkAll();
    }

    return { id, ...entryData };
  },

  async delete(id) {
    await db.journalEntries.delete(id);
    await queueSyncMutation('journalEntries', id, 'delete');
  },

  async search(query = '') {
    const q = query.toLowerCase().trim();
    const all = await this.getAll();
    if (!q) return all;
    return all.filter(e =>
      (e.notes && e.notes.toLowerCase().includes(q)) ||
      (e.gratitude && e.gratitude.toLowerCase().includes(q)) ||
      (e.wins && e.wins.toLowerCase().includes(q)) ||
      (e.date && e.date.includes(q))
    );
  },

  async getWritingStreak() {
    const entries = await db.journalEntries
      .filter(e => e.status === 'completed' && matchesActiveUser(e))
      .toArray();
    const entryDates = new Set(entries.map(e => e.date));

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (entryDates.has(dateStr)) {
        streak++;
      } else {
        if (i === 0) continue;
        break;
      }
    }
    return streak;
  }
};

// ==========================================
// 3. GOAL SERVICE
// ==========================================
export const GoalService = {
  async getAll() {
    return db.goals.filter(g => matchesActiveUser(g)).toArray();
  },

  async get(id) {
    const goal = await db.goals.get(parseInt(id, 10));
    if (!goal || !matchesActiveUser(goal)) return null;
    const milestones = await db.goalMilestones
      .filter(m => m.goalId === goal.id && matchesActiveUser(m))
      .toArray();
    return { ...goal, milestones };
  },

  async create({ name, description = '', category = 'Personal Growth', target = 100, deadline = '' }) {
    if (!name || !name.trim()) throw new Error('Goal name is required');
    const goal = {
      userId: getActiveUserId(),
      name: name.trim(),
      description: description.trim(),
      category,
      target: parseFloat(target) || 100,
      currentProgress: 0,
      deadline,
      status: 'ACTIVE', // 'ACTIVE', 'COMPLETED', 'PAUSED'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const id = await db.goals.add(goal);
    await queueSyncMutation('goals', id, 'create', goal);
    return { id, ...goal };
  },

  async addMilestone(goalId, title) {
    if (!title || !title.trim()) throw new Error('Milestone title is required');
    const milestone = {
      userId: getActiveUserId(),
      goalId: parseInt(goalId, 10),
      title: title.trim(),
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const id = await db.goalMilestones.add(milestone);
    await queueSyncMutation('goalMilestones', id, 'create', milestone);
    await this.recalculateProgress(goalId);
    return { id, ...milestone };
  },

  async toggleMilestone(milestoneId) {
    const m = await db.goalMilestones.get(parseInt(milestoneId, 10));
    if (!m) return null;
    const nextCompleted = !m.completed;
    const updated = {
      completed: nextCompleted,
      completedAt: nextCompleted ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    };
    await db.goalMilestones.update(m.id, updated);
    await queueSyncMutation('goalMilestones', m.id, 'update', updated);

    await this.recalculateProgress(m.goalId);
    await AchievementService.checkAll();
    return nextCompleted;
  },

  async recalculateProgress(goalId) {
    const gid = parseInt(goalId, 10);
    const milestones = await db.goalMilestones.filter(m => m.goalId === gid && matchesActiveUser(m)).toArray();
    if (milestones.length === 0) return;

    const completed = milestones.filter(m => m.completed).length;
    const progress = Math.round((completed / milestones.length) * 100);
    const status = progress === 100 ? 'COMPLETED' : 'ACTIVE';

    const updated = {
      currentProgress: progress,
      status,
      updatedAt: new Date().toISOString()
    };
    await db.goals.update(gid, updated);
    await queueSyncMutation('goals', gid, 'update', updated);
  },

  async delete(id) {
    const gid = parseInt(id, 10);
    await db.goals.delete(gid);
    await db.goalMilestones.where('goalId').equals(gid).delete();
    await queueSyncMutation('goals', gid, 'delete');
  }
};

// ==========================================
// 4. MONEY SERVICE
// ==========================================
export const MoneyService = {
  async getAllTransactions() {
    return db.transactions.filter(t => matchesActiveUser(t)).reverse().toArray();
  },

  async addTransaction({ name, type = 'expense', amount, category = 'General', date, notes = '', recurring = false }) {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Transaction amount must be a positive number');
    }

    const tx = {
      userId: getActiveUserId(),
      name: (name || 'Transaction').trim(),
      type: type.toLowerCase() === 'income' ? 'income' : 'expense',
      amount: numAmount,
      category: category.trim(),
      date: date || new Date().toISOString().split('T')[0],
      notes: notes.trim(),
      recurring: !!recurring,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const id = await db.transactions.add(tx);
    await queueSyncMutation('transactions', id, 'create', tx);
    return { id, ...tx };
  },

  async editTransaction(id, updates) {
    const tid = parseInt(id, 10);
    if (updates.amount) {
      updates.amount = parseFloat(updates.amount);
    }
    const updated = { ...updates, updatedAt: new Date().toISOString() };
    await db.transactions.update(tid, updated);
    await queueSyncMutation('transactions', tid, 'update', updated);
    return db.transactions.get(tid);
  },

  async deleteTransaction(id) {
    const tid = parseInt(id, 10);
    await db.transactions.delete(tid);
    await queueSyncMutation('transactions', tid, 'delete');
  },

  async getFinancialStats(monthYearStr = new Date().toISOString().slice(0, 7)) {
    const all = await db.transactions.filter(t => matchesActiveUser(t)).toArray();
    const monthTx = all.filter(t => t.date && t.date.startsWith(monthYearStr));

    const totalIncome = all.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = all.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncome - totalExpenses;

    const monthlyIncome = monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const monthlyExpenses = monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

    return {
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      netBalance: parseFloat(netBalance.toFixed(2)),
      monthlyIncome: parseFloat(monthlyIncome.toFixed(2)),
      monthlyExpenses: parseFloat(monthlyExpenses.toFixed(2))
    };
  },

  async getBudgetStatus(monthYearStr = new Date().toISOString().slice(0, 7)) {
    const budget = await db.budgets.filter(b => b.month === monthYearStr && matchesActiveUser(b)).first();
    const totalLimit = budget?.totalLimit || 4000;

    const monthTx = await db.transactions
      .filter(t => t.date && t.date.startsWith(monthYearStr) && matchesActiveUser(t))
      .toArray();
    const spent = monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const remaining = Math.max(0, totalLimit - spent);
    const percentageUsed = Math.min(100, Math.round((spent / totalLimit) * 100));

    return {
      month: monthYearStr,
      totalLimit,
      spent: parseFloat(spent.toFixed(2)),
      remaining: parseFloat(remaining.toFixed(2)),
      percentageUsed
    };
  }
};

// ==========================================
// 5. ACHIEVEMENTS SERVICE
// ==========================================
export const AchievementService = {
  async getAll() {
    return db.achievements.filter(a => matchesActiveUser(a)).toArray();
  },

  async checkAll() {
    const journalCount = await db.journalEntries.where('status').equals('completed').count();
    const habitStreak = await HabitService.getStreaks(1); // general benchmark
    const completedGoalsCount = await db.goals.where('status').equals('COMPLETED').count();
    const budgetCount = await db.budgets.count();
    const tradesWithNotes = await db.trades.filter(t => !!t.notes && t.notes.length > 5).count();

    const checkAndUnlock = async (key, condition) => {
      if (condition) {
        const ach = await db.achievements.where('achievementKey').equals(key).first();
        if (ach && !ach.unlocked) {
          await db.achievements.update(ach.id, {
            unlocked: true,
            unlockedAt: new Date().toISOString().split('T')[0]
          });
        }
      }
    };

    await checkAndUnlock('first_journal', journalCount >= 1);
    await checkAndUnlock('7_day_streak', habitStreak.currentStreak >= 7 || habitStreak.bestStreak >= 7);
    await checkAndUnlock('first_goal_completed', completedGoalsCount >= 1);
    await checkAndUnlock('budget_started', budgetCount >= 1);
    await checkAndUnlock('first_trade_journal', tradesWithNotes >= 1);
  },

  async unlockManual(key) {
    const ach = await db.achievements.where('achievementKey').equals(key).first();
    if (ach && !ach.unlocked) {
      await db.achievements.update(ach.id, {
        unlocked: true,
        unlockedAt: new Date().toISOString().split('T')[0]
      });
    }
  }
};

// ==========================================
// INITIAL DATA SEEDER (ISOLATED & REALISTIC)
// ==========================================
export async function seedInitialData() {
  const userCount = await db.users.count();
  if (userCount > 0) return;

  console.log('Seeding initial Glow Up data into IndexedDB (Clean & Functional)...');

  // 1. User
  await db.users.add({
    id: 1,
    name: 'Alex Lawson',
    email: 'alex@glowup.io',
    profileInfo: 'Disciplined trader and high-performance creator.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // 2. Habits
  const habitIds = await db.habits.bulkAdd([
    { name: 'Morning meditation & breathwork', description: '10 min mindfulness session', frequency: 'daily', target: 7, createdAt: new Date().toISOString(), archivedAt: null },
    { name: 'Workout session', description: '45 min strength and mobility training', frequency: 'daily', target: 5, createdAt: new Date().toISOString(), archivedAt: null },
    { name: 'Daily Journal', description: 'Gratitude, wins, and daily reflection', frequency: 'daily', target: 7, createdAt: new Date().toISOString(), archivedAt: null },
    { name: 'Review goals', description: 'Weekly & monthly milestone alignment', frequency: 'daily', target: 7, createdAt: new Date().toISOString(), archivedAt: null },
    { name: 'Evening reflection', description: 'Screen-free wind-down', frequency: 'daily', target: 7, createdAt: new Date().toISOString(), archivedAt: null },
    { name: 'Hydration 3L', description: '3 liters of water throughout the day', frequency: 'daily', target: 7, createdAt: new Date().toISOString(), archivedAt: null },
    { name: 'Cold shower', description: '2 min cold exposure for mental resilience', frequency: 'daily', target: 7, createdAt: new Date().toISOString(), archivedAt: null },
    { name: 'Read 10 pages', description: 'Psychology and trading systems literature', frequency: 'daily', target: 7, createdAt: new Date().toISOString(), archivedAt: null }
  ], { allKeys: true });

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().split('T')[0];

  // Seed completions for today
  await db.habitEntries.bulkAdd([
    { habitId: habitIds[0], date: todayStr, completed: true, createdAt: new Date().toISOString() },
    { habitId: habitIds[1], date: todayStr, completed: true, createdAt: new Date().toISOString() },
    { habitId: habitIds[2], date: todayStr, completed: false, createdAt: new Date().toISOString() },
    { habitId: habitIds[3], date: todayStr, completed: false, createdAt: new Date().toISOString() },
    { habitId: habitIds[4], date: todayStr, completed: false, createdAt: new Date().toISOString() },
    { habitId: habitIds[5], date: todayStr, completed: false, createdAt: new Date().toISOString() }
  ]);

  // 3. Journal Entries
  await db.journalEntries.bulkAdd([
    {
      date: todayStr,
      mood: 'focused',
      gratitude: 'Morning clarity, clean execution, and patience.',
      wins: 'Stuck to risk parameters and completed 45m workout.',
      improvements: 'Avoid opening charting software after 5 PM.',
      notes: 'Market respected London liquidity sweep. Executed plan with zero hesitation.',
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      date: yesterday,
      mood: 'disciplined',
      gratitude: 'Patience when setups did not trigger.',
      wins: 'Preserved capital on choppy news session.',
      improvements: 'More sleep before European open.',
      notes: 'No trade taken today because conditions lacked A+ confluence. Capital preserved.',
      status: 'completed',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      date: twoDaysAgo,
      mood: 'calm',
      gratitude: 'Steady compounding and structured routine.',
      wins: 'Took partials into liquidity as planned.',
      improvements: 'Keep moving stop to breakeven calmly.',
      notes: 'Clean trade on Asian high sweep. Followed plan to the letter.',
      status: 'completed',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: new Date(Date.now() - 172800000).toISOString()
    }
  ]);

  // 4. Goals
  const g1 = await db.goals.add({
    name: 'Funded Trader Certification ($100k)',
    title: 'Funded Trader Certification ($100k)',
    description: 'Pass 2-step prop evaluation with strict 1% risk per trade.',
    category: 'Trading',
    target: 100,
    currentProgress: 66,
    progress: 66,
    deadline: '2026-12-31',
    targetDate: '2026-12-31',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const g2 = await db.goals.add({
    name: 'Emergency Capital Buffer ($20,000)',
    title: 'Emergency Capital Buffer ($20,000)',
    description: 'Maintain 6-month living expenses in high-yield liquid vault.',
    category: 'Finance',
    target: 20000,
    currentProgress: 75,
    progress: 75,
    deadline: '2026-11-30',
    targetDate: '2026-11-30',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const g3 = await db.goals.add({
    name: 'Physical Peak Conditioning',
    title: 'Physical Peak Conditioning',
    description: 'Reach 12% body fat with consistent resistance and cardio training.',
    category: 'Health',
    target: 100,
    currentProgress: 50,
    progress: 50,
    deadline: '2026-12-15',
    targetDate: '2026-12-15',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await db.goalMilestones.bulkAdd([
    { goalId: g1, title: 'Phase 1 (+8%) Passed', completed: true, completedAt: new Date().toISOString() },
    { goalId: g1, title: 'Phase 2 (+5%) Target Reached', completed: true, completedAt: new Date().toISOString() },
    { goalId: g1, title: 'First Payout Withdrawn', completed: false, completedAt: null },
    { goalId: g2, title: 'Reach $10k balance', completed: true, completedAt: new Date().toISOString() },
    { goalId: g2, title: 'Reach $15k balance', completed: true, completedAt: new Date().toISOString() }
  ]);

  // 5. Transactions
  await db.transactions.bulkAdd([
    { name: 'Prop Payout', type: 'income', amount: 4850.00, category: 'Trading Payout', date: todayStr, notes: 'Profit split payment', recurring: false, createdAt: new Date().toISOString() },
    { name: 'Gym Club', type: 'expense', amount: 145.00, category: 'Health & Fitness', date: todayStr, notes: 'Monthly membership', recurring: true, createdAt: new Date().toISOString() },
    { name: 'Meal Prep', type: 'expense', amount: 68.50, category: 'Groceries', date: todayStr, notes: 'Organic groceries', recurring: false, createdAt: new Date().toISOString() },
    { name: 'TradingView Sub', type: 'expense', amount: 59.95, category: 'Tools', date: yesterday, notes: 'Annual charting renewal', recurring: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
    { name: 'Books & Learning', type: 'expense', amount: 42.00, category: 'Education', date: twoDaysAgo, notes: 'Trading psychology manuals', recurring: false, createdAt: new Date(Date.now() - 172800000).toISOString() }
  ]);

  await db.budgets.add({
    month: todayStr.slice(0, 7),
    totalLimit: 4000,
    categories: [
      { name: 'Living & Housing', limit: 2000, spent: 1800 },
      { name: 'Food & Nutrition', limit: 800, spent: 480 },
      { name: 'Trading Tools', limit: 300, spent: 213 }
    ]
  });

  // 6. Trading Accounts
  const acc1 = await db.tradingAccounts.add({
    name: 'Apex 50k Prop • Main',
    type: 'funded',
    broker: 'Tradovate',
    accountNumberOrNickname: 'APEX-88421',
    currency: 'USD',
    accountSize: 50000,
    startingBalance: 50000,
    currentBalance: 52840,
    currentEquity: 52840,
    status: 'ACTIVE',
    riskPerTradePercent: 1.0,
    riskPerTradeAmount: 500,
    dailyLossLimitPercent: 3.0,
    dailyLossLimitAmount: 1500,
    maximumDrawdownPercent: 5.0,
    maximumDrawdownAmount: 2500,
    profitTargetPercent: 10.0,
    profitTargetAmount: 5000,
    challengeDeadline: '2026-12-31',
    minimumTradingDays: 5,
    maximumTradesPerDay: 4,
    weekendHoldingAllowed: false,
    newsTradingAllowed: true,
    notes: 'Primary funded account. Strict trailing drawdown.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    blownAt: null,
    passedAt: null,
    failedAt: null
  });

  // 7. Trades
  await db.trades.add({
    accountId: acc1,
    instrument: 'XAUUSD',
    direction: 'BUY',
    entryPrice: 2580.40,
    stopLoss: 2574.00,
    takeProfit: 2600.00,
    exitPrice: 2596.50,
    positionSize: 0.80,
    openDate: `${todayStr} 08:30`,
    closeDate: `${todayStr} 11:15`,
    riskAmount: 512.00,
    riskPercent: 0.97,
    potentialProfit: 1568.00,
    riskReward: 3.06,
    pnl: 1288.00,
    pnlPercent: 2.44,
    result: 'WIN',
    setupType: 'London Breakout',
    timeframe: '15m',
    reason: 'Break and retest of session highs with volume expansion',
    whatWentWell: 'Waited patiently for 15m candle close',
    whatWentWrong: 'Exited slightly before final TP',
    lessons: 'Trust the higher timeframe trend',
    emotionalState: 'Calm & disciplined',
    notes: 'Clean execution',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // 8. Achievements
  await db.achievements.bulkAdd([
    { achievementKey: 'first_journal', title: 'First Journal', description: 'Log your first completed daily journal reflection', icon: 'edit_note', unlocked: true, unlockedAt: todayStr },
    { achievementKey: '7_day_streak', title: '7 Day Streak', description: 'Maintain a 7-day habit or journaling streak', icon: 'local_fire_department', unlocked: false, unlockedAt: null },
    { achievementKey: 'first_goal_completed', title: 'Goal Crusher', description: 'Complete 100% of milestones on a goal', icon: 'military_tech', unlocked: false, unlockedAt: null },
    { achievementKey: 'budget_started', title: 'Budget Started', description: 'Establish your monthly financial budget', icon: 'account_balance_wallet', unlocked: true, unlockedAt: todayStr },
    { achievementKey: 'first_trade_journal', title: 'Disciplined Trader', description: 'Record a trade with detailed review notes', icon: 'shield', unlocked: true, unlockedAt: todayStr },
    { achievementKey: 'first_backup', title: 'Data Guardian', description: 'Export a secure JSON backup of your data', icon: 'cloud_done', unlocked: false, unlockedAt: null }
  ]);

  console.log('Seeding completed successfully!');
}
