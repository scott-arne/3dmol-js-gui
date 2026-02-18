/**
 * Shared action functions for color, label, show, hide, and view operations.
 *
 * Extracts duplicated logic from main.js sidebar, selection, and context menu
 * callbacks into reusable functions that operate on selection specs and object
 * representations.
 */

import { getViewer, repStyle, repKey, addTrackedLabel, clearAllLabels } from './viewer.js';
import { getState, notifyStateChange } from './state.js';
import { CHAIN_PALETTES, SS_PALETTES, BFACTOR_DEFAULTS, buildBfactorScheme } from './ui/color-swatches.js';
import { applyPreset, PRESETS } from './presets.js';

/**
 * Named color map for simple color names to hex values.
 * @type {Object<string, string>}
 */
const COLOR_MAP = {
  red: '#FF0000', green: '#00FF00', blue: '#0000FF',
  yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF',
  orange: '#FFA500', white: '#FFFFFF', grey: '#808080',
};

/**
 * Parse a raw color scheme string into its component parts.
 *
 * Handles formats like "element:#FF0000", "chain:pastel", "ss:cool",
 * or plain color strings like "red", "#FF0000", "element", "chain".
 *
 * @param {string} rawScheme - The raw scheme string from the UI.
 * @returns {{scheme: string, carbonHex: string|null, chainPalette: string|null, ssPalette: string|null}}
 */
export function parseColorScheme(rawScheme) {
  let scheme = rawScheme;
  let carbonHex = null;
  let chainPalette = null;
  let ssPalette = null;

  if (scheme.startsWith('element:')) {
    carbonHex = scheme.slice(8);
    scheme = 'element';
  } else if (scheme.startsWith('chain:')) {
    chainPalette = scheme.slice(6);
    scheme = 'chain';
  } else if (scheme.startsWith('ss:')) {
    ssPalette = scheme.slice(3);
    scheme = 'ss';
  }

  return { scheme, carbonHex, chainPalette, ssPalette };
}

/**
 * Format a raw color scheme string for human-readable display.
 *
 * @param {string} rawScheme - The raw scheme string.
 * @returns {string} A display-friendly string.
 */
export function formatColorDisplay(rawScheme) {
  const { scheme, carbonHex, chainPalette, ssPalette } = parseColorScheme(rawScheme);
  if (carbonHex) return `element (C=${carbonHex})`;
  if (chainPalette) return `chain (${chainPalette})`;
  if (ssPalette) return `ss (${ssPalette})`;
  return scheme;
}

/**
 * Build the schemes map and resolve custom colorschemes for chain/ss palettes.
 *
 * @param {string} scheme - The parsed scheme name.
 * @param {string|null} chainPalette - The chain palette name, if any.
 * @param {string|null} ssPalette - The SS palette name, if any.
 * @param {object} selSpec - The selection spec for querying atoms.
 * @returns {{schemes: object, customScheme: object|null}}
 */
function buildColorSchemes(scheme, chainPalette, ssPalette, selSpec) {
  const state = getState();
  const bfMin = state.settings.bfactorMin ?? BFACTOR_DEFAULTS.min;
  const bfMax = state.settings.bfactorMax ?? BFACTOR_DEFAULTS.max;
  const schemes = {
    element: 'Jmol',
    chain: 'chain',
    ss: 'ssJmol',
    bfactor: buildBfactorScheme(bfMin, bfMax),
  };

  let customScheme = null;

  if (chainPalette && CHAIN_PALETTES[chainPalette]) {
    const palette = CHAIN_PALETTES[chainPalette].colors;
    const atoms = getViewer().selectedAtoms(selSpec);
    const chains = [...new Set(atoms.map(a => a.chain))].sort();
    const map = {};
    chains.forEach((ch, i) => { map[ch] = palette[i % palette.length]; });
    customScheme = { prop: 'chain', map };
  }

  if (ssPalette) {
    const pal = SS_PALETTES.find(p => p.key === ssPalette);
    if (pal && pal.key !== 'default') {
      customScheme = { prop: 'ss', map: { h: pal.helix, s: pal.sheet, c: pal.loop, '': pal.loop } };
    }
  }

  return { schemes, customScheme };
}

