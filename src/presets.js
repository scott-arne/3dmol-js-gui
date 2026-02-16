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
 * Apply Jmol element coloring with per-chain carbon colors from the pastel
 * palette. Uses the same two-pass approach as the sidebar "By Element" color
 * menu: first set Jmol colorscheme, then override carbon atoms per chain.
 *
 * @param {object} viewer - The 3Dmol GLViewer instance.
 * @param {object} selSpec - The selection spec to color.
 * @param {Array<string>} reps - Representation names to apply coloring to.
 */
function applyElementByChain(viewer, selSpec, reps) {
  const palette = CHAIN_PALETTES.pastel.colors;
  const atoms = viewer.selectedAtoms(selSpec);
  const chains = [...new Set(atoms.map(a => a.chain))].sort();

  // Non-carbon atoms: Jmol element coloring
  const nonCarbonSel = Object.assign({}, selSpec, { not: { elem: 'C' } });
  const jmolStyle = {};
  for (const rep of reps) jmolStyle[rep] = { colorscheme: 'Jmol' };
  viewer.addStyle(nonCarbonSel, jmolStyle);

  // Carbon atoms: per-chain pastel palette color
  chains.forEach((ch, i) => {
    const color = palette[i % palette.length];
    const carbonSel = Object.assign({}, selSpec, { elem: 'C', chain: ch });
    const carbonStyle = {};
    for (const rep of reps) carbonStyle[rep] = { color };
    viewer.addStyle(carbonSel, carbonStyle);
  });
}

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
 * Available preset definitions keyed by lowercase name.
 */
export const PRESETS = {
  simple: {
    label: 'Simple',
    description: 'Element-colored cartoon with per-chain carbons, sticks for ligands',
    apply(viewer, base) {
      viewer.setStyle(base, {});
      viewer.addStyle(
        merge(base, { hetflag: true, not: { resn: WATER_RESN } }),
        { stick: { colorscheme: 'Jmol' } }
      );
      applyElementByChain(viewer, merge(base, { hetflag: false }), ['cartoon']);
      viewer.render();
      return new Set(['cartoon', 'stick']);
    },
  },

  sites: {
    label: 'Sites',
    description: 'Element-colored cartoon with per-chain carbons + sticks near ligands',
    apply(viewer, base) {
      viewer.setStyle(base, {});
      const hetSpec = merge(base, { hetflag: true, not: { resn: WATER_RESN } });
      viewer.addStyle(hetSpec, { stick: { colorscheme: 'Jmol' } });
      const proteinSel = merge(base, { hetflag: false });
      applyElementByChain(viewer, proteinSel, ['cartoon']);

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
            applyElementByChain(viewer, { index: nearIndices }, ['stick']);
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
