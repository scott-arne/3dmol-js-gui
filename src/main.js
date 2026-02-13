/**
 * Main application bootstrap for the 3Dmol.js GUI.
 *
 * Wires together all UI components (menu bar, sidebar, terminal), the 3Dmol
 * viewer, and the application state store into a working application.
 */

import './ui/styles.css';
import { initViewer, getViewer, fetchPDB, loadModelData, setupClickHandler, clearHighlight, applyHighlight, repStyle, addTrackedLabel, clearAllLabels, refreshLabels } from './viewer.js';
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
import { CHAIN_PALETTES, SS_PALETTES, BFACTOR_DEFAULTS, buildBfactorScheme } from './ui/color-swatches.js';
import { createCommandRegistry, createCommandContext } from './commands/registry.js';
import { registerAllCommands } from './commands/index.js';
import { showLoadDialog, showExportDialog } from './ui/dialogs.js';
import { createContextMenu } from './ui/context-menu.js';
import { applyPreset, PRESETS } from './presets.js';

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
        const newName = prompt(`Rename "${name}" to:`);
        if (newName && newName.trim()) {
          renameObject(name, newName.trim());
          terminal.print(`Renamed "${name}" to "${newName.trim()}"`, 'result');
        }
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
    const viewer = getViewer();
    const sel = { model: obj.model };

    // Line/stick interaction: both map to 3Dmol stick geometry
    const skipVisual = rep === 'line' && obj.representations.has('stick');
    const rebuildVisual = rep === 'stick' && obj.representations.has('line');

    obj.representations.add(rep);

    if (skipVisual) {
      // Sticks already cover lines — no visual change needed
    } else if (rebuildVisual) {
      viewer.setStyle(sel, {});
      for (const r of obj.representations) {
        if (r === 'line' && obj.representations.has('stick')) continue;
        viewer.addStyle(sel, repStyle(r));
      }
    } else {
      viewer.addStyle(sel, repStyle(rep));
    }

    viewer.render();
    notifyStateChange();
    terminal.print(`Showing ${rep} on "${name}"`, 'result');
  },

  onHide(name, rep) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    const viewer = getViewer();
    const sel = { model: obj.model };

    if (rep === 'everything') {
      viewer.setStyle(sel, {});
      obj.representations.clear();
    } else {
      viewer.setStyle(sel, {});
      obj.representations.delete(rep);
      for (const r of obj.representations) {
        // Skip line when stick is also active (stick covers line)
        if (r === 'line' && obj.representations.has('stick')) continue;
        viewer.addStyle(sel, repStyle(r));
      }
    }
    viewer.render();
    notifyStateChange();
    terminal.print(`Hiding ${rep} on "${name}"`, 'result');
  },

  onLabel(name, prop) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    const viewer = getViewer();

    if (prop === 'clear') {
      clearAllLabels();
      viewer.render();
      terminal.print('Labels cleared', 'result');
      return;
    }

    const propMap = { atom: 'atom', resn: 'resn', resi: 'resi', chain: 'chain', elem: 'elem', index: 'serial' };
    const atomProp = propMap[prop] || prop;
    let atoms = viewer.selectedAtoms({ model: obj.model });
    if (['resn', 'resi', 'chain'].includes(prop)) {
      atoms = atoms.filter(a => a.atom === 'CA');
    }
    for (const atom of atoms) {
      addTrackedLabel(String(atom[atomProp]), { x: atom.x, y: atom.y, z: atom.z });
    }
    viewer.render();
    terminal.print(`Labeled "${name}" by ${prop}`, 'result');
  },

  onView(name, presetName) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    const viewer = getViewer();
    const reps = applyPreset(presetName, viewer, { model: obj.model });
    obj.representations = new Set(reps);
    notifyStateChange();
    const label = PRESETS[presetName.toLowerCase()].label;
    terminal.print(`Applied "${label}" preset to "${name}"`, 'result');
  },

  onColor(name, rawScheme) {
    const state = getState();
    const obj = state.objects.get(name);
    if (!obj) return;
    const viewer = getViewer();
    const selSpec = { model: obj.model };

    // Parse optional carbon color from "element:#RRGGBB" format
    let scheme = rawScheme;
    let carbonHex = null;
    if (scheme.startsWith('element:')) {
      carbonHex = scheme.slice(8);
      scheme = 'element';
    }

    // Parse optional chain palette from "chain:paletteName" format
    let chainPalette = null;
    if (scheme.startsWith('chain:')) {
      chainPalette = scheme.slice(6);
      scheme = 'chain';
    }

    // Parse optional SS palette from "ss:paletteName" format
    let ssPalette = null;
    if (scheme.startsWith('ss:')) {
      ssPalette = scheme.slice(3);
      scheme = 'ss';
    }

    // Check if it is a coloring scheme
    const bfMin = state.settings.bfactorMin ?? BFACTOR_DEFAULTS.min;
    const bfMax = state.settings.bfactorMax ?? BFACTOR_DEFAULTS.max;
    const schemes = { element: 'Jmol', chain: 'chain', ss: 'ssJmol', bfactor: buildBfactorScheme(bfMin, bfMax) };
    if (schemes[scheme]) {
      let colorscheme = schemes[scheme];

      // Build custom chain colorscheme from palette
      if (chainPalette && CHAIN_PALETTES[chainPalette]) {
        const palette = CHAIN_PALETTES[chainPalette].colors;
        const atoms = viewer.selectedAtoms(selSpec);
        const chains = [...new Set(atoms.map(a => a.chain))].sort();
        const map = {};
        chains.forEach((ch, i) => { map[ch] = palette[i % palette.length]; });
        colorscheme = { prop: 'chain', map };
      }

      // Build custom SS colorscheme from palette
      if (ssPalette) {
        const pal = SS_PALETTES.find(p => p.key === ssPalette);
        if (pal && pal.key !== 'default') {
          colorscheme = { prop: 'ss', map: { h: pal.helix, s: pal.sheet, c: pal.loop, '': pal.loop } };
        }
      }

      const reps = obj.representations.size > 0 ? obj.representations : new Set(['cartoon']);
      const styleObj = {};
      for (const rep of reps) {
        if (scheme === 'bfactor') {
          styleObj[rep] = { colorfunc: colorscheme };
        } else {
          styleObj[rep] = { colorscheme };
        }
      }
      viewer.setStyle(selSpec, styleObj);

      // Override carbon atoms with the chosen swatch color
      if (carbonHex) {
        const carbonSel = Object.assign({}, selSpec, { elem: 'C' });
        const carbonStyle = {};
        for (const rep of reps) {
          carbonStyle[rep] = { color: carbonHex };
        }
        viewer.setStyle(carbonSel, carbonStyle);
      }
    } else {
      // Named color or hex value
      const colorMap = {
        red: '#FF0000', green: '#00FF00', blue: '#0000FF',
        yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF',
        orange: '#FFA500', white: '#FFFFFF', grey: '#808080',
      };
      const hex = colorMap[scheme] || scheme;
      const styleObj = {};
      for (const rep of obj.representations) {
        styleObj[rep] = { color: hex };
      }
      if (Object.keys(styleObj).length === 0) {
        styleObj.cartoon = { color: hex };
      }
      viewer.setStyle(selSpec, styleObj);
    }
    viewer.render();
    const display = carbonHex ? `element (C=${carbonHex})` : chainPalette ? `chain (${chainPalette})` : ssPalette ? `ss (${ssPalette})` : scheme;
    terminal.print(`Colored "${name}" by ${display}`, 'result');
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
        const newName = prompt(`Rename "(${name})" to:`);
        if (newName && newName.trim()) {
          renameSelection(name, newName.trim());
          terminal.print(`Renamed "(${name})" to "(${newName.trim()})"`, 'result');
        }
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
    const v = getViewer();
    if (rep === 'everything') {
      v.setStyle(sel.spec, {});
    } else {
      v.setStyle(sel.spec, {});
      const state = getState();
      for (const [, obj] of state.objects) {
        if (!obj.visible) continue;
        const intersect = Object.assign({}, sel.spec, { model: obj.model });
        for (const r of obj.representations) {
          if (r !== rep) v.addStyle(intersect, repStyle(r));
        }
      }
    }
    v.render();
    terminal.print(`Hiding ${rep} on "(${name})"`, 'result');
  },

  onSelectionLabel(name, prop) {
    const sel = getState().selections.get(name);
    if (!sel) return;
    const v = getViewer();

    if (prop === 'clear') {
      clearAllLabels();
      v.render();
      terminal.print('Labels cleared', 'result');
      return;
    }

    const propMap = { atom: 'atom', resn: 'resn', resi: 'resi', chain: 'chain', elem: 'elem', index: 'serial' };
    const atomProp = propMap[prop] || prop;
    let atoms = v.selectedAtoms(sel.spec);
    if (['resn', 'resi', 'chain'].includes(prop)) {
      atoms = atoms.filter(a => a.atom === 'CA');
    }
    for (const atom of atoms) {
      addTrackedLabel(String(atom[atomProp]), { x: atom.x, y: atom.y, z: atom.z });
    }
    v.render();
    terminal.print(`Labeled "(${name})" by ${prop}`, 'result');
  },

  onSelectionColor(name, rawScheme) {
    const sel = getState().selections.get(name);
    if (!sel) return;
    const v = getViewer();
    const state = getState();

    let scheme = rawScheme;
    let carbonHex = null;
    if (scheme.startsWith('element:')) {
      carbonHex = scheme.slice(8);
      scheme = 'element';
    }

    let chainPalette = null;
    if (scheme.startsWith('chain:')) {
      chainPalette = scheme.slice(6);
      scheme = 'chain';
    }

    let ssPalette = null;
    if (scheme.startsWith('ss:')) {
      ssPalette = scheme.slice(3);
      scheme = 'ss';
    }

    const bfMin = state.settings.bfactorMin ?? BFACTOR_DEFAULTS.min;
    const bfMax = state.settings.bfactorMax ?? BFACTOR_DEFAULTS.max;
    const schemes = {
      element: 'Jmol', chain: 'chain', ss: 'ssJmol',
      bfactor: buildBfactorScheme(bfMin, bfMax),
    };
    const colorMap = {
      red: '#FF0000', green: '#00FF00', blue: '#0000FF',
      yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF',
      orange: '#FFA500', white: '#FFFFFF', grey: '#808080',
    };

    // Build custom chain colorscheme once for the whole selection
    let customScheme = null;
    if (chainPalette && CHAIN_PALETTES[chainPalette]) {
      const palette = CHAIN_PALETTES[chainPalette].colors;
      const atoms = v.selectedAtoms(sel.spec);
      const chains = [...new Set(atoms.map(a => a.chain))].sort();
      const map = {};
      chains.forEach((ch, i) => { map[ch] = palette[i % palette.length]; });
      customScheme = { prop: 'chain', map };
    }

    // Build custom SS colorscheme from palette
    if (ssPalette) {
      const pal = SS_PALETTES.find(p => p.key === ssPalette);
      if (pal && pal.key !== 'default') {
        customScheme = { prop: 'ss', map: { h: pal.helix, s: pal.sheet, c: pal.loop, '': pal.loop } };
      }
    }

    for (const [, obj] of state.objects) {
      if (!obj.visible) continue;
      const intersect = Object.assign({}, sel.spec, { model: obj.model });
      const reps = obj.representations.size > 0 ? obj.representations : new Set(['cartoon']);
      const styleObj = {};
      for (const rep of reps) {
        if (schemes[scheme]) {
          const val = customScheme || schemes[scheme];
          if (scheme === 'bfactor') {
            styleObj[rep] = { colorfunc: val };
          } else {
            styleObj[rep] = { colorscheme: val };
          }
        } else {
          const hex = colorMap[scheme] || scheme;
          styleObj[rep] = { color: hex };
        }
      }
      v.setStyle(intersect, styleObj);

      if (carbonHex && schemes[scheme]) {
        const carbonSel = Object.assign({}, intersect, { elem: 'C' });
        const carbonStyle = {};
        for (const rep of reps) {
          carbonStyle[rep] = { color: carbonHex };
        }
        v.setStyle(carbonSel, carbonStyle);
      }
    }
    v.render();
    const display = carbonHex ? `element (C=${carbonHex})` : chainPalette ? `chain (${chainPalette})` : ssPalette ? `ss (${ssPalette})` : scheme;
    terminal.print(`Colored "(${name})" by ${display}`, 'result');
  },

  onSelectionView(name, presetName) {
    const sel = getState().selections.get(name);
    if (!sel) return;
    const v = getViewer();
    applyPreset(presetName, v, sel.spec);
    const label = PRESETS[presetName.toLowerCase()].label;
    terminal.print(`Applied "${label}" preset to "(${name})"`, 'result');
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
        const dataUri = viewer.pngURI();
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = 'screenshot.png';
        link.click();
        terminal.print('Screenshot exported', 'result');
      },
    });
  },

  onView(presetName) {
    const v = getViewer();
    const reps = applyPreset(presetName, v);
    const state = getState();
    for (const [, obj] of state.objects) {
      obj.representations = new Set(reps);
    }
    notifyStateChange();
    const label = PRESETS[presetName.toLowerCase()].label;
    terminal.print(`Applied "${label}" preset`, 'result');
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
    let description;

    switch (type) {
      case 'residues': {
        const keys = new Set(currentAtoms.map(a => `${a.chain}:${a.resi}`));
        for (const a of v.selectedAtoms({})) {
          if (keys.has(`${a.chain}:${a.resi}`)) expandedIndices.add(a.index);
        }
        description = 'residues';
        break;
      }
      case 'chains': {
        const chains = new Set(currentAtoms.map(a => a.chain));
        for (const a of v.selectedAtoms({})) {
          if (chains.has(a.chain)) expandedIndices.add(a.index);
        }
        description = 'chains';
        break;
      }
      case 'molecules': {
        const models = new Set(currentAtoms.map(a => a.model));
        for (const a of v.selectedAtoms({})) {
          if (models.has(a.model)) expandedIndices.add(a.index);
        }
        description = 'molecules';
        break;
      }
      case 'nearAtoms': {
        const DIST_SQ = 25; // 5Å squared
        const allAtoms = v.selectedAtoms({});
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
        const allAtoms = v.selectedAtoms({});
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
    const v = getViewer();
    const selSpec = getState().activeSelection;
    if (!selSpec) return;
    applyPreset(presetName, v, selSpec);
    const label = PRESETS[presetName.toLowerCase()].label;
    terminal.print(`Applied "${label}" preset to selection`, 'result');
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
    const v = getViewer();
    const state = getState();
    const selSpec = state.activeSelection;
    if (!selSpec) return;

    if (rep === 'everything') {
      v.setStyle(selSpec, {});
    } else {
      // For each object, rebuild styles on the intersection of the selection
      // and the object's atoms, excluding the hidden representation.
      for (const [, obj] of state.objects) {
        if (!obj.visible) continue;
        const intersect = Object.assign({}, selSpec, { model: obj.model });
        v.setStyle(intersect, {});
        for (const r of obj.representations) {
          if (r !== rep) {
            v.addStyle(intersect, repStyle(r));
          }
        }
      }
    }
    v.render();
    terminal.print(`Hiding ${rep} on selection`, 'result');
  },

  onLabel(prop) {
    const v = getViewer();
    const selSpec = getState().activeSelection;
    if (!selSpec) return;

    if (prop === 'clear') {
      clearAllLabels();
      v.render();
      terminal.print('Labels cleared', 'result');
      return;
    }

    const propMap = { atom: 'atom', resn: 'resn', resi: 'resi', chain: 'chain', elem: 'elem', index: 'serial' };
    const atomProp = propMap[prop] || prop;
    let atoms = v.selectedAtoms(selSpec);
    if (['resn', 'resi', 'chain'].includes(prop)) {
      atoms = atoms.filter(a => a.atom === 'CA');
    }
    for (const atom of atoms) {
      addTrackedLabel(String(atom[atomProp]), { x: atom.x, y: atom.y, z: atom.z });
    }
    v.render();
    terminal.print(`Labeled selection by ${prop}`, 'result');
  },

  onColor(rawScheme) {
    const v = getViewer();
    const state = getState();
    const selSpec = state.activeSelection;
    if (!selSpec) return;

    let scheme = rawScheme;
    let carbonHex = null;
    if (scheme.startsWith('element:')) {
      carbonHex = scheme.slice(8);
      scheme = 'element';
    }

    let chainPalette = null;
    if (scheme.startsWith('chain:')) {
      chainPalette = scheme.slice(6);
      scheme = 'chain';
    }

    let ssPalette = null;
    if (scheme.startsWith('ss:')) {
      ssPalette = scheme.slice(3);
      scheme = 'ss';
    }

    const bfMin = state.settings.bfactorMin ?? BFACTOR_DEFAULTS.min;
    const bfMax = state.settings.bfactorMax ?? BFACTOR_DEFAULTS.max;
    const schemes = {
      element: 'Jmol', chain: 'chain', ss: 'ssJmol',
      bfactor: buildBfactorScheme(bfMin, bfMax),
    };
    const colorMap = {
      red: '#FF0000', green: '#00FF00', blue: '#0000FF',
      yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF',
      orange: '#FFA500', white: '#FFFFFF', grey: '#808080',
    };

    // Build custom chain colorscheme once for the whole selection
    let customScheme = null;
    if (chainPalette && CHAIN_PALETTES[chainPalette]) {
      const palette = CHAIN_PALETTES[chainPalette].colors;
      const atoms = v.selectedAtoms(selSpec);
      const chains = [...new Set(atoms.map(a => a.chain))].sort();
      const map = {};
      chains.forEach((ch, i) => { map[ch] = palette[i % palette.length]; });
      customScheme = { prop: 'chain', map };
    }

    // Build custom SS colorscheme from palette
    if (ssPalette) {
      const pal = SS_PALETTES.find(p => p.key === ssPalette);
      if (pal && pal.key !== 'default') {
        customScheme = { prop: 'ss', map: { h: pal.helix, s: pal.sheet, c: pal.loop, '': pal.loop } };
      }
    }

    // Apply color to each object's active representations on the intersection
    for (const [, obj] of state.objects) {
      if (!obj.visible) continue;
      const intersect = Object.assign({}, selSpec, { model: obj.model });
      const reps = obj.representations.size > 0 ? obj.representations : new Set(['cartoon']);
      const styleObj = {};
      for (const rep of reps) {
        if (schemes[scheme]) {
          const val = customScheme || schemes[scheme];
          if (scheme === 'bfactor') {
            styleObj[rep] = { colorfunc: val };
          } else {
            styleObj[rep] = { colorscheme: val };
          }
        } else {
          const hex = colorMap[scheme] || scheme;
          styleObj[rep] = { color: hex };
        }
      }
      v.setStyle(intersect, styleObj);

      if (carbonHex && schemes[scheme]) {
        const carbonSel = Object.assign({}, intersect, { elem: 'C' });
        const carbonStyle = {};
        for (const rep of reps) {
          carbonStyle[rep] = { color: carbonHex };
        }
        v.setStyle(carbonSel, carbonStyle);
      }
    }
    v.render();
    const display = carbonHex ? `element (C=${carbonHex})` : chainPalette ? `chain (${chainPalette})` : ssPalette ? `ss (${ssPalette})` : scheme;
    terminal.print(`Colored selection by ${display}`, 'result');
  },
});

