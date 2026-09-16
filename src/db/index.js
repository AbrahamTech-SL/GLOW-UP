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

// Version 4 schema: High-performance compound indexes for multi-user queries & pagination
db.version(4).stores({
  users: '++id, userId, name, email, createdAt',
  habits: '++id, userId, [userId+archivedAt], name, frequency, archivedAt, createdAt',
  habitEntries: '++id, userId, [userId+date], [habitId+date], habitId, date, completed',
  journalEntries: '++id, userId, [userId+date], date, status, mood, createdAt',
  goals: '++id, userId, [userId+status], name, category, status, deadline',
  goalMilestones: '++id, userId, [userId+goalId], goalId, completed',
  transactions: '++id, userId, [userId+date], [userId+type], name, type, category, date, recurring',
  budgets: '++id, userId, [userId+month], month',
  tradingAccounts: '++id, userId, [userId+status], name, type, status, broker',
  trades: '++id, userId, [userId+accountId], accountId, instrument, direction, result, openDate, closeDate',
  weeklyReviews: '++id, userId, [userId+weekStart], weekStart, weekEnd, status',
  achievements: '++id, userId, [userId+achievementKey], achievementKey, unlocked',
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
    const uid = getActiveUserId();
    let habits;
    try {
      habits = await db.habits.where('userId').equals(uid).toArray();
    } catch {
      habits = await db.habits.filter(h => matchesActiveUser(h, uid)).toArray();
    }
    if (uid === 'default_user' && habits.length === 0) {
      const all = await db.habits.toArray();
      habits = all.filter(h => matchesActiveUser(h, uid));
    }
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

  async get(id) {
    const hid = parseInt(id, 10);
    return db.habits.get(hid);
  },

  async update(id, updates) {
    const hid = parseInt(id, 10);
    const updated = { ...updates, updatedAt: new Date().toISOString() };
    await db.habits.update(hid, updated);
    await queueSyncMutation('habits', hid, 'update', updated);
    return db.habits.get(hid);
  },

  async archive(id) {
    const updated = { archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await db.habits.update(id, updated);
    await queueSyncMutation('habits', id, 'update', updated);
  },

  async delete(id) {
    const hid = parseInt(id, 10);
    await db.habitEntries.where('habitId').equals(hid).delete();
    await db.habits.delete(hid);
    await queueSyncMutation('habits', hid, 'delete');
  },

  async toggleCompletion(habitId, dateStr = new Date().toISOString().split('T')[0]) {
    const hid = parseInt(habitId, 10);
    let existing = null;
    try {
      existing = await db.habitEntries.where('[habitId+date]').equals([hid, dateStr]).first();
      if (existing && !matchesActiveUser(existing)) existing = null;
    } catch {
      // fallback
    }
    if (!existing) {
      existing = await db.habitEntries
        .filter(e => (e.habitId === hid || e.habitId === habitId) && e.date === dateStr && matchesActiveUser(e))
        .first();
    }
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
        habitId: hid,
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

  async toggle(habitId, dateStr = new Date().toISOString().split('T')[0]) {
    return this.toggleCompletion(habitId, dateStr);
  },

  async isCompletedToday(habitId, dateStr = new Date().toISOString().split('T')[0]) {
    const hid = parseInt(habitId, 10);
    let entry = null;
    try {
      entry = await db.habitEntries.where('[habitId+date]').equals([hid, dateStr]).first();
      if (entry && !matchesActiveUser(entry)) entry = null;
    } catch {
      // fallback
    }
    if (!entry) {
      entry = await db.habitEntries
        .filter(e => (e.habitId === hid || e.habitId === habitId) && e.date === dateStr && matchesActiveUser(e))
        .first();
    }
    return !!entry?.completed;
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

  async getDailyCompletionStats(dateStr = new Date().toISOString().split('T')[0], preloadedHabits = null) {
    const habits = preloadedHabits || await this.getAll(false);
    if (habits.length === 0) return { total: 0, completed: 0, percentage: 0 };

    const uid = getActiveUserId();
    let entries;
    try {
      entries = await db.habitEntries.where('[userId+date]').equals([uid, dateStr]).toArray();
    } catch {
      entries = await db.habitEntries.where('date').equals(dateStr).toArray();
      entries = entries.filter(e => matchesActiveUser(e, uid));
    }
    if (entries.length === 0 && uid === 'default_user') {
      const allEntries = await db.habitEntries.where('date').equals(dateStr).toArray();
      entries = allEntries.filter(e => matchesActiveUser(e, uid));
    }

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
    const uid = getActiveUserId();
    let entry = null;
    try {
      entry = await db.journalEntries.where('[userId+date]').equals([uid, dateStr]).first();
    } catch {
      // fallback
    }
    if (!entry) {
      entry = await db.journalEntries.filter(j => j.date === dateStr && matchesActiveUser(j, uid)).first();
    }
    return entry || null;
  },

  async getAll(limit = null, offset = 0) {
    const uid = getActiveUserId();
    let entries;
    try {
      entries = await db.journalEntries.where('userId').equals(uid).reverse().toArray();
    } catch {
      entries = await db.journalEntries.filter(j => matchesActiveUser(j, uid)).reverse().toArray();
    }
    if (uid === 'default_user' && entries.length === 0) {
      const all = await db.journalEntries.toArray();
      entries = all.filter(j => matchesActiveUser(j, uid)).reverse();
    }
    if (typeof limit === 'number' && limit > 0) {
      return entries.slice(offset, offset + limit);
    }
    return entries;
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
    const uid = getActiveUserId();
    let goals;
    try {
      goals = await db.goals.where('userId').equals(uid).toArray();
    } catch {
      goals = await db.goals.filter(g => matchesActiveUser(g, uid)).toArray();
    }
    if (uid === 'default_user' && goals.length === 0) {
      const all = await db.goals.toArray();
      goals = all.filter(g => matchesActiveUser(g, uid));
    }
    return goals;
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
    if (milestones.length === 0) {
      const updated = { currentProgress: 0, status: 'ACTIVE', updatedAt: new Date().toISOString() };
      await db.goals.update(gid, updated);
      await queueSyncMutation('goals', gid, 'update', updated);
      return;
    }

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

  async deleteMilestone(milestoneId) {
    const mid = parseInt(milestoneId, 10);
    const m = await db.goalMilestones.get(mid);
    if (!m) return;
    const goalId = m.goalId;
    await db.goalMilestones.delete(mid);
    await queueSyncMutation('goalMilestones', mid, 'delete');
    await this.recalculateProgress(goalId);
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
  async getAllTransactions(limit = null, offset = 0) {
    const uid = getActiveUserId();
    let txs;
    try {
      txs = await db.transactions.where('userId').equals(uid).reverse().toArray();
    } catch {
      txs = await db.transactions.filter(t => matchesActiveUser(t, uid)).reverse().toArray();
    }
    if (uid === 'default_user' && txs.length === 0) {
      const all = await db.transactions.toArray();
      txs = all.filter(t => matchesActiveUser(t, uid)).reverse();
    }
    if (typeof limit === 'number' && limit > 0) {
      return txs.slice(offset, offset + limit);
    }
    return txs;
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
    const savingsRate = totalIncome > 0 ? Math.max(0, Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)) : 0;

    return {
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      netBalance: parseFloat(netBalance.toFixed(2)),
      monthlyIncome: parseFloat(monthlyIncome.toFixed(2)),
      monthlyExpenses: parseFloat(monthlyExpenses.toFixed(2)),
      savingsRate
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
// INITIAL DATA SEEDER (CLEAN CATALOG ONLY — ZERO FAKE DATA)
// ==========================================
export async function seedInitialData() {
  // Ensure default achievements catalog exists, but all locked (unlocked: false)
  // This is SYSTEM catalog data, NOT personal user data.
  // No habits, journals, goals, transactions, or trades are seeded.
  // A new user starts with a completely empty personal app.
  const achCount = await db.achievements.count();
  if (achCount === 0) {
    await db.achievements.bulkAdd([
      { achievementKey: 'first_journal', title: 'First Journal', description: 'Log your first completed daily journal reflection', icon: 'edit_note', unlocked: false, unlockedAt: null },
      { achievementKey: '7_day_streak', title: '7 Day Streak', description: 'Maintain a 7-day habit or journaling streak', icon: 'local_fire_department', unlocked: false, unlockedAt: null },
      { achievementKey: 'first_goal_completed', title: 'Goal Crusher', description: 'Complete 100% of milestones on a goal', icon: 'military_tech', unlocked: false, unlockedAt: null },
      { achievementKey: 'budget_started', title: 'Budget Started', description: 'Establish your monthly financial budget', icon: 'account_balance_wallet', unlocked: false, unlockedAt: null },
      { achievementKey: 'first_trade_journal', title: 'Disciplined Trader', description: 'Record a trade with detailed review notes', icon: 'shield', unlocked: false, unlockedAt: null },
      { achievementKey: 'first_backup', title: 'Data Guardian', description: 'Export a secure JSON backup of your data', icon: 'cloud_done', unlocked: false, unlockedAt: null }
    ]);
  }
}

// ==========================================
// SAFE CLEANUP / RESET PROCESS (ZERO ORPHANS, ZERO FAKE DATA)
// ==========================================
export async function cleanResetUserData(targetUid) {
  const uid = targetUid || getActiveUserId();

  // 1. Delete all application data records for target user in Dexie
  await Promise.all([
    db.habits.filter(item => matchesActiveUser(item, uid)).delete(),
    db.habitEntries.filter(item => matchesActiveUser(item, uid)).delete(),
    db.journalEntries.filter(item => matchesActiveUser(item, uid)).delete(),
    db.goals.filter(item => matchesActiveUser(item, uid)).delete(),
    db.goalMilestones.filter(item => matchesActiveUser(item, uid)).delete(),
    db.transactions.filter(item => matchesActiveUser(item, uid)).delete(),
    db.budgets.filter(item => matchesActiveUser(item, uid)).delete(),
    db.tradingAccounts.filter(item => matchesActiveUser(item, uid)).delete(),
    db.trades.filter(item => matchesActiveUser(item, uid)).delete(),
    db.weeklyReviews.filter(item => matchesActiveUser(item, uid)).delete(),
    db.syncQueue.filter(item => matchesActiveUser(item, uid)).delete()
  ]);

  // 2. Reset achievements to locked state
  const achs = await db.achievements.toArray();
  for (const a of achs) {
    await db.achievements.update(a.id, { unlocked: false, unlockedAt: null });
  }

  // 3. Clean up Supabase records for current user if online and authenticated
  try {
    const { supabase } = await import('../auth/index.js');
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const authUid = session.user.id;
        await Promise.allSettled([
          supabase.from('trades').delete().eq('user_id', authUid),
          supabase.from('trading_accounts').delete().eq('user_id', authUid),
          supabase.from('habit_entries').delete().eq('user_id', authUid),
          supabase.from('habits').delete().eq('user_id', authUid),
          supabase.from('journal_entries').delete().eq('user_id', authUid),
          supabase.from('goal_milestones').delete().eq('user_id', authUid),
          supabase.from('goals').delete().eq('user_id', authUid),
          supabase.from('transactions').delete().eq('user_id', authUid),
          supabase.from('budgets').delete().eq('user_id', authUid),
          supabase.from('weekly_reviews').delete().eq('user_id', authUid)
        ]);
      }
    }
  } catch (err) {
    // Offline or Supabase unavailable; local Dexie reset completed cleanly
  }
}
