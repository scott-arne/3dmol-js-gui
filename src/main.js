/**
 * Main application bootstrap for the 3Dmol.js GUI.
 *
 * Wires together all UI components (menu bar, sidebar, terminal), the 3Dmol
 * viewer, and the application state store into a working application.
 */

import './ui/styles.css';
import { initViewer, getViewer, setupClickHandler, updateClickableModels, repStyle, repKey, refreshLabels, orientView, scheduleRender } from './viewer.js';
import { initHighlight, renderHighlight, clearHighlight } from './highlight.js';
import { loadStructure, loadStructureFile } from './loading/structure-loader.js';
import {
  normalizeRemoteLoadingConfig,
  resolveArbitraryUrlRequest,
  resolveConfiguredSourceRequest,
  resolveInitializationStructureRequest,
} from './loading/remote-loading.js';
import { createMenuBar } from './ui/menubar.js';
import { createSidebar } from './ui/sidebar.js';
import { createTerminal } from './ui/terminal.js';
import { resolveTheme } from './theme-detect.js';
import { SpatialGrid } from './spatial-grid.js';
import {
  getState,
  onStateChange,
  toggleObjectVisibility,
  getNextSurfaceName,
  getChildSurfaceNames,
  updateSurfaceEntry,
  setSelectionMode,
  removeObject,
  addSelection,
  removeSelection,
  renameSelection,
  renameObject,
  toggleSelectionVisibility,
  pruneSelections,
  notifyStateChange,
  toggleCollapsed,
  addGroup,
  removeGroup,
  ungroupGroup,
  renameGroup,
  reparentEntry,
  findTreeNode,
  collectEntryNames,
  getNextIsosurfaceName,
} from './state.js';
import { createCommandRegistry, createCommandContext } from './commands/registry.js';
import { registerAllCommands } from './commands/index.js';
import { showLoadDialog, showExportDialog, showQuickstart, showRenameDialog } from './ui/dialogs.js';
import { createContextMenu } from './ui/context-menu.js';
import {
  applyColor, applyColorToSelection, formatColorDisplay,
  applyLabel, applyShow, applyHide, applyHideSelection,
  applyViewPreset, getPresetLabel,
} from './actions.js';
import { applyPreset } from './presets.js';
import { resolveSelection, getSelSpec } from './commands/resolve-selection.js';
import {
  createSurface,
  removeSurface,
  renameSurface,
  setSurfaceVisibility,
  setSurfaceMode,
  setSurfaceOpacity,
  setSurfaceColor,
  setSurfaceParentVisibility,
  removeSurfacesForParent,
  findSingleSurfaceParent,
} from './surfaces.js';
import {
  createIsosurface,
  createMap,
  removeIsosurface,
  removeMap,
  renameIsosurface,
  renameMap,
  setIsosurfaceColor,
  setIsosurfaceLevel,
  setIsosurfaceOpacity,
  setIsosurfaceRepresentation,
  setIsosurfaceVisibility,
  setMapColor,
  setMapOpacity,
  setMapVisibility,
} from './maps.js';

// Guard: ensure 3Dmol.js is loaded
if (typeof $3Dmol === 'undefined') {
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#1e1e1e;color:#ff6b6b;font-family:monospace;font-size:16px;padding:20px;text-align:center;';
  msg.textContent = 'Error: 3Dmol.js failed to load. Check your network connection or host the library locally. See index.html for instructions.';
  document.body.appendChild(msg);
  throw new Error('3Dmol.js not loaded');
}

const app = document.getElementById('app');
const init = window.__C3D_INIT__;
const remoteLoading = normalizeRemoteLoadingConfig(init?.services?.remoteLoading);

// --- Initialize the 3Dmol viewer ---
const viewer = initViewer(document.getElementById('viewer-container'));
initHighlight(viewer);

function getActiveSeleSpec() {
  const sele = getState().selections.get('sele');
  return (sele && sele.visible) ? sele.spec : null;
}

function refreshClickableModels() {
  const state = getState();
  const visible = [];
  for (const [, obj] of state.objects) {
    if (obj.visible) visible.push(obj.model);
  }
  updateClickableModels(visible);
}

// --- Create the terminal ---
const terminal = createTerminal(document.getElementById('terminal-container'));

const surfaceService = {
  createSurface,
  removeSurface,
  renameSurface,
  setSurfaceVisibility,
  setSurfaceMode,
  setSurfaceOpacity,
  setSurfaceColor,
  setSurfaceParentVisibility,
  removeSurfacesForParent,
  findSingleSurfaceParent,
};

const mapService = {
  createMap,
  removeMap,
  renameMap,
  setMapVisibility,
  setMapColor,
  setMapOpacity,
  createIsosurface,
  removeIsosurface,
  renameIsosurface,
  setIsosurfaceVisibility,
  setIsosurfaceRepresentation,
  setIsosurfaceOpacity,
  setIsosurfaceColor,
  setIsosurfaceLevel,
};

function isSurfaceEffectivelyVisible(surface) {
  return surface.visible !== false && surface.parentVisible !== false;
}

function getDirectGroupedSurfaceNames(entries, state) {
  const groupedObjects = new Set(entries.objects);
  return entries.surfaces.filter((surfaceName) => {
    const surface = state.surfaces.get(surfaceName);
    return surface && (!surface.parentName || !groupedObjects.has(surface.parentName));
  });
}

function setDirectGroupedSurfaceVisibility(entries, state, visible) {
  for (const surfaceName of getDirectGroupedSurfaceNames(entries, state)) {
    surfaceService.setSurfaceVisibility(surfaceName, visible);
  }
}

function resolveSidebarActionTarget(name, kind = 'object') {
  const state = getState();

  if (kind === 'selection') {
    const selectionEntry = state.selections.get(name);
    if (!selectionEntry) return null;
    return {
      kind,
      name,
      label: `"(${name})"`,
      selection: selectionEntry.spec,
      selectionEntry,
    };
  }

  const objectEntry = state.objects.get(name);
  if (!objectEntry) return null;
  return {
    kind: 'object',
    name,
    label: `"${name}"`,
    selection: { model: objectEntry.model },
    objectEntry,
  };
}

