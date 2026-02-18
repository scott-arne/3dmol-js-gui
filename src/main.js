/**
 * Main application bootstrap for the 3Dmol.js GUI.
 *
 * Wires together all UI components (menu bar, sidebar, terminal), the 3Dmol
 * viewer, and the application state store into a working application.
 */

import './ui/styles.css';
import { initViewer, getViewer, fetchPDB, loadModelData, setupClickHandler, clearHighlight, applyHighlight, repStyle, refreshLabels, orientView } from './viewer.js';
import { createMenuBar } from './ui/menubar.js';
import { createSidebar } from './ui/sidebar.js';
import { createTerminal } from './ui/terminal.js';
import {
  getState,
  onStateChange,
  toggleObjectVisibility,
  setSelectionMode,
  addObject,
  removeObject,
  addSelection,
  removeSelection,
  renameSelection,
  renameObject,
  toggleSelectionVisibility,
  pruneSelections,
  notifyStateChange,
  setActiveSelection,
} from './state.js';
import { createCommandRegistry, createCommandContext } from './commands/registry.js';
import { registerAllCommands } from './commands/index.js';
import { showLoadDialog, showExportDialog, showQuickstart, showRenameDialog } from './ui/dialogs.js';
import { createContextMenu } from './ui/context-menu.js';
import {
  applyColor, applyColorToSelection, formatColorDisplay,
  applyLabel, applyShow, applyHide, applyHideSelection,
  applyViewPreset, getPresetLabel,
} from './actions.js';
import { applyPreset } from './presets.js';
import { resolveSelection, getSelSpec } from './commands/resolve-selection.js';

// Guard: ensure 3Dmol.js is loaded
if (typeof $3Dmol === 'undefined') {
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#1e1e1e;color:#ff6b6b;font-family:monospace;font-size:16px;padding:20px;text-align:center;';
  msg.textContent = 'Error: 3Dmol.js failed to load. Check your network connection or host the library locally. See index.html for instructions.';
  document.body.appendChild(msg);
  throw new Error('3Dmol.js not loaded');
}

const app = document.getElementById('app');

// --- Initialize the 3Dmol viewer ---
const viewer = initViewer(document.getElementById('viewer-container'));

// --- Create the terminal ---
const terminal = createTerminal(document.getElementById('terminal-container'));

