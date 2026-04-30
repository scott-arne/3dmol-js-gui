/**
 * Service boundary for first-class 3Dmol surface objects.
 *
 * Surface metadata, naming, and tree placement stay in state.js. This module
 * owns the viewer handles and material updates that make those state entries
 * visible in the 3Dmol scene.
 */

import {
  addSurfaceEntry,
  getChildSurfaceNames,
  getState,
  removeSurfaceEntry,
  renameSurfaceEntry,
  setSurfaceHandle,
  updateSurfaceEntry,
} from './state.js';
import { getViewer, scheduleRender } from './viewer.js';

const SURFACE_TYPES = {
  molecular: 'MS',
  sasa: 'SAS',
};

const SURFACE_MODES = new Set(['surface', 'wireframe']);

/** @type {Map<string, symbol>} */
const pendingSurfaceRequests = new Map();

/**
 * Convert a user-facing surface type into the matching 3Dmol type constant.
 *
 * @param {string} [rawType='molecular'] - User-facing surface type.
 * @returns {{type: string, surfaceType: string}} Normalized type metadata.
 * @throws {Error} If the type is not supported.
 */
export function normalizeSurfaceType(rawType = 'molecular') {
  const type = String(rawType || 'molecular').trim().toLowerCase();
  const surfaceType = SURFACE_TYPES[type];
  if (!surfaceType) {
    throw new Error(`Unknown surface type "${rawType}"`);
  }
  return { type, surfaceType };
}

/**
 * Build a 3Dmol surface material style from state metadata.
 *
 * @param {object} surface - Surface state entry.
 * @returns {{color: string, opacity: number, wireframe: boolean}} Material style.
 */
export function buildSurfaceStyle(surface) {
  const visible = surface.visible !== false && surface.parentVisible !== false;
  return {
    color: surface.color || '#FFFFFF',
    opacity: visible ? (surface.opacity ?? 0.75) : 0,
    wireframe: surface.mode === 'wireframe',
  };
}

/**
 * Create or replace a 3Dmol surface and track its async viewer handle.
 *
 * @param {object} options - Surface creation options.
 * @param {string} options.name - Surface name.
 * @param {object} options.selection - 3Dmol atom selection spec.
 * @param {string} [options.type='molecular'] - User-facing surface type.
 * @param {string|null} [options.parentName=null] - Optional parent object name.
 * @param {string} [options.color='#FFFFFF'] - Surface color.
 * @param {number} [options.opacity=0.75] - Surface opacity.
 * @param {string} [options.mode='surface'] - Surface material mode.
 * @returns {Promise<object|undefined>} The finalized surface entry.
 */
export async function createSurface({
  name,
  selection = {},
  type = 'molecular',
  parentName = null,
  color = '#FFFFFF',
  opacity = 0.75,
  mode = 'surface',
}) {
  validateSurfaceMode(mode);
  const normalized = normalizeSurfaceType(type);

  const viewer = getViewer();
  const existing = getState().surfaces.get(name);
  if (existing?.handle != null) {
    removeViewerSurface(existing.handle);
  }

  const parentVisible = parentName
    ? (getState().objects.get(parentName)?.visible !== false)
    : true;
  const surface = addSurfaceEntry({
    name,
    selection,
    type: normalized.type,
    surfaceType: normalized.surfaceType,
    parentName,
    handle: null,
    pending: true,
    visible: true,
    parentVisible,
    mode,
    opacity,
    color,
  });

  const requestToken = Symbol(name);
  pendingSurfaceRequests.set(name, requestToken);

  let surfacePromise;
  try {
    surfacePromise = viewer.addSurface(
      surface.surfaceType,
      buildSurfaceStyle(surface),
      surface.selection,
      surface.selection,
    );
    const resolved = await surfacePromise;
    const handle = resolveSurfaceHandle(surfacePromise, resolved);
    const currentName = getPendingSurfaceName(requestToken);

    if (!currentName) {
      removeViewerSurface(handle);
      return getState().surfaces.get(name);
    }

    pendingSurfaceRequests.delete(currentName);
    const finalized = setSurfaceHandle(currentName, handle);
    if (!finalized) {
      removeViewerSurface(handle);
      return undefined;
    }
    applySurfaceMaterial(finalized);
    return finalized;
  } catch (error) {
    const currentName = getPendingSurfaceName(requestToken);
    if (currentName) {
      pendingSurfaceRequests.delete(currentName);
      removeSurfaceEntry(currentName);
    }

    const partialHandle = surfacePromise ? resolveSurfaceHandle(surfacePromise) : null;
    removeViewerSurface(partialHandle);
    throw error;
  }
}

/**
 * Remove a surface from the viewer and state.
 *
 * @param {string} name - Surface name.
 * @returns {object|undefined} The removed surface entry.
 */
