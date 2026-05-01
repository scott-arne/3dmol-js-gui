/**
 * Application state store for the 3Dmol.js GUI.
 *
 * Provides a simple observable state container. UI components and other modules
 * register listeners via onStateChange() and are notified whenever state is
 * mutated through the public API.
 *
 * The entryTree array describes the display order and nesting structure of all
 * objects, surfaces, maps, isosurfaces, selections, and groups in the sidebar.
 * Each node is one of:
 *
 *   { type: 'object', name }
 *   { type: 'surface', name }
 *   { type: 'map', name, collapsed, children: [...] }
 *   { type: 'isosurface', name }
 *   { type: 'selection', name }
 *   { type: 'group', name, collapsed, children: [...] }
 *   { type: 'object', name, collapsed, children: [...] }   (hierarchy parent)
 */

const state = {
  /** @type {Map<string, {model: object, modelIndex: number, visible: boolean, representations: Set<string>}>} */
  objects: new Map(),

  /** @type {Map<string, {expression: string, spec: object, atomCount: number, visible: boolean}>} name -> selection data */
  selections: new Map(),

  /** @type {Map<string, {name: string, selection: object, type: string, surfaceType: string, parentName: string|null, handle: *, pending: boolean, visible: boolean, parentVisible: boolean, mode: string, opacity: number, color: string}>} */
  surfaces: new Map(),

  /** @type {Map<string, {name: string, format: string, sourceFormat: string, volumeData: object, bounds: object, contourStats: object|null, handles: Array<*>, visible: boolean, color: string, opacity: number}>} */
  maps: new Map(),

  /** @type {Map<string, {name: string, mapName: string, level: number, selectionText: string|null, selection: object|null, buffer: number|null, carve: number|null, representation: string, handle: *, visible: boolean, parentVisible: boolean, color: string, opacity: number}>} */
  isosurfaces: new Map(),

  /** @type {Array<object>} Ordered tree of display nodes. */
  entryTree: [],

  /** @type {'atoms'|'residues'|'chains'|'molecules'} */
  selectionMode: 'atoms',

  settings: {
    bgColor: '#000000',
    theme: 'dark',
    userSetBgColor: false,
  },

  /** @type {Array<function>} */
  _listeners: [],
};

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

/**
 * Find a node in the tree by name (and optionally type). Returns
 * { node, parent, index } or null if not found.
 *
 * @param {Array} tree - The tree to search.
 * @param {string} name - The name to find.
 * @param {string} [type] - Optional type filter ('object', 'surface', 'selection', 'group').
 * @param {object} [parent] - Internal recursion param.
 * @returns {{node: object, parent: Array, index: number}|null}
 */
