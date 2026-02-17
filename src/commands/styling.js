import { parseArgs } from './registry.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer, repStyle } from '../viewer.js';
import { getState, notifyStateChange } from '../state.js';
import { buildBfactorScheme, BFACTOR_DEFAULTS } from '../ui/color-swatches.js';

/**
 * Map of standard color names to their hex values.
 *
 * @type {Object<string, string>}
 */
const COLOR_MAP = {
  // Basic colors
  red: '#FF0000',
  green: '#00FF00',
  blue: '#0000FF',
  yellow: '#FFFF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  orange: '#FFA500',
  white: '#FFFFFF',
  grey: '#808080',
  gray: '#808080',
  salmon: '#FA8072',
  lime: '#00FF00',
  pink: '#FFC0CB',
  purple: '#800080',

  // Extended palette (matteoferla)
  turquoise: '#30D5C8',
  coral: '#FF7F50',
  teal: '#008080',
  sage: '#B2AC88',
  lavender: '#E6E6FA',
  mustard: '#FFDB58',
  aquamarine: '#7FFFD4',
  feijoa: '#A5D785',
  rose: '#FF007F',
  paleturquoise: '#AFEEEE',
  lightcoral: '#F08080',
  lightgreen: '#90EE90',
  lightyellow: '#FFFFE0',
  lightorange: '#FFA07A',
  lightpink: '#FFB6C1',
  robinsegg: '#00CCCC',
  cerulean: '#007BA7',
  periwinkle: '#CCCCFF',

  // Pastel palette
  canary: '#FBF8CC',
  orangecream: '#FDE4CF',
  peach: '#FFCFD2',
  lightpurple: '#F1C0E8',
  purpleblue: '#A3C4F3',
  lightblue: '#8EECF5',
  marine: '#98F5E1',
  pastelgreen: '#B9FBC0',
  pastelblue: '#90DBF4',
  pastelpurple: '#CFBAF0',
};

/**
 * Custom colors added at runtime via the set_color command.
 *
 * @type {Object<string, string>}
 */
const customColors = {};

/**
 * Resolve a color string to a hex color value.
 *
 * Checks custom colors first, then the built-in color map, then attempts to
 * parse hex formats (0xRRGGBB or #RRGGBB / #RGB).
 *
 * @param {string} colorStr - The color string to resolve.
 * @returns {string|null} The resolved hex color, or null if unrecognized.
 */
function resolveColor(colorStr) {
  const lower = colorStr.trim().toLowerCase();

  // Check custom colors first
  if (customColors[lower]) return customColors[lower];

  // Check named colors
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];

  // Check hex format (0xRRGGBB or #RRGGBB)
  if (lower.startsWith('0x')) {
    return '#' + lower.substring(2);
  }
  if (lower.startsWith('#') && (lower.length === 4 || lower.length === 7)) {
    return lower;
  }

  return null;
}

