import { seedInitialData } from './db/index.js';
import { AppRouter } from './router/index.js';
import { AuthService } from './auth/index.js';

console.log('Initializing GLOW UP App...');

async function initApp() {
  try {
    // 1. Initialize IndexedDB and seed initial data if first time
    await seedInitialData();

    // 2. Await auth session recovery to restore active user before routing
    await AuthService.isReady();

    // 3. Initialize and start SPA router
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