export function findTreeNode(tree, name, type) {
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    if (node.name === name && (!type || node.type === type)) {
      return { node, parent: tree, index: i };
    }
    if (node.children) {
      const found = findTreeNode(node.children, name, type);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Remove a node from the tree by name. Returns the removed node or null.
 *
 * @param {Array} tree - The tree to search.
 * @param {string} name - The name of the node to remove.
 * @returns {object|null} The removed node, or null if not found.
 */
export function removeTreeNode(tree, name) {
  const found = findTreeNode(tree, name);
  if (found) {
    found.parent.splice(found.index, 1);
    return found.node;
  }
  return null;
}

/**
 * Rename a node in the tree.
 *
 * @param {Array} tree - The tree to search.
 * @param {string} oldName - Current name.
 * @param {string} newName - New name.
 * @returns {boolean} True if found and renamed.
 */
export function renameTreeNode(tree, oldName, newName) {
  const found = findTreeNode(tree, oldName);
  if (found) {
    found.node.name = newName;
    return true;
  }
  return false;
}

/**
 * Collect all entry names within a subtree (recursively).
 * Returns object, selection, surface, map, and isosurface names separately.
 *
 * @param {object} node - A tree node.
 * @returns {{objects: string[], selections: string[], surfaces: string[], maps: string[], isosurfaces: string[]}}
 */
export function collectEntryNames(node) {
  const result = { objects: [], selections: [], surfaces: [], maps: [], isosurfaces: [] };
  if (node.type === 'object') {
    result.objects.push(node.name);
  } else if (node.type === 'surface') {
    result.surfaces.push(node.name);
  } else if (node.type === 'map') {
    result.maps.push(node.name);
  } else if (node.type === 'isosurface') {
    result.isosurfaces.push(node.name);
  } else if (node.type === 'selection') {
    result.selections.push(node.name);
  }
  if (node.children) {
    for (const child of node.children) {
      const sub = collectEntryNames(child);
      result.objects.push(...sub.objects);
      result.selections.push(...sub.selections);
      result.surfaces.push(...sub.surfaces);
      result.maps.push(...sub.maps);
      result.isosurfaces.push(...sub.isosurfaces);
    }
  }
  return result;
}

/**
 * Collect all leaf entry names from multiple tree nodes.
 *
 * @param {Array} nodes - Array of tree nodes.
 * @returns {{objects: string[], selections: string[], surfaces: string[], maps: string[], isosurfaces: string[]}}
 */
export function collectAllEntryNames(nodes) {
  const result = { objects: [], selections: [], surfaces: [], maps: [], isosurfaces: [] };
  for (const node of nodes) {
    const sub = collectEntryNames(node);
    result.objects.push(...sub.objects);
    result.selections.push(...sub.selections);
    result.surfaces.push(...sub.surfaces);
    result.maps.push(...sub.maps);
    result.isosurfaces.push(...sub.isosurfaces);
  }
  return result;
}

/**
 * Build a default flat tree from state entries.
 * Used when entryTree is empty (backward compatibility).
 *
 * @param {object} st - The state object.
 * @returns {Array} A flat tree array.
 */
export function buildDefaultTree(st) {
  const tree = [];
  for (const name of st.objects.keys()) {
    tree.push({ type: 'object', name });
  }
  if (st.surfaces) {
    for (const [name, surface] of st.surfaces) {
      insertSurfaceTreeNode(tree, name, surface.parentName);
    }
  }
  if (st.maps) {
    for (const name of st.maps.keys()) {
      insertMapTreeNode(tree, name);
    }
  }
  if (st.isosurfaces) {
    for (const [name, entry] of st.isosurfaces) {
      insertIsosurfaceTreeNode(tree, name, entry.mapName);
    }
  }
  for (const name of st.selections.keys()) {
    tree.push({ type: 'selection', name });
  }
  return tree;
}

/**
 * Get the display tree for rendering. Returns entryTree if it has entries,
 * otherwise builds a default flat tree from the maps.
 *
 * @param {object} st - The state object.
 * @returns {Array} The display tree.
 */
export function getDisplayTree(st) {
  if (st.entryTree && st.entryTree.length > 0) {
    return st.entryTree;
  }
  return buildDefaultTree(st);
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * Notify all registered listeners of a state change.
 */
let notifyQueued = false;

function _notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const listener of state._listeners) {
      listener(state);
    }
  });
}

/**
 * Trigger state change notification from external modules.
 */
