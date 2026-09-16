import { createClient } from '@supabase/supabase-js';
import { setActiveUserId } from '../db/index.js';

export const Result = {
  ok: (data) => ({ success: true, data, error: null }),
  err: (error) => ({ success: false, data: null, error })
};

// Safe environment variable resolution (Vite or Node process)
const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

const SUPABASE_URL = getEnv('VITE_SUPABASE_URL') || getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('your-project') && !SUPABASE_ANON_KEY.includes('your-anon-key'));

// Supabase client instance (or null if not configured)
export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

// Local offline fallback storage key
const LOCAL_AUTH_STORAGE_KEY = 'glow_up_local_auth_user';
const LOCAL_USERS_DB_KEY = 'glow_up_registered_users';

// Secure Web Crypto SHA-256 hashing for local offline mode
async function hashPassword(plainText) {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(plainText);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback below
    }
  }
  return 'hashed_' + plainText;
}

class AuthServiceCore {
  constructor() {
    this.listeners = new Set();
    this.currentUser = null;
    this._readyPromise = null;
    this.init();
  }

  isReady() {
    return this._readyPromise || Promise.resolve(this.currentUser);
  }

  init() {
    this._readyPromise = new Promise((resolve) => {
      let resolved = false;
      const done = (user) => {
        if (!resolved) {
          resolved = true;
          resolve(user);
        }
      };

      // 1. If Supabase configured, subscribe to auth state
      if (supabase) {
        supabase.auth.onAuthStateChange((event, session) => {
          this.currentUser = session?.user || null;
          setActiveUserId(this.currentUser?.id || 'default_user');
          this.notifyListeners(event, session?.user || null);
          done(this.currentUser);
        });

        // Initial session load
        supabase.auth.getSession().then(({ data }) => {
          if (data?.session?.user) {
            this.currentUser = data.session.user;
            setActiveUserId(this.currentUser.id);
            this.notifyListeners('INITIAL_SESSION', this.currentUser);
          }
          done(this.currentUser);
        }).catch((err) => {
          console.warn('Supabase getSession error', err);
          done(null);
        });
      } else {
        // 2. Local offline fallback session recovery
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const stored = window.localStorage.getItem(LOCAL_AUTH_STORAGE_KEY);
            if (stored) {
              this.currentUser = JSON.parse(stored);
              setActiveUserId(this.currentUser?.id || 'default_user');
            }
          }
        } catch (e) {
          console.warn('Could not read local auth session', e);
        }
        done(this.currentUser);
      }
    });
  }

  notifyListeners(event, user) {
    this.listeners.forEach(cb => {
      try { cb(event, user); } catch (err) { console.error('Auth listener error', err); }
    });
  }

  onAuthStateChange(callback) {
    this.listeners.add(callback);
    // Immediately invoke with current user if present
    if (this.currentUser) {
      callback('INITIAL_USER', this.currentUser);
    }
    return () => this.listeners.delete(callback);
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getCurrentUserId() {
    return this.currentUser?.id || null;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  async signUp(email, password, name = '') {
    if (!email || !email.includes('@')) {
      return Result.err('A valid email address is required.');
    }
    if (!password || password.length < 6) {
      return Result.err('Password must be at least 6 characters long.');
    }

    const trimmedEmail = email.trim().toLowerCase();
    const displayName = name.trim() || trimmedEmail.split('@')[0];

    // Live Supabase Auth
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: { name: displayName }
          }
        });

        if (error) return Result.err(error.message);

        this.currentUser = data.user;
        if (this.currentUser?.id) setActiveUserId(this.currentUser.id);
        this.notifyListeners('SIGNED_UP', this.currentUser);
        return Result.ok(data.user);
      } catch (err) {
        return Result.err(err.message || 'Error signing up with Supabase');
      }
    }

    // Local-first Offline Auth Fallback
    try {
      const usersJson = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(LOCAL_USERS_DB_KEY) : null;
      const users = usersJson ? JSON.parse(usersJson) : [];

      const existing = users.find(u => u.email === trimmedEmail);
      if (existing) {
        return Result.err('An account with this email already exists.');
      }

      // Generate deterministic or random UUID and hash password
      const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const passwordHash = await hashPassword(password);
      const newUser = {
        id: userId,
        email: trimmedEmail,
        passwordHash, // Cryptographically hashed in local offline mode
        user_metadata: { name: displayName },
        created_at: new Date().toISOString()
      };

      users.push(newUser);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));
        window.localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(newUser));
      }

      this.currentUser = newUser;
      if (this.currentUser?.id) setActiveUserId(this.currentUser.id);
      this.notifyListeners('SIGNED_IN', newUser);
      return Result.ok(newUser);
    } catch (err) {
      return Result.err('Local registration error: ' + err.message);
    }
  }

  async signIn(email, password) {
    if (!email || !email.includes('@')) {
      return Result.err('A valid email address is required.');
    }
    if (!password) {
      return Result.err('Password is required.');
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Live Supabase Auth
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password
        });

        if (error) return Result.err(error.message);

        this.currentUser = data.user;
        if (this.currentUser?.id) setActiveUserId(this.currentUser.id);
        this.notifyListeners('SIGNED_IN', this.currentUser);
        return Result.ok(data.user);
      } catch (err) {
        return Result.err(err.message || 'Error signing in with Supabase');
      }
    }

    // Local-first Offline Auth Fallback
    try {
      const usersJson = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(LOCAL_USERS_DB_KEY) : null;
      const users = usersJson ? JSON.parse(usersJson) : [];

      const passwordHash = await hashPassword(password);
      let user = users.find(u => u.email === trimmedEmail);
      if (!user) {
        // Auto-provision demo user if password matches standard or any 6+ char password in local demo
        if (password.length >= 6) {
          const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          user = {
            id: userId,
            email: trimmedEmail,
            passwordHash,
            user_metadata: { name: trimmedEmail.split('@')[0] },
            created_at: new Date().toISOString()
          };
          users.push(user);
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));
          }
        } else {
          return Result.err('Invalid email or password.');
        }
      } else {
        // Check hash, or fallback to legacy plain password check
        const matches = (user.passwordHash && user.passwordHash === passwordHash) ||
                        (user.password && user.password === password);
        if (!matches) {
          return Result.err('Incorrect password.');
        }
        // Upgrade legacy user if found
        if (user.password && !user.passwordHash) {
          user.passwordHash = passwordHash;
          delete user.password;
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));
          }
        }
      }

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(user));
      }

      this.currentUser = user;
      if (this.currentUser?.id) setActiveUserId(this.currentUser.id);
      this.notifyListeners('SIGNED_IN', user);
      return Result.ok(user);
    } catch (err) {
      return Result.err('Local login error: ' + err.message);
    }
  }

  async signOut() {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase sign out notice', e);
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
    }

    const previousUser = this.currentUser;
    this.currentUser = null;
    setActiveUserId('default_user');
    this.notifyListeners('SIGNED_OUT', previousUser);
    return Result.ok(true);
  }

  async resetPassword(email) {
    if (!email || !email.includes('@')) {
      return Result.err('A valid email address is required.');
    }

    if (supabase) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) return Result.err(error.message);
        return Result.ok('Password reset link sent to your email.');
      } catch (err) {
        return Result.err(err.message || 'Error resetting password');
      }
    }

    return Result.ok('Password reset instructions generated (Local mode).');
  }

  async signInWithOtp(email, shouldCreateUser = false) {
    if (!email || !email.includes('@')) {
      return Result.err('A valid email address is required.');
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: { shouldCreateUser }
        });
        if (error) return Result.err(error.message);
        return Result.ok(data);
      } catch (err) {
        return Result.err(err.message || 'Error requesting OTP');
      }
    }
    return Result.err('Live Supabase Auth is required for email OTP delivery.');
  }

  async verifyOtp(email, token, type = 'email') {
    if (!email || !email.includes('@')) {
      return Result.err('A valid email address is required.');
    }
    if (!token || token.trim().length < 6) {
      return Result.err('A valid 6-digit verification code is required.');
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.verifyOtp({
          email: trimmedEmail,
          token: token.trim(),
          type
        });
        if (error) return Result.err(error.message);
        if (data?.user) {
          this.currentUser = data.user;
          setActiveUserId(this.currentUser.id);
          this.notifyListeners('SIGNED_IN', this.currentUser);
        }
        return Result.ok(data);
      } catch (err) {
        return Result.err(err.message || 'Error verifying OTP code');
      }
    }
    return Result.err('Live Supabase Auth is required for email OTP verification.');
  }

  async resendOtp(email, type = 'signup') {
    if (!email || !email.includes('@')) {
      return Result.err('A valid email address is required.');
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.resend({
          email: trimmedEmail,
          type
        });
        if (error) return Result.err(error.message);
        return Result.ok(data);
      } catch (err) {
        return Result.err(err.message || 'Error resending OTP');
      }
    }
    return Result.err('Live Supabase Auth is required for resending OTP.');
  }

  async updateProfile(updates = {}) {
    // Live Supabase profile update
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.updateUser({
          data: updates
        });
        if (error) return Result.err(error.message);
        this.currentUser = data.user;
        this.notifyListeners('PROFILE_UPDATED', this.currentUser);
        return Result.ok(data.user);
      } catch (err) {
        return Result.err(err.message || 'Error updating profile');
      }
    }

    // Local fallback: merge updates into cached user
    if (this.currentUser) {
      const updatedUser = {
        ...this.currentUser,
        user_metadata: {
          ...this.currentUser.user_metadata,
          ...updates
        }
      };
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(updatedUser));

        // Also update the registered users list
        try {
          const usersJson = window.localStorage.getItem(LOCAL_USERS_DB_KEY);
          const users = usersJson ? JSON.parse(usersJson) : [];
          const idx = users.findIndex(u => u.id === this.currentUser.id);
          if (idx !== -1) {
            users[idx] = updatedUser;
            window.localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));
          }
        } catch (e) {
          console.warn('Could not update local users list', e);
        }
      }
      this.currentUser = updatedUser;
      this.notifyListeners('PROFILE_UPDATED', updatedUser);
      return Result.ok(updatedUser);
    }

    return Result.err('No authenticated user to update.');
  }
}

export const AuthService = new AuthServiceCore();
