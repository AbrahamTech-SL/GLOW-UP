import { db, getActiveUserId } from '../db/index.js';
import { supabase } from '../auth/index.js';

export const Result = {
  ok: (data) => ({ success: true, data, error: null }),
  err: (error) => ({ success: false, data: null, error })
};

class SyncEngineCore {
  constructor() {
    this.isSyncing = false;
    this.listeners = new Set();
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.init();
  }

  init() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.online = true;
        this.notify('ONLINE');
        this.syncAll();
      });

      window.addEventListener('offline', () => {
        this.online = false;
        this.notify('OFFLINE');
      });
    }
  }

  onSyncEvent(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  notify(event, data = null) {
    this.listeners.forEach(cb => {
      try { cb(event, data); } catch (e) { console.error('Sync listener error', e); }
    });
  }

  isOnline() {
    return this.online;
  }

  /**
   * Conflict Resolution Strategy
   * 1. Last-Write-Wins based on updatedAt
   * 2. Strict Trading Invariant: BLOWN accounts can NEVER revert to ACTIVE via sync
   */
  resolveConflict(localRecord, cloudRecord, tableName) {
    if (!cloudRecord) return localRecord;
    if (!localRecord) return cloudRecord;

    // Trading Account Invariant
    if (tableName === 'tradingAccounts' || tableName === 'trading_accounts') {
      if (localRecord.status === 'BLOWN') {
        return {
          ...cloudRecord,
          ...localRecord,
          status: 'BLOWN',
          blownAt: localRecord.blownAt || cloudRecord.blownAt,
          blownReason: localRecord.blownReason || cloudRecord.blownReason
        };
      }
    }

    // Default: Last Write Wins
    const localTime = new Date(localRecord.updatedAt || localRecord.createdAt || 0).getTime();
    const cloudTime = new Date(cloudRecord.updated_at || cloudRecord.updatedAt || 0).getTime();

    return localTime >= cloudTime ? localRecord : cloudRecord;
  }

  /**
   * Process and push queued offline mutations
   */
  async processQueue(userId = getActiveUserId()) {
    if (!this.online) {
      return Result.ok({ processed: 0, reason: 'offline' });
    }

    const pendingMutations = await db.syncQueue
      .where('userId').equals(userId)
      .filter(m => m.status === 'pending')
      .sortBy('id');

    if (pendingMutations.length === 0) {
      return Result.ok({ processed: 0 });
    }

    let successCount = 0;

    for (const mutation of pendingMutations) {
      try {
        if (supabase) {
          const tableName = this.mapTableToSupabase(mutation.table);
          const payload = this.formatPayloadForCloud(mutation.payload, userId);

          if (mutation.action === 'create' || mutation.action === 'insert') {
            await supabase.from(tableName).upsert(payload);
          } else if (mutation.action === 'update') {
            await supabase.from(tableName).update(payload).eq('id', mutation.recordId).eq('user_id', userId);
          } else if (mutation.action === 'delete') {
            await supabase.from(tableName).delete().eq('id', mutation.recordId).eq('user_id', userId);
          }
        }

        // Mark mutation completed in local queue
        await db.syncQueue.update(mutation.id, { status: 'completed', syncedAt: new Date().toISOString() });
        successCount++;
      } catch (err) {
        console.warn(`Sync failed for mutation #${mutation.id}`, err);
        await db.syncQueue.update(mutation.id, { status: 'retry', error: err.message });
      }
    }

    // Clean up completed queue records
    await db.syncQueue.where('status').equals('completed').delete();
    this.notify('QUEUE_PROCESSED', { count: successCount });
    return Result.ok({ processed: successCount });
  }

  /**
   * Pull latest cloud records for active user
   */
  async pullFromCloud(userId = getActiveUserId()) {
    if (!this.online || !supabase) {
      return Result.ok({ pulled: 0, reason: 'offline_or_local' });
    }

    const tables = [
      { local: 'habits', cloud: 'habits' },
      { local: 'habitEntries', cloud: 'habit_entries' },
      { local: 'journalEntries', cloud: 'journal_entries' },
      { local: 'goals', cloud: 'goals' },
      { local: 'goalMilestones', cloud: 'goal_milestones' },
      { local: 'transactions', cloud: 'transactions' },
      { local: 'budgets', cloud: 'budgets' },
      { local: 'tradingAccounts', cloud: 'trading_accounts' },
      { local: 'trades', cloud: 'trades' },
      { local: 'achievements', cloud: 'achievements' },
      { local: 'weeklyReviews', cloud: 'weekly_reviews' }
    ];

    let totalPulled = 0;

    for (const { local, cloud } of tables) {
      try {
        const { data, error } = await supabase.from(cloud).select('*').eq('user_id', userId);
        if (error || !data) continue;

        for (const cloudItem of data) {
          const localTable = db[local];
          if (!localTable) continue;

          // Check if local version exists
          let localItem = null;
          if (cloudItem.id) {
            localItem = await localTable.where('cloudId').equals(cloudItem.id).first() ||
                        await localTable.get(parseInt(cloudItem.id, 10) || -1);
          }

          const resolved = this.resolveConflict(localItem, cloudItem, local);

          if (localItem) {
            await localTable.update(localItem.id, { ...resolved, userId });
          } else {
            await localTable.add({ ...resolved, userId });
          }
          totalPulled++;
        }
      } catch (err) {
        console.warn(`Pull error for ${local}`, err);
      }
    }

    this.notify('PULL_COMPLETED', { totalPulled });
    return Result.ok({ pulled: totalPulled });
  }

  async syncAll(userId = getActiveUserId()) {
    if (this.isSyncing) return Result.ok({ status: 'already_syncing' });
    this.isSyncing = true;
    this.notify('SYNC_START');

    try {
      await this.processQueue(userId);
      await this.pullFromCloud(userId);
      this.notify('SYNC_SUCCESS');
      return Result.ok({ success: true });
    } catch (err) {
      this.notify('SYNC_ERROR', err);
      return Result.err(err.message);
    } finally {
      this.isSyncing = false;
    }
  }

  mapTableToSupabase(localTable) {
    const map = {
      habits: 'habits',
      habitEntries: 'habit_entries',
      journalEntries: 'journal_entries',
      goals: 'goals',
      goalMilestones: 'goal_milestones',
      transactions: 'transactions',
      budgets: 'budgets',
      tradingAccounts: 'trading_accounts',
      trades: 'trades',
      achievements: 'achievements',
      weeklyReviews: 'weekly_reviews'
    };
    return map[localTable] || localTable;
  }

  formatPayloadForCloud(payload, userId) {
    const clone = { ...payload, user_id: userId };
    delete clone.id; // allow cloud to assign/maintain primary UUID if needed
    return clone;
  }
}

export const SyncEngine = new SyncEngineCore();
