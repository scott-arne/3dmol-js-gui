/**
 * Pre-filtered color swatches safe for carbon atom coloring.
 *
 * Excludes colors too close to standard Jmol element colors for
 * O (red), N (blue), P (orange), S (yellow), F (green),
 * Br (dark red), I (violet), and H (white).
 *
 * @type {Array<{label: string, hex: string}>}
 */
export const CARBON_SWATCHES = [
  { label: 'Cyan', hex: '#00FFFF' },
  { label: 'Pink', hex: '#FFC0CB' },
  { label: 'Turquoise', hex: '#30D5C8' },
  { label: 'Teal', hex: '#008080' },
  { label: 'Sage', hex: '#B2AC88' },
  { label: 'Lavender', hex: '#E6E6FA' },
  { label: 'Aquamarine', hex: '#7FFFD4' },
  { label: 'Pale Turquoise', hex: '#AFEEEE' },
  { label: 'Light Pink', hex: '#FFB6C1' },
  { label: 'Robin\'s Egg', hex: '#00CCCC' },
  { label: 'Cerulean', hex: '#007BA7' },
  { label: 'Periwinkle', hex: '#CCCCFF' },
  { label: 'Orange Cream', hex: '#FDE4CF' },
  { label: 'Peach', hex: '#FFCFD2' },
  { label: 'Purple Blue', hex: '#A3C4F3' },
  { label: 'Light Blue', hex: '#8EECF5' },
  { label: 'Marine', hex: '#98F5E1' },
  { label: 'Pastel Blue', hex: '#90DBF4' },
];

/**
 * Complete set of solid color swatches from the COLOR_MAP.
 *
 * Organized by hue group for a visually coherent swatch grid.
 * Excludes duplicate entries (gray/grey, lime/green).
 *
 * @type {Array<{label: string, hex: string}>}
 */
export const SOLID_SWATCHES = [
  // Reds / warm
  { label: 'Red', hex: '#FF0000' },
  { label: 'Coral', hex: '#FF7F50' },
  { label: 'Salmon', hex: '#FA8072' },
  { label: 'Rose', hex: '#FF007F' },
  { label: 'Light Coral', hex: '#F08080' },
  { label: 'Peach', hex: '#FFCFD2' },
  // Oranges / yellows
  { label: 'Orange', hex: '#FFA500' },
  { label: 'Light Orange', hex: '#FFA07A' },
  { label: 'Orange Cream', hex: '#FDE4CF' },
  { label: 'Mustard', hex: '#FFDB58' },
  { label: 'Yellow', hex: '#FFFF00' },
  { label: 'Light Yellow', hex: '#FFFFE0' },
  // Greens
  { label: 'Green', hex: '#00FF00' },
  { label: 'Light Green', hex: '#90EE90' },
  { label: 'Pastel Green', hex: '#B9FBC0' },
  { label: 'Feijoa', hex: '#A5D785' },
  { label: 'Sage', hex: '#B2AC88' },
  { label: 'Marine', hex: '#98F5E1' },
  // Cyans
  { label: 'Cyan', hex: '#00FFFF' },
  { label: 'Teal', hex: '#008080' },
  { label: 'Turquoise', hex: '#30D5C8' },
  { label: 'Aquamarine', hex: '#7FFFD4' },
  { label: 'Pale Turquoise', hex: '#AFEEEE' },
  { label: 'Robin\'s Egg', hex: '#00CCCC' },
  // Blues
  { label: 'Blue', hex: '#0000FF' },
  { label: 'Cerulean', hex: '#007BA7' },
  { label: 'Pastel Blue', hex: '#90DBF4' },
  { label: 'Light Blue', hex: '#8EECF5' },
  { label: 'Purple Blue', hex: '#A3C4F3' },
  { label: 'Periwinkle', hex: '#CCCCFF' },
  // Purples / pinks
  { label: 'Purple', hex: '#800080' },
  { label: 'Magenta', hex: '#FF00FF' },
  { label: 'Light Purple', hex: '#F1C0E8' },
  { label: 'Pastel Purple', hex: '#CFBAF0' },
  { label: 'Lavender', hex: '#E6E6FA' },
  { label: 'Pink', hex: '#FFC0CB' },
  // Neutrals / light
  { label: 'Light Pink', hex: '#FFB6C1' },
  { label: 'Canary', hex: '#FBF8CC' },
  { label: 'White', hex: '#FFFFFF' },
  { label: 'Grey', hex: '#808080' },
];