// --- Create the sidebar with callbacks ---
const sidebar = createSidebar(document.getElementById('sidebar-container'), {
  onToggleVisibility(name) {
    const obj = toggleObjectVisibility(name);
    if (obj) {
      if (obj.visible) {
        obj.model.show();
      } else {
        obj.model.hide();
      }
      getViewer().render();
      sidebar.refresh(getState());
    }
  },

  onAction(name, action) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    const viewer = getViewer();

    switch (action) {
      case 'center':
        viewer.center({ model: obj.model });
        viewer.render();
        terminal.print(`Centered on "${name}"`, 'result');
        break;
      case 'orient':
        orientView({ model: obj.model });
        terminal.print(`Oriented "${name}"`, 'result');
        break;
      case 'zoom':
        viewer.zoomTo({ model: obj.model });
        viewer.render();
        terminal.print(`Zoomed to "${name}"`, 'result');
        break;
      case 'delete': {
        const modelAtoms = viewer.selectedAtoms({ model: obj.model });
        const removedIndices = modelAtoms.map(a => a.index);
        viewer.removeModel(obj.model);
        viewer.render();
        removeObject(name);
        pruneSelections(removedIndices);
        // Clean up stale highlight and selected indices
        for (const idx of removedIndices) {
          selectedAtomIndices.delete(idx);
        }
        clearHighlight();
        if (getState().activeSelection) {
          applyHighlight(getState().activeSelection);
        }
        terminal.print(`Deleted "${name}"`, 'result');
        break;
      }
      case 'rename': {
        showRenameDialog(name, (newName) => {
          try {
            renameObject(name, newName);
            terminal.print(`Renamed "${name}" to "${newName}"`, 'result');
          } catch (e) {
            terminal.print(e.message, 'error');
          }
        });
        break;
      }
      case 'duplicate':
        terminal.print('Duplicate not yet implemented', 'info');
        break;
    }
  },

  onShow(name, rep) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    applyShow({ model: obj.model }, rep, obj);
    terminal.print(`Showing ${rep} on "${name}"`, 'result');
  },

  onHide(name, rep) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    applyHide({ model: obj.model }, rep, obj);
    terminal.print(`Hiding ${rep} on "${name}"`, 'result');
  },

  onLabel(name, prop) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    applyLabel({ model: obj.model }, prop);
    terminal.print(prop === 'clear' ? 'Labels cleared' : `Labeled "${name}" by ${prop}`, 'result');
  },

  onView(name, presetName) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    const reps = applyViewPreset(presetName, { model: obj.model });
    obj.representations = new Set(reps);
    notifyStateChange();
    terminal.print(`Applied "${getPresetLabel(presetName)}" preset to "${name}"`, 'result');
  },

  onColor(name, rawScheme) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    applyColor({ model: obj.model }, obj.representations, rawScheme);
    terminal.print(`Colored "${name}" by ${formatColorDisplay(rawScheme)}`, 'result');
  },

  // --- Selection sidebar callbacks ---

  onToggleSelectionVisibility(name) {
    toggleSelectionVisibility(name);
  },

  onSelectionAction(name, action) {
    const state = getState();
    const sel = state.selections.get(name);
    if (!sel) return;
    switch (action) {
      case 'delete':
        removeSelection(name);
        terminal.print(`Deleted selection "(${name})"`, 'result');
        break;
      case 'rename': {
        showRenameDialog(name, (newName) => {
          try {
            renameSelection(name, newName);
            terminal.print(`Renamed "(${name})" to "(${newName})"`, 'result');
          } catch (e) {
            terminal.print(e.message, 'error');
          }
        });
        break;
      }
      case 'center':
        getViewer().center(sel.spec);
        getViewer().render();
        terminal.print(`Centered on "(${name})"`, 'result');
        break;
      case 'zoom':
        getViewer().zoomTo(sel.spec);
        getViewer().render();
        terminal.print(`Zoomed to "(${name})"`, 'result');
        break;
    }
  },

  onSelectionShow(name, rep) {
    const sel = getState().selections.get(name);
    if (!sel) return;
    getViewer().addStyle(sel.spec, repStyle(rep));
    getViewer().render();
    terminal.print(`Showing ${rep} on "(${name})"`, 'result');
  },

  onSelectionHide(name, rep) {
    const sel = getState().selections.get(name);
    if (!sel) return;
    applyHideSelection(sel.spec, rep);
    terminal.print(`Hiding ${rep} on "(${name})"`, 'result');
  },

  onSelectionLabel(name, prop) {
    const sel = getState().selections.get(name);
    if (!sel) return;
    applyLabel(sel.spec, prop);
    terminal.print(prop === 'clear' ? 'Labels cleared' : `Labeled "(${name})" by ${prop}`, 'result');
  },

  onSelectionColor(name, rawScheme) {
    const sel = getState().selections.get(name);
    if (!sel) return;
    applyColorToSelection(sel.spec, rawScheme);
    terminal.print(`Colored "(${name})" by ${formatColorDisplay(rawScheme)}`, 'result');
  },

  onSelectionView(name, presetName) {
    const sel = getState().selections.get(name);
    if (!sel) return;
    applyViewPreset(presetName, sel.spec);
    terminal.print(`Applied "${getPresetLabel(presetName)}" preset to "(${name})"`, 'result');
  },
});

