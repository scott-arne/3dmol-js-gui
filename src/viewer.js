/**
 * 3Dmol.js viewer wrapper for the PyMOL-like GUI.
 *
 * Provides a thin abstraction over the $3Dmol global, handling viewer
 * initialization, model loading (both from RCSB and raw data), model removal,
 * and atom selection queries. All other modules should interact with the
 * 3Dmol.js viewer exclusively through this wrapper.
 */

/* global $3Dmol */

/**
 * Default style options for each representation type.
 * Representations not listed here use an empty options object.
 *
 * Note: 'line' is rendered as thin sticks because WebGL's gl.lineWidth() is
 * capped at 1px on virtually all modern browsers, making the native line
 * representation invisible. The 3Dmol.js docs mark linewidth as "deprecated
 * due to vanishing browser support."
 */
const REP_DEFAULTS = {
  line: { _useStick: true, radius: 0.05, singleBonds: true },
};

/**
 * Build a style spec for a representation with its default options applied.
 *
 * @param {string} rep - The canonical representation name (e.g. 'line', 'cartoon').
 * @returns {object} A style spec like `{ cartoon: {} }` or `{ stick: { radius: 0.05 } }`.
 */
export function repStyle(rep) {
  const defaults = REP_DEFAULTS[rep];
  if (defaults && defaults._useStick) {
    const { _useStick, ...opts } = defaults;
    return { stick: opts };
  }
  return { [rep]: defaults || {} };
}

/** @type {Array<{text: string, position: {x: number, y: number, z: number}}>} */
let trackedLabels = [];

/**
 * Return a label style spec appropriate for the current viewer background.
 *
 * Uses the body data-theme attribute to determine contrast: light theme gets
 * bold black text, dark theme gets bold white text. No background is drawn.
 *
 * @returns {object} A 3Dmol label style spec.
 */
export function labelStyle() {
  const isLight = document.body.dataset.theme === 'light';
  return {
    backgroundOpacity: 0,
    borderThickness: 0,
    fontColor: isLight ? '#000000' : '#FFFFFF',
    fontSize: 12,
    bold: true,
  };
}

/**
 * Add a tracked label to the viewer.
 *
 * Wraps viewer.addLabel so that labels can be rebuilt on theme change.
 *
 * @param {string} text - The label text.
 * @param {{x: number, y: number, z: number}} position - The label position.
 */
export function addTrackedLabel(text, position) {
  trackedLabels.push({ text, position });
  viewer.addLabel(text, { position, ...labelStyle() });
}

/**
 * Remove all labels and clear the tracked list.
 */
export function clearAllLabels() {
  viewer.removeAllLabels();
  trackedLabels = [];
}

/**
 * Rebuild all tracked labels with the current label style.
 *
 * Called after a theme change to update label colors.
 */
export function refreshLabels() {
  if (trackedLabels.length === 0) return;
  viewer.removeAllLabels();
  const style = labelStyle();
  for (const lbl of trackedLabels) {
    viewer.addLabel(lbl.text, { position: lbl.position, ...style });
  }
  viewer.render();
}

/** @type {object|null} The 3Dmol GLViewer instance. */
let viewer = null;

/** @type {HTMLDivElement|null} The viewer canvas container element. */
let viewerElement = null;

/**
 * Initialize the 3Dmol.js viewer inside the given container element.
 *
 * Creates a child div with id "viewer-canvas" that fills the container,
 * instantiates a $3Dmol viewer with a black background and antialiasing,
 * and attaches a ResizeObserver so the viewer automatically resizes when
 * the container dimensions change.
 *
 * @param {HTMLElement} container - The DOM element to host the viewer.
 * @returns {object} The 3Dmol GLViewer instance.
 */
export function initViewer(container) {
  viewerElement = document.createElement('div');
  viewerElement.id = 'viewer-canvas';
  viewerElement.style.width = '100%';
  viewerElement.style.height = '100%';
  container.appendChild(viewerElement);

  viewer = $3Dmol.createViewer(viewerElement, {
    backgroundColor: '#000000',
    antialias: true,
  });

  const resizeObserver = new ResizeObserver(() => {
    viewer.resize();
    viewer.render();
  });
  resizeObserver.observe(container);

  return viewer;
}

/**
 * Return the current viewer instance.
 *
 * @returns {object|null} The 3Dmol GLViewer, or null if not yet initialized.
 */
