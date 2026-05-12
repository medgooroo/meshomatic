import { defineConfig } from 'vite';

// served from https://medgooroo.github.io/meshomatic/ on GitHub Pages,
// so prod asset paths need that prefix. Override with BASE_PATH if forking.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/meshomatic/') : '/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  server: {
    open: '/',
  },
}));
