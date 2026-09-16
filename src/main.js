import {
  db,
  seedInitialData,
  cleanResetUserData,
  HabitService,
  JournalService,
  GoalService,
  MoneyService
} from './db/index.js';
import { AppRouter } from './router/index.js';
import { AuthService } from './auth/index.js';

if (typeof window !== 'undefined') {
  window.AuthService = AuthService;
  window.db = db;
  window.HabitService = HabitService;
  window.JournalService = JournalService;
  window.GoalService = GoalService;
  window.MoneyService = MoneyService;
}

console.log('Initializing GLOW UP App...');

async function initApp() {
  try {
    // 1. Initialize IndexedDB and seed initial catalog if first time
    await seedInitialData();

    // 2. Await auth session recovery to restore active user before routing
    await AuthService.isReady();

    // 3. Purge legacy demo/test data if detected
    const legacyAlex = await db.users.where('email').equals('alex@glowup.io').first();
    const demoHabit = await db.habits.where('name').equals('Morning meditation & breathwork').first();
    if (legacyAlex || demoHabit) {
      if (legacyAlex) await db.users.delete(legacyAlex.id);
      await cleanResetUserData('default_user');
      const curUser = AuthService.getCurrentUser();
      if (curUser?.id) {
        await cleanResetUserData(curUser.id);
      }
    }

    // 4. Initialize and start SPA router
    const router = new AppRouter();
    router.start();

    console.log('GLOW UP App ready and mounted.');
  } catch (error) {
    console.error('Failed to initialize GLOW UP app:', error);
  }
}

// Start app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
