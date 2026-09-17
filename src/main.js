import {
  db,
  seedInitialData,
  HabitService
} from './db/index.js';
import { AppRouter } from './router/index.js';
import { AuthService } from './auth/index.js';


console.log('Initializing GLOW UP App...');

async function initApp() {
  try {
    // 1. Initialize IndexedDB and seed initial catalog if first time
    await seedInitialData();

    // 2. Await auth session recovery to restore active user before routing
    await AuthService.isReady();

    // 3. Purge legacy demo/test data for default_user only (never wipe authenticated user data)
    const legacyAlex = await db.users.where('email').equals('alex@glowup.io').first();
    if (legacyAlex) {
      await db.users.delete(legacyAlex.id);
    }
    const demoHabit = await db.habits.where('name').equals('Morning meditation & breathwork').first();
    if (demoHabit) {
      await db.habits.where('name').equals('Morning meditation & breathwork').delete();
    }
    // 3.5. ONE-TIME goal migration: clean legacy goals only on first app start
    // Use a localStorage flag so this runs exactly once ever, not on every restart.
    const migrationKey = 'glow_up_goals_migration_v1';
    const migrationDone = window.localStorage.getItem(migrationKey);
    let curUser = AuthService.getCurrentUser();
    const cleanupUid = curUser?.id || 'default_user';
    if (!migrationDone) {
      // First run only: remove any existing goals/goal-milestones so the app starts clean.
      // After this first run the flag is set and subsequent starts preserve user-created goals.
      await db.goals.filter(item => matchesActiveUser(item, cleanupUid)).delete();
      await db.goalMilestones.filter(item => matchesActiveUser(item, cleanupUid)).delete();
      window.localStorage.setItem(migrationKey, '1');
    }

    if (curUser?.id) {
      // Ensure the 16 default habits exist for the authenticated user (unchecked)
      await HabitService.getAll(false, true);
    }

    // 4. Initialize and start SPA router
    const router = new AppRouter();
    if (typeof window !== 'undefined') {
      window.router = router;
    }
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