export function removeSurface(name) {
  pendingSurfaceRequests.delete(name);
  const removed = removeSurfaceEntry(name);
  if (removed?.handle != null) {
    removeViewerSurface(removed.handle);
  }
  return removed;
}

/**
 * Rename a surface in state.
 *
 * @param {string} oldName - Current surface name.
 * @param {string} newName - New surface name.
 * @returns {boolean} True when the surface was renamed.
 */
export function renameSurface(oldName, newName) {
  const renamed = renameSurfaceEntry(oldName, newName);
  if (renamed && pendingSurfaceRequests.has(oldName)) {
    const requestToken = pendingSurfaceRequests.get(oldName);
    pendingSurfaceRequests.delete(oldName);
    pendingSurfaceRequests.set(newName, requestToken);
  }
  return renamed;
}

/**
 * Set surface visibility and update its material if resolved.
 *
 * @param {string} name - Surface name.
 * @param {boolean} visible - Visibility flag.
 * @returns {object|undefined} Updated surface entry.
 */
export function setSurfaceVisibility(name, visible) {
  return updateSurfaceMaterial(name, { visible });
}

/**
 * Set the surface render mode.
 *
 * @param {string} name - Surface name.
 * @param {string} mode - Surface mode: "surface" or "wireframe".
 * @returns {object|undefined} Updated surface entry.
 */
export function setSurfaceMode(name, mode) {
  validateSurfaceMode(mode);
  return updateSurfaceMaterial(name, { mode });
}

/**
 * Set surface opacity.
 *
 * @param {string} name - Surface name.
 * @param {number} opacity - Surface opacity.
 * @returns {object|undefined} Updated surface entry.
 */
export function setSurfaceOpacity(name, opacity) {
  return updateSurfaceMaterial(name, { opacity });
}

/**
 * Set surface color.
 *
 * @param {string} name - Surface name.
 * @param {string} color - CSS color value.
 * @returns {object|undefined} Updated surface entry.
 */
export function setSurfaceColor(name, color) {
  return updateSurfaceMaterial(name, { color });
}

/**
 * Update effective visibility for all surfaces under a parent object.
 *
 * @param {string} parentName - Parent object name.
 * @param {boolean} parentVisible - Parent visibility flag.
 * @returns {object[]} Updated child surface entries.
 */
export function setSurfaceParentVisibility(parentName, parentVisible) {
  const updated = [];
  for (const surfaceName of getChildSurfaceNames(parentName)) {
    const surface = updateSurfaceMaterial(surfaceName, { parentVisible });
    if (surface) {
      updated.push(surface);
    }
  }
  return updated;
}

/**
 * Remove every surface parented under an object.
 *
 * @param {string} parentName - Parent object name.
 * @returns {object[]} Removed surface entries.
 */
export function removeSurfacesForParent(parentName) {
  const removed = [];
  for (const surfaceName of getChildSurfaceNames(parentName)) {
    const surface = removeSurface(surfaceName);
    if (surface) {
      removed.push(surface);
    }
  }
  return removed;
}

/**
 * Find whether a selection belongs to exactly one loaded object.
 *
 * @param {object} selection - 3Dmol atom selection spec.
 * @returns {string|null} Matching object name, or null for none/multiple.
 */
export function findSingleSurfaceParent(selection) {
  const viewer = getViewer();
  let match = null;
  let matchCount = 0;

  for (const [name, obj] of getState().objects) {
    const atoms = viewer.selectedAtoms({ ...selection, model: obj.model });
    if (atoms.length === 0) {
      continue;
    }
    matchCount++;
    match = name;
  }

  return matchCount === 1 ? match : null;
}

function updateSurfaceMaterial(name, patch) {
  const surface = updateSurfaceEntry(name, patch);
  applySurfaceMaterial(surface);
  return surface;
}

function applySurfaceMaterial(surface) {
  if (!surface || surface.handle == null) {
    return;
  }
  getViewer().setSurfaceMaterialStyle(surface.handle, buildSurfaceStyle(surface));
  scheduleRender();
}

function removeViewerSurface(handle) {
  if (handle == null) {
    return;
  }
  getViewer().removeSurface(handle);
  scheduleRender();
}

function resolveSurfaceHandle(surfacePromise, resolved) {
  if (surfacePromise && Object.prototype.hasOwnProperty.call(surfacePromise, 'surfid')) {
    return surfacePromise.surfid;
  }
  if (
    resolved &&
    typeof resolved === 'object' &&
    Object.prototype.hasOwnProperty.call(resolved, 'surfid')
  ) {
    return resolved.surfid;
  }
  return resolved;
}

function getPendingSurfaceName(requestToken) {
  for (const [name, token] of pendingSurfaceRequests) {
    if (token === requestToken) {
      return name;
    }
  }
  return null;
}

function validateSurfaceMode(mode) {
  if (!SURFACE_MODES.has(mode)) {
    throw new Error(`Unknown surface mode "${mode}"`);
  }
}