export function getViewer() {
  return viewer;
}

/**
 * Return the viewer DOM element (the div#viewer-canvas).
 *
 * @returns {HTMLDivElement|null} The viewer element, or null if not yet initialized.
 */
export function getViewerElement() {
  return viewerElement;
}

/**
 * Fetch a PDB file from RCSB and load it into the viewer.
 *
 * Uses the native fetch() API to download the structure, adds the model
 * with PDB format, applies a default cartoon representation, then zooms
 * and renders.
 *
 * @param {string} pdbId - The 4-character PDB identifier (e.g. "1UBQ").
 * @returns {Promise<object>} The 3Dmol model that was added.
 * @throws {Error} If the fetch request fails or returns a non-OK status.
 */
export async function fetchPDB(pdbId) {
  const url = `https://files.rcsb.org/download/${pdbId}.pdb`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch PDB "${pdbId}": ${response.status} ${response.statusText}`
    );
  }

  const data = await response.text();
  const model = viewer.addModel(data, 'pdb');
  viewer.setStyle({ model: model }, { cartoon: {} });
  viewer.zoomTo();
  registerClickable();
  viewer.render();

  return model;
}

/**
 * Load molecular data directly into the viewer from a string.
 *
 * Adds the model, applies a default cartoon style, zooms to fit, and
 * renders the scene.
 *
 * @param {string} data - The molecular data as a string.
 * @param {string} format - The format of the data (e.g. "pdb", "sdf", "mol2").
 * @returns {object} The 3Dmol model that was added.
 */
export function loadModelData(data, format) {
  const model = viewer.addModel(data, format);
  viewer.setStyle({ model: model }, { cartoon: {} });
  viewer.zoomTo();
  registerClickable();
  viewer.render();

  return model;
}

/**
 * Remove a model from the viewer and re-render.
 *
 * @param {object} model - The 3Dmol model instance to remove.
 */
export function removeModel(model) {
  viewer.removeModel(model);
  viewer.render();
}

/**
 * Query the viewer for atoms matching a selection specification.
 *
 * @param {object} [selSpec] - A 3Dmol atom selection spec. Defaults to {}
 *   (all atoms) when omitted or falsy.
 * @returns {Array<object>} An array of atom objects matching the selection.
 */
export function getAllAtoms(selSpec) {
  return viewer.selectedAtoms(selSpec || {});
}

/** @type {Array<object>} Shape objects for the current highlight overlay. */
let highlightShapes = [];

/** @type {function|null} Stored click callback for re-registration after model loads. */
let clickCallback = null;

/**
 * Re-register the stored click callback on all atoms.
 * Called internally after addModel to ensure new atoms are clickable.
 */
function registerClickable() {
  if (clickCallback && viewer) {
    viewer.setClickable({}, true, function (atom, viewerInstance, event) {
      clickCallback(atom, viewerInstance, event);
    });
  }
}

/**
 * Register a click handler on all atoms in the viewer.
 * The callback is stored and automatically re-registered when new models
 * are added via fetchPDB or loadModelData.
 *
 * @param {function} callback - Called with (atom, viewer) when an atom is clicked.
 */
export function setupClickHandler(callback) {
  clickCallback = callback;
  registerClickable();
  viewer.render();
}

/**
 * Clear the current visual selection highlight.
 *
 * Removes the sphere shapes that were added as the highlight overlay.
 * Does not modify atom styles, so per-atom representations (e.g. from
 * "show sticks, sele") are preserved.
 */
export function clearHighlight() {
  if (highlightShapes.length === 0) return;
  for (const shape of highlightShapes) {
    viewer.removeShape(shape);
  }
  highlightShapes = [];
  viewer.render();
}

/**
 * Apply a translucent yellow sphere highlight to atoms matching a selection.
 *
 * Uses 3Dmol shape objects (not atom styles) so the highlight can be removed
 * without affecting any atom representations.
 *
 * @param {object} selSpec - The 3Dmol selection spec to highlight.
 */
export function applyHighlight(selSpec) {
  const atoms = viewer.selectedAtoms(selSpec);
  for (const atom of atoms) {
    const shape = viewer.addSphere({
      center: { x: atom.x, y: atom.y, z: atom.z },
      radius: 0.5,
      color: '#FFFF00',
      alpha: 0.5,
    });
    highlightShapes.push(shape);
  }
  viewer.render();
}
