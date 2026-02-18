/**
 * 3Dmol.js viewer wrapper for the GUI.
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
  line: { _useStick: true, radius: 0.05, doubleBondScaling: 1.5, tripleBondScaling: 1.0 },
  stick: { radius: 0.25 },
};

/** Atom count threshold above which highlights use addStyle instead of per-atom spheres. */
const HIGHLIGHT_THRESHOLD = 500;

/**
 * Return the 3Dmol.js style key for a representation name.
 *
 * Representations that use `_useStick` in REP_DEFAULTS map to 'stick';
 * all others use their own name as the key.
 *
 * @param {string} rep - The canonical representation name (e.g. 'line', 'cartoon').
 * @returns {string} The 3Dmol.js style key (e.g. 'stick', 'cartoon').
 */
export function repKey(rep) {
  const defaults = REP_DEFAULTS[rep];
  return (defaults && defaults._useStick) ? 'stick' : rep;
}

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

  let resizeRAF = null;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeRAF) return;
    resizeRAF = requestAnimationFrame(() => {
      viewer.resize();
      viewer.render();
      resizeRAF = null;
    });
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
 * with PDB format, applies a default wire representation, then zooms
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
  viewer.setStyle({ model: model }, repStyle('line'));
  viewer.zoomTo();
  registerClickable();
  viewer.render();

  return model;
}

/**
 * Load molecular data directly into the viewer from a string.
 *
 * Adds the model, applies a default wire style, zooms to fit, and
 * renders the scene.
 *
 * @param {string} data - The molecular data as a string.
 * @param {string} format - The format of the data (e.g. "pdb", "sdf", "mol2").
 * @returns {object} The 3Dmol model that was added.
 */
export function loadModelData(data, format) {
  const model = viewer.addModel(data, format);
  viewer.setStyle({ model: model }, repStyle('line'));
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

/**
 * Compute eigendecomposition of a 3x3 symmetric matrix via Jacobi iteration.
 *
 * @param {number[][]} A - A 3x3 symmetric matrix.
 * @returns {{eigenvalues: number[], eigenvectors: number[][]}} Eigenvalues and
 *   eigenvectors (each eigenvector as a 3-element array, columns of the
 *   rotation matrix V where A = V * D * V^T).
 */
function jacobiEigen3x3(A) {
  const a = A.map(row => [...row]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  for (let iter = 0; iter < 50; iter++) {
    let p = 0, q = 1;
    let maxVal = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > maxVal) { p = 0; q = 2; maxVal = Math.abs(a[0][2]); }
    if (Math.abs(a[1][2]) > maxVal) { p = 1; q = 2; maxVal = Math.abs(a[1][2]); }

    if (maxVal < 1e-10) break;

    const diff = a[p][p] - a[q][q];
    let t;
    if (Math.abs(diff) < 1e-10) {
      t = 1;
    } else {
      const phi = diff / (2 * a[p][q]);
      t = 1 / (Math.abs(phi) + Math.sqrt(phi * phi + 1));
      if (phi < 0) t = -t;
    }
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;

    const app = a[p][p] + t * a[p][q];
    const aqq = a[q][q] - t * a[p][q];
    a[p][q] = 0;
    a[q][p] = 0;
    a[p][p] = app;
    a[q][q] = aqq;

    for (let r = 0; r < 3; r++) {
      if (r === p || r === q) continue;
      const arp = c * a[r][p] + s * a[r][q];
      const arq = -s * a[r][p] + c * a[r][q];
      a[r][p] = arp; a[p][r] = arp;
      a[r][q] = arq; a[q][r] = arq;
    }
    for (let r = 0; r < 3; r++) {
      const vrp = c * v[r][p] + s * v[r][q];
      const vrq = -s * v[r][p] + c * v[r][q];
      v[r][p] = vrp;
      v[r][q] = vrq;
    }
  }

  return {
    eigenvalues: [a[0][0], a[1][1], a[2][2]],
    eigenvectors: [
      [v[0][0], v[1][0], v[2][0]],
      [v[0][1], v[1][1], v[2][1]],
      [v[0][2], v[1][2], v[2][2]],
    ],
  };
}

/**
 * Convert a 3x3 rotation matrix to a quaternion [x, y, z, w].
 *
 * @param {number[][]} R - A 3x3 rotation matrix.
 * @returns {number[]} The quaternion as [x, y, z, w].
 */
function matToQuat(R) {
  const trace = R[0][0] + R[1][1] + R[2][2];
  let w, x, y, z;

  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    w = 0.25 * s;
    x = (R[2][1] - R[1][2]) / s;
    y = (R[0][2] - R[2][0]) / s;
    z = (R[1][0] - R[0][1]) / s;
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = 2 * Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]);
    w = (R[2][1] - R[1][2]) / s;
    x = 0.25 * s;
    y = (R[0][1] + R[1][0]) / s;
    z = (R[0][2] + R[2][0]) / s;
  } else if (R[1][1] > R[2][2]) {
    const s = 2 * Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]);
    w = (R[0][2] - R[2][0]) / s;
    x = (R[0][1] + R[1][0]) / s;
    y = 0.25 * s;
    z = (R[1][2] + R[2][1]) / s;
  } else {
    const s = 2 * Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]);
    w = (R[1][0] - R[0][1]) / s;
    x = (R[0][2] + R[2][0]) / s;
    y = (R[1][2] + R[2][1]) / s;
    z = 0.25 * s;
  }

  return [x, y, z, w];
}