// --- Create the menu bar with callbacks ---
const menubar = createMenuBar(document.getElementById('menubar-container'), {
  onLoad() {
    showLoadDialog({
      onFetch: async (pdbId) => {
        terminal.print(`Fetching PDB ${pdbId}...`, 'info');
        try {
          const model = await fetchPDB(pdbId);
          const modelIndex = model.getID ? model.getID() : null;
          const name = addObject(pdbId, model, modelIndex);
          terminal.print(`Loaded ${pdbId} as "${name}"`, 'result');
        } catch (e) {
          terminal.print(`Failed to fetch ${pdbId}: ${e.message}`, 'error');
        }
      },
      onLoad: (data, format, filename) => {
        try {
          const model = loadModelData(data, format);
          const modelIndex = model.getID ? model.getID() : null;
          const baseName = filename.replace(/\.[^.]+$/, '');
          const name = addObject(baseName, model, modelIndex);
          terminal.print(`Loaded "${filename}" as "${name}"`, 'result');
        } catch (e) {
          terminal.print(`Error loading file: ${e.message}`, 'error');
        }
      },
    });
  },

  onExport() {
    showExportDialog({
      onExportPNG: (width, height) => {
        const viewer = getViewer();
        const srcCanvas = viewer.getCanvas();
        if (!srcCanvas) {
          terminal.print('Export failed: no canvas available', 'error');
          return;
        }
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = width;
        tmpCanvas.height = height;
        const ctx2d = tmpCanvas.getContext('2d');
        ctx2d.drawImage(srcCanvas, 0, 0, width, height);
        const dataUri = tmpCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = 'screenshot.png';
        link.click();
        terminal.print(`Screenshot exported (${width}x${height})`, 'result');
      },
    });
  },

  onView(presetName) {
    const reps = applyViewPreset(presetName);
    const state = getState();
    for (const [, obj] of state.objects) {
      obj.representations = new Set(reps);
    }
    notifyStateChange();
    terminal.print(`Applied "${getPresetLabel(presetName)}" preset`, 'result');
  },

  onSelectionMode(mode) {
    setSelectionMode(mode);
    terminal.print(`Selection mode: ${mode}`, 'info');
  },

  onSelect(type) {
    const v = getViewer();
    const AMINO = [
      'ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE',
      'LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL',
      'HSD','HSE','HSP','HIE','HID','HIP','CYX','MSE',
    ];

    let selSpec;
    let description;

    switch (type) {
      case 'protein':
        selSpec = { resn: AMINO };
        description = 'protein';
        break;
      case 'ligand':
        selSpec = { hetflag: true, not: { resn: ['HOH', 'WAT', 'H2O'] } };
        description = 'ligand';
        break;
      case 'backbone':
        selSpec = { resn: AMINO, atom: ['N', 'CA', 'C', 'O'] };
        description = 'backbone';
        break;
      case 'sidechains':
        selSpec = { resn: AMINO, not: { atom: ['N', 'CA', 'C', 'O'] } };
        description = 'side chains';
        break;
      default:
        return;
    }

    const atoms = v.selectedAtoms(selSpec);
    if (atoms.length === 0) {
      terminal.print(`No atoms matched for ${description}`, 'info');
      return;
    }

    selectedAtomIndices.clear();
    for (const a of atoms) {
      selectedAtomIndices.add(a.index);
    }
    const combinedSpec = { index: [...selectedAtomIndices] };

    clearHighlight();
    applyHighlight(combinedSpec);
    setActiveSelection(combinedSpec);
    addSelection('sele', description, combinedSpec, atoms.length);
    terminal.print(`Selected ${description} [${atoms.length} atoms]`, 'info');
  },

  onExpand(type) {
    const state = getState();
    if (!state.activeSelection) {
      terminal.print('No active selection to expand', 'info');
      return;
    }

    const v = getViewer();
    const currentAtoms = v.selectedAtoms(state.activeSelection);
    if (currentAtoms.length === 0) {
      terminal.print('Current selection contains no atoms', 'info');
      return;
    }

    const expandedIndices = new Set(currentAtoms.map(a => a.index));
    const allAtoms = v.selectedAtoms({});
    let description;

    switch (type) {
      case 'residues': {
        const keys = new Set(currentAtoms.map(a => `${a.chain}:${a.resi}`));
        for (const a of allAtoms) {
          if (keys.has(`${a.chain}:${a.resi}`)) expandedIndices.add(a.index);
        }
        description = 'residues';
        break;
      }
      case 'chains': {
        const chains = new Set(currentAtoms.map(a => a.chain));
        for (const a of allAtoms) {
          if (chains.has(a.chain)) expandedIndices.add(a.index);
        }
        description = 'chains';
        break;
      }
      case 'molecules': {
        const models = new Set(currentAtoms.map(a => a.model));
        for (const a of allAtoms) {
          if (models.has(a.model)) expandedIndices.add(a.index);
        }
        description = 'molecules';
        break;
      }
      case 'nearAtoms': {
        const DIST_SQ = 25; // 5Å squared
        for (const a of allAtoms) {
          if (expandedIndices.has(a.index)) continue;
          for (const sel of currentAtoms) {
            const dx = a.x - sel.x;
            const dy = a.y - sel.y;
            const dz = a.z - sel.z;
            if (dx * dx + dy * dy + dz * dz <= DIST_SQ) {
              expandedIndices.add(a.index);
              break;
            }
          }
        }
        description = 'near atoms (5\u00C5)';
        break;
      }
      case 'nearResidues': {
        const DIST_SQ = 25;
        const nearIndices = new Set([...expandedIndices]);
        for (const a of allAtoms) {
          if (nearIndices.has(a.index)) continue;
          for (const sel of currentAtoms) {
            const dx = a.x - sel.x;
            const dy = a.y - sel.y;
            const dz = a.z - sel.z;
            if (dx * dx + dy * dy + dz * dz <= DIST_SQ) {
              nearIndices.add(a.index);
              break;
            }
          }
        }
        // Expand near atoms to full residues
        const nearAtomsList = allAtoms.filter(a => nearIndices.has(a.index));
        const keys = new Set(nearAtomsList.map(a => `${a.chain}:${a.resi}`));
        for (const a of allAtoms) {
          if (keys.has(`${a.chain}:${a.resi}`)) expandedIndices.add(a.index);
        }
        description = 'near residues (5\u00C5)';
        break;
      }
      default:
        return;
    }

    selectedAtomIndices = expandedIndices;
    const combinedSpec = { index: [...selectedAtomIndices] };

    clearHighlight();
    applyHighlight(combinedSpec);
    setActiveSelection(combinedSpec);
    addSelection('sele', `expand ${description}`, combinedSpec, expandedIndices.size);
    terminal.print(`Expanded to ${description} [${expandedIndices.size} atoms]`, 'info');
  },

  onSelectionAction(action) {
    const state = getState();
    if (!state.activeSelection) {
      terminal.print('No active selection', 'info');
      return;
    }
    const v = getViewer();
    switch (action) {
      case 'center':
        v.center(state.activeSelection);
        v.render();
        terminal.print('Centered on selection', 'result');
        break;
      case 'zoom':
        v.zoomTo(state.activeSelection);
        v.render();
        terminal.print('Zoomed to selection', 'result');
        break;
    }
  },

  onToggleSidebar() {
    app.classList.toggle('sidebar-hidden');
    getViewer().resize();
    getViewer().render();
  },

  onToggleTerminal() {
    app.classList.toggle('terminal-hidden');
    getViewer().resize();
    getViewer().render();
  },

  onToggleCompact(isCompact) {
    menubar.setCompact(isCompact);
  },

  onThemeChange(theme) {
    const state = getState();
    state.settings.theme = theme;
    document.body.dataset.theme = theme === 'light' ? 'light' : '';

    if (!state.settings.userSetBgColor) {
      const bgColor = theme === 'light' ? '#ffffff' : '#000000';
      state.settings.bgColor = bgColor;
      getViewer().setBackgroundColor(bgColor);
    }

    refreshLabels();
    getViewer().render();
    notifyStateChange();

    try {
      localStorage.setItem('3dmol-gui-theme', theme);
    } catch (e) {
      // localStorage may be unavailable
    }
  },
});

