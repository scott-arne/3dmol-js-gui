import { describe, it, expect } from 'vitest';
import config from '../vite.config.js';

describe('static build contract', () => {
  it('uses relative asset paths for static hosting and notebook embedding', () => {
    expect(config.base).toBe('./');
  });

  it('builds a single JavaScript entry bundle for CNotebook asset copying', () => {
    expect(config.build.rollupOptions.input).toBe('src/main.js');
    expect(config.build.rollupOptions.output.inlineDynamicImports).toBe(true);
  });

  it('keeps src/main.js excluded from coverage because it is a browser bootstrap', () => {
    expect(config.test.coverage.exclude).toContain('src/main.js');
  });
});
