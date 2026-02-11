/**
 * 3Dmol.js viewer wrapper for the PyMOL-like GUI.
 *
 * Provides a thin abstraction over the $3Dmol global, handling viewer
 * initialization, model loading (both from RCSB and raw data), model removal,
 * and atom selection queries. All other modules should interact with the
 * 3Dmol.js viewer exclusively through this wrapper.
 */

/* global $3Dmol */

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

/** @type {object|null} The atom currently under the mouse cursor. */
let hoveredAtom = null;

/**
 * Re-register the stored click callback and hover tracking on all atoms.
 * Called internally after addModel to ensure new atoms are clickable/hoverable.
 */
function registerClickable() {
  if (clickCallback && viewer) {
    viewer.setClickable({}, true, function (atom, viewerInstance, event) {
      clickCallback(atom, viewerInstance, event);
    });
    viewer.setHoverable(
      {},
      true,
      function (atom) { hoveredAtom = atom; },
      function () { hoveredAtom = null; }
    );
  }
}

/**
 * Return the atom currently under the mouse cursor, or null.
 *
 * @returns {object|null} The hovered atom, or null if none.
 */
export function getHoveredAtom() {
  return hoveredAtom;
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
