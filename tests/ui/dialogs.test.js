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

function getTabLabels(overlay) {
  return [...overlay.querySelectorAll('.modal-tab')].map((tab) => tab.textContent);
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

  it('shows a focused load header and compact source tabs', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');

    expect(overlay.querySelector('.modal-title').textContent).toBe('Load');
    expect(overlay.querySelector('.modal-subtitle').textContent).toBe(
      'Structure or density map',
    );
    expect(getTabLabels(overlay)).toEqual(['PDB ID', 'File']);
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

  it('local file input accepts density map extensions', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const fileInput = overlay.querySelectorAll('.modal-panel')[1].querySelector('input[type="file"]');

    expect(fileInput.accept).toContain('.ccp4');
    expect(fileInput.accept).toContain('.map');
    expect(fileInput.accept).toContain('.mrc');
  });

  it('local file target does not render format chips', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const filePanel = overlay.querySelectorAll('.modal-panel')[1];

    expect(filePanel.querySelector('.modal-format-chips')).toBeNull();
    expect(filePanel.querySelector('.modal-format-chip')).toBeNull();
  });

  it('local file target shows the selected filename', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const filePanel = overlay.querySelectorAll('.modal-panel')[1];
    const fileInput = filePanel.querySelector('input[type="file"]');
    const selectedName = filePanel.querySelector('.modal-file-name');
    const file = new File(['ATOM ...'], 'protein_density.cube', { type: 'text/plain' });

    expect(selectedName.textContent).toBe('No file selected');
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(selectedName.textContent).toBe('protein_density.cube');
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

  it('shows an inline error for invalid PDB input', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const pdbInput = overlay.querySelector('.modal-input');
    const fetchBtn = overlay.querySelector('.modal-btn');

    pdbInput.value = '12!';
    fetchBtn.click();

    const status = overlay.querySelector('.modal-status');
    expect(callbacks.onFetch).not.toHaveBeenCalled();
    expect(status).not.toBeNull();
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe('Enter a 4-character PDB ID.');
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

  it('load button fallback reads map files as binary and calls onLoad', async () => {
    const data = new ArrayBuffer(16);
    const mockFileReader = {
      readAsArrayBuffer: vi.fn(),
      readAsText: vi.fn(),
      onload: null,
      onerror: null,
      error: null,
    };
    vi.spyOn(globalThis, 'FileReader').mockImplementation(() => mockFileReader);

    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const filePanel = overlay.querySelectorAll('.modal-panel')[1];
    const fileInput = filePanel.querySelector('input[type="file"]');
    const loadBtn = filePanel.querySelector('.modal-btn');
    const file = new File(['map data'], 'density.map', { type: 'application/octet-stream' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
    });

    loadBtn.click();

    expect(mockFileReader.readAsArrayBuffer).toHaveBeenCalledWith(file);
    expect(mockFileReader.readAsText).not.toHaveBeenCalled();
    mockFileReader.onload({ target: { result: data } });
    expect(callbacks.onLoad).toHaveBeenCalledWith(data, 'map', 'density.map');
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('load button with file calls onLoadFile directly when provided', async () => {
    const mockFileReader = {
      readAsText: vi.fn(),
      onload: null,
    };
    vi.spyOn(globalThis, 'FileReader').mockImplementation(() => mockFileReader);
    callbacks.onLoadFile = vi.fn().mockResolvedValue({ ok: true });

    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const filePanel = overlay.querySelectorAll('.modal-panel')[1];
    const fileInput = filePanel.querySelector('input[type="file"]');
    const loadBtn = filePanel.querySelector('.modal-btn');
    const file = new File(['map data'], 'density.ccp4', { type: 'application/octet-stream' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
    });

    loadBtn.click();

    await vi.waitFor(() => expect(callbacks.onLoadFile).toHaveBeenCalledWith(file));
    expect(mockFileReader.readAsText).not.toHaveBeenCalled();
    expect(callbacks.onLoad).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.querySelector('.modal-overlay')).toBeNull());
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

  it('shows an inline error when loading without choosing a file', () => {
    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const panels = overlay.querySelectorAll('.modal-panel');
    const filePanel = panels[1];
    const loadBtn = filePanel.querySelector('.modal-btn');

    loadBtn.click();

    const status = overlay.querySelector('.modal-status');
    expect(callbacks.onLoad).not.toHaveBeenCalled();
    expect(status).not.toBeNull();
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe('Choose a structure or map file to load.');
  });

  it('shows an inline error when the selected file is empty', () => {
    const mockFileReader = {
      readAsText: vi.fn(),
      onload: null,
      onerror: null,
      error: null,
    };
    vi.spyOn(globalThis, 'FileReader').mockImplementation(() => mockFileReader);

    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const filePanel = overlay.querySelectorAll('.modal-panel')[1];
    const fileInput = filePanel.querySelector('input[type="file"]');
    const loadBtn = filePanel.querySelector('.modal-btn');
    const file = new File([''], 'empty.pdb', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
    });

    loadBtn.click();
    mockFileReader.onload({ target: { result: '' } });

    const status = overlay.querySelector('.modal-status');
    expect(callbacks.onLoad).not.toHaveBeenCalled();
    expect(status.textContent).toBe('"empty.pdb" is empty.');
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
  });

  it('shows an inline error when FileReader fails', () => {
    const mockFileReader = {
      readAsText: vi.fn(),
      onload: null,
      onerror: null,
      error: { message: 'Read failed' },
    };
    vi.spyOn(globalThis, 'FileReader').mockImplementation(() => mockFileReader);

    showLoadDialog(callbacks);
    const overlay = document.querySelector('.modal-overlay');
    const filePanel = overlay.querySelectorAll('.modal-panel')[1];
    const fileInput = filePanel.querySelector('input[type="file"]');
    const loadBtn = filePanel.querySelector('.modal-btn');
    const file = new File(['ATOM      1  CA  ALA A   1'], 'bad.pdb', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
    });

    loadBtn.click();
    mockFileReader.onerror();

    const status = overlay.querySelector('.modal-status');
    expect(callbacks.onLoad).not.toHaveBeenCalled();
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe('Error reading "bad.pdb": Read failed');
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

  it('shows a Remote Source tab when sources are configured', () => {
    showLoadDialog(callbacks, {
      remoteLoading: {
        sources: [{ id: 'app', name: 'App Structures', baseUrl: '/api/structures/' }],
      },
    });

    const overlay = document.querySelector('.modal-overlay');
    expect(getTabLabels(overlay)).toEqual(['PDB ID', 'File', 'Remote']);
  });

  it('remote source form calls onRemoteSource and closes on success', async () => {
    callbacks.onRemoteSource = vi.fn().mockResolvedValue({ ok: true });
    showLoadDialog(callbacks, {
      remoteLoading: {
        sources: [{ id: 'app', name: 'App Structures', baseUrl: '/api/structures/' }],
      },
    });

    const overlay = document.querySelector('.modal-overlay');
    const remoteTab = [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'Remote');
    remoteTab.click();
    overlay.querySelector('.modal-source-path').value = 'poses/ligand.pdb';
    overlay.querySelector('.modal-source-name').value = 'Ligand Pose';
    overlay.querySelector('.modal-source-format').value = 'pdb';
    overlay.querySelector('.modal-panel:not(.hidden) .modal-btn').click();
    await vi.waitFor(() => expect(callbacks.onRemoteSource).toHaveBeenCalled());

    expect(callbacks.onRemoteSource).toHaveBeenCalledWith({
      sourceId: 'app',
      path: 'poses/ligand.pdb',
      name: 'Ligand Pose',
      format: 'pdb',
    });
    await vi.waitFor(() => expect(document.querySelector('.modal-overlay')).toBeNull());
  });

  it('remote source failures show an inline error and keep the dialog open', async () => {
    callbacks.onRemoteSource = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Remote failed',
    });
    showLoadDialog(callbacks, {
      remoteLoading: {
        sources: [{ id: 'app', name: 'App Structures', baseUrl: '/api/structures/' }],
      },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'Remote')
      .click();
    overlay.querySelector('.modal-source-path').value = 'poses/ligand.pdb';
    overlay.querySelector('.modal-source-name').value = 'Ligand Pose';
    overlay.querySelector('.modal-source-format').value = 'pdb';
    overlay.querySelector('.modal-panel:not(.hidden) .modal-btn').click();

    await vi.waitFor(() => {
      const status = overlay.querySelector('.modal-status');
      expect(status.classList.contains('error')).toBe(true);
      expect(status.textContent).toBe('Remote failed');
    });
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
  });

  it('remote source load ignores duplicate submissions while pending', async () => {
    callbacks.onRemoteSource = vi.fn(() => new Promise(() => {}));
    showLoadDialog(callbacks, {
      remoteLoading: {
        sources: [{ id: 'app', name: 'App Structures', baseUrl: '/api/structures/' }],
      },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'Remote')
      .click();
    overlay.querySelector('.modal-source-path').value = 'poses/ligand.pdb';
    const loadBtn = overlay.querySelector('.modal-panel:not(.hidden) .modal-btn');

    loadBtn.click();
    loadBtn.click();
    await vi.waitFor(() => expect(callbacks.onRemoteSource).toHaveBeenCalledTimes(1));
    expect(loadBtn.disabled).toBe(true);
  });

  it('remote source blank path shows an inline error and does not call onRemoteSource', () => {
    callbacks.onRemoteSource = vi.fn();
    showLoadDialog(callbacks, {
      remoteLoading: {
        sources: [{ id: 'app', name: 'App Structures', baseUrl: '/api/structures/' }],
      },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'Remote')
      .click();
    overlay.querySelector('.modal-source-path').value = '   ';
    overlay.querySelector('.modal-panel:not(.hidden) .modal-btn').click();

    const status = overlay.querySelector('.modal-status');
    expect(callbacks.onRemoteSource).not.toHaveBeenCalled();
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe('Enter a remote source path.');
  });

  it('shows a URL tab only when arbitrary URLs are enabled', () => {
    showLoadDialog(callbacks, {
      remoteLoading: { allowArbitraryUrls: true },
    });

    const overlay = document.querySelector('.modal-overlay');
    expect(getTabLabels(overlay)).toEqual(['PDB ID', 'File', 'URL']);

    overlay.remove();
    showLoadDialog(callbacks);
    expect(getTabLabels(document.querySelector('.modal-overlay'))).toEqual([
      'PDB ID',
      'File',
    ]);
  });

  it('URL form calls onLoadUrl and closes on success', async () => {
    callbacks.onLoadUrl = vi.fn().mockResolvedValue({ ok: true });
    showLoadDialog(callbacks, {
      remoteLoading: { allowArbitraryUrls: true },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'URL')
      .click();
    overlay.querySelector('.modal-url-name').value = 'Remote Pose';
    overlay.querySelector('.modal-url-format').value = 'cif';
    overlay.querySelector('.modal-url-input').value = 'https://example.test/remote.cif';
    overlay.querySelector('.modal-panel:not(.hidden) .modal-btn').click();
    await vi.waitFor(() => expect(callbacks.onLoadUrl).toHaveBeenCalled());

    expect(callbacks.onLoadUrl).toHaveBeenCalledWith({
      name: 'Remote Pose',
      format: 'cif',
      url: 'https://example.test/remote.cif',
    });
    await vi.waitFor(() => expect(document.querySelector('.modal-overlay')).toBeNull());
  });

  it('URL load ignores duplicate submissions while pending', async () => {
    callbacks.onLoadUrl = vi.fn(() => new Promise(() => {}));
    showLoadDialog(callbacks, {
      remoteLoading: { allowArbitraryUrls: true },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'URL')
      .click();
    overlay.querySelector('.modal-url-name').value = 'Remote Pose';
    overlay.querySelector('.modal-url-format').value = 'cif';
    overlay.querySelector('.modal-url-input').value = 'https://example.test/remote.cif';
    const loadBtn = overlay.querySelector('.modal-panel:not(.hidden) .modal-btn');

    loadBtn.click();
    loadBtn.click();
    await vi.waitFor(() => expect(callbacks.onLoadUrl).toHaveBeenCalledTimes(1));
    expect(loadBtn.disabled).toBe(true);
  });

  it('URL blank name shows an inline error and does not call onLoadUrl', () => {
    callbacks.onLoadUrl = vi.fn();
    showLoadDialog(callbacks, {
      remoteLoading: { allowArbitraryUrls: true },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'URL')
      .click();
    overlay.querySelector('.modal-url-name').value = ' ';
    overlay.querySelector('.modal-url-format').value = 'cif';
    overlay.querySelector('.modal-url-input').value = 'https://example.test/remote.cif';
    overlay.querySelector('.modal-panel:not(.hidden) .modal-btn').click();

    const status = overlay.querySelector('.modal-status');
    expect(callbacks.onLoadUrl).not.toHaveBeenCalled();
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe('Enter a structure name.');
  });

  it('URL blank format shows an inline error and does not call onLoadUrl', () => {
    callbacks.onLoadUrl = vi.fn();
    showLoadDialog(callbacks, {
      remoteLoading: { allowArbitraryUrls: true },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'URL')
      .click();
    overlay.querySelector('.modal-url-name').value = 'Remote Pose';
    overlay.querySelector('.modal-url-format').value = ' ';
    overlay.querySelector('.modal-url-input').value = 'https://example.test/remote.cif';
    overlay.querySelector('.modal-panel:not(.hidden) .modal-btn').click();

    const status = overlay.querySelector('.modal-status');
    expect(callbacks.onLoadUrl).not.toHaveBeenCalled();
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe('Enter a structure format.');
  });

  it('URL blank URL shows an inline error and does not call onLoadUrl', () => {
    callbacks.onLoadUrl = vi.fn();
    showLoadDialog(callbacks, {
      remoteLoading: { allowArbitraryUrls: true },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'URL')
      .click();
    overlay.querySelector('.modal-url-name').value = 'Remote Pose';
    overlay.querySelector('.modal-url-format').value = 'cif';
    overlay.querySelector('.modal-url-input').value = ' ';
    overlay.querySelector('.modal-panel:not(.hidden) .modal-btn').click();

    const status = overlay.querySelector('.modal-status');
    expect(callbacks.onLoadUrl).not.toHaveBeenCalled();
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toBe('Enter a structure URL.');
  });

  it('URL thrown errors show inline and keep the dialog open', async () => {
    callbacks.onLoadUrl = vi.fn().mockRejectedValue(new Error('URL exploded'));
    showLoadDialog(callbacks, {
      remoteLoading: { allowArbitraryUrls: true },
    });

    const overlay = document.querySelector('.modal-overlay');
    [...overlay.querySelectorAll('.modal-tab')]
      .find((tab) => tab.textContent === 'URL')
      .click();
    overlay.querySelector('.modal-url-name').value = 'Remote Pose';
    overlay.querySelector('.modal-url-format').value = 'cif';
    overlay.querySelector('.modal-url-input').value = 'https://example.test/remote.cif';
    overlay.querySelector('.modal-panel:not(.hidden) .modal-btn').click();

    await vi.waitFor(() => {
      const status = overlay.querySelector('.modal-status');
      expect(status.classList.contains('error')).toBe(true);
      expect(status.textContent).toBe('URL exploded');
    });
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