/**
 * Chain coloring palettes.
 *
 * Each entry maps a palette key to a label (for display) and a colors array.
 * Colors are cycled across chain IDs when applied.
 *
 * @type {Object<string, {label: string, colors: string[]}>}
 */
export const CHAIN_PALETTES = {
  pastel: {
    label: 'Pastel',
    colors: [
      '#A3C4F3', '#B9FBC0', '#FFCFD2', '#FDE4CF', '#CFBAF0',
      '#FBF8CC', '#90DBF4', '#F1C0E8', '#98F5E1', '#8EECF5',
    ],
  },
  bright: {
    label: 'Pastel (Bright)',
    colors: [
      '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181',
      '#AA96DA', '#FCE38A', '#A8E6CF', '#FF8B94', '#DCD6F7',
    ],
  },
  dark: {
    label: 'Pastel (Dark)',
    colors: [
      '#4682B4', '#2E8B57', '#CD5C5C', '#DAA520', '#6A5ACD',
      '#20B2AA', '#BC8F8F', '#8FBC8F', '#DB7093', '#B8860B',
    ],
  },
  rainbow: {
    label: 'Rainbow',
    colors: [
      '#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#00FFFF',
      '#0000FF', '#8B00FF', '#FF00FF',
    ],
  },
  coolwarm: {
    label: 'Coolwarm',
    colors: [
      '#3B4CC0', '#6788EE', '#88BBFF', '#AADDFF', '#DDDDDD',
      '#FFBBAA', '#FF8866', '#EE5533', '#C03030',
    ],
  },
  primary: {
    label: 'Primary Colors',
    colors: [
      '#FF0000', '#0000FF', '#FFFF00', '#00FF00', '#FFA500',
      '#800080', '#00FFFF', '#FF00FF',
    ],
  },
};

/**
 * Secondary structure coloring palettes.
 *
 * Ordered array so the UI can render them in a fixed sequence. Each entry has
 * a key (for value encoding), helix/sheet/loop colors for both display and
 * the custom colorscheme map. The 'default' entry uses the built-in ssJmol
 * scheme at render time; its colors are only for the menu label preview.
 *
 * @type {Array<{key: string, helix: string, sheet: string, loop: string}>}
 */
export const SS_PALETTES = [
  { key: 'cool',    helix: '#90DBF4', sheet: '#F1C0E8', loop: '#FFCFD2' },
  { key: 'warm',    helix: '#FF8B94', sheet: '#8EECF5', loop: '#D3D3D3' },
  { key: 'default', helix: '#FF0080', sheet: '#FFC800', loop: '#FFFFFF' },
  { key: 'classic', helix: '#FF8B94', sheet: '#FCE38A', loop: '#B9FBC0' },
];

/** Default B-factor spectrum range. */
export const BFACTOR_DEFAULTS = { min: 10, max: 50 };

/**
 * Build a B-factor coloring function (pastel blue → pastel red).
 *
 * Returns a function suitable for use as a 3Dmol.js `colorfunc` on a
 * representation style spec. Linearly interpolates from pastel blue (#90DBF4)
 * to pastel red (#FF8B94). Values at or below min clamp to blue; values at or
 * above max clamp to red.
 *
 * @param {number} min - The low end of the gradient (maps to pastel blue).
 * @param {number} max - The high end of the gradient (maps to pastel red).
 * @returns {function} A colorfunc that takes an atom and returns a numeric color.
 */
export function buildBfactorScheme(min, max) {
  const loR = 0x90, loG = 0xDB, loB = 0xF4; // #90DBF4 pastel blue
  const hiR = 0xFF, hiG = 0x8B, hiB = 0x94; // #FF8B94 pastel red
  const range = max - min;
  return function(atom) {
    const t = range > 0
      ? Math.max(0, Math.min(1, (atom.b - min) / range))
      : 0;
    const r = Math.round(loR + t * (hiR - loR));
    const g = Math.round(loG + t * (hiG - loG));
    const b = Math.round(loB + t * (hiB - loB));
    return (r << 16) | (g << 8) | b;
  };
}
