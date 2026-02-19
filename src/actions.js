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
 * Set color on atoms matching a selection for a specific set of 3Dmol style keys.
 *
 * @param {object} viewer - The 3Dmol viewer instance.
 * @param {object} selSpec - The selection spec.
 * @param {string[]} repKeys - 3Dmol style keys (e.g. 'cartoon', 'stick').
 * @param {string} scheme - The parsed scheme name.
 * @param {object} schemes - The schemes map.
 * @param {object|null} customScheme - A custom colorscheme override, if any.
 * @param {string|null} carbonHex - A hex color for carbon atoms, if any.
 */
function setColorOnReps(viewer, selSpec, repKeys, scheme, schemes, customScheme, carbonHex) {
  if (schemes[scheme]) {
    const colorscheme = customScheme || schemes[scheme];
    const styleObj = {};
    for (const key of repKeys) {
      styleObj[key] = scheme === 'bfactor' ? { colorfunc: colorscheme } : { colorscheme };
    }
    viewer.setStyle(selSpec, styleObj);

    if (carbonHex) {
      const carbonSel = Object.assign({}, selSpec, { elem: 'C' });
      const carbonStyle = {};
      for (const key of repKeys) {
        carbonStyle[key] = { color: carbonHex };
      }
      viewer.setStyle(carbonSel, carbonStyle);
    }
  } else {
    const hex = COLOR_MAP[scheme] || scheme;
    const styleObj = {};
    for (const key of repKeys) {
      styleObj[key] = { color: hex };
    }
    viewer.setStyle(selSpec, styleObj);
  }
}

/**
 * Apply a color scheme to atoms matching a selection, preserving per-atom
 * representation assignments.
 *
 * Reads each atom's current style from the viewer so that atoms styled by
 * presets (e.g. "preset sites" gives some atoms cartoon-only and others
 * cartoon+stick) retain their individual representations after coloring.
 *
 * Falls back to the object-level representation set when atoms have no
 * per-atom style information (e.g. freshly loaded models before rendering).
 *
 * @param {object} viewer - The 3Dmol viewer instance.
 * @param {object} selSpec - The selection spec.
 * @param {Set<string>} reps - Fallback representations from the object state.
 * @param {string} scheme - The parsed scheme name.
 * @param {object} schemes - The schemes map.
 * @param {object|null} customScheme - A custom colorscheme override, if any.
 * @param {string|null} carbonHex - A hex color for carbon atoms, if any.
 */