// --- Quick-start overlay ---
// Declared here so the terminal command handler can dismiss it on first use.
let quickstartOverlay = null;

function dismissQuickstart() {
  if (quickstartOverlay && quickstartOverlay.parentNode) {
    quickstartOverlay.remove();
  }
  quickstartOverlay = null;
}

// --- Terminal command handler ---
terminal.onCommand(async (input) => {
  // Auto-dismiss the quick-start overlay on first command
  dismissQuickstart();

  terminal.print(`> ${input}`, 'command');
  try {
    await registry.execute(input, ctx);
  } catch (e) {
    terminal.print(e.message, 'error');
  }
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

// --- Welcome message ---
terminal.print('3Dmol.js GUI ready. Type "help" for commands.', 'info');

// --- Build and show quick-start overlay ---
{
  const exampleCommands = [
    { cmd: 'fetch 1CRN', desc: 'Download a structure from the PDB' },
    { cmd: 'show cartoon', desc: 'Display as cartoon ribbon' },
    { cmd: 'color chain', desc: 'Color by chain assignment' },
    { cmd: 'zoom', desc: 'Zoom to fit the molecule' },
    { cmd: 'help', desc: 'List all available commands' },
  ];

  // Build overlay DOM
  const overlay = document.createElement('div');
  overlay.className = 'quickstart-overlay';

  const card = document.createElement('div');
  card.className = 'quickstart-card';

  const title = document.createElement('div');
  title.className = 'quickstart-title';
  title.textContent = '3Dmol.js GUI';

  const subtitle = document.createElement('div');
  subtitle.className = 'quickstart-subtitle';
  subtitle.textContent = 'A PyMOL-like interface for molecular visualization';

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

  // Store reference for auto-dismiss
  quickstartOverlay = overlay;

  // "Try it!" runs the demo command then dismisses
  tryBtn.addEventListener('click', async () => {
    dismissQuickstart();
    terminal.print('> fetch 1CRN', 'command');
    try {
      await registry.execute('fetch 1CRN', ctx);
    } catch (e) {
      terminal.print(e.message, 'error');
    }
  });

  // "Dismiss" just closes the overlay
  dismissLink.addEventListener('click', () => {
    dismissQuickstart();
  });
}
