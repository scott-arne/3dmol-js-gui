/**
 * Application state store for the 3Dmol.js GUI.
 *
 * Provides a simple observable state container. UI components and other modules
 * register listeners via onStateChange() and are notified whenever state is
 * mutated through the public API.
 */

const state = {
  /** @type {Map<string, {model: object, modelIndex: number, visible: boolean, representations: Set<string>}>} */
  objects: new Map(),

  /** @type {Map<string, {expression: string, spec: object, atomCount: number, visible: boolean}>} name -> selection data */
  selections: new Map(),

  /** @type {'atoms'|'residues'|'chains'|'molecules'} */
  selectionMode: 'atoms',

  /** @type {object|null} The current visual selection spec from clicking in the viewer. */
  activeSelection: null,

  settings: {
    bgColor: '#000000',
  },

  /** @type {Array<function>} */
  _listeners: [],
};

/**
 * Notify all registered listeners of a state change.
 */
function _notify() {
  for (const listener of state._listeners) {
    listener(state);
  }
}

/**
 * Trigger state change notification from external modules.
 */
export function notifyStateChange() {
  _notify();
}

/**
 * Returns the application state object.
 *
 * @returns {object} The current state.
 */
export function getState() {
  return state;
}

/**
 * Add a molecular object to state.objects.
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
    representations: new Set(['cartoon']),
  });

  _notify();
  return uniqueName;
}

/**
 * Remove a molecular object from state.objects.
 *
 * @param {string} name - The name of the object to remove.
 */
export function removeObject(name) {
  state.objects.delete(name);
  _notify();
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

/**
 * Set the current selection mode.
 *
 * @param {'atoms'|'residues'|'chains'|'molecules'} mode - The selection mode.
 */
export function setSelectionMode(mode) {
  state.selectionMode = mode;
  _notify();
}

/**
 * Add a named selection with the given expression, spec, and atom count.
 *
 * @param {string} name - The name for the selection.
 * @param {string} expression - The selection expression string.
 * @param {object} spec - The 3Dmol.js atom selection spec.
 * @param {number} atomCount - The number of atoms matched.
 */
export function addSelection(name, expression, spec, atomCount) {
  state.selections.set(name, { expression, spec, atomCount, visible: true });
  _notify();
}

/**
 * Remove a named selection.
 *
 * @param {string} name - The name of the selection to remove.
 */
export function removeSelection(name) {
  state.selections.delete(name);
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
  state.selections.delete(oldName);
  state.selections.set(newName, entry);
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
  state.objects.delete(oldName);
  state.objects.set(newName, entry);
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

/**
 * Remove the given atom indices from all stored selections and activeSelection.
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
  }

  if (state.activeSelection && Array.isArray(state.activeSelection.index)) {
    const filtered = state.activeSelection.index.filter(i => !removed.has(i));
    if (filtered.length === 0) {
      state.activeSelection = null;
      changed = true;
    } else if (filtered.length !== state.activeSelection.index.length) {
      state.activeSelection = { index: filtered };
      changed = true;
    }
  }

  if (changed) _notify();
}

/**
 * Set the active visual selection from a viewer click.
 *
 * @param {object|null} selSpec - The 3Dmol selection spec, or null to clear.
 */
export function setActiveSelection(selSpec) {
  state.activeSelection = selSpec;
  _notify();
}

/**
 * Register a callback that is invoked whenever state changes.
 *
 * @param {function} listener - A function that receives the current state.
 */
export function onStateChange(listener) {
  state._listeners.push(listener);
}
