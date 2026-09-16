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
    const habits = await HabitService.getAll(false);
    const dailyStats = await HabitService.getDailyCompletionStats(todayStr);
    const goals = await GoalService.getAll();
    const activeGoals = goals.filter(g => g.status === 'ACTIVE');
    const todayJournal = await JournalService.getToday(todayStr);
    const finStats = await MoneyService.getFinancialStats();

    // 1. Update Hero Card with Real Streak & Real Percentage
    const streakEl = this.appContainer.querySelector('.bg-primary-container .font-label-sm, .bg-primary-container span.font-bold');
    if (streakEl) {
      const streak = await JournalService.getWritingStreak();
      streakEl.innerText = `${Math.max(1, streak)} day streak`;
    }

    const percentageEl = this.appContainer.querySelector('.font-display-lg');
    if (percentageEl) {
      percentageEl.innerText = `${dailyStats.percentage}%`;
    }

    // 2. Update 2x2 Metric Cards with Real Stored Numbers
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

    // 3. Update Interactive Habit List
    const habitItems = this.appContainer.querySelectorAll('.habit-item');
    const entries = await db.habitEntries.where('date').equals(todayStr).toArray();
    const entryMap = new Map(entries.map(e => [e.habitId, e.completed]));

    habitItems.forEach((item, index) => {
      const habit = habits[index] || habits[0];
      if (!habit) return;

      const isCompleted = !!entryMap.get(habit.id);
      const titleSpan = item.querySelector('.font-label-lg');
      const triggerBtn = item.querySelector('.check-trigger') || item.querySelector('button');
      const checkIcon = triggerBtn?.querySelector('.material-symbols-outlined');

      if (titleSpan) titleSpan.innerText = habit.name;

      const applyState = (completed) => {
        item.setAttribute('data-completed', completed ? 'true' : 'false');
        if (completed) {
          titleSpan?.classList.add('line-through', 'opacity-60');
          triggerBtn?.classList.remove('bg-surface-container', 'text-outline');
          triggerBtn?.classList.add('bg-primary-container', 'text-on-surface');
          checkIcon?.classList.remove('opacity-0');
        } else {
          titleSpan?.classList.remove('line-through', 'opacity-60');
          triggerBtn?.classList.add('bg-surface-container', 'text-outline');
          triggerBtn?.classList.remove('bg-primary-container', 'text-on-surface');
          checkIcon?.classList.add('opacity-0');
        }
      };

      applyState(isCompleted);

      item.onclick = async () => {
        const next = await HabitService.toggleCompletion(habit.id, todayStr);
        applyState(next);

        // Refresh stats
        const updatedStats = await HabitService.getDailyCompletionStats(todayStr);
        if (percentageEl) percentageEl.innerText = `${updatedStats.percentage}%`;
        if (cards.length >= 1 && cards[0].querySelector('.font-headline-sm')) {
          cards[0].querySelector('.font-headline-sm').innerHTML = `${updatedStats.completed} <span class="font-body-md text-body-md text-on-surface-variant font-normal">/ ${updatedStats.total} done</span>`;
        }

        this.showToast(next ? `Completed: ${habit.name}` : `Unchecked: ${habit.name}`);
      };
    });
  }

  async hydrateDaily() {
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Journal') || text.includes('Write')) {
        btn.onclick = () => this.navigate('journal');
      } else if (text.includes('Habits') || text.includes('View all')) {
        btn.onclick = () => this.navigate('habits');
      } else if (text.includes('Weekly Review')) {
        btn.onclick = () => this.navigate('weekly-review');
      }
    });

    await this.hydrateHome();
  }

  async hydrateQuickAdd() {
    this.appContainer.querySelectorAll('button, a').forEach(el => {
      const text = el.innerText?.trim() || '';
      if (text.includes('Habit')) el.onclick = () => this.navigate('habits');
      else if (text.includes('Journal')) el.onclick = () => this.navigate('journal');
      else if (text.includes('Trade')) el.onclick = () => this.navigate('trade-new');
      else if (text.includes('Transaction') || text.includes('Expense')) el.onclick = () => this.navigate('transaction-new');
      else if (text.includes('Goal')) el.onclick = () => this.navigate('goal-new');
    });
  }

  async hydrateHabits() {
    const habits = await HabitService.getAll(false);
    const todayStr = new Date().toISOString().split('T')[0];

    const addBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Add') || b.getAttribute('aria-label') === 'Add Habit');
    if (addBtn) {
      addBtn.onclick = async () => {
        const name = prompt('Enter new habit name:');
        if (name && name.trim()) {
          await HabitService.create({ name: name.trim() });
          this.showToast(`Habit "${name}" created!`);
          await this.handleRoute();
        }
      };
    }

    this.appContainer.querySelectorAll('.habit-card, .habit-item, article').forEach((card, idx) => {
      const habit = habits[idx];
      if (!habit) return;
      card.style.cursor = 'pointer';
      card.onclick = () => {
        this.selectedHabitId = habit.id;
        this.navigate('habit-detail');
      };
    });
  }

  async hydrateHabitDetail() {
    const habits = await HabitService.getAll(true);
    const habit = (this.selectedHabitId ? habits.find(h => h.id === this.selectedHabitId) : null) || habits[0];

    if (habit) {
      const nameEl = this.appContainer.querySelector('h1, h2, .font-headline-sm');
      if (nameEl && !nameEl.innerText.includes('Settings')) {
        nameEl.innerText = habit.name;
      }

      // Archive button
      const archiveBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Archive') || b.innerText.includes('Delete'));
      if (archiveBtn) {
        archiveBtn.onclick = async () => {
          if (confirm(`Archive habit "${habit.name}"?`)) {
            await HabitService.archive(habit.id);
            this.showToast('Habit archived');
            this.navigate('habits');
          }
        };
      }
    }
  }

  async hydrateJournal() {
    const todayStr = new Date().toISOString().split('T')[0];
    const entry = await JournalService.getToday(todayStr);

    const textarea = this.appContainer.querySelector('textarea');
    const moodButtons = this.appContainer.querySelectorAll('button[data-mood], .mood-selector button');
    let selectedMood = entry?.mood || 'focused';

    if (textarea && entry) {
      textarea.value = entry.notes || entry.reflection || '';
    }

    moodButtons.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        selectedMood = btn.innerText.toLowerCase().trim();
        this.showToast(`Mood: ${selectedMood}`);
      };
    });

    const historyBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('History'));
    if (historyBtn) {
      historyBtn.onclick = () => this.navigate('journal-history');
    }

    // Save as draft button
    const draftBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Draft'));
    if (draftBtn) {
      draftBtn.onclick = async (e) => {
        e.preventDefault();
        const content = textarea?.value.trim() || '';
        await JournalService.save({
          date: todayStr,
          mood: selectedMood,
          notes: content,
          status: 'draft'
        });
        this.showToast('Draft saved');
      };
    }

    // Save & Complete button
    const saveBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save') || b.innerText.includes('Done') || b.innerText.includes('Complete'));
    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const content = textarea?.value.trim() || 'Daily reflection recorded with discipline.';
        await JournalService.save({
          date: todayStr,
          mood: selectedMood,
          gratitude: 'Grateful for clean focus and progress.',
          wins: 'Executed habits consistently.',
          improvements: 'Keep sharpening timing and routine.',
          notes: content,
          status: 'completed'
        });

        this.showToast('Journal completed & saved!');
        setTimeout(() => this.navigate('journal-history'), 400);
      };
    }
  }

  async hydrateJournalHistory() {
    const entries = await JournalService.getAll();

    // New Entry CTA
    const newEntryBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('New') || b.innerText.includes('Write'));
    if (newEntryBtn) {
      newEntryBtn.onclick = () => this.navigate('journal');
    }

    // Search input
    const searchInput = this.appContainer.querySelector('input[type="text"], input[type="search"]');
    if (searchInput) {
      searchInput.oninput = async (e) => {
        const filtered = await JournalService.search(e.target.value);
        // Live search feedback
      };
    }

    // Wire delete on existing cards
    const entryCards = this.appContainer.querySelectorAll('article, .journal-card, [data-entry-id]');
    entryCards.forEach((card, idx) => {
      const entry = entries[idx];
      if (entry) {
        const deleteBtn = card.querySelector('button[aria-label*="Delete"], button[aria-label*="delete"], .delete-btn');
        if (deleteBtn) {
          deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Delete journal entry from ${entry.date}?`)) {
              await JournalService.delete(entry.id);
              this.showToast('Entry deleted');
              await this.handleRoute();
            }
          };
        }
      }
    });
  }

  async hydrateWeeklyReview() {
    const saveBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save') || b.innerText.includes('Submit'));
    if (saveBtn) {
      saveBtn.onclick = async () => {
        await db.weeklyReviews.add({
          weekStart: new Date().toISOString().split('T')[0],
          weekEnd: new Date().toISOString().split('T')[0],
          whatWentWell: 'Disciplined habit adherence and risk control.',
          challenges: 'Managing market noise.',
          lessons: 'Patience produces expectancy.',
          status: 'completed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        this.showToast('Weekly review recorded!');
        this.navigate('daily');
      };
    }
  }

  async hydrateGoals() {
    const goals = await GoalService.getAll();

    const newGoalBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('New') || b.innerText.includes('Add') || b.getAttribute('aria-label') === 'Add Goal');
    if (newGoalBtn) {
      newGoalBtn.onclick = () => this.navigate('goal-new');
    }

    const statsBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Statistics') || b.innerText.includes('Stats'));
    if (statsBtn) {
      statsBtn.onclick = () => this.navigate('goal-stats');
    }

    const cards = this.appContainer.querySelectorAll('.goal-card, article, [data-goal-id]');
    cards.forEach((card, idx) => {
      const g = goals[idx] || goals[0];
      if (g) {
        card.style.cursor = 'pointer';
        card.onclick = () => {
          this.selectedGoalId = g.id;
          this.navigate('goal-detail');
        };
      }
    });
  }

  async hydrateGoalNew() {
    const saveBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Create') || b.innerText.includes('Save'));
    const nameInput = this.appContainer.querySelector('input[type="text"]');

    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const name = nameInput?.value.trim() || `Goal #${Date.now().toString().slice(-4)}`;
        const goal = await GoalService.create({
          name,
          category: 'Personal Growth',
          target: 100,
          deadline: '2026-12-31'
        });
        // Add initial milestone
        await GoalService.addMilestone(goal.id, 'Phase 1 Planning Completed');
        this.showToast(`Goal "${name}" created!`);
        this.navigate('goals');
      };
    }
  }

  async hydrateGoalDetail() {
    const goals = await GoalService.getAll();
    const goal = (this.selectedGoalId ? await GoalService.get(this.selectedGoalId) : null) || (goals.length > 0 ? await GoalService.get(goals[0].id) : null);

    if (goal) {
      const nameEl = this.appContainer.querySelector('h1, h2, .font-headline-sm');
      if (nameEl && !nameEl.innerText.includes('Settings')) {
        nameEl.innerText = goal.name;
      }

      // Add Milestone CTA
      const addMilestoneBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Milestone') || b.innerText.includes('Add Step'));
      if (addMilestoneBtn) {
        addMilestoneBtn.onclick = async () => {
          const title = prompt('Enter milestone title:');
          if (title && title.trim()) {
            await GoalService.addMilestone(goal.id, title.trim());
            this.showToast('Milestone added!');
            await this.handleRoute();
          }
        };
      }

      // Wire Milestone checkboxes
      const milestoneRows = this.appContainer.querySelectorAll('.milestone-item, input[type="checkbox"]');
      milestoneRows.forEach((row, idx) => {
        const m = goal.milestones?.[idx];
        if (m) {
          row.onclick = async () => {
            const completed = await GoalService.toggleMilestone(m.id);
            this.showToast(completed ? `Completed: ${m.title}` : `Unchecked: ${m.title}`);
            await this.handleRoute();
          };
        }
      });
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

    // Update real balance and income/expense elements
    const balanceEl = this.appContainer.querySelector('.font-display-lg, .font-headline-lg');
    if (balanceEl) {
      balanceEl.innerText = `$${stats.netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    const addBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Add') || b.innerText.includes('Log') || b.getAttribute('aria-label') === 'Add Transaction');
    if (addBtn) addBtn.onclick = () => this.navigate('transaction-new');

    const txBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Transactions') || b.innerText.includes('View all'));
    if (txBtn) txBtn.onclick = () => this.navigate('transactions');

    const budgetBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Budget'));
    if (budgetBtn) budgetBtn.onclick = () => this.navigate('budget');

    const statsBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Stats') || b.innerText.includes('Analytics'));
    if (statsBtn) statsBtn.onclick = () => this.navigate('financial-stats');
  }

  async hydrateTransactions() {
    const transactions = await MoneyService.getAllTransactions();
    const addBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Add') || b.innerText.includes('New'));
    if (addBtn) addBtn.onclick = () => this.navigate('transaction-new');

    // Wire transaction items for delete
    const txRows = this.appContainer.querySelectorAll('article, .transaction-row, [data-transaction-id]');
    txRows.forEach((row, idx) => {
      const tx = transactions[idx];
      if (tx) {
        const delBtn = row.querySelector('button[aria-label*="Delete"], .delete-btn');
        if (delBtn) {
          delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Delete transaction "${tx.name}" ($${tx.amount.toFixed(2)})?`)) {
              await MoneyService.deleteTransaction(tx.id);
              this.showToast('Transaction deleted');
              await this.handleRoute();
            }
          };
        }
      }
    });
  }

  async hydrateTransactionNew() {
    const amountInput = this.appContainer.querySelector('input[type="number"], input[placeholder*="0.00"], input[name*="amount"]');
    const nameInput = this.appContainer.querySelector('input[type="text"], input[placeholder*="Merchant"], input[placeholder*="Name"], input[name*="name"]');
    const noteInput = this.appContainer.querySelector('input[placeholder*="note"], input[placeholder*="description"]');
    const saveBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save') || b.innerText.includes('Log') || b.innerText.includes('Add'));

    let type = 'expense';
    const incomeBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('income'));
    const expenseBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('expense'));

    if (incomeBtn && expenseBtn) {
      incomeBtn.onclick = (e) => {
        e.preventDefault();
        type = 'income';
        incomeBtn.classList.add('ring-2', 'ring-primary');
        expenseBtn.classList.remove('ring-2', 'ring-primary');
      };
      expenseBtn.onclick = (e) => {
        e.preventDefault();
        type = 'expense';
        expenseBtn.classList.add('ring-2', 'ring-primary');
        incomeBtn.classList.remove('ring-2', 'ring-primary');
      };
    }

    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const amount = parseFloat(amountInput?.value);
        if (isNaN(amount) || amount <= 0) {
          alert('Please enter a valid positive amount.');
          return;
        }
        const name = nameInput?.value.trim() || 'Daily Transaction';
        const note = noteInput?.value?.trim() || '';

        await MoneyService.addTransaction({
          name,
          type,
          amount,
          category: 'General',
          notes: note
        });

        this.showToast(`Transaction of $${amount.toFixed(2)} logged!`);
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

    // Wire Add Account Button
    const addBtn = Array.from(this.appContainer.querySelectorAll('button, a')).find(b => b.innerText.includes('Add') || b.innerText.includes('New Account') || b.getAttribute('aria-label') === 'Add Account');
    if (addBtn) {
      addBtn.onclick = () => this.navigate('trading-account-new');
    }

    // Wire Active and Blown Account cards
    const cards = this.appContainer.querySelectorAll('article, .account-card, [data-account-id]');
    cards.forEach((card, idx) => {
      const allAccounts = [...active, ...blown];
      const targetAcc = allAccounts[idx] || active[0] || blown[0];
      if (targetAcc) {
        card.style.cursor = 'pointer';
        card.onclick = () => {
          this.selectedAccountId = targetAcc.id;
          this.navigate(`trading-account-detail`);
        };
      }
    });
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
      const guardSections = this.appContainer.querySelectorAll('.space-y-1\.5');
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
    const monthLabel = this.appContainer.querySelector('.font-label-sm.font-bold.px-1\.5, #calendarGrid');
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
    const stats = allTrades.length > 0 ? {
      total: allTrades.length,
      wins: allTrades.filter(t => t.pnl > 0).length,
      losses: allTrades.filter(t => t.pnl < 0).length,
      be: allTrades.filter(t => t.pnl === 0).length,
      netPL: allTrades.reduce((s, t) => s + t.pnl, 0)
    } : null;

    // Update performance summary banner
    if (stats) {
      const metricEls = this.appContainer.querySelectorAll('.font-headline-md, .font-headline-sm');
      metricEls.forEach(el => {
        if (el.innerText === '14') el.innerText = `${stats.total}`;
      });
    }

    // Update filter pill counts
    this.appContainer.querySelectorAll('.filter-pill').forEach(pill => {
      const filter = pill.getAttribute('data-filter');
      const countEl = pill.querySelector('.font-label-sm');
      if (!countEl || !stats) return;
      if (filter === 'all') countEl.innerText = `(${stats.total})`;
      else if (filter === 'win') countEl.innerText = `(${stats.wins})`;
      else if (filter === 'loss') countEl.innerText = `(${stats.losses})`;
      else if (filter === 'be') countEl.innerText = `(${stats.be})`;
    });

    // Wire new trade button
    const newTradeBtn = this.appContainer.querySelector('#new-trade-btn') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Log New Trade') || b.innerText.includes('New Trade'));
    if (newTradeBtn) newTradeBtn.onclick = () => this.navigate('trade-new');

    // Wire trade cards to open detail
    this.appContainer.querySelectorAll('.trade-card, article[data-outcome]').forEach((card, idx) => {
      card.onclick = () => {
        const trade = allTrades[idx];
        if (trade) {
          this.selectedTradeId = trade.id;
          this.navigate('trade-open');
        }
      };
    });

    // Wire back button
    const backBtn = this.appContainer.querySelector('button[aria-label="Go back"]');
    if (backBtn) backBtn.onclick = () => this.navigate('trading');
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
              for (const u of uList) await db.users.put(u);
            }
            if (data.habits) {
              const hList = sanitizeAndAttach(data.habits);
              for (const h of hList) await db.habits.put(h);
            }
            if (data.habitEntries) {
              const heList = sanitizeAndAttach(data.habitEntries);
              for (const he of heList) await db.habitEntries.put(he);
            }
            if (data.journalEntries) {
              const jList = sanitizeAndAttach(data.journalEntries);
              for (const j of jList) await db.journalEntries.put(j);
            }
            if (data.goals) {
              const gList = sanitizeAndAttach(data.goals);
              for (const g of gList) await db.goals.put(g);
            }
            const milestoneData = data.goalMilestones || data.milestones;
            if (milestoneData) {
              const mList = sanitizeAndAttach(milestoneData);
              for (const m of mList) await db.goalMilestones.put(m);
            }
            if (data.transactions) {
              const tList = sanitizeAndAttach(data.transactions);
              for (const t of tList) await db.transactions.put(t);
            }
            if (data.budgets) {
              const bList = sanitizeAndAttach(data.budgets);
              for (const b of bList) await db.budgets.put(b);
            }
            if (data.tradingAccounts) {
              const taList = sanitizeAndAttach(data.tradingAccounts);
              for (const ta of taList) await db.tradingAccounts.put(ta);
            }
            if (data.trades) {
              const trList = sanitizeAndAttach(data.trades);
              for (const tr of trList) await db.trades.put(tr);
            }
            if (data.achievements) {
              const aList = sanitizeAndAttach(data.achievements);
              for (const a of aList) await db.achievements.put(a);
            }
            if (data.weeklyReviews) {
              const wList = sanitizeAndAttach(data.weeklyReviews);
              for (const w of wList) await db.weeklyReviews.put(w);
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
        const confirmed = confirm('Are you sure you want to reset all data to default demo state? This cannot be undone.');
        if (!confirmed) return;

        // Clear all tables
        await Promise.all([
          db.users.clear(),
          db.habits.clear(),
          db.habitEntries.clear(),
          db.journalEntries.clear(),
          db.goals.clear(),
          db.goalMilestones.clear(),
          db.transactions.clear(),
          db.budgets.clear(),
          db.tradingAccounts.clear(),
          db.trades.clear(),
          db.achievements.clear(),
          db.weeklyReviews.clear()
        ]);

        await seedInitialData();
        this.showToast('Database reset to fresh state!');
        setTimeout(() => this.navigate('home'), 500);
      };
    }
  }
}
