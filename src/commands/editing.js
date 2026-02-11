import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer } from '../viewer.js';
import { getState, removeObject } from '../state.js';

/**
 * Register the editing commands (remove, delete) into the given command
 * registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerEditingCommands(registry) {
  registry.register('remove', {
    handler: (args, ctx) => {
      const selStr = args.trim();
      if (!selStr) {
        throw new Error('Usage: remove <selection>');
      }
      const result = resolveSelection(selStr);
      const selSpec = getSelSpec(result);
      const viewer = getViewer();

      let atoms;
      if (result.spec) {
        atoms = viewer.selectedAtoms(result.spec);
      } else {
        atoms = result.atoms;
      }

      if (atoms.length === 0) {
        ctx.terminal.print('No atoms match the selection', 'info');
        return;
      }

      // 3Dmol.js does not support removing individual atoms from a model.
      // Hide them by setting their style to empty so they are no longer visible.
      viewer.setStyle(selSpec, {});
      viewer.render();

      ctx.terminal.print(`Removed ${atoms.length} atoms`, 'result');
    },
    usage: 'remove <selection>',
    help: 'Remove atoms matching the selection from the viewer.',
  });

  registry.register('delete', {
    handler: (args, ctx) => {
      const name = args.trim();
      if (!name) {
        throw new Error('Usage: delete <object_name>');
      }
      const state = getState();
      const obj = state.objects.get(name);
      if (!obj) {
        throw new Error(`Object "${name}" not found`);
      }

      const viewer = getViewer();
      viewer.removeModel(obj.model);
      viewer.render();
      removeObject(name);

      ctx.terminal.print(`Deleted object "${name}"`, 'result');
    },
    usage: 'delete <object_name>',
    help: 'Delete a molecular object from the viewer and state.',
  });
}
