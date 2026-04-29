/**
 * Modal dialog and overlay components for the GUI.
 *
 * Provides showLoadDialog (with Fetch PDB and Local File tabs),
 * showExportDialog (with PNG export), and showQuickstart (welcome overlay).
 */

import { getViewer } from '../viewer.js';
import { normalizeRemoteLoadingConfig } from '../loading/remote-loading.js';

/**
 * Show a Load dialog with local and optional remote loading tabs.
 *
 * @param {object} callbacks - Callback functions.
 * @param {function} callbacks.onFetch - Called with (pdbId).
 * @param {function} callbacks.onLoad - Called with (data, format, filename).
 * @param {function} [callbacks.onRemoteSource] - Called with configured source input.
 * @param {function} [callbacks.onLoadUrl] - Called with arbitrary URL input.
 * @param {object} [options] - Optional dialog configuration.
 * @param {object} [options.remoteLoading] - Remote loading configuration.
 */
export function showLoadDialog(callbacks, options = {}) {
  const remoteLoading = normalizeRemoteLoadingConfig(options.remoteLoading);
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
  const tabs = [tabFetch, tabFile];

  // Content
  const content = document.createElement('div');
  content.className = 'modal-body';
  const panels = [];
  const status = document.createElement('div');
  status.className = 'modal-status hidden';

  function setStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `modal-status ${type}`;
  }

  function clearStatus() {
    status.textContent = '';
    status.className = 'modal-status hidden';
  }

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
    if (!/^[A-Z0-9]{4}$/.test(pdbId)) {
      setStatus('Enter a 4-character PDB ID.', 'error');
      return;
    }
    clearStatus();
    callbacks.onFetch(pdbId);
    overlay.remove();
  });
  pdbInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchBtn.click();
  });
  fetchPanel.appendChild(pdbInput);
  fetchPanel.appendChild(fetchBtn);
  content.appendChild(fetchPanel);
  panels.push(fetchPanel);

  // File panel (hidden initially)
  const filePanel = document.createElement('div');
  filePanel.className = 'modal-panel hidden';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdb,.sdf,.mol2,.xyz,.cube,.pqr,.gro,.cif,.mmcif';
  const loadBtn = document.createElement('button');
  loadBtn.className = 'modal-btn';
  loadBtn.textContent = 'Load';
  loadBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) {
      setStatus('Choose a structure file to load.', 'error');
      return;
    }
    clearStatus();
    const format = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target.result;
      if (typeof data !== 'string' || data.trim() === '') {
        setStatus(`"${file.name}" is empty.`, 'error');
        return;
      }
      callbacks.onLoad(data, format, file.name);
      overlay.remove();
    };
    reader.onerror = () => {
      setStatus(
        `Error reading "${file.name}": ${reader.error?.message || 'unknown error'}`,
        'error',
      );
    };
    reader.readAsText(file);
  });
  filePanel.appendChild(fileInput);
  filePanel.appendChild(loadBtn);
  content.appendChild(filePanel);
  panels.push(filePanel);

  let remoteLoadPending = false;

  function setRemoteControlsDisabled(controls, disabled) {
    for (const control of controls) {
      control.disabled = disabled;
    }
  }

  async function runRemoteLoad(callback, payload, controls = []) {
    if (remoteLoadPending) return;
    if (typeof callback !== 'function') {
      setStatus('Remote loading is not available.', 'error');
      return;
    }

    remoteLoadPending = true;
    setRemoteControlsDisabled(controls, true);
    setStatus('Loading remote structure...', 'info');
    try {
      const result = await callback(payload);
      if (result?.ok) {
        overlay.remove();
        return;
      }
      setStatus(result?.message || 'Remote loading failed.', 'error');
    } catch (e) {
      setStatus(e?.message || 'Remote loading failed.', 'error');
    } finally {
      if (overlay.isConnected) {
        remoteLoadPending = false;
        setRemoteControlsDisabled(controls, false);
      }
    }
  }

  if (remoteLoading.sources.length > 0) {
    const tabRemote = document.createElement('button');
    tabRemote.className = 'modal-tab';
    tabRemote.textContent = 'Remote Source';
    tabBar.appendChild(tabRemote);
    tabs.push(tabRemote);

    const remotePanel = document.createElement('div');
    remotePanel.className = 'modal-panel hidden';
    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'modal-source-select modal-input';
    for (const source of remoteLoading.sources) {
      const option = document.createElement('option');
      option.value = source.id;
      option.textContent = source.name;
      sourceSelect.appendChild(option);
    }
    const sourcePathInput = document.createElement('input');
    sourcePathInput.type = 'text';
    sourcePathInput.className = 'modal-source-path modal-input';
    sourcePathInput.placeholder = 'Remote path (e.g. poses/ligand.pdb)';
    const sourceNameInput = document.createElement('input');
    sourceNameInput.type = 'text';
    sourceNameInput.className = 'modal-source-name modal-input';
    sourceNameInput.placeholder = 'Name (optional)';
    const sourceFormatInput = document.createElement('input');
    sourceFormatInput.type = 'text';
    sourceFormatInput.className = 'modal-source-format modal-input';
    sourceFormatInput.placeholder = 'Format (optional)';
    const sourceBtn = document.createElement('button');
    sourceBtn.className = 'modal-btn';
    sourceBtn.textContent = 'Load';
    sourceBtn.addEventListener('click', () => {
      const path = sourcePathInput.value.trim();
      if (!path) {
        setStatus('Enter a remote source path.', 'error');
        return;
      }
      runRemoteLoad(
        callbacks.onRemoteSource,
        {
          sourceId: sourceSelect.value,
          path,
          name: sourceNameInput.value.trim(),
          format: sourceFormatInput.value.trim(),
        },
        [sourceSelect, sourcePathInput, sourceNameInput, sourceFormatInput, sourceBtn],
      );
    });
    sourcePathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sourceBtn.click();
    });
    remotePanel.appendChild(sourceSelect);
    remotePanel.appendChild(sourcePathInput);
    remotePanel.appendChild(sourceNameInput);
    remotePanel.appendChild(sourceFormatInput);
    remotePanel.appendChild(sourceBtn);
    content.appendChild(remotePanel);
    panels.push(remotePanel);
  }

  if (remoteLoading.allowArbitraryUrls) {
    const tabUrl = document.createElement('button');
    tabUrl.className = 'modal-tab';
    tabUrl.textContent = 'URL';
    tabBar.appendChild(tabUrl);
    tabs.push(tabUrl);

    const urlPanel = document.createElement('div');
    urlPanel.className = 'modal-panel hidden';
    const urlNameInput = document.createElement('input');
    urlNameInput.type = 'text';
    urlNameInput.className = 'modal-url-name modal-input';
    urlNameInput.placeholder = 'Name';
    const urlFormatInput = document.createElement('input');
    urlFormatInput.type = 'text';
    urlFormatInput.className = 'modal-url-format modal-input';
    urlFormatInput.placeholder = 'Format';
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'modal-url-input modal-input';
    urlInput.placeholder = 'URL';
    const urlBtn = document.createElement('button');
    urlBtn.className = 'modal-btn';
    urlBtn.textContent = 'Load';
    urlBtn.addEventListener('click', () => {
      const name = urlNameInput.value.trim();
      const format = urlFormatInput.value.trim();
      const url = urlInput.value.trim();
      if (!name) {
        setStatus('Enter a structure name.', 'error');
        return;
      }
      if (!format) {
        setStatus('Enter a structure format.', 'error');
        return;
      }
      if (!url) {
        setStatus('Enter a structure URL.', 'error');
        return;
      }
      runRemoteLoad(
        callbacks.onLoadUrl,
        { name, format, url },
        [urlNameInput, urlFormatInput, urlInput, urlBtn],
      );
    });
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') urlBtn.click();
    });
    urlPanel.appendChild(urlNameInput);
    urlPanel.appendChild(urlFormatInput);
    urlPanel.appendChild(urlInput);
    urlPanel.appendChild(urlBtn);
    content.appendChild(urlPanel);
    panels.push(urlPanel);
  }
  content.appendChild(status);

  dialog.appendChild(content);

  // Tab switching
  function activateTab(activeTab, activePanel) {
    clearStatus();
    for (const tab of tabs) {
      tab.classList.toggle('active', tab === activeTab);
    }
    for (const panel of panels) {
      panel.classList.toggle('hidden', panel !== activePanel);
    }
  }

  tabFetch.addEventListener('click', () => {
    activateTab(tabFetch, fetchPanel);
  });
  tabFile.addEventListener('click', () => {
    activateTab(tabFile, filePanel);
  });
  for (let i = 2; i < tabs.length; i += 1) {
    tabs[i].addEventListener('click', () => {
      activateTab(tabs[i], panels[i]);
    });
  }

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

