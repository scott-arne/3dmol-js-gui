/**
 * Preset view definitions for the 3Dmol.js GUI.
 *
 * Each preset applies a combination of styles to produce a common molecular
 * visualization. Presets operate on the viewer directly and accept an optional
 * base selection spec to scope the effect.
 */

import { repStyle } from './viewer.js';
import { CHAIN_PALETTES } from './ui/color-swatches.js';

const WATER_RESN = ['HOH', 'WAT', 'H2O'];

/**
 * Merge a base selection spec with additional criteria.
 *
 * @param {object} base - The base selection spec (may be empty).
 * @param {object} extra - Additional selection criteria to merge.
 * @returns {object} A new combined selection spec.
 */
function merge(base, extra) {
  return Object.assign({}, base, extra);
}

/**
 * Build a pastel chain colorscheme from a set of atoms.
 *
 * Discovers unique chain IDs, sorts them, and maps each to a color from the
 * pastel palette (cycling if there are more chains than colors).
 *
 * @param {Array} atoms - Atom objects with a `.chain` property.
 * @returns {{prop: string, map: Object}} A 3Dmol.js custom colorscheme object.
 */
function pastelChainScheme(atoms) {
  const palette = CHAIN_PALETTES.pastel.colors;
  const chains = [...new Set(atoms.map(a => a.chain))].sort();
  const map = {};
  chains.forEach((ch, i) => { map[ch] = palette[i % palette.length]; });
  return { prop: 'chain', map };
}

/**
 * Available preset definitions keyed by lowercase name.
 */
export const PRESETS = {
  simple: {
    label: 'Simple',
    description: 'Cartoon for protein/nucleic (pastel chain), grey sticks for ligands',
    apply(viewer, base) {
      viewer.setStyle(base, {});
      viewer.addStyle(
        merge(base, { hetflag: true, not: { resn: WATER_RESN } }),
        { stick: { color: '#808080' } }
      );
      const proteinSel = merge(base, { hetflag: false });
      const atoms = viewer.selectedAtoms(proteinSel);
      const colorscheme = pastelChainScheme(atoms);
      viewer.addStyle(proteinSel, { cartoon: { colorscheme } });
      viewer.render();
      return new Set(['cartoon', 'stick']);
    },
  },

  sites: {
    label: 'Sites',
    description: 'Simple (pastel chain) + sticks for residues within 5A of ligands',
    apply(viewer, base) {
      viewer.setStyle(base, {});
      const hetSpec = merge(base, { hetflag: true, not: { resn: WATER_RESN } });
      viewer.addStyle(hetSpec, { stick: { color: '#808080' } });
      const proteinSel = merge(base, { hetflag: false });
      const proteinAtoms = viewer.selectedAtoms(proteinSel);
      const colorscheme = pastelChainScheme(proteinAtoms);
      viewer.addStyle(proteinSel, { cartoon: { colorscheme } });

      // Find residues within 5 angstroms of HETATM and show as sticks
      const hetAtoms = viewer.selectedAtoms(hetSpec);
      if (hetAtoms.length > 0) {
        const DIST_SQ = 25; // 5A squared
        const allAtoms = viewer.selectedAtoms(base || {});
        const nearResKeys = new Set();
        for (const a of allAtoms) {
          if (a.hetflag) continue;
          for (const h of hetAtoms) {
            const dx = a.x - h.x, dy = a.y - h.y, dz = a.z - h.z;
            if (dx * dx + dy * dy + dz * dz <= DIST_SQ) {
              nearResKeys.add(`${a.chain}:${a.resi}`);
              break;
            }
          }
        }
        if (nearResKeys.size > 0) {
          const nearIndices = [];
          for (const a of allAtoms) {
            if (nearResKeys.has(`${a.chain}:${a.resi}`)) nearIndices.push(a.index);
          }
          if (nearIndices.length > 0) {
            viewer.addStyle({ index: nearIndices }, { stick: { colorscheme } });
          }
        }
      }

      viewer.render();
      return new Set(['cartoon', 'stick']);
    },
  },

  'ball-and-stick': {
    label: 'Ball-and-Stick',
    description: 'Ball-and-stick for ligands only',
    apply(viewer, base) {
      viewer.setStyle(base, {});
      const hetSpec = merge(base, { hetflag: true, not: { resn: WATER_RESN } });
      viewer.addStyle(hetSpec, repStyle('stick'));
      viewer.addStyle(hetSpec, { sphere: { scale: 0.3 } });
      viewer.render();
      return new Set(['stick', 'sphere']);
    },
  },
};

/** Ordered list of preset names for UI display. */
export const PRESET_NAMES = ['simple', 'sites', 'ball-and-stick'];

/**
 * Apply a named preset to the viewer.
 *
 * @param {string} name - The preset name (case-insensitive).
 * @param {object} viewer - The 3Dmol GLViewer instance.
 * @param {object} [selSpec] - Optional selection spec to scope the preset.
 * @returns {Set<string>} The set of representation names the preset applied.
 * @throws {Error} If the preset name is not recognized.
 */
export function applyPreset(name, viewer, selSpec) {
  const key = name.toLowerCase();
  const preset = PRESETS[key];
  if (!preset) {
    const valid = PRESET_NAMES.map(n => PRESETS[n].label).join(', ');
    throw new Error(`Unknown preset "${name}". Available: ${valid}`);
  }
  return preset.apply(viewer, selSpec || {});
}