/**
 * Apply a style object and optional carbon override for a given selection and
 * set of representations.
 *
 * @param {object} viewer - The 3Dmol viewer instance.
 * @param {object} selSpec - The selection spec.
 * @param {Set<string>} reps - The representations to style.
 * @param {string} scheme - The parsed scheme name.
 * @param {object} schemes - The schemes map.
 * @param {object|null} customScheme - A custom colorscheme override, if any.
 * @param {string|null} carbonHex - A hex color for carbon atoms, if any.
 */
function applyColorStyle(viewer, selSpec, reps, scheme, schemes, customScheme, carbonHex) {
  if (schemes[scheme]) {
    const colorscheme = customScheme || schemes[scheme];
    const styleObj = {};
    for (const rep of reps) {
      const key = repKey(rep);
      if (scheme === 'bfactor') {
        styleObj[key] = { colorfunc: colorscheme };
      } else {
        styleObj[key] = { colorscheme };
      }
    }
    viewer.setStyle(selSpec, styleObj);

    if (carbonHex) {
      const carbonSel = Object.assign({}, selSpec, { elem: 'C' });
      const carbonStyle = {};
      for (const rep of reps) {
        carbonStyle[repKey(rep)] = { color: carbonHex };
      }
      viewer.setStyle(carbonSel, carbonStyle);
    }
  } else {
    const hex = COLOR_MAP[scheme] || scheme;
    const styleObj = {};
    for (const rep of reps) {
      styleObj[repKey(rep)] = { color: hex };
    }
    viewer.setStyle(selSpec, styleObj);
  }
}

/**
 * Apply color to a single object.
 *
 * Takes the selection spec scoped to the object's model, the object's
 * representations Set, and the raw scheme string. Builds the color value,
 * applies via setStyle, handles carbon override, and renders.
 *
 * @param {object} selSpec - The selection spec (should include model).
 * @param {Set<string>} representations - The object's active representations.
 * @param {string} rawScheme - The raw color scheme string.
 */
export function applyColor(selSpec, representations, rawScheme) {
  const viewer = getViewer();
  const { scheme, carbonHex, chainPalette, ssPalette } = parseColorScheme(rawScheme);
  const { schemes, customScheme } = buildColorSchemes(scheme, chainPalette, ssPalette, selSpec);
  const reps = representations.size > 0 ? representations : new Set(['line']);

  applyColorStyle(viewer, selSpec, reps, scheme, schemes, customScheme, carbonHex);
  viewer.render();
}

/**
 * Apply color to a named selection.
 *
 * Iterates over all visible objects, intersects the selection spec with each
 * object's model, and applies color per-object. Renders when done.
 *
 * @param {object} selSpec - The selection spec (not scoped to a model).
 * @param {string} rawScheme - The raw color scheme string.
 */
export function applyColorToSelection(selSpec, rawScheme) {
  const viewer = getViewer();
  const state = getState();
  const { scheme, carbonHex, chainPalette, ssPalette } = parseColorScheme(rawScheme);
  const { schemes, customScheme } = buildColorSchemes(scheme, chainPalette, ssPalette, selSpec);

  for (const [, obj] of state.objects) {
    if (!obj.visible) continue;
    const intersect = Object.assign({}, selSpec, { model: obj.model });
    const reps = obj.representations.size > 0 ? obj.representations : new Set(['line']);

    applyColorStyle(viewer, intersect, reps, scheme, schemes, customScheme, carbonHex);
  }
  viewer.render();
}

/**
 * Apply labels to atoms matching a selection spec.
 *
 * Handles the 'clear' case by removing all labels. Maps property names
 * to 3Dmol atom properties, filters to CA atoms for resn/resi/chain,
 * and renders when done.
 *
 * @param {object} selSpec - The selection spec.
 * @param {string} prop - The property to label by, or 'clear'.
 */