// --- Restore saved theme preference ---
{
  let savedTheme = 'dark';
  try {
    savedTheme = localStorage.getItem('3dmol-gui-theme') || 'dark';
  } catch (e) {
    // localStorage unavailable
  }
  if (savedTheme === 'light') {
    const state = getState();
    state.settings.theme = 'light';
    document.body.dataset.theme = 'light';
    menubar.setTheme('light');
    if (!state.settings.userSetBgColor) {
      state.settings.bgColor = '#ffffff';
      getViewer().setBackgroundColor('#ffffff');
      getViewer().render();
    }
  }
}

// --- Command system ---
const registry = createCommandRegistry();
const ctx = createCommandContext({
  viewer: getViewer(),
  terminal,
  sidebar,
  state: getState(),
});
registerAllCommands(registry);

// --- Viewer click handler for visual selection ---
/** @type {Set<number>} Accumulated atom indices for shift+click multi-selection. */
let selectedAtomIndices = new Set();
/** @type {boolean} Flag to detect background clicks (no atom hit). */
let atomClickedThisCycle = false;

/**
 * Build a mode-based selection spec and description from a clicked atom.
 */
function buildModeSelection(atom, state) {
  const mode = state.selectionMode;
  let selSpec;
  let description;

  switch (mode) {
    case 'atoms':
      selSpec = { serial: atom.serial };
      description = `atom ${atom.atom} (${atom.resn} ${atom.chain}:${atom.resi})`;
      break;
    case 'residues':
      selSpec = { chain: atom.chain, resi: atom.resi };
      description = `residue ${atom.resn} ${atom.chain}:${atom.resi}`;
      break;
    case 'chains':
      selSpec = { chain: atom.chain };
      description = `chain ${atom.chain}`;
      break;
    case 'molecules': {
      let modelSpec = {};
      for (const [name, obj] of state.objects) {
        const modelId = obj.model.getID ? obj.model.getID() : obj.modelIndex;
        if (modelId === atom.model) {
          modelSpec = { model: obj.model };
          description = `molecule "${name}"`;
          break;
        }
      }
      if (!description) description = 'all atoms';
      selSpec = modelSpec;
      break;
    }
    default:
      selSpec = { serial: atom.serial };
      description = `atom ${atom.atom}`;
  }

  return { selSpec, description };
}