/**
 * Register the styling commands (color, set_color, bg_color, set) into the
 * given command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerStylingCommands(registry) {
  registry.register('color', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length === 0) {
        throw new Error('Usage: color <color|scheme> [, selection]');
      }
      const colorInput = parts[0].trim().toLowerCase();
      const selStr = parts.slice(1).join(', ') || null;
      const result = resolveSelection(selStr);
      const selSpec = getSelSpec(result);
      const viewer = getViewer();

      // Check if it's a coloring scheme
      const schemes = [
        'element',
        'elem',
        'cpk',
        'chain',
        'ss',
        'secondary_structure',
        'spectrum',
        'b',
        'bfactor',
      ];
      if (schemes.includes(colorInput)) {
        if (['element', 'elem', 'cpk'].includes(colorInput)) {
          viewer.setStyle(selSpec, {
            cartoon: { colorscheme: 'Jmol' },
            stick: { colorscheme: 'Jmol' },
          });
        } else if (colorInput === 'chain') {
          viewer.setStyle(selSpec, { cartoon: { colorscheme: 'chain' } });
        } else if (['ss', 'secondary_structure'].includes(colorInput)) {
          viewer.setStyle(selSpec, { cartoon: { colorscheme: 'ssJmol' } });
        } else if (['spectrum', 'b', 'bfactor'].includes(colorInput)) {
          viewer.setStyle(selSpec, {
            cartoon: { colorscheme: { prop: 'b', gradient: 'roygb' } },
          });
        }
        viewer.render();
        ctx.terminal.print(
          `Colored by ${colorInput}${selStr ? ` for ${selStr}` : ''}`,
          'result'
        );
        return;
      }

      // Solid color
      const hex = resolveColor(parts[0]);
      if (!hex) {
        throw new Error(
          `Unknown color "${parts[0]}". Use a named color, hex (#RRGGBB), or a scheme (element, chain, ss, spectrum).`
        );
      }

      // Apply color to all current representations
      const state = getState();
      const reps = new Set();
      for (const [, obj] of state.objects) {
        for (const rep of obj.representations) {
          reps.add(rep);
        }
      }
      if (reps.size === 0) reps.add('cartoon');

      const styleObj = {};
      for (const rep of reps) {
        styleObj[rep] = { color: hex };
      }
      viewer.setStyle(selSpec, styleObj);
      viewer.render();

      ctx.terminal.print(
        `Colored ${parts[0]}${selStr ? ` for ${selStr}` : ''}`,
        'result'
      );
    },
    usage: 'color <color|scheme> [, selection]',
    help: 'Color atoms. Use named colors (red, green, blue...), hex (#FF0000), or schemes (element, chain, ss, spectrum).',
  });

  registry.register('set_color', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error(
          'Usage: set_color <name>, [<r>, <g>, <b>] or set_color <name>, <hex>'
        );
      }
      const name = parts[0].trim().toLowerCase();

      if (parts.length === 3) {
        throw new Error('RGB format requires 3 values: set_color <name>, <r>, <g>, <b>');
      } else if (parts.length === 4) {
        // RGB values (0-255)
        const r = parseInt(parts[1], 10);
        const g = parseInt(parts[2], 10);
        const b = parseInt(parts[3], 10);
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
          throw new Error('RGB values must be numbers (0-255)');
        }
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
          throw new Error('RGB values must be between 0 and 255');
        }
        const hex =
          `#${r.toString(16).padStart(2, '0')}` +
          `${g.toString(16).padStart(2, '0')}` +
          `${b.toString(16).padStart(2, '0')}`;
        customColors[name] = hex;
        ctx.terminal.print(`Defined color "${name}" as ${hex}`, 'result');
      } else {
        // Hex value
        const hex = resolveColor(parts[1]);
        if (!hex) {
          throw new Error(`Invalid color value: ${parts[1]}`);
        }
        customColors[name] = hex;
        ctx.terminal.print(`Defined color "${name}" as ${hex}`, 'result');
      }
    },
    usage: 'set_color <name>, <hex> | set_color <name>, <r>, <g>, <b>',
    help: 'Define a custom named color.',
  });

  registry.register('bg_color', {
    handler: (args, ctx) => {
      const colorStr = args.trim();
      if (!colorStr) {
        throw new Error('Usage: bg_color <color>');
      }
      const hex = resolveColor(colorStr);
      if (!hex) {
        throw new Error(`Unknown color "${colorStr}"`);
      }
      const viewer = getViewer();
      viewer.setBackgroundColor(hex);
      viewer.render();

      const state = getState();
      state.settings.bgColor = hex;
      state.settings.userSetBgColor = true;
      notifyStateChange();

      ctx.terminal.print(`Background color set to ${hex}`, 'result');
    },
    usage: 'bg_color <color>',
    help: 'Set the viewer background color.',
  });

  registry.register('set', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: set <setting>, <value>');
      }
      const setting = parts[0].trim().toLowerCase();
      const value = parts[1].trim();
      const viewer = getViewer();

      switch (setting) {
        case 'bg_color': {
          const hex = resolveColor(value);
          if (!hex) throw new Error(`Unknown color "${value}"`);
          viewer.setBackgroundColor(hex);
          const state = getState();
          state.settings.bgColor = hex;
          state.settings.userSetBgColor = true;
          break;
        }
        case 'stick_radius': {
          const radius = parseFloat(value);
          if (isNaN(radius)) throw new Error('stick_radius must be a number');
          const stState = getState();
          stState.settings.stickRadius = radius;
          for (const [, obj] of stState.objects) {
            if (!obj.visible || !obj.representations.has('stick')) continue;
            const selSpec = { model: obj.model };
            viewer.setStyle(selSpec, {});
            for (const rep of obj.representations) {
              if (rep === 'line' && obj.representations.has('stick')) continue;
              const style = repStyle(rep);
              if (rep === 'stick') {
                style.stick = Object.assign({}, style.stick, { radius });
              }
              viewer.addStyle(selSpec, style);
            }
          }
          break;
        }
        case 'sphere_scale': {
          const scale = parseFloat(value);
          if (isNaN(scale)) throw new Error('sphere_scale must be a number');
          const spState = getState();
          spState.settings.sphereScale = scale;
          for (const [, obj] of spState.objects) {
            if (!obj.visible || !obj.representations.has('sphere')) continue;
            const selSpec = { model: obj.model };
            viewer.setStyle(selSpec, {});
            for (const rep of obj.representations) {
              if (rep === 'line' && obj.representations.has('stick')) continue;
              const style = repStyle(rep);
              if (rep === 'sphere') {
                style.sphere = Object.assign({}, style.sphere, { scale });
              }
              viewer.addStyle(selSpec, style);
            }
          }
          break;
        }
        case 'label_size': {
          const size = parseInt(value, 10);
          if (isNaN(size)) throw new Error('label_size must be a number');
          // Store setting for future label commands
          const state = getState();
          state.settings.labelSize = size;
          break;
        }
        default:
          throw new Error(
            `Unknown setting "${setting}". Valid: bg_color, stick_radius, sphere_scale, label_size`
          );
      }
      viewer.render();
      notifyStateChange();
      ctx.terminal.print(`Set ${setting} = ${value}`, 'result');
    },
    usage: 'set <setting>, <value>',
    help: 'Change a viewer setting. Settings: bg_color, stick_radius, sphere_scale, label_size.',
  });

  registry.register('cartoon_style', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length === 0) {
        throw new Error(
          'Usage: cartoon_style <style> [, entry]\nStyles: default, rectangle, oval, trace, parabola, edged'
        );
      }
      const styleInput = parts[0].trim().toLowerCase();
      const entryName = parts.length > 1 ? parts[1].trim() : null;

      const VALID_STYLES = {
        default: 'rectangle',
        rectangle: 'rectangle',
        oval: 'oval',
        trace: 'trace',
        parabola: 'parabola',
        edged: 'edged',
      };
      const styleValue = VALID_STYLES[styleInput];
      if (!styleValue) {
        throw new Error(
          `Unknown cartoon style "${styleInput}". Valid: ${Object.keys(VALID_STYLES).join(', ')}`
        );
      }

      const viewer = getViewer();
      const state = getState();
      let count = 0;

      for (const [name, obj] of state.objects) {
        if (entryName && name !== entryName) continue;
        if (!obj.visible) continue;
        if (!obj.representations.has('cartoon')) continue;

        const selSpec = { model: obj.model };
        viewer.setStyle(selSpec, {});
        for (const rep of obj.representations) {
          if (rep === 'line' && obj.representations.has('stick')) continue;
          const style = repStyle(rep);
          if (rep === 'cartoon') {
            style.cartoon = Object.assign({}, style.cartoon, { style: styleValue });
          }
          viewer.addStyle(selSpec, style);
        }
        count++;
      }

      if (entryName && count === 0) {
        throw new Error(
          `Object "${entryName}" not found or has no cartoon representation`
        );
      }

      viewer.render();
      const target = entryName || 'all objects';
      ctx.terminal.print(`Set cartoon style to ${styleValue} for ${target}`, 'result');
    },
    usage: 'cartoon_style <style> [, entry]',
    help: 'Set cartoon rendering style. Styles: default, rectangle, oval, trace, parabola, edged.',
  });

  registry.register('bfactor_spectrum', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: bfactor_spectrum <min>, <max>');
      }
      const min = parseFloat(parts[0]);
      const max = parseFloat(parts[1]);
      if (isNaN(min) || isNaN(max)) {
        throw new Error('min and max must be numbers');
      }
      if (min >= max) {
        throw new Error('min must be less than max');
      }

      const state = getState();
      state.settings.bfactorMin = min;
      state.settings.bfactorMax = max;

      // Re-apply B-factor coloring to all visible objects
      const viewer = getViewer();
      const colorfunc = buildBfactorScheme(min, max);
      for (const [, obj] of state.objects) {
        if (!obj.visible) continue;
        const selSpec = { model: obj.model };
        const reps = obj.representations.size > 0
          ? obj.representations
          : new Set(['cartoon']);
        const styleObj = {};
        for (const rep of reps) {
          styleObj[rep] = { colorfunc };
        }
        viewer.setStyle(selSpec, styleObj);
      }
      viewer.render();
      notifyStateChange();
      ctx.terminal.print(
        `B-factor spectrum set to ${min}\u2013${max} (pastel blue \u2192 pastel red)`,
        'result'
      );
    },
    usage: 'bfactor_spectrum <min>, <max>',
    help: 'Set B-factor coloring range and apply. Values below min are pastel blue, above max are pastel red.',
  });
}
