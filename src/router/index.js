import { screensData } from '../screens/screensData.js';
import {
  db,
  seedInitialData,
  cleanResetUserData,
  getActiveUserId,
  setActiveUserId,
  matchesActiveUser,
  HabitService,
  JournalService,
  GoalService,
  MoneyService,
  AchievementService,
  PreferenceService,
  UserService
} from '../db/index.js';
import { TradingEngine } from '../trading/engine.js';
import { AuthService } from '../auth/index.js';
import { SyncEngine } from '../sync/index.js';
import {
  getLocalDateString,
  getLocalWeekdayName,
  getLocalWeekdayShort,
  getLocalMonthName,
  formatHeaderDate,
  formatFullDate,
  getLocalTimeFormatted,
  getCurrentWeek,
  getMonthCalendarGrid,
  parseLocalDate,
  isToday,
  isSameDay
} from '../utils/date.js';

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

export const ThemeManager = {
  apply(mode) {
    if (typeof document === 'undefined') return;
    const isDark = mode === 'dark' || (mode === 'system' && typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },
  async getTheme() {
    return (await PreferenceService.get('appearance_theme', 'system')) || 'system';
  },
  async setTheme(theme) {
    await PreferenceService.set('appearance_theme', theme);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('glow_theme', theme);
    }
    this.apply(theme);
  },
  init() {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('glow_theme') || 'system';
    this.apply(saved);
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
        const cur = await this.getTheme();
        if (cur === 'system') this.apply('system');
      });
    }
  }
};