/**
 * Show a quick-start overlay with example commands.
 *
 * @param {object} callbacks
 * @param {function} callbacks.onTry - Called when "Try it!" is clicked.
 * @param {function} callbacks.onDismiss - Called when dismissed.
 * @returns {function} A dismiss function to programmatically close the overlay.
 */
export function showQuickstart(callbacks) {
  const exampleCommands = [
    { cmd: 'fetch 1CRN', desc: 'Download a structure from the PDB' },
    { cmd: 'show cartoon', desc: 'Display as cartoon ribbon' },
    { cmd: 'color chain', desc: 'Color by chain assignment' },
    { cmd: 'zoom', desc: 'Zoom to fit the molecule' },
    { cmd: 'help', desc: 'List all available commands' },
  ];

  const overlay = document.createElement('div');
  overlay.className = 'quickstart-overlay';

  const card = document.createElement('div');
  card.className = 'quickstart-card';

  const title = document.createElement('div');
  title.className = 'quickstart-title';
  title.textContent = '3Dmol.js GUI';

  const subtitle = document.createElement('div');
  subtitle.className = 'quickstart-subtitle';
  subtitle.textContent = 'An interface for molecular visualization';

  const cmdList = document.createElement('div');
  cmdList.className = 'quickstart-commands';
  for (const { cmd, desc } of exampleCommands) {
    const row = document.createElement('div');
    row.className = 'quickstart-cmd-row';
    const cmdEl = document.createElement('span');
    cmdEl.className = 'quickstart-cmd';
    cmdEl.textContent = cmd;
    const descEl = document.createElement('span');
    descEl.className = 'quickstart-cmd-desc';
    descEl.textContent = desc;
    row.appendChild(cmdEl);
    row.appendChild(descEl);
    cmdList.appendChild(row);
  }

  const actions = document.createElement('div');
  actions.className = 'quickstart-actions';

  const tryBtn = document.createElement('button');
  tryBtn.className = 'quickstart-try-btn';
  tryBtn.textContent = 'Try it!';

  const dismissLink = document.createElement('button');
  dismissLink.className = 'quickstart-dismiss';
  dismissLink.textContent = 'Dismiss';

  actions.appendChild(tryBtn);
  actions.appendChild(dismissLink);
  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(cmdList);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  function dismiss() {
    if (overlay.parentNode) overlay.remove();
  }

  tryBtn.addEventListener('click', () => {
    dismiss();
    if (callbacks.onTry) callbacks.onTry();
  });

  dismissLink.addEventListener('click', () => {
    dismiss();
    if (callbacks.onDismiss) callbacks.onDismiss();
  });

  return dismiss;
}

/**
 * Show a rename dialog.
 *
 * @param {string} currentName - The current name.
 * @param {function} onConfirm - Called with the new name string.
 */
export function showRenameDialog(currentName, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'modal';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('span');
  title.textContent = 'Rename';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  const content = document.createElement('div');
  content.className = 'modal-body';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'modal-input';
  input.value = currentName;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmBtn.click();
  });
  content.appendChild(input);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-btn';
  confirmBtn.textContent = 'Rename';
  confirmBtn.addEventListener('click', () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      onConfirm(newName);
    }
    overlay.remove();
  });
  content.appendChild(confirmBtn);

  dialog.appendChild(content);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  input.select();
  input.focus();
}
