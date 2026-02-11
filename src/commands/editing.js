import { parseArgs } from './registry.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer } from '../viewer.js';
import { getState, removeObject, removeSelection, renameSelection, renameObject, pruneSelections } from '../state.js';
import { clearHighlight, applyHighlight } from '../viewer.js';

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

      // Prune removed atoms from all stored selections
      const removedIndices = atoms.map(a => a.index);
      pruneSelections(removedIndices);
      clearHighlight();
      if (getState().activeSelection) {
        applyHighlight(getState().activeSelection);
      }

      ctx.terminal.print(`Removed ${atoms.length} atoms`, 'result');
    },
    usage: 'remove <selection>',
    help: 'Remove atoms matching the selection from the viewer.',
  });

  registry.register('delete', {
    handler: (args, ctx) => {
      const name = args.trim();
      if (!name) {
        throw new Error('Usage: delete <name>');
      }
      const state = getState();

      // Check if it's a selection
      if (state.selections.has(name)) {
        removeSelection(name);
        ctx.terminal.print(`Deleted selection "(${name})"`, 'result');
        return;
      }

      const obj = state.objects.get(name);
      if (!obj) {
        throw new Error(`"${name}" not found`);
      }

      const viewer = getViewer();
      // Collect atom indices before removing the model
      const modelAtoms = viewer.selectedAtoms({ model: obj.model });
      const removedIndices = modelAtoms.map(a => a.index);

      viewer.removeModel(obj.model);
      viewer.render();
      removeObject(name);

      // Prune deleted atoms from all stored selections
      pruneSelections(removedIndices);
      clearHighlight();
      if (getState().activeSelection) {
        applyHighlight(getState().activeSelection);
      }

      ctx.terminal.print(`Deleted object "${name}"`, 'result');
    },
    usage: 'delete <name>',
    help: 'Delete a molecular object or named selection.',
  });

  registry.register('set_name', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: set_name <old_name>, <new_name>');
      }
      const oldName = parts[0].trim();
      const newName = parts[1].trim();
      const state = getState();

      if (state.selections.has(oldName)) {
        renameSelection(oldName, newName);
        ctx.terminal.print(`Renamed selection "(${oldName})" to "(${newName})"`, 'result');
      } else if (state.objects.has(oldName)) {
        renameObject(oldName, newName);
        ctx.terminal.print(`Renamed "${oldName}" to "${newName}"`, 'result');
      } else {
        throw new Error(`"${oldName}" not found`);
      }
    },
    usage: 'set_name <old_name>, <new_name>',
    help: 'Rename a molecular object or named selection.',
  });
}
