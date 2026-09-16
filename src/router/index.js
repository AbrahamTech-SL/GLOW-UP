import { screensData } from '../screens/screensData.js';
import {
  db,
  seedInitialData,
  getActiveUserId,
  setActiveUserId,
  matchesActiveUser,
  HabitService,
  JournalService,
  GoalService,
  MoneyService,
  AchievementService
} from '../db/index.js';
import { TradingEngine } from '../trading/engine.js';
import { AuthService } from '../auth/index.js';
import { SyncEngine } from '../sync/index.js';

// UI Performance Helpers
export function debounce(fn, delay = 180) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

export function renderSkeletonCards(count = 3, cardHeight = 'h-20') {
  return Array.from({ length: count }).map(() => `
    <div class="w-full ${cardHeight} rounded-2xl bg-surface-container-high/60 animate-pulse flex items-center p-4 gap-4">
      <div class="w-10 h-10 rounded-full bg-surface-container-highest/80 shrink-0"></div>
      <div class="flex-grow flex flex-col gap-2">
        <div class="w-3/4 h-3.5 rounded bg-surface-container-highest/80"></div>
        <div class="w-1/2 h-2.5 rounded bg-surface-container-highest/60"></div>
      </div>
    </div>
  `).join('');
}

const ROUTE_ALIASES = {
  'splash': 'splash',
  'welcome': 'welcome',
  'create-account': 'register',
  'register': 'register',
  'login': 'login',
  'profile-setup': 'profile-setup',
  'home': 'home',
  'quick-add': 'quick-add',
  'daily': 'daily',
  'habits': 'habits',
  'habit-detail': 'habit-detail',
  'journal': 'journal',
  'journal-history': 'journal-history',
  'goals': 'goals',
  'create-goal': 'goal-new',
  'goal-new': 'goal-new',
  'goal-detail': 'goal-detail',
  'progress': 'progress',
  'habit-statistics': 'habit-stats',
  'habit-stats': 'habit-stats',
  'goal-statistics': 'goal-stats',
  'goal-stats': 'goal-stats',
  'personal-statistics': 'personal-stats',
  'personal-stats': 'personal-stats',
  'weekly-review': 'weekly-review',
  'money': 'money',
  'transactions': 'transactions',
  'add-transaction': 'transaction-new',
  'transaction-new': 'transaction-new',
  'budget': 'budget',
  'financial-statistics': 'financial-stats',
  'financial-stats': 'financial-stats',
  'trading': 'trading',
  'trading-decision': 'trading-decision',
  'xauusd-setup': 'xauusd-setup',
  'pre-trade-checklist': 'pre-trade-checklist',
  'risk-calculator': 'risk-calculator',
  'trading-accounts': 'trading-accounts',
  'add-trading-account': 'trading-account-new',
  'trading-account-new': 'trading-account-new',
  'trading-account-detail': 'trading-account-detail',
  'account-rules': 'account-rules',
  'new-account-trade': 'trade-new',
  'new-trade': 'trade-new',
  'trade-new': 'trade-new',
  'trade-journal': 'trade-journal',
  'open-trade': 'trade-open',
  'trade-open': 'trade-open',
  'trade-history': 'trade-history',
  'trading-statistics': 'trading-stats',
  'trading-stats': 'trading-stats',
  'trading-review': 'trading-review',
  'settings': 'menu',
  'menu': 'menu',
  'profile': 'profile',
  'notifications': 'notifications',
  'security': 'security',
  'data-management': 'data-management',
  'backup': 'backup',
  'restore': 'restore',
  'data-reset': 'reset-data',
  'reset-data': 'reset-data',
  'rewards': 'rewards',
  'achievements': 'achievements'
};

export class AppRouter {
  constructor() {
    this.appContainer = document.getElementById('app');
    this.toast = document.getElementById('toast');
    this.toastMsg = document.getElementById('toast-message');
    this.menuDrawer = document.getElementById('menu-drawer');
    this.closeMenuBtn = document.getElementById('close-menu-btn');
    this.currentRoute = 'home';
    this.params = {};
    this.selectedAccountId = null;

    this.initMenuEvents();
  }

  showToast(message, duration = 2500) {
    if (!this.toast) return;
    this.toastMsg.textContent = message;
    this.toast.classList.add('show');
    setTimeout(() => {
      this.toast.classList.remove('show');
    }, duration);
  }

  showModal({ title, bodyHtml, confirmText = 'Save', onConfirm }) {
    const existing = document.getElementById('glow-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'glow-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-200';
    modal.innerHTML = `
      <div class="w-full sm:max-w-md bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl border border-outline-variant/30 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-2 border-b border-surface-variant">
          <h3 class="font-headline-sm text-on-surface font-bold">${title}</h3>
          <button id="modal-close-btn" class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="modal-body flex flex-col gap-3">
          ${bodyHtml}
        </div>
        <div class="flex items-center justify-end gap-3 pt-2">
          <button id="modal-cancel-btn" class="px-5 py-2.5 rounded-full bg-surface-container text-on-surface font-label-md font-semibold hover:bg-surface-container-high transition-colors">
            Cancel
          </button>
          <button id="modal-confirm-btn" class="px-5 py-2.5 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold hover:bg-secondary-fixed active:scale-95 transition-all shadow-sm">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#modal-close-btn').onclick = close;
    modal.querySelector('#modal-cancel-btn').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    modal.querySelector('#modal-confirm-btn').onclick = async () => {
      if (onConfirm) {
        const success = await onConfirm(modal);
        if (success !== false) close();
      } else {
        close();
      }
    };
  }

  showConfirm({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Delete', isDestructive = true, onConfirm }) {
    const existing = document.getElementById('glow-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'glow-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-200';
    modal.innerHTML = `
      <div class="w-full max-w-sm bg-surface-container-lowest rounded-2xl p-6 shadow-2xl border border-outline-variant/30 flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full ${isDestructive ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container'} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[20px]">${isDestructive ? 'delete' : 'help'}</span>
          </div>
          <h3 class="font-headline-sm text-on-surface font-bold">${title}</h3>
        </div>
        <p class="font-body-md text-on-surface-variant">${message}</p>
        <div class="flex items-center justify-end gap-2 pt-2">
          <button id="modal-cancel-btn" class="px-4 py-2 rounded-full bg-surface-container text-on-surface font-label-md font-semibold hover:bg-surface-container-high transition-colors">
            Cancel
          </button>
          <button id="modal-confirm-btn" class="px-5 py-2 rounded-full ${isDestructive ? 'bg-error text-on-error' : 'bg-primary-container text-on-primary-fixed'} font-label-md font-bold active:scale-95 transition-all shadow-sm">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#modal-cancel-btn').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    modal.querySelector('#modal-confirm-btn').onclick = async () => {
      close();
      if (onConfirm) await onConfirm();
    };
  }