function handleViewerClick(atom, viewerInstance, event) {
  atomClickedThisCycle = true;
  const state = getState();
  const mode = state.selectionMode;
  const isShift = event && event.shiftKey;

  const { selSpec: clickSpec, description } = buildModeSelection(atom, state);

  // Get atoms matching the clicked selection to collect their indices
  const matchedAtoms = viewerInstance.selectedAtoms(clickSpec);

  if (!isShift) {
    // Regular click: replace selection
    selectedAtomIndices.clear();
  }

  for (const a of matchedAtoms) {
    selectedAtomIndices.add(a.index);
  }

  // Build combined spec from all accumulated indices
  const combinedSpec = { index: [...selectedAtomIndices] };

  clearHighlight();
  applyHighlight(combinedSpec);
  setActiveSelection(combinedSpec);
  addSelection('sele', 'click selection', combinedSpec, selectedAtomIndices.size);

  const verb = isShift ? 'Added' : 'Selected';
  const count = selectedAtomIndices.size;
  terminal.print(`${verb} ${description} [mode: ${mode}, ${count} atom${count !== 1 ? 's' : ''} total]`, 'info');
}

// Register the click callback — viewer.js stores it and automatically
// re-registers after each fetchPDB/loadModelData call.
setupClickHandler(handleViewerClick);

// Clear selection when clicking on empty space (no atom hit).
// Track mouse movement to distinguish intentional clicks from drag rotations.
{
  const DRAG_THRESHOLD = 4; // pixels
  let mouseDownPos = null;
  const viewerContainer = document.getElementById('viewer-container');

  viewerContainer.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });

  viewerContainer.addEventListener('click', (e) => {
    const wasDrag = mouseDownPos && (
      Math.abs(e.clientX - mouseDownPos.x) > DRAG_THRESHOLD ||
      Math.abs(e.clientY - mouseDownPos.y) > DRAG_THRESHOLD
    );
    mouseDownPos = null;

    if (wasDrag) return; // Rotation/pan, not a click

    setTimeout(() => {
      if (!atomClickedThisCycle && selectedAtomIndices.size > 0) {
        selectedAtomIndices.clear();
        clearHighlight();
        setActiveSelection(null);
        removeSelection('sele');
      }
      atomClickedThisCycle = false;
    }, 0);
  });
}

// --- Right-click context menu on the viewer ---
createContextMenu(document.getElementById('viewer-container'), {
  hasSelection() {
    return getState().activeSelection !== null;
  },

  onAction(action) {
    const v = getViewer();
    const selSpec = getState().activeSelection;
    if (!selSpec) return;
    switch (action) {
      case 'center':
        v.center(selSpec);
        v.render();
        terminal.print('Centered on selection', 'result');
        break;
      case 'zoom':
        v.zoomTo(selSpec);
        v.render();
        terminal.print('Zoomed to selection', 'result');
        break;
    }
  },

  onView(presetName) {
    const selSpec = getState().activeSelection;
    if (!selSpec) return;
    applyViewPreset(presetName, selSpec);
    terminal.print(`Applied "${getPresetLabel(presetName)}" preset to selection`, 'result');
  },

  onShow(rep) {
    const v = getViewer();
    const selSpec = getState().activeSelection;
    if (!selSpec) return;
    v.addStyle(selSpec, repStyle(rep));
    v.render();
    terminal.print(`Showing ${rep} on selection`, 'result');
  },

  onHide(rep) {
    const selSpec = getState().activeSelection;
    if (!selSpec) return;
    applyHideSelection(selSpec, rep);
    terminal.print(`Hiding ${rep} on selection`, 'result');
  },

  onLabel(prop) {
    const selSpec = getState().activeSelection;
    if (!selSpec) return;
    applyLabel(selSpec, prop);
    terminal.print(prop === 'clear' ? 'Labels cleared' : `Labeled selection by ${prop}`, 'result');
  },

  onColor(rawScheme) {
    const selSpec = getState().activeSelection;
    if (!selSpec) return;
    applyColorToSelection(selSpec, rawScheme);
    terminal.print(`Colored selection by ${formatColorDisplay(rawScheme)}`, 'result');
  },
});