export function applyLabel(selSpec, prop) {
  const viewer = getViewer();

  if (prop === 'clear') {
    clearAllLabels();
    viewer.render();
    return;
  }

  const propMap = { atom: 'atom', resn: 'resn', resi: 'resi', chain: 'chain', elem: 'elem', index: 'serial' };
  const atomProp = propMap[prop] || prop;
  let atoms = viewer.selectedAtoms(selSpec);
  if (['resn', 'resi', 'chain'].includes(prop)) {
    atoms = atoms.filter(a => a.atom === 'CA');
  }
  for (const atom of atoms) {
    addTrackedLabel(String(atom[atomProp]), { x: atom.x, y: atom.y, z: atom.z });
  }
  viewer.render();
}

/**
 * Show a representation on an object.
 *
 * Handles line/stick interaction where sticks cover lines. Adds the
 * representation to the object's set, applies styles, renders, and
 * notifies state change.
 *
 * @param {object} selSpec - The selection spec (should include model).
 * @param {string} rep - The representation name.
 * @param {object} obj - The state object with a representations Set.
 */
export function applyShow(selSpec, rep, obj) {
  const viewer = getViewer();

  const skipVisual = rep === 'line' && obj.representations.has('stick');
  const rebuildVisual = rep === 'stick' && obj.representations.has('line');

  obj.representations.add(rep);

  if (skipVisual) {
    // Sticks already cover lines -- no visual change needed
  } else if (rebuildVisual) {
    viewer.setStyle(selSpec, {});
    for (const r of obj.representations) {
      if (r === 'line' && obj.representations.has('stick')) continue;
      viewer.addStyle(selSpec, repStyle(r));
    }
  } else {
    viewer.addStyle(selSpec, repStyle(rep));
  }

  viewer.render();
  notifyStateChange();
}

/**
 * Hide a representation on an object.
 *
 * Handles the 'everything' case by clearing all representations. Otherwise,
 * removes the representation and rebuilds remaining styles. Renders and
 * notifies state change.
 *
 * @param {object} selSpec - The selection spec (should include model).
 * @param {string} rep - The representation name, or 'everything'.
 * @param {object} obj - The state object with a representations Set.
 */
export function applyHide(selSpec, rep, obj) {
  const viewer = getViewer();

  if (rep === 'everything') {
    viewer.setStyle(selSpec, {});
    obj.representations.clear();
  } else {
    viewer.setStyle(selSpec, {});
    obj.representations.delete(rep);
    for (const r of obj.representations) {
      if (r === 'line' && obj.representations.has('stick')) continue;
      viewer.addStyle(selSpec, repStyle(r));
    }
  }
  viewer.render();
  notifyStateChange();
}

/**
 * Hide a representation on a named selection.
 *
 * Iterates over all visible objects, rebuilds per-object styles excluding
 * the hidden representation. Renders when done.
 *
 * @param {object} selSpec - The selection spec (not scoped to a model).
 * @param {string} rep - The representation name, or 'everything'.
 */
export function applyHideSelection(selSpec, rep) {
  const viewer = getViewer();
  const state = getState();

  if (rep === 'everything') {
    viewer.setStyle(selSpec, {});
  } else {
    for (const [, obj] of state.objects) {
      if (!obj.visible) continue;
      const intersect = Object.assign({}, selSpec, { model: obj.model });
      viewer.setStyle(intersect, {});
      for (const r of obj.representations) {
        if (r === rep) continue;
        if (r === 'line' && obj.representations.has('stick')) continue;
        viewer.addStyle(intersect, repStyle(r));
      }
    }
  }
  viewer.render();
}

/**
 * Apply a view preset.
 *
 * @param {string} presetName - The preset name (case-insensitive).
 * @param {object} [selSpec] - Optional selection spec to scope the preset.
 * @returns {Set<string>} The set of representations the preset applied.
 */
export function applyViewPreset(presetName, selSpec) {
  const viewer = getViewer();
  return applyPreset(presetName, viewer, selSpec);
}

/**
 * Get the display label for a preset.
 *
 * @param {string} presetName - The preset name (case-insensitive).
 * @returns {string} The human-readable label.
 */
export function getPresetLabel(presetName) {
  const preset = PRESETS[presetName.toLowerCase()];
  return preset ? preset.label : presetName;
}
