/**
 * Theme auto-detection for embedded environments.
 *
 * Provides two detection strategies:
 * 1. VSCode parent iframe detection via data-vscode-theme-kind
 * 2. OS-level prefers-color-scheme media query
 */

/**
 * Detect theme from VSCode parent iframe.
 *
 * Walks up the iframe chain (up to 5 levels) looking for VSCode's
 * data-vscode-theme-kind attribute on any ancestor document.body.
 *
 * @returns {"dark"|"light"|null}
 */
export function detectThemeFromParent() {
  try {
    let win = window;
    for (let i = 0; i < 5; i++) {
      if (!win.parent || win.parent === win) break;
      win = win.parent;
      const kind = win.document.body.dataset.vscodeThemeKind;
      if (kind) {
        if (kind.includes('light')) return 'light';
        return 'dark';
      }
    }
  } catch (e) {
    // Cross-origin access blocked — expected outside VSCode
  }
  return null;
}

/**
 * Detect theme from OS-level color scheme preference.
 *
 * @returns {"dark"|"light"|null}
 */
export function detectThemeFromMedia() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return null;
}

/**
 * Resolve "auto" theme to a concrete "dark" or "light" value.
 *
 * @param {string} theme - The theme value ("auto", "dark", or "light").
 * @returns {"dark"|"light"} The resolved theme.
 */
export function resolveTheme(theme) {
  if (theme !== 'auto') return theme;
  return detectThemeFromParent()
    || detectThemeFromMedia()
    || 'dark';
}
