/**
 * Modal dialog components for file loading and exporting.
 *
 * Provides showLoadDialog (with Fetch PDB and Local File tabs) and
 * showExportDialog (with PNG export) used by the File menu.
 */

import { getViewer } from '../viewer.js';

/**
 * Show a Load dialog with two tabs: Fetch PDB and Local File.
 *
 * @param {object} callbacks - Callback functions.
 * @param {function} callbacks.onFetch - Called with (pdbId).
 * @param {function} callbacks.onLoad - Called with (data, format, filename).
 */
export function showLoadDialog(callbacks) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'modal';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('span');
  title.textContent = 'Load Structure';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  // Tabs
  const tabBar = document.createElement('div');
  tabBar.className = 'modal-tabs';
  const tabFetch = document.createElement('button');
  tabFetch.className = 'modal-tab active';
  tabFetch.textContent = 'Fetch PDB';
  const tabFile = document.createElement('button');
  tabFile.className = 'modal-tab';
  tabFile.textContent = 'Local File';
  tabBar.appendChild(tabFetch);
  tabBar.appendChild(tabFile);
  dialog.appendChild(tabBar);

  // Content
  const content = document.createElement('div');
  content.className = 'modal-body';

  // Fetch PDB panel
  const fetchPanel = document.createElement('div');
  fetchPanel.className = 'modal-panel';
  const pdbInput = document.createElement('input');
  pdbInput.type = 'text';
  pdbInput.className = 'modal-input';
  pdbInput.placeholder = 'Enter PDB ID (e.g. 1UBQ)';
  pdbInput.maxLength = 4;
  const fetchBtn = document.createElement('button');
  fetchBtn.className = 'modal-btn';
  fetchBtn.textContent = 'Fetch';
  fetchBtn.addEventListener('click', () => {
    const pdbId = pdbInput.value.trim().toUpperCase();
    if (pdbId.length === 4) {
      callbacks.onFetch(pdbId);
      overlay.remove();
    }
  });
  pdbInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchBtn.click();
  });
  fetchPanel.appendChild(pdbInput);
  fetchPanel.appendChild(fetchBtn);
  content.appendChild(fetchPanel);

  // File panel (hidden initially)
  const filePanel = document.createElement('div');
  filePanel.className = 'modal-panel hidden';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdb,.sdf,.mol2,.xyz,.cube,.pqr,.gro';
  const loadBtn = document.createElement('button');
  loadBtn.className = 'modal-btn';
  loadBtn.textContent = 'Load';
  loadBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const format = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = (ev) => {
      callbacks.onLoad(ev.target.result, format, file.name);
      overlay.remove();
    };
    reader.readAsText(file);
  });
  filePanel.appendChild(fileInput);
  filePanel.appendChild(loadBtn);
  content.appendChild(filePanel);

  dialog.appendChild(content);

  // Tab switching
  tabFetch.addEventListener('click', () => {
    tabFetch.classList.add('active');
    tabFile.classList.remove('active');
    fetchPanel.classList.remove('hidden');
    filePanel.classList.add('hidden');
  });
  tabFile.addEventListener('click', () => {
    tabFile.classList.add('active');
    tabFetch.classList.remove('active');
    filePanel.classList.remove('hidden');
    fetchPanel.classList.add('hidden');
  });

  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  pdbInput.focus();
}

/**
 * Show an Export dialog with PNG export option.
 *
 * @param {object} callbacks - Callback functions.
 * @param {function} callbacks.onExportPNG - Called with (width, height).
 */
export function showExportDialog(callbacks) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'modal';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('span');
  title.textContent = 'Export';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  // Content
  const content = document.createElement('div');
  content.className = 'modal-body';

  const label = document.createElement('div');
  label.textContent = 'Export Image';
  label.style.marginBottom = '8px';
  label.style.fontWeight = 'bold';
  content.appendChild(label);

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';
  row.style.marginBottom = '12px';

  const viewer = getViewer();
  const canvas = viewer && viewer.getCanvas ? viewer.getCanvas() : null;
  const defaultW = canvas ? canvas.width : 800;
  const defaultH = canvas ? canvas.height : 600;

  const wInput = document.createElement('input');
  wInput.type = 'number';
  wInput.className = 'modal-input';
  wInput.value = defaultW;
  wInput.style.width = '80px';
  const xLabel = document.createElement('span');
  xLabel.textContent = ' \u00d7 ';
  const hInput = document.createElement('input');
  hInput.type = 'number';
  hInput.className = 'modal-input';
  hInput.value = defaultH;
  hInput.style.width = '80px';
  row.appendChild(wInput);
  row.appendChild(xLabel);
  row.appendChild(hInput);
  content.appendChild(row);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'modal-btn';
  exportBtn.textContent = 'Export PNG';
  exportBtn.addEventListener('click', () => {
    const w = parseInt(wInput.value, 10) || defaultW;
    const h = parseInt(hInput.value, 10) || defaultH;
    callbacks.onExportPNG(w, h);
    overlay.remove();
  });
  content.appendChild(exportBtn);

  dialog.appendChild(content);

  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