function handleSidebarEntryAction(name, action, kind = 'object') {
  const target = resolveSidebarActionTarget(name, kind);
  if (!target) return;
  const viewer = getViewer();

  switch (action) {
    case 'center':
      viewer.center(target.selection);
      scheduleRender();
      terminal.print(`Centered on ${target.label}`, 'result');
      break;
    case 'orient':
      orientView(target.selection);
      terminal.print(`Oriented ${target.label}`, 'result');
      break;
    case 'zoom':
      viewer.zoomTo(target.selection);
      scheduleRender();
      terminal.print(`Zoomed to ${target.label}`, 'result');
      break;
    case 'delete':
      if (target.kind === 'selection') {
        removeSelection(name);
        terminal.print(`Deleted selection ${target.label}`, 'result');
      } else {
        const modelAtoms = viewer.selectedAtoms(target.selection);
        const removedIndices = modelAtoms.map(a => a.index);
        surfaceService.removeSurfacesForParent(name);
        viewer.removeModel(target.objectEntry.model);
        scheduleRender();
        removeObject(name);
        pruneSelections(removedIndices);
        const sele = getState().selections.get('sele');
        if (sele && sele.visible) {
          const atoms = viewer.selectedAtoms(sele.spec);
          renderHighlight(atoms);
        } else {
          clearHighlight();
        }
        terminal.print(`Deleted ${target.label}`, 'result');
      }
      break;
    case 'rename':
      showRenameDialog(name, (newName) => {
        try {
          if (target.kind === 'selection') {
            renameSelection(name, newName);
            terminal.print(`Renamed ${target.label} to "(${newName})"`, 'result');
          } else {
            const childSurfaceNames = getChildSurfaceNames(name);
            renameObject(name, newName);
            for (const surfaceName of childSurfaceNames) {
              updateSurfaceEntry(surfaceName, { parentName: newName });
            }
            terminal.print(`Renamed ${target.label} to "${newName}"`, 'result');
          }
        } catch (e) {
          terminal.print(e.message, 'error');
        }
      });
      break;
  }
}

async function handleCreateSurface(name, type, kind = 'object') {
  const target = resolveSidebarActionTarget(name, kind);
  if (!target) {
    const label = kind === 'selection' ? `"(${name})"` : `"${name}"`;
    terminal.print(`Cannot create surface: ${label} not found`, 'error');
    return;
  }

  const surfaceName = getNextSurfaceName();
  const parentName = target.kind === 'object'
    ? target.name
    : surfaceService.findSingleSurfaceParent(target.selection) || null;

  try {
    const surface = await surfaceService.createSurface({
      name: surfaceName,
      selection: target.selection,
      type,
      parentName,
    });
    if (surface) {
      terminal.print(`Created ${type} surface "${surface.name}" for ${target.label}`, 'result');
    }
  } catch (e) {
    terminal.print(`Failed to create surface for ${target.label}: ${e.message}`, 'error');
  }
}

function handleSidebarEntryShow(name, rep, kind = 'object') {
  const target = resolveSidebarActionTarget(name, kind);
  if (!target) return;

  if (target.kind === 'selection') {
    getViewer().addStyle(target.selection, repStyle(rep));
    scheduleRender();
  } else {
    applyShow(target.selection, rep, target.objectEntry);
  }
  terminal.print(`Showing ${rep} on ${target.label}`, 'result');
}

function handleSidebarEntryHide(name, rep, kind = 'object') {
  const target = resolveSidebarActionTarget(name, kind);
  if (!target) return;

  if (target.kind === 'selection') {
    applyHideSelection(target.selection, rep);
  } else {
    applyHide(target.selection, rep, target.objectEntry);
  }
  terminal.print(`Hiding ${rep} on ${target.label}`, 'result');
}

function handleSidebarEntryLabel(name, prop, kind = 'object') {
  const target = resolveSidebarActionTarget(name, kind);
  if (!target) return;

  applyLabel(target.selection, prop);
  terminal.print(prop === 'clear' ? 'Labels cleared' : `Labeled ${target.label} by ${prop}`, 'result');
}

function handleSidebarEntryView(name, presetName, kind = 'object') {
  const target = resolveSidebarActionTarget(name, kind);
  if (!target) return;

  const reps = applyViewPreset(presetName, target.selection);
  if (target.kind === 'object') {
    target.objectEntry.representations = new Set(reps);
    notifyStateChange();
  }
  terminal.print(`Applied "${getPresetLabel(presetName)}" preset to ${target.label}`, 'result');
}

function handleSidebarEntryColor(name, rawScheme, kind = 'object') {
  const target = resolveSidebarActionTarget(name, kind);
  if (!target) return;

  if (target.kind === 'selection') {
    applyColorToSelection(target.selection, rawScheme);
  } else {
    applyColor(target.selection, target.objectEntry.representations, rawScheme);
  }
  terminal.print(`Colored ${target.label} by ${formatColorDisplay(rawScheme)}`, 'result');
}

