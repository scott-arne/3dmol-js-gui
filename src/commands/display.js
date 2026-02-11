import { parseArgs } from './registry.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer } from '../viewer.js';
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
};

/**
 * Normalize a representation name to its canonical 3Dmol.js style name.
 *
 * @param {string} name - The representation name to normalize.
 * @returns {string} The canonical representation name.
 * @throws {Error} If the name is not a recognized representation.
 */
function normalizeRep(name) {
  const rep = REP_MAP[name.toLowerCase()];
  if (!rep) {
    throw new Error(
      `Unknown representation "${name}". Valid: ${Object.keys(REP_MAP).join(', ')}`
    );
  }
  return rep;
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

      viewer.addStyle(selSpec, { [repName]: {} });
      viewer.render();

      // Update state: when no selection or "all", update all objects;
      // when selection is model-level, update only that object.
      // Atom-level selections (index, chain/resi, etc.) are sub-object and
      // should NOT add to the object-wide representation set.
      const state = getState();
      if (!selStr) {
        for (const [, obj] of state.objects) {
          obj.representations.add(repName);
        }
      } else if (result.spec && result.spec.model) {
        for (const [, obj] of state.objects) {
          if (obj.model === result.spec.model) {
            obj.representations.add(repName);
          }
        }
      }
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
      const selStr = parts.slice(1).join(', ') || null;
      const result = resolveSelection(selStr);
      const selSpec = getSelSpec(result);
      const viewer = getViewer();
      const state = getState();

      if (raw.toLowerCase() === 'everything') {
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
        const repName = normalizeRep(raw);
        // Clear styles on selected atoms, then re-add remaining reps on same scope
        viewer.setStyle(selSpec, {});

        if (!selStr) {
          for (const [, obj] of state.objects) {
            obj.representations.delete(repName);
            if (obj.visible) {
              for (const rep of obj.representations) {
                viewer.addStyle(selSpec, { [rep]: {} });
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
                viewer.addStyle(selSpec, { [rep]: {} });
              }
            }
          }
        } else {
          // Atom-level selection: rebuild styles for those atoms from object reps
          // without modifying the object-wide representation set
          for (const [, obj] of state.objects) {
            if (obj.visible) {
              for (const rep of obj.representations) {
                if (rep !== repName) {
                  viewer.addStyle(selSpec, { [rep]: {} });
                }
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
