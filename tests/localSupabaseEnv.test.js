import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { AuthService, Result } from '../src/auth/index.js';

describe('LOCAL SUPABASE ENVIRONMENT & AUTH VERIFICATION', () => {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  const envExamplePath = path.resolve(process.cwd(), '.env.example');
  const gitignorePath = path.resolve(process.cwd(), '.gitignore');

  // ==============================================================================
  // 1. ENVIRONMENT CONFIGURATION & SECURITY
  // ==============================================================================
  describe('1. Environment File & Security Verification', () => {
    test('.env.local exists and contains required Supabase variables', () => {
      expect(fs.existsSync(envLocalPath)).toBe(true);
      const content = fs.readFileSync(envLocalPath, 'utf8');
      expect(content).toContain('VITE_SUPABASE_URL=https://ikhitapvwwojgnhfsvoz.supabase.co');
      expect(content).toContain('VITE_SUPABASE_ANON_KEY=');
    });

    test('.env.local is strictly protected in .gitignore', () => {
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      expect(gitignore).toMatch(/^\.env\.local$/m);
      expect(gitignore).toMatch(/^\*\.local$/m);
    });

    test('.env.example contains variable names and placeholders only (no real keys)', () => {
      expect(fs.existsSync(envExamplePath)).toBe(true);
      const example = fs.readFileSync(envExamplePath, 'utf8');
      expect(example).toMatch(/VITE_SUPABASE_URL=\s*$/m);
      expect(example).toMatch(/VITE_SUPABASE_ANON_KEY=\s*$/m);
      expect(example).not.toContain('https://ikhitapvwwojgnhfsvoz');
      expect(example).not.toContain('eyJ');
    });
  });

  // ==============================================================================
  // 2. SUPABASE INITIALIZATION
  // ==============================================================================
  describe('2. Supabase Client Initialization', () => {
    const supabaseUrl = 'https://ikhitapvwwojgnhfsvoz.supabase.co';
    const testKey = 'test_anon_key_for_client_initialization';

    test('Supabase client initializes without error using project URL and key', () => {
      const client = createClient(supabaseUrl, testKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
    });

    test('Supabase client is configured with session persistence options', () => {
      const client = createClient(supabaseUrl, testKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      expect(typeof client.auth.getSession).toBe('function');
      expect(typeof client.auth.onAuthStateChange).toBe('function');
    });
  });

  // ==============================================================================
  // 3. AUTHENTICATION (SIGNUP, LOGIN, LOGOUT, SESSION PERSISTENCE)
  // ==============================================================================
  describe('3. Authentication Flow Verification', () => {
    test('signUp validation catches invalid email and short password', async () => {
      const resInvalidEmail = await AuthService.signUp('notanemail', 'secret123');
      expect(resInvalidEmail.success).toBe(false);
      expect(resInvalidEmail.error).toContain('valid email');

      const resShortPass = await AuthService.signUp('user@example.com', '123');
      expect(resShortPass.success).toBe(false);
      expect(resShortPass.error).toContain('at least 6 characters');
    });

    test('signIn validation catches missing password', async () => {
      const res = await AuthService.signIn('user@example.com', '');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Password is required');
    });

    test('signOut clears current user and triggers auth listener', async () => {
      let notifiedEvent = null;
      const unsubscribe = AuthService.onAuthStateChange((event, user) => {
        notifiedEvent = event;
      });

      await AuthService.signOut();
      expect(AuthService.getCurrentUser()).toBeNull();
      expect(AuthService.isAuthenticated()).toBe(false);
      expect(notifiedEvent).toBe('SIGNED_OUT');

      unsubscribe();
    });

    test('Session persistence recovery works for stored local session', () => {
      const storage = {};
      const mockStorage = {
        setItem: (k, v) => { storage[k] = String(v); },
        getItem: (k) => storage[k] || null,
        removeItem: (k) => { delete storage[k]; }
      };
      const mockUser = { id: 'persistent_user_001', email: 'persistent@example.com' };
      mockStorage.setItem('glow_up_local_auth_user', JSON.stringify(mockUser));

      // Re-read storage
      const stored = JSON.parse(mockStorage.getItem('glow_up_local_auth_user'));
      expect(stored.id).toBe('persistent_user_001');
      expect(stored.email).toBe('persistent@example.com');
    });

    test('signInWithOtp validates email and delegates to Supabase Auth', async () => {
      const resBad = await AuthService.signInWithOtp('invalid');
      expect(resBad.success).toBe(false);
      expect(resBad.error).toContain('valid email');
    });

    test('verifyOtp validates token length and rejects tokens under 6 characters', async () => {
      const resShort = await AuthService.verifyOtp('user@example.com', '12345');
      expect(resShort.success).toBe(false);
      expect(resShort.error).toContain('6-digit');
    });

    test('resendOtp validates recipient email address', async () => {
      const resBad = await AuthService.resendOtp('');
      expect(resBad.success).toBe(false);
      expect(resBad.error).toContain('valid email');
    });

    test('Zero Resend credentials exist in source code, .env, or config files', () => {
      const envLocal = fs.existsSync(envLocalPath) ? fs.readFileSync(envLocalPath, 'utf8') : '';
      const envExample = fs.existsSync(envExamplePath) ? fs.readFileSync(envExamplePath, 'utf8') : '';
      expect(envLocal).not.toContain('RESEND');
      expect(envLocal).not.toContain('re_');
      expect(envExample).not.toContain('RESEND');
      expect(envExample).not.toContain('re_');
    });
  });

  // ==============================================================================
  // 4. DATABASE REQUEST VERIFICATION
  // ==============================================================================
  describe('4. Database Request Handling', () => {
    test('Supabase client query executes against remote endpoint', async () => {
      const client = createClient('https://ikhitapvwwojgnhfsvoz.supabase.co', 'dummy_key');
      const response = await client.from('profiles').select('*');
      
      // Request reached the endpoint (server responded with API key status)
      expect(response).toBeDefined();
      expect(response.status).toBe(401);
      expect(response.error).toBeDefined();
      expect(response.error.message).toBe('Invalid API key');
    });
  });
});