// --- Create the sidebar with callbacks ---
const sidebar = createSidebar(document.getElementById('sidebar-container'), {
  onToggleVisibility(name) {
    const obj = toggleObjectVisibility(name);
    if (obj) {
      if (obj.visible) {
        obj.model.show();
      } else {
        obj.model.hide();
      }
      surfaceService.setSurfaceParentVisibility(name, obj.visible);
      scheduleRender();
      sidebar.refresh(getState());
    }
  },

  onAction(name, action, kind) {
    handleSidebarEntryAction(name, action, kind);
  },

  async onCreateSurface(name, type, kind) {
    await handleCreateSurface(name, type, kind);
  },

  onToggleSurfaceVisibility(name) {
    const surface = getState().surfaces.get(name);
    if (!surface) return;
    const updated = surfaceService.setSurfaceVisibility(name, !surface.visible);
    if (updated) {
      terminal.print(`${updated.visible ? 'Showing' : 'Hiding'} surface "${name}"`, 'result');
    }
  },

  onSurfaceAction(name, action) {
    const surface = getState().surfaces.get(name);
    if (!surface) return;

    switch (action) {
      case 'delete':
        if (surfaceService.removeSurface(name)) {
          terminal.print(`Deleted surface "${name}"`, 'result');
        }
        break;
      case 'rename':
        showRenameDialog(name, (newName) => {
          try {
            if (surfaceService.renameSurface(name, newName)) {
              terminal.print(`Renamed surface "${name}" to "${newName}"`, 'result');
            }
          } catch (e) {
            terminal.print(e.message, 'error');
          }
        });
        break;
      case 'center':
        getViewer().center(surface.selection);
        scheduleRender();
        terminal.print(`Centered on surface "${name}"`, 'result');
        break;
      case 'zoom':
        getViewer().zoomTo(surface.selection);
        scheduleRender();
        terminal.print(`Zoomed to surface "${name}"`, 'result');
        break;
    }
  },

  onSurfaceStyle(name, value) {
    const [kind, rawValue] = String(value).split(':');
    try {
      if (kind === 'mode') {
        const updated = surfaceService.setSurfaceMode(name, rawValue);
        if (updated) {
          terminal.print(`Set surface "${name}" mode to ${rawValue}`, 'result');
        }
      } else if (kind === 'opacity') {
        const opacity = Number(rawValue);
        if (!Number.isFinite(opacity)) {
          throw new Error(`Invalid surface opacity "${rawValue}"`);
        }
        const updated = surfaceService.setSurfaceOpacity(name, opacity);
        if (updated) {
          terminal.print(`Set surface "${name}" opacity to ${Math.round(opacity * 100)}%`, 'result');
        }
      }
    } catch (e) {
      terminal.print(e.message, 'error');
    }
  },

  onSurfaceColor(name, color) {
    const updated = surfaceService.setSurfaceColor(name, color);
    if (updated) {
      terminal.print(`Colored surface "${name}" ${color}`, 'result');
    }
  },

  onToggleMapVisibility(name) {
    const map = getState().maps.get(name);
    if (!map) return;
    const updated = mapService.setMapVisibility(name, !map.visible);
    if (updated) {
      terminal.print(`${updated.visible ? 'Showing' : 'Hiding'} map "${name}"`, 'result');
    }
  },

  async onCreateIsosurface(mapName) {
    const name = getNextIsosurfaceName();
    try {
      const iso = await mapService.createIsosurface({
        name,
        mapName,
        level: 1,
        representation: 'mesh',
      });
      terminal.print(`Created mesh isosurface "${iso.name}" from map "${mapName}" at +1`, 'result');
    } catch (e) {
      terminal.print(`Failed to create isosurface from map "${mapName}": ${e.message}`, 'error');
    }
  },

  onMapAction(name, action) {
    const map = getState().maps.get(name);
    if (!map) return;

    switch (action) {
      case 'delete':
        if (mapService.removeMap(name)) {
          terminal.print(`Deleted map "${name}"`, 'result');
        }
        break;
      case 'rename':
        showRenameDialog(name, (newName) => {
          try {
            if (mapService.renameMap(name, newName)) {
              terminal.print(`Renamed map "${name}" to "${newName}"`, 'result');
            }
          } catch (e) {
            terminal.print(e.message, 'error');
          }
        });
        break;
      case 'center':
        getViewer().center(map.bounds.center);
        scheduleRender();
        terminal.print(`Centered on map "${name}"`, 'result');
        break;
      case 'zoom':
        getViewer().zoomTo();
        scheduleRender();
        terminal.print(`Zoomed to map "${name}"`, 'result');
        break;
    }
  },

  onMapStyle(name, value) {
    const [kind, rawValue] = String(value).split(':');
    if (kind === 'opacity') {
      const opacity = Number(rawValue);
      if (!Number.isFinite(opacity)) {
        terminal.print(`Invalid map opacity "${rawValue}"`, 'error');
        return;
      }
      const updated = mapService.setMapOpacity(name, opacity);
      if (updated) {
        terminal.print(`Set map "${name}" opacity to ${Math.round(opacity * 100)}%`, 'result');
      }
    }
  },

  onMapColor(name, color) {
    const updated = mapService.setMapColor(name, color);
    if (updated) {
      terminal.print(`Colored map "${name}" ${color}`, 'result');
    }
  },

  onToggleIsosurfaceVisibility(name) {
    const iso = getState().isosurfaces.get(name);
    if (!iso) return;
    const updated = mapService.setIsosurfaceVisibility(name, !iso.visible);
    if (updated) {
      terminal.print(`${updated.visible ? 'Showing' : 'Hiding'} isosurface "${name}"`, 'result');
    }
  },

  onIsosurfaceAction(name, action) {
    const iso = getState().isosurfaces.get(name);
    if (!iso) return;
    if (action.startsWith('contour:')) {
      const level = Number(action.slice('contour:'.length));
      const updated = mapService.setIsosurfaceLevel(name, level);
      if (updated) {
        terminal.print(`Set isosurface "${name}" contour to ${level > 0 ? `+${level}` : level}`, 'result');
      }
      return;
    }

    switch (action) {
      case 'delete':
        if (mapService.removeIsosurface(name)) {
          terminal.print(`Deleted isosurface "${name}"`, 'result');
        }
        break;
      case 'rename':
        showRenameDialog(name, (newName) => {
          try {
            if (mapService.renameIsosurface(name, newName)) {
              terminal.print(`Renamed isosurface "${name}" to "${newName}"`, 'result');
            }
          } catch (e) {
            terminal.print(e.message, 'error');
          }
        });
        break;
      case 'center':
        getViewer().center(getState().maps.get(iso.mapName)?.bounds?.center);
        scheduleRender();
        terminal.print(`Centered on isosurface "${name}"`, 'result');
        break;
      case 'zoom':
        getViewer().zoomTo();
        scheduleRender();
        terminal.print(`Zoomed to isosurface "${name}"`, 'result');
        break;
    }
  },

  onIsosurfaceStyle(name, value) {
    const [kind, rawValue] = String(value).split(':');
    try {
      if (kind === 'representation') {
        const updated = mapService.setIsosurfaceRepresentation(name, rawValue);
        if (updated) {
          terminal.print(`Set isosurface "${name}" representation to ${rawValue}`, 'result');
        }
      } else if (kind === 'opacity') {
        const opacity = Number(rawValue);
        if (!Number.isFinite(opacity)) {
          throw new Error(`Invalid isosurface opacity "${rawValue}"`);
        }
        const updated = mapService.setIsosurfaceOpacity(name, opacity);
        if (updated) {
          terminal.print(`Set isosurface "${name}" opacity to ${Math.round(opacity * 100)}%`, 'result');
        }
      }
    } catch (e) {
      terminal.print(e.message, 'error');
    }
  },

  onIsosurfaceColor(name, color) {
    const updated = mapService.setIsosurfaceColor(name, color);
    if (updated) {
      terminal.print(`Colored isosurface "${name}" ${color}`, 'result');
    }
  },

  onShow(name, rep, kind) {
    handleSidebarEntryShow(name, rep, kind);
  },

  onHide(name, rep, kind) {
    handleSidebarEntryHide(name, rep, kind);
  },

  onLabel(name, prop, kind) {
    handleSidebarEntryLabel(name, prop, kind);
  },

  onView(name, presetName, kind) {
    handleSidebarEntryView(name, presetName, kind);
  },

  onColor(name, rawScheme, kind) {
    handleSidebarEntryColor(name, rawScheme, kind);
  },

  // --- Selection sidebar callbacks ---

  onToggleSelectionVisibility(name) {
    const sel = toggleSelectionVisibility(name);
    if (name === 'sele' && sel) {
      if (sel.visible) {
        const atoms = getViewer().selectedAtoms(sel.spec);
        renderHighlight(atoms);
      } else {
        clearHighlight();
      }
      scheduleRender();
    }
  },

  // --- Group sidebar callbacks ---

  onToggleCollapsed(name) {
    toggleCollapsed(name);
  },

  onToggleGroupVisibility(name) {
    const state = getState();
    const found = findTreeNode(state.entryTree, name, 'group');
    if (!found) return;
    const entries = collectEntryNames(found.node);
    // Determine target: if any member is visible, hide all; otherwise show all
    let anyVisible = false;
    for (const objName of entries.objects) {
      const obj = state.objects.get(objName);
      if (obj && obj.visible) { anyVisible = true; break; }
    }
    if (!anyVisible) {
      for (const surfaceName of getDirectGroupedSurfaceNames(entries, state)) {
        const surface = state.surfaces.get(surfaceName);
        if (surface && isSurfaceEffectivelyVisible(surface)) {
          anyVisible = true;
          break;
        }
      }
    }
    const show = !anyVisible;
    const viewer = getViewer();
    for (const objName of entries.objects) {
      const obj = state.objects.get(objName);
      if (obj) {
        obj.visible = show;
        if (obj.visible) obj.model.show();
        else obj.model.hide();
        surfaceService.setSurfaceParentVisibility(objName, obj.visible);
      }
    }
    setDirectGroupedSurfaceVisibility(entries, state, show);
    scheduleRender();
    notifyStateChange();
  },

  onGroupAction(name, action) {
    const state = getState();
    switch (action) {
      case 'enable_all':
      case 'disable_all': {
        const show = action === 'enable_all';
        const found = findTreeNode(state.entryTree, name, 'group');
        if (!found) return;
        const entries = collectEntryNames(found.node);
        const viewer = getViewer();
        for (const objName of entries.objects) {
          const obj = state.objects.get(objName);
          if (obj) {
            obj.visible = show;
            if (show) obj.model.show();
            else obj.model.hide();
            surfaceService.setSurfaceParentVisibility(objName, obj.visible);
          }
        }
        setDirectGroupedSurfaceVisibility(entries, state, show);
        scheduleRender();
        notifyStateChange();
        break;
      }
      case 'delete': {
        const found = findTreeNode(state.entryTree, name, 'group');
        if (!found) return;
        const entries = collectEntryNames(found.node);
        const viewer = getViewer();
        const allRemovedIndices = [];
        for (const objName of entries.objects) {
          const obj = state.objects.get(objName);
          if (obj) {
            const modelAtoms = viewer.selectedAtoms({ model: obj.model });
            allRemovedIndices.push(...modelAtoms.map(a => a.index));
            surfaceService.removeSurfacesForParent(objName);
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
          const atoms = viewer.selectedAtoms(sele.spec);
          renderHighlight(atoms);
        } else {
          clearHighlight();
        }
        terminal.print(`Deleted group "${name}"`, 'result');
        break;
      }
      case 'ungroup':
        ungroupGroup(name);
        terminal.print(`Ungrouped "${name}"`, 'result');
        break;
      case 'rename':
        showRenameDialog(name, (newName) => {
          try {
            renameGroup(name, newName);
            terminal.print(`Renamed group "${name}" to "${newName}"`, 'result');
          } catch (e) {
            terminal.print(e.message, 'error');
          }
        });
        break;
    }
  },

  onGroupShow(name, rep) {
    const state = getState();
    const found = findTreeNode(state.entryTree, name, 'group');
    if (!found) return;
    const entries = collectEntryNames(found.node);
    for (const objName of entries.objects) {
      const obj = state.objects.get(objName);
      if (obj) applyShow({ model: obj.model }, rep, obj);
    }
    terminal.print(`Showing ${rep} on group "${name}"`, 'result');
  },

  onGroupHide(name, rep) {
    const state = getState();
    const found = findTreeNode(state.entryTree, name, 'group');
    if (!found) return;
    const entries = collectEntryNames(found.node);
    for (const objName of entries.objects) {
      const obj = state.objects.get(objName);
      if (obj) applyHide({ model: obj.model }, rep, obj);
    }
    terminal.print(`Hiding ${rep} on group "${name}"`, 'result');
  },

  onGroupLabel(name, prop) {
    const state = getState();
    const found = findTreeNode(state.entryTree, name, 'group');
    if (!found) return;
    const entries = collectEntryNames(found.node);
    for (const objName of entries.objects) {
      const obj = state.objects.get(objName);
      if (obj) applyLabel({ model: obj.model }, prop);
    }
    terminal.print(prop === 'clear' ? 'Labels cleared' : `Labeled group "${name}" by ${prop}`, 'result');
  },

  onGroupColor(name, rawScheme) {
    const state = getState();
    const found = findTreeNode(state.entryTree, name, 'group');
    if (!found) return;
    const entries = collectEntryNames(found.node);
    for (const objName of entries.objects) {
      const obj = state.objects.get(objName);
      if (obj) applyColor({ model: obj.model }, obj.representations, rawScheme);
    }
    terminal.print(`Colored group "${name}" by ${formatColorDisplay(rawScheme)}`, 'result');
  },

  onGroupView(name, presetName) {
    const state = getState();
    const found = findTreeNode(state.entryTree, name, 'group');
    if (!found) return;
    const entries = collectEntryNames(found.node);
    for (const objName of entries.objects) {
      const obj = state.objects.get(objName);
      if (obj) {
        const reps = applyViewPreset(presetName, { model: obj.model });
        obj.representations = new Set(reps);
      }
    }
    notifyStateChange();
    terminal.print(`Applied "${getPresetLabel(presetName)}" preset to group "${name}"`, 'result');
  },
});

// --- Create the menu bar with callbacks ---
const menubar = createMenuBar(document.getElementById('menubar-container'), {
  onLoad() {
    showLoadDialog({
      onFetch: async (pdbId) => {
        terminal.print(`Fetching PDB ${pdbId}...`, 'info');
        const result = await loadStructure({ kind: 'pdb', pdbId });
        terminal.print(result.message, result.ok ? 'result' : 'error');
      },
      onLoad: async (data, format, filename) => {
        const baseName = filename.replace(/\.[^.]+$/, '');
        const result = await loadStructure({
          kind: 'inline',
          name: baseName,
          format,
          data,
        });
        terminal.print(
          result.ok ? `Loaded "${filename}" as "${result.name}"` : result.message,
          result.ok ? 'result' : 'error',
        );
      },
      onLoadFile: async (file) => {
        const result = await loadStructureFile(file);
        terminal.print(result.message, result.ok ? 'result' : 'error');
        return result;
      },
      onRemoteSource: async ({ sourceId, path, name, format }) => {
        let resolved;
        try {
          resolved = resolveConfiguredSourceRequest(remoteLoading, {
            sourceId,
            path,
            name,
            format,
          });
        } catch (e) {
          terminal.print(e.message, 'error');
          return { ok: false, message: e.message };
        }

        terminal.print(`Loading "${path}" from ${resolved.source.name}...`, 'info');
        const result = await loadStructure(resolved.request);
        terminal.print(result.message, result.ok ? 'result' : 'error');
        return result;
      },
      onLoadUrl: async ({ name, format, url }) => {
        let resolved;
        try {
          resolved = resolveArbitraryUrlRequest(remoteLoading, { name, format, url });
        } catch (e) {
          terminal.print(e.message, 'error');
          return { ok: false, message: e.message };
        }

        terminal.print(`Loading "${name}" from URL...`, 'info');
        const result = await loadStructure(resolved.request);
        terminal.print(result.message, result.ok ? 'result' : 'error');
        return result;
      },
    }, {
      remoteLoading,
    });
  },

  onExport() {
    showExportDialog({
      onExportPNG: (width, height) => {
        const viewer = getViewer();
        const srcCanvas = viewer.getCanvas();
        if (!srcCanvas) {
          terminal.print('Export failed: no canvas available', 'error');
          return;
        }
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = width;
        tmpCanvas.height = height;
        const ctx2d = tmpCanvas.getContext('2d');
        ctx2d.drawImage(srcCanvas, 0, 0, width, height);
        const dataUri = tmpCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = 'screenshot.png';
        link.click();
        terminal.print(`Screenshot exported (${width}x${height})`, 'result');
      },
    });
  },

  onView(presetName) {
    const state = getState();
    for (const [, obj] of state.objects) {
      const reps = applyViewPreset(presetName, { model: obj.model });
      obj.representations = new Set(reps);
    }
    notifyStateChange();
    terminal.print(`Applied "${getPresetLabel(presetName)}" preset`, 'result');
  },

  onSelectionMode(mode) {
    setSelectionMode(mode);
    terminal.print(`Selection mode: ${mode}`, 'info');
  },

  onSelect(type) {
    const v = getViewer();
    const AMINO = [
      'ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE',
      'LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL',
      'MSE','SEC','PYL','ASX','GLX',
      'HID','HIE','HIP','HSD','HSE','HSP',
      'CYX','CYM',
      'GLH','ASH','LYN',
    ];

    let selSpec;
    let description;

    switch (type) {
      case 'protein':
        selSpec = { resn: AMINO };
        description = 'protein';
        break;
      case 'ligand':
        selSpec = { hetflag: true, not: { resn: ['HOH', 'WAT', 'H2O', 'ACE', 'NME', ...AMINO] } };
        description = 'ligand';
        break;
      case 'backbone':
        selSpec = { resn: AMINO, atom: ['N', 'CA', 'C', 'O'] };
        description = 'backbone';
        break;
      case 'sidechains':
        selSpec = { resn: AMINO, not: { atom: ['N', 'CA', 'C', 'O'] } };
        description = 'side chains';
        break;
      default:
        return;
    }

    const atoms = v.selectedAtoms(selSpec);
    if (atoms.length === 0) {
      terminal.print(`No atoms matched for ${description}`, 'info');
      return;
    }
    const spec = { index: atoms.map(a => a.index) };
    addSelection('sele', description, spec, atoms.length);
    renderHighlight(atoms);
    terminal.print(`Selected ${description} [${atoms.length} atoms]`, 'info');
  },

  onExpand(type) {
    const state = getState();
    const sele = state.selections.get('sele');
    if (!sele || !sele.visible) {
      terminal.print('No active selection to expand', 'info');
      return;
    }

    const v = getViewer();
    const currentAtoms = v.selectedAtoms(sele.spec);
    if (currentAtoms.length === 0) {
      terminal.print('Current selection contains no atoms', 'info');
      return;
    }

    const expandedIndices = new Set(currentAtoms.map(a => a.index));
    const allAtoms = v.selectedAtoms({});
    let description;

    switch (type) {
      case 'residues': {
        const keys = new Set(currentAtoms.map(a => `${a.chain}:${a.resi}`));
        for (const a of allAtoms) {
          if (keys.has(`${a.chain}:${a.resi}`)) expandedIndices.add(a.index);
        }
        description = 'residues';
        break;
      }
      case 'chains': {
        const chains = new Set(currentAtoms.map(a => a.chain));
        for (const a of allAtoms) {
          if (chains.has(a.chain)) expandedIndices.add(a.index);
        }
        description = 'chains';
        break;
      }
      case 'molecules': {
        const models = new Set(currentAtoms.map(a => a.model));
        for (const a of allAtoms) {
          if (models.has(a.model)) expandedIndices.add(a.index);
        }
        description = 'molecules';
        break;
      }
      case 'nearAtoms': {
        const DIST = 5;
        const grid = new SpatialGrid(currentAtoms, DIST);
        for (const a of allAtoms) {
          if (expandedIndices.has(a.index)) continue;
          const nearby = grid.neighborsWithin(a.x, a.y, a.z, DIST);
          if (nearby.length > 0) {
            expandedIndices.add(a.index);
          }
        }
        description = 'near atoms (5\u00C5)';
        break;
      }
      case 'nearResidues': {
        const DIST = 5;
        const grid = new SpatialGrid(currentAtoms, DIST);
        const nearIndices = new Set([...expandedIndices]);
        for (const a of allAtoms) {
          if (nearIndices.has(a.index)) continue;
          const nearby = grid.neighborsWithin(a.x, a.y, a.z, DIST);
          if (nearby.length > 0) {
            nearIndices.add(a.index);
          }
        }
        // Expand near atoms to full residues
        const nearAtomsList = allAtoms.filter(a => nearIndices.has(a.index));
        const keys = new Set(nearAtomsList.map(a => `${a.chain}:${a.resi}`));
        for (const a of allAtoms) {
          if (keys.has(`${a.chain}:${a.resi}`)) expandedIndices.add(a.index);
        }
        description = 'near residues (5\u00C5)';
        break;
      }
      default:
        return;
    }

    const expandedSpec = { index: [...expandedIndices] };
    addSelection('sele', `expand ${description}`, expandedSpec, expandedIndices.size);
    const expandedAtoms = v.selectedAtoms(expandedSpec);
    renderHighlight(expandedAtoms);
    terminal.print(`Expanded to ${description} [${expandedIndices.size} atoms]`, 'info');
  },

  onSelectionAction(action) {
    const selSpec = getActiveSeleSpec();
    if (!selSpec) {
      terminal.print('No active selection', 'info');
      return;
    }
    const v = getViewer();
    switch (action) {
      case 'center':
        v.center(selSpec);
        scheduleRender();
        terminal.print('Centered on selection', 'result');
        break;
      case 'zoom':
        v.zoomTo(selSpec);
        scheduleRender();
        terminal.print('Zoomed to selection', 'result');
        break;
    }
  },

  onToggleSidebar() {
    app.classList.toggle('sidebar-hidden');
    getViewer().resize();
    scheduleRender();
  },

  onToggleTerminal() {
    app.classList.toggle('terminal-hidden');
    getViewer().resize();
    scheduleRender();
  },

  onToggleCompact(isCompact) {
    menubar.setCompact(isCompact);
  },

  onThemeChange(theme) {
    const state = getState();
    state.settings.theme = theme;
    document.body.dataset.theme = theme === 'light' ? 'light' : '';

    if (!state.settings.userSetBgColor) {
      const bgColor = theme === 'light' ? '#ffffff' : '#000000';
      state.settings.bgColor = bgColor;
      getViewer().setBackgroundColor(bgColor);
    }

    refreshLabels();
    scheduleRender();
    notifyStateChange();

    try {
      localStorage.setItem('3dmol-gui-theme', theme);
    } catch (e) {
      // localStorage may be unavailable
    }
  },
});

// --- Restore saved theme preference ---
{
  let savedTheme = 'dark';
  try {
    savedTheme = localStorage.getItem('3dmol-gui-theme') || 'dark';
  } catch (e) {
    // localStorage unavailable
  }
  if (savedTheme === 'light') {
    const state = getState();
    state.settings.theme = 'light';
    document.body.dataset.theme = 'light';
    menubar.setTheme('light');
    if (!state.settings.userSetBgColor) {
      state.settings.bgColor = '#ffffff';
      getViewer().setBackgroundColor('#ffffff');
      scheduleRender();
    }
  }
}

// --- Command system ---
const registry = createCommandRegistry();
const ctx = createCommandContext({
  viewer: getViewer(),
  terminal,
  sidebar,
  state: getState(),
  surfaceService,
  mapService,
});
registerAllCommands(registry, { remoteLoading });

// --- Viewer click handler for visual selection ---
/** @type {boolean} Flag to detect background clicks (no atom hit). */
let atomClickedThisCycle = false;

/**
 * Build a mode-based selection spec and description from a clicked atom.
 */
function buildModeSelection(atom, state) {
  const mode = state.selectionMode;
  let selSpec;
  let description;

  // Find the model object for the clicked atom so selections are scoped
  // to a single entry rather than matching across all loaded models.
  let modelScope = {};
  for (const [, obj] of state.objects) {
    const modelId = obj.model.getID ? obj.model.getID() : obj.modelIndex;
    if (modelId === atom.model) {
      modelScope = { model: obj.model };
      break;
    }
  }

  switch (mode) {
    case 'atoms':
      selSpec = { serial: atom.serial, ...modelScope };
      description = `atom ${atom.atom} (${atom.resn} ${atom.chain}:${atom.resi})`;
      break;
    case 'residues':
      selSpec = { chain: atom.chain, resi: atom.resi, ...modelScope };
      description = `residue ${atom.resn} ${atom.chain}:${atom.resi}`;
      break;
    case 'chains':
      selSpec = { chain: atom.chain, ...modelScope };
      description = `chain ${atom.chain}`;
      break;
    case 'molecules': {
      let modelSpec = {};
      for (const [name, obj] of state.objects) {
        const modelId = obj.model.getID ? obj.model.getID() : obj.modelIndex;
        if (modelId === atom.model) {
          modelSpec = { model: obj.model };
          description = `molecule "${name}"`;
          break;
        }
      }
      if (!description) description = 'all atoms';
      selSpec = modelSpec;
      break;
    }
    default:
      selSpec = { serial: atom.serial };
      description = `atom ${atom.atom}`;
  }

  return { selSpec, description };
}

function handleViewerClick(atom, viewerInstance) {
  atomClickedThisCycle = true;
  const state = getState();
  const mode = state.selectionMode;

  const { selSpec: clickSpec, description } = buildModeSelection(atom, state);
  const newAtoms = viewerInstance.selectedAtoms(clickSpec);

  // If sele exists and is enabled, accumulate; otherwise start fresh
  let allAtoms;
  const existingSele = state.selections.get('sele');
  if (existingSele && existingSele.visible) {
    const existingAtoms = viewerInstance.selectedAtoms(existingSele.spec);
    const seen = new Set(existingAtoms.map(a => `${a.model}:${a.index}`));
    allAtoms = [...existingAtoms];
    for (const a of newAtoms) {
      const key = `${a.model}:${a.index}`;
      if (!seen.has(key)) { allAtoms.push(a); seen.add(key); }
    }
  } else {
    allAtoms = newAtoms;
  }

  // Build a spec using serial numbers scoped per model to avoid cross-model matches
  const serialsByModel = new Map();
  for (const a of allAtoms) {
    let serials = serialsByModel.get(a.model);
    if (!serials) { serials = []; serialsByModel.set(a.model, serials); }
    serials.push(a.serial);
  }
  let combinedSpec;
  if (serialsByModel.size === 1) {
    const [modelId, serials] = [...serialsByModel.entries()][0];
    // Find the model object for this ID
    let modelObj;
    for (const [, obj] of state.objects) {
      const id = obj.model.getID ? obj.model.getID() : obj.modelIndex;
      if (id === modelId) { modelObj = obj.model; break; }
    }
    combinedSpec = modelObj ? { serial: serials, model: modelObj } : { serial: serials };
  } else {
    // Multi-model selection: use OR of per-model specs
    const orSpecs = [];
    for (const [modelId, serials] of serialsByModel) {
      let modelObj;
      for (const [, obj] of state.objects) {
        const id = obj.model.getID ? obj.model.getID() : obj.modelIndex;
        if (id === modelId) { modelObj = obj.model; break; }
      }
      orSpecs.push(modelObj ? { serial: serials, model: modelObj } : { serial: serials });
    }
    combinedSpec = { or: orSpecs };
  }

  const atomCount = allAtoms.length;
  addSelection('sele', 'click selection', combinedSpec, atomCount);
  renderHighlight(allAtoms);

  terminal.print(`Added ${description} [mode: ${mode}, ${atomCount} atom${atomCount !== 1 ? 's' : ''} total]`, 'info');
}

// Register the click callback — viewer.js stores it and automatically
// re-registers after each model load.
setupClickHandler(handleViewerClick);

// Clear selection when clicking on empty space (no atom hit).
// Track mouse movement to distinguish intentional clicks from drag rotations.
{
  const DRAG_THRESHOLD = 4; // pixels
  let mouseDownPos = null;
  const viewerContainer = document.getElementById('viewer-container');

  viewerContainer.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });

  viewerContainer.addEventListener('click', (e) => {
    const wasDrag = mouseDownPos && (
      Math.abs(e.clientX - mouseDownPos.x) > DRAG_THRESHOLD ||
      Math.abs(e.clientY - mouseDownPos.y) > DRAG_THRESHOLD
    );
    mouseDownPos = null;

    if (wasDrag) return; // Rotation/pan, not a click

    setTimeout(() => {
      if (!atomClickedThisCycle) {
        // Shift+click on background: do nothing (preserve sele)
        if (e.shiftKey) { atomClickedThisCycle = false; return; }
        const sele = getState().selections.get('sele');
        if (sele && sele.visible) {
          toggleSelectionVisibility('sele');
          clearHighlight();
          scheduleRender();
        }
      }
      atomClickedThisCycle = false;
    }, 0);
  });
}

