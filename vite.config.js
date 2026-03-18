import { defineConfig } from 'vite';
import peggy from 'vite-plugin-peggy-loader';

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [peggy()],
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      include: ['src/**/*.js'],
      exclude: ['src/main.js'],
    },
  },
});
