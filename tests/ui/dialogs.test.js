import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock viewer
// ---------------------------------------------------------------------------

vi.mock('../../src/viewer.js', () => ({
  getViewer: vi.fn(() => ({
    getCanvas: () => ({ width: 800, height: 600 }),
  })),
}));

import { getViewer } from '../../src/viewer.js';
import {
  showLoadDialog,
  showExportDialog,
  showQuickstart,
  showRenameDialog,
} from '../../src/ui/dialogs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Click the overlay background (not a child dialog). */
function clickOverlayBackground(overlay) {
  overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** Find the close button inside the overlay. */
function findCloseBtn(overlay) {
  return overlay.querySelector('.modal-close');
}

// ---------------------------------------------------------------------------
// showLoadDialog
// ---------------------------------------------------------------------------

describe('showLoadDialog', () => {
  let callbacks;

  beforeEach(() => {
    document.body.innerHTML = '';
    callbacks = { onFetch: vi.fn(), onLoad: vi.fn() };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('creates a modal overlay in document.body', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.parentNode).toBe(document.body);
  });

  it('close button removes overlay', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const closeBtn = findCloseBtn(overlay);
    closeBtn.click();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('tab switching toggles panels', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const tabs = overlay.querySelectorAll('.modal-tab');
    const panels = overlay.querySelectorAll('.modal-panel');

    // Initially: fetch tab active, file tab inactive
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[1].classList.contains('active')).toBe(false);
    expect(panels[0].classList.contains('hidden')).toBe(false);
    expect(panels[1].classList.contains('hidden')).toBe(true);

    // Click Local File tab
    tabs[1].click();
    expect(tabs[1].classList.contains('active')).toBe(true);
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(panels[1].classList.contains('hidden')).toBe(false);
    expect(panels[0].classList.contains('hidden')).toBe(true);

    // Click Fetch PDB tab to switch back
    tabs[0].click();
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[1].classList.contains('active')).toBe(false);
    expect(panels[0].classList.contains('hidden')).toBe(false);
    expect(panels[1].classList.contains('hidden')).toBe(true);
  });

  it('fetch button calls onFetch with uppercase PDB ID for 4-char input', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const pdbInput = overlay.querySelector('.modal-input');
    const fetchBtn = overlay.querySelector('.modal-btn');

    pdbInput.value = '1ubq';
    fetchBtn.click();

    expect(callbacks.onFetch).toHaveBeenCalledWith('1UBQ');
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('fetch button does nothing for input shorter than 4 chars', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const pdbInput = overlay.querySelector('.modal-input');
    const fetchBtn = overlay.querySelector('.modal-btn');

    pdbInput.value = '1UB';
    fetchBtn.click();

    expect(callbacks.onFetch).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
  });

  it('Enter key in PDB input triggers fetch', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const pdbInput = overlay.querySelector('.modal-input');

    pdbInput.value = '4HHB';
    pdbInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(callbacks.onFetch).toHaveBeenCalledWith('4HHB');
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('load button with file reads the file and calls onLoad', async () => {
    // Stub FileReader
    const mockFileReader = {
      readAsText: vi.fn(),
      onload: null,
    };
    vi.spyOn(globalThis, 'FileReader').mockImplementation(() => mockFileReader);

    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const panels = overlay.querySelectorAll('.modal-panel');
    const filePanel = panels[1];
    const fileInput = filePanel.querySelector('input[type="file"]');
    const loadBtn = filePanel.querySelector('.modal-btn');

    // Create a mock file
    const file = new File(['ATOM ...'], 'test.pdb', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
    });

    loadBtn.click();

    expect(mockFileReader.readAsText).toHaveBeenCalledWith(file);

    // Simulate FileReader onload
    mockFileReader.onload({ target: { result: 'ATOM ...' } });

    expect(callbacks.onLoad).toHaveBeenCalledWith('ATOM ...', 'pdb', 'test.pdb');
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('load button without file does nothing', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const panels = overlay.querySelectorAll('.modal-panel');
    const filePanel = panels[1];
    const loadBtn = filePanel.querySelector('.modal-btn');

    // files[0] is undefined by default
    loadBtn.click();

    expect(callbacks.onLoad).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
  });

  it('clicking overlay background removes it', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    clickOverlayBackground(overlay);
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('clicking the dialog does not remove overlay', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const dialog = overlay.querySelector('.modal');
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// showExportDialog
// ---------------------------------------------------------------------------

describe('showExportDialog', () => {
  let callbacks;

  beforeEach(() => {
    document.body.innerHTML = '';
    callbacks = { onExportPNG: vi.fn() };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('creates a modal overlay', () => {
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
  });

  it('close button removes overlay', () => {
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    findCloseBtn(overlay).click();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('export button calls onExportPNG with width and height and removes overlay', () => {
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const exportBtn = overlay.querySelector('.modal-btn');

    exportBtn.click();

    expect(callbacks.onExportPNG).toHaveBeenCalledWith(800, 600);
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('uses canvas dimensions as defaults', () => {
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const inputs = overlay.querySelectorAll('input[type="number"]');

    expect(inputs[0].value).toBe('800');
    expect(inputs[1].value).toBe('600');
  });

  it('export button uses custom width/height from inputs', () => {
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const inputs = overlay.querySelectorAll('input[type="number"]');
    const exportBtn = overlay.querySelector('.modal-btn');

    inputs[0].value = '1920';
    inputs[1].value = '1080';
    exportBtn.click();

    expect(callbacks.onExportPNG).toHaveBeenCalledWith(1920, 1080);
  });

  it('export button falls back to defaults when inputs are non-numeric', () => {
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const inputs = overlay.querySelectorAll('input[type="number"]');
    const exportBtn = overlay.querySelector('.modal-btn');

    inputs[0].value = '';
    inputs[1].value = '';
    exportBtn.click();

    // parseInt('', 10) is NaN, so it should fall back to 800x600
    expect(callbacks.onExportPNG).toHaveBeenCalledWith(800, 600);
  });

  it('handles case where viewer.getCanvas() returns null', () => {
    getViewer.mockReturnValueOnce({ getCanvas: () => null });
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const inputs = overlay.querySelectorAll('input[type="number"]');

    // Should fall back to 800x600
    expect(inputs[0].value).toBe('800');
    expect(inputs[1].value).toBe('600');

    const exportBtn = overlay.querySelector('.modal-btn');
    exportBtn.click();
    expect(callbacks.onExportPNG).toHaveBeenCalledWith(800, 600);
  });

  it('handles case where getViewer returns null', () => {
    getViewer.mockReturnValueOnce(null);
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const inputs = overlay.querySelectorAll('input[type="number"]');

    expect(inputs[0].value).toBe('800');
    expect(inputs[1].value).toBe('600');
  });

  it('clicking overlay background removes it', () => {
    showExportDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    clickOverlayBackground(overlay);
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// showQuickstart
// ---------------------------------------------------------------------------

describe('showQuickstart', () => {
  let callbacks;

  beforeEach(() => {
    document.body.innerHTML = '';
    callbacks = { onTry: vi.fn(), onDismiss: vi.fn() };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates quickstart overlay', () => {
    showQuickstart(callbacks);
    const overlay = document.querySelector('.quickstart-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.parentNode).toBe(document.body);
  });

  it('contains 5 example command rows', () => {
    showQuickstart(callbacks);
    const rows = document.querySelectorAll('.quickstart-cmd-row');
    expect(rows.length).toBe(5);
  });

  it('displays expected command text', () => {
    showQuickstart(callbacks);
    const cmds = document.querySelectorAll('.quickstart-cmd');
    const cmdTexts = [...cmds].map((el) => el.textContent);
    expect(cmdTexts).toContain('fetch 1CRN');
    expect(cmdTexts).toContain('show cartoon');
    expect(cmdTexts).toContain('color chain');
    expect(cmdTexts).toContain('zoom');
    expect(cmdTexts).toContain('help');
  });

  it('Try button calls onTry and dismisses overlay', () => {
    showQuickstart(callbacks);
    const tryBtn = document.querySelector('.quickstart-try-btn');
    tryBtn.click();
    expect(callbacks.onTry).toHaveBeenCalled();
    expect(document.querySelector('.quickstart-overlay')).toBeNull();
  });

  it('Dismiss button calls onDismiss and dismisses overlay', () => {
    showQuickstart(callbacks);
    const dismissBtn = document.querySelector('.quickstart-dismiss');
    dismissBtn.click();
    expect(callbacks.onDismiss).toHaveBeenCalled();
    expect(document.querySelector('.quickstart-overlay')).toBeNull();
  });

  it('returns a dismiss function that removes overlay', () => {
    const dismiss = showQuickstart(callbacks);
    expect(typeof dismiss).toBe('function');
    expect(document.querySelector('.quickstart-overlay')).not.toBeNull();
    dismiss();
    expect(document.querySelector('.quickstart-overlay')).toBeNull();
  });

  it('dismiss function is idempotent (calling twice does not error)', () => {
    const dismiss = showQuickstart(callbacks);
    dismiss();
    expect(document.querySelector('.quickstart-overlay')).toBeNull();
    // Second call should not throw
    expect(() => dismiss()).not.toThrow();
  });

  it('Try button works when onTry is not provided', () => {
    const cb = { onDismiss: vi.fn() };
    showQuickstart(cb);
    const tryBtn = document.querySelector('.quickstart-try-btn');
    expect(() => tryBtn.click()).not.toThrow();
    expect(document.querySelector('.quickstart-overlay')).toBeNull();
  });

  it('Dismiss button works when onDismiss is not provided', () => {
    const cb = { onTry: vi.fn() };
    showQuickstart(cb);
    const dismissBtn = document.querySelector('.quickstart-dismiss');
    expect(() => dismissBtn.click()).not.toThrow();
    expect(document.querySelector('.quickstart-overlay')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// showRenameDialog
// ---------------------------------------------------------------------------

describe('showRenameDialog', () => {
  let onConfirm;

  beforeEach(() => {
    document.body.innerHTML = '';
    onConfirm = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a modal overlay', () => {
    showRenameDialog('oldName', onConfirm);
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
  });

  it('input is pre-filled with current name', () => {
    showRenameDialog('myObject', onConfirm);
    const input = document.querySelector('.modal-input');
    expect(input.value).toBe('myObject');
  });

  it('close button removes overlay', () => {
    showRenameDialog('oldName', onConfirm);
    const overlay = document.querySelector('.modal-overlay');
    findCloseBtn(overlay).click();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('confirm button calls onConfirm with new name and removes overlay', () => {
    showRenameDialog('oldName', onConfirm);
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('.modal-input');
    const confirmBtn = overlay.querySelector('.modal-btn');

    input.value = 'newName';
    confirmBtn.click();

    expect(onConfirm).toHaveBeenCalledWith('newName');
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('confirm button does NOT call onConfirm if name is unchanged', () => {
    showRenameDialog('sameName', onConfirm);
    const overlay = document.querySelector('.modal-overlay');
    const confirmBtn = overlay.querySelector('.modal-btn');

    // Name stays 'sameName' (unchanged)
    confirmBtn.click();

    expect(onConfirm).not.toHaveBeenCalled();
    // Overlay should still be removed
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('confirm button does NOT call onConfirm if name is empty', () => {
    showRenameDialog('oldName', onConfirm);
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('.modal-input');
    const confirmBtn = overlay.querySelector('.modal-btn');

    input.value = '';
    confirmBtn.click();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('confirm button does NOT call onConfirm if name is only whitespace', () => {
    showRenameDialog('oldName', onConfirm);
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('.modal-input');
    const confirmBtn = overlay.querySelector('.modal-btn');

    input.value = '   ';
    confirmBtn.click();

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Enter key in input triggers confirm', () => {
    showRenameDialog('oldName', onConfirm);
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('.modal-input');

    input.value = 'renamedObj';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(onConfirm).toHaveBeenCalledWith('renamedObj');
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('clicking overlay background removes it', () => {
    showRenameDialog('oldName', onConfirm);
    const overlay = document.querySelector('.modal-overlay');
    clickOverlayBackground(overlay);
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});