// --- Right-click context menu on the viewer ---
createContextMenu(document.getElementById('viewer-container'), {
  hasSelection() {
    return getActiveSeleSpec() !== null;
  },

  onAction(action) {
    const v = getViewer();
    const selSpec = getActiveSeleSpec();
    if (!selSpec) return;
    switch (action) {
      case 'center':
        v.center(selSpec);
        scheduleRender();
        terminal.print('Centered on selection', 'result');
        break;
      case 'zoom':
        v.zoomTo(selSpec);
        scheduleRender();
        terminal.print('Zoomed to selection', 'result');
        break;
    }
  },

  onView(presetName) {
    const selSpec = getActiveSeleSpec();
    if (!selSpec) return;
    applyViewPreset(presetName, selSpec);
    terminal.print(`Applied "${getPresetLabel(presetName)}" preset to selection`, 'result');
  },

  onShow(rep) {
    const v = getViewer();
    const selSpec = getActiveSeleSpec();
    if (!selSpec) return;
    v.addStyle(selSpec, repStyle(rep));
    scheduleRender();
    terminal.print(`Showing ${rep} on selection`, 'result');
  },

  onHide(rep) {
    const selSpec = getActiveSeleSpec();
    if (!selSpec) return;
    applyHideSelection(selSpec, rep);
    terminal.print(`Hiding ${rep} on selection`, 'result');
  },

  onLabel(prop) {
    const selSpec = getActiveSeleSpec();
    if (!selSpec) return;
    applyLabel(selSpec, prop);
    terminal.print(prop === 'clear' ? 'Labels cleared' : `Labeled selection by ${prop}`, 'result');
  },

  onColor(rawScheme) {
    const selSpec = getActiveSeleSpec();
    if (!selSpec) return;
    applyColorToSelection(selSpec, rawScheme);
    terminal.print(`Colored selection by ${formatColorDisplay(rawScheme)}`, 'result');
  },
});