// --- Tab autocomplete ---
terminal.setCompleter((prefix, isFirstWord) => {
  if (isFirstWord) {
    return registry.completions(prefix);
  }
  const state = getState();
  const lower = prefix.toLowerCase();
  const names = [
    ...state.objects.keys(),
    ...state.selections.keys(),
  ];
  return names.filter(n => n.toLowerCase().startsWith(lower)).sort();
});

// --- Register state change listener ---
onStateChange(() => sidebar.refresh(getState()));

// --- Initialization / Quick-start ---
let dismissQuickstart = null;
const init = window.__C3D_INIT__;

if (init) {
  const v = getViewer();

  // Load molecules (addModel only, no per-molecule styling/zoom/render)
  const molecules = init.molecules || [];
  for (const mol of molecules) {
    try {
      const model = v.addModel(mol.data, mol.format);
      const modelIndex = model.getID ? model.getID() : null;
      const name = addObject(mol.name || mol.format, model, modelIndex);
      if (mol.disabled) {
        const st = getState();
        const obj = st.objects.get(name);
        if (obj) {
          obj.visible = false;
          model.hide();
        }
      }
    } catch (e) {
      terminal.print(`Failed to load "${mol.name || mol.format}": ${e.message}`, 'error');
    }
  }

  // Re-register click handler now that all models are loaded
  setupClickHandler(handleViewerClick);

  // Apply styles: preset takes precedence, then custom styles, then default wire
  v.setStyle({}, {});

  if (init.preset) {
    const reps = applyPreset(init.preset, v);
    const st = getState();
    for (const [, obj] of st.objects) {
      obj.representations = new Set(reps);
    }
    notifyStateChange();
  } else {
    const styles = init.styles || [];
    if (styles.length > 0) {
      for (const s of styles) {
        v.addStyle(s.selection || {}, s.style || {});
      }
    } else {
      v.setStyle({}, repStyle('line'));
    }
  }

  // Configure UI visibility
  if (init.ui) {
    if (init.ui.sidebar === false) {
      app.classList.add('sidebar-hidden');
    }
    if (init.ui.terminal === false) {
      app.classList.add('terminal-hidden');
    }
    if (init.ui.menubar === false) {
      app.classList.add('menubar-hidden');
    }
  }

  // Set background color
  if (init.background) {
    v.setBackgroundColor(init.background);
    const state = getState();
    state.settings.bgColor = init.background;
    state.settings.userSetBgColor = true;
    notifyStateChange();
  }

  // Apply zoom (wrapped in try-catch so failures don't prevent render)
  try {
    if (init.zoomTo !== undefined && init.zoomTo !== null) {
      if (typeof init.zoomTo === 'string') {
        const result = resolveSelection(init.zoomTo);
        const selSpec = getSelSpec(result);
        v.zoomTo(selSpec);
      } else {
        v.zoomTo(init.zoomTo);
      }
    } else {
      v.zoomTo();
    }
  } catch (e) {
    terminal.print(`Zoom failed: ${e.message}`, 'error');
    v.zoomTo();
  }

  v.render();
  terminal.print(`Loaded ${molecules.length} molecule(s) from initialization`, 'info');
} else {
  // --- Welcome message ---
  terminal.print('3Dmol.js GUI ready. Type "help" for commands.', 'info');

  // --- Quick-start overlay ---
  dismissQuickstart = showQuickstart({
    async onTry() {
      terminal.print('> fetch 1CRN', 'command');
      try {
        await registry.execute('fetch 1CRN', ctx);
      } catch (e) {
        terminal.print(e.message, 'error');
      }
    },
    onDismiss() {},
  });
}

// --- Terminal command handler ---
terminal.onCommand(async (input) => {
  if (dismissQuickstart) {
    dismissQuickstart();
    dismissQuickstart = null;
  }
  terminal.print(`> ${input}`, 'command');
  try {
    await registry.execute(input, ctx);
  } catch (e) {
    terminal.print(e.message, 'error');
  }
});