export const AutoLockManager = {
  lastActivity: Date.now(),
  locked: false,

  init(router) {
    this.router = router;
    if (typeof window === 'undefined') return;
    const updateActivity = () => {
      this.lastActivity = Date.now();
    };
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
      window.addEventListener(evt, updateActivity, { passive: true });
    });
    setInterval(() => this.checkInactivity(), 5000);
  },

  async checkInactivity() {
    if (this.locked || !AuthService.isAuthenticated() || typeof document === 'undefined') return;
    const appLockEnabled = await PreferenceService.get('app_lock_enabled', false);
    if (!appLockEnabled) return;

    const duration = await PreferenceService.get('auto_lock_duration', 'Immediately');
    let timeoutMs = 60000;
    if (duration === 'Immediately') timeoutMs = 15000; // 15s inactivity threshold in browser session
    else if (duration === '1 min') timeoutMs = 60000;
    else if (duration === '5 min') timeoutMs = 300000;
    else if (duration === '15 min') timeoutMs = 900000;

    if (Date.now() - this.lastActivity >= timeoutMs) {
      this.lockApp();
    }
  },

  lockApp() {
    this.locked = true;
    const existing = document.getElementById('glow-lock-modal');
    if (existing) return;

    const modal = document.createElement('div');
    modal.id = 'glow-lock-modal';
    modal.className = 'fixed inset-0 z-50 bg-surface/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center';
    modal.innerHTML = `
      <div class="w-20 h-20 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container shadow-lg mb-4 animate-bounce">
        <span class="material-symbols-outlined text-[36px]">lock</span>
      </div>
      <h2 class="font-headline-sm text-on-surface font-bold mb-1">GLOW UP Locked</h2>
      <p class="font-body-md text-on-surface-variant max-w-xs mb-6">Your session was auto-locked due to inactivity.</p>
      <button id="unlock-app-btn" class="w-full max-w-xs h-14 rounded-full bg-primary-container text-on-primary-fixed font-label-lg font-bold shadow-md hover:bg-secondary-fixed active:scale-95 transition-all">
        Unlock Session
      </button>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#unlock-app-btn').onclick = () => {
      this.lastActivity = Date.now();
      this.locked = false;
      modal.remove();
    };
  }
};

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

export const ROOT_ROUTES = new Set([
  'splash',
  'welcome',
  'login',
  'register',
  'create-account',
  'profile-setup',
  'home',
  'daily',
  'quick-add',
  'progress',
  'menu'
]);

export const PARENT_ROUTE_MAP = {
  // Habits & Journal
  'habit-detail': 'daily',
  'habits': 'daily',
  'journal': 'daily',
  'journal-history': 'journal',
  'weekly-review': 'progress',

  // Goals
  'goals': 'progress',
  'goal-new': 'goals',
  'goal-detail': 'goals',
  'goal-stats': 'goals',

  // Progress & Rewards
  'habit-stats': 'progress',
  'personal-stats': 'progress',
  'rewards': 'progress',
  'achievements': 'rewards',

  // Money
  'money': 'home',
  'transactions': 'money',
  'transaction-new': 'transactions',
  'budget': 'money',
  'financial-stats': 'money',

  // Trading
  'trading': 'home',
  'trading-accounts': 'trading',
  'trading-account-new': 'trading-accounts',
  'trading-account-detail': 'trading-accounts',
  'account-rules': 'trading-account-detail',
  'trade-new': 'trading-account-detail',
  'trade-open': 'trading',
  'trade-history': 'trading',
  'trading-stats': 'trading',
  'trading-review': 'trading',
  'trade-journal': 'trading',
  'risk-calculator': 'trading',
  'pre-trade-checklist': 'trading',
  'trading-decision': 'trading',
  'xauusd-setup': 'trading',

  // Profile & Settings
  'profile': 'menu',
  'notifications': 'menu',
  'security': 'menu',
  'data-management': 'menu',
  'backup': 'data-management',
  'restore': 'data-management',
  'reset-data': 'data-management'
};

export class AppRouter {
  constructor() {
    this.appContainer = document.getElementById('app');
    this.toast = document.getElementById('toast');
    this.toastMsg = document.getElementById('toast-message');
    this.menuDrawer = document.getElementById('menu-drawer');
    this.closeMenuBtn = document.getElementById('close-menu-btn');
    this.currentRoute = 'home';
    this.navigationHistory = [];
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

  showVerificationModal(email) {
    this.showModal({
      title: 'Verify Your Email',
      bodyHtml: `
        <div class="flex flex-col gap-3 py-1">
          <div class="flex items-center gap-3 p-3.5 bg-primary-container/30 rounded-xl">
            <span class="material-symbols-outlined text-primary text-[24px]">mark_email_unread</span>
            <div class="flex flex-col">
              <span class="font-label-md font-semibold text-on-surface">Confirmation Required</span>
              <span class="font-body-sm text-on-surface-variant">Your Supabase account requires email verification before signing in.</span>
            </div>
          </div>
          <p class="font-body-md text-on-surface">Please check your inbox at <strong class="text-primary">${email}</strong> and click the confirmation link.</p>
          <p class="font-body-sm text-outline">Didn't receive the email? Click below to send a fresh confirmation link.</p>
        </div>
      `,
      confirmText: 'Resend Confirmation Email',
      onConfirm: async () => {
        this.showToast('Sending confirmation email...');
        const res = await AuthService.resendConfirmationEmail(email);
        if (res.success) {
          this.showToast('Confirmation email resent! Please check your inbox.');
          return true;
        } else {
          this.showToast(res.error || 'Failed to resend confirmation email');
          return false;
        }
      }
    });
  }

  openDailyCalendarModal(currentSelectedDate, onSelectDate) {
    const existing = document.getElementById('glow-modal');
    if (existing) existing.remove();

    const parsed = parseLocalDate(currentSelectedDate || getLocalDateString());
    let viewYear = parsed.year;
    let viewMonth = parsed.month; // 1-12

    const modal = document.createElement('div');
    modal.id = 'glow-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-200';

    const renderCalendar = () => {
      const grid = getMonthCalendarGrid(viewYear, viewMonth);
      const monthName = getLocalMonthName(viewMonth);

      modal.innerHTML = `
        <div class="w-full max-w-sm bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 flex flex-col gap-4">
          <!-- Calendar Header -->
          <div class="flex items-center justify-between pb-2 border-b border-surface-variant">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[22px]">calendar_month</span>
              <h3 class="font-headline-sm text-on-surface font-bold">${monthName} ${viewYear}</h3>
            </div>
            <div class="flex items-center gap-1">
              <button id="cal-prev-btn" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors" type="button" aria-label="Previous Month">
                <span class="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <button id="cal-next-btn" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors" type="button" aria-label="Next Month">
                <span class="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
              <button id="cal-close-btn" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface ml-1" type="button" aria-label="Close">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          <!-- Weekday Headers -->
          <div class="grid grid-cols-7 text-center font-label-sm text-label-sm font-semibold text-outline py-1">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          <!-- Calendar Matrix -->
          <div class="grid grid-cols-7 gap-1 place-items-center">
            ${grid.map(cell => {
              const isSelected = cell.dateStr === currentSelectedDate;
              const isCurrDay = cell.isToday;
              let cls = 'w-9 h-9 rounded-full flex flex-col items-center justify-center font-body-sm text-body-sm transition-all duration-150 relative ';

              if (isSelected) {
                cls += 'bg-primary-container text-on-primary-fixed font-bold shadow-sm ring-2 ring-primary scale-105';
              } else if (isCurrDay) {
                cls += 'bg-inverse-surface text-inverse-on-surface font-bold ring-2 ring-primary-container';
              } else if (!cell.isCurrentMonth) {
                cls += 'text-outline/40 hover:bg-surface-container-low';
              } else {
                cls += 'text-on-surface hover:bg-surface-container active:scale-95';
              }

              return `
                <button type="button" class="${cls}" data-cal-date="${cell.dateStr}">
                  <span>${cell.day}</span>
                  ${isCurrDay && !isSelected ? '<span class="w-1 h-1 rounded-full bg-primary-container absolute bottom-1"></span>' : ''}
                </button>
              `;
            }).join('')}
          </div>

          <!-- Quick Today & Actions -->
          <div class="flex items-center justify-between pt-2 border-t border-surface-variant">
            <button id="cal-jump-today-btn" type="button" class="px-3.5 py-1.5 rounded-full bg-primary-container/40 text-on-primary-container hover:bg-primary-container font-label-sm font-semibold transition-colors flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">today</span>
              <span>Jump to Today</span>
            </button>
            <button id="cal-cancel-btn" type="button" class="px-4 py-1.5 rounded-full bg-surface-container text-on-surface font-label-sm font-semibold hover:bg-surface-container-high transition-colors">
              Cancel
            </button>
          </div>
        </div>
      `;

      const close = () => modal.remove();
      modal.querySelector('#cal-close-btn').onclick = close;
      modal.querySelector('#cal-cancel-btn').onclick = close;
      modal.onclick = (e) => { if (e.target === modal) close(); };

      modal.querySelector('#cal-prev-btn').onclick = () => {
        viewMonth--;
        if (viewMonth < 1) {
          viewMonth = 12;
          viewYear--;
        }
        renderCalendar();
      };

      modal.querySelector('#cal-next-btn').onclick = () => {
        viewMonth++;
        if (viewMonth > 12) {
          viewMonth = 1;
          viewYear++;
        }
        renderCalendar();
      };

      modal.querySelector('#cal-jump-today-btn').onclick = () => {
        close();
        onSelectDate(getLocalDateString());
      };

      modal.querySelectorAll('[data-cal-date]').forEach(btn => {
        btn.onclick = () => {
          const pickedDate = btn.getAttribute('data-cal-date');
          close();
          onSelectDate(pickedDate);
        };
      });
    };

    document.body.appendChild(modal);
    renderCalendar();
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
    ThemeManager.init();
    AutoLockManager.init(this);
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

  handleBackNavigation(currentRoute = this.currentRoute) {
    const logicalParent = PARENT_ROUTE_MAP[currentRoute];

    // If we have prior in-app history in this session
    if (this.navigationHistory && this.navigationHistory.length > 1) {
      this.navigationHistory.pop(); // remove current route
      const prev = this.navigationHistory.pop(); // pop previous so navigate can re-push
      if (prev && prev !== currentRoute) {
        this.navigate(prev);
        return;
      }
    }

    // Fallback: If no prior in-app history (e.g. page refresh, direct link), use logical parent
    if (logicalParent) {
      this.navigate(logicalParent);
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      this.navigate('home');
    }
  }

  applyStickyBackArrow(route) {
    if (ROOT_ROUTES.has(route)) return;

    const header = this.appContainer.querySelector('header');
    if (!header) return;

    // 1. Ensure header is sticky within the page so it remains accessible while scrolling
    header.classList.add('sticky', 'top-0', 'z-40');

    // 2. Check if an existing back button or back link exists inside the header
    const existingBtn = header.querySelector(
      '.page-back-btn, button[aria-label="Back"], button[aria-label="back"], button[aria-label="Go Back"], button[aria-label="Go back"], a[aria-label="Back"], a[aria-label="back"], a[aria-label="Go Back"], a[aria-label="Go back"]'
    );

    if (existingBtn) {
      existingBtn.className = 'page-back-btn w-10 h-10 -ml-1 mr-2 rounded-full bg-surface-container-lowest/90 hover:bg-surface-container border border-outline-variant/30 shadow-xs flex items-center justify-center text-on-surface transition-all active:scale-95 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer';
      existingBtn.setAttribute('aria-label', 'Go back');
      if (!existingBtn.innerHTML.includes('arrow_back') && !existingBtn.innerHTML.includes('chevron_left')) {
        existingBtn.innerHTML = '<span class="material-symbols-outlined text-[20px] leading-none select-none">arrow_back</span>';
      }
      existingBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleBackNavigation(route);
      };
      return;
    }

    // 3. If no back button exists in header, create and insert it at the top-left
    const leftContainer = header.querySelector('.flex.items-center.justify-between > .flex.items-center, .flex.items-center') || header.firstElementChild;
    if (leftContainer) {
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'page-back-btn w-10 h-10 -ml-1 mr-2 rounded-full bg-surface-container-lowest/90 hover:bg-surface-container border border-outline-variant/30 shadow-xs flex items-center justify-center text-on-surface transition-all active:scale-95 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer';
      backBtn.setAttribute('aria-label', 'Go back');
      backBtn.innerHTML = '<span class="material-symbols-outlined text-[20px] leading-none select-none">arrow_back</span>';
      backBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleBackNavigation(route);
      };
      leftContainer.insertBefore(backBtn, leftContainer.firstChild);
    }
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

    // Maintain in-app navigation stack (avoid duplicate consecutive pushes)
    if (!this.navigationHistory) this.navigationHistory = [];
    if (this.navigationHistory[this.navigationHistory.length - 1] !== route) {
      this.navigationHistory.push(route);
      if (this.navigationHistory.length > 50) this.navigationHistory.shift();
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

    // Apply Sticky Back Arrow for secondary screens
    this.applyStickyBackArrow(route);

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
        const label = link.innerText?.trim() || '';

        if (path === 'home' || href.includes('home') || label === 'Home') {
          this.navigate('home');
        } else if (path === 'daily' || href.includes('daily') || label === 'Daily') {
          this.navigate('daily');
        } else if (path === 'quick-add' || path === 'create-goal' || href.includes('quick-add') || link.getAttribute('aria-label') === 'Quick Add') {
          this.navigate('quick-add');
        } else if (path === 'progress' || path === 'goals-dashboard' || href.includes('progress') || href.includes('goals-dashboard') || label.includes('Progress')) {
          this.navigate('progress');
        } else if (path === 'menu' || path === 'habits' || href.includes('menu') || link.querySelector('span')?.textContent?.includes('widgets') || label.includes('Menu')) {
          this.openMenu();
        }
      });
    });

    // 2. Wire all Back buttons and Cancel buttons
    const backButtons = this.appContainer.querySelectorAll('button[aria-label="Back"], button[aria-label="back"], button[aria-label="Go Back"], button[aria-label="Go back"], .back-btn, header button:first-child');
    backButtons.forEach(btn => {
      const text = btn.innerText || '';
      const icon = btn.querySelector('.material-symbols-outlined')?.innerText || '';
      if (icon.includes('arrow_back') || icon.includes('chevron_left') || text.toLowerCase().includes('cancel') || text.toLowerCase().includes('back')) {
        btn.onclick = (e) => {
          e.preventDefault();
          this.handleBackNavigation(this.currentRoute);
        };
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

      // Details buttons
      if (text === 'Details' || (text.includes('Details') && !el.closest('header'))) {
        const card = el.closest('[data-context], section, article, div.relative');
        const cardText = card?.innerText?.toLowerCase() || '';
        el.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (cardText.includes('habit') || cardText.includes('streak') || cardText.includes('high')) {
            this.navigate('habit-stats');
          } else if (cardText.includes('goal')) {
            this.navigate('goal-stats');
          } else if (cardText.includes('money') || cardText.includes('budget') || cardText.includes('balance')) {
            this.navigate('financial-stats');
          } else if (cardText.includes('trade') || cardText.includes('trading') || cardText.includes('drawdown')) {
            this.navigate('trading-stats');
          } else {
            this.navigate('personal-stats');
          }
        };
      }

      // Search icons
      if (el.getAttribute('aria-label') === 'Search' || (el.querySelector('.material-symbols-outlined')?.innerText === 'search' && !el.closest('form, .relative.w-full.h-[54px]'))) {
        el.onclick = (e) => {
          e.preventDefault();
          const searchInput = this.appContainer.querySelector('input[type="search"], input[type="text"][placeholder*="Search"], #journalSearch, #tx-search-input, #trade-search-input');
          if (searchInput) {
            searchInput.focus();
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        };
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
          if (res.code === 'EMAIL_NOT_VERIFIED' || res.error?.toLowerCase().includes('not verified') || res.error?.toLowerCase().includes('not confirmed') || res.error?.toLowerCase().includes('email not confirmed')) {
            this.showVerificationModal(email);
            return;
          }
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

        if (res.data?.requiresVerification) {
          this.showToast('Account created! Please verify your email before logging in.', 6000);
          this.showVerificationModal(email);
          this.navigate('login');
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
    const todayStr = getLocalDateString();
    const [habits, goals, todayJournal, finStats, streak] = await Promise.all([
      HabitService.getAll(false, true),
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

    // 4. Update Dynamic Weekly Flow (starts 100% UNCHECKED unless real completions exist)
    const weeklyFlowSection = Array.from(this.appContainer.querySelectorAll('div')).find(d => {
      const text = d.innerText || '';
      return text.includes('Weekly Flow');
    });

    if (weeklyFlowSection) {
      const { days } = getCurrentWeek();
      const weeklyEntries = await Promise.all(
        days.map(d => db.habitEntries.where('date').equals(d.dateStr).toArray())
      );

      const dayCompletions = days.map((day, idx) => {
        const completedList = (weeklyEntries[idx] || []).filter(e => matchesActiveUser(e) && e.completed);
        return {
          ...day,
          hasCompleted: completedList.length > 0
        };
      });

      const totalCompletedDays = dayCompletions.filter(d => d.hasCompleted).length;
      const weeklyBadge = weeklyFlowSection.querySelector('.font-label-sm.text-primary, span.font-bold');
      if (weeklyBadge) {
        weeklyBadge.innerText = `${totalCompletedDays} of 7 Completed`;
      }

      const pillGrid = weeklyFlowSection.querySelector('.grid.grid-cols-7');
      if (pillGrid) {
        pillGrid.innerHTML = dayCompletions.map(d => {
          const isCurrDay = isToday(d.dateStr);
          if (d.hasCompleted) {
            return `
              <div class="flex flex-col items-center gap-1.5 cursor-pointer group" data-weekly-date="${d.dateStr}">
                <span class="font-label-sm text-label-sm ${isCurrDay ? 'font-bold text-on-surface' : 'text-on-surface-variant'}">${d.weekdayShort}</span>
                <div class="w-9 h-11 rounded-full bg-primary-container flex items-center justify-center text-on-primary-fixed shadow-xs hover:scale-105 transition-transform">
                  <span class="material-symbols-outlined text-[18px] font-bold">check</span>
                </div>
              </div>
            `;
          } else if (isCurrDay) {
            return `
              <div class="flex flex-col items-center gap-1.5 cursor-pointer group" data-weekly-date="${d.dateStr}">
                <span class="font-label-sm text-label-sm font-bold text-on-surface">${d.weekdayShort}</span>
                <div class="w-9 h-11 rounded-full bg-inverse-surface flex items-center justify-center text-inverse-on-surface shadow-md ring-2 ring-primary-container hover:scale-105 transition-transform">
                  <span class="w-2 h-2 rounded-full bg-secondary-container animate-ping"></span>
                </div>
              </div>
            `;
          } else {
            return `
              <div class="flex flex-col items-center gap-1.5 cursor-pointer group" data-weekly-date="${d.dateStr}">
                <span class="font-label-sm text-label-sm text-outline">${d.weekdayShort}</span>
                <div class="w-9 h-11 rounded-full bg-surface-container flex items-center justify-center text-outline hover:bg-surface-container-high transition-colors">
                  <span class="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
                </div>
              </div>
            `;
          }
        }).join('');

        pillGrid.querySelectorAll('[data-weekly-date]').forEach(pill => {
          pill.onclick = (e) => {
            e.preventDefault();
            this.selectedDailyDate = pill.getAttribute('data-weekly-date');
            this.navigate('daily');
          };
        });
      }
    }

    // 5. Update Header Task Count
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
    const selectedDate = this.selectedDailyDate || getLocalDateString();
    this.selectedDailyDate = selectedDate;

    const habits = await HabitService.getAll(false, true);
    const dailyStats = await HabitService.getDailyCompletionStats(selectedDate, habits);
    const goals = await GoalService.getAll();
    const activeGoals = goals.filter(g => g.status === 'ACTIVE');
    const todayJournal = await JournalService.getToday(selectedDate);

    // 1. Dynamic Local Date Header & Day Title
    const dateLabel = this.appContainer.querySelector('span.font-label-md.text-on-surface-variant');
    if (dateLabel) {
      dateLabel.innerText = formatHeaderDate(selectedDate);
    }
    const dayTitleEl = this.appContainer.querySelector('h1.font-headline-lg-mobile');
    if (dayTitleEl) {
      dayTitleEl.innerText = isToday(selectedDate) ? 'Today' : getLocalWeekdayName(selectedDate);
    }

    // 2. Interactive Calendar Drawer / Modal Button
    const calBtn = this.appContainer.querySelector('button[aria-label="Toggle calendar view"], button[aria-label*="calendar"]');
    if (calBtn) {
      calBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openDailyCalendarModal(this.selectedDailyDate, async (pickedDate) => {
          this.selectedDailyDate = pickedDate;
          await this.hydrateDaily();
        });
      };
    }

    // 3. Progress Ring & Completion Stats
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

    // 4. Dynamic Habits List on Daily
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
        const entries = await db.habitEntries.where('date').equals(selectedDate).toArray();
        const entryMap = new Map(entries.filter(e => matchesActiveUser(e)).map(e => [e.habitId, e.completed]));

        habitListContainer.innerHTML = habits.map(h => {
          const isCompleted = !!entryMap.get(h.id);
          return `
            <div class="habit-card bg-surface-container-lowest rounded-lg p-3.5 shadow-sm flex items-center justify-between transition-all cursor-pointer hover:shadow" data-habit-id="${h.id}" data-completed="${isCompleted}">
              <div class="flex items-center gap-3.5 min-w-0 flex-grow pr-2">
                <div class="w-11 h-11 rounded-full ${isCompleted ? 'bg-primary-container/40 text-on-primary-container' : 'bg-surface-container-low text-on-surface-variant'} flex items-center justify-center text-[20px] shrink-0">
                  <span class="material-symbols-outlined text-[20px]">${h.icon || 'checklist'}</span>
                </div>
                <div class="truncate">
                  <h3 class="font-label-lg text-label-lg text-on-surface font-semibold truncate ${isCompleted ? 'line-through opacity-70' : ''}">${h.name}</h3>
                  <div class="flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant">
                    <span>🔥</span>
                    <span class="font-medium text-tertiary">${h.currentStreak || 0} day streak</span>
                    <span class="text-outline text-xs">• ${h.category || 'Daily'}</span>
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

          const toggleAction = async (e) => {
            if (e) e.preventDefault();
            const next = await HabitService.toggleCompletion(habit.id, selectedDate);
            card.setAttribute('data-completed', String(next));

            const iconWrap = card.querySelector('.w-11.h-11');
            const titleH3 = card.querySelector('h3.font-label-lg');
            const toggleBtn = card.querySelector('.habit-toggle');
            const checkIcon = toggleBtn?.querySelector('.material-symbols-outlined');

            if (next) {
              if (toggleBtn) toggleBtn.className = 'habit-toggle w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 active:scale-90 transition-transform';
              if (checkIcon) checkIcon.classList.remove('opacity-0');
              if (iconWrap) iconWrap.className = 'w-11 h-11 rounded-full bg-primary-container/40 text-on-primary-container flex items-center justify-center text-[20px] shrink-0';
              if (titleH3) titleH3.classList.add('line-through', 'opacity-70');
            } else {
              if (toggleBtn) toggleBtn.className = 'habit-toggle w-9 h-9 rounded-full bg-surface-container text-outline hover:bg-primary-container/40 flex items-center justify-center shrink-0 active:scale-90 transition-transform';
              if (checkIcon) checkIcon.classList.add('opacity-0');
              if (iconWrap) iconWrap.className = 'w-11 h-11 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center text-[20px] shrink-0';
              if (titleH3) titleH3.classList.remove('line-through', 'opacity-70');
            }

            const updatedStats = await HabitService.getDailyCompletionStats(selectedDate, habits);
            if (percentEl) percentEl.innerText = `${updatedStats.percentage}%`;
            if (statsEl) {
              statsEl.innerHTML = `<span class="material-symbols-outlined text-[16px] text-primary">check_circle</span> <span class="font-semibold text-on-surface">${updatedStats.completed} of ${updatedStats.total}</span> habits done`;
            }
            if (dailyCircle) {
              const offset = 251.2 - (251.2 * (updatedStats.percentage / 100));
              dailyCircle.style.strokeDashoffset = `${offset}`;
            }

            this.showToast(next ? `Completed: ${habit.name}` : `Unchecked: ${habit.name}`);
          };

          card.onclick = toggleAction;
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
    const habits = await HabitService.getAll(false, true);
    const todayStr = getLocalDateString();

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
    const todayStr = getLocalDateString();
    const entry = await JournalService.getToday(todayStr);
    let selectedMood = entry?.mood || 'great';
    let selectedReflection = entry?.reflection || '';

    // 1. Dynamic Local Date in Context Bar
    const dateElements = this.appContainer.querySelectorAll('p, span, h2, h3');
    dateElements.forEach(el => {
      const text = el.innerText || '';
      if (text.includes('Thursday, Oct 24') || text.includes('Oct 24')) {
        el.innerText = formatHeaderDate(todayStr);
      }
    });

    // Header Back & Search buttons
    const backBtn = this.appContainer.querySelector('header a[aria-label="Back"], header button[aria-label="Back"], .page-back-btn');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        this.handleBackNavigation('habit-detail');
      };
    }

    const searchBtn = this.appContainer.querySelector('header button[aria-label="Search"]');
    if (searchBtn) {
      searchBtn.onclick = () => this.navigate('journal-history');
    }

    // 2. Interactive Mood Selector Chips
    const moodBtns = this.appContainer.querySelectorAll('#mood-selector .mood-btn');
    const updateMoodUI = () => {
      moodBtns.forEach(btn => {
        const mood = btn.getAttribute('data-mood');
        const isActive = mood === selectedMood;
        if (isActive) {
          btn.className = 'mood-btn flex flex-col items-center justify-center py-3 px-1 rounded-2xl bg-surface-container-lowest text-on-surface shadow-md ring-2 ring-primary scale-105 transition-all active:scale-95 cursor-pointer';
        } else {
          btn.className = 'mood-btn flex flex-col items-center justify-center py-3 px-1 rounded-2xl bg-surface-container-lowest/70 text-on-surface-variant transition-all hover:bg-surface-container-lowest active:scale-95 cursor-pointer';
        }
      });
    };
    updateMoodUI();

    moodBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        selectedMood = btn.getAttribute('data-mood') || 'great';
        updateMoodUI();
      };
    });

    // 3. Interactive Reflection Cards ("Mindful Morning", "Peaceful Space")
    const reflectionCards = Array.from(this.appContainer.querySelectorAll('.grid.grid-cols-2 > div')).filter(div => {
      const t = div.innerText || '';
      return t.includes('Mindful Morning') || t.includes('Peaceful Space');
    });

    const updateReflectionUI = () => {
      reflectionCards.forEach(card => {
        const text = card.innerText?.trim() || '';
        const isMindful = text.includes('Mindful Morning');
        const cardRefName = isMindful ? 'Mindful Morning' : 'Peaceful Space';
        const isSelected = selectedReflection === cardRefName;

        card.classList.add('cursor-pointer', 'transition-all', 'duration-200');
        const existingBadge = card.querySelector('.reflection-check-badge');
        if (existingBadge) existingBadge.remove();

        if (isSelected) {
          card.className = 'relative h-28 rounded-[20px] overflow-hidden bg-surface-container-high shadow-lg ring-4 ring-primary ring-offset-2 ring-offset-surface scale-[0.98] cursor-pointer transition-all duration-200';
          const badge = document.createElement('div');
          badge.className = 'reflection-check-badge absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-xs z-10';
          badge.innerHTML = '<span class="material-symbols-outlined text-[16px] font-bold">check</span>';
          card.appendChild(badge);
        } else {
          card.className = 'relative h-28 rounded-[20px] overflow-hidden bg-surface-container-high shadow-sm hover:shadow-md cursor-pointer transition-all duration-200';
        }
      });
    };
    updateReflectionUI();

    reflectionCards.forEach(card => {
      card.onclick = (e) => {
        e.preventDefault();
        const text = card.innerText?.trim() || '';
        const cardRefName = text.includes('Mindful Morning') ? 'Mindful Morning' : 'Peaceful Space';
        if (selectedReflection === cardRefName) {
          selectedReflection = '';
        } else {
          selectedReflection = cardRefName;
        }
        updateReflectionUI();
      };
    });

    // 4. Prepopulate Text Inputs
    const gratitudeInput = this.appContainer.querySelector('#gratitude-input');
    const winsInput = this.appContainer.querySelector('#wins-input');
    const improveInput = this.appContainer.querySelector('#improve-input');
    const notesInput = this.appContainer.querySelector('#notes-input');

    if (entry) {
      if (gratitudeInput && entry.gratitude) gratitudeInput.value = entry.gratitude;
      if (winsInput && entry.wins) winsInput.value = entry.wins;
      if (improveInput && entry.improvements) improveInput.value = entry.improvements;
      if (notesInput && entry.notes) notesInput.value = entry.notes;
      if (entry.reflection) {
        selectedReflection = entry.reflection;
        updateReflectionUI();
      }
    }

    const getFields = () => ({
      gratitude: gratitudeInput?.value?.trim() || '',
      wins: winsInput?.value?.trim() || '',
      improvements: improveInput?.value?.trim() || '',
      notes: notesInput?.value?.trim() || ''
    });

    // 5. Save Button
    const saveBtn = this.appContainer.querySelector('#save-btn') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save Journal'));
    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const fields = getFields();
        await JournalService.save({
          date: todayStr,
          mood: selectedMood,
          reflection: selectedReflection,
          ...fields,
          status: 'completed'
        });
        this.showToast('Journal reflection saved!');
        setTimeout(() => this.navigate('journal-history'), 300);
      };
    }

    // 6. Save as Draft Button
    const draftBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save as draft') || b.innerText.includes('draft'));
    if (draftBtn && draftBtn !== saveBtn) {
      draftBtn.onclick = async (e) => {
        e.preventDefault();
        const fields = getFields();
        await JournalService.save({
          date: todayStr,
          mood: selectedMood,
          reflection: selectedReflection,
          ...fields,
          status: 'draft'
        });
        this.showToast('Draft saved!');
      };
    }
  }

  async hydrateJournalHistory() {
    const entries = await JournalService.getAll();

    // 1. Search Bar & Filter Chips
    const searchInput = this.appContainer.querySelector('#journalSearch');
    const filterChips = this.appContainer.querySelectorAll('.filter-chip');
    const noResultsEl = this.appContainer.querySelector('#noResults');
    const recentSection = this.appContainer.querySelector('section.w-full.space-y-3');

    let activeFilter = 'all';
    let searchQuery = '';

    // Update filter chip counts
    const moodCounts = {
      all: entries.length,
      great: entries.filter(e => e.mood === 'great' || e.mood === 'energized' || e.mood === 'grateful').length,
      good: entries.filter(e => e.mood === 'good' || e.mood === 'focused' || e.mood === 'calm').length,
      okay: entries.filter(e => e.mood === 'okay' || e.mood === 'reflective' || e.mood === 'tired' || e.mood === 'stressed').length
    };

    filterChips.forEach(chip => {
      const filter = chip.getAttribute('data-filter') || 'all';
      const span = chip.querySelector('span');
      if (span) {
        if (filter === 'all') span.innerText = `All (${moodCounts.all})`;
        else if (filter === 'great') span.innerText = `😄 Great (${moodCounts.great})`;
        else if (filter === 'good') span.innerText = `🙂 Good (${moodCounts.good})`;
        else if (filter === 'okay') span.innerText = `😐 Okay (${moodCounts.okay})`;
      }

      chip.onclick = (e) => {
        e.preventDefault();
        filterChips.forEach(c => {
          c.classList.remove('active', 'bg-primary-container', 'text-on-surface');
          c.classList.add('bg-surface-container-lowest', 'text-on-surface-variant');
        });
        chip.classList.add('active', 'bg-primary-container', 'text-on-surface');
        chip.classList.remove('bg-surface-container-lowest', 'text-on-surface-variant');
        activeFilter = filter;
        applyFilters();
      };
    });

    if (searchInput) {
      searchInput.oninput = debounce(() => {
        searchQuery = (searchInput.value || '').trim().toLowerCase();
        applyFilters();
      }, 180);
    }

    const moodEmojiMap = {
      great: '😄',
      energized: '⚡',
      grateful: '🙏',
      good: '🙂',
      focused: '🎯',
      calm: '🧘',
      okay: '😐',
      reflective: '💭',
      tired: '😴',
      stressed: '😤'
    };

    const renderCardList = (filteredList) => {
      if (!recentSection) return;

      const existingCards = recentSection.querySelectorAll('article.entry-card');
      existingCards.forEach(c => c.remove());

      if (filteredList.length === 0) {
        if (noResultsEl) noResultsEl.classList.remove('hidden');
        return;
      } else {
        if (noResultsEl) noResultsEl.classList.add('hidden');
      }

      filteredList.forEach(entry => {
        const preview = entry.gratitude || entry.wins || entry.improvements || entry.notes || 'No content entered.';
        const moodEmoji = moodEmojiMap[entry.mood] || '📝';
        const displayMood = entry.mood ? (entry.mood.charAt(0).toUpperCase() + entry.mood.slice(1)) : 'Good';
        const formattedDate = formatFullDate(entry.date);

        const card = document.createElement('article');
        card.className = 'entry-card bg-surface-container-lowest rounded-[22px] p-5 shadow-[0_4px_20px_-2px_rgba(17,17,17,0.03)] hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer';
        card.setAttribute('data-id', String(entry.id));
        card.setAttribute('data-mood', entry.mood || 'good');

        card.innerHTML = `
          <div class="flex items-center justify-between gap-2 mb-2.5">
            <span class="font-label-sm text-label-sm text-on-surface-variant">${formattedDate}</span>
            <div class="flex items-center gap-2">
              <span class="h-6 px-2.5 rounded-full bg-primary-container text-on-surface font-label-sm text-label-sm flex items-center gap-1">
                <span>${moodEmoji}</span> ${displayMood}
              </span>
              <button class="delete-entry-btn w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container transition-colors" data-id="${entry.id}" type="button" aria-label="Delete entry">
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>
          <h4 class="font-headline-sm text-headline-sm text-on-surface mb-1.5 group-hover:text-primary transition-colors">
            ${entry.reflection || 'Daily Reflection'}
          </h4>
          <p class="font-body-md text-body-md text-on-surface-variant line-clamp-2 mb-3">
            ${preview}
          </p>
          <div class="flex items-center justify-between pt-1">
            <div class="flex items-center gap-1 text-outline font-label-sm text-label-sm">
              <span class="material-symbols-outlined text-[16px]">timer</span>
              <span>${entry.status === 'completed' ? 'Completed' : 'Draft'}</span>
            </div>
            <span class="inline-flex items-center gap-1 font-label-md text-label-md text-primary font-semibold group-hover:translate-x-0.5 transition-transform">
              View entry <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
            </span>
          </div>
        `;

        card.onclick = (e) => {
          if (e.target.closest('.delete-entry-btn')) return;
          this.selectedDailyDate = entry.date;
          this.navigate('journal');
        };

        const delBtn = card.querySelector('.delete-entry-btn');
        if (delBtn) {
          delBtn.onclick = (e) => {
            e.stopPropagation();
            this.showConfirm({
              title: 'Delete Journal Entry',
              message: `Are you sure you want to delete the reflection for ${formattedDate}?`,
              confirmText: 'Delete',
              isDestructive: true,
              onConfirm: async () => {
                await JournalService.delete(entry.id);
                this.showToast('Journal entry deleted');
                await this.hydrateJournalHistory();
              }
            });
          };
        }

        recentSection.appendChild(card);
      });
    };

    const applyFilters = () => {
      let filtered = [...entries];
      if (activeFilter !== 'all') {
        if (activeFilter === 'great') {
          filtered = filtered.filter(e => e.mood === 'great' || e.mood === 'energized' || e.mood === 'grateful');
        } else if (activeFilter === 'good') {
          filtered = filtered.filter(e => e.mood === 'good' || e.mood === 'focused' || e.mood === 'calm');
        } else if (activeFilter === 'okay') {
          filtered = filtered.filter(e => e.mood === 'okay' || e.mood === 'reflective' || e.mood === 'tired' || e.mood === 'stressed');
        } else {
          filtered = filtered.filter(e => e.mood === activeFilter);
        }
      }

      if (searchQuery) {
        filtered = filtered.filter(e =>
          (e.gratitude && e.gratitude.toLowerCase().includes(searchQuery)) ||
          (e.wins && e.wins.toLowerCase().includes(searchQuery)) ||
          (e.improvements && e.improvements.toLowerCase().includes(searchQuery)) ||
          (e.notes && e.notes.toLowerCase().includes(searchQuery)) ||
          (e.reflection && e.reflection.toLowerCase().includes(searchQuery)) ||
          (e.mood && e.mood.toLowerCase().includes(searchQuery))
        );
      }

      renderCardList(filtered);
    };

    // 2. Month Calendar at top
    const calSection = this.appContainer.querySelector('section.w-full.bg-surface-container-lowest');
    if (calSection) {
      const monthTitle = calSection.querySelector('h2.font-headline-sm, .font-headline-sm');
      const now = new Date();
      if (monthTitle) {
        monthTitle.innerText = `${getLocalMonthName(now)} ${now.getFullYear()}`;
      }

      const entryDates = new Set(entries.map(e => e.date));
      const currentDay = now.getDate();

      const dayButtons = calSection.querySelectorAll('.grid.grid-cols-7 button');
      dayButtons.forEach(btn => {
        const textNum = parseInt(btn.innerText.trim(), 10);
        if (isNaN(textNum)) return;
        const btnDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(textNum).padStart(2, '0')}`;

        if (textNum === currentDay) {
          btn.className = 'w-8 h-8 rounded-full bg-primary-container text-on-surface font-headline-sm text-headline-sm flex items-center justify-center shadow-[0_2px_8px_rgba(214,243,161,0.9)] scale-105';
        } else if (entryDates.has(btnDateStr)) {
          btn.className = 'w-8 h-8 rounded-full bg-primary-container/40 text-on-surface font-body-sm text-body-sm flex flex-col items-center justify-center relative hover:bg-primary-container/60';
          if (!btn.querySelector('span')) {
            btn.innerHTML = `${textNum}<span class="w-1 h-1 rounded-full bg-primary"></span>`;
          }
        } else {
          btn.className = 'w-8 h-8 rounded-full flex items-center justify-center font-body-sm text-body-sm text-on-surface hover:bg-surface-container';
        }

        btn.onclick = (e) => {
          e.preventDefault();
          this.selectedDailyDate = btnDateStr;
          this.navigate('journal');
        };
      });
    }

    applyFilters();
  }

  async hydrateWeeklyReview() {
    const { weekStart, weekEnd } = getCurrentWeek();

    // Wire back button
    const backBtn = this.appContainer.querySelector('button[aria-label="Go back"], header a[aria-label="Back"], .page-back-btn');
    if (backBtn) backBtn.onclick = () => this.handleBackNavigation('weekly-review');

    // Week selector display
    const weekLabel = this.appContainer.querySelector('.font-label-md.text-on-surface.font-semibold');
    if (weekLabel) {
      weekLabel.innerText = `${formatHeaderDate(weekStart)} – ${formatHeaderDate(weekEnd)}`;
    }

    // Real weekly metrics
    const habits = await HabitService.getAll(false, true);
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
    const backBtn = this.appContainer.querySelector('header a[aria-label="Back"], header button[aria-label="Back"], .page-back-btn');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        this.handleBackNavigation('goal-detail');
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
    const overallPct = goals.length > 0 ? Math.round(goals.reduce((s, g) => s + (g.currentProgress || 0), 0) / goals.length) : 0;

    // 1. Hero Card Overall Goal Completion Percentage
    const displayEl = this.appContainer.querySelector('.font-display-lg');
    if (displayEl) {
      displayEl.innerText = `${overallPct}%`;
    }

    // Visual Milestone Circular Progress SVG
    const progressCircle = this.appContainer.querySelector('circle.text-secondary');
    if (progressCircle) {
      const circ = 188.5;
      progressCircle.style.strokeDashoffset = `${circ * (1 - overallPct / 100)}`;
    }

    // 2. 3-Column Quick Metrics: Active Goals, Completed, On Pace
    const quickMetrics = this.appContainer.querySelectorAll('.grid.grid-cols-3 > div');
    if (quickMetrics.length >= 3) {
      const actEl = quickMetrics[0].querySelector('.font-headline-sm');
      if (actEl) actEl.innerText = `${active} Flight`;

      const compEl = quickMetrics[1].querySelector('.font-headline-sm');
      if (compEl) compEl.innerText = `${completed} Total`;

      const paceEl = quickMetrics[2].querySelector('.font-headline-sm');
      if (paceEl) paceEl.innerText = goals.length > 0 ? `${overallPct}%` : '0%';
    }

    // 3. Category Breakdown Card
    const catCard = this.appContainer.querySelector('.bg-surface-container-lowest.rounded-lg.p-5');
    if (catCard) {
      if (goals.length === 0) {
        const catRows = catCard.querySelectorAll('.space-y-space-sm, .space-y-3, .space-y-4, div:has(> .flex.items-center.justify-between)');
        const targetContainer = catRows[catRows.length - 1] || catCard;
        targetContainer.innerHTML = `
          <div class="py-8 px-4 text-center text-on-surface-variant flex flex-col items-center gap-2 border border-dashed border-outline-variant/40 rounded-2xl">
            <div class="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline mb-1">
              <span class="material-symbols-outlined text-[24px]">flag</span>
            </div>
            <h4 class="font-headline-sm text-on-surface font-semibold">No Goals Recorded Yet</h4>
            <p class="font-body-sm text-on-surface-variant max-w-xs">Define your first milestone to track progress and category metrics.</p>
            <button id="goal-stats-create-btn" class="mt-2 px-5 py-2.5 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold shadow-sm hover:bg-secondary-fixed active:scale-95 transition-all">
              Create Goal
            </button>
          </div>
        `;
        targetContainer.querySelector('#goal-stats-create-btn')?.addEventListener('click', () => this.navigate('goal-new'));
      } else {
        // Group by category and render genuine progress
        const catGroups = {};
        goals.forEach(g => {
          const cat = g.category || 'General';
          if (!catGroups[cat]) catGroups[cat] = { total: 0, sum: 0 };
          catGroups[cat].total += 1;
          catGroups[cat].sum += (g.currentProgress || 0);
        });

        const targetContainer = catCard.querySelector('.space-y-space-sm, .space-y-3, .space-y-4');
        if (targetContainer) {
          targetContainer.innerHTML = Object.entries(catGroups).map(([cat, val]) => {
            const avg = Math.round(val.sum / val.total);
            return `
              <div class="space-y-1.5">
                <div class="flex items-center justify-between font-label-md text-label-md">
                  <span class="text-on-surface font-semibold">${cat}</span>
                  <span class="text-secondary font-bold">${avg}%</span>
                </div>
                <div class="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                  <div class="h-full bg-secondary rounded-full transition-all duration-500" style="width: ${avg}%"></div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }

    // 4. Wire navigation buttons
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
    const backBtn = this.appContainer.querySelector('button[aria-label="Go Back"], a[aria-label="Go Back"], button[aria-label="Go back"], a[aria-label="Go back"], header a[aria-label="Back"], .page-back-btn');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        this.handleBackNavigation('transactions');
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
    const backBtn = this.appContainer.querySelector('header a[aria-label="Back"], button[aria-label="Go back"], .page-back-btn');
    if (backBtn) backBtn.onclick = () => this.handleBackNavigation('trading-accounts');

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
      const todayStr = getLocalDateString();
      const todayTrades = await db.trades.where('accountId').equals(account.id).filter(t => t.closeDate && t.closeDate.startsWith(todayStr)).toArray();
      const todayPL = todayTrades.reduce((s, t) => s + t.pnl, 0);
      const todayPct = account.currentBalance > 0 ? ((todayPL / account.currentBalance) * 100).toFixed(2) : '0.00';

      // Get week trades
      const { weekStart } = getCurrentWeek();
      const weekTrades = await db.trades.where('accountId').equals(account.id).filter(t => t.closeDate && t.closeDate.split(' ')[0] >= weekStart).toArray();
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
    const backBtn = this.appContainer.querySelector('button[aria-label="Go back"], header a[aria-label="Back"], .page-back-btn');
    if (backBtn) backBtn.onclick = () => this.handleBackNavigation('trade-history');

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

    const displayEl = this.appContainer.querySelector('.font-display-lg');
    const summaryEls = this.appContainer.querySelectorAll('.font-headline-sm.font-bold');

    if (!account) {
      if (displayEl) displayEl.innerText = '$0.00';
      summaryEls.forEach(el => {
        if (el.innerText === '14' || el.innerText.includes('trade')) el.innerText = '0';
        else if (el.innerText.includes('71') || el.innerText.includes('%')) el.innerText = '0%';
        else if (el.innerText.includes('3.84') || el.innerText.includes('PF')) el.innerText = '0.00';
      });

      const chartSection = this.appContainer.querySelector('section.bg-surface-container-lowest, div.bg-surface-container-lowest.rounded-lg');
      if (chartSection) {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'p-6 text-center text-on-surface-variant font-body-sm border border-dashed border-outline-variant/40 rounded-2xl my-4';
        emptyNotice.innerHTML = `
          <div class="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline mx-auto mb-2">
            <span class="material-symbols-outlined text-[24px]">candlestick_chart</span>
          </div>
          <h4 class="font-headline-sm text-on-surface font-semibold">No Trading Accounts Configured</h4>
          <p class="font-body-sm text-on-surface-variant mt-1 mb-4">Create a funded or evaluation account to begin tracking performance.</p>
          <button id="trading-stats-empty-add-btn" class="px-5 py-2.5 rounded-full bg-primary-container text-on-primary-fixed font-label-md font-bold shadow-sm hover:bg-secondary-fixed active:scale-95 transition-all">
            Add Account
          </button>
        `;
        chartSection.replaceWith(emptyNotice);
        emptyNotice.querySelector('#trading-stats-empty-add-btn')?.addEventListener('click', () => this.navigate('trading-account-new'));
      }
      return;
    }

    const stats = await TradingEngine.getAccountStatistics(account.id);
    if (!stats) return;

    // Update hero card net profit
    if (displayEl) {
      const netPL = stats.totalPL;
      displayEl.innerText = `${netPL >= 0 ? '+' : ''}$${netPL.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    // Update summary stats (total trades, win rate, profit factor)
    summaryEls.forEach(el => {
      if (el.innerText === '14') el.innerText = `${stats.totalTrades}`;
      else if (el.innerText.includes('71')) el.innerText = `${stats.winRate}%`;
      else if (el.innerText.includes('3.84') || el.innerText.includes('PF')) el.innerText = `${stats.profitFactor}`;
    });

    // Wire navigation
    const backBtn = this.appContainer.querySelector('button[aria-label="Go Back"], button[aria-label="Go back"], .page-back-btn');
    if (backBtn) backBtn.onclick = () => this.handleBackNavigation('trading-stats');

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
    const habits = await HabitService.getAll(false, true);
    const goals = await GoalService.getAll();
    const activeGoals = goals.filter(g => g.status === 'ACTIVE');
    const completedGoals = goals.filter(g => g.status === 'COMPLETED');
    const journals = await JournalService.getAll();

    // 1. Week Selector (using local date)
    const currentWeekOffset = this.progressWeekOffset || 0;
    const now = new Date();
    now.setDate(now.getDate() + (currentWeekOffset * 7));
    const currentWeek = getCurrentWeek(now);
    const { weekStart, weekEnd, days } = currentWeek;

    const weekLabel = this.appContainer.querySelector('.flex.items-center.gap-1\\.5.cursor-pointer .font-label-md') ||
      Array.from(this.appContainer.querySelectorAll('span')).find(s => s.innerText.includes('Oct 21') || (s.innerText.includes('–') && s.innerText.includes('202')));
    if (weekLabel) {
      weekLabel.innerText = `${formatHeaderDate(weekStart)} – ${formatHeaderDate(weekEnd)}`;
    }

    const prevWeekBtn = this.appContainer.querySelector('button[aria-label="Previous week"]');
    if (prevWeekBtn) {
      prevWeekBtn.onclick = (e) => {
        e.preventDefault();
        this.progressWeekOffset = (this.progressWeekOffset || 0) - 1;
        this.hydrateProgress();
      };
    }
    const nextWeekBtn = this.appContainer.querySelector('button[aria-label="Next week"]');
    if (nextWeekBtn) {
      nextWeekBtn.onclick = (e) => {
        e.preventDefault();
        this.progressWeekOffset = (this.progressWeekOffset || 0) + 1;
        this.hydrateProgress();
      };
    }

    // 2. Weekly Flow 7-day Bar Chart
    const barGrid = this.appContainer.querySelector('.grid.grid-cols-7');
    let totalWeekCompletions = 0;
    let totalWeekTargets = 0;

    const weekDayStats = [];
    for (const d of days) {
      const stats = await HabitService.getDailyCompletionStats(d.dateStr, habits);
      weekDayStats.push({ ...d, stats });
      totalWeekCompletions += stats.completed;
      totalWeekTargets += stats.total;
    }

    if (barGrid) {
      const dayBars = barGrid.children;
      if (dayBars.length === 7) {
        weekDayStats.forEach((d, idx) => {
          const col = dayBars[idx];
          if (!col) return;
          const pct = d.stats.percentage;
          const isCurrDay = isToday(d.dateStr);

          const pctLabel = col.querySelector('span.font-label-sm');
          if (pctLabel) {
            pctLabel.innerText = isCurrDay ? 'Today' : `${pct}%`;
          }

          const barInner = col.querySelector('.rounded-full.transition-all, .w-full.rounded-full > div');
          if (barInner) {
            barInner.style.height = `${Math.max(4, pct)}%`;
            if (pct >= 100) {
              barInner.className = 'w-full bg-secondary rounded-full transition-all duration-500';
            } else if (pct > 0) {
              barInner.className = 'w-full bg-secondary-fixed-dim rounded-full transition-all duration-500';
            } else {
              barInner.className = isCurrDay ? 'w-full bg-primary/40 rounded-full transition-all duration-500' : 'w-full bg-surface-container rounded-full transition-all duration-500';
            }
          }

          const weekdayLetter = col.querySelector('span.font-label-md');
          if (weekdayLetter) {
            weekdayLetter.className = isCurrDay
              ? 'font-label-md text-label-md text-secondary font-bold'
              : 'font-label-md text-label-md text-on-surface font-semibold';
          }
        });
      }
    }

    // 3. Weekly Momentum Hero Card
    const weeklyPct = totalWeekTargets > 0 ? Math.round((totalWeekCompletions / totalWeekTargets) * 100) : 0;
    const pctEl = this.appContainer.querySelector('.font-display-lg');
    if (pctEl) pctEl.innerText = `${weeklyPct}%`;

    const momentumCircle = this.appContainer.querySelector('circle[stroke-dasharray="188.4"]');
    if (momentumCircle) {
      const circ = 188.4;
      momentumCircle.style.strokeDashoffset = `${circ * (1 - weeklyPct / 100)}`;
    }

    // 4. 3-Column Micro Stats
    let bestHabitStreak = 0;
    for (const h of habits) {
      const s = await HabitService.getStreaks(h.id);
      if (s.currentStreak > bestHabitStreak) bestHabitStreak = s.currentStreak;
    }
    const weekJournals = journals.filter(j => j.date >= weekStart && j.date <= weekEnd).length;

    const microStats = this.appContainer.querySelectorAll('.grid.grid-cols-3 > div');
    if (microStats.length >= 3) {
      const streakEl = microStats[0].querySelector('.font-headline-sm');
      if (streakEl) streakEl.innerHTML = `${bestHabitStreak} Days 🔥`;

      const goalsEl = microStats[1].querySelector('.font-headline-sm');
      if (goalsEl) goalsEl.innerHTML = `${completedGoals.length} Done`;

      const journalEl = microStats[2].querySelector('.font-headline-sm');
      if (journalEl) journalEl.innerHTML = `${weekJournals} / 7`;
    }

    // 5. Breakdown & Stats Cards
    const breakdownCards = this.appContainer.querySelectorAll('main a.flex.flex-col.bg-surface-container-lowest');
    breakdownCards.forEach(card => {
      const text = card.innerText || '';
      if (text.includes('Habit Statistics')) {
        const sub = card.querySelector('p.font-body-sm');
        if (sub) sub.innerText = `${habits.length} active habits • ${bestHabitStreak}-day streak`;
        const consistencyText = card.querySelector('.font-label-sm.font-medium');
        if (consistencyText) consistencyText.innerText = `${weeklyPct}% consistency`;
        const bar = card.querySelector('.h-full.bg-secondary');
        if (bar) bar.style.width = `${weeklyPct}%`;

        card.onclick = (e) => {
          e.preventDefault();
          this.navigate('habit-stats');
        };
      } else if (text.includes('Goal Statistics')) {
        const sub = card.querySelector('p.font-body-sm');
        if (sub) sub.innerText = `${activeGoals.length} active • ${completedGoals.length} completed`;
        card.onclick = (e) => {
          e.preventDefault();
          this.navigate('goal-stats');
        };
      } else if (text.includes('Personal Growth') || text.includes('Personal Statistics')) {
        const sub = card.querySelector('p.font-body-sm');
        const journalCount = journals.filter(j => j.status === 'completed').length;
        if (sub) sub.innerText = `${journalCount} total days logged • Level ${Math.min(10, Math.floor(journalCount / 7) + 1)}`;
        card.onclick = (e) => {
          e.preventDefault();
          this.navigate('personal-stats');
        };
        const detailsBtn = card.querySelector('.font-label-sm.font-bold');
        if (detailsBtn) {
          detailsBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.navigate('personal-stats');
          };
        }
      }
    });

    // 6. Weekly Review Action Banner
    const weeklyReviewBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b =>
      b.innerText.includes('Start Weekly Review') || b.innerText.includes('Weekly Review')
    );
    if (weeklyReviewBtn) {
      weeklyReviewBtn.onclick = (e) => {
        e.preventDefault();
        this.navigate('weekly-review');
      };
    }
  }

  async hydrateHabitStats() {
    const habits = await HabitService.getAll(false, true);
    const todayStr = getLocalDateString();
    const dailyStats = await HabitService.getDailyCompletionStats(todayStr, habits);

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
    const habits = await HabitService.getAll(false, true);
    const goals = await GoalService.getAll();
    const journals = await JournalService.getAll();
    const journalCount = journals.filter(j => j.status === 'completed').length;
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
    const backBtn = this.appContainer.querySelector('button[aria-label="Go back"], .page-back-btn');
    if (backBtn) backBtn.onclick = () => this.handleBackNavigation('achievements');
  }

  openAppearanceModal() {
    this.showModal({
      title: 'Appearance Theme',
      bodyHtml: `
        <div class="flex flex-col gap-3 py-2">
          <p class="font-body-sm text-on-surface-variant">Choose your preferred visual mode for GLOW UP.</p>
          <div class="grid grid-cols-3 gap-2.5">
            <button class="theme-choice-btn p-3 rounded-xl border border-outline-variant/30 flex flex-col items-center gap-1.5 hover:bg-surface-container active:scale-95 transition-all" data-theme="light">
              <span class="material-symbols-outlined text-[26px] text-secondary">light_mode</span>
              <span class="font-label-md font-semibold text-on-surface">Light</span>
            </button>
            <button class="theme-choice-btn p-3 rounded-xl border border-outline-variant/30 flex flex-col items-center gap-1.5 hover:bg-surface-container active:scale-95 transition-all" data-theme="dark">
              <span class="material-symbols-outlined text-[26px] text-primary">dark_mode</span>
              <span class="font-label-md font-semibold text-on-surface">Dark</span>
            </button>
            <button class="theme-choice-btn p-3 rounded-xl border border-outline-variant/30 flex flex-col items-center gap-1.5 hover:bg-surface-container active:scale-95 transition-all" data-theme="system">
              <span class="material-symbols-outlined text-[26px] text-outline">settings_suggest</span>
              <span class="font-label-md font-semibold text-on-surface">System</span>
            </button>
          </div>
        </div>
      `,
      confirmText: 'Done',
      onConfirm: () => true
    });

    const modal = document.getElementById('glow-modal');
    if (modal) {
      modal.querySelectorAll('.theme-choice-btn').forEach(btn => {
        btn.onclick = async () => {
          const mode = btn.getAttribute('data-theme');
          await ThemeManager.setTheme(mode);
          this.showToast(`${mode.charAt(0).toUpperCase() + mode.slice(1)} theme applied!`);
          const label = document.getElementById('appearance-current-label');
          if (label) label.innerText = `${mode} theme`;
          modal.remove();
        };
      });
    }
  }

  async hydrateSettingsDashboard() {
    const currentUser = AuthService.getCurrentUser();
    const profile = await UserService.getProfile();
    const habits = await HabitService.getAll(false, false);
    let bestStreak = 0;
    for (const h of habits) {
      const s = await HabitService.getStreaks(h.id);
      if (s.currentStreak > bestStreak) bestStreak = s.currentStreak;
    }

    const userName = profile?.name || currentUser?.user_metadata?.name || 'Account';
    const userEmail = profile?.email || currentUser?.email || '';

    // Update Profile Header Card
    const nameEl = this.appContainer.querySelector('h2.font-headline-sm.text-headline-sm.text-on-surface.truncate');
    if (nameEl) nameEl.innerText = userName;

    const subEl = this.appContainer.querySelector('p.font-body-sm.text-body-sm.text-on-surface-variant.truncate');
    if (subEl) subEl.innerText = userEmail ? `${userEmail} • Active Member` : 'Personal Growth & Capital Discipline';

    const avatarInitial = this.appContainer.querySelector('.relative.w-14.h-14 span.font-headline-sm');
    if (avatarInitial) {
      const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'GU';
      avatarInitial.innerText = initials;
    }

    const streakText = Array.from(this.appContainer.querySelectorAll('.font-body-sm')).find(s => s.innerText.includes('Streak:'));
    if (streakText) {
      streakText.innerText = `Streak: ${bestStreak} Days Alive`;
    }

    // View Profile Pill
    const viewProfileBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('View Profile'));
    if (viewProfileBtn) viewProfileBtn.onclick = () => this.navigate('profile');

    // Cloud Backup Toggle
    const backupToggle = this.appContainer.querySelector('#toggle-backup');
    let autoCloudBackup = await PreferenceService.get('cloud_auto_backup', true);
    const updateBackupUI = () => {
      if (!backupToggle) return;
      const thumb = backupToggle.querySelector('#toggle-thumb');
      if (autoCloudBackup) {
        backupToggle.className = 'w-12 h-7 bg-primary-container rounded-full p-0.5 flex items-center transition-colors focus:outline-none flex-shrink-0';
        if (thumb) thumb.className = 'w-6 h-6 rounded-full bg-primary shadow-sm transform translate-x-5 transition-transform';
      } else {
        backupToggle.className = 'w-12 h-7 bg-surface-container-highest rounded-full p-0.5 flex items-center transition-colors focus:outline-none flex-shrink-0';
        if (thumb) thumb.className = 'w-6 h-6 rounded-full bg-surface-container-lowest shadow-sm transform translate-x-0 transition-transform';
      }
    };
    updateBackupUI();

    if (backupToggle) {
      backupToggle.onclick = async (e) => {
        e.preventDefault();
        autoCloudBackup = !autoCloudBackup;
        updateBackupUI();
        await PreferenceService.set('cloud_auto_backup', autoCloudBackup);
        this.showToast(autoCloudBackup ? 'Cloud auto-backup enabled' : 'Cloud auto-backup disabled');
      };
    }

    // Ensure Appearance option is present in settings menu
    const accountList = this.appContainer.querySelector('section .w-full.bg-surface-container-lowest.rounded-lg.shadow-sm');
    if (accountList && !this.appContainer.querySelector('#menu-appearance-btn')) {
      const appearanceBtn = document.createElement('button');
      appearanceBtn.id = 'menu-appearance-btn';
      appearanceBtn.className = 'w-full min-h-[54px] px-margin py-space-sm flex items-center justify-between text-left hover:bg-surface-container-low active:scale-[0.99] transition-all border-t border-surface-container';
      const curTheme = await ThemeManager.getTheme();
      appearanceBtn.innerHTML = `
        <div class="flex items-center gap-space-md min-w-0 pr-2">
          <div class="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant flex-shrink-0">
            <span class="material-symbols-outlined text-[20px]">palette</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-label-md text-label-md text-on-surface truncate">Appearance</span>
            <span class="font-body-sm text-body-sm text-on-surface-variant truncate capitalize" id="appearance-current-label">${curTheme} theme</span>
          </div>
        </div>
        <span class="material-symbols-outlined text-outline text-[20px] flex-shrink-0">chevron_right</span>
      `;
      appearanceBtn.onclick = (e) => {
        e.preventDefault();
        this.openAppearanceModal();
      };
      accountList.appendChild(appearanceBtn);
    }

    // Wire Navigation Items
    this.appContainer.querySelectorAll('button, a').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Profile')) btn.onclick = () => this.navigate('profile');
      else if (text.includes('Notifications')) btn.onclick = () => this.navigate('notifications');
      else if (text.includes('Security')) btn.onclick = () => this.navigate('security');
      else if (text.includes('Data Management')) btn.onclick = () => this.navigate('data-management');
      else if (text.includes('Restore')) btn.onclick = () => this.navigate('restore');
      else if (text.includes('Reset Data')) btn.onclick = () => this.navigate('reset-data');
      else if (text.includes('Trading Dashboard')) btn.onclick = () => this.navigate('trading');
      else if (text.includes('Log Out') || text.includes('Sign Out')) {
        btn.onclick = async (e) => {
          e.preventDefault();
          await AuthService.signOut();
          setActiveUserId('default_user');
          this.showToast('Signed out successfully');
          this.navigate('welcome');
        };
      }
    });
  }

  async hydrateProfile() {
    const currentUser = AuthService.getCurrentUser();
    let profile = await UserService.getProfile();
    const habits = await HabitService.getAll(false, false);
    let bestStreak = 0;
    for (const h of habits) {
      const s = await HabitService.getStreaks(h.id);
      if (s.currentStreak > bestStreak) bestStreak = s.currentStreak;
    }

    // Avatar image
    const avatarImg = this.appContainer.querySelector('section img[src*="hero_illustration"], section img[data-alt*="portrait"]');
    if (avatarImg && profile?.avatarUrl) {
      avatarImg.src = profile.avatarUrl;
    }

    // Change Photo button
    const changePhotoBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Change Photo'));
    let pendingAvatarUrl = profile?.avatarUrl || '';
    if (changePhotoBtn) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      changePhotoBtn.onclick = (e) => {
        e.preventDefault();
        fileInput.click();
      };

      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (loadEvt) => {
            pendingAvatarUrl = loadEvt.target.result;
            if (avatarImg) avatarImg.src = pendingAvatarUrl;
            this.showToast('Profile photo selected! Tap Save Changes to persist.');
          };
          reader.readAsDataURL(file);
        }
      };
    }

    // Update Streak / Level card
    const streakEl = Array.from(this.appContainer.querySelectorAll('p')).find(p => p.innerText.includes('Streak') && p.classList.contains('font-headline-sm'));
    if (streakEl) {
      streakEl.innerText = `${bestStreak} Day Streak`;
    }

    // Inputs
    const allInputs = Array.from(this.appContainer.querySelectorAll('input'));
    const nameInput = allInputs.find(i => i.value === 'Alex Lawson' || i.previousElementSibling?.innerText?.includes('Full Name'));
    const usernameInput = allInputs.find(i => i.value === '@alexlawson' || i.previousElementSibling?.innerText?.includes('Username'));
    const emailInput = allInputs.find(i => i.type === 'email' || i.previousElementSibling?.innerText?.includes('Email'));
    const dobInput = allInputs.find(i => i.value.includes('1996') || i.previousElementSibling?.innerText?.includes('Birth'));
    const intentionTextarea = this.appContainer.querySelector('textarea');

    if (nameInput) nameInput.value = profile?.name !== undefined ? profile.name : (currentUser?.user_metadata?.name || '');
    if (usernameInput) usernameInput.value = profile?.username !== undefined ? profile.username : (currentUser?.user_metadata?.username || '');
    if (emailInput) emailInput.value = profile?.email !== undefined ? profile.email : (currentUser?.email || '');
    if (dobInput) dobInput.value = profile?.dob !== undefined ? profile.dob : (currentUser?.user_metadata?.dob || '');
    if (intentionTextarea) intentionTextarea.value = profile?.intention !== undefined ? profile.intention : (currentUser?.user_metadata?.intention || '');

    // Focus Chips
    let selectedFocus = profile?.primaryFocus || currentUser?.user_metadata?.primaryFocus || 'Personal';
    const focusChips = this.appContainer.querySelectorAll('.focus-chip');
    const updateFocusChips = () => {
      focusChips.forEach(chip => {
        const val = chip.getAttribute('data-val');
        if (val === selectedFocus) {
          chip.className = 'focus-chip active-chip px-3.5 py-2 rounded-full font-label-md text-label-md font-semibold bg-secondary-container text-on-secondary-container transition-all active:scale-95 shadow-sm';
        } else {
          chip.className = 'focus-chip px-3.5 py-2 rounded-full font-label-md text-label-md font-semibold bg-surface-container text-on-surface-variant transition-all active:scale-95';
        }
      });
    };
    updateFocusChips();

    focusChips.forEach(chip => {
      chip.onclick = (e) => {
        e.preventDefault();
        selectedFocus = chip.getAttribute('data-val') || 'Personal';
        updateFocusChips();
      };
    });

    // Daily Affirmation Ping toggle
    const toggleAffirmation = this.appContainer.querySelector('#toggleAffirmation');
    let isAffirmationActive = await PreferenceService.get('daily_affirmation_ping', true);
    const updateAffirmationUI = () => {
      if (!toggleAffirmation) return;
      if (isAffirmationActive) {
        toggleAffirmation.className = 'w-12 h-7 rounded-full bg-primary-container p-1 flex items-center justify-end transition-colors';
        toggleAffirmation.innerHTML = '<span class="w-5 h-5 rounded-full bg-primary shadow-sm block"></span>';
      } else {
        toggleAffirmation.className = 'w-12 h-7 rounded-full bg-surface-container-highest p-1 flex items-center justify-start transition-colors';
        toggleAffirmation.innerHTML = '<span class="w-5 h-5 rounded-full bg-surface-container-lowest shadow-sm block"></span>';
      }
    };
    updateAffirmationUI();

    if (toggleAffirmation) {
      toggleAffirmation.onclick = async (e) => {
        e.preventDefault();
        isAffirmationActive = !isAffirmationActive;
        updateAffirmationUI();
        await PreferenceService.set('daily_affirmation_ping', isAffirmationActive);
        this.showToast(isAffirmationActive ? 'Affirmation ping enabled' : 'Affirmation ping disabled');
      };
    }

    // Save button
    const saveBtn = this.appContainer.querySelector('#saveButton') ||
      Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.includes('Save Changes'));
    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        const updatedData = {
          name: nameInput?.value?.trim() || '',
          username: usernameInput?.value?.trim() || '',
          email: emailInput?.value?.trim() || '',
          dob: dobInput?.value?.trim() || '',
          intention: intentionTextarea?.value?.trim() || '',
          primaryFocus: selectedFocus,
          avatarUrl: pendingAvatarUrl
        };

        await UserService.saveProfile(updatedData);
        await AuthService.updateProfile(updatedData);
        this.showToast('Profile saved successfully!');
      };
    }

    // Cancel button
    const cancelBtn = Array.from(this.appContainer.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel');
    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        this.hydrateProfile();
        this.showToast('Unsaved changes discarded');
      };
    }
  }

  async hydrateNotifications() {
    const prefs = await PreferenceService.getAll();

    // Map notification switches to their specific keys
    const switches = this.appContainer.querySelectorAll('button[role="switch"], .toggle-btn');
    switches.forEach(sw => {
      const row = sw.closest('div.flex.items-center.justify-between');
      const label = row?.querySelector('h2')?.innerText?.trim() || 'notification';
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');

      // Default true for reminders, false for transaction recap
      let isEnabled = prefs[key];
      if (isEnabled === undefined) {
        isEnabled = !label.toLowerCase().includes('transaction');
      }

      const updateSwitchUI = (enabled) => {
        sw.setAttribute('aria-checked', enabled ? 'true' : 'false');
        if (enabled) {
          sw.className = 'toggle-btn w-[52px] h-[30px] rounded-full p-1 bg-primary-container flex items-center justify-end shrink-0 transition-colors duration-200';
          const knob = sw.querySelector('span');
          if (knob) knob.className = 'w-[22px] h-[22px] rounded-full bg-on-primary-container shadow-sm transform transition-transform duration-200';
        } else {
          sw.className = 'toggle-btn w-[52px] h-[30px] rounded-full p-1 bg-surface-container-highest flex items-center justify-start shrink-0 transition-colors duration-200';
          const knob = sw.querySelector('span');
          if (knob) knob.className = 'w-[22px] h-[22px] rounded-full bg-surface-container-lowest shadow-sm transform transition-transform duration-200';
        }
      };
      updateSwitchUI(isEnabled);

      sw.onclick = async (e) => {
        e.preventDefault();
        const nextState = !(sw.getAttribute('aria-checked') === 'true');

        if (nextState && typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
              this.showToast('Notifications disabled in browser permissions.');
              updateSwitchUI(false);
              await PreferenceService.set(key, false);
              return;
            }
          } else if (Notification.permission === 'denied') {
            this.showToast('Browser notifications blocked in site permissions.');
            updateSwitchUI(false);
            await PreferenceService.set(key, false);
            return;
          }
        }

        updateSwitchUI(nextState);
        await PreferenceService.set(key, nextState);
        this.showToast(nextState ? `${label} enabled` : `${label} disabled`);
      };
    });

    // Save Preferences button
    const saveBtn = this.appContainer.querySelector('#save-btn');
    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        this.showToast('Notification preferences saved!');

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('GLOW UP Reminders Active', {
              body: 'Your daily momentum reminders are configured and active.',
              icon: '/assets/hero_illustration.png'
            });
          } catch (notifErr) {
            // ignore
          }
        }
      };
    }
  }

  async hydrateSecurity() {
    // 1. Check WebAuthn platform authenticator capability
    const biometricToggle = this.appContainer.querySelector('#biometric-toggle');
    const biometricKnob = this.appContainer.querySelector('#biometric-knob');
    const biometricSubtext = biometricToggle?.closest('.flex.items-center.justify-between')?.querySelector('.font-body-sm');

    let webAuthnAvailable = false;
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      try {
        webAuthnAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch {
        webAuthnAvailable = false;
      }
    }

    let biometricEnabled = await PreferenceService.get('biometric_lock', false);
    const updateBiometricUI = (enabled) => {
      if (!biometricToggle) return;
      if (!webAuthnAvailable) {
        biometricToggle.setAttribute('aria-checked', 'false');
        biometricToggle.className = 'w-13 h-7 px-0.5 rounded-full bg-surface-container-highest flex items-center opacity-60 cursor-not-allowed';
        if (biometricKnob) biometricKnob.className = 'w-6 h-6 rounded-full bg-surface-container-lowest shadow-sm translate-x-0 transition-transform flex items-center justify-center';
        if (biometricSubtext) biometricSubtext.innerText = 'Platform authenticator unavailable on this device/browser';
        return;
      }

      biometricToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
      if (enabled) {
        biometricToggle.className = 'w-13 h-7 px-0.5 rounded-full bg-primary flex items-center transition-colors';
        if (biometricKnob) biometricKnob.className = 'w-6 h-6 rounded-full bg-surface-container-lowest shadow-sm translate-x-6 transition-transform flex items-center justify-center';
      } else {
        biometricToggle.className = 'w-13 h-7 px-0.5 rounded-full bg-surface-container-highest flex items-center transition-colors';
        if (biometricKnob) biometricKnob.className = 'w-6 h-6 rounded-full bg-surface-container-lowest shadow-sm translate-x-0 transition-transform flex items-center justify-center';
      }
    };
    updateBiometricUI(biometricEnabled);

    if (biometricToggle) {
      biometricToggle.onclick = async (e) => {
        e.preventDefault();
        if (!webAuthnAvailable) {
          this.showToast('WebAuthn biometrics unsupported on this browser/platform');
          return;
        }
        biometricEnabled = !biometricEnabled;
        updateBiometricUI(biometricEnabled);
        await PreferenceService.set('biometric_lock', biometricEnabled);
        this.showToast(biometricEnabled ? 'Biometric authentication enabled' : 'Biometric authentication disabled');
      };
    }

    // 2. App Lock Toggle
    const applockToggle = this.appContainer.querySelector('#applock-toggle');
    const applockKnob = this.appContainer.querySelector('#applock-knob');
    let appLockEnabled = await PreferenceService.get('app_lock_enabled', false);

    const updateAppLockUI = (enabled) => {
      if (!applockToggle) return;
      applockToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
      if (enabled) {
        applockToggle.className = 'w-13 h-7 px-0.5 rounded-full bg-primary flex items-center transition-colors';
        if (applockKnob) applockKnob.className = 'w-6 h-6 rounded-full bg-surface-container-lowest shadow-sm translate-x-6 transition-transform flex items-center justify-center';
      } else {
        applockToggle.className = 'w-13 h-7 px-0.5 rounded-full bg-surface-container-highest flex items-center transition-colors';
        if (applockKnob) applockKnob.className = 'w-6 h-6 rounded-full bg-surface-container-lowest shadow-sm translate-x-0 transition-transform flex items-center justify-center';
      }
    };
    updateAppLockUI(appLockEnabled);

    if (applockToggle) {
      applockToggle.onclick = async (e) => {
        e.preventDefault();
        appLockEnabled = !appLockEnabled;
        updateAppLockUI(appLockEnabled);
        await PreferenceService.set('app_lock_enabled', appLockEnabled);
        this.showToast(appLockEnabled ? 'App lock enabled' : 'App lock disabled');
      };
    }

    // 3. Auto-Lock Duration Pills
    let selectedDuration = await PreferenceService.get('auto_lock_duration', 'Immediately');
    const durationLabel = this.appContainer.querySelector('#selected-duration-label');
    const durationPills = this.appContainer.querySelectorAll('.duration-pill');

    const updateDurationUI = () => {
      if (durationLabel) {
        durationLabel.innerText = selectedDuration === 'Immediately' ? 'Immediately' : `After ${selectedDuration}`;
      }
      durationPills.forEach(pill => {
        const val = pill.getAttribute('data-val');
        if (val === selectedDuration) {
          pill.className = 'duration-pill py-2 rounded-xl font-label-sm text-label-sm font-semibold bg-primary-container text-on-primary-container shadow-sm transition-all text-center';
        } else {
          pill.className = 'duration-pill py-2 rounded-xl font-label-sm text-label-sm text-on-surface-variant transition-all text-center';
        }
      });
    };
    updateDurationUI();

    durationPills.forEach(pill => {
      pill.onclick = async (e) => {
        e.preventDefault();
        selectedDuration = pill.getAttribute('data-val') || 'Immediately';
        updateDurationUI();
        await PreferenceService.set('auto_lock_duration', selectedDuration);
        this.showToast(`Auto-lock set to ${selectedDuration}`);
      };
    });

    // 4. Remove fake devices and show genuine active session info
    const macbookSession = this.appContainer.querySelector('#session-macbook');
    if (macbookSession) {
      macbookSession.remove();
    }

    const deviceTitle = this.appContainer.querySelector('.font-label-md.text-on-surface.font-semibold.truncate');
    if (deviceTitle && typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      let devName = 'Current Browser';
      if (/iPhone/i.test(ua)) devName = 'Apple iPhone';
      else if (/iPad/i.test(ua)) devName = 'Apple iPad';
      else if (/Android/i.test(ua)) devName = 'Android Device';
      else if (/Macintosh/i.test(ua)) devName = 'Mac Desktop';
      else if (/Windows/i.test(ua)) devName = 'Windows PC';
      else if (/Linux/i.test(ua)) devName = 'Linux Device';
      deviceTitle.innerText = devName;
    }

    const deviceLocation = this.appContainer.querySelector('.font-body-sm.text-on-surface-variant.mt-0\\.5');
    if (deviceLocation && deviceLocation.innerText.includes('San Francisco')) {
      deviceLocation.innerText = 'Current Device Session';
    }

    const sessionCountBadge = Array.from(this.appContainer.querySelectorAll('span')).find(s => s.innerText.includes('Connected'));
    if (sessionCountBadge) {
      sessionCountBadge.innerText = '1 Connected';
    }

    // 5. Sign Out Buttons
    this.appContainer.querySelectorAll('button').forEach(btn => {
      const text = btn.innerText?.trim() || '';
      if (text.includes('Sign Out') || text.includes('Log Out')) {
        btn.onclick = async (e) => {
          e.preventDefault();
          await AuthService.signOut();
          setActiveUserId('default_user');
          this.showToast('Signed out successfully');
          this.navigate('welcome');
        };
      }
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
