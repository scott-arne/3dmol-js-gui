import { defineConfig } from 'vite';
import peggy from 'vite-plugin-peggy-loader';

export default defineConfig({
  plugins: [peggy()],
  test: {
    globals: true,
  },
});