export function notifyStateChange() {
  _notify();
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/**
 * Returns the application state object.
 *
 * @returns {object} The current state.
 */
export function getState() {
  return state;
}

// ---------------------------------------------------------------------------
// Object management
// ---------------------------------------------------------------------------

/**
 * Add a molecular object to state.objects and entryTree.
 *
 * If the given name already exists, a numeric suffix is appended to make it
 * unique (e.g. "1UBQ" -> "1UBQ_2" -> "1UBQ_3").
 *
 * @param {string} name - The desired name for the object.
 * @param {object} model - The 3Dmol model object.
 * @param {number} modelIndex - The index of the model in the viewer.
 * @returns {string} The unique name actually used.
 */
export function addObject(name, model, modelIndex) {
  let uniqueName = name;

  if (state.objects.has(uniqueName)) {
    let counter = 2;
    while (state.objects.has(`${name}_${counter}`)) {
      counter++;
    }
    uniqueName = `${name}_${counter}`;
  }

  state.objects.set(uniqueName, {
    model,
    modelIndex,
    visible: true,
    representations: new Set(['line']),
  });

  // Append to entryTree (before any selections at top level)
  const selIdx = state.entryTree.findIndex(n => n.type === 'selection');
  if (selIdx >= 0) {
    state.entryTree.splice(selIdx, 0, { type: 'object', name: uniqueName });
  } else {
    state.entryTree.push({ type: 'object', name: uniqueName });
  }

  _notify();
  return uniqueName;
}

/**
 * Remove a molecular object from state.objects and entryTree.
 *
 * @param {string} name - The name of the object to remove.
 */
export function removeObject(name) {
  const removedSurfaceNames = [];
  const removedNode = removeTreeNode(state.entryTree, name);
  if (removedNode) {
    removedSurfaceNames.push(...collectEntryNames(removedNode).surfaces);
  }
  for (const [surfaceName, surface] of state.surfaces) {
    if (surface.parentName === name && !removedSurfaceNames.includes(surfaceName)) {
      removedSurfaceNames.push(surfaceName);
    }
  }

  state.objects.delete(name);
  for (const surfaceName of removedSurfaceNames) {
    state.surfaces.delete(surfaceName);
    removeSurfaceTreeNode(surfaceName);
  }
  _notify();
  return { surfaces: removedSurfaceNames };
}

/**
 * Toggle the visibility flag on the named object.
 *
 * @param {string} name - The name of the object to toggle.
 * @returns {object|undefined} The object entry, or undefined if not found.
 */
export function toggleObjectVisibility(name) {
  const obj = state.objects.get(name);
  if (obj) {
    obj.visible = !obj.visible;
    _notify();
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Selection mode
// ---------------------------------------------------------------------------

/**
 * Set the current selection mode.
 *
 * @param {'atoms'|'residues'|'chains'|'molecules'} mode - The selection mode.
 */
export function setSelectionMode(mode) {
  state.selectionMode = mode;
  _notify();
}

// ---------------------------------------------------------------------------
// Selection management
// ---------------------------------------------------------------------------

/**
 * Add a named selection with the given expression, spec, and atom count.
 *
 * @param {string} name - The name for the selection.
 * @param {string} expression - The selection expression string.
 * @param {object} spec - The 3Dmol.js atom selection spec.
 * @param {number} atomCount - The number of atoms matched.
 */
export function addSelection(name, expression, spec, atomCount) {
  const isNew = !state.selections.has(name);
  state.selections.set(name, { expression, spec, atomCount, visible: true });

  if (isNew && !findTreeNode(state.entryTree, name, 'selection')) {
    state.entryTree.push({ type: 'selection', name });
  }

  _notify();
}

/**
 * Remove a named selection.
 *
 * @param {string} name - The name of the selection to remove.
 */
export function removeSelection(name) {
  state.selections.delete(name);
  removeTreeNode(state.entryTree, name);
  _notify();
}

/**
 * Rename a named selection.
 *
 * @param {string} oldName - The current name.
 * @param {string} newName - The new name.
 * @returns {boolean} True if the rename succeeded.
 */
export function renameSelection(oldName, newName) {
  const entry = state.selections.get(oldName);
  if (!entry) return false;
  if (state.selections.has(newName)) {
    throw new Error(`A selection named "${newName}" already exists`);
  }
  state.selections.delete(oldName);
  state.selections.set(newName, entry);
  renameTreeNode(state.entryTree, oldName, newName);
  _notify();
  return true;
}

/**
 * Rename a molecular object.
 *
 * @param {string} oldName - The current name.
 * @param {string} newName - The new name.
 * @returns {boolean} True if the rename succeeded.
 */
export function renameObject(oldName, newName) {
  const entry = state.objects.get(oldName);
  if (!entry) return false;
  if (state.objects.has(newName)) {
    throw new Error(`An object named "${newName}" already exists`);
  }
  state.objects.delete(oldName);
  state.objects.set(newName, entry);
  renameTreeNode(state.entryTree, oldName, newName);
  _notify();
  return true;
}

/**
 * Toggle the visibility flag on the named selection.
 *
 * @param {string} name - The name of the selection to toggle.
 * @returns {object|undefined} The selection entry, or undefined if not found.
 */
export function toggleSelectionVisibility(name) {
  const sel = state.selections.get(name);
  if (sel) {
    sel.visible = !sel.visible;
    _notify();
  }
  return sel;
}

// ---------------------------------------------------------------------------
// Surface management
// ---------------------------------------------------------------------------

const DEFAULT_SURFACE_ENTRY = {
  parentName: null,
  selection: {},
  type: 'molecular',
  surfaceType: 'MS',
  handle: null,
  pending: true,
  visible: true,
  parentVisible: true,
  mode: 'surface',
  opacity: 0.75,
  color: '#FFFFFF',
};

/**
 * Add or replace a surface state entry and corresponding tree node.
 *
 * @param {object} entry - Surface metadata.
 * @returns {object} The stored surface entry.
 */
export function addSurfaceEntry(entry) {
  const surface = {
    ...DEFAULT_SURFACE_ENTRY,
    ...entry,
    name: entry.name,
  };

  state.surfaces.set(surface.name, surface);

  // Re-insert to match the current parent relationship without duplicating.
  removeSurfaceTreeNode(surface.name);
  insertSurfaceTreeNode(state.entryTree, surface.name, surface.parentName);

  _notify();
  return surface;
}

/**
 * Remove a surface from state and the display tree.
 *
 * @param {string} name - The surface name.
 * @returns {object|undefined} The removed surface entry.
 */
export function removeSurfaceEntry(name) {
  const surface = state.surfaces.get(name);
  if (!surface) return undefined;
  state.surfaces.delete(name);
  removeSurfaceTreeNode(name);
  _notify();
  return surface;
}

/**
 * Rename a surface state entry and matching tree node.
 *
 * @param {string} oldName - The current surface name.
 * @param {string} newName - The new surface name.
 * @returns {boolean} True if renamed.
 */
export function renameSurfaceEntry(oldName, newName) {
  const surface = state.surfaces.get(oldName);
  if (!surface) return false;
  if (state.surfaces.has(newName)) {
    throw new Error(`A surface named "${newName}" already exists`);
  }
  state.surfaces.delete(oldName);
  surface.name = newName;
  state.surfaces.set(newName, surface);
  renameSurfaceTreeNode(oldName, newName);
  _notify();
  return true;
}

/**
 * Update a surface entry with a metadata patch.
 *
 * @param {string} name - The surface name.
 * @param {object} patch - Partial surface metadata.
 * @returns {object|undefined} The updated surface entry.
 */
export function updateSurfaceEntry(name, patch) {
  const surface = state.surfaces.get(name);
  if (!surface) return undefined;
  const parentNameChanged = Object.prototype.hasOwnProperty.call(patch, 'parentName') &&
    patch.parentName !== surface.parentName;

  if (parentNameChanged) {
    removeSurfaceTreeNode(name);
  }

  Object.assign(surface, patch);

  if (parentNameChanged) {
    insertSurfaceTreeNode(state.entryTree, name, surface.parentName);
  }

  _notify();
  return surface;
}

/**
 * Store the resolved 3Dmol surface handle and clear pending state.
 *
 * @param {string} name - The surface name.
 * @param {*} handle - The 3Dmol surface handle.
 * @returns {object|undefined} The updated surface entry.
 */
export function setSurfaceHandle(name, handle) {
  return updateSurfaceEntry(name, { handle, pending: false });
}

/**
 * Toggle the visibility flag on a surface.
 *
 * @param {string} name - The surface name.
 * @returns {object|undefined} The updated surface entry.
 */
export function toggleSurfaceVisibility(name) {
  const surface = state.surfaces.get(name);
  if (surface) {
    surface.visible = !surface.visible;
    _notify();
  }
  return surface;
}

/**
 * Get the lowest available generated surface name for a prefix.
 *
 * @param {string} [prefix='surface'] - Name prefix.
 * @returns {string} The next available surface name.
 */
export function getNextSurfaceName(prefix = 'surface') {
  let counter = 1;
  while (state.surfaces.has(`${prefix}_${counter}`)) {
    counter++;
  }
  return `${prefix}_${counter}`;
}

/**
 * Return surface names parented under a molecule.
 *
 * @param {string} parentName - Parent object name.
 * @returns {string[]} Child surface names.
 */
export function getChildSurfaceNames(parentName) {
  const names = [];
  for (const [name, surface] of state.surfaces) {
    if (surface.parentName === parentName) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Insert a surface node under its parent object or before top-level selections.
 *
 * @param {Array} tree - Tree to mutate.
 * @param {string} name - Surface name.
 * @param {string|null} parentName - Optional parent object name.
 */
function insertSurfaceTreeNode(tree, name, parentName) {
  const node = { type: 'surface', name };

  if (parentName) {
    const parentFound = findTreeNode(tree, parentName, 'object');
    if (parentFound) {
      if (!parentFound.node.children) {
        parentFound.node.children = [];
        parentFound.node.collapsed = false;
      }
      parentFound.node.children.push(node);
      return;
    }
  }

  const selIdx = tree.findIndex(n => n.type === 'selection');
  if (selIdx >= 0) {
    tree.splice(selIdx, 0, node);
  } else {
    tree.push(node);
  }
}

/**
 * Remove a surface node from the tree and clean up an empty hierarchy parent.
 *
 * @param {string} name - Surface name.
 * @returns {object|null} The removed tree node, or null if not found.
 */
function removeSurfaceTreeNode(name) {
  const parentNode = _findParentNode(state.entryTree, name);
  const removed = removeTypedTreeNode(state.entryTree, name, 'surface');
  if (removed && parentNode && parentNode.type === 'object') {
    normalizeHierarchyParent(parentNode);
  }
  return removed;
}

/**
 * Rename only a surface node in the tree.
 *
 * @param {string} oldName - Current surface name.
 * @param {string} newName - New surface name.
 * @returns {boolean} True if found and renamed.
 */
function renameSurfaceTreeNode(oldName, newName) {
  const found = findTreeNode(state.entryTree, oldName, 'surface');
  if (found) {
    found.node.name = newName;
    return true;
  }
  return false;
}

/**
 * Remove a tree node by both name and type.
 *
 * @param {Array} tree - The tree to search.
 * @param {string} name - The node name.
 * @param {string} type - The node type.
 * @returns {object|null} The removed node, or null if not found.
 */
function removeTypedTreeNode(tree, name, type) {
  const found = findTreeNode(tree, name, type);
  if (found) {
    found.parent.splice(found.index, 1);
    return found.node;
  }
  return null;
}

/**
 * Remove hierarchy-only fields from an object node with no remaining children.
 *
 * @param {object} node - Object tree node.
 */
function normalizeHierarchyParent(node) {
  if (node.children && node.children.length === 0) {
    delete node.children;
    delete node.collapsed;
  }
}

// ---------------------------------------------------------------------------
// Map and isosurface management
// ---------------------------------------------------------------------------

const DEFAULT_MAP_ENTRY = {
  contourStats: null,
  handles: [],
  visible: true,
  showBoundingBox: false,
  color: '#38BDF8',
  opacity: 1,
};

const DEFAULT_ISOSURFACE_ENTRY = {
  level: 1,
  selectionText: null,
  selection: null,
  buffer: null,
  carve: null,
  representation: 'mesh',
  handle: null,
  visible: true,
  parentVisible: true,
  color: '#0000FF',
  opacity: 0.75,
};

/**
 * Find a unique map name using the same numeric suffix convention as objects.
 *
 * @param {string} baseName - Desired map name.
 * @returns {string} Unique map name.
 */
function getUniqueMapName(baseName) {
  let uniqueName = baseName;
  let counter = 2;
  while (state.maps.has(uniqueName)) {
    uniqueName = `${baseName}_${counter}`;
    counter++;
  }
  return uniqueName;
}

/**
 * Add a density map entry and corresponding tree node.
 *
 * @param {object} entry - Map metadata.
 * @returns {object} The stored map entry.
 */
export function addMapEntry(entry) {
  const name = getUniqueMapName(entry.name);
  const map = {
    ...DEFAULT_MAP_ENTRY,
    ...entry,
    name,
    handles: entry.handles ? [...entry.handles] : [],
  };
  state.maps.set(name, map);
  removeTypedTreeNode(state.entryTree, name, 'map');
  insertMapTreeNode(state.entryTree, name);
  _notify();
  return map;
}

/**
 * Remove a map and all isosurfaces parented to it.
 *
 * @param {string} name - Map name.
 * @returns {{map: object, isosurfaces: object[]}|undefined} Removed entries.
 */
export function removeMapEntry(name) {
  const map = state.maps.get(name);
  if (!map) return undefined;
  const childNames = getChildIsosurfaceNames(name);
  const isosurfaces = [];
  for (const isoName of childNames) {
    const iso = state.isosurfaces.get(isoName);
    if (iso) {
      isosurfaces.push(iso);
      state.isosurfaces.delete(isoName);
      removeTypedTreeNode(state.entryTree, isoName, 'isosurface');
    }
  }
  state.maps.delete(name);
  removeTypedTreeNode(state.entryTree, name, 'map');
  _notify();
  return { map, isosurfaces };
}

/**
 * Rename a map entry and update child isosurface parent names.
 *
 * @param {string} oldName - Current map name.
 * @param {string} newName - New map name.
 * @returns {boolean} True if renamed.
 */
export function renameMapEntry(oldName, newName) {
  const map = state.maps.get(oldName);
  if (!map) return false;
  if (state.maps.has(newName)) {
    throw new Error(`A map named "${newName}" already exists`);
  }
  state.maps.delete(oldName);
  map.name = newName;
  state.maps.set(newName, map);
  const found = findTreeNode(state.entryTree, oldName, 'map');
  if (found) found.node.name = newName;
  for (const iso of state.isosurfaces.values()) {
    if (iso.mapName === oldName) iso.mapName = newName;
  }
  _notify();
  return true;
}

/**
 * Update map metadata.
 *
 * @param {string} name - Map name.
 * @param {object} patch - Partial map metadata.
 * @returns {object|undefined} The updated map entry.
 */
export function updateMapEntry(name, patch) {
  const map = state.maps.get(name);
  if (!map) return undefined;
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    throw new Error('Use renameMapEntry to rename maps');
  }
  Object.assign(map, patch);
  _notify();
  return map;
}

/**
 * Toggle map visibility.
 *
 * @param {string} name - Map name.
 * @returns {object|undefined} The updated map entry.
 */
export function toggleMapVisibility(name) {
  const map = state.maps.get(name);
  if (map) {
    map.visible = !map.visible;
    _notify();
  }
  return map;
}

/**
 * Add or replace an isosurface entry under an existing map.
 *
 * @param {object} entry - Isosurface metadata.
 * @returns {object} The stored isosurface entry.
 */
export function addIsosurfaceEntry(entry) {
  if (!state.maps.has(entry.mapName)) {
    throw new Error(`Map "${entry.mapName}" not found`);
  }
  const iso = { ...DEFAULT_ISOSURFACE_ENTRY, ...entry, name: entry.name };
  state.isosurfaces.set(iso.name, iso);
  removeTypedTreeNode(state.entryTree, iso.name, 'isosurface');
  insertIsosurfaceTreeNode(state.entryTree, iso.name, iso.mapName);
  _notify();
  return iso;
}

/**
 * Remove an isosurface entry and tree node.
 *
 * @param {string} name - Isosurface name.
 * @returns {object|undefined} The removed isosurface entry.
 */
export function removeIsosurfaceEntry(name) {
  const iso = state.isosurfaces.get(name);
  if (!iso) return undefined;
  state.isosurfaces.delete(name);
  removeIsosurfaceTreeNode(name);
  _notify();
  return iso;
}

/**
 * Rename an isosurface entry and tree node.
 *
 * @param {string} oldName - Current isosurface name.
 * @param {string} newName - New isosurface name.
 * @returns {boolean} True if renamed.
 */
export function renameIsosurfaceEntry(oldName, newName) {
  const iso = state.isosurfaces.get(oldName);
  if (!iso) return false;
  if (state.isosurfaces.has(newName)) {
    throw new Error(`An isosurface named "${newName}" already exists`);
  }
  state.isosurfaces.delete(oldName);
  iso.name = newName;
  state.isosurfaces.set(newName, iso);
  const found = findTreeNode(state.entryTree, oldName, 'isosurface');
  if (found) found.node.name = newName;
  _notify();
  return true;
}

/**
 * Update isosurface metadata and reparent when mapName changes.
 *
 * @param {string} name - Isosurface name.
 * @param {object} patch - Partial isosurface metadata.
 * @returns {object|undefined} The updated isosurface entry.
 */
export function updateIsosurfaceEntry(name, patch) {
  const iso = state.isosurfaces.get(name);
  if (!iso) return undefined;
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    throw new Error('Use renameIsosurfaceEntry to rename isosurfaces');
  }
  const mapNameChanged = Object.prototype.hasOwnProperty.call(patch, 'mapName') &&
    patch.mapName !== iso.mapName;
  if (mapNameChanged && !state.maps.has(patch.mapName)) {
    throw new Error(`Map "${patch.mapName}" not found`);
  }
  if (mapNameChanged) {
    removeIsosurfaceTreeNode(name);
  }
  Object.assign(iso, patch);
  if (mapNameChanged) {
    insertIsosurfaceTreeNode(state.entryTree, name, iso.mapName);
  }
  _notify();
  return iso;
}

/**
 * Toggle isosurface visibility.
 *
 * @param {string} name - Isosurface name.
 * @returns {object|undefined} The updated isosurface entry.
 */
export function toggleIsosurfaceVisibility(name) {
  const iso = state.isosurfaces.get(name);
  if (iso) {
    iso.visible = !iso.visible;
    _notify();
  }
  return iso;
}

/**
 * Return isosurface names parented under a map.
 *
 * @param {string} mapName - Parent map name.
 * @returns {string[]} Child isosurface names.
 */
export function getChildIsosurfaceNames(mapName) {
  const names = [];
  for (const [name, iso] of state.isosurfaces) {
    if (iso.mapName === mapName) names.push(name);
  }
  return names;
}

/**
 * Get the lowest available generated isosurface name for a prefix.
 *
 * @param {string} [prefix='isosurface'] - Name prefix.
 * @returns {string} The next available isosurface name.
 */
export function getNextIsosurfaceName(prefix = 'isosurface') {
  let counter = 1;
  while (state.isosurfaces.has(`${prefix}_${counter}`)) {
    counter++;
  }
  return `${prefix}_${counter}`;
}

/**
 * Insert a map node before top-level selections.
 *
 * @param {Array} tree - Tree to mutate.
 * @param {string} name - Map name.
 */
function insertMapTreeNode(tree, name) {
  if (findTreeNode(tree, name, 'map')) return;
  const node = { type: 'map', name, collapsed: false, children: [] };
  const selIdx = tree.findIndex(n => n.type === 'selection');
  if (selIdx >= 0) {
    tree.splice(selIdx, 0, node);
  } else {
    tree.push(node);
  }
}

/**
 * Insert an isosurface node under an existing map node.
 *
 * @param {Array} tree - Tree to mutate.
 * @param {string} name - Isosurface name.
 * @param {string} mapName - Parent map name.
 */
function insertIsosurfaceTreeNode(tree, name, mapName) {
  const node = { type: 'isosurface', name };
  const parentFound = findTreeNode(tree, mapName, 'map');
  if (parentFound) {
    if (!parentFound.node.children) {
      parentFound.node.children = [];
      parentFound.node.collapsed = false;
    }
    parentFound.node.children.push(node);
  }
}

/**
 * Remove an isosurface node from the tree while preserving empty map parents.
 *
 * @param {string} name - Isosurface name.
 * @returns {object|null} The removed tree node, or null if not found.
 */
function removeIsosurfaceTreeNode(name) {
  const parentNode = _findParentNode(state.entryTree, name);
  const removed = removeTypedTreeNode(state.entryTree, name, 'isosurface');
  if (removed && parentNode && parentNode.type === 'map' && parentNode.children?.length === 0) {
    parentNode.children = [];
    parentNode.collapsed = false;
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Selection pruning
// ---------------------------------------------------------------------------

/**
 * Remove the given atom indices from all stored selections.
 * Deletes any selection whose atom count drops to zero.
 *
 * @param {Array<number>} removedIndices - Atom indices that were removed.
 */
export function pruneSelections(removedIndices) {
  const removed = new Set(removedIndices);
  let changed = false;
  const toDelete = [];

  for (const [name, sel] of state.selections) {
    if (sel.spec && Array.isArray(sel.spec.index)) {
      const filtered = sel.spec.index.filter(i => !removed.has(i));
      if (filtered.length !== sel.spec.index.length) {
        changed = true;
        if (filtered.length === 0) {
          toDelete.push(name);
        } else {
          sel.spec = { index: filtered };
          sel.atomCount = filtered.length;
        }
      }
    }
  }

  for (const name of toDelete) {
    state.selections.delete(name);
    removeTreeNode(state.entryTree, name);
  }

  if (changed) _notify();
}

// ---------------------------------------------------------------------------
// Group management
// ---------------------------------------------------------------------------

/**
 * Create a named group containing the specified entries.
 * Entries are moved from their current position in the tree into the group.
 * The group is inserted at the position of the first moved entry.
 *
 * @param {string} name - The group name.
 * @param {string[]} memberNames - Names of entries to include.
 * @returns {boolean} True if the group was created.
 */
export function addGroup(name, memberNames) {
  if (findTreeNode(state.entryTree, name)) {
    throw new Error(`"${name}" already exists`);
  }
  if (memberNames.length === 0) {
    throw new Error('Group must contain at least one entry');
  }

  // Validate all members exist
  for (const m of memberNames) {
    if (!findTreeNode(state.entryTree, m)) {
      throw new Error(`Entry "${m}" not found`);
    }
  }

  // Find insertion point (position of first member)
  let insertIdx = -1;
  let insertParent = state.entryTree;
  const firstFound = findTreeNode(state.entryTree, memberNames[0]);
  if (firstFound) {
    insertIdx = firstFound.index;
    insertParent = firstFound.parent;
  }

  // Remove members from tree
  const children = [];
  for (const m of memberNames) {
    const node = removeTreeNode(state.entryTree, m);
    if (node) children.push(node);
  }

  // Recompute insert index (may have shifted after removals)
  if (insertIdx > insertParent.length) {
    insertIdx = insertParent.length;
  }

  const groupNode = { type: 'group', name, collapsed: false, children };
  insertParent.splice(insertIdx, 0, groupNode);

  _notify();
  return true;
}

/**
 * Remove a group and all its contents from state.
 * Also removes all contained entries from their state maps.
 *
 * @param {string} name - The group name to remove.
 * @returns {{objects: string[], selections: string[], surfaces: string[], maps: string[], isosurfaces: string[]}} Names of removed entries.
 */
export function removeGroup(name) {
  const found = findTreeNode(state.entryTree, name, 'group');
  if (!found) {
    throw new Error(`Group "${name}" not found`);
  }

  const entries = collectEntryNames(found.node);

  // Remove from maps
  for (const objName of entries.objects) {
    state.objects.delete(objName);
  }
  for (const selName of entries.selections) {
    state.selections.delete(selName);
  }
  for (const surfaceName of entries.surfaces) {
    state.surfaces.delete(surfaceName);
  }
  for (const mapName of entries.maps) {
    state.maps.delete(mapName);
  }
  for (const isoName of entries.isosurfaces) {
    state.isosurfaces.delete(isoName);
  }

  // Remove group node from tree
  found.parent.splice(found.index, 1);

  _notify();
  return entries;
}

/**
 * Dissolve a group: move its children to the group's parent level and
 * remove the group node. The contained entries are NOT deleted.
 *
 * @param {string} name - The group name to ungroup.
 * @returns {boolean} True if ungrouped successfully.
 */
export function ungroupGroup(name) {
  const found = findTreeNode(state.entryTree, name, 'group');
  if (!found) {
    throw new Error(`Group "${name}" not found`);
  }

  const children = found.node.children || [];
  // Insert children at the group's position, then remove the group
  found.parent.splice(found.index, 1, ...children);

  _notify();
  return true;
}

/**
 * Rename a group in the tree.
 *
 * @param {string} oldName - Current group name.
 * @param {string} newName - New group name.
 * @returns {boolean} True if renamed.
 */
export function renameGroup(oldName, newName) {
  if (findTreeNode(state.entryTree, newName)) {
    throw new Error(`"${newName}" already exists`);
  }
  const found = findTreeNode(state.entryTree, oldName, 'group');
  if (!found) return false;
  found.node.name = newName;
  _notify();
  return true;
}

/**
 * Toggle the collapsed state of a group or hierarchy parent.
 *
 * @param {string} name - The name of the group or hierarchy parent.
 * @returns {boolean|undefined} The new collapsed state, or undefined if not found.
 */
export function toggleCollapsed(name) {
  const found = findTreeNode(state.entryTree, name);
  if (!found || !found.node.children) return undefined;
  found.node.collapsed = !found.node.collapsed;
  _notify();
  return found.node.collapsed;
}

// ---------------------------------------------------------------------------
// Hierarchy management
// ---------------------------------------------------------------------------

/**
 * Move an entry to become a child of a parent object (hierarchy).
 * Creates a children array on the parent if it doesn't have one.
 *
 * @param {string} childName - Name of the entry to reparent.
 * @param {string} parentName - Name of the parent object.
 * @returns {boolean} True if reparented successfully.
 */
export function reparentEntry(childName, parentName) {
  if (childName === parentName) {
    throw new Error('Cannot reparent an entry to itself');
  }

  const parentFound = findTreeNode(state.entryTree, parentName, 'object');
  if (!parentFound) {
    throw new Error(`Parent object "${parentName}" not found`);
  }

  // Ensure child isn't an ancestor of parent (prevent cycles)
  const childFound = findTreeNode(state.entryTree, childName);
  if (!childFound) {
    throw new Error(`Entry "${childName}" not found`);
  }
  if (childFound.node.type === 'map' || childFound.node.type === 'isosurface') {
    throw new Error('Density maps and isosurfaces cannot be reparented under objects');
  }
  if (childFound.node.children) {
    const descendant = findTreeNode(childFound.node.children, parentName);
    if (descendant) {
      throw new Error('Cannot reparent: would create a cycle');
    }
  }

  // Remove child from current position
  const childNode = removeTreeNode(state.entryTree, childName);
  if (!childNode) {
    throw new Error(`Entry "${childName}" not found`);
  }

  // Add to parent's children
  if (!parentFound.node.children) {
    parentFound.node.children = [];
    parentFound.node.collapsed = false;
  }
  parentFound.node.children.push(childNode);

  _notify();
  return true;
}

/**
 * Remove an entry from its parent hierarchy and move it to the top level
 * (next to the former parent).
 *
 * @param {string} childName - Name of the entry to unparent.
 * @returns {boolean} True if unparented successfully.
 */
export function unparentEntry(childName) {
  // Find the child and its containing parent
  const found = findTreeNode(state.entryTree, childName);
  if (!found) {
    throw new Error(`Entry "${childName}" not found`);
  }

  // Check if the child is actually inside a parent's children
  // (not at top level of entryTree or a group's children)
  // We need to find the actual parent node
  const parentNode = _findParentNode(state.entryTree, childName);
  if (!parentNode || parentNode.type !== 'object') {
    throw new Error(`"${childName}" is not a hierarchy child`);
  }

  // Remove from parent's children
  const childNode = removeTreeNode(parentNode.children, childName);
  if (!childNode) return false;

  // If parent's children are now empty, remove the children array
  if (parentNode.children.length === 0) {
    normalizeHierarchyParent(parentNode);
  }

  // Insert next to the parent in the tree
  const parentFound = findTreeNode(state.entryTree, parentNode.name);
  if (parentFound) {
    parentFound.parent.splice(parentFound.index + 1, 0, childNode);
  } else {
    state.entryTree.push(childNode);
  }

  _notify();
  return true;
}

/**
 * Find the immediate parent node of a named entry.
 *
 * @param {Array} tree - The tree to search.
 * @param {string} name - The name to find.
 * @returns {object|null} The parent node, or null if at top level.
 */
function _findParentNode(tree, name) {
  for (const node of tree) {
    if (node.children) {
      for (const child of node.children) {
        if (child.name === name) return node;
      }
      const deeper = _findParentNode(node.children, name);
      if (deeper) return deeper;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Listener management
// ---------------------------------------------------------------------------

/**
 * Register a callback that is invoked whenever state changes.
 *
 * @param {function} listener - A function that receives the current state.
 */
export function onStateChange(listener) {
  state._listeners.push(listener);
}
