import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', '../../packages/**/*.test.ts'],
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 4173,
    strictPort: true,
  },
});
