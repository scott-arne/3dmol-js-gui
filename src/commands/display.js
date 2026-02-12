import { parseArgs } from './registry.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer, repStyle } from '../viewer.js';
import { getState, notifyStateChange } from '../state.js';

/**
 * Map of plural/alternate representation names to canonical 3Dmol.js style names.
 *
 * @type {Object<string, string>}
 */
const REP_MAP = {
  cartoon: 'cartoon',
  stick: 'stick',
  sticks: 'stick',
  line: 'line',
  lines: 'line',
  sphere: 'sphere',
  spheres: 'sphere',
  surface: 'surface',
  cross: 'cross',
  crosses: 'cross',
  ribbon: 'ribbon',
  ribbons: 'ribbon',
  everything: 'everything',
};

/**
 * Normalize a representation name to its canonical 3Dmol.js style name.
 *
 * Supports prefix matching: if the input is not an exact key, it matches
 * against all keys that start with the input. Ambiguous prefixes throw.
 *
 * @param {string} name - The representation name to normalize.
 * @returns {string} The canonical representation name.
 * @throws {Error} If the name is not a recognized representation or is ambiguous.
 */
function normalizeRep(name) {
  const lower = name.toLowerCase();
  const rep = REP_MAP[lower];
  if (rep) return rep;

  // Try prefix matching
  const matches = Object.keys(REP_MAP).filter(k => k.startsWith(lower));
  if (matches.length === 1) {
    return REP_MAP[matches[0]];
  }
  if (matches.length > 1) {
    // Deduplicate canonical names for the error message
    const unique = [...new Set(matches.map(k => REP_MAP[k]))];
    throw new Error(`Ambiguous representation "${name}": ${unique.join(', ')}`);
  }
  throw new Error(
    `Unknown representation "${name}". Valid: ${[...new Set(Object.values(REP_MAP))].join(', ')}`
  );
}

/**
 * Register the display commands (show, hide, enable, disable) into the given
 * command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerDisplayCommands(registry) {
  registry.register('show', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length === 0) {
        throw new Error('Usage: show <representation> [, selection]');
      }
      const repName = normalizeRep(parts[0]);
      const selStr = parts.slice(1).join(', ') || null;
      const result = resolveSelection(selStr);
      const selSpec = getSelSpec(result);
      const viewer = getViewer();
      const state = getState();

      // Collect affected objects (only model-level and global scopes update state)
      const affectedObjs = [];
      if (!selStr) {
        for (const [, obj] of state.objects) affectedObjs.push(obj);
      } else if (result.spec && result.spec.model) {
        for (const [, obj] of state.objects) {
          if (obj.model === result.spec.model) affectedObjs.push(obj);
        }
      }

      // Line/stick interaction: both map to 3Dmol stick geometry.
      // When both are active, only thick sticks need to render.
      const skipVisual = repName === 'line' &&
        affectedObjs.some(o => o.representations.has('stick'));
      const rebuildVisual = repName === 'stick' &&
        affectedObjs.some(o => o.representations.has('line'));

      // Update state
      for (const obj of affectedObjs) {
        obj.representations.add(repName);
      }

      // Apply visual update
      if (skipVisual) {
        // Sticks already cover lines — no visual change needed
      } else if (rebuildVisual) {
        // Clear and rebuild so thin sticks are replaced, not layered
        viewer.setStyle(selSpec, {});
        for (const [, obj] of state.objects) {
          if (!obj.visible) continue;
          for (const rep of obj.representations) {
            if (rep === 'line' && obj.representations.has('stick')) continue;
            viewer.addStyle(selSpec, repStyle(rep));
          }
        }
      } else {
        viewer.addStyle(selSpec, repStyle(repName));
      }

      viewer.render();
      notifyStateChange();

      ctx.terminal.print(
        `Showing ${repName}${selStr ? ` for ${selStr}` : ''}`,
        'result'
      );
    },
    usage: 'show <representation> [, selection]',
    help: 'Show a representation (cartoon, stick, line, sphere, surface, cross, ribbon).',
  });

  registry.register('hide', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length === 0) {
        throw new Error('Usage: hide <representation> [, selection]');
      }
      const raw = parts[0].trim();
      const repName = normalizeRep(raw);
      const selStr = parts.slice(1).join(', ') || null;
      const result = resolveSelection(selStr);
      const selSpec = getSelSpec(result);
      const viewer = getViewer();
      const state = getState();

      if (repName === 'everything') {
        viewer.setStyle(selSpec, {});
        // Only clear representations for model-level or global scope.
        // Atom-level selections should not affect the object-wide representation set.
        if (!selStr) {
          for (const [, obj] of state.objects) {
            obj.representations.clear();
          }
        } else if (result.spec && result.spec.model) {
          for (const [, obj] of state.objects) {
            if (obj.model === result.spec.model) {
              obj.representations.clear();
            }
          }
        }
      } else {
        // Clear styles on selected atoms, then re-add remaining reps on same scope
        viewer.setStyle(selSpec, {});

        if (!selStr) {
          for (const [, obj] of state.objects) {
            obj.representations.delete(repName);
            if (obj.visible) {
              for (const rep of obj.representations) {
                // Skip line when stick is also active (stick covers line)
                if (rep === 'line' && obj.representations.has('stick')) continue;
                viewer.addStyle(selSpec, repStyle(rep));
              }
            }
          }
        } else if (result.spec && result.spec.model) {
          for (const [, obj] of state.objects) {
            if (obj.model === result.spec.model) {
              obj.representations.delete(repName);
            }
            if (obj.visible) {
              for (const rep of obj.representations) {
                if (rep === 'line' && obj.representations.has('stick')) continue;
                viewer.addStyle(selSpec, repStyle(rep));
              }
            }
          }
        } else {
          // Atom-level selection: rebuild styles for those atoms from object reps
          // without modifying the object-wide representation set
          for (const [, obj] of state.objects) {
            if (obj.visible) {
              for (const rep of obj.representations) {
                if (rep === repName) continue;
                if (rep === 'line' && obj.representations.has('stick')) continue;
                viewer.addStyle(selSpec, repStyle(rep));
              }
            }
          }
        }
      }
      viewer.render();
      notifyStateChange();

      ctx.terminal.print(
        `Hiding ${raw.toLowerCase()}${selStr ? ` for ${selStr}` : ''}`,
        'result'
      );
    },
    usage: 'hide <representation> [, selection]',
    help: 'Hide a representation. Use "hide everything" to clear all styles.',
  });

  registry.register('enable', {
    handler: (args, ctx) => {
      const name = args.trim();
      if (!name) {
        throw new Error('Usage: enable <object_name>');
      }
      const state = getState();
      const obj = state.objects.get(name);
      if (!obj) {
        throw new Error(`Object "${name}" not found`);
      }
      obj.model.show();
      obj.visible = true;
      getViewer().render();
      notifyStateChange();
      ctx.terminal.print(`Enabled "${name}"`, 'result');
    },
    usage: 'enable <object_name>',
    help: 'Show a hidden molecular object.',
  });

  registry.register('disable', {
    handler: (args, ctx) => {
      const name = args.trim();
      if (!name) {
        throw new Error('Usage: disable <object_name>');
      }
      const state = getState();
      const obj = state.objects.get(name);
      if (!obj) {
        throw new Error(`Object "${name}" not found`);
      }
      obj.model.hide();
      obj.visible = false;
      getViewer().render();
      notifyStateChange();
      ctx.terminal.print(`Disabled "${name}"`, 'result');
    },
    usage: 'disable <object_name>',
    help: 'Hide a molecular object without removing it.',
  });
}