  initMenuEvents() {
    if (this.closeMenuBtn) {
      this.closeMenuBtn.addEventListener('click', () => {
        this.closeMenu();
      });
    }

    if (this.menuDrawer) {
      this.menuDrawer.addEventListener('click', (e) => {
        if (e.target === this.menuDrawer) {
          this.closeMenu();
        }
      });
    }

    document.querySelectorAll('.menu-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        this.closeMenu();
      });
    });
  }

  openMenu() {
    if (this.menuDrawer) {
      this.menuDrawer.classList.remove('hidden');
    }
  }

  closeMenu() {
    if (this.menuDrawer) {
      this.menuDrawer.classList.add('hidden');
    }
  }

  start() {
    window.addEventListener('hashchange', () => this.handleRoute());
    AuthService.onAuthStateChange((event, user) => {
      if (event === 'SIGNED_OUT') {
        this.navigate('welcome');
      }
    });
    this.handleRoute();
  }

  navigate(route) {
    window.location.hash = `#/${route}`;
  }

  parseHash() {
    const defaultRoute = AuthService.isAuthenticated() ? 'home' : 'welcome';
    const rawHash = window.location.hash.slice(2) || defaultRoute;
    const parts = rawHash.split('/');
    const rawRoute = (parts[0] || defaultRoute).toLowerCase();
    const route = ROUTE_ALIASES[rawRoute] || rawRoute;
    const param = parts[1] || null;
    return { route, param };
  }

  async handleRoute() {
    const { route, param } = this.parseHash();

    // Route Protection Guard
    const PUBLIC_ROUTES = ['splash', 'welcome', 'login', 'register', 'profile-setup'];
    const isAuthed = AuthService.isAuthenticated();

    if (!isAuthed && !PUBLIC_ROUTES.includes(route)) {
      this.navigate('welcome');
      return;
    }

    if (isAuthed && (route === 'welcome' || route === 'login' || route === 'register')) {
      this.navigate('home');
      return;
    }

    this.currentRoute = route;
    this.params = { id: param };

    // Close menu drawer if open
    this.closeMenu();

    const screen = screensData[route];
    if (!screen) {
      console.warn(`Route '${route}' not found. Falling back to 'home'.`);
      this.navigate(isAuthed ? 'home' : 'welcome');
      return;
    }

    // Mount screen HTML
    this.appContainer.innerHTML = screen.html;
    window.scrollTo(0, 0);

    // Bind common navigation links & bottom navigation
    this.bindNavigation();

    // Bind screen-specific interactive logic
    await this.hydrateScreen(route, param);
  }

  bindNavigation() {
    // 1. Wire Bottom Navigation Tabs
    const navLinks = this.appContainer.querySelectorAll('nav a, [data-path]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const path = link.getAttribute('data-path') || '';
        const href = link.getAttribute('href') || '';

        if (path === 'home' || href.includes('home')) {
          this.navigate('home');
        } else if (path === 'daily' || href.includes('daily')) {
          this.navigate('daily');
        } else if (path === 'quick-add' || href.includes('quick-add') || link.getAttribute('aria-label') === 'Quick Add') {
          this.navigate('quick-add');
        } else if (path === 'progress' || href.includes('progress')) {
          this.navigate('progress');
        } else if (path === 'menu' || path === 'habits' || href.includes('menu') || link.querySelector('span')?.textContent?.includes('widgets')) {
          this.openMenu();
        }
      });
    });

    // 2. Wire all Back buttons and Cancel buttons
    const backButtons = this.appContainer.querySelectorAll('button[aria-label="Back"], button[aria-label="back"], .back-btn, header button:first-child');
    backButtons.forEach(btn => {
      const text = btn.innerText || '';
      const icon = btn.querySelector('.material-symbols-outlined')?.innerText || '';
      if (icon.includes('arrow_back') || icon.includes('chevron_left') || text.toLowerCase().includes('cancel') || text.toLowerCase().includes('back')) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (window.history.length > 1) {
            window.history.back();
          } else {
            this.navigate('home');
          }
        });
      }
    });

    // 3. Wire explicit CTAs and card navigation targets based on headers or text
    this.appContainer.querySelectorAll('button, a, [role="button"]').forEach(el => {
      const text = el.innerText?.trim() || '';

      // Notifications button
      if (el.getAttribute('aria-label') === 'Notifications') {
        el.addEventListener('click', () => this.navigate('notifications'));
      }
      // Settings or Profile avatar
      if (el.querySelector('img[alt*="Profile"]') || el.getAttribute('aria-label') === 'Profile') {
        el.addEventListener('click', () => this.navigate('profile'));
      }
    });
  }

  async hydrateScreen(route, param) {
    switch (route) {
      case 'home':
        await this.hydrateHome();
        break;
      case 'daily':
        await this.hydrateDaily();
        break;
      case 'quick-add':
        await this.hydrateQuickAdd();
        break;
      case 'habits':
        await this.hydrateHabits();
        break;
      case 'habit-detail':
        await this.hydrateHabitDetail();
        break;
      case 'journal':
        await this.hydrateJournal();
        break;
      case 'journal-history':
        await this.hydrateJournalHistory();
        break;
      case 'weekly-review':
        await this.hydrateWeeklyReview();
        break;
      case 'goals':
        await this.hydrateGoals();
        break;
      case 'goal-new':
        await this.hydrateGoalNew();
        break;
      case 'goal-detail':
        await this.hydrateGoalDetail();
        break;
      case 'goal-stats':
        await this.hydrateGoalStats();
        break;
      case 'money':
        await this.hydrateMoney();
        break;
      case 'transactions':
        await this.hydrateTransactions();
        break;
      case 'transaction-new':
        await this.hydrateTransactionNew();
        break;
      case 'budget':
        await this.hydrateBudget();
        break;
      case 'financial-stats':
        await this.hydrateFinancialStats();
        break;
      case 'trading':
        await this.hydrateTradingDashboard();
        break;
      case 'trading-accounts':
        await this.hydrateTradingAccounts();
        break;
      case 'trading-account-new':
        await this.hydrateTradingAccountNew();
        break;
      case 'trading-account-detail':
        await this.hydrateTradingAccountDetail();
        break;
      case 'account-rules':
        await this.hydrateAccountRules();
        break;
      case 'trade-new':
        await this.hydrateTradeNew();
        break;
      case 'trade-history':
        await this.hydrateTradeHistory();
        break;
      case 'trading-stats':
        await this.hydrateTradingStats();
        break;
      case 'trading-review':
        await this.hydrateTradingReview();
        break;
      case 'trade-journal':
        await this.hydrateTradeJournal();
        break;
      case 'risk-calculator':
        await this.hydrateRiskCalculator();
        break;
      case 'pre-trade-checklist':
        await this.hydratePreTradeChecklist();
        break;
      case 'trading-decision':
        await this.hydrateTradingDecision();
        break;
      case 'xauusd-setup':
        await this.hydrateXauusdSetup();
        break;
      case 'progress':
        await this.hydrateProgress();
        break;
      case 'habit-stats':
        await this.hydrateHabitStats();
        break;
      case 'personal-stats':
        await this.hydratePersonalStats();
        break;
      case 'rewards':
        await this.hydrateRewards();
        break;
      case 'achievements':
        await this.hydrateAchievements();
        break;
      case 'menu':
        await this.hydrateSettingsDashboard();
        break;
      case 'profile':
        await this.hydrateProfile();
        break;
      case 'notifications':
        await this.hydrateNotifications();
        break;
      case 'security':
        await this.hydrateSecurity();
        break;
      case 'data-management':
        await this.hydrateDataManagement();
        break;
      case 'backup':
        await this.hydrateBackup();
        break;
      case 'restore':
        await this.hydrateRestore();
        break;
      case 'reset-data':
        await this.hydrateResetData();
        break;
      case 'splash':
        this.appContainer.addEventListener('click', () => {
          this.navigate(AuthService.isAuthenticated() ? 'home' : 'welcome');
        }, { once: true });
        break;
      case 'welcome':
        await this.hydrateWelcome();
        break;
      case 'login':
        await this.hydrateLogin();
        break;
      case 'register':
        await this.hydrateRegister();
        break;
      case 'profile-setup':
        await this.hydrateProfileSetup();
        break;
    }
  }

  // ==========================================
  // HYDRATION IMPLEMENTATIONS (REAL DATA & CRUD)
  // ==========================================

  async hydrateWelcome() {
    const createBtn = this.appContainer.querySelector('#create-account-btn') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Create account'));
    if (createBtn) {
      createBtn.onclick = (e) => {
        e.preventDefault();
        this.navigate('register');
      };
    }

    const loginBtn = this.appContainer.querySelector('#login-btn') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('already have an account'));
    if (loginBtn) {
      loginBtn.onclick = (e) => {
        e.preventDefault();
        this.navigate('login');
      };
    }
  }

  async hydrateLogin() {
    const emailInput = this.appContainer.querySelector('#email');
    const passwordInput = this.appContainer.querySelector('#password');
    const toggleBtn = this.appContainer.querySelector('#togglePasswordBtn');
    const toggleIcon = this.appContainer.querySelector('#toggleIcon');

    if (toggleBtn && passwordInput) {
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        const isPass = passwordInput.type === 'password';
        passwordInput.type = isPass ? 'text' : 'password';
        if (toggleIcon) toggleIcon.textContent = isPass ? 'visibility_off' : 'visibility';
      };
    }

    const form = this.appContainer.querySelector('form');
    const submitBtn = this.appContainer.querySelector('button[type="submit"]') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Log in'));

    let isOtpMode = false;
    let resendCooldown = 0;
    let resendInterval = null;

    const passLabel = this.appContainer.querySelector('label[for="password"]');
    const submitText = submitBtn?.querySelector('span:first-child');

    const handleLoginSubmit = async (e) => {
      if (e) e.preventDefault();
      const email = emailInput?.value?.trim() || '';

      if (!email || !email.includes('@')) {
        this.showToast('Please enter a valid email address');
        emailInput?.focus();
        return;
      }

      // 1. Email OTP Verification Mode
      if (isOtpMode) {
        const otpCode = passwordInput?.value?.trim() || '';
        if (!otpCode || otpCode.length < 6) {
          this.showToast('Please enter the 6-digit verification code');
          passwordInput?.focus();
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.classList.add('opacity-70');
        }

        try {
          const res = await AuthService.verifyOtp(email, otpCode, 'email');
          if (!res.success) {
            this.showToast(res.error || 'Invalid or expired OTP code');
            return;
          }

          const user = res.data?.user || res.data?.session?.user || res.data;
          if (user?.id) {
            setActiveUserId(user.id);
            SyncEngine.pullFromCloud().catch(err => console.warn('Background sync error', err));
          }

          this.showToast('Code verified successfully!');
          this.navigate('home');
        } catch (err) {
          this.showToast(err.message || 'Verification failed');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-70');
          }
        }
        return;
      }

      // 2. Standard Password Login Mode
      const password = passwordInput?.value || '';
      if (!password) {
        this.showToast('Please enter your password or click "Log in with Email OTP" below');
        passwordInput?.focus();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-70');
      }

      try {
        const res = await AuthService.signIn(email, password);
        if (!res.success) {
          this.showToast(res.error || 'Login failed');
          return;
        }

        const user = res.data?.user || res.data;
        if (user?.id) {
          setActiveUserId(user.id);
        }

        // Background cloud sync
        SyncEngine.pullFromCloud().catch(err => console.warn('Background sync error', err));

        this.showToast('Welcome back!');
        this.navigate('home');
      } catch (err) {
        this.showToast(err.message || 'An error occurred during login');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-70');
        }
      }
    };

    if (form) form.onsubmit = handleLoginSubmit;
    if (submitBtn) submitBtn.onclick = handleLoginSubmit;

    const forgotLink = this.appContainer.querySelector('a[href*="forgot"]');
    if (forgotLink) {
      forgotLink.innerText = 'Log in with Email OTP / Forgot password?';
      forgotLink.onclick = async (e) => {
        e.preventDefault();
        const email = emailInput?.value?.trim();
        if (!email || !email.includes('@')) {
          this.showToast('Enter your email above first to receive an OTP code');
          emailInput?.focus();
          return;
        }

        if (!isOtpMode) {
          // Switch to OTP Mode & Request Code
          if (resendCooldown > 0) {
            this.showToast(`Please wait ${resendCooldown}s before requesting a new code`);
            return;
          }

          forgotLink.innerText = 'Sending verification code...';
          const res = await AuthService.signInWithOtp(email, false);

          if (!res.success) {
            this.showToast(res.error || 'Could not send verification email');
            forgotLink.innerText = 'Log in with Email OTP / Forgot password?';
            return;
          }

          isOtpMode = true;
          if (passLabel) passLabel.textContent = 'Verification Code (6-Digit OTP)';
          if (passwordInput) {
            passwordInput.type = 'text';
            passwordInput.setAttribute('inputmode', 'numeric');
            passwordInput.setAttribute('maxlength', '6');
            passwordInput.placeholder = 'Enter 6-digit code';
            passwordInput.value = '';
            passwordInput.focus();
          }
          if (toggleBtn) toggleBtn.style.display = 'none';
          if (submitText) submitText.textContent = 'Verify Code & Log in';

          this.showToast('Verification code sent! Check your inbox.');

          // 60-second cooldown
          resendCooldown = 60;
          if (resendInterval) clearInterval(resendInterval);
          forgotLink.innerText = `Resend code in ${resendCooldown}s (or use password)`;
          resendInterval = setInterval(() => {
            resendCooldown--;
            if (resendCooldown <= 0) {
              clearInterval(resendInterval);
              forgotLink.innerText = 'Resend OTP Code | Switch to Password';
            } else {
              forgotLink.innerText = `Resend code in ${resendCooldown}s | Switch to Password`;
            }
          }, 1000);
        } else {
          // In OTP mode: clicking link allows resending or switching back
          if (resendCooldown <= 0) {
            forgotLink.innerText = 'Sending code...';
            const res = await AuthService.signInWithOtp(email, false);
            if (res.success) {
              this.showToast('New code sent to your email!');
              resendCooldown = 60;
              resendInterval = setInterval(() => {
                resendCooldown--;
                if (resendCooldown <= 0) {
                  clearInterval(resendInterval);
                  forgotLink.innerText = 'Resend OTP Code | Switch to Password';
                } else {
                  forgotLink.innerText = `Resend in ${resendCooldown}s | Switch to Password`;
                }
              }, 1000);
            } else {
              this.showToast(res.error || 'Failed to resend code');
              forgotLink.innerText = 'Resend OTP Code | Switch to Password';
            }
          } else {
            // Switch back to password mode
            isOtpMode = false;
            if (passLabel) passLabel.textContent = 'Password';
            if (passwordInput) {
              passwordInput.type = 'password';
              passwordInput.removeAttribute('inputmode');
              passwordInput.removeAttribute('maxlength');
              passwordInput.placeholder = 'Enter your password';
            }
            if (toggleBtn) toggleBtn.style.display = 'flex';
            if (submitText) submitText.textContent = 'Log in';
            forgotLink.innerText = 'Log in with Email OTP / Forgot password?';
            if (resendInterval) clearInterval(resendInterval);
          }
        }
      };
    }

    const createAccountLink = this.appContainer.querySelector('a[href*="create-account"]');
    if (createAccountLink) {
      createAccountLink.onclick = (e) => {
        e.preventDefault();
        this.navigate('register');
      };
    }
  }

  async hydrateRegister() {
    const nameInput = this.appContainer.querySelector('#name');
    const emailInput = this.appContainer.querySelector('#email');
    const passwordInput = this.appContainer.querySelector('#password');
    const confirmInput = this.appContainer.querySelector('#confirm-password');

    const form = this.appContainer.querySelector('form');
    const submitBtn = this.appContainer.querySelector('button[type="submit"]') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Create account'));

    const handleRegisterSubmit = async (e) => {
      if (e) e.preventDefault();
      const name = nameInput?.value?.trim() || '';
      const email = emailInput?.value?.trim() || '';
      const password = passwordInput?.value || '';
      const confirmPassword = confirmInput?.value || '';

      if (!name) {
        this.showToast('Please enter your full name');
        nameInput?.focus();
        return;
      }
      if (!email || !email.includes('@')) {
        this.showToast('Please enter a valid email address');
        emailInput?.focus();
        return;
      }
      if (!password || password.length < 6) {
        this.showToast('Password must be at least 6 characters');
        passwordInput?.focus();
        return;
      }
      if (password !== confirmPassword) {
        this.showToast('Passwords do not match');
        confirmInput?.focus();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-70');
      }

      try {
        const res = await AuthService.signUp(email, password, name);
        if (!res.success) {
          this.showToast(res.error || 'Account creation failed');
          return;
        }

        const user = res.data?.user || res.data;
        if (user?.id) {
          setActiveUserId(user.id);
        }

        await db.users.add({
          userId: user?.id || getActiveUserId(),
          name,
          email,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        this.showToast('Account created successfully!');
        this.navigate('profile-setup');
      } catch (err) {
        this.showToast(err.message || 'An unexpected error occurred');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-70');
        }
      }
    };

    if (form) form.onsubmit = handleRegisterSubmit;
    if (submitBtn) submitBtn.onclick = handleRegisterSubmit;

    const loginLink = Array.from(this.appContainer.querySelectorAll('a')).find(a => a.innerText.includes('Log in'));
    if (loginLink) {
      loginLink.onclick = (e) => {
        e.preventDefault();
        this.navigate('login');
      };
    }
  }

  async hydrateProfileSetup() {
    const nameInput = this.appContainer.querySelector('#user-name-input');
    const currentUser = AuthService.getCurrentUser();
    if (nameInput && currentUser?.user_metadata?.name) {
      nameInput.value = currentUser.user_metadata.name;
    }

    const focusCards = this.appContainer.querySelectorAll('.focus-card');
    const countBadge = this.appContainer.querySelector('#focus-count-badge');
    const updateCount = () => {
      const activeCount = this.appContainer.querySelectorAll('.focus-card[data-active="true"]').length;
      if (countBadge) countBadge.textContent = `${activeCount} selected`;
    };

    focusCards.forEach(card => {
      card.onclick = () => {
        const isActive = card.getAttribute('data-active') === 'true';
        card.setAttribute('data-active', (!isActive).toString());
        const stateIcon = card.querySelector('.state-icon');
        if (!isActive) {
          card.classList.remove('bg-surface-container-lowest', 'text-on-surface');
          card.classList.add('bg-primary-container', 'text-on-primary-container');
          if (stateIcon) {
            stateIcon.textContent = 'check';
            stateIcon.classList.remove('text-on-surface-variant');
            stateIcon.classList.add('text-primary', 'font-bold');
          }
        } else {
          card.classList.remove('bg-primary-container', 'text-on-primary-container');
          card.classList.add('bg-surface-container-lowest', 'text-on-surface');
          if (stateIcon) {
            stateIcon.textContent = 'add';
            stateIcon.classList.remove('text-primary', 'font-bold');
            stateIcon.classList.add('text-on-surface-variant');
          }
        }
        updateCount();
      };
    });

    const continueBtn = this.appContainer.querySelector('#continue-button') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Continue'));
    if (continueBtn) {
      continueBtn.onclick = async (e) => {
        e.preventDefault();
        const name = nameInput?.value?.trim();
        if (name) {
          await AuthService.updateProfile({ name });
          const userRec = await db.users.filter(u => matchesActiveUser(u)).first();
          if (userRec) {
            await db.users.update(userRec.id, { name, updatedAt: new Date().toISOString() });
          }
        }
        this.showToast('Profile setup saved!');
        this.navigate('home');
      };
    }

    const skipBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Skip for now'));
    if (skipBtn) {
      skipBtn.onclick = (e) => {
        e.preventDefault();
        this.navigate('home');
      };
    }
  }

  async hydrateHome() {
    const todayStr = new Date().toISOString().split('T')[0];
    const [habits, goals, todayJournal, finStats, streak] = await Promise.all([
      HabitService.getAll(false),
      GoalService.getAll(),
      JournalService.getToday(todayStr),
      MoneyService.getFinancialStats(),
      JournalService.getWritingStreak()
    ]);
    const dailyStats = await HabitService.getDailyCompletionStats(todayStr, habits);
    const activeGoals = goals.filter(g => g.status === 'ACTIVE');

    // 1. Dynamic Greeting
    const user = AuthService.getCurrentUser();
    const fullName = user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : 'there');
    const greetingEl = this.appContainer.querySelector('h1');
    if (greetingEl) {
      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');
      greetingEl.innerText = `${timeOfDay}, ${fullName}`;
    }

    // 2. Update Hero Card with Real Streak & Real Percentage
    const streakEl = this.appContainer.querySelector('.bg-primary-container .font-label-sm, .bg-primary-container span.font-bold');
    if (streakEl) {
      streakEl.innerText = `${streak} day streak`;
    }

    const percentageEl = this.appContainer.querySelector('.font-display-lg');
    if (percentageEl) {
      percentageEl.innerText = `${dailyStats.percentage}%`;
    }

    const progressCircle = this.appContainer.querySelector('circle.text-secondary');
    if (progressCircle) {
      const offset = 251.2 - (251.2 * (dailyStats.percentage / 100));
      progressCircle.style.strokeDashoffset = `${offset}`;
    }

    // 3. Update 2x2 Metric Cards with Real Numbers
    const cards = this.appContainer.querySelectorAll('.grid > div');
    if (cards.length >= 4) {
      // CARD 1: Habits
      cards[0].style.cursor = 'pointer';
      cards[0].onclick = () => this.navigate('habits');
      const habitCountEl = cards[0].querySelector('.font-headline-sm');
      if (habitCountEl) {
        habitCountEl.innerHTML = `${dailyStats.completed} <span class="font-body-md text-body-md text-on-surface-variant font-normal">/ ${dailyStats.total} done</span>`;
      }
      const habitBar = cards[0].querySelector('.bg-secondary-fixed-dim, .bg-primary');
      if (habitBar) habitBar.style.width = `${dailyStats.percentage}%`;

      // CARD 2: Goals
      cards[1].style.cursor = 'pointer';
      cards[1].onclick = () => this.navigate('goals');
      const goalCountEl = cards[1].querySelector('.font-headline-sm');
      if (goalCountEl) {
        goalCountEl.innerText = `${activeGoals.length} Active`;
      }

      // CARD 3: Journal
      cards[2].style.cursor = 'pointer';
      cards[2].onclick = () => this.navigate('journal');
      const journalStatusEl = cards[2].querySelector('.font-label-sm.text-outline, .font-label-sm');
      if (journalStatusEl) {
        journalStatusEl.innerText = todayJournal?.status === 'completed' ? 'COMPLETED TODAY' : 'NOT COMPLETED';
      }

      // CARD 4: Money
      cards[3].style.cursor = 'pointer';
      cards[3].onclick = () => this.navigate('money');
      const moneyBalanceEl = cards[3].querySelector('.font-headline-sm');
      if (moneyBalanceEl) {
        moneyBalanceEl.innerText = `$${finStats.netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      }
    }

    // 4. Update Header Task Count
    const taskCountEl = this.appContainer.querySelector('h3.font-headline-sm + span');
    if (taskCountEl) {
      taskCountEl.innerText = `${dailyStats.completed} / ${dailyStats.total} done`;
    }

    const viewAllBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('View all'));
    if (viewAllBtn) {
      viewAllBtn.onclick = () => this.navigate('habits');
    }

    // 5. Dynamic Interactive Habit Checklist
    const checklistContainer = this.appContainer.querySelector('#habit-checklist');
    if (checklistContainer) {
      if (habits.length === 0) {
        checklistContainer.innerHTML = `
          <div class="p-6 text-center bg-surface-container-lowest rounded-lg border border-dashed border-outline-variant/50 flex flex-col items-center">
            <span class="material-symbols-outlined text-4xl text-outline mb-2">checklist</span>
            <h4 class="font-headline-sm text-on-surface font-semibold">No habits yet</h4>
            <p class="font-body-md text-on-surface-variant mt-1 mb-4">Add your first habit to start building your daily momentum.</p>
            <button class="px-5 py-2.5 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold hover:bg-secondary-fixed active:scale-95 transition-all shadow-sm" id="home-add-habit-btn">
              Add your first habit
            </button>
          </div>
        `;
        const addFirstBtn = checklistContainer.querySelector('#home-add-habit-btn');
        if (addFirstBtn) addFirstBtn.onclick = () => this.navigate('habits');
      } else {
        const entries = await db.habitEntries.where('date').equals(todayStr).toArray();
        const entryMap = new Map(entries.map(e => [e.habitId, e.completed]));

        checklistContainer.innerHTML = habits.map(h => {
          const isCompleted = !!entryMap.get(h.id);
          return `
            <div class="habit-item flex items-center justify-between p-space-md rounded-lg bg-surface-container-lowest shadow-sm hover:shadow transition-all cursor-pointer" data-habit-id="${h.id}" data-completed="${isCompleted}">
              <div class="flex items-center gap-space-md min-w-0 flex-grow pr-2">
                <div class="w-10 h-10 rounded-full ${isCompleted ? 'bg-primary-container/40 text-on-primary-container' : 'bg-surface-container text-on-surface-variant'} flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[20px]">${h.icon || 'checklist'}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="font-label-lg text-label-lg text-on-surface font-semibold truncate ${isCompleted ? 'line-through opacity-60' : ''}">${h.name}</span>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="px-2 py-0.5 rounded-full ${isCompleted ? 'bg-primary-container text-on-primary-fixed-variant' : 'bg-surface-container text-on-surface-variant'} font-label-sm text-label-sm font-medium">${isCompleted ? 'Completed' : (h.category || 'Daily')}</span>
                    <span class="font-body-sm text-body-sm text-on-surface-variant">${h.currentStreak || 0} streak</span>
                  </div>
                </div>
              </div>
              <button class="check-trigger w-9 h-9 rounded-full ${isCompleted ? 'bg-primary-container text-on-surface' : 'bg-surface-container text-outline hover:bg-primary-container/50'} flex items-center justify-center shrink-0 shadow-xs active:scale-90 transition-transform" type="button" aria-label="Toggle ${h.name}">
                <span class="material-symbols-outlined text-[18px] font-bold ${isCompleted ? '' : 'opacity-0'}">check</span>
              </button>
            </div>
          `;
        }).join('');

        checklistContainer.querySelectorAll('.habit-item').forEach(item => {
          const hid = parseInt(item.getAttribute('data-habit-id'), 10);
          const habit = habits.find(h => h.id === hid);
          if (!habit) return;

          const trigger = item.querySelector('.check-trigger');
          const toggleAction = async (e) => {
            e.stopPropagation();
            const next = await HabitService.toggleCompletion(habit.id, todayStr);
            item.setAttribute('data-completed', String(next));
            const iconWrap = item.querySelector('.w-10.h-10');
            const titleSpan = item.querySelector('.font-label-lg');
            const catBadge = item.querySelector('.font-label-sm.font-medium');
            const checkIcon = trigger.querySelector('.material-symbols-outlined');

            if (next) {
              trigger.className = 'check-trigger w-9 h-9 rounded-full bg-primary-container text-on-surface flex items-center justify-center shrink-0 shadow-xs active:scale-90 transition-transform';
              if (checkIcon) checkIcon.classList.remove('opacity-0');
              if (iconWrap) iconWrap.className = 'w-10 h-10 rounded-full bg-primary-container/40 text-on-primary-container flex items-center justify-center shrink-0';
              if (titleSpan) titleSpan.classList.add('line-through', 'opacity-60');
              if (catBadge) {
                catBadge.className = 'px-2 py-0.5 rounded-full bg-primary-container text-on-primary-fixed-variant font-label-sm text-label-sm font-medium';
                catBadge.innerText = 'Completed';
              }
            } else {
              trigger.className = 'check-trigger w-9 h-9 rounded-full bg-surface-container text-outline hover:bg-primary-container/50 flex items-center justify-center shrink-0 shadow-xs active:scale-90 transition-transform';
              if (checkIcon) checkIcon.classList.add('opacity-0');
              if (iconWrap) iconWrap.className = 'w-10 h-10 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0';
              if (titleSpan) titleSpan.classList.remove('line-through', 'opacity-60');
              if (catBadge) {
                catBadge.className = 'px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-medium';
                catBadge.innerText = habit.category || 'Daily';
              }
            }

            const updatedStats = await HabitService.getDailyCompletionStats(todayStr, habits);
            if (percentageEl) percentageEl.innerText = `${updatedStats.percentage}%`;
            if (progressCircle) {
              const offset = 251.2 - (251.2 * (updatedStats.percentage / 100));
              progressCircle.style.strokeDashoffset = `${offset}`;
            }
            const hc = cards[0]?.querySelector('.font-headline-sm');
            if (hc) hc.innerHTML = `${updatedStats.completed} <span class="font-body-md text-body-md text-on-surface-variant font-normal">/ ${updatedStats.total} done</span>`;
            const hb = cards[0]?.querySelector('.bg-secondary-fixed-dim, .bg-primary');
            if (hb) hb.style.width = `${updatedStats.percentage}%`;
            if (taskCountEl) taskCountEl.innerText = `${updatedStats.completed} / ${updatedStats.total} done`;

            this.showToast(next ? `Completed: ${habit.name}` : `Unchecked: ${habit.name}`);
          };

          if (trigger) trigger.onclick = toggleAction;
          item.onclick = (e) => {
            if (e.target.closest('.check-trigger')) return;
            this.selectedHabitId = habit.id;
            this.navigate('habit-detail');
          };
        });
      }
    }
  }

  async hydrateDaily() {
    const todayStr = new Date().toISOString().split('T')[0];
    const habits = await HabitService.getAll(false);
    const dailyStats = await HabitService.getDailyCompletionStats(todayStr);
    const goals = await GoalService.getAll();
    const activeGoals = goals.filter(g => g.status === 'ACTIVE');
    const todayJournal = await JournalService.getToday(todayStr);

    // 1. Dynamic Local Date Header
    const dateLabel = this.appContainer.querySelector('span.font-label-md.text-on-surface-variant');
    if (dateLabel) {
      dateLabel.innerText = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    }

    // 2. Progress Ring & Completion Stats
    const percentEl = this.appContainer.querySelector('#completion-percent');
    if (percentEl) percentEl.innerText = `${dailyStats.percentage}%`;

    const statsEl = this.appContainer.querySelector('#completion-stats');
    if (statsEl) {
      statsEl.innerHTML = `<span class="material-symbols-outlined text-[16px] text-primary">check_circle</span> <span class="font-semibold text-on-surface">${dailyStats.completed} of ${dailyStats.total}</span> habits done`;
    }

    const dailyCircle = this.appContainer.querySelector('#progress-circle');
    if (dailyCircle) {
      const offset = 251.2 - (251.2 * (dailyStats.percentage / 100));
      dailyCircle.style.strokeDashoffset = `${offset}`;
    }

    // 3. Dynamic Habits List on Daily
    const habitListContainer = this.appContainer.querySelector('#habit-list');
    if (habitListContainer) {
      if (habits.length === 0) {
        habitListContainer.innerHTML = `
          <div class="p-6 text-center bg-surface-container-lowest rounded-lg border border-dashed border-outline-variant/50 flex flex-col items-center">
            <span class="material-symbols-outlined text-4xl text-outline mb-2">checklist</span>
            <h4 class="font-headline-sm text-on-surface font-semibold">No habits scheduled</h4>
            <p class="font-body-md text-on-surface-variant mt-1 mb-4">Create your first daily habit to build momentum.</p>
            <button class="px-5 py-2.5 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold hover:bg-secondary-fixed active:scale-95 transition-all shadow-sm" id="daily-add-btn">
              Add Habit
            </button>
          </div>
        `;
        const addBtn = habitListContainer.querySelector('#daily-add-btn');
        if (addBtn) addBtn.onclick = () => this.navigate('habits');
      } else {
        const entries = await db.habitEntries.where('date').equals(todayStr).toArray();
        const entryMap = new Map(entries.map(e => [e.habitId, e.completed]));

        habitListContainer.innerHTML = habits.map(h => {
          const isCompleted = !!entryMap.get(h.id);
          return `
            <div class="habit-card bg-surface-container-lowest rounded-lg p-3.5 shadow-sm flex items-center justify-between transition-all cursor-pointer" data-habit-id="${h.id}">
              <div class="flex items-center gap-3.5 min-w-0 flex-grow pr-2">
                <div class="w-11 h-11 rounded-full ${isCompleted ? 'bg-primary-container/40 text-on-primary-container' : 'bg-surface-container-low text-on-surface-variant'} flex items-center justify-center text-[20px] shrink-0">
                  <span class="material-symbols-outlined text-[20px]">${h.icon || 'checklist'}</span>
                </div>
                <div class="truncate">
                  <h3 class="font-label-lg text-label-lg text-on-surface font-semibold truncate ${isCompleted ? 'line-through opacity-70' : ''}">${h.name}</h3>
                  <div class="flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant">
                    <span>🔥</span>
                    <span class="font-medium text-tertiary">${h.currentStreak || 0} day streak</span>
                  </div>
                </div>
              </div>
              <button aria-label="Toggle ${h.name}" class="habit-toggle w-9 h-9 rounded-full ${isCompleted ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline hover:bg-primary-container/40'} flex items-center justify-center shrink-0 active:scale-90 transition-transform" type="button">
                <span class="material-symbols-outlined text-[20px] font-bold ${isCompleted ? '' : 'opacity-0'}">check</span>
              </button>
            </div>
          `;
        }).join('');

        habitListContainer.querySelectorAll('.habit-card').forEach(card => {
          const hid = parseInt(card.getAttribute('data-habit-id'), 10);
          const habit = habits.find(h => h.id === hid);
          if (!habit) return;

          const toggleBtn = card.querySelector('.habit-toggle');
          const toggleAction = async (e) => {
            e.stopPropagation();
            const next = await HabitService.toggleCompletion(habit.id, todayStr);
            await this.hydrateDaily();
            this.showToast(next ? `Completed: ${habit.name}` : `Unchecked: ${habit.name}`);
          };

          if (toggleBtn) toggleBtn.onclick = toggleAction;
          card.onclick = (e) => {
            if (e.target.closest('.habit-toggle')) return;
            this.selectedHabitId = habit.id;
            this.navigate('habit-detail');
          };
        });
      }
    }

    // 4. Daily Goals
    const goalsContainer = this.appContainer.querySelector('.space-y-3 .space-y-3');
    if (goalsContainer) {
      if (activeGoals.length === 0) {
        goalsContainer.innerHTML = `
          <div class="p-4 bg-surface-container-lowest rounded-lg text-center text-on-surface-variant font-body-sm border border-dashed border-outline-variant/40">
            No active goals set. <a href="#/goal-new" class="text-primary font-semibold underline ml-1">Create goal</a>
          </div>
        `;
      } else {
        goalsContainer.innerHTML = activeGoals.slice(0, 2).map(g => `
          <div class="bg-surface-container-lowest rounded-lg p-4 shadow-sm space-y-3 cursor-pointer" onclick="window.location.hash='#/goal-detail'">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container">
                  <span class="material-symbols-outlined text-[18px]">track_changes</span>
                </span>
                <span class="font-label-lg text-label-lg text-on-surface font-semibold">${g.name}</span>
              </div>
              <span class="font-label-md text-label-md text-primary font-bold">${g.currentProgress || 0}%</span>
            </div>
            <div class="w-full bg-surface-container rounded-full h-2 overflow-hidden">
              <div class="bg-primary h-full rounded-full transition-all duration-500" style="width: ${g.currentProgress || 0}%;"></div>
            </div>
          </div>
        `).join('');
      }
    }

    // 5. Journal Reflection Section
    const journalSection = Array.from(this.appContainer.querySelectorAll('section, div.bg-surface-container-lowest.rounded-lg.p-5')).find(el => el.innerText.includes('reflection'));
    if (journalSection) {
      const isCompleted = todayJournal?.status === 'completed';
      const badge = journalSection.querySelector('span.rounded-full');
      if (badge) {
        badge.innerText = isCompleted ? 'Completed today' : 'Not written yet';
        badge.className = `px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${isCompleted ? 'bg-primary-container text-on-primary-fixed-variant' : 'bg-surface-container text-on-surface-variant'}`;
      }
      const journalBtn = journalSection.querySelector('button');
      if (journalBtn) {
        journalBtn.innerHTML = `<span class="material-symbols-outlined text-[20px]">edit_note</span> ${isCompleted ? 'View reflection' : 'Write journal'}`;
        journalBtn.onclick = () => this.navigate('journal');
      }
    }

    // 6. Generic Navigation Wireup on Daily
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('See all') || text.includes('View all')) {
        btn.onclick = () => this.navigate('goals');
      } else if (text.includes('Start review')) {
        btn.onclick = () => this.navigate('weekly-review');
      }
    });
  }

  async hydrateQuickAdd() {
    this.appContainer.querySelectorAll('button, a').forEach(el => {
      const text = el.innerText?.trim() || '';
      if (text.includes('Habit')) {
        el.onclick = (e) => {
          e.preventDefault();
          this.navigate('habits');
          setTimeout(() => {
            const addBtn = document.querySelector('button[aria-label="Add Habit"], button#add-habit-btn') ||
              Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Add'));
            addBtn?.click();
          }, 200);
        };
      } else if (text.includes('Journal') || text.includes('Reflection')) {
        el.onclick = (e) => { e.preventDefault(); this.navigate('journal'); };
      } else if (text.includes('Trade')) {
        el.onclick = (e) => { e.preventDefault(); this.navigate('trade-new'); };
      } else if (text.includes('Income')) {
        el.onclick = (e) => {
          e.preventDefault();
          this.selectedTransactionType = 'income';
          this.navigate('transaction-new');
        };
      } else if (text.includes('Expense')) {
        el.onclick = (e) => {
          e.preventDefault();
          this.selectedTransactionType = 'expense';
          this.navigate('transaction-new');
        };
      } else if (text.includes('Transaction')) {
        el.onclick = (e) => { e.preventDefault(); this.navigate('transaction-new'); };
      } else if (text.includes('Goal')) {
        el.onclick = (e) => { e.preventDefault(); this.navigate('goal-new'); };
      }
    });

    const closeBtn = this.appContainer.querySelector('button[aria-label="Close"], button[aria-label="Go back"]');
    if (closeBtn) closeBtn.onclick = () => history.back();
  }

  async hydrateHabits() {
    const habits = await HabitService.getAll(false);
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Add Habit CTA
    const addBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Add') || b.getAttribute('aria-label') === 'Add Habit');
    if (addBtn) {
      addBtn.onclick = () => {
        this.showModal({
          title: 'New Habit',
          bodyHtml: `
            <div class="flex flex-col gap-1">
              <label class="font-label-sm text-on-surface uppercase tracking-wider">Habit Name</label>
              <input id="modal-habit-name" type="text" placeholder="e.g. Morning Cold Shower" class="h-12 px-4 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-body-md focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-sm text-on-surface uppercase tracking-wider">Category</label>
              <select id="modal-habit-category" class="h-12 px-4 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-body-md focus:outline-none">
                <option value="Health">Health & Fitness</option>
                <option value="Mind">Mind & Focus</option>
                <option value="Productivity">Productivity</option>
                <option value="Finance">Finance & Wealth</option>
                <option value="General">General</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-label-sm text-on-surface uppercase tracking-wider">Frequency</label>
                <select id="modal-habit-frequency" class="h-12 px-3 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-body-md">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-label-sm text-on-surface uppercase tracking-wider">Target Days</label>
                <input id="modal-habit-target" type="number" min="1" max="7" value="7" class="h-12 px-3 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-body-md" />
              </div>
            </div>
          `,
          confirmText: 'Create Habit',
          onConfirm: async (modal) => {
            const nameInput = modal.querySelector('#modal-habit-name');
            const name = nameInput?.value.trim();
            if (!name) {
              alert('Please enter a habit name.');
              return false;
            }
            const category = modal.querySelector('#modal-habit-category')?.value || 'Health';
            const frequency = modal.querySelector('#modal-habit-frequency')?.value || 'daily';
            const targetDays = parseInt(modal.querySelector('#modal-habit-target')?.value, 10) || 7;

            await HabitService.create({ name, category, frequency, targetDays });
            this.showToast(`Habit "${name}" created!`);
            await this.hydrateHabits();
            return true;
          }
        });
      };
    }

    // 2. Consistency Card
    const streakEl = this.appContainer.querySelector('.font-headline-md');
    if (streakEl) {
      let maxCurrent = 0;
      for (const h of habits) {
        const s = await HabitService.getStreaks(h.id);
        if (s.currentStreak > maxCurrent) maxCurrent = s.currentStreak;
      }
      streakEl.innerText = `${maxCurrent} Days`;
    }

    // 3. Dynamic Habits Section Container
    const sectionHeader = Array.from(this.appContainer.querySelectorAll('h2')).find(h => h.innerText.includes("Today’s Habits") || h.innerText.includes("Today's Habits"));
    const listContainer = sectionHeader ? sectionHeader.closest('.flex.flex-col.space-y-space-md') : null;

    if (listContainer) {
      // Remove previous habit cards
      const oldCards = listContainer.querySelectorAll('.flex.flex-col.rounded-DEFAULT, .empty-habits-box');
      oldCards.forEach(c => c.remove());

      if (habits.length === 0) {
        const emptyBox = document.createElement('div');
        emptyBox.className = 'empty-habits-box p-6 text-center bg-surface-container-lowest rounded-lg border border-dashed border-outline-variant/50 flex flex-col items-center';
        emptyBox.innerHTML = `
          <span class="material-symbols-outlined text-4xl text-outline mb-2">checklist</span>
          <h4 class="font-headline-sm text-on-surface font-semibold">No habits yet</h4>
          <p class="font-body-md text-on-surface-variant mt-1 mb-4">Start tracking daily actions to build momentum.</p>
          <button class="px-5 py-2.5 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold hover:bg-secondary-fixed active:scale-95 transition-all shadow-sm" id="empty-add-habit-btn">
            + Add Habit
          </button>
        `;
        emptyBox.querySelector('#empty-add-habit-btn').onclick = () => addBtn?.click();
        listContainer.appendChild(emptyBox);
      } else {
        const entries = await db.habitEntries.where('date').equals(todayStr).toArray();
        const entryMap = new Map(entries.map(e => [e.habitId, e.completed]));

        for (const habit of habits) {
          const isCompleted = !!entryMap.get(habit.id);
          const streakData = await HabitService.getStreaks(habit.id);

          const card = document.createElement('div');
          card.className = 'flex flex-col rounded-DEFAULT bg-surface-container-lowest p-space-md shadow-sm transition-all cursor-pointer hover:shadow';
          card.innerHTML = `
            <div class="flex items-start justify-between gap-space-sm">
              <div class="flex items-start gap-3 min-w-0 flex-grow pr-2">
                <div class="w-11 h-11 rounded-full ${isCompleted ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'} flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[22px]">${habit.icon || 'checklist'}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="font-label-lg text-label-lg font-bold text-on-surface truncate ${isCompleted ? 'line-through opacity-60' : ''}">${habit.name}</span>
                  <span class="font-body-sm text-body-sm text-on-surface-variant truncate">${habit.category || 'Daily'} • ${habit.targetDays || 7} days/week</span>
                  <div class="flex items-center gap-1 mt-1 text-secondary font-label-sm text-label-sm">
                    <span class="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1;">local_fire_department</span>
                    <span>${streakData.currentStreak || 0} day streak (best: ${streakData.bestStreak || 0})</span>
                  </div>
                </div>
              </div>
              <button aria-label="Toggle ${habit.name}" class="habit-toggle w-9 h-9 rounded-full ${isCompleted ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline hover:bg-primary-container/40'} flex items-center justify-center flex-shrink-0 shadow-sm transition-transform active:scale-90" type="button">
                <span class="material-symbols-outlined text-[22px] font-bold ${isCompleted ? '' : 'opacity-0'}">check</span>
              </button>
            </div>
          `;

          const toggleBtn = card.querySelector('.habit-toggle');
          toggleBtn.onclick = async (e) => {
            e.stopPropagation();
            const next = await HabitService.toggleCompletion(habit.id, todayStr);
            await this.hydrateHabits();
            this.showToast(next ? `Completed: ${habit.name}` : `Unchecked: ${habit.name}`);
          };

          card.onclick = (e) => {
            if (e.target.closest('.habit-toggle')) return;
            this.selectedHabitId = habit.id;
            this.navigate('habit-detail');
          };

          listContainer.appendChild(card);
        }
      }
    }
  }

  async hydrateHabitDetail() {
    const habits = await HabitService.getAll(false);
    const habit = (this.selectedHabitId ? habits.find(h => h.id === this.selectedHabitId) : null) || habits[0];

    if (!habit) {
      this.navigate('habits');
      return;
    }

    this.selectedHabitId = habit.id;
    const streakData = await HabitService.getStreaks(habit.id);

    // Update title
    const nameEl = this.appContainer.querySelector('h1, h2, .font-headline-sm');
    if (nameEl) nameEl.innerText = habit.name;

    // Update Category & Details
    const metaSpan = this.appContainer.querySelector('.font-body-md.text-on-surface-variant, .font-body-sm');
    if (metaSpan) metaSpan.innerText = `${habit.category || 'General'} • Target: ${habit.targetDays || 7} days/week`;

    // Update Streak Display
    const streakNums = this.appContainer.querySelectorAll('.font-headline-lg, .font-headline-md, .font-display-lg');
    if (streakNums.length > 0) {
      streakNums[0].innerText = `${streakData.currentStreak || 0}`;
    }

    // Wire Edit Button
    const editBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Edit') || b.getAttribute('aria-label') === 'Edit');
    if (editBtn) {
      editBtn.onclick = () => {
        this.showModal({
          title: 'Edit Habit',
          bodyHtml: `
            <div class="flex flex-col gap-1">
              <label class="font-label-sm text-on-surface uppercase tracking-wider">Habit Name</label>
              <input id="edit-habit-name" type="text" value="${habit.name}" class="h-12 px-4 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-body-md focus:outline-none" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-sm text-on-surface uppercase tracking-wider">Category</label>
              <select id="edit-habit-category" class="h-12 px-4 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-body-md">
                <option value="Health" ${habit.category === 'Health' ? 'selected' : ''}>Health & Fitness</option>
                <option value="Mind" ${habit.category === 'Mind' ? 'selected' : ''}>Mind & Focus</option>
                <option value="Productivity" ${habit.category === 'Productivity' ? 'selected' : ''}>Productivity</option>
                <option value="Finance" ${habit.category === 'Finance' ? 'selected' : ''}>Finance & Wealth</option>
                <option value="General" ${habit.category === 'General' ? 'selected' : ''}>General</option>
              </select>
            </div>
          `,
          confirmText: 'Save Changes',
          onConfirm: async (modal) => {
            const newName = modal.querySelector('#edit-habit-name')?.value.trim();
            if (!newName) return false;
            const newCategory = modal.querySelector('#edit-habit-category')?.value || habit.category;
            await HabitService.update(habit.id, { name: newName, category: newCategory });
            this.showToast('Habit updated!');
            await this.hydrateHabitDetail();
            return true;
          }
        });
      };
    }

    // Wire Delete Button
    const deleteBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Delete') || b.innerText.includes('Archive') || b.getAttribute('aria-label') === 'Delete');
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        this.showConfirm({
          title: 'Delete Habit',
          message: `Are you sure you want to delete "${habit.name}" and all associated logs? This cannot be undone.`,
          confirmText: 'Delete Permanently',
          isDestructive: true,
          onConfirm: async () => {
            await HabitService.delete(habit.id);
            this.showToast(`Habit "${habit.name}" deleted`);
            this.navigate('habits');
          }
        });
      };
    }
  }

  async hydrateJournal() {
    const todayStr = new Date().toISOString().split('T')[0];
    const entry = await JournalService.getToday(todayStr);
    let selectedMood = entry?.mood || 'focused';

    // --- Inject dynamic journal editor into the main content area ---
    const main = this.appContainer.querySelector('main') || this.appContainer;
    const existingForm = main.querySelector('form, .journal-form, section');

    // Build the dynamic editor form
    const moods = ['focused', 'energized', 'calm', 'grateful', 'reflective', 'tired', 'stressed'];
    const editorHtml = `
      <div class="journal-editor flex flex-col gap-5 px-4 py-3">
        <!-- Date Header -->
        <div class="flex items-center justify-between">
          <p class="font-label-lg font-bold text-on-surface">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
          <button id="journal-history-btn" class="flex items-center gap-1 text-primary font-label-md font-semibold">
            <span class="material-symbols-outlined text-[18px]">history</span>History
          </button>
        </div>

        <!-- Mood Selector -->
        <div class="flex flex-col gap-2">
          <p class="font-label-md font-semibold text-on-surface-variant">How are you feeling?</p>
          <div class="flex flex-wrap gap-2" id="mood-selector">
            ${moods.map(m => `
              <button data-mood="${m}" class="mood-pill px-3 py-1.5 rounded-full font-label-sm font-medium transition-all ${m === selectedMood ? 'bg-primary-container text-on-primary-container shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}">${m.charAt(0).toUpperCase() + m.slice(1)}</button>
            `).join('')}
          </div>
        </div>

        <!-- Gratitude -->
        <div class="flex flex-col gap-1.5">
          <label for="gratitude-input" class="font-label-md font-semibold text-on-surface-variant flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-secondary">favorite</span>Gratitude
          </label>
          <textarea id="gratitude-input" rows="3" placeholder="What are you grateful for today?" class="w-full p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-body-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all">${entry?.gratitude || ''}</textarea>
        </div>

        <!-- Wins -->
        <div class="flex flex-col gap-1.5">
          <label for="wins-input" class="font-label-md font-semibold text-on-surface-variant flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-secondary">emoji_events</span>Daily Wins
          </label>
          <textarea id="wins-input" rows="3" placeholder="What went well today? What did you accomplish?" class="w-full p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-body-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all">${entry?.wins || ''}</textarea>
        </div>

        <!-- Improvements -->
        <div class="flex flex-col gap-1.5">
          <label for="improve-input" class="font-label-md font-semibold text-on-surface-variant flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-secondary">trending_up</span>Areas to Improve
          </label>
          <textarea id="improve-input" rows="3" placeholder="What could you do better? What will you change?" class="w-full p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-body-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all">${entry?.improvements || ''}</textarea>
        </div>

        <!-- Free Notes -->
        <div class="flex flex-col gap-1.5">
          <label for="notes-input" class="font-label-md font-semibold text-on-surface-variant flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-secondary">edit_note</span>Notes & Reflections
          </label>
          <textarea id="notes-input" rows="4" placeholder="Free-form thoughts, reflections, ideas..." class="w-full p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-body-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all">${entry?.notes || ''}</textarea>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-3 pt-2 pb-4">
          <button id="journal-draft-btn" class="flex-1 px-4 py-3 rounded-full bg-surface-container text-on-surface font-label-md font-semibold hover:bg-surface-container-high transition-colors">
            Save Draft
          </button>
          <button id="journal-save-btn" class="flex-1 px-4 py-3 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold hover:bg-secondary-fixed active:scale-95 transition-all shadow-sm">
            Complete Journal
          </button>
        </div>
        ${entry ? `
        <button id="journal-delete-btn" class="w-full px-4 py-2.5 rounded-full bg-error-container text-on-error-container font-label-md font-semibold hover:opacity-90 transition-colors">
          Delete Today's Entry
        </button>` : ''}
      </div>
    `;

    // Replace existing content area (preserve header and nav)
    if (existingForm) {
      existingForm.innerHTML = editorHtml;
    } else {
      const sections = main.querySelectorAll('section, .content');
      if (sections.length > 0) {
        sections.forEach(s => s.remove());
      }
      main.insertAdjacentHTML('beforeend', editorHtml);
    }

    // --- Wire Mood Selector ---
    this.appContainer.querySelectorAll('#mood-selector .mood-pill').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        selectedMood = btn.getAttribute('data-mood');
        this.appContainer.querySelectorAll('#mood-selector .mood-pill').forEach(p => {
          p.classList.remove('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
          p.classList.add('bg-surface-container', 'text-on-surface-variant');
        });
        btn.classList.add('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
        btn.classList.remove('bg-surface-container', 'text-on-surface-variant');
        this.showToast(`Mood: ${selectedMood}`);
      };
    });

    // --- Wire History Button ---
    const historyBtn = this.appContainer.querySelector('#journal-history-btn');
    if (historyBtn) historyBtn.onclick = () => this.navigate('journal-history');

    // --- Gather text inputs ---
    const getFields = () => ({
      gratitude: this.appContainer.querySelector('#gratitude-input')?.value?.trim() || '',
      wins: this.appContainer.querySelector('#wins-input')?.value?.trim() || '',
      improvements: this.appContainer.querySelector('#improve-input')?.value?.trim() || '',
      notes: this.appContainer.querySelector('#notes-input')?.value?.trim() || ''
    });

    // --- Wire Draft Button ---
    const draftBtn = this.appContainer.querySelector('#journal-draft-btn');
    if (draftBtn) {
      draftBtn.onclick = async (e) => {
        e.preventDefault();
        const fields = getFields();
        await JournalService.save({ date: todayStr, mood: selectedMood, ...fields, status: 'draft' });
        this.showToast('Draft saved');
      };
    }

    // --- Wire Complete Button ---
    const saveBtn = this.appContainer.querySelector('#journal-save-btn');
    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const fields = getFields();
        if (!fields.gratitude && !fields.wins && !fields.improvements && !fields.notes) {
          this.showToast('Write something before saving');
          return;
        }
        await JournalService.save({ date: todayStr, mood: selectedMood, ...fields, status: 'completed' });
        this.showToast('Journal completed & saved!');
        setTimeout(() => this.navigate('journal-history'), 400);
      };
    }

    // --- Wire Delete Button ---
    const deleteBtn = this.appContainer.querySelector('#journal-delete-btn');
    if (deleteBtn && entry) {
      deleteBtn.onclick = async () => {
        this.showConfirm({
          title: 'Delete Entry',
          message: `Delete today's journal entry?`,
          onConfirm: async () => {
            await JournalService.delete(entry.id);
            this.showToast('Entry deleted');
            await this.handleRoute();
          }
        });
      };
    }
  }

  async hydrateJournalHistory() {
    const entries = await JournalService.getAll();

    // --- Find or create the dynamic list container ---
    const main = this.appContainer.querySelector('main') || this.appContainer;
    let listContainer = main.querySelector('#journal-history-list, .journal-list, section:nth-of-type(2)');
    if (!listContainer) {
      listContainer = main.querySelector('section') || main;
    }

    let currentJournalLimit = 20;

    // --- Build dynamic entry list ---
    const renderEntries = (list) => {
      if (list.length === 0) {
        listContainer.innerHTML = `
          <div class="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
            <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
              <span class="material-symbols-outlined text-[32px] text-on-surface-variant">edit_note</span>
            </div>
            <p class="font-headline-sm font-bold text-on-surface">No journal entries yet</p>
            <p class="font-body-md text-on-surface-variant">Write today's reflection to start building your journal.</p>
            <button id="new-journal-btn" class="px-6 py-3 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold hover:bg-secondary-fixed active:scale-95 transition-all shadow-sm">
              <span class="material-symbols-outlined text-[18px] align-middle mr-1">add</span>Write Today
            </button>
          </div>
        `;
        const btn = listContainer.querySelector('#new-journal-btn');
        if (btn) btn.onclick = () => this.navigate('journal');
        return;
      }

      const visible = list.slice(0, currentJournalLimit);

      let html = `
        <div class="flex flex-col gap-3 px-4 py-2">
          <div class="flex items-center justify-between pb-1">
            <p class="font-label-lg font-bold text-on-surface">${list.length} ${list.length === 1 ? 'Entry' : 'Entries'}</p>
            <button id="new-journal-btn" class="flex items-center gap-1 text-primary font-label-md font-semibold">
              <span class="material-symbols-outlined text-[18px]">add</span>New Entry
            </button>
          </div>
          ${visible.map(entry => {
            const preview = entry.gratitude || entry.wins || entry.notes || 'No content';
            const truncated = preview.length > 80 ? preview.slice(0, 80) + '...' : preview;
            const dateObj = new Date(entry.date + 'T12:00:00');
            const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const statusColor = entry.status === 'completed' ? 'bg-secondary text-on-secondary' : 'bg-surface-container-highest text-on-surface-variant';
            const moodEmoji = { focused: '🎯', energized: '⚡', calm: '🧘', grateful: '🙏', reflective: '💭', tired: '😴', stressed: '😤' }[entry.mood] || '📝';
            return `
              <div class="journal-entry-card bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/20 shadow-sm flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow" data-entry-id="${entry.id}">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">${moodEmoji}</span>
                    <p class="font-label-lg font-bold text-on-surface">${dateLabel}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="px-2.5 py-0.5 rounded-full ${statusColor} font-label-sm font-medium">${entry.status === 'completed' ? 'Complete' : 'Draft'}</span>
                    <button class="delete-entry-btn w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container transition-colors" data-id="${entry.id}" data-date="${entry.date}">
                      <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
                <p class="font-body-md text-on-surface-variant line-clamp-2">${truncated}</p>
              </div>
            `;
          }).join('')}
        </div>
      `;

      if (list.length > currentJournalLimit) {
        html += `
          <div class="pt-2 pb-4 text-center px-4">
            <button id="journal-load-more-btn" class="w-full py-3 rounded-full bg-surface-container text-on-surface font-label-md font-semibold hover:bg-surface-container-high active:scale-98 transition-all shadow-xs flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-[18px]">expand_more</span>
              <span>Load More Reflections (${list.length - currentJournalLimit} remaining)</span>
            </button>
          </div>
        `;
      }

      listContainer.innerHTML = html;

      const loadMoreBtn = listContainer.querySelector('#journal-load-more-btn');
      if (loadMoreBtn) {
        loadMoreBtn.onclick = () => {
          currentJournalLimit += 20;
          renderEntries(list);
        };
      }

      // Wire new entry button
      const newBtn = listContainer.querySelector('#new-journal-btn');
      if (newBtn) newBtn.onclick = () => this.navigate('journal');

      // Wire entry cards to reopen
      listContainer.querySelectorAll('.journal-entry-card').forEach(card => {
        card.onclick = (e) => {
          if (e.target.closest('.delete-entry-btn')) return;
          this.navigate('journal');
        };
      });

      // Wire delete buttons
      listContainer.querySelectorAll('.delete-entry-btn').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const entryId = parseInt(btn.getAttribute('data-id'), 10);
          const entryDate = btn.getAttribute('data-date');
          this.showConfirm({
            title: 'Delete Entry',
            message: `Delete journal entry from ${entryDate}?`,
            onConfirm: async () => {
              await JournalService.delete(entryId);
              this.showToast('Entry deleted');
              await this.handleRoute();
            }
          });
        };
      });
    };

    renderEntries(entries);
  }

  async hydrateWeeklyReview() {
    const now = new Date();
    const dayOfWeek = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekStart = monday.toISOString().split('T')[0];
    const weekEnd = sunday.toISOString().split('T')[0];

    // Wire back button
    const backBtn = this.appContainer.querySelector('button[aria-label="Go back"], header a[aria-label="Back"]');
    if (backBtn) backBtn.onclick = () => this.navigate('daily');

    // Week selector display
    const weekLabel = this.appContainer.querySelector('.font-label-md.text-on-surface.font-semibold');
    if (weekLabel) {
      weekLabel.innerText = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }

    // Real weekly metrics
    const habits = await HabitService.getAll(false);
    const journals = await JournalService.getAll();
    const goals = await GoalService.getAll();

    const weekJournals = journals.filter(j => j.date >= weekStart && j.date <= weekEnd).length;
    const activeGoals = goals.filter(g => g.status === 'ACTIVE').length;

    // Update 3-column micro-metrics in lime hero card
    const metricCards = this.appContainer.querySelectorAll('.grid.grid-cols-3 > div');
    if (metricCards.length >= 3) {
      const habitsEl = metricCards[0].querySelector('.font-headline-sm');
      if (habitsEl) habitsEl.innerHTML = `${habits.length}<span class="font-body-sm font-normal text-on-surface-variant"> Active</span>`;

      const goalsEl = metricCards[1].querySelector('.font-headline-sm');
      if (goalsEl) goalsEl.innerHTML = `${activeGoals}<span class="font-body-sm font-normal text-on-surface-variant"> Active</span>`;

      const journalEl = metricCards[2].querySelector('.font-headline-sm');
      if (journalEl) journalEl.innerHTML = `${weekJournals}<span class="font-body-sm font-normal text-on-surface-variant"> Logged</span>`;
    }

    // Textareas: Clear fake static text or load saved review
    const textareas = this.appContainer.querySelectorAll('textarea');
    const existing = await db.weeklyReviews.filter(r => matchesActiveUser(r) && r.weekStart === weekStart).first();

    if (textareas.length >= 3) {
      if (existing) {
        textareas[0].value = existing.whatWentWell || '';
        textareas[1].value = existing.challenges || '';
        textareas[2].value = existing.lessons || '';
        if (textareas[3]) textareas[3].value = existing.nextWeekFocus || '';
      } else {
        textareas.forEach(t => { t.value = ''; });
      }
    }

    // Save button
    const saveBtn = this.appContainer.querySelector('#saveReviewBtn') || Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save Review'));
    const draftBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Draft'));

    const persistReview = async (status = 'completed') => {
      const whatWentWell = textareas[0]?.value.trim() || '';
      const challenges = textareas[1]?.value.trim() || '';
      const lessons = textareas[2]?.value.trim() || '';
      const nextWeekFocus = textareas[3]?.value.trim() || '';

      const record = {
        userId: getActiveUserId(),
        weekStart,
        weekEnd,
        whatWentWell,
        challenges,
        lessons,
        nextWeekFocus,
        status,
        updatedAt: new Date().toISOString()
      };

      if (existing) {
        await db.weeklyReviews.update(existing.id, record);
      } else {
        record.createdAt = new Date().toISOString();
        await db.weeklyReviews.add(record);
      }

      this.showToast(status === 'completed' ? 'Weekly review recorded!' : 'Draft saved');
      this.navigate('daily');
    };

    if (saveBtn) saveBtn.onclick = () => persistReview('completed');
    if (draftBtn) draftBtn.onclick = () => persistReview('draft');
  }

  async hydrateGoals() {
    const goals = await GoalService.getAll();
    const main = this.appContainer.querySelector('main') || this.appContainer;
    let listContainer = main.querySelector('section:nth-of-type(2)') || main.querySelector('section') || main;

    if (goals.length === 0) {
      listContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
          <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
            <span class="material-symbols-outlined text-[32px] text-on-surface-variant">flag</span>
          </div>
          <p class="font-headline-sm font-bold text-on-surface">No goals created yet</p>
          <p class="font-body-md text-on-surface-variant">Set your first goal and start tracking your progress.</p>
          <button id="new-goal-btn" class="px-6 py-3 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold hover:bg-secondary-fixed active:scale-95 transition-all shadow-sm">
            <span class="material-symbols-outlined text-[18px] align-middle mr-1">add</span>Create Goal
          </button>
        </div>
      `;
      const btn = listContainer.querySelector('#new-goal-btn');
      if (btn) btn.onclick = () => this.navigate('goal-new');
      return;
    }

    const categoryIcons = { 'Personal Growth': 'self_improvement', 'Health': 'favorite', 'Finance': 'savings', 'Career': 'work', 'Fitness': 'fitness_center' };
    listContainer.innerHTML = `
      <div class="flex flex-col gap-3 px-4 py-2">
        <div class="flex items-center justify-between pb-1">
          <p class="font-label-lg font-bold text-on-surface">${goals.length} ${goals.length === 1 ? 'Goal' : 'Goals'}</p>
          <button id="new-goal-btn" class="flex items-center gap-1 text-primary font-label-md font-semibold">
            <span class="material-symbols-outlined text-[18px]">add</span>New Goal
          </button>
        </div>
        ${goals.map(g => `
          <div class="goal-card bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/20 shadow-sm flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow" data-goal-id="${g.id}">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center">
                  <span class="material-symbols-outlined text-[18px] text-on-primary-container">${categoryIcons[g.category] || 'flag'}</span>
                </div>
                <div>
                  <p class="font-label-lg font-bold text-on-surface">${g.name}</p>
                  <p class="font-label-sm text-on-surface-variant">${g.category}</p>
                </div>
              </div>
              <span class="px-2.5 py-0.5 rounded-full ${g.status === 'COMPLETED' ? 'bg-secondary text-on-secondary' : 'bg-surface-container-highest text-on-surface-variant'} font-label-sm font-medium">${g.status === 'COMPLETED' ? 'Done' : `${g.currentProgress || 0}%`}</span>
            </div>
            <div class="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
              <div class="h-full rounded-full bg-primary transition-all duration-300" style="width: ${g.currentProgress || 0}%"></div>
            </div>
            ${g.deadline ? `<p class="font-label-sm text-on-surface-variant">Deadline: ${new Date(g.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>` : ''}
          </div>
        `).join('')}
      </div>
    `;

    listContainer.querySelector('#new-goal-btn').onclick = () => this.navigate('goal-new');

    listContainer.querySelectorAll('.goal-card').forEach(card => {
      card.onclick = () => {
        this.selectedGoalId = parseInt(card.getAttribute('data-goal-id'), 10);
        this.navigate('goal-detail');
      };
    });
  }

  async hydrateGoalNew() {
    const nameInput = this.appContainer.querySelector('#goal-name') || this.appContainer.querySelector('input[type="text"]');
    const descInput = this.appContainer.querySelector('#goal-description') || this.appContainer.querySelector('textarea');
    const targetInput = this.appContainer.querySelector('#target-metric');
    const saveBtn = this.appContainer.querySelector('#submit-goal-btn') || Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Create') || b.innerText.includes('Save'));
    const cancelBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Cancel'));

    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        this.navigate('goals');
      };
    }

    // Category chips
    let selectedCategory = 'Personal';
    const chips = this.appContainer.querySelectorAll('.category-chip');
    chips.forEach(chip => {
      chip.onclick = (e) => {
        e.preventDefault();
        chips.forEach(c => {
          c.setAttribute('data-selected', 'false');
          c.className = 'category-chip h-8 px-3.5 rounded-full font-label-md text-label-md flex items-center gap-1.5 bg-surface-container-lowest text-on-surface-variant shadow-sm transition-all hover:bg-surface-container-high';
          const check = c.querySelector('.material-symbols-outlined');
          if (check) check.remove();
        });
        chip.setAttribute('data-selected', 'true');
        chip.className = 'category-chip h-8 px-3.5 rounded-full font-label-md text-label-md flex items-center gap-1.5 bg-primary-container text-on-primary-fixed shadow-sm transition-all';
        const newCheck = document.createElement('span');
        newCheck.className = 'material-symbols-outlined text-[16px] leading-none';
        newCheck.innerText = 'check';
        chip.prepend(newCheck);
        selectedCategory = chip.innerText.trim();
      };
    });

    // Deadline date input
    const deadlineParent = this.appContainer.querySelector('#deadline-text')?.closest('div.cursor-pointer') || this.appContainer.querySelector('#target-deadline')?.parentElement;
    let deadlineValue = '';
    if (deadlineParent) {
      const dateWrapper = document.createElement('div');
      dateWrapper.className = 'w-full flex items-center gap-2';
      dateWrapper.innerHTML = `
        <input type="date" id="goal-deadline-input" class="w-full h-[54px] rounded-2xl bg-surface-container-lowest text-on-surface font-body-md px-4 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      `;
      deadlineParent.parentNode.replaceChild(dateWrapper, deadlineParent);
      const dInput = dateWrapper.querySelector('#goal-deadline-input');
      dInput.onchange = () => { deadlineValue = dInput.value; };
    }

    // Milestones dynamic list (clean empty state by default)
    const milestonesContainer = this.appContainer.querySelector('#milestones-container');
    if (milestonesContainer) {
      milestonesContainer.innerHTML = `
        <div id="no-milestones-prompt" class="text-center py-3 text-on-surface-variant font-body-sm">
          No milestones added yet. Click "Add milestone" below to define steps.
        </div>
      `;
    }

    const addMilestoneBtn = this.appContainer.querySelector('#add-milestone-btn');
    if (addMilestoneBtn && milestonesContainer) {
      addMilestoneBtn.onclick = (e) => {
        e.preventDefault();
        const promptEl = milestonesContainer.querySelector('#no-milestones-prompt');
        if (promptEl) promptEl.remove();

        const count = milestonesContainer.querySelectorAll('.milestone-input-row').length + 1;
        const row = document.createElement('div');
        row.className = 'milestone-input-row flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-low transition-colors';
        row.innerHTML = `
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <span class="w-6 h-6 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center font-label-sm">${count}</span>
            <input type="text" placeholder="Milestone step title..." class="milestone-title-input w-full bg-transparent font-body-md text-on-surface focus:outline-none placeholder:text-outline-variant" />
          </div>
          <button type="button" aria-label="Remove milestone" class="text-outline-variant hover:text-error p-1 transition-colors">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        `;
        row.querySelector('button').onclick = () => {
          row.remove();
          if (milestonesContainer.querySelectorAll('.milestone-input-row').length === 0) {
            milestonesContainer.innerHTML = `
              <div id="no-milestones-prompt" class="text-center py-3 text-on-surface-variant font-body-sm">
                No milestones added yet. Click "Add milestone" below to define steps.
              </div>
            `;
          }
        };
        milestonesContainer.appendChild(row);
        row.querySelector('input').focus();
      };
    }

    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const name = nameInput?.value.trim();
        if (!name) {
          this.showToast('Please enter a goal name');
          nameInput?.focus();
          return;
        }

        const description = descInput?.value.trim() || '';
        const target = parseFloat(targetInput?.value) || 100;
        const deadline = deadlineValue || this.appContainer.querySelector('#goal-deadline-input')?.value || '';

        const goal = await GoalService.create({
          name,
          description,
          category: selectedCategory,
          target,
          deadline
        });

        // Collect entered milestones
        const milestoneInputs = milestonesContainer ? Array.from(milestonesContainer.querySelectorAll('.milestone-title-input')) : [];
        for (const input of milestoneInputs) {
          const mTitle = input.value.trim();
          if (mTitle) {
            await GoalService.addMilestone(goal.id, mTitle);
          }
        }

        this.showToast(`Goal "${name}" created!`);
        this.navigate('goals');
      };
    }
  }

  async hydrateGoalDetail() {
    const goals = await GoalService.getAll();
    const goal = (this.selectedGoalId ? await GoalService.get(this.selectedGoalId) : null) || (goals.length > 0 ? await GoalService.get(goals[0].id) : null);

    const mainEl = this.appContainer.querySelector('main');
    if (!goal) {
      if (mainEl) {
        mainEl.innerHTML = `
          <div class="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 py-8">
            <div class="w-16 h-16 rounded-full bg-primary-container text-on-primary-fixed flex items-center justify-center mb-4">
              <span class="material-symbols-outlined text-[32px]">flag</span>
            </div>
            <h2 class="font-headline-sm font-bold text-on-surface mb-2">No Goal Selected</h2>
            <p class="font-body-md text-on-surface-variant max-w-sm mb-6">Create a goal to begin tracking milestones and building momentum.</p>
            <div class="flex gap-3">
              <button id="detail-create-goal-btn" class="px-5 py-2.5 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold shadow-sm hover:opacity-90">Create Goal</button>
              <button id="detail-back-goals-btn" class="px-5 py-2.5 rounded-full bg-surface-container-highest text-on-surface font-label-md font-bold">View Goals</button>
            </div>
          </div>
        `;
        mainEl.querySelector('#detail-create-goal-btn')?.addEventListener('click', () => this.navigate('goal-new'));
        mainEl.querySelector('#detail-back-goals-btn')?.addEventListener('click', () => this.navigate('goals'));
      }
      return;
    }

    this.selectedGoalId = goal.id;

    // Back button
    const backBtn = this.appContainer.querySelector('header a[aria-label="Back"], header button[aria-label="Back"]');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        this.navigate('goals');
      };
    }

    // Header & title
    const nameEl = this.appContainer.querySelector('h2.font-headline-lg-mobile, .font-headline-lg-mobile');
    if (nameEl) nameEl.innerText = goal.name;

    const descEl = this.appContainer.querySelector('h2.font-headline-lg-mobile + p');
    if (descEl) descEl.innerText = goal.description || 'Step-by-step progress towards your target.';

    // Category badge
    const catBadges = this.appContainer.querySelectorAll('.bg-surface-container-lowest.text-on-surface');
    catBadges.forEach(b => {
      if (b.innerText.includes('Personal') || b.classList.contains('font-label-md')) {
        b.innerText = goal.category || 'General';
      }
    });

    // Progress metrics
    const milestones = goal.milestones || [];
    const completedCount = milestones.filter(m => m.completed).length;
    const totalCount = milestones.length;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : (goal.currentProgress || 0);

    const pctEl = this.appContainer.querySelector('.font-display-lg');
    if (pctEl) pctEl.innerText = `${progressPct}%`;

    const milestoneSubEl = pctEl?.parentElement?.querySelector('.font-label-md');
    if (milestoneSubEl) {
      milestoneSubEl.innerText = totalCount > 0
        ? `${completedCount} of ${totalCount} milestones completed`
        : 'No milestones set yet';
    }

    // Horizontal progress bar
    const barEl = this.appContainer.querySelector('.bg-secondary.rounded-full');
    if (barEl) barEl.style.width = `${progressPct}%`;

    // SVG radial indicator
    const svgCircle = this.appContainer.querySelector('svg circle[stroke="#3e6a00"]');
    if (svgCircle) {
      const circ = 119.38;
      svgCircle.style.strokeDashoffset = `${circ * (1 - progressPct / 100)}`;
    }

    // Deadline pill
    const deadlineEl = this.appContainer.querySelector('.material-symbols-outlined:not(header *)')?.closest('div')?.parentElement?.querySelector('.backdrop-blur-md');
    if (deadlineEl) {
      deadlineEl.innerHTML = `
        <span class="material-symbols-outlined text-[16px] text-primary">calendar_today</span>
        <span>${goal.deadline ? `Due ${goal.deadline}` : 'No deadline set'}</span>
      `;
    }

    // Analytics section
    const startedDate = goal.createdAt ? new Date(goal.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today';
    const statCards = this.appContainer.querySelectorAll('.grid.grid-cols-3 > div');
    if (statCards.length >= 3) {
      const startedVal = statCards[0].querySelector('.font-label-md');
      if (startedVal) startedVal.innerText = startedDate;

      const remainingVal = statCards[1].querySelector('.font-label-md');
      if (remainingVal) {
        if (goal.deadline) {
          const diffDays = Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24));
          remainingVal.innerText = diffDays > 0 ? `${diffDays} Days` : (diffDays === 0 ? 'Today' : 'Overdue');
        } else {
          remainingVal.innerText = '--';
        }
      }

      const streakVal = statCards[2].querySelector('.font-label-md');
      if (streakVal) {
        streakVal.innerText = `${completedCount}/${totalCount} Done`;
      }
    }

    // Milestones section header count
    const milestoneCountBadge = Array.from(this.appContainer.querySelectorAll('span')).find(s => s.className.includes('bg-surface-container-high') && s.innerText.includes('/'));
    if (milestoneCountBadge) {
      milestoneCountBadge.innerText = `${completedCount}/${totalCount}`;
    }

    // Milestone container
    const milestoneListContainer = this.appContainer.querySelector('.flex.flex-col.gap-2\\.5:not(#milestones-container)') || this.appContainer.querySelectorAll('.flex.flex-col.gap-2\\.5')[0];
    if (milestoneListContainer) {
      if (milestones.length === 0) {
        milestoneListContainer.innerHTML = `
          <div class="p-4 bg-surface-container-lowest rounded-2xl text-center text-on-surface-variant font-body-sm border border-dashed border-outline-variant/40">
            No milestones added yet. Tap "Add step" to break this goal into small wins.
          </div>
        `;
      } else {
        milestoneListContainer.innerHTML = milestones.map(m => `
          <div class="milestone-item flex items-center justify-between p-3.5 bg-surface-container-lowest rounded-[20px] shadow-sm transition-transform active:scale-[0.99]" data-milestone-id="${m.id}">
            <div class="milestone-toggle-btn flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
              <div class="w-7 h-7 rounded-full ${m.completed ? 'bg-secondary text-on-secondary' : 'bg-surface-container-high text-on-surface-variant'} flex items-center justify-center flex-shrink-0 shadow-sm transition-colors">
                <span class="material-symbols-outlined text-[18px]">${m.completed ? 'check' : ''}</span>
              </div>
              <div class="flex flex-col min-w-0">
                <span class="font-body-md text-body-md text-on-surface ${m.completed ? 'line-through opacity-80' : 'font-semibold'} truncate">${m.title}</span>
                <span class="font-label-sm text-label-sm ${m.completed ? 'text-secondary' : 'text-on-surface-variant'} flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full ${m.completed ? 'bg-secondary' : 'bg-outline-variant'}"></span>
                  ${m.completed ? 'Completed' : 'Pending'}
                </span>
              </div>
            </div>
            <button class="milestone-delete-btn w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container transition-colors ml-2" aria-label="Delete milestone" data-id="${m.id}">
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        `).join('');

        // Wire toggles
        milestoneListContainer.querySelectorAll('.milestone-toggle-btn').forEach(btn => {
          btn.onclick = async () => {
            const mId = parseInt(btn.closest('.milestone-item').getAttribute('data-milestone-id'), 10);
            const res = await GoalService.toggleMilestone(mId);
            this.showToast(res ? 'Milestone completed! 🎉' : 'Milestone marked pending');
            await this.hydrateGoalDetail();
          };
        });

        // Wire deletes
        milestoneListContainer.querySelectorAll('.milestone-delete-btn').forEach(btn => {
          btn.onclick = async (e) => {
            e.stopPropagation();
            const mId = parseInt(btn.getAttribute('data-id'), 10);
            const m = milestones.find(item => item.id === mId);
            this.showConfirm({
              title: 'Delete Milestone',
              message: `Remove "${m?.title || 'this milestone'}"?`,
              confirmText: 'Delete',
              isDestructive: true,
              onConfirm: async () => {
                await GoalService.deleteMilestone(mId);
                this.showToast('Milestone deleted');
                await this.hydrateGoalDetail();
              }
            });
          };
        });
      }
    }

    // Add step button
    const addStepBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Add step') || b.innerText.includes('Add Step'));
    if (addStepBtn) {
      addStepBtn.onclick = () => {
        this.showModal({
          title: 'Add Milestone Step',
          bodyHtml: `
            <div class="space-y-3">
              <p class="font-body-sm text-on-surface-variant">Break down "${goal.name}" into an actionable step:</p>
              <input id="modal-milestone-title" type="text" placeholder="e.g. Read 20 pages" class="w-full h-12 px-4 rounded-xl bg-surface-container text-on-surface font-body-md focus:outline-none focus:ring-1 focus:ring-primary" autofocus />
            </div>
          `,
          confirmText: 'Add Step',
          onConfirm: async () => {
            const titleInput = document.getElementById('modal-milestone-title');
            const title = titleInput?.value.trim();
            if (title) {
              await GoalService.addMilestone(goal.id, title);
              this.showToast('Milestone added!');
              await this.hydrateGoalDetail();
            }
          }
        });
      };
    }

    // Goal notes
    const noteInput = this.appContainer.querySelector('input[placeholder*="note about your goal"]');
    const addNoteBtn = noteInput?.nextElementSibling;
    if (addNoteBtn && noteInput) {
      addNoteBtn.onclick = async () => {
        const text = noteInput.value.trim();
        if (text) {
          this.showToast('Note added to goal');
          noteInput.value = '';
        }
      };
    }

    // Sticky bottom buttons: Update Progress / Delete Goal
    const bottomBtns = this.appContainer.querySelectorAll('.sticky.bottom-4 button');
    if (bottomBtns.length >= 2) {
      // Button 1: Update progress
      bottomBtns[0].onclick = () => {
        if (milestones.length === 0) {
          addStepBtn?.click();
        } else {
          this.showToast('Check off milestones above to update progress!');
        }
      };

      // Button 2: Delete Goal
      bottomBtns[1].innerHTML = `
        <span class="material-symbols-outlined text-[18px] text-error">delete</span>
        <span class="text-error font-semibold">Delete goal</span>
      `;
      bottomBtns[1].onclick = () => {
        this.showConfirm({
          title: 'Delete Goal',
          message: `Are you sure you want to delete "${goal.name}" and all its milestones? This cannot be undone.`,
          confirmText: 'Delete Goal',
          isDestructive: true,
          onConfirm: async () => {
            await GoalService.delete(goal.id);
            this.showToast('Goal deleted');
            this.navigate('goals');
          }
        });
      };
    }
  }

  async hydrateGoalStats() {
    const goals = await GoalService.getAll();
    const completed = goals.filter(g => g.status === 'COMPLETED').length;
    const active = goals.filter(g => g.status === 'ACTIVE').length;
    const totalProgress = goals.length > 0 ? Math.round(goals.reduce((s, g) => s + (g.currentProgress || 0), 0) / goals.length) : 0;

    // Update stat elements if present
    const headlineEls = this.appContainer.querySelectorAll('.font-headline-sm');
    headlineEls.forEach(el => {
      const text = el.innerText;
      if (text.includes('Active') || text.includes('goal')) {
        el.innerText = `${active} Active`;
      }
    });

    // Wire navigation
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('New Goal') || text.includes('Create')) btn.onclick = () => this.navigate('goal-new');
      else if (text.includes('View All')) btn.onclick = () => this.navigate('goals');
    });
  }

  async hydrateMoney() {
    const stats = await MoneyService.getFinancialStats();
    const budgetStatus = await MoneyService.getBudgetStatus();
    const transactions = await MoneyService.getAllTransactions();

    // 1. Period Selector display current month
    const monthSelectorText = this.appContainer.querySelector('button .font-label-md');
    if (monthSelectorText && (monthSelectorText.innerText.includes('October') || monthSelectorText.innerText.includes('2024'))) {
      monthSelectorText.innerText = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    // 2. Update real balance and income/expense elements
    const balanceEl = this.appContainer.querySelector('.font-display-lg');
    if (balanceEl) {
      balanceEl.innerText = `$${stats.netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    // Balance caption
    const balanceCaption = balanceEl?.parentElement?.querySelector('.font-body-sm span:last-child');
    if (balanceCaption) {
      if (stats.totalIncome === 0 && stats.totalExpenses === 0) {
        balanceCaption.innerText = 'Start logging income and expenses to track your financial flow.';
      } else if (stats.netBalance >= 0) {
        balanceCaption.innerText = `Positive net momentum of +$${stats.netBalance.toFixed(2)} this month.`;
      } else {
        balanceCaption.innerText = `Net outflow of -$${Math.abs(stats.netBalance).toFixed(2)} this month.`;
      }
    }

    // Stat Trio Row: Income, Expenses, Saved
    const statTrio = this.appContainer.querySelectorAll('.grid.grid-cols-3 > div');
    if (statTrio.length >= 3) {
      const incEl = statTrio[0].querySelector('.font-label-md');
      if (incEl) incEl.innerText = `+$${stats.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      const expEl = statTrio[1].querySelector('.font-label-md');
      if (expEl) expEl.innerText = `-$${stats.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      const saveEl = statTrio[2].querySelector('.font-label-md');
      if (saveEl) saveEl.innerText = `${stats.savingsRate}% Rate`;
    }

    // 3. Quick action buttons: Add Income & Add Expense
    const addIncBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Add Income'));
    if (addIncBtn) {
      addIncBtn.onclick = (e) => {
        e.preventDefault();
        this.selectedTransactionType = 'income';
        this.navigate('transaction-new');
      };
    }

    const addExpBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Add Expense'));
    if (addExpBtn) {
      addExpBtn.onclick = (e) => {
        e.preventDefault();
        this.selectedTransactionType = 'expense';
        this.navigate('transaction-new');
      };
    }

    // 4. Budget Progress Card
    const budgetBar = this.appContainer.querySelector('.bg-primary-container.h-full');
    const budgetRatio = this.appContainer.querySelector('.font-label-md.font-semibold:not(header *)');
    const budgetLeft = budgetRatio?.nextElementSibling;

    if (budgetStatus.totalLimit > 0) {
      if (budgetBar) budgetBar.style.width = `${Math.min(100, budgetStatus.percentageUsed)}%`;
      if (budgetRatio) budgetRatio.innerText = `$${budgetStatus.spent.toFixed(2)} / $${budgetStatus.totalLimit.toFixed(2)}`;
      if (budgetLeft) budgetLeft.innerText = `$${Math.max(0, budgetStatus.remaining).toFixed(2)} remaining`;
    } else {
      if (budgetBar) budgetBar.style.width = '0%';
      if (budgetRatio) budgetRatio.innerText = `$${budgetStatus.spent.toFixed(2)} spent`;
      if (budgetLeft) budgetLeft.innerText = 'No budget cap configured';
    }

    // 5. Recent Activity List
    const recentActivityHeader = Array.from(this.appContainer.querySelectorAll('h2')).find(h => h.innerText.includes('Recent Activity'));
    const recentActivityContainer = recentActivityHeader?.closest('div.flex.flex-col')?.querySelector('.flex.flex-col.gap-2\\.5');
    if (recentActivityContainer) {
      if (transactions.length === 0) {
        recentActivityContainer.innerHTML = `
          <div class="p-6 bg-surface-container-lowest rounded-[20px] text-center text-on-surface-variant font-body-sm border border-dashed border-outline-variant/40">
            No transactions recorded yet. Tap "Add Income" or "Add Expense" above to start logging.
          </div>
        `;
      } else {
        const sorted = [...transactions].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).slice(0, 4);
        recentActivityContainer.innerHTML = sorted.map(tx => {
          const isIncome = tx.type === 'income';
          const catIcon = isIncome ? 'payments' : (tx.category === 'Food' ? 'restaurant' : (tx.category === 'Transport' ? 'directions_car' : (tx.category === 'Bills' ? 'receipt' : 'shopping_bag')));
          const dateStr = tx.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today';
          return `
            <div class="flex items-center justify-between p-4 rounded-[18px] bg-surface-container-lowest shadow-sm">
              <div class="flex items-center gap-3.5 min-w-0">
                <div class="w-11 h-11 rounded-full ${isIncome ? 'bg-primary-container text-on-primary-fixed' : 'bg-surface-container text-on-surface-variant'} flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[22px]">${catIcon}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="font-label-lg text-label-lg text-on-surface font-semibold truncate">${tx.name}</span>
                  <span class="font-body-sm text-body-sm text-on-surface-variant truncate">${tx.category || (isIncome ? 'Income' : 'Expense')} · ${dateStr}</span>
                </div>
              </div>
              <span class="font-label-lg text-label-lg ${isIncome ? 'text-secondary' : 'text-on-surface'} font-bold shrink-0">
                ${isIncome ? '+' : '-'}$${tx.amount.toFixed(2)}
              </span>
            </div>
          `;
        }).join('');
      }
    }

    // 6. Navigation buttons
    this.appContainer.querySelectorAll('a, button').forEach(el => {
      const text = el.innerText?.trim() || '';
      if (text.includes('View all') || text.includes('View all transactions')) {
        el.onclick = (e) => { e.preventDefault(); this.navigate('transactions'); };
      }
    });
  }

  async hydrateTransactions() {
    const transactions = await MoneyService.getAllTransactions();
    const stats = await MoneyService.getFinancialStats();

    // Back button
    const backBtn = this.appContainer.querySelector('button[aria-label="Go Back"], a[aria-label="Go Back"], header a[aria-label="Back"]');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        this.navigate('money');
      };
    }

    // Add transaction button in header or subheader
    const headerAddBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Add') || b.innerText.includes('New') || b.getAttribute('aria-label') === 'Add');
    if (headerAddBtn) headerAddBtn.onclick = () => this.navigate('transaction-new');

    // Date / month display
    const monthEl = this.appContainer.querySelector('.flex.items-center.gap-1\\.5.font-label-md');
    if (monthEl) {
      monthEl.innerHTML = `
        <span class="material-symbols-outlined text-primary text-[18px]">calendar_month</span>
        <span>${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
      `;
    }

    // Summary row card
    const summaryCard = this.appContainer.querySelector('.bg-surface-container-lowest.p-space-md.rounded-lg');
    if (summaryCard) {
      const incEl = summaryCard.querySelector('.grid.grid-cols-3 > div:nth-child(1) .font-headline-sm');
      if (incEl) incEl.innerText = `+$${stats.totalIncome.toFixed(2)}`;

      const expEl = summaryCard.querySelector('.grid.grid-cols-3 > div:nth-child(2) .font-headline-sm');
      if (expEl) expEl.innerText = `-$${stats.totalExpenses.toFixed(2)}`;

      const netEl = summaryCard.querySelector('.grid.grid-cols-3 > div:nth-child(3) .font-label-md');
      if (netEl) netEl.innerText = `${stats.netBalance >= 0 ? '+' : '-'}$${Math.abs(stats.netBalance).toFixed(2)}`;

      const savedEl = summaryCard.querySelector('.font-label-sm.text-primary');
      if (savedEl) savedEl.innerHTML = `<span class="material-symbols-outlined text-[14px]">trending_up</span> ${stats.savingsRate}% Saved`;
    }

    // Filter tabs counts
    const incomeCount = transactions.filter(t => t.type === 'income').length;
    const expenseCount = transactions.filter(t => t.type === 'expense').length;

    let activeFilter = 'all';
    let searchQuery = '';

    const filterTabs = this.appContainer.querySelectorAll('.filter-tab');
    if (filterTabs.length >= 3) {
      filterTabs[0].innerText = `All (${transactions.length})`;
      filterTabs[1].innerText = `Income (${incomeCount})`;
      filterTabs[2].innerText = `Expenses (${expenseCount})`;
      if (filterTabs[3]) filterTabs[3].style.display = 'none';

      filterTabs.forEach((tab, idx) => {
        tab.onclick = () => {
          filterTabs.forEach(t => {
            t.className = 'filter-tab px-space-md py-1.5 rounded-full font-label-md text-label-md bg-surface-container-lowest text-on-surface-variant shadow-sm flex-shrink-0 hover:bg-surface-container-low transition-all';
          });
          tab.className = 'filter-tab px-space-md py-1.5 rounded-full font-label-md text-label-md bg-primary-container text-on-primary-container shadow-sm flex-shrink-0 transition-all';
          activeFilter = idx === 0 ? 'all' : (idx === 1 ? 'income' : 'expense');
          renderList();
        };
      });
    }

    // Search input with debounce
    const searchInput = this.appContainer.querySelector('input[placeholder*="Search"]');
    if (searchInput) {
      searchInput.oninput = debounce(() => {
        searchQuery = searchInput.value.trim().toLowerCase();
        renderList();
      }, 180);
    }

    let currentLimit = 25;

    // Container for transactions
    const listContainer = this.appContainer.querySelector('.space-y-space-lg:not(main > div)');
    const renderList = () => {
      if (!listContainer) return;

      let filtered = [...transactions];
      if (activeFilter === 'income') filtered = filtered.filter(t => t.type === 'income');
      else if (activeFilter === 'expense') filtered = filtered.filter(t => t.type === 'expense');

      if (searchQuery) {
        filtered = filtered.filter(t =>
          (t.name && t.name.toLowerCase().includes(searchQuery)) ||
          (t.category && t.category.toLowerCase().includes(searchQuery)) ||
          (t.notes && t.notes.toLowerCase().includes(searchQuery))
        );
      }

      if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div class="w-16 h-16 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center mb-4">
              <span class="material-symbols-outlined text-[32px]">receipt_long</span>
            </div>
            <h3 class="font-headline-sm font-bold text-on-surface mb-1">${transactions.length === 0 ? 'No Transactions Yet' : 'No Matching Transactions'}</h3>
            <p class="font-body-md text-on-surface-variant max-w-sm mb-6">
              ${transactions.length === 0 ? 'Start tracking your daily cash flow by recording your first transaction.' : 'Try adjusting your search or category filter.'}
            </p>
            <button id="transactions-empty-add-btn" class="px-6 py-3 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold shadow-sm hover:opacity-90 flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px]">add</span>
              <span>Add Transaction</span>
            </button>
          </div>
        `;
        listContainer.querySelector('#transactions-empty-add-btn')?.addEventListener('click', () => this.navigate('transaction-new'));
        return;
      }

      // Slice visible for pagination
      const sorted = filtered.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
      const visible = sorted.slice(0, currentLimit);

      // Group transactions by date
      const groups = {};
      visible.forEach(t => {
        const d = t.date ? new Date(t.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Recent';
        if (!groups[d]) groups[d] = [];
        groups[d].push(t);
      });

      let html = Object.entries(groups).map(([dateLabel, items]) => {
        const groupTotal = items.reduce((sum, item) => sum + (item.type === 'income' ? item.amount : -item.amount), 0);
        return `
          <div class="space-y-space-xs">
            <div class="flex items-center justify-between px-1">
              <span class="font-label-sm text-label-sm tracking-wider text-on-surface-variant uppercase font-semibold">${dateLabel}</span>
              <span class="font-label-sm text-label-sm ${groupTotal >= 0 ? 'text-secondary' : 'text-outline'}">
                ${groupTotal >= 0 ? '+' : '-'}$${Math.abs(groupTotal).toFixed(2)}
              </span>
            </div>
            <div class="bg-surface-container-lowest rounded-lg shadow-sm p-space-xs space-y-1">
              ${items.map(tx => {
                const isInc = tx.type === 'income';
                const icon = isInc ? 'payments' : (tx.category === 'Food' ? 'local_cafe' : (tx.category === 'Bills' ? 'electric_bolt' : 'receipt'));
                return `
                  <div class="flex items-center justify-between p-space-sm rounded-DEFAULT hover:bg-surface-container-low transition-colors" data-tx-id="${tx.id}">
                    <div class="flex items-center gap-space-sm min-w-0 flex-1">
                      <div class="w-11 h-11 rounded-full ${isInc ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'} flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-[22px]">${icon}</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="font-label-lg text-label-lg text-on-surface truncate font-medium">${tx.name}</span>
                        <div class="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                          <span>${tx.category || (isInc ? 'Income' : 'General')}</span>
                          ${tx.notes ? `<span>•</span><span class="truncate italic">${tx.notes}</span>` : ''}
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span class="${isInc ? 'bg-primary-container text-on-primary-container px-2.5 py-1 rounded-full font-label-md text-label-md font-bold' : 'font-label-lg text-label-lg text-on-surface font-semibold'}">
                        ${isInc ? '+' : '-'}$${tx.amount.toFixed(2)}
                      </span>
                      <button class="tx-del-btn w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container transition-colors" aria-label="Delete transaction" data-id="${tx.id}">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('');

      if (sorted.length > currentLimit) {
        html += `
          <div class="pt-2 pb-4 text-center">
            <button id="tx-load-more-btn" class="w-full py-3 rounded-full bg-surface-container text-on-surface font-label-md font-semibold hover:bg-surface-container-high active:scale-98 transition-all shadow-xs flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-[18px]">expand_more</span>
              <span>Load More (${sorted.length - currentLimit} remaining)</span>
            </button>
          </div>
        `;
      }

      listContainer.innerHTML = html;

      const loadMoreBtn = listContainer.querySelector('#tx-load-more-btn');
      if (loadMoreBtn) {
        loadMoreBtn.onclick = () => {
          currentLimit += 25;
          renderList();
        };
      }

      // Wire delete handlers
      listContainer.querySelectorAll('.tx-del-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const txId = parseInt(btn.getAttribute('data-id'), 10);
          const targetTx = transactions.find(t => t.id === txId);
          this.showConfirm({
            title: 'Delete Transaction',
            message: `Are you sure you want to delete "${targetTx?.name || 'this transaction'}" ($${targetTx?.amount.toFixed(2) || '0.00'})?`,
            confirmText: 'Delete',
            isDestructive: true,
            onConfirm: async () => {
              await MoneyService.deleteTransaction(txId);
              this.showToast('Transaction deleted');
              await this.hydrateTransactions();
            }
          });
        };
      });
    };

    renderList();
  }

  async hydrateTransactionNew() {
    // Reset any prefilled template values so user starts completely clean
    const amountInput = this.appContainer.querySelector('#tx-amount') || this.appContainer.querySelector('input[type="number"]');
    const nameInput = this.appContainer.querySelector('#tx-name') || this.appContainer.querySelector('input[type="text"]');
    const notesInput = this.appContainer.querySelector('#tx-notes') || this.appContainer.querySelector('textarea');
    const dateDisplay = this.appContainer.querySelector('#tx-date');
    const saveBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save Transaction') || b.innerText.includes('Save') || b.innerText.includes('Log'));
    const cancelBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Cancel'));

    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        this.navigate('transactions');
      };
    }

    // Clean initial inputs
    if (amountInput) amountInput.value = '';
    if (nameInput) nameInput.value = '';
    if (notesInput) notesInput.value = '';
    if (dateDisplay) {
      dateDisplay.innerText = `Today, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    let currentType = this.selectedTransactionType || 'expense';
    this.selectedTransactionType = null; // reset

    const tabExpense = this.appContainer.querySelector('#tab-expense');
    const tabIncome = this.appContainer.querySelector('#tab-income');
    const typeCaption = this.appContainer.querySelector('#type-caption');

    const updateTypeUI = (type) => {
      currentType = type;
      if (tabExpense && tabIncome) {
        if (type === 'expense') {
          tabExpense.className = 'flex-1 py-3 px-4 rounded-full bg-primary-container text-on-primary-fixed font-label-lg text-label-lg transition-all shadow-sm flex items-center justify-center gap-1.5';
          tabIncome.className = 'flex-1 py-3 px-4 rounded-full text-on-surface-variant hover:text-on-surface font-label-lg text-label-lg transition-all flex items-center justify-center gap-1.5';
          if (typeCaption) typeCaption.textContent = 'Logged as Personal Expense';
        } else {
          tabIncome.className = 'flex-1 py-3 px-4 rounded-full bg-primary-container text-on-primary-fixed font-label-lg text-label-lg transition-all shadow-sm flex items-center justify-center gap-1.5';
          tabExpense.className = 'flex-1 py-3 px-4 rounded-full text-on-surface-variant hover:text-on-surface font-label-lg text-label-lg transition-all flex items-center justify-center gap-1.5';
          if (typeCaption) typeCaption.textContent = 'Logged as Confirmed Income';
        }
      }
    };

    updateTypeUI(currentType);

    if (tabExpense) tabExpense.onclick = (e) => { e.preventDefault(); updateTypeUI('expense'); };
    if (tabIncome) tabIncome.onclick = (e) => { e.preventDefault(); updateTypeUI('income'); };

    // Category pills
    let selectedCategory = currentType === 'income' ? 'Salary' : 'Food';
    const catPills = this.appContainer.querySelectorAll('.cat-pill');
    catPills.forEach(pill => {
      pill.onclick = (e) => {
        e.preventDefault();
        catPills.forEach(p => {
          p.className = 'cat-pill h-[36px] px-3.5 rounded-full bg-surface-container-lowest text-on-surface font-label-md text-label-md flex items-center gap-1.5 hover:bg-surface-container transition-all shadow-sm';
          const chk = p.querySelector('.material-symbols-outlined');
          if (chk) chk.remove();
        });
        pill.className = 'cat-pill h-[36px] px-3.5 rounded-full bg-primary-container text-on-primary-fixed font-label-md text-label-md flex items-center gap-1.5 transition-all shadow-sm';
        const chk = document.createElement('span');
        chk.className = 'material-symbols-outlined text-[16px] -mr-1';
        chk.innerText = 'check';
        pill.appendChild(chk);
        selectedCategory = pill.innerText.replace('check', '').trim();
      };
    });

    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const amount = parseFloat(amountInput?.value);
        if (isNaN(amount) || amount <= 0) {
          this.showToast('Please enter a valid positive amount');
          amountInput?.focus();
          return;
        }

        const name = nameInput?.value.trim() || (currentType === 'income' ? 'Income' : 'Expense');
        const notes = notesInput?.value.trim() || '';

        await MoneyService.addTransaction({
          name,
          type: currentType,
          amount,
          category: selectedCategory,
          notes,
          date: new Date().toISOString()
        });

        this.showToast(`${currentType === 'income' ? 'Income' : 'Expense'} of $${amount.toFixed(2)} logged!`);
        this.navigate('transactions');
      };
    }
  }

  async hydrateBudget() {
    const budgetStatus = await MoneyService.getBudgetStatus();

    // Update budget progress bar
    const progressBar = this.appContainer.querySelector('.bg-primary, .bg-secondary, [style*="width"]');
    if (progressBar) progressBar.style.width = `${budgetStatus.percentageUsed}%`;

    // Update spend/limit text
    const headlineEls = this.appContainer.querySelectorAll('.font-headline-sm, .font-display-lg');
    headlineEls.forEach(el => {
      if (el.innerText.includes('$') || el.innerText.match(/\d/)) {
        if (!el._budgetSet) {
          el.innerText = `$${budgetStatus.spent.toLocaleString('en-US', { minimumFractionDigits: 2 })} / $${budgetStatus.totalLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          el._budgetSet = true;
        }
      }
    });

    // Wire navigation
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Add') || text.includes('Transaction')) btn.onclick = () => this.navigate('transaction-new');
      else if (text.includes('Stats') || text.includes('Analytics')) btn.onclick = () => this.navigate('financial-stats');
    });
  }

  async hydrateFinancialStats() {
    const stats = await MoneyService.getFinancialStats();

    // Inject real stats into metric cards
    const headlineEls = this.appContainer.querySelectorAll('.font-headline-sm');
    let idx = 0;
    headlineEls.forEach(el => {
      if (idx === 0 && el.innerText.includes('$')) {
        el.innerText = `$${stats.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        idx++;
      } else if (idx === 1 && el.innerText.includes('$')) {
        el.innerText = `$${stats.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        idx++;
      }
    });

    // Wire navigation
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Transactions')) btn.onclick = () => this.navigate('transactions');
      else if (text.includes('Budget')) btn.onclick = () => this.navigate('budget');
    });
  }

  async hydrateTradingDashboard() {
    const accounts = await db.tradingAccounts.toArray();
    const activeAccounts = accounts.filter(a => a.status === 'ACTIVE');
    const blownAccounts = accounts.filter(a => a.status === 'BLOWN');

    // Aggregate real metrics across accounts
    const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
    const totalStarting = accounts.reduce((sum, a) => sum + a.startingBalance, 0);
    const totalPL = parseFloat((totalBalance - totalStarting).toFixed(2));
    const allTrades = await db.trades.toArray();
    const winTrades = allTrades.filter(t => t.pnl > 0).length;
    const winRate = allTrades.length > 0 ? Math.round((winTrades / allTrades.length) * 100) : 0;

    // Update Banner / Metrics
    const balanceEl = this.appContainer.querySelector('.font-display-lg, h1.font-bold');
    if (balanceEl && !balanceEl.innerText.includes('Alex')) {
      balanceEl.innerText = `$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    // Wire New Trade Button
    const newTradeBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('New Trade') || b.innerText.includes('Log Trade'));
    if (newTradeBtn) {
      if (activeAccounts.length === 0) {
        newTradeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        newTradeBtn.onclick = (e) => {
          e.preventDefault();
          alert('All trading accounts are BLOWN or no active accounts exist. Please create an active account to trade.');
        };
      } else {
        newTradeBtn.onclick = () => this.navigate('trade-new');
      }
    }

    // Wire Navigation Buttons
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Accounts') || text.includes('Manage')) btn.onclick = () => this.navigate('trading-accounts');
      else if (text.includes('History')) btn.onclick = () => this.navigate('trade-history');
      else if (text.includes('Review')) btn.onclick = () => this.navigate('trading-review');
      else if (text.includes('Statistics') || text.includes('Stats')) btn.onclick = () => this.navigate('trading-stats');
      else if (text.includes('Calculator') || text.includes('Risk')) btn.onclick = () => this.navigate('risk-calculator');
      else if (text.includes('Journal')) btn.onclick = () => this.navigate('trade-journal');
    });
  }

  async hydrateTradingAccounts() {
    const { active, blown } = await TradingEngine.getAccountsPartitioned();
    const allAccounts = [...active, ...blown];

    // Wire Back button
    const backBtn = this.appContainer.querySelector('header a[aria-label="Back"], button[aria-label="Go back"]');
    if (backBtn) backBtn.onclick = () => this.navigate('trading');

    // Wire Add Account Button
    const addBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Add') || b.innerText.includes('New Account') || b.getAttribute('aria-label') === 'Add Account');
    if (addBtn) {
      addBtn.onclick = () => this.navigate('trading-account-new');
    }

    // Top aggregate summary
    const totalPL = allAccounts.reduce((sum, a) => sum + ((a.currentBalance || a.startingBalance) - a.startingBalance), 0);
    const totalStarting = allAccounts.reduce((sum, a) => sum + a.startingBalance, 0);
    const portfolioPL = this.appContainer.querySelector('.font-display-lg');
    if (portfolioPL) {
      portfolioPL.innerText = `${totalPL >= 0 ? '+' : '-'}$${Math.abs(totalPL).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    const roiEl = this.appContainer.querySelector('.font-label-md.text-primary');
    if (roiEl) {
      const roi = totalStarting > 0 ? ((totalPL / totalStarting) * 100).toFixed(1) : '0.0';
      roiEl.innerText = `${totalPL >= 0 ? '+' : ''}${roi}% ROI`;
    }

    const portfolioCountBadge = this.appContainer.querySelector('.bg-tertiary-container.text-on-tertiary-container');
    if (portfolioCountBadge) {
      portfolioCountBadge.innerText = `Across ${allAccounts.length} Total`;
    }

    // Metric counter badges
    const counterCards = this.appContainer.querySelectorAll('.grid.grid-cols-2 > div');
    if (counterCards.length >= 2) {
      const actCount = counterCards[0].querySelector('.font-headline-sm');
      const actBadge = counterCards[0].querySelector('.w-8.h-8');
      if (actCount) actCount.innerText = `${active.length} Account${active.length === 1 ? '' : 's'}`;
      if (actBadge) actBadge.innerText = `${active.length}`;

      const blnCount = counterCards[1].querySelector('.font-headline-sm');
      const blnBadge = counterCards[1].querySelector('.w-8.h-8');
      if (blnCount) blnCount.innerText = `${blown.length} Account${blown.length === 1 ? '' : 's'}`;
      if (blnBadge) blnBadge.innerText = `${blown.length}`;
    }

    // Active section
    const activeHeader = Array.from(this.appContainer.querySelectorAll('h2')).find(h => h.innerText.includes('Active Accounts'));
    const activeSection = activeHeader?.closest('section');
    if (activeSection) {
      const countBadge = activeSection.querySelector('.bg-secondary-container');
      if (countBadge) countBadge.innerText = `${active.length} Live`;

      // Remove existing static articles
      activeSection.querySelectorAll('article').forEach(a => a.remove());

      if (active.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'p-6 bg-surface-container-lowest rounded-2xl text-center text-on-surface-variant font-body-sm border border-dashed border-outline-variant/40';
        emptyDiv.innerHTML = `No active accounts. Tap "+ Add Account" to configure your initial funded or evaluation account.`;
        activeSection.appendChild(emptyDiv);
      } else {
        active.forEach(acc => {
          const pl = (acc.currentBalance || acc.startingBalance) - acc.startingBalance;
          const plPct = acc.startingBalance > 0 ? ((pl / acc.startingBalance) * 100).toFixed(2) : '0.00';
          const isProfitable = pl >= 0;

          const card = document.createElement('article');
          card.className = 'bg-surface-container-lowest rounded-lg p-space-md shadow-sm space-y-space-md transition-all active:scale-[0.99] cursor-pointer';
          card.innerHTML = `
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <div class="flex items-center space-x-2">
                  <span class="px-2.5 py-0.5 rounded-full bg-primary text-on-primary font-label-sm text-label-sm uppercase tracking-wide">${acc.type || 'FUNDED'}</span>
                  <div class="flex items-center space-x-1">
                    <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                    <span class="font-label-sm text-label-sm text-primary">Active</span>
                  </div>
                </div>
                <h3 class="font-headline-sm text-headline-sm text-on-surface font-semibold">${acc.name}</h3>
                <p class="font-body-sm text-body-sm text-on-surface-variant">Initial: $${acc.startingBalance.toLocaleString()}</p>
              </div>
              <div class="text-right">
                <div class="font-headline-sm text-headline-sm text-on-surface font-bold">$${acc.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                <span class="inline-block mt-0.5 px-2 py-0.5 rounded-full ${isProfitable ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-on-error-container'} font-label-sm text-label-sm font-semibold">
                  ${isProfitable ? '+' : ''}$${pl.toFixed(2)} (${isProfitable ? '+' : ''}${plPct}%)
                </span>
              </div>
            </div>
            <div class="space-y-1.5 bg-surface-container-low p-space-sm rounded">
              <div class="flex justify-between font-label-sm text-label-sm">
                <span class="text-on-surface-variant">Daily Risk Limit</span>
                <span class="text-on-surface font-label-md text-label-md font-semibold">$${acc.dailyLossLimitUsd?.toLocaleString() || 'N/A'}</span>
              </div>
            </div>
            <button class="w-full h-[46px] rounded-full bg-surface-container text-on-surface font-label-md text-label-md flex items-center justify-center space-x-1 hover:bg-surface-container-high transition-colors" type="button">
              <span>View Account</span>
              <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          `;
          card.onclick = () => {
            this.selectedAccountId = acc.id;
            this.navigate('trading-account-detail');
          };
          activeSection.appendChild(card);
        });
      }
    }

    // Blown section
    const blownHeader = Array.from(this.appContainer.querySelectorAll('h2')).find(h => h.innerText.includes('Blown Accounts'));
    const blownSection = blownHeader?.closest('section');
    if (blownSection) {
      if (blownHeader) blownHeader.innerText = `Blown Accounts (${blown.length})`;
      blownSection.querySelectorAll('article').forEach(a => a.remove());

      if (blown.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'p-4 bg-surface-container-lowest rounded-2xl text-center text-on-surface-variant font-body-sm border border-dashed border-outline-variant/40';
        emptyDiv.innerText = 'No blown accounts. Strict risk management pays off!';
        blownSection.appendChild(emptyDiv);
      } else {
        blown.forEach(acc => {
          const card = document.createElement('article');
          card.className = 'bg-surface-container-low rounded-lg p-space-md shadow-none space-y-space-md opacity-90 cursor-pointer';
          card.innerHTML = `
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <div class="flex items-center space-x-2">
                  <span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold uppercase">BLOWN</span>
                </div>
                <h3 class="font-headline-sm text-headline-sm text-on-surface">${acc.name}</h3>
                <p class="font-body-sm text-body-sm text-on-surface-variant">Closed at: $${acc.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            <button class="w-full h-[46px] rounded-full bg-surface-container text-on-surface font-label-md text-label-md flex items-center justify-center space-x-1 hover:bg-surface-container-high transition-colors" type="button">
              <span>View History</span>
              <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          `;
          card.onclick = () => {
            this.selectedAccountId = acc.id;
            this.navigate('trading-account-detail');
          };
          blownSection.appendChild(card);
        });
      }
    }
  }

  async hydrateTradingAccountNew() {
    // Read all rich form inputs from the Stitch template
    const nameInput = this.appContainer.querySelector('input[placeholder*="Apex"], input[placeholder*="Account"], input[type="text"]:first-of-type');
    const accountSizeInput = this.appContainer.querySelector('#accountSizeInput, input[type="number"]');
    const brokerInput = this.appContainer.querySelector('input[placeholder*="Apex Trader"], input[placeholder*="FTMO"], input[placeholder*="IC Markets"]');
    const nicknameInput = this.appContainer.querySelector('input[placeholder*="APEX-"]');
    const currencySelect = this.appContainer.querySelector('select');

    // Trading Rules dual inputs
    const riskPctInput = this.appContainer.querySelector('#riskPct');
    const riskUsdInput = this.appContainer.querySelector('#riskUsd');
    const dailyPctInput = this.appContainer.querySelector('#dailyPct');
    const dailyUsdInput = this.appContainer.querySelector('#dailyUsd');
    const ddPctInput = this.appContainer.querySelector('#ddPct');
    const ddUsdInput = this.appContainer.querySelector('#ddUsd');
    const targetPctInput = this.appContainer.querySelector('#targetPct');
    const targetUsdInput = this.appContainer.querySelector('#targetUsd');

    // Live % ↔ $ sync when account size changes
    const syncCalcs = () => {
      const size = parseFloat(accountSizeInput?.value) || 50000;
      if (riskPctInput && riskUsdInput) riskUsdInput.value = (size * (parseFloat(riskPctInput.value) || 1) / 100).toFixed(0);
      if (dailyPctInput && dailyUsdInput) dailyUsdInput.value = (size * (parseFloat(dailyPctInput.value) || 2) / 100).toFixed(0);
      if (ddPctInput && ddUsdInput) ddUsdInput.value = (size * (parseFloat(ddPctInput.value) || 4) / 100).toFixed(0);
      if (targetPctInput && targetUsdInput) targetUsdInput.value = (size * (parseFloat(targetPctInput.value) || 6) / 100).toFixed(0);
    };

    [accountSizeInput, riskPctInput, dailyPctInput, ddPctInput, targetPctInput].forEach(input => {
      if (input) input.addEventListener('input', syncCalcs);
    });

    // Account type pill toggle
    let selectedType = 'challenge';
    this.appContainer.querySelectorAll('.type-pill, button[data-type]').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        selectedType = pill.getAttribute('data-type') || pill.innerText.toLowerCase().trim();
        this.appContainer.querySelectorAll('.type-pill, button[data-type]').forEach(p => {
          p.classList.remove('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
          p.classList.add('text-on-surface-variant');
        });
        pill.classList.add('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
        pill.classList.remove('text-on-surface-variant');
      });
    });

    // Toggle switches
    this.appContainer.querySelectorAll('.toggle-btn, button[role="switch"]').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const isChecked = toggle.getAttribute('aria-checked') === 'true';
        toggle.setAttribute('aria-checked', (!isChecked).toString());
        const knob = toggle.querySelector('span');
        if (!isChecked) {
          toggle.classList.remove('bg-surface-container-highest');
          toggle.classList.add('bg-secondary');
          if (knob) knob.classList.add('translate-x-5');
        } else {
          toggle.classList.add('bg-surface-container-highest');
          toggle.classList.remove('bg-secondary');
          if (knob) knob.classList.remove('translate-x-5');
        }
      });
    });

    // Submit button
    const saveBtn = this.appContainer.querySelector('#submitAccountBtn') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Create') || b.innerText.includes('Save'));

    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const name = nameInput?.value?.trim() || `Trading Account #${Date.now().toString().slice(-4)}`;
        const accountSize = parseFloat(accountSizeInput?.value) || 50000;
        const broker = brokerInput?.value?.trim() || 'Apex Trader Funding';
        const nickname = nicknameInput?.value?.trim() || '';
        const currency = currencySelect?.value?.split(' ')[0] || 'USD';
        const weekendToggle = this.appContainer.querySelectorAll('button[role="switch"]')[0];
        const newsToggle = this.appContainer.querySelectorAll('button[role="switch"]')[1];

        const res = await TradingEngine.createAccount({
          name,
          type: selectedType,
          broker,
          accountNumberOrNickname: nickname,
          currency,
          accountSize,
          startingBalance: accountSize,
          riskPerTradePercent: parseFloat(riskPctInput?.value) || 1.0,
          dailyLossLimitPercent: parseFloat(dailyPctInput?.value) || 2.0,
          maximumDrawdownPercent: parseFloat(ddPctInput?.value) || 4.0,
          profitTargetPercent: parseFloat(targetPctInput?.value) || 6.0,
          minimumTradingDays: 5,
          maximumTradesPerDay: 2,
          weekendHoldingAllowed: weekendToggle?.getAttribute('aria-checked') === 'true',
          newsTradingAllowed: newsToggle?.getAttribute('aria-checked') !== 'false',
          notes: this.appContainer.querySelector('textarea')?.value?.trim() || ''
        });

        if (!res.success) {
          alert(res.error);
          return;
        }

        this.selectedAccountId = res.data.id;
        this.showToast(`Trading account "${name}" created!`);
        this.navigate('trading-accounts');
      };
    }
  }

  async hydrateTradingAccountDetail() {
    const accounts = await db.tradingAccounts.toArray();
    const account = (this.selectedAccountId ? accounts.find(a => a.id === this.selectedAccountId) : null) || accounts[0];
    if (!account) return;

    this.selectedAccountId = account.id;
    const isBlown = account.status === 'BLOWN';
    const stats = await TradingEngine.getAccountStatistics(account.id);
    const calendar = await TradingEngine.getAccountCalendar(account.id);
    const rules = TradingEngine.evaluateAccountRules(account);

    // --- HERO CARD: Update account name, balance, status badges ---
    const heroSection = this.appContainer.querySelector('section.bg-primary-container, section:first-of-type');
    if (heroSection) {
      // Account name
      const nameEl = heroSection.querySelector('.font-headline-sm.font-bold, .font-headline-sm');
      if (nameEl) nameEl.innerText = account.name;

      // Status badge
      const statusBadge = heroSection.querySelector('.bg-secondary, [class*="ACTIVE"]');
      if (statusBadge) {
        statusBadge.innerText = account.status;
        if (isBlown) {
          statusBadge.classList.remove('bg-secondary', 'text-on-secondary');
          statusBadge.classList.add('bg-error', 'text-on-error');
        }
      }

      // Type badge
      const typeBadge = heroSection.querySelector('.bg-surface-container-lowest\\/80');
      if (typeBadge) typeBadge.innerText = (account.type || 'challenge').toUpperCase();

      // Balance
      const balanceEl = heroSection.querySelector('.font-headline-lg-mobile, h2.font-extrabold');
      if (balanceEl) balanceEl.innerText = `$${account.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      // P/L from starting
      const plEl = heroSection.querySelector('.text-secondary.font-label-md, .text-secondary.font-bold');
      const totalPL = account.currentBalance - account.startingBalance;
      const plPct = ((totalPL / account.startingBalance) * 100).toFixed(2);
      if (plEl) plEl.innerText = `${totalPL >= 0 ? '+' : ''}$${totalPL.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${totalPL >= 0 ? '+' : ''}${plPct}%)`;

      // Equity & Base allocation
      const gridCells = heroSection.querySelectorAll('.grid .font-label-md.font-semibold');
      if (gridCells.length >= 2) {
        gridCells[0].innerHTML = `$${account.currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span class="text-xs font-normal opacity-80">(100% Free)</span>`;
        gridCells[1].innerText = `$${account.startingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} Base`;
      }

      // Safety cushion
      const cushionEl = heroSection.querySelector('.text-secondary.font-bold');
      if (cushionEl && rules) {
        const cushion = Math.max(0, rules.drawdown.limit - rules.drawdown.current);
        const allCushionEls = heroSection.querySelectorAll('.font-label-sm.text-secondary.font-bold');
        allCushionEls.forEach(el => {
          if (el.innerText.includes('above') || el.innerText.includes('threshold')) {
            el.innerText = `$${cushion.toLocaleString('en-US', { minimumFractionDigits: 2 })} above threshold`;
          }
        });
      }
    }

    // --- PERFORMANCE METRICS: 2x3 Bento Grid ---
    if (stats) {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayTrades = await db.trades.where('accountId').equals(account.id).filter(t => t.closeDate && t.closeDate.startsWith(todayStr)).toArray();
      const todayPL = todayTrades.reduce((s, t) => s + t.pnl, 0);
      const todayPct = account.currentBalance > 0 ? ((todayPL / account.currentBalance) * 100).toFixed(2) : '0.00';

      // Get week trades
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStr = weekStart.toISOString().split('T')[0];
      const weekTrades = await db.trades.where('accountId').equals(account.id).filter(t => t.closeDate && t.closeDate.split(' ')[0] >= weekStr).toArray();
      const weekPL = weekTrades.reduce((s, t) => s + t.pnl, 0);
      const weekPct = account.startingBalance > 0 ? ((weekPL / account.startingBalance) * 100).toFixed(2) : '0.00';

      const metricCards = this.appContainer.querySelectorAll('.grid.grid-cols-2 > div');
      if (metricCards.length >= 6) {
        // Today's P/L
        const todayHeadline = metricCards[0].querySelector('.font-headline-sm');
        const todayLabel = metricCards[0].querySelector('.font-label-sm.font-medium, p:last-child');
        if (todayHeadline) { todayHeadline.innerText = `${todayPL >= 0 ? '+' : ''}$${todayPL.toFixed(2)}`; todayHeadline.className = todayHeadline.className.replace(/text-(secondary|error)/, todayPL >= 0 ? 'text-secondary' : 'text-error'); }
        if (todayLabel) todayLabel.innerText = `${todayPL >= 0 ? '+' : ''}${todayPct}% day gain`;

        // Weekly Net
        const weekHeadline = metricCards[1].querySelector('.font-headline-sm');
        const weekLabel = metricCards[1].querySelector('.font-label-sm.font-medium, p:last-child');
        if (weekHeadline) weekHeadline.innerText = `${weekPL >= 0 ? '+' : ''}$${weekPL.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (weekLabel) weekLabel.innerText = `${weekPL >= 0 ? '+' : ''}${weekPct}% this week`;

        // Win Rate
        const wrHeadline = metricCards[2].querySelector('.font-headline-sm');
        const wrLabel = metricCards[2].querySelector('.font-label-sm.font-medium, p:last-child');
        if (wrHeadline) wrHeadline.innerText = `${stats.winRate}%`;
        if (wrLabel) wrLabel.innerText = `${stats.wins}W • ${stats.losses}L • ${stats.totalTrades - stats.wins - stats.losses}BE`;

        // Profit Factor
        const pfHeadline = metricCards[3].querySelector('.font-headline-sm');
        if (pfHeadline) pfHeadline.innerText = `${stats.profitFactor} PF`;

        // Volume
        const volHeadline = metricCards[4].querySelector('.font-headline-sm');
        if (volHeadline) volHeadline.innerText = `${stats.totalTrades}`;

        // Month Total
        const monthPL = account.currentBalance - account.startingBalance;
        const monthPct = ((monthPL / account.startingBalance) * 100).toFixed(2);
        const monthHeadline = metricCards[5].querySelector('.font-headline-sm');
        const monthLabel = metricCards[5].querySelector('.font-label-sm.font-medium, p:last-child');
        if (monthHeadline) monthHeadline.innerText = `${monthPL >= 0 ? '+' : ''}$${monthPL.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (monthLabel) monthLabel.innerText = `${monthPL >= 0 ? '+' : ''}${monthPct}% ROI`;
      }
    }

    // --- DRAWDOWN GUARDS: Update progress bars and values ---
    if (rules) {
      const guardSections = this.appContainer.querySelectorAll('[class*="space-y-1.5"]');
      guardSections.forEach(section => {
        const labelEl = section.querySelector('.font-semibold');
        if (!labelEl) return;
        const text = labelEl.innerText || '';
        const valueEl = section.querySelector('.font-bold:last-child, span:last-child');
        const bar = section.querySelector('div[style*="width"]');

        if (text.includes('Daily Loss')) {
          if (valueEl) valueEl.innerText = `$${rules.dailyLoss.current.toFixed(2)} / $${rules.dailyLoss.limit.toFixed(2)}`;
          const pct = rules.dailyLoss.limit > 0 ? Math.min(100, (rules.dailyLoss.current / rules.dailyLoss.limit) * 100) : 0;
          if (bar) bar.style.width = `${pct}%`;
        } else if (text.includes('Trailing') || text.includes('Drawdown')) {
          if (valueEl) valueEl.innerText = `$${rules.drawdown.current.toFixed(2)} / $${rules.drawdown.limit.toFixed(2)}`;
          const pct = Math.min(100, rules.drawdown.ratio * 100);
          if (bar) bar.style.width = `${pct.toFixed(0)}%`;
        }
      });
    }

    // --- CALENDAR: Update month label ---
    const monthLabel = this.appContainer.querySelector('span.font-label-sm.font-bold, #calendarGrid');
    const now = new Date();
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const currentMonthLabel = this.appContainer.querySelector('span.font-label-sm.font-bold');
    if (currentMonthLabel && currentMonthLabel.innerText.includes('Oct')) {
      currentMonthLabel.innerText = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }

    // --- CALENDAR PREVIEW: Wire date click to show real trade data ---
    const previewDate = this.appContainer.querySelector('#previewDate');
    const previewDetail = this.appContainer.querySelector('#previewDetail');
    const previewBadge = this.appContainer.querySelector('#previewBadge');
    const previewDot = this.appContainer.querySelector('#previewDot');

    // Wire all calendar day buttons
    this.appContainer.querySelectorAll('#calendarGrid button').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        // Get the original onclick data if any, otherwise use day number
        const dayText = btn.querySelector('span')?.innerText || btn.innerText.trim().split('\n')[0];
        const dayPL = btn.querySelector('.text-\\[9px\\]')?.innerText || btn.querySelector('span:last-child')?.innerText || '';

        if (previewDate) previewDate.innerText = `Day ${dayText}`;
        if (previewDetail) previewDetail.innerText = dayPL ? `${dayPL} • Trade day` : 'No trades this day';
        if (previewBadge) {
          if (dayPL.includes('+')) { previewBadge.innerText = 'Win Session'; previewBadge.className = previewBadge.className.replace(/bg-\S+/, 'bg-primary-container'); }
          else if (dayPL.includes('-')) { previewBadge.innerText = 'Loss Session'; previewBadge.className = previewBadge.className.replace(/bg-\S+/, 'bg-error-container'); }
          else if (dayPL.includes('BE')) { previewBadge.innerText = 'Break-even'; previewBadge.className = previewBadge.className.replace(/bg-\S+/, 'bg-surface-container'); }
          else { previewBadge.innerText = 'No Trades'; }
        }
      };
    });

    // --- RECENT TRADES: populate from real data ---
    const recentTrades = await db.trades.where('accountId').equals(account.id).reverse().limit(3).toArray();
    const tradeCards = this.appContainer.querySelectorAll('section:last-of-type .bg-surface-container-lowest.flex.items-center.justify-between, section .rounded-DEFAULT.flex.items-center.justify-between');
    tradeCards.forEach((card, idx) => {
      const trade = recentTrades[idx];
      if (!trade) return;
      const nameEl = card.querySelector('.font-label-lg.font-bold');
      const dateEl = card.querySelector('.font-body-sm');
      const plEl = card.querySelector('.font-label-lg.text-secondary, .font-label-lg.text-error, .font-label-lg.text-on-surface-variant');
      if (nameEl) nameEl.innerText = `${trade.instrument} ${trade.direction}`;
      if (dateEl) dateEl.innerText = `${trade.closeDate || trade.openDate}`;
      if (plEl) {
        plEl.innerText = `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`;
        plEl.className = plEl.className.replace(/text-(secondary|error|on-surface-variant)/, trade.pnl > 0 ? 'text-secondary' : (trade.pnl < 0 ? 'text-error' : 'text-on-surface-variant'));
      }
    });

    // --- ACTION BUTTONS ---
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Rules')) {
        btn.onclick = () => this.navigate('account-rules');
      } else if (text.includes('New Trade') || text.includes('+ New Trade')) {
        if (isBlown) {
          btn.classList.add('opacity-50', 'cursor-not-allowed');
          btn.onclick = (e) => { e.preventDefault(); alert(`Account "${account.name}" is BLOWN. New trades are permanently disabled.`); };
        } else {
          btn.onclick = () => this.navigate('trade-new');
        }
      } else if (text.includes('History')) {
        btn.onclick = () => this.navigate('trade-history');
      } else if (text.includes('Stats') || text.includes('Statistics')) {
        btn.onclick = () => this.navigate('trading-stats');
      }
    });

    // More actions button: Delete account option with confirmation modal
    const moreActionsBtn = this.appContainer.querySelector('button[aria-label="More actions"]');
    if (moreActionsBtn) {
      moreActionsBtn.onclick = () => {
        this.showConfirm({
          title: `Delete "${account.name}"?`,
          message: 'Are you sure you want to delete this trading account? All associated trades and statistics will be permanently removed.',
          confirmText: 'Delete Account',
          isDestructive: true,
          onConfirm: async () => {
            await TradingEngine.deleteAccount(account.id);
            this.showToast(`Account "${account.name}" deleted.`);
            this.navigate('trading-accounts');
          }
        });
      };
    }
  }

  async hydrateAccountRules() {
    const accounts = await db.tradingAccounts.toArray();
    const account = (this.selectedAccountId ? accounts.find(a => a.id === this.selectedAccountId) : null) || accounts[0];
    if (!account) return;

    const rules = TradingEngine.evaluateAccountRules(account);

    // Wire buttons
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Trade') && !text.includes('Pre-Trade')) {
        if (account.status === 'BLOWN') {
          btn.classList.add('opacity-50', 'cursor-not-allowed');
          btn.onclick = (e) => {
            e.preventDefault();
            alert(`Account "${account.name}" is BLOWN.`);
          };
        } else {
          btn.onclick = () => this.navigate('trade-new');
        }
      }
    });
  }

  async hydrateTradeNew() {
    const accounts = await db.tradingAccounts.where('status').equals('ACTIVE').toArray();

    const submitBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Execute') || b.innerText.includes('Submit') || b.innerText.includes('Log') || b.innerText.includes('Place Trade'));

    const instrumentInput = this.appContainer.querySelector('input[placeholder*="XAUUSD"], input[placeholder*="Pair"], input[name*="symbol"], input[name*="instrument"]');
    const entryInput = this.appContainer.querySelector('input[placeholder*="Entry"], input[name*="entry"]');
    const exitInput = this.appContainer.querySelector('input[placeholder*="Exit"], input[name*="exit"]');
    const slInput = this.appContainer.querySelector('input[placeholder*="Stop"], input[name*="stopLoss"]');
    const tpInput = this.appContainer.querySelector('input[placeholder*="Take"], input[name*="takeProfit"]');
    const lotInput = this.appContainer.querySelector('input[placeholder*="Lot"], input[placeholder*="Size"], input[name*="lot"]');

    // Direction buttons (BUY / SELL)
    let direction = 'BUY';
    const buyBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.toUpperCase().includes('BUY'));
    const sellBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.toUpperCase().includes('SELL'));

    if (buyBtn && sellBtn) {
      buyBtn.onclick = (e) => {
        e.preventDefault();
        direction = 'BUY';
        buyBtn.classList.add('ring-2', 'ring-primary');
        sellBtn.classList.remove('ring-2', 'ring-primary');
      };
      sellBtn.onclick = (e) => {
        e.preventDefault();
        direction = 'SELL';
        sellBtn.classList.add('ring-2', 'ring-primary');
        buyBtn.classList.remove('ring-2', 'ring-primary');
      };
    }

    if (accounts.length === 0) {
      alert('All trading accounts are BLOWN or no active accounts exist. Please create an active account to trade.');
      this.navigate('trading-account-new');
      return;
    }

    let activeAccountIndex = 0;
    if (this.selectedAccountId) {
      const foundIdx = accounts.findIndex(a => a.id === this.selectedAccountId);
      if (foundIdx >= 0) activeAccountIndex = foundIdx;
    }
    let currentAccount = accounts[activeAccountIndex];

    const updateAccountBanner = () => {
      currentAccount = accounts[activeAccountIndex];
      this.selectedAccountId = currentAccount.id;
      const accountNameEl = this.appContainer.querySelector('section:first-of-type p.font-headline-sm');
      if (accountNameEl) {
        accountNameEl.innerText = `${currentAccount.name} • ${currentAccount.accountType.toUpperCase()}`;
      }
      const balanceEls = this.appContainer.querySelectorAll('section:first-of-type .font-headline-sm');
      if (balanceEls.length >= 3) {
        balanceEls[1].innerText = `$${currentAccount.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        balanceEls[2].innerText = `$${currentAccount.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      }
    };

    updateAccountBanner();

    // Swap account button
    const swapBtn = this.appContainer.querySelector('section:first-of-type button');
    if (swapBtn) {
      swapBtn.onclick = (e) => {
        e.preventDefault();
        activeAccountIndex = (activeAccountIndex + 1) % accounts.length;
        updateAccountBanner();
        this.showToast(`Switched to: ${accounts[activeAccountIndex].name}`);
      };
    }

    if (submitBtn) {
      submitBtn.onclick = async (e) => {
        e.preventDefault();
        const instrument = instrumentInput?.value?.trim() || 'XAUUSD';
        const entryPrice = parseFloat(entryInput?.value) || 2600.00;
        const exitPrice = parseFloat(exitInput?.value) || 2615.00;
        const stopLoss = parseFloat(slInput?.value) || 2590.00;
        const takeProfit = parseFloat(tpInput?.value) || 2630.00;
        const lotSize = parseFloat(lotInput?.value) || 1.0;

        const res = await TradingEngine.executeTrade({
          accountId: currentAccount.id,
          instrument,
          direction,
          entryPrice,
          exitPrice,
          stopLoss,
          takeProfit,
          lotSize,
          notes: 'Logged via New Trade view'
        });

        if (!res.success) {
          alert(`Trade Error: ${res.error}`);
          return;
        }

        if (res.data.wasBlown) {
          alert(`⚠️ WARNING: ACCOUNT BLOWN!\nAccount "${res.data.account.name}" has breached its drawdown limit and is now BLOWN.\nReason: ${res.data.blownReason}\nNew trades for this account are now permanently disabled.`);
          this.showToast('Account marked as BLOWN', 3500);
          this.navigate('trading-accounts');
        } else {
          this.showToast(`Trade recorded! P/L: $${res.data.trade.pnl > 0 ? '+' : ''}${res.data.trade.pnl}`);
          this.navigate('trade-history');
        }
      };
    }
  }

  async hydrateTradeHistory() {
    const allTrades = await db.trades.reverse().toArray();
    const stats = {
      total: allTrades.length,
      wins: allTrades.filter(t => t.pnl > 0).length,
      losses: allTrades.filter(t => t.pnl < 0).length,
      be: allTrades.filter(t => t.pnl === 0).length,
      netPL: allTrades.reduce((s, t) => s + (t.pnl || 0), 0)
    };

    // Wire back button
    const backBtn = this.appContainer.querySelector('button[aria-label="Go back"], header a[aria-label="Back"]');
    if (backBtn) backBtn.onclick = () => this.navigate('trading');

    // Update performance summary banner
    const totalTradesEl = this.appContainer.querySelector('.grid.grid-cols-3 > div:nth-child(1) .font-headline-md');
    if (totalTradesEl) totalTradesEl.innerText = `${stats.total}`;

    const winLossEl = this.appContainer.querySelector('.grid.grid-cols-3 > div:nth-child(2) .font-headline-sm');
    if (winLossEl) {
      const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;
      winLossEl.innerHTML = `${stats.wins}<span class="font-label-sm text-secondary font-bold">W</span> • ${stats.losses}<span class="font-label-sm text-error font-bold">L</span>`;
      const winRateSub = winLossEl.nextElementSibling;
      if (winRateSub) winRateSub.innerText = `${stats.be} BE • ${winRate}% Win`;
    }

    const netProfitEl = this.appContainer.querySelector('.grid.grid-cols-3 > div:nth-child(3) .font-headline-sm');
    if (netProfitEl) {
      netProfitEl.className = `font-headline-sm text-headline-sm mt-1 font-bold ${stats.netPL >= 0 ? 'text-secondary' : 'text-error'}`;
      netProfitEl.innerText = `${stats.netPL >= 0 ? '+' : '-'}$${Math.abs(stats.netPL).toFixed(2)}`;
    }

    // Update filter pill counts
    let activeFilter = 'all';
    let searchQuery = '';

    const filterPills = this.appContainer.querySelectorAll('.filter-pill');
    filterPills.forEach(pill => {
      const filter = pill.getAttribute('data-filter');
      const countEl = pill.querySelector('.font-label-sm');
      if (countEl) {
        if (filter === 'all') countEl.innerText = `(${stats.total})`;
        else if (filter === 'win') countEl.innerText = `(${stats.wins})`;
        else if (filter === 'loss') countEl.innerText = `(${stats.losses})`;
        else if (filter === 'be') countEl.innerText = `(${stats.be})`;
      }

      pill.onclick = () => {
        filterPills.forEach(p => {
          p.className = 'filter-pill shrink-0 px-space-md h-8 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md flex items-center gap-1 shadow-sm hover:bg-surface-container transition-transform active:scale-95';
        });
        pill.className = 'filter-pill shrink-0 px-space-md h-8 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex items-center gap-1 shadow-sm transition-transform active:scale-95';
        activeFilter = filter || 'all';
        renderTrades();
      };
    });

    // Search input with debounce
    const searchInput = this.appContainer.querySelector('#trade-search-input') || this.appContainer.querySelector('input[placeholder*="Search"]');
    if (searchInput) {
      searchInput.oninput = debounce(() => {
        searchQuery = searchInput.value.trim().toLowerCase();
        renderTrades();
      }, 180);
    }

    let currentTradeLimit = 20;

    // Trade feed container
    const tradesContainer = this.appContainer.querySelector('#trades-container');
    const renderTrades = () => {
      if (!tradesContainer) return;

      let filtered = [...allTrades];
      if (activeFilter === 'win') filtered = filtered.filter(t => t.pnl > 0);
      else if (activeFilter === 'loss') filtered = filtered.filter(t => t.pnl < 0);
      else if (activeFilter === 'be') filtered = filtered.filter(t => t.pnl === 0);

      if (searchQuery) {
        filtered = filtered.filter(t =>
          (t.instrument && t.instrument.toLowerCase().includes(searchQuery)) ||
          (t.direction && t.direction.toLowerCase().includes(searchQuery)) ||
          (t.setup && t.setup.toLowerCase().includes(searchQuery)) ||
          (t.notes && t.notes.toLowerCase().includes(searchQuery))
        );
      }

      if (filtered.length === 0) {
        tradesContainer.innerHTML = `
          <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div class="w-16 h-16 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center mb-4">
              <span class="material-symbols-outlined text-[32px]">candlestick_chart</span>
            </div>
            <h3 class="font-headline-sm font-bold text-on-surface mb-1">${allTrades.length === 0 ? 'No Trades Logged Yet' : 'No Matching Trades'}</h3>
            <p class="font-body-md text-on-surface-variant max-w-sm mb-6">
              ${allTrades.length === 0 ? 'Record your executions with risk metrics to review edge and discipline.' : 'Try adjusting your search query or outcome filter.'}
            </p>
            <button id="history-new-trade-btn" class="px-6 py-3 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold shadow-sm hover:opacity-90 flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px]">add</span>
              <span>Log New Trade</span>
            </button>
          </div>
        `;
        tradesContainer.querySelector('#history-new-trade-btn')?.addEventListener('click', () => this.navigate('trade-new'));
        return;
      }

      const visibleTrades = filtered.slice(0, currentTradeLimit);

      // Group trades by date
      const groups = {};
      visibleTrades.forEach(t => {
        const d = t.entryDate ? new Date(t.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
        if (!groups[d]) groups[d] = [];
        groups[d].push(t);
      });

      let html = Object.entries(groups).map(([dateLabel, items]) => {
        const groupTotal = items.reduce((s, t) => s + (t.pnl || 0), 0);
        return `
          <div class="trade-group flex flex-col gap-space-sm">
            <div class="flex items-center justify-between px-1">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-primary"></span>
                <span class="font-label-md text-label-md text-on-surface font-semibold">${dateLabel}</span>
              </div>
              <span class="font-label-sm text-label-sm ${groupTotal >= 0 ? 'text-secondary' : 'text-error'} font-bold">
                ${groupTotal >= 0 ? '+' : '-'}$${Math.abs(groupTotal).toFixed(2)}
              </span>
            </div>
            ${items.map(t => {
              const isWin = t.pnl > 0;
              const isLoss = t.pnl < 0;
              const borderColor = isWin ? 'bg-secondary' : (isLoss ? 'bg-error' : 'bg-outline-variant');
              const iconColor = isWin ? 'bg-secondary-container/60 text-secondary' : (isLoss ? 'bg-error-container text-error' : 'bg-surface-container text-on-surface-variant');
              const iconName = isWin ? 'trending_up' : (isLoss ? 'trending_down' : 'remove');

              return `
                <article class="trade-card bg-surface-container-lowest rounded-lg p-space-md shadow-sm relative overflow-hidden active:scale-[0.99] transition-all cursor-pointer" data-id="${t.id}">
                  <div class="absolute left-0 top-0 bottom-0 w-1.5 ${borderColor}"></div>
                  <div class="flex items-start justify-between gap-space-sm">
                    <div class="flex items-center gap-space-sm min-w-0">
                      <div class="w-10 h-10 rounded-full ${iconColor} flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-[20px]">${iconName}</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="font-label-lg text-label-lg text-on-surface font-bold truncate">${t.instrument}</span>
                          <span class="px-2 py-0.5 rounded-full ${t.direction === 'BUY' ? 'bg-secondary-container/40 text-on-secondary-container' : 'bg-error-container/40 text-error'} font-label-sm text-label-sm font-semibold">${t.direction}</span>
                        </div>
                        <span class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${t.openDate || 'Today'}</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <div class="flex flex-col items-end">
                        <span class="font-label-lg text-label-lg ${isWin ? 'text-secondary' : (isLoss ? 'text-error' : 'text-on-surface')} font-bold">
                          ${t.pnl >= 0 ? '+' : '-'}$${Math.abs(t.pnl || 0).toFixed(2)}
                        </span>
                        ${t.rMultiple ? `<span class="font-label-sm text-label-sm ${isWin ? 'text-secondary' : 'text-on-surface-variant'} font-semibold">${t.rMultiple > 0 ? '+' : ''}${t.rMultiple}R</span>` : ''}
                      </div>
                      <button class="trade-del-btn w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container transition-colors ml-1" aria-label="Delete trade" data-id="${t.id}">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                  ${t.setup || t.notes ? `
                    <div class="flex items-center justify-between mt-space-sm pt-space-xs border-t border-outline-variant/20">
                      <span class="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-medium truncate max-w-[80%]">
                        ${t.setup || t.notes}
                      </span>
                    </div>
                  ` : ''}
                </article>
              `;
            }).join('')}
          </div>
        `;
      }).join('');

      if (filtered.length > currentTradeLimit) {
        html += `
          <div class="pt-2 pb-4 text-center">
            <button id="trade-load-more-btn" class="w-full py-3 rounded-full bg-surface-container text-on-surface font-label-md font-semibold hover:bg-surface-container-high active:scale-98 transition-all shadow-xs flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-[18px]">expand_more</span>
              <span>Load More (${filtered.length - currentTradeLimit} remaining)</span>
            </button>
          </div>
        `;
      }

      tradesContainer.innerHTML = html;

      const loadMoreBtn = tradesContainer.querySelector('#trade-load-more-btn');
      if (loadMoreBtn) {
        loadMoreBtn.onclick = () => {
          currentTradeLimit += 20;
          renderTrades();
        };
      }

      // Wire trade cards click
      tradesContainer.querySelectorAll('.trade-card').forEach(card => {
        card.onclick = (e) => {
          if (e.target.closest('.trade-del-btn')) return;
          const tId = parseInt(card.getAttribute('data-id'), 10);
          this.selectedTradeId = tId;
          this.navigate('trade-open');
        };
      });

      // Wire delete buttons
      tradesContainer.querySelectorAll('.trade-del-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const tId = parseInt(btn.getAttribute('data-id'), 10);
          const tObj = allTrades.find(t => t.id === tId);
          this.showConfirm({
            title: 'Delete Trade',
            message: `Are you sure you want to delete ${tObj?.instrument || 'this trade'} ($${tObj?.pnl?.toFixed(2) || '0.00'})?`,
            confirmText: 'Delete',
            isDestructive: true,
            onConfirm: async () => {
              await TradingEngine.deleteTrade(tId);
              this.showToast('Trade deleted');
              await this.hydrateTradeHistory();
            }
          });
        };
      });
    };

    renderTrades();

    // Wire new trade button in header/floating
    const newTradeBtn = this.appContainer.querySelector('#new-trade-btn') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Log New Trade') || b.innerText.includes('New Trade'));
    if (newTradeBtn) newTradeBtn.onclick = () => this.navigate('trade-new');
  }

  async hydrateTradingStats() {
    const accounts = await db.tradingAccounts.toArray();
    const account = (this.selectedAccountId ? accounts.find(a => a.id === this.selectedAccountId) : null) || accounts[0];
    if (!account) return;

    const stats = await TradingEngine.getAccountStatistics(account.id);
    if (!stats) return;

    // Update hero card net profit
    const displayEl = this.appContainer.querySelector('.font-display-lg');
    if (displayEl) {
      const netPL = stats.totalPL;
      displayEl.innerText = `${netPL >= 0 ? '+' : ''}$${netPL.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    // Update summary stats (total trades, win rate, profit factor)
    const summaryEls = this.appContainer.querySelectorAll('.font-headline-sm.font-bold');
    summaryEls.forEach(el => {
      if (el.innerText === '14') el.innerText = `${stats.totalTrades}`;
      else if (el.innerText.includes('71')) el.innerText = `${stats.winRate}%`;
      else if (el.innerText.includes('3.84') || el.innerText.includes('PF')) el.innerText = `${stats.profitFactor}`;
    });

    // Wire navigation
    const backBtn = this.appContainer.querySelector('button[aria-label="Go Back"]');
    if (backBtn) backBtn.onclick = () => this.navigate('trading');

    // Wire download button
    const downloadBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Download') || b.innerText.includes('Export'));
    if (downloadBtn) {
      downloadBtn.onclick = (e) => {
        e.preventDefault();
        this.showToast('Performance report generation coming soon');
      };
    }
  }

  async hydrateTradingReview() {
    // Review flow
  }

  async hydrateTradeJournal() {
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      if (btn.innerText.includes('New Trade')) btn.onclick = () => this.navigate('trade-new');
    });
  }

  async hydrateRiskCalculator() {
    const accounts = await db.tradingAccounts.where('status').equals('ACTIVE').toArray();
    const account = (this.selectedAccountId ? accounts.find(a => a.id === this.selectedAccountId) : null) || accounts[0];

    const calcBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Calculate'));
    if (calcBtn) {
      calcBtn.onclick = (e) => {
        e.preventDefault();
        const inputs = this.appContainer.querySelectorAll('input[type="number"]');
        const accountBalance = account?.currentBalance || parseFloat(inputs[0]?.value) || 50000;
        const riskPct = parseFloat(inputs[1]?.value) || 1.0;
        const entryPrice = parseFloat(inputs[2]?.value) || 2600;
        const stopLoss = parseFloat(inputs[3]?.value) || 2590;

        const riskAmount = (accountBalance * riskPct / 100);
        const priceDiff = Math.abs(entryPrice - stopLoss);
        const pipValue = 100; // default for gold
        const lotSize = priceDiff > 0 ? (riskAmount / (priceDiff * pipValue)) : 0;

        // Show results
        const resultEls = this.appContainer.querySelectorAll('.font-headline-sm');
        resultEls.forEach(el => {
          if (el.innerText.includes('Lot') || el.innerText.includes('lot') || el.innerText.includes('0.')) {
            el.innerText = `${lotSize.toFixed(2)} Lots`;
          }
        });

        this.showToast(`Risk: $${riskAmount.toFixed(2)} | Position: ${lotSize.toFixed(2)} lots`);
      };
    }

    // Pre-fill account balance if available
    if (account) {
      const inputs = this.appContainer.querySelectorAll('input[type="number"]');
      if (inputs[0] && !inputs[0].value) inputs[0].value = account.currentBalance;
    }
  }

  async hydratePreTradeChecklist() {
    // Checkbox toggles
    this.appContainer.querySelectorAll('input[type="checkbox"]').forEach(box => {
      box.addEventListener('change', () => {
        this.showToast('Checklist updated');
      });
    });
  }

  async hydrateTradingDecision() {
    // Decision flow
  }

  async hydrateXauusdSetup() {
    // Setup detail
  }

  async hydrateProgress() {
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Habit Statistics')) btn.onclick = () => this.navigate('habit-stats');
      else if (text.includes('Goal Statistics')) btn.onclick = () => this.navigate('goal-stats');
      else if (text.includes('Personal Statistics')) btn.onclick = () => this.navigate('personal-stats');
      else if (text.includes('Weekly Review')) btn.onclick = () => this.navigate('weekly-review');
    });
  }

  async hydrateHabitStats() {
    const habits = await HabitService.getAll(false);
    const todayStr = new Date().toISOString().split('T')[0];
    const dailyStats = await HabitService.getDailyCompletionStats(todayStr);

    // Best streak across all habits
    let bestOverallStreak = 0;
    for (const h of habits) {
      const streaks = await HabitService.getStreaks(h.id);
      bestOverallStreak = Math.max(bestOverallStreak, streaks.bestStreak);
    }

    // Update stat elements
    const headlineEls = this.appContainer.querySelectorAll('.font-headline-sm, .font-display-lg');
    headlineEls.forEach(el => {
      if (el.innerText.includes('%')) el.innerText = `${dailyStats.percentage}%`;
    });

    // Wire back button
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Habits') || text.includes('View')) btn.onclick = () => this.navigate('habits');
    });
  }

  async hydratePersonalStats() {
    const habits = await HabitService.getAll(false);
    const goals = await GoalService.getAll();
    const journalCount = await db.journalEntries.where('status').equals('completed').count();
    const completedGoals = goals.filter(g => g.status === 'COMPLETED').length;

    // Wire navigation
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Habits')) btn.onclick = () => this.navigate('habit-stats');
      else if (text.includes('Goals')) btn.onclick = () => this.navigate('goal-stats');
      else if (text.includes('Journal')) btn.onclick = () => this.navigate('journal-history');
    });
  }

  async hydrateRewards() {
    const achievements = await AchievementService.getAll();
    const unlocked = achievements.filter(a => a.unlocked).length;
    const total = achievements.length;

    // Update badges counter
    const headlineEls = this.appContainer.querySelectorAll('.font-headline-sm, .font-label-lg');
    headlineEls.forEach(el => {
      if (el.innerText.includes('14 / 28') || el.innerText.includes('/')) {
        el.innerText = `${unlocked} / ${total}`;
      }
    });

    // Wire navigation
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Achievements') || text.includes('View All')) btn.onclick = () => this.navigate('achievements');
    });
  }

  async hydrateAchievements() {
    const achievements = await AchievementService.getAll();
    const unlocked = achievements.filter(a => a.unlocked);
    const locked = achievements.filter(a => !a.unlocked);
    const total = achievements.length;

    // Update summary ring text
    const ringText = this.appContainer.querySelector('.font-label-lg.font-bold');
    if (ringText && ringText.innerText.includes('/')) {
      ringText.innerText = `${unlocked.length}/${total}`;
    }
    const ringPct = this.appContainer.querySelector('.font-label-sm.text-tertiary');
    if (ringPct) ringPct.innerText = `${total > 0 ? Math.round((unlocked.length / total) * 100) : 0}%`;

    // Update summary headline
    const summaryEl = this.appContainer.querySelector('.font-headline-sm.font-semibold.truncate');
    if (summaryEl) summaryEl.innerText = unlocked.length >= total ? 'All Badges Unlocked!' : `${unlocked.length} Unlocked, ${locked.length} Remaining`;

    // Update progress bar
    const progressBar = this.appContainer.querySelector('.bg-primary-container.h-full');
    if (progressBar) progressBar.style.width = `${total > 0 ? Math.round((unlocked.length / total) * 100) : 0}%`;

    // Update tab counts
    const tabs = this.appContainer.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      const filter = tab.getAttribute('data-filter');
      if (filter === 'all') tab.innerText = `All (${total})`;
      else if (filter === 'unlocked') tab.innerText = `Unlocked (${unlocked.length})`;
      else if (filter === 'locked') tab.innerText = `Locked (${locked.length})`;
    });

    // Tab filtering logic
    tabs.forEach(tab => {
      tab.onclick = (e) => {
        e.preventDefault();
        const filter = tab.getAttribute('data-filter');
        // Toggle active state
        tabs.forEach(t => {
          t.classList.remove('bg-on-surface', 'text-surface');
          t.classList.add('bg-surface-container-lowest', 'text-on-surface-variant');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('bg-on-surface', 'text-surface');
        tab.classList.remove('bg-surface-container-lowest', 'text-on-surface-variant');
        tab.setAttribute('aria-selected', 'true');

        // Show/hide cards
        this.appContainer.querySelectorAll('.achievement-card').forEach(card => {
          const status = card.getAttribute('data-status');
          if (filter === 'all') card.style.display = '';
          else if (filter === 'unlocked') card.style.display = status === 'unlocked' ? '' : 'none';
          else if (filter === 'locked') card.style.display = status === 'locked' ? '' : 'none';
        });
      };
    });

    // Wire back button
    const backBtn = this.appContainer.querySelector('button[aria-label="Go back"]');
    if (backBtn) backBtn.onclick = () => this.navigate('rewards');
  }

  async hydrateSettingsDashboard() {
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Profile')) btn.onclick = () => this.navigate('profile');
      else if (text.includes('Notifications')) btn.onclick = () => this.navigate('notifications');
      else if (text.includes('Security')) btn.onclick = () => this.navigate('security');
      else if (text.includes('Data Management')) btn.onclick = () => this.navigate('data-management');
      else if (text.includes('Backup')) btn.onclick = () => this.navigate('backup');
      else if (text.includes('Restore')) btn.onclick = () => this.navigate('restore');
      else if (text.includes('Reset')) btn.onclick = () => this.navigate('reset-data');
    });
  }

  async hydrateProfile() {
    const currentUser = AuthService.getCurrentUser();
    let user = await db.users.filter(u => matchesActiveUser(u)).first();
    if (!user) {
      user = await db.users.get(1) || { name: currentUser?.user_metadata?.name || 'Alex Lawson', email: currentUser?.email || 'alex@glowup.io' };
    }

    // Populate form fields with stored user data
    const inputs = this.appContainer.querySelectorAll('input[type="text"], input[type="email"]');
    inputs.forEach(input => {
      if (input.value.includes('Alex Lawson') || input.placeholder?.includes('Name') || input.previousElementSibling?.innerText?.includes('Name')) {
        input.value = user.name || currentUser?.user_metadata?.name || 'Alex Lawson';
      } else if (input.value.includes('@') || input.placeholder?.includes('email') || input.previousElementSibling?.innerText?.includes('Email')) {
        input.value = user.email || currentUser?.email || 'alex@glowup.io';
      }
    });

    // Save button
    const saveBtn = this.appContainer.querySelector('#saveButton') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save'));
    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const nameInput = this.appContainer.querySelector('input[value*="Alex"], input:first-of-type');
        const emailInput = this.appContainer.querySelector('input[type="email"], input[value*="@"]');
        const intentionTextarea = this.appContainer.querySelector('textarea');

        const newName = nameInput?.value?.trim() || user.name;
        const newEmail = emailInput?.value?.trim() || user.email;

        await AuthService.updateProfile({ name: newName });
        if (user.id) {
          await db.users.update(user.id, {
            name: newName,
            email: newEmail,
            profileInfo: intentionTextarea?.value?.trim() || user.profileInfo,
            updatedAt: new Date().toISOString()
          });
        }

        this.showToast('Profile saved!');
      };
    }

    // Sign out button
    const signOutBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b =>
      b.innerText.includes('Sign Out') || b.innerText.includes('Log Out') || b.innerText.includes('Logout')
    );
    if (signOutBtn) {
      signOutBtn.onclick = async (e) => {
        e.preventDefault();
        await AuthService.signOut();
        setActiveUserId('default_user');
        this.showToast('Signed out successfully');
        this.navigate('welcome');
      };
    }
  }

  async hydrateNotifications() {
    // Wire toggle switches for notification preferences
    this.appContainer.querySelectorAll('button[role="switch"], .toggle-btn').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const isChecked = toggle.getAttribute('aria-checked') === 'true';
        toggle.setAttribute('aria-checked', (!isChecked).toString());
        this.showToast(isChecked ? 'Notification disabled' : 'Notification enabled');
      });
    });
  }

  async hydrateSecurity() {
    // Wire toggle switches for security preferences
    this.appContainer.querySelectorAll('button[role="switch"], .toggle-btn').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const isChecked = toggle.getAttribute('aria-checked') === 'true';
        toggle.setAttribute('aria-checked', (!isChecked).toString());
        this.showToast(isChecked ? 'Setting disabled' : 'Setting enabled');
      });
    });
  }

  async hydrateDataManagement() {
    // Update live metrics
    const habits = (await db.habits.toArray()).filter(matchesActiveUser);
    const journals = (await db.journalEntries.toArray()).filter(matchesActiveUser);
    const goals = (await db.goals.toArray()).filter(matchesActiveUser);
    const transactions = (await db.transactions.toArray()).filter(matchesActiveUser);
    const trades = (await db.trades.toArray()).filter(matchesActiveUser);

    const breakdownItems = this.appContainer.querySelectorAll('.grid > div');
    breakdownItems.forEach(item => {
      const text = item.innerText || '';
      if (text.includes('Journal')) {
        const p = item.querySelector('.font-label-md');
        if (p) p.innerText = `${journals.length} Entries`;
      } else if (text.includes('Habits')) {
        const p = item.querySelector('.font-label-md');
        if (p) p.innerText = `${habits.length} Habits`;
      } else if (text.includes('Goals')) {
        const p = item.querySelector('.font-label-md');
        if (p) p.innerText = `${goals.length} Goals`;
      } else if (text.includes('Transactions')) {
        const p = item.querySelector('.font-label-md');
        if (p) p.innerText = `${transactions.length} Logs`;
      }
    });

    const tradeEl = this.appContainer.querySelector('.col-span-2 .font-label-md');
    if (tradeEl) tradeEl.innerText = `${trades.length} Trades`;

    // Wire actions
    const backupBtn = this.appContainer.querySelector('#btn-backup-now');
    if (backupBtn) {
      backupBtn.onclick = () => this.navigate('backup');
    }

    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Backup Data') || text === 'Backup Now') btn.onclick = () => this.navigate('backup');
      else if (text.includes('Restore Data')) btn.onclick = () => this.navigate('restore');
      else if (text.includes('Export Data')) btn.onclick = () => this.navigate('backup');
      else if (text.includes('Import Data')) btn.onclick = () => this.navigate('restore');
      else if (text.includes('Reset App Data') || btn.id === 'btn-reset-data') btn.onclick = () => this.navigate('reset-data');
    });
  }

  async hydrateBackup() {
    const backupBtn = this.appContainer.querySelector('#backupTrigger') ||
      this.appContainer.querySelector('#exportTrigger') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Export') || b.innerText.includes('Backup') || b.innerText.includes('Download'));

    const triggerBackupDownload = async (e) => {
      if (e) e.preventDefault();
      const currentUserId = getActiveUserId();

      // Explicit security sanitization: Never include passwords, tokens, or private secrets
      const SENSITIVE_PROPERTIES = ['password', 'passwordHash', 'token', 'access_token', 'refresh_token', 'apiKey', 'secret', 'service_role'];
      const sanitizeList = (arr) => (arr || []).map(item => {
        if (!item || typeof item !== 'object') return item;
        const clean = { ...item };
        for (const key of Object.keys(clean)) {
          if (SENSITIVE_PROPERTIES.includes(key) || key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
            delete clean[key];
          }
        }
        return clean;
      });

      // Export user-isolated data matching active user
      const exportData = {
        version: 3,
        app: 'GLOW UP',
        userId: currentUserId,
        exportedAt: new Date().toISOString(),
        users: sanitizeList((await db.users.toArray()).filter(matchesActiveUser)),
        habits: sanitizeList((await db.habits.toArray()).filter(matchesActiveUser)),
        habitEntries: sanitizeList((await db.habitEntries.toArray()).filter(matchesActiveUser)),
        journalEntries: sanitizeList((await db.journalEntries.toArray()).filter(matchesActiveUser)),
        goals: sanitizeList((await db.goals.toArray()).filter(matchesActiveUser)),
        goalMilestones: sanitizeList((await db.goalMilestones.toArray()).filter(matchesActiveUser)),
        transactions: sanitizeList((await db.transactions.toArray()).filter(matchesActiveUser)),
        budgets: sanitizeList((await db.budgets.toArray()).filter(matchesActiveUser)),
        tradingAccounts: sanitizeList((await db.tradingAccounts.toArray()).filter(matchesActiveUser)),
        trades: sanitizeList((await db.trades.toArray()).filter(matchesActiveUser)),
        achievements: sanitizeList((await db.achievements.toArray()).filter(matchesActiveUser)),
        weeklyReviews: sanitizeList((await db.weeklyReviews.toArray()).filter(matchesActiveUser))
      };

      // Unlock first_backup achievement
      await AchievementService.unlockManual('first_backup');

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glow_up_backup_v3_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      this.showToast('Database backup downloaded!');
    };

    if (backupBtn) backupBtn.onclick = triggerBackupDownload;
    const exportBtn = this.appContainer.querySelector('#exportTrigger');
    if (exportBtn) exportBtn.onclick = triggerBackupDownload;
  }

  async hydrateRestore() {
    const fileInput = this.appContainer.querySelector('input[type="file"]') || document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    const restoreTriggerBtn = this.appContainer.querySelector('#restore-btn') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Choose File') || b.innerText.includes('Select') || b.innerText.includes('Upload') || b.innerText.includes('Restore'));

    if (restoreTriggerBtn) {
      restoreTriggerBtn.onclick = (e) => {
        e.preventDefault();
        fileInput.click();
      };

      fileInput.onchange = async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          let raw;
          try {
            raw = JSON.parse(text);
          } catch (jsonErr) {
            alert('Invalid backup: File is not valid JSON.');
            return;
          }

          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            alert('Invalid backup file structure: Root must be a JSON object.');
            return;
          }

          const data = raw.data || raw;

          // Validate that the backup has at least one recognized data domain
          const hasValidDomains = Array.isArray(data.habits) ||
                                  Array.isArray(data.tradingAccounts) ||
                                  Array.isArray(data.goals) ||
                                  Array.isArray(data.journalEntries) ||
                                  Array.isArray(data.transactions);

          if (!hasValidDomains) {
            alert('Invalid backup file: No recognizable GLOW UP data tables found.');
            return;
          }

          // Validate that all declared table fields are valid arrays of objects (prevent data corruption)
          const tableNames = ['users', 'habits', 'habitEntries', 'journalEntries', 'goals', 'goalMilestones', 'transactions', 'budgets', 'tradingAccounts', 'trades', 'achievements', 'weeklyReviews'];
          for (const tbl of tableNames) {
            if (data[tbl] !== undefined && !Array.isArray(data[tbl])) {
              alert(`Corrupted backup file: Table "${tbl}" is not an array.`);
              return;
            }
          }

          const confirmed = confirm('Are you sure you want to restore this backup? This will replace your current local data.');
          if (!confirmed) return;

          const currentUserId = getActiveUserId();
          const sanitizeAndAttach = (arr) => {
            if (!Array.isArray(arr)) return [];
            return arr
              .filter(item => item && typeof item === 'object' && !Array.isArray(item))
              .map(item => {
                const clean = { ...item, userId: item.userId || currentUserId };
                // Strip any potentially dangerous keys or auth secrets
                delete clean.password;
                delete clean.passwordHash;
                delete clean.token;
                delete clean.__proto__;
                return clean;
              });
          };

          // Restore user-scoped tables inside atomic transaction
          await db.transaction('rw', [
            db.users, db.habits, db.habitEntries, db.journalEntries,
            db.goals, db.goalMilestones, db.transactions, db.budgets,
            db.tradingAccounts, db.trades, db.achievements, db.weeklyReviews
          ], async () => {
            if (data.users) {
              const uList = sanitizeAndAttach(data.users);
              if (uList.length) await db.users.bulkPut(uList);
            }
            if (data.habits) {
              const hList = sanitizeAndAttach(data.habits);
              if (hList.length) await db.habits.bulkPut(hList);
            }
            if (data.habitEntries) {
              const heList = sanitizeAndAttach(data.habitEntries);
              if (heList.length) await db.habitEntries.bulkPut(heList);
            }
            if (data.journalEntries) {
              const jList = sanitizeAndAttach(data.journalEntries);
              if (jList.length) await db.journalEntries.bulkPut(jList);
            }
            if (data.goals) {
              const gList = sanitizeAndAttach(data.goals);
              if (gList.length) await db.goals.bulkPut(gList);
            }
            const milestoneData = data.goalMilestones || data.milestones;
            if (milestoneData) {
              const mList = sanitizeAndAttach(milestoneData);
              if (mList.length) await db.goalMilestones.bulkPut(mList);
            }
            if (data.transactions) {
              const tList = sanitizeAndAttach(data.transactions);
              if (tList.length) await db.transactions.bulkPut(tList);
            }
            if (data.budgets) {
              const bList = sanitizeAndAttach(data.budgets);
              if (bList.length) await db.budgets.bulkPut(bList);
            }
            if (data.tradingAccounts) {
              const taList = sanitizeAndAttach(data.tradingAccounts);
              if (taList.length) await db.tradingAccounts.bulkPut(taList);
            }
            if (data.trades) {
              const trList = sanitizeAndAttach(data.trades);
              if (trList.length) await db.trades.bulkPut(trList);
            }
            if (data.achievements) {
              const aList = sanitizeAndAttach(data.achievements);
              if (aList.length) await db.achievements.bulkPut(aList);
            }
            if (data.weeklyReviews) {
              const wList = sanitizeAndAttach(data.weeklyReviews);
              if (wList.length) await db.weeklyReviews.bulkPut(wList);
            }
          });

          // Recalculate achievements
          await AchievementService.checkAll();

          this.showToast('Data restored successfully!');
          setTimeout(() => this.navigate('home'), 1000);
        } catch (err) {
          alert('Error reading backup file: ' + err.message);
        }
      };
    }
  }

  async hydrateResetData() {
    const confirmBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Reset') || b.innerText.includes('Confirm') || b.innerText.includes('Wipe'));
    if (confirmBtn) {
      confirmBtn.onclick = async (e) => {
        e.preventDefault();
        const confirmed = confirm('Are you sure you want to reset all personal data? This cannot be undone.');
        if (!confirmed) return;

        const uid = getActiveUserId();
        await cleanResetUserData(uid);
        await seedInitialData();
        this.showToast('Database reset to clean state!');
        setTimeout(() => this.navigate('home'), 500);
      };
    }
  }
}
