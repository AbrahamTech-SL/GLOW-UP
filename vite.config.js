import { defineConfig } from 'vite';

export default defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    port: 5173,
    host: true,
    open: false
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('dexie')) {
            return 'vendor-dexie';
          }
          if (id.includes('trading/engine')) {
            return 'module-trading';
          }
          if (id.includes('screensData')) {
            return 'module-screens';
          }
        }
      }
    }
  }
});
