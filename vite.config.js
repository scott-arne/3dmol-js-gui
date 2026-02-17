import { defineConfig } from 'vite';
import peggy from 'vite-plugin-peggy-loader';

export default defineConfig({
  base: './',
  plugins: [peggy()],
  test: {
    globals: true,
    environment: 'happy-dom',
  },
});