function applyColorStyle(viewer, selSpec, reps, scheme, schemes, customScheme, carbonHex) {
  const atoms = viewer.selectedAtoms(selSpec);
  if (atoms.length === 0) return;

  // Check whether any atom carries per-atom style data from the viewer
  const hasPerAtomStyles = atoms.some(a => a.style && Object.keys(a.style).length > 0);

  if (!hasPerAtomStyles) {
    // No per-atom styles — use object-level reps (original behavior)
    const keys = [...reps].map(r => repKey(r));
    setColorOnReps(viewer, selSpec, keys, scheme, schemes, customScheme, carbonHex);
    return;
  }

  // Group atoms by their current representation set so that atoms with
  // different reps (e.g. cartoon-only vs cartoon+stick) are colored separately
  const groups = new Map();
  for (const atom of atoms) {
    const styleKeys = atom.style ? Object.keys(atom.style) : [];
    if (styleKeys.length === 0) continue; // skip unstyled (invisible) atoms
    const tag = styleKeys.sort().join('\0');
    if (!groups.has(tag)) {
      groups.set(tag, { keys: [...styleKeys].sort(), serials: [] });
    }
    groups.get(tag).serials.push(atom.serial);
  }

  if (groups.size === 0) return;

  for (const [, group] of groups) {
    // Use original selSpec when all styled atoms share the same reps (common case)
    const groupSel = groups.size === 1 ? selSpec : { ...selSpec, serial: group.serials };
    setColorOnReps(viewer, groupSel, group.keys, scheme, schemes, customScheme, carbonHex);
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
 * Serialize a style object into a stable string for use as a grouping tag.
 *
 * Includes both key names and values so that atoms with different colors
 * or colorschemes (e.g. element-by-chain coloring) but the same set of
 * representation keys are placed in separate groups.
 *
 * @param {object} styleObj - A style object to serialize.
 * @returns {string} A JSON string suitable for use as a Map key.
 */
function styleTag(styleObj) {
  return JSON.stringify(styleObj, (_key, value) =>
    typeof value === 'function' ? '$$fn$$' : value
  );
}

/**
 * Find an active representation that shares the same 3Dmol style key as `rep`.
 *
 * Currently only 'line' and 'stick' collide — both map to the 'stick' key
 * because WebGL's gl.lineWidth() is capped at 1 px on modern browsers, so
 * lines are rendered as thin sticks.
 *
 * @param {string} rep - The representation being hidden.
 * @param {Set<string>} objReps - The object's active representations.
 * @returns {string|null} The conflicting rep name, or null if no collision.
 */
function findKeyConflict(rep, objReps) {
  const key = repKey(rep);
  for (const r of objReps) {
    if (r !== rep && repKey(r) === key) return r;
  }
  return null;
}

/**
 * Downgrade a shared-key style entry to a subordinate representation's
 * parameters while preserving color information.
 *
 * Used when hiding the "dominant" rep (e.g. stick, radius 0.25) while the
 * "subordinate" rep (e.g. line, radius 0.05) should remain visible. Reads
 * each atom's current style and replaces the shared-key entry's geometry
 * parameters with the subordinate rep's defaults, keeping color data intact.
 *
 * @param {object} viewer - The 3Dmol viewer instance.
 * @param {object} selSpec - The selection spec.
 * @param {string} sharedKey - The 3Dmol style key shared by both reps.
 * @param {string} targetRep - The subordinate rep whose params should remain.
 */
function downgradeRepStyle(viewer, selSpec, sharedKey, targetRep) {
  const targetStyle = repStyle(targetRep);
  const targetParams = targetStyle[sharedKey] || {};
  const atoms = viewer.selectedAtoms(selSpec);
  const hasPerAtomStyles = atoms.some(a => a.style && Object.keys(a.style).length > 0);

  if (!hasPerAtomStyles) {
    viewer.setStyle(selSpec, {});
    viewer.addStyle(selSpec, targetStyle);
    return;
  }

  const groups = new Map();
  for (const atom of atoms) {
    if (!atom.style || Object.keys(atom.style).length === 0) continue;
    const modified = {};
    for (const [k, v] of Object.entries(atom.style)) {
      if (k === sharedKey) {
        // Replace geometry params with subordinate rep defaults; keep color data
        modified[k] = { ...v, ...targetParams };
      } else {
        modified[k] = v;
      }
    }
    const tag = styleTag(modified);
    if (!groups.has(tag)) {
      groups.set(tag, { style: modified, serials: [] });
    }
    groups.get(tag).serials.push(atom.serial);
  }

  viewer.setStyle(selSpec, {});

  for (const [, group] of groups) {
    if (Object.keys(group.style).length === 0) continue;
    const groupSel = groups.size === 1 ? selSpec : { ...selSpec, serial: group.serials };
    viewer.setStyle(groupSel, group.style);
  }
}

/**
 * Remove a representation from atoms while preserving their current styles
 * (colors, colorschemes, etc.) for remaining representations.
 *
 * Handles three cases:
 *
 * 1. **Key collision** — two canonical reps share the same 3Dmol key (line and
 *    stick both map to 'stick'):
 *    a. Hiding line while stick is active → no visual change (sticks cover lines).
 *    b. Hiding stick while line is active → downgrade stick entries to thin-stick
 *       (line) parameters, preserving color data.
 *
 * 2. **Per-atom styles present** — reads each atom's style, removes the target
 *    key, and re-applies the remaining styles grouped by representation set.
 *
 * 3. **No per-atom styles** — falls back to the object-level representation
 *    rebuild using repStyle() defaults.
 *
 * @param {object} viewer - The 3Dmol viewer instance.
 * @param {object} selSpec - The selection spec.
 * @param {string} rep - The canonical representation name to remove.
 * @param {Set<string>} objReps - The object's representations set.
 */
function hideRepPreservingStyles(viewer, selSpec, rep, objReps) {
  const keyToRemove = repKey(rep);

  // Case 1: Key collision (line/stick both map to 'stick')
  const conflictRep = findKeyConflict(rep, objReps);
  if (conflictRep) {
    if (rep === 'line') {
      // Sticks already cover lines visually — no change needed
      return;
    }
    // Hiding the dominant rep (stick) while subordinate (line) remains:
    // downgrade stick entries to thin-stick parameters, preserving colors
    downgradeRepStyle(viewer, selSpec, keyToRemove, conflictRep);
    return;
  }

  // Cases 2 & 3: No key collision — safe to remove the key from atom.style
  const atoms = viewer.selectedAtoms(selSpec);
  const hasPerAtomStyles = atoms.some(a => a.style && Object.keys(a.style).length > 0);

  if (!hasPerAtomStyles) {
    // Case 3: Fallback — use object-level reps
    viewer.setStyle(selSpec, {});
    for (const r of objReps) {
      if (r === rep) continue;
      if (r === 'line' && objReps.has('stick') && rep !== 'stick') continue;
      viewer.addStyle(selSpec, repStyle(r));
    }
    return;
  }

  // Case 2: Per-atom styles — remove key and re-apply
  const groups = new Map();
  for (const atom of atoms) {
    if (!atom.style || Object.keys(atom.style).length === 0) continue;
    const remaining = {};
    for (const [k, v] of Object.entries(atom.style)) {
      if (k !== keyToRemove) remaining[k] = v;
    }
    const tag = styleTag(remaining);
    if (!groups.has(tag)) {
      groups.set(tag, { style: remaining, serials: [] });
    }
    groups.get(tag).serials.push(atom.serial);
  }

  viewer.setStyle(selSpec, {});

  for (const [, group] of groups) {
    if (Object.keys(group.style).length === 0) continue;
    const groupSel = groups.size === 1 ? selSpec : { ...selSpec, serial: group.serials };
    viewer.setStyle(groupSel, group.style);
  }
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
    hideRepPreservingStyles(viewer, selSpec, rep, obj.representations);
    obj.representations.delete(rep);
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
      hideRepPreservingStyles(viewer, intersect, rep, obj.representations);
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