// --- Tab autocomplete ---
terminal.setCompleter((prefix, isFirstWord) => {
  if (isFirstWord) {
    return registry.completions(prefix);
  }
  const state = getState();
  const lower = prefix.toLowerCase();

  // Collect all names: objects, selections, and groups from the tree
  const names = [
    ...state.objects.keys(),
    ...state.selections.keys(),
  ];

  // Add group names from entryTree
  function collectGroupNames(nodes) {
    for (const node of nodes) {
      if (node.type === 'group') {
        names.push(node.name);
        if (node.children) collectGroupNames(node.children);
      }
    }
  }
  if (state.entryTree) collectGroupNames(state.entryTree);

  // Support dot-notation completion for hierarchy parents
  if (prefix.includes('.')) {
    const dotIdx = prefix.indexOf('.');
    const parentName = prefix.slice(0, dotIdx);
    const childPrefix = prefix.slice(dotIdx + 1).toLowerCase();
    const parentNode = findTreeNode(state.entryTree, parentName, 'object');
    if (parentNode && parentNode.node.children) {
      const dotNames = parentNode.node.children
        .filter(c => c.name.toLowerCase().startsWith(childPrefix))
        .map(c => `${parentName}.${c.name}`);
      dotNames.push(`${parentName}.*`);
      return dotNames.filter(n => n.toLowerCase().startsWith(lower)).sort();
    }
  }

  return names.filter(n => n.toLowerCase().startsWith(lower)).sort();
});

