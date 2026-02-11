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

  /** @type {Map<string, string>} name -> selection expression */
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
 * Add a named selection with the given expression.
 *
 * @param {string} name - The name for the selection.
 * @param {string} expression - The selection expression string.
 */
export function addSelection(name, expression) {
  state.selections.set(name, expression);
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
