import { parseArgs } from './registry.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer, scheduleRender } from '../viewer.js';
import {
  getState,
  removeObject,
  removeSelection,
  renameSelection,
  renameObject,
  renameGroup,
  pruneSelections,
  findTreeNode,
  removeGroup,
  collectEntryNames,
  getChildSurfaceNames,
  updateSurfaceEntry,
} from '../state.js';
import { renderHighlight, clearHighlight } from '../highlight.js';

function requireSurfaceService(ctx) {
  if (!ctx.surfaceService) {
    throw new Error('Surface service is unavailable');
  }
  return ctx.surfaceService;
}

function collectChildSurfaceNames(objectNames) {
  const surfaceNamesByParent = new Map();
  for (const objectName of objectNames) {
    surfaceNamesByParent.set(objectName, getChildSurfaceNames(objectName));
  }
  return surfaceNamesByParent;
}

function hasChildSurfaces(surfaceNamesByParent) {
  for (const surfaceNames of surfaceNamesByParent.values()) {
    if (surfaceNames.length > 0) {
      return true;
    }
  }
  return false;
}

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
      scheduleRender();

      // Prune removed atoms from all stored selections
      const removedIndices = atoms.map(a => a.index);
      pruneSelections(removedIndices);
      const sele = getState().selections.get('sele');
      if (sele && sele.visible) {
        const atoms = getViewer().selectedAtoms(sele.spec);
        renderHighlight(atoms);
      } else {
        clearHighlight();
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

      // Check if it's a group
      const groupFound = findTreeNode(state.entryTree, name, 'group');
      if (groupFound) {
        const entries = collectEntryNames(groupFound.node);
        const surfaceNamesByParent = collectChildSurfaceNames(entries.objects);
        const surfaceService = entries.surfaces.length > 0 || hasChildSurfaces(surfaceNamesByParent)
          ? requireSurfaceService(ctx)
          : ctx.surfaceService;
        const viewer = getViewer();
        const allRemovedIndices = [];

        for (const objName of entries.objects) {
          const obj = state.objects.get(objName);
          if (obj) {
            const modelAtoms = viewer.selectedAtoms({ model: obj.model });
            allRemovedIndices.push(...modelAtoms.map(a => a.index));
            if (surfaceService) {
              surfaceService.removeSurfacesForParent(objName);
            }
            viewer.removeModel(obj.model);
          }
        }
        for (const surfaceName of entries.surfaces) {
          surfaceService.removeSurface(surfaceName);
        }

        scheduleRender();
        removeGroup(name);
        pruneSelections(allRemovedIndices);
        const sele = getState().selections.get('sele');
        if (sele && sele.visible) {
          const atoms = getViewer().selectedAtoms(sele.spec);
          renderHighlight(atoms);
        } else {
          clearHighlight();
        }

        ctx.terminal.print(`Deleted group "${name}" (${entries.objects.length} objects, ${entries.selections.length} selections)`, 'result');
        return;
      }

      if (state.surfaces.has(name)) {
        requireSurfaceService(ctx).removeSurface(name);
        ctx.terminal.print(`Deleted surface "${name}"`, 'result');
        return;
      }

      const obj = state.objects.get(name);
      if (!obj) {
        throw new Error(`"${name}" not found`);
      }

      const viewer = getViewer();

      // If this object has hierarchy children, collect all their atoms too
      const treeNode = findTreeNode(state.entryTree, name, 'object');
      const allRemovedIndices = [];
      const objectNames = treeNode && treeNode.node.children && treeNode.node.children.length > 0
        ? collectEntryNames(treeNode.node).objects
        : [name];
      const surfaceNamesByParent = collectChildSurfaceNames(objectNames);
      const surfaceService = hasChildSurfaces(surfaceNamesByParent)
        ? requireSurfaceService(ctx)
        : ctx.surfaceService;

      if (treeNode && treeNode.node.children && treeNode.node.children.length > 0) {
        for (const objName of objectNames) {
          const childObj = state.objects.get(objName);
          if (childObj) {
            const modelAtoms = viewer.selectedAtoms({ model: childObj.model });
            allRemovedIndices.push(...modelAtoms.map(a => a.index));
            if (surfaceService) {
              surfaceService.removeSurfacesForParent(objName);
            }
            viewer.removeModel(childObj.model);
            state.objects.delete(objName);
          }
        }
      } else {
        // Simple object deletion
        const modelAtoms = viewer.selectedAtoms({ model: obj.model });
        allRemovedIndices.push(...modelAtoms.map(a => a.index));
        if (surfaceService) {
          surfaceService.removeSurfacesForParent(name);
        }
        viewer.removeModel(obj.model);
      }

      scheduleRender();
      removeObject(name);

      // Prune deleted atoms from all stored selections
      pruneSelections(allRemovedIndices);
      const sele = getState().selections.get('sele');
      if (sele && sele.visible) {
        const atoms = getViewer().selectedAtoms(sele.spec);
        renderHighlight(atoms);
      } else {
        clearHighlight();
      }

      ctx.terminal.print(`Deleted object "${name}"`, 'result');
    },
    usage: 'delete <name>',
    help: 'Delete a molecular object, named selection, or group.',
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
      } else if (findTreeNode(state.entryTree, oldName, 'group')) {
        renameGroup(oldName, newName);
        ctx.terminal.print(`Renamed group "${oldName}" to "${newName}"`, 'result');
      } else if (state.surfaces.has(oldName)) {
        requireSurfaceService(ctx).renameSurface(oldName, newName);
        ctx.terminal.print(`Renamed surface "${oldName}" to "${newName}"`, 'result');
      } else if (state.objects.has(oldName)) {
        const childSurfaceNames = getChildSurfaceNames(oldName);
        renameObject(oldName, newName);
        for (const surfaceName of childSurfaceNames) {
          updateSurfaceEntry(surfaceName, { parentName: newName });
        }
        ctx.terminal.print(`Renamed "${oldName}" to "${newName}"`, 'result');
      } else {
        throw new Error(`"${oldName}" not found`);
      }
    },
    usage: 'set_name <old_name>, <new_name>',
    help: 'Rename a molecular object or named selection.',
  });
}
