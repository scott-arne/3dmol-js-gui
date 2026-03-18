import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectThemeFromParent, detectThemeFromMedia, resolveTheme } from '../src/theme-detect.js';

describe('detectThemeFromParent', () => {
  let originalParent;

  beforeEach(() => {
    originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  });

  afterEach(() => {
    if (originalParent) {
      Object.defineProperty(window, 'parent', originalParent);
    }
  });

  it('returns "dark" for vscode-dark', () => {
    const parentWin = {
      document: { body: { dataset: { vscodeThemeKind: 'vscode-dark' } } },
    };
    parentWin.parent = parentWin;
    Object.defineProperty(window, 'parent', { value: parentWin, writable: true, configurable: true });

    expect(detectThemeFromParent()).toBe('dark');
  });

  it('returns "light" for vscode-light', () => {
    const parentWin = {
      document: { body: { dataset: { vscodeThemeKind: 'vscode-light' } } },
    };
    parentWin.parent = parentWin;
    Object.defineProperty(window, 'parent', { value: parentWin, writable: true, configurable: true });

    expect(detectThemeFromParent()).toBe('light');
  });

  it('returns "dark" for vscode-high-contrast', () => {
    const parentWin = {
      document: { body: { dataset: { vscodeThemeKind: 'vscode-high-contrast' } } },
    };
    parentWin.parent = parentWin;
    Object.defineProperty(window, 'parent', { value: parentWin, writable: true, configurable: true });

    expect(detectThemeFromParent()).toBe('dark');
  });

  it('returns "light" for vscode-high-contrast-light', () => {
    const parentWin = {
      document: { body: { dataset: { vscodeThemeKind: 'vscode-high-contrast-light' } } },
    };
    parentWin.parent = parentWin;
    Object.defineProperty(window, 'parent', { value: parentWin, writable: true, configurable: true });

    expect(detectThemeFromParent()).toBe('light');
  });

  it('returns null when no parent or same window', () => {
    Object.defineProperty(window, 'parent', { value: window, writable: true, configurable: true });
    expect(detectThemeFromParent()).toBeNull();
  });

  it('returns null on cross-origin access error', () => {
    const parentWin = {
      get document() { throw new DOMException('cross-origin'); },
    };
    parentWin.parent = parentWin;
    Object.defineProperty(window, 'parent', { value: parentWin, writable: true, configurable: true });

    expect(detectThemeFromParent()).toBeNull();
  });
});

describe('detectThemeFromMedia', () => {
  let originalMatchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns "dark" when prefers-color-scheme: dark matches', () => {
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(prefers-color-scheme: dark)',
    }));
    expect(detectThemeFromMedia()).toBe('dark');
  });

  it('returns "light" when prefers-color-scheme: light matches', () => {
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(prefers-color-scheme: light)',
    }));
    expect(detectThemeFromMedia()).toBe('light');
  });

  it('returns null when matchMedia is unavailable', () => {
    window.matchMedia = undefined;
    expect(detectThemeFromMedia()).toBeNull();
  });

  it('returns null when no preference matches', () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    expect(detectThemeFromMedia()).toBeNull();
  });
});

describe('resolveTheme', () => {
  it('returns "dark" when theme is "dark"', () => {
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('returns "light" when theme is "light"', () => {
    expect(resolveTheme('light')).toBe('light');
  });

  it('falls back to "dark" when auto and no detection', () => {
    // In test environment, no VSCode parent and matchMedia may return false
    Object.defineProperty(window, 'parent', { value: window, writable: true, configurable: true });
    window.matchMedia = vi.fn(() => ({ matches: false }));

    expect(resolveTheme('auto')).toBe('dark');
  });
});