// --- Register state change listeners ---
onStateChange(() => sidebar.refresh(getState()));
onStateChange(() => refreshClickableModels());

// --- Initialization / Quick-start ---
let dismissQuickstart = null;

if (init) {
  const v = getViewer();

  // Load molecules (addModel only, no per-molecule styling/zoom/render)
  // Supports: flat entries, { children: [...] } for hierarchies,
  // and { group: 'name', entries: [...] } for groups.
  const molecules = init.molecules || [];
  async function loadInitEntry(entry, fallbackName) {
    const { request } = resolveInitializationStructureRequest(entry, fallbackName, remoteLoading);
    const result = await loadStructure(request, {
      loadOptions: { applyDefaultStyle: false, zoom: false, render: false },
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    if (entry.disabled) {
      const obj = getState().objects.get(result.name);
      if (obj) {
        obj.visible = false;
        result.model.hide();
      }
    }
    return result;
  }

  for (const mol of molecules) {
    try {
      if (mol.group && Array.isArray(mol.entries)) {
        // Group entry: { group: 'name', entries: [{name, data, format}, ...] }
        const memberNames = [];
        for (const entry of mol.entries) {
          const result = await loadInitEntry(entry, entry.format);
          memberNames.push(result.name);
        }
        if (memberNames.length > 0) {
          addGroup(mol.group, memberNames);
        }
      } else if (mol.children && Array.isArray(mol.children)) {
        // Hierarchy entry: { name, data, format, children: [{name, data, format}, ...] }
        const parent = await loadInitEntry(mol, mol.format);
        for (const child of mol.children) {
          const childResult = await loadInitEntry(child, child.format);
          reparentEntry(childResult.name, parent.name);
        }
      } else {
        // Simple flat entry
        await loadInitEntry(mol, mol.format);
      }
    } catch (e) {
      terminal.print(`Failed to load "${mol.name || mol.group || mol.format}": ${e.message}`, 'error');
    }
  }

  // Re-register click handler now that all models are loaded
  setupClickHandler(handleViewerClick);
  refreshClickableModels();

  // Apply operations in order (styles, presets, colors)
  v.setStyle({}, {});
  const ops = init.operations || [];

  if (ops.length === 0) {
    // No operations: default to line
    v.setStyle({}, repStyle('line'));
  } else {
    for (const op of ops) {
      if (op.op === 'preset') {
        const st = getState();
        for (const [, obj] of st.objects) {
          const reps = applyPreset(op.name, v, { model: obj.model });
          obj.representations = new Set(reps);
        }
        notifyStateChange();
      } else if (op.op === 'style') {
        let sel;
        if (typeof op.selection === 'string') {
          const result = resolveSelection(op.selection);
          sel = getSelSpec(result);
        } else {
          sel = op.selection || {};
        }
        v.addStyle(sel, op.style || {});
      } else if (op.op === 'color') {
        const st = getState();
        const reps = new Set();
        for (const [, obj] of st.objects) {
          for (const rep of obj.representations) reps.add(rep);
        }
        if (reps.size === 0) reps.add('line');

        let sel;
        if (typeof op.selection === 'string') {
          const result = resolveSelection(op.selection);
          sel = getSelSpec(result);
        } else {
          sel = op.selection || {};
        }

        // Only restyle atoms that currently have a visible style.
        // This prevents bringing back atoms hidden by hideNonpolarH.
        const matchedAtoms = v.selectedAtoms(sel);
        const visibleByModel = new Map();
        for (const a of matchedAtoms) {
          if (!a.style || Object.keys(a.style).length === 0) continue;
          const mid = a.model !== undefined ? a.model : 0;
          if (!visibleByModel.has(mid)) visibleByModel.set(mid, []);
          visibleByModel.get(mid).push(a.index);
        }

        for (const [mid, indices] of visibleByModel) {
          const model = v.getModel(mid);
          if (!model) continue;

          if (op.hets === false) {
            // Carbon atoms: apply the requested color
            const carbonIndices = [];
            const hetIndices = [];
            for (const a of matchedAtoms) {
              if (a.model !== mid) continue;
              if (!a.style || Object.keys(a.style).length === 0) continue;
              if (a.elem === 'C') carbonIndices.push(a.index);
              else hetIndices.push(a.index);
            }
            if (carbonIndices.length > 0) {
              const carbonStyle = {};
              for (const rep of reps) carbonStyle[repKey(rep)] = { color: op.color };
              model.setStyle({ index: carbonIndices }, carbonStyle);
            }
            if (hetIndices.length > 0) {
              const hetStyle = {};
              for (const rep of reps) hetStyle[repKey(rep)] = { colorscheme: 'Jmol' };
              model.setStyle({ index: hetIndices }, hetStyle);
            }
          } else {
            const styleObj = {};
            for (const rep of reps) styleObj[repKey(rep)] = { color: op.color };
            model.setStyle({ index: indices }, styleObj);
          }
        }
      }
    }
    scheduleRender();
  }

  // Configure UI visibility
  if (init.ui) {
    if (init.ui.sidebar === false) {
      app.classList.add('sidebar-hidden');
    }
    if (init.ui.terminal === false) {
      app.classList.add('terminal-hidden');
    }
    if (init.ui.menubar === false) {
      app.classList.add('menubar-hidden');
    }
  }

  // Apply theme (resolve "auto" to concrete value)
  {
    let resolvedTheme = init.theme;
    if (resolvedTheme === 'auto') {
      resolvedTheme = resolveTheme(resolvedTheme);
    }

    if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
      const state = getState();
      state.settings.theme = resolvedTheme;
      document.body.dataset.theme = resolvedTheme === 'light' ? 'light' : '';
      menubar.setTheme(resolvedTheme);
      if (!state.settings.userSetBgColor) {
        const bgColor = resolvedTheme === 'light' ? '#ffffff' : '#000000';
        state.settings.bgColor = bgColor;
        v.setBackgroundColor(bgColor);
      }
      refreshLabels();
      notifyStateChange();
    }
  }

  // Set background color
  if (init.background) {
    v.setBackgroundColor(init.background);
    const state = getState();
    state.settings.bgColor = init.background;
    state.settings.userSetBgColor = true;
    notifyStateChange();
  }

  // Apply view, orient, or zoom (wrapped in try-catch so failures don't prevent render)
  try {
    if (Array.isArray(init.view)) {
      v.setView(init.view);
    } else if (init.orient !== undefined && init.orient !== null && init.orient !== false) {
      if (init.orient === true) {
        orientView();
      } else if (typeof init.orient === 'string') {
        const result = resolveSelection(init.orient);
        const selSpec = getSelSpec(result);
        orientView(selSpec);
      } else {
        orientView(init.orient);
      }
    } else if (init.zoomTo !== undefined && init.zoomTo !== null) {
      if (typeof init.zoomTo === 'string') {
        const result = resolveSelection(init.zoomTo);
        const selSpec = getSelSpec(result);
        v.zoomTo(selSpec);
      } else {
        v.zoomTo(init.zoomTo);
      }
    } else {
      v.zoomTo();
    }
  } catch (e) {
    terminal.print(`Zoom failed: ${e.message}`, 'error');
    v.zoomTo();
  }

  scheduleRender();
  terminal.print(`Loaded ${molecules.length} molecule(s) from initialization`, 'info');
} else {
  // --- Welcome message ---
  terminal.print('3Dmol.js GUI ready. Type "help" for commands.', 'info');

  // --- Quick-start overlay ---
  dismissQuickstart = showQuickstart({
    async onTry() {
      terminal.print('> fetch 1CRN', 'command');
      try {
        await registry.execute('fetch 1CRN', ctx);
      } catch (e) {
        terminal.print(e.message, 'error');
      }
    },
    onDismiss() {},
  });
}

// --- Terminal command handler ---
terminal.onCommand(async (input) => {
  if (dismissQuickstart) {
    dismissQuickstart();
    dismissQuickstart = null;
  }
  terminal.print(`> ${input}`, 'command');
  try {
    await registry.execute(input, ctx);
  } catch (e) {
    terminal.print(e.message, 'error');
  }
});