/**
 * Orient the view by aligning the principal axes of the selected atoms with
 * the screen axes (longest dimension horizontal, second-longest vertical,
 * shortest perpendicular to screen), then zoom to fit.
 *
 * Uses PCA (eigendecomposition of the coordinate covariance matrix) to
 * determine the principal axes, builds a rotation quaternion, and applies it
 * via the viewer's setView API.
 *
 * @param {object} [selSpec] - A 3Dmol atom selection spec. Defaults to all atoms.
 */
export function orientView(selSpec) {
  const atoms = viewer.selectedAtoms(selSpec || {});
  if (atoms.length < 2) {
    viewer.zoomTo(selSpec || {});
    viewer.render();
    return;
  }

  // Centroid
  const n = atoms.length;
  let cx = 0, cy = 0, cz = 0;
  for (const a of atoms) { cx += a.x; cy += a.y; cz += a.z; }
  cx /= n; cy /= n; cz /= n;

  // Covariance matrix
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const a of atoms) {
    const dx = a.x - cx, dy = a.y - cy, dz = a.z - cz;
    cov[0][0] += dx * dx; cov[0][1] += dx * dy; cov[0][2] += dx * dz;
    cov[1][1] += dy * dy; cov[1][2] += dy * dz;
    cov[2][2] += dz * dz;
  }
  cov[1][0] = cov[0][1]; cov[2][0] = cov[0][2]; cov[2][1] = cov[1][2];

  // Eigendecomposition → principal axes
  const { eigenvalues, eigenvectors } = jacobiEigen3x3(cov);

  // Sort by eigenvalue descending: largest → x, second → y, smallest → z
  const idx = [0, 1, 2].sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  const pc1 = eigenvectors[idx[0]];
  const pc2 = eigenvectors[idx[1]];
  let pc3 = eigenvectors[idx[2]];

  // Ensure right-handed coordinate system
  const cross = [
    pc1[1] * pc2[2] - pc1[2] * pc2[1],
    pc1[2] * pc2[0] - pc1[0] * pc2[2],
    pc1[0] * pc2[1] - pc1[1] * pc2[0],
  ];
  const dot = cross[0] * pc3[0] + cross[1] * pc3[1] + cross[2] * pc3[2];
  if (dot < 0) {
    pc3 = [-pc3[0], -pc3[1], -pc3[2]];
  }

  // Rotation matrix: rows are principal axes → maps PC directions to screen axes
  const q = matToQuat([pc1, pc2, pc3]);

  // Zoom to set correct center and zoom level, then override rotation
  viewer.zoomTo(selSpec || {});
  const view = viewer.getView();
  view[4] = q[0];
  view[5] = q[1];
  view[6] = q[2];
  view[7] = q[3];
  viewer.setView(view);
  viewer.render();
}

/** @type {Array<object>} Shape objects for the current highlight overlay. */
let highlightShapes = [];

/** @type {boolean} Whether the current highlight uses addStyle (large selection path). */
let highlightUsesStyle = false;

/** @type {object|null} The selection spec used for the style-based highlight. */
let highlightStyleSpec = null;

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
  if (highlightUsesStyle && highlightStyleSpec) {
    // Remove style-based highlight by rebuilding without it
    viewer.removeAllShapes();
    highlightUsesStyle = false;
    highlightStyleSpec = null;
    viewer.render();
    return;
  }
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

  if (atoms.length >= HIGHLIGHT_THRESHOLD) {
    // Large selection: use addStyle for performance
    viewer.addStyle(selSpec, { sphere: { radius: 0.4, color: 'yellow', opacity: 0.35 } });
    highlightUsesStyle = true;
    highlightStyleSpec = selSpec;
    viewer.render();
    return;
  }

  // Small selection: per-atom sphere shapes (better visual quality)
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
