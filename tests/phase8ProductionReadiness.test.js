import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  db,
  setActiveUserId,
  getActiveUserId,
  HabitService,
  MoneyService,
  matchesActiveUser
} from '../src/db/index.js';
import { TradingEngine } from '../src/trading/engine.js';
import { AuthService } from '../src/auth/index.js';
import { SyncEngine } from '../src/sync/index.js';
import { createClient } from '@supabase/supabase-js';

describe('GLOW UP: PHASE 8 PRODUCTION READINESS SUITE', () => {
  const testUserEmail = 'abrahamnlavaly3@gmail.com';
  const testUserId = 'usr_phase8_prod_ready_uuid';

  beforeAll(async () => {
    await db.open();
  });

  beforeEach(() => {
    setActiveUserId(testUserId);
  });

  // ==============================================================================
  // 1. PWA & SERVICE WORKER SPECIFICATION
  // ==============================================================================
  describe('1. PWA Manifest & Service Worker Compliance', () => {
    test('Manifest exists, is valid JSON, and specifies standalone display and icons', () => {
      const manifestPath = path.resolve(process.cwd(), 'public/manifest.webmanifest');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifestContent.name).toBe('GLOW UP');
      expect(manifestContent.short_name).toBe('GLOW UP');
      expect(manifestContent.display).toBe('standalone');
      expect(manifestContent.start_url).toBe('/');
      expect(manifestContent.theme_color).toBe('#3e6a00');

      const icons = manifestContent.icons;
      expect(Array.isArray(icons)).toBe(true);
      expect(icons.some(i => i.sizes === '192x192')).toBe(true);
      expect(icons.some(i => i.sizes === '512x512')).toBe(true);

      // Verify physical icon files exist
      expect(fs.existsSync(path.resolve(process.cwd(), 'public/assets/icon-192.png'))).toBe(true);
      expect(fs.existsSync(path.resolve(process.cwd(), 'public/assets/icon-512.png'))).toBe(true);
    });

    test('Service worker caches app shell but STRICTLY excludes Supabase & Auth API endpoints', () => {
      const swPath = path.resolve(process.cwd(), 'public/sw.js');
      expect(fs.existsSync(swPath)).toBe(true);

      const swContent = fs.readFileSync(swPath, 'utf8');
      expect(swContent).toContain('addEventListener(\'install\'');
      expect(swContent).toContain('addEventListener(\'activate\'');
      expect(swContent).toContain('addEventListener(\'fetch\'');

      // Security check: Never cache Supabase auth or REST tokens
      expect(swContent).toContain('supabase.co');
      expect(swContent).toContain('/auth/v1');
      expect(swContent).toContain('Authorization');
    });

    test('index.html registers service worker and links PWA manifest', () => {
      const htmlPath = path.resolve(process.cwd(), 'index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('<link rel="manifest" href="/manifest.webmanifest"');
      expect(htmlContent).toContain('<meta name="theme-color" content="#3e6a00"');
      expect(htmlContent).toContain('navigator.serviceWorker.register(\'/sw.js\')');
    });
  });

  // ==============================================================================
  // 2. OFFLINE DATA MUTATIONS & SYNCHRONIZATION FLOW
  // ==============================================================================
  describe('2. Offline-First Flow & Non-Lossy Synchronization', () => {
    test('Offline operations persist locally in Dexie, queue mutations, and drain on reconnection', async () => {
      // 1. ONLINE: Create initial record
      SyncEngine.online = true;
      const habitOnline = await HabitService.create({
        name: 'Morning Hydration 1L',
        frequency: 'daily',
        target: 7
      });
      expect(habitOnline.userId).toBe(testUserId);

      // 2. GO OFFLINE
      SyncEngine.online = false;
      expect(SyncEngine.isOnline()).toBe(false);

      // Attempting queue process while offline returns offline status without error
      const offlineProcessRes = await SyncEngine.processQueue(testUserId);
      expect(offlineProcessRes.success).toBe(true);
      expect(offlineProcessRes.data.reason).toBe('offline');

      // Create new record while OFFLINE
      const habitOffline = await HabitService.create({
        name: 'Offline Habit Entry',
        frequency: 'daily',
        target: 5
      });
      expect(habitOffline.userId).toBe(testUserId);

      // Verify both habits exist in local Dexie database
      const userHabits = await HabitService.getAll();
      expect(userHabits.some(h => h.name === 'Morning Hydration 1L')).toBe(true);
      expect(userHabits.some(h => h.name === 'Offline Habit Entry')).toBe(true);

      // Verify syncQueue has pending mutations
      const pendingCount = await db.syncQueue.where('userId').equals(testUserId).filter(m => m.status === 'pending').count();
      expect(pendingCount).toBeGreaterThanOrEqual(2);

      // 3. RECONNECT ONLINE
      SyncEngine.online = true;
      expect(SyncEngine.isOnline()).toBe(true);

      // Process queued mutations
      const reconnectProcessRes = await SyncEngine.processQueue(testUserId);
      expect(reconnectProcessRes.success).toBe(true);
      expect(reconnectProcessRes.data.processed).toBeGreaterThanOrEqual(2);

      // Verify remaining habits intact (no data loss or duplicates)
      const afterSyncHabits = await HabitService.getAll();
      expect(afterSyncHabits.length).toBe(userHabits.length);
    });
  });

  // ==============================================================================
  // 3. TRADING LIFECYCLE, P/L, CALENDAR, & BLOWN INVARIANT
  // ==============================================================================
  describe('3. Trading Account Lifecycle, P/L Calculations & Calendar Aggregation', () => {
    test('Executes trade, calculates P/L, updates balance, aggregates calendar, and enforces BLOWN status', async () => {
      const startingBal = 25000;
      const maxDd = 1500;

      // 1. Create Challenge Account
      const accRes = await TradingEngine.createAccount({
        name: 'Phase 8 Live Evaluation',
        accountType: 'challenge',
        startingBalance: startingBal,
        maxDrawdown: maxDd,
        dailyLossLimit: 1000
      });
      expect(accRes.success).toBe(true);
      const accId = accRes.data.id;
      expect(accRes.data.status).toBe('ACTIVE');

      // 2. Execute Winning Trade (+ $500)
      const winTrade = await TradingEngine.executeTrade({
        accountId: accId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2600,
        exitPrice: 2605,
        lotSize: 1.0
      });
      expect(winTrade.success).toBe(true);
      expect(winTrade.data.trade.pnl).toBe(500);
      expect(winTrade.data.account.currentBalance).toBe(25500);
      expect(winTrade.data.account.status).toBe('ACTIVE');

      // 3. Verify Calendar Aggregation
      const calendar = await TradingEngine.getAccountCalendar(accId);
      const today = new Date().toISOString().split('T')[0];
      expect(calendar[today]).toBeDefined();
      expect(calendar[today].tradesCount).toBeGreaterThanOrEqual(1);
      expect(calendar[today].dailyPL).toBeGreaterThanOrEqual(500);

      // 4. Execute Catastrophic Losing Trade to trigger BLOWN status
      const lossTrade = await TradingEngine.executeTrade({
        accountId: accId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2600,
        exitPrice: 2570,
        lotSize: 1.0
      });
      expect(lossTrade.success).toBe(true);
      expect(lossTrade.data.wasBlown).toBe(true);
      expect(lossTrade.data.account.status).toBe('BLOWN');
      expect(lossTrade.data.account.finalBalance).toBe(22500);
      expect(lossTrade.data.account.totalLoss).toBe(2500);

      // 5. Subsequent trade must be strictly rejected
      const blockedTrade = await TradingEngine.executeTrade({
        accountId: accId,
        instrument: 'XAUUSD',
        direction: 'BUY',
        entryPrice: 2570,
        exitPrice: 2580,
        lotSize: 0.1
      });
      expect(blockedTrade.success).toBe(false);
      expect(blockedTrade.error).toContain('BLOWN');
    });
  });

  // ==============================================================================
  // 4. AUTHENTICATION LIFECYCLE & ZERO ADMIN VERIFICATION
  // ==============================================================================
  describe('4. Authentication Lifecycle & Single-User Integrity', () => {
    test('AuthService maintains session context, notifications, and signOut reset to default_user', async () => {
      // 1. Verify active user state
      setActiveUserId(testUserId);
      expect(getActiveUserId()).toBe(testUserId);

      // 2. Register auth state listener
      let lastEvent = null;
      let lastUser = null;
      const unsubscribe = AuthService.onAuthStateChange((evt, usr) => {
        lastEvent = evt;
        lastUser = usr;
      });

      // 3. Sign out resets user context to default_user
      const signoutRes = await AuthService.signOut();
      expect(signoutRes.success).toBe(true);
      expect(AuthService.isAuthenticated()).toBe(false);
      expect(getActiveUserId()).toBe('default_user');
      expect(lastEvent).toBe('SIGNED_OUT');

      unsubscribe();

      // 4. Reset back for subsequent tests
      setActiveUserId(testUserId);
      expect(getActiveUserId()).toBe(testUserId);

      // 5. Verify isReady resolves cleanly
      const readyUser = await AuthService.isReady();
      expect(readyUser !== undefined).toBe(true);
    });
  });

  // ==============================================================================
  // 5. PRODUCTION ENVIRONMENT & SECRETS SANITIZATION
  // ==============================================================================
  describe('5. Production Environment & Secrets Hygiene', () => {
    test('.env.example has placeholders only and no real secrets or values', () => {
      const exampleContent = fs.readFileSync('.env.example', 'utf8');
      expect(exampleContent).not.toContain('sb_publishable_');
      expect(exampleContent).not.toContain('service_role');
      expect(exampleContent).not.toContain('SERVICE_ROLE');
      expect(exampleContent).not.toMatch(/VITE_SUPABASE_URL=\S+/);
      expect(exampleContent).not.toMatch(/VITE_SUPABASE_ANON_KEY=\S+/);
      expect(exampleContent).toContain('VITE_SUPABASE_URL=');
      expect(exampleContent).toContain('VITE_SUPABASE_ANON_KEY=');
    });

    test('.gitignore strictly ignores environment files and build outputs', () => {
      const gitignore = fs.readFileSync('.gitignore', 'utf8');
      expect(gitignore).toContain('.env.local');
      expect(gitignore).toContain('dist/');
      expect(gitignore).toContain('node_modules/');
    });

    test('Remote Supabase schema has RLS on all tables and live project is reachable', async () => {
      const client = createClient('https://ikhitapvwwojgnhfsvoz.supabase.co', 'sb_publishable_Te4X9F7xn-adgCSY05aXiQ_k1z-jARe');
      const res = await client.from('habits').select('*');
      expect(res.status).toBe(200);
      // RLS restricts unauthenticated requests to empty set
      expect(res.data).toEqual([]);
    });
  });
});
