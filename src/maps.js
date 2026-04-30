/**
 * Service boundary for density maps and volume-backed isosurfaces.
 *
 * State owns map and isosurface metadata. This module owns the 3Dmol viewer
 * handles needed to draw map boxes and isosurfaces from stored VolumeData.
 */

import {
  addIsosurfaceEntry,
  addMapEntry,
  getState,
  removeIsosurfaceEntry,
  removeMapEntry,
  renameIsosurfaceEntry,
  renameMapEntry,
  updateIsosurfaceEntry,
  updateMapEntry,
} from './state.js';
import { getViewer, scheduleRender } from './viewer.js';

const VOLUME_FORMATS = {
  ccp4: 'ccp4',
  map: 'ccp4',
  mrc: 'ccp4',
  cube: 'cube',
};

const ISOSURFACE_REPRESENTATIONS = new Set(['mesh', 'surface']);

/**
 * Normalize map file formats into 3Dmol VolumeData parser formats.
 *
 * @param {string} rawFormat - User-facing map format or extension.
 * @returns {{format: string, sourceFormat: string}} Normalized format metadata.
 * @throws {Error} If the map format is not supported.
 */
export function normalizeVolumeFormat(rawFormat) {
  const sourceFormat = String(rawFormat || '').trim().toLowerCase();
  const format = VOLUME_FORMATS[sourceFormat];
  if (!format) {
    throw new Error(`Unsupported map format "${rawFormat || ''}"`);
  }
  return { format, sourceFormat };
}

/**
 * Compute an axis-aligned bounding box from the eight grid corners.
 *
 * @param {object} volumeData - 3Dmol VolumeData-like object.
 * @returns {{min: object, max: object, center: object, dimensions: object}} Bounds metadata.
 * @throws {Error} If the VolumeData object cannot provide valid bounds.
 */
export function computeVolumeBounds(volumeData) {
  if (
    !volumeData ||
    !hasPositiveDimension(volumeData.size?.x) ||
    !hasPositiveDimension(volumeData.size?.y) ||
    !hasPositiveDimension(volumeData.size?.z) ||
    typeof volumeData.getCoordinates !== 'function'
  ) {
    throw new Error('Cannot determine map bounds');
  }

  const { size } = volumeData;
  const xValues = [0, size.x - 1];
  const yValues = [0, size.y - 1];
  const zValues = [0, size.z - 1];
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const x of xValues) {
    for (const y of yValues) {
      for (const z of zValues) {
        const index = x * size.y * size.z + y * size.z + z;
        const coord = volumeData.getCoordinates(index);
        if (!isCoordinate(coord)) {
          throw new Error('Cannot determine map bounds');
        }
        min.x = Math.min(min.x, coord.x);
        min.y = Math.min(min.y, coord.y);
        min.z = Math.min(min.z, coord.z);
        max.x = Math.max(max.x, coord.x);
        max.y = Math.max(max.y, coord.y);
        max.z = Math.max(max.z, coord.z);
      }
    }
  }

  return {
    min,
    max,
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    },
    dimensions: {
      w: max.x - min.x,
      h: max.y - min.y,
      d: max.z - min.z,
    },
  };
}

/**
 * Build the 3Dmol addIsosurface spec from an isosurface state entry.
 *
 * @param {object} iso - Isosurface state entry.
 * @returns {object} 3Dmol isosurface spec.
 */
export function buildIsosurfaceSpec(iso) {
  const representation = normalizeIsosurfaceRepresentation(iso.representation);
  const visible = iso.visible !== false && iso.parentVisible !== false;
  const spec = {
    isoval: iso.level,
    wireframe: representation === 'mesh',
    opacity: visible ? (iso.opacity ?? 0.75) : 0,
    color: iso.color || '#FFFFFF',
  };

  if (iso.selection != null) {
    spec.selection = iso.selection;
  }
  if (iso.buffer != null) {
    spec.seldist = iso.buffer;
  }

  return spec;
}

/**
 * Create a parsed density map and draw its bounding box.
 *
 * @param {object} options - Map creation options.
 * @returns {object} The stored map entry.
 */
export function createMap({
  name,
  data,
  format,
  color = '#38BDF8',
  opacity = 1,
}) {
  const normalized = normalizeVolumeFormat(format);
  const volumeData = new globalThis.$3Dmol.VolumeData(data, normalized.format);
  const bounds = computeVolumeBounds(volumeData);
  const map = addMapEntry({
    name,
    format: normalized.format,
    sourceFormat: normalized.sourceFormat,
    volumeData,
    bounds,
    visible: true,
    color,
    opacity,
    handles: [],
  });

  return redrawMapBox(map);
}

/**
 * Remove a map plus its child isosurfaces from viewer and state.
 *
 * @param {string} name - Map name.
 * @returns {{map: object, isosurfaces: object[]}|undefined} Removed entries.
 */
export function removeMap(name) {
  const state = getState();
  const map = state.maps.get(name);
  if (!map) return undefined;

  let removedShape = removeViewerShapes(map.handles);
  for (const iso of state.isosurfaces.values()) {
    if (iso.mapName === name) {
      removedShape = removeViewerShape(iso.handle) || removedShape;
    }
  }
  if (removedShape) {
    scheduleRender();
  }

  return removeMapEntry(name);
}

/**
 * Rename a map in state.
 *
 * @param {string} oldName - Current map name.
 * @param {string} newName - New map name.
 * @returns {boolean} True when renamed.
 */
export function renameMap(oldName, newName) {
  return renameMapEntry(oldName, newName);
}

/**
 * Set map visibility and redraw the box.
 *
 * @param {string} name - Map name.
 * @param {boolean} visible - Visibility flag.
 * @returns {object|undefined} Updated map entry.
 */
export function setMapVisibility(name, visible) {
  const map = updateMapEntry(name, { visible });
  if (!map) return undefined;
  const redrawn = redrawMapBox(map);
  for (const iso of getState().isosurfaces.values()) {
    if (iso.mapName === name) {
      redrawIsosurface(updateIsosurfaceEntry(iso.name, { parentVisible: visible !== false }));
    }
  }
  return redrawn;
}

/**
 * Set map box color and redraw when visible.
 *
 * @param {string} name - Map name.
 * @param {string} color - CSS color value.
 * @returns {object|undefined} Updated map entry.
 */
export function setMapColor(name, color) {
  const map = updateMapEntry(name, { color });
  return redrawMapBox(map);
}

/**
 * Set map box opacity and redraw when visible.
 *
 * @param {string} name - Map name.
 * @param {number} opacity - Box opacity.
 * @returns {object|undefined} Updated map entry.
 */
export function setMapOpacity(name, opacity) {
  const map = updateMapEntry(name, { opacity });
  return redrawMapBox(map);
}

/**
 * Create a volume-backed isosurface under an existing map.
 *
 * @param {object} options - Isosurface creation options.
 * @returns {object} The stored isosurface entry.
 */
export function createIsosurface(options) {
  const representation = normalizeIsosurfaceRepresentation(options.representation || 'mesh');
  const map = getState().maps.get(options.mapName);
  if (!map) {
    throw new Error(`Map "${options.mapName}" not found`);
  }

  const existing = getState().isosurfaces.get(options.name);
  removeViewerShape(existing?.handle);

  const iso = addIsosurfaceEntry({
    ...options,
    representation,
    parentVisible: map.visible !== false,
    handle: null,
  });
  return redrawIsosurface(iso);
}

/**
 * Remove an isosurface from viewer and state.
 *
 * @param {string} name - Isosurface name.
 * @returns {object|undefined} Removed isosurface entry.
 */
export function removeIsosurface(name) {
  const removed = removeIsosurfaceEntry(name);
  if (removed?.handle != null) {
    removeViewerShape(removed.handle);
    scheduleRender();
  }
  return removed;
}

/**
 * Rename an isosurface in state.
 *
 * @param {string} oldName - Current isosurface name.
 * @param {string} newName - New isosurface name.
 * @returns {boolean} True when renamed.
 */
export function renameIsosurface(oldName, newName) {
  return renameIsosurfaceEntry(oldName, newName);
}

/**
 * Set isosurface visibility and redraw.
 *
 * @param {string} name - Isosurface name.
 * @param {boolean} visible - Visibility flag.
 * @returns {object|undefined} Updated isosurface entry.
 */
export function setIsosurfaceVisibility(name, visible) {
  return updateAndRedrawIsosurface(name, { visible });
}

/**
 * Set isosurface representation and redraw.
 *
 * @param {string} name - Isosurface name.
 * @param {string} representation - "mesh" or "surface".
 * @returns {object|undefined} Updated isosurface entry.
 */
export function setIsosurfaceRepresentation(name, representation) {
  return updateAndRedrawIsosurface(name, {
    representation: normalizeIsosurfaceRepresentation(representation),
  });
}

/**
 * Set isosurface opacity and redraw.
 *
 * @param {string} name - Isosurface name.
 * @param {number} opacity - Isosurface opacity.
 * @returns {object|undefined} Updated isosurface entry.
 */
export function setIsosurfaceOpacity(name, opacity) {
  return updateAndRedrawIsosurface(name, { opacity });
}

/**
 * Set isosurface color and redraw.
 *
 * @param {string} name - Isosurface name.
 * @param {string} color - CSS color value.
 * @returns {object|undefined} Updated isosurface entry.
 */
export function setIsosurfaceColor(name, color) {
  return updateAndRedrawIsosurface(name, { color });
}

/**
 * Set isosurface level and redraw.
 *
 * @param {string} name - Isosurface name.
 * @param {number} level - Isovalue.
 * @returns {object|undefined} Updated isosurface entry.
 */
export function setIsosurfaceLevel(name, level) {
  return updateAndRedrawIsosurface(name, { level });
}

function redrawMapBox(map) {
  if (!map) return undefined;

  const removedShape = removeViewerShapes(map.handles);
  if (map.visible === false) {
    const updated = updateMapEntry(map.name, { handles: [] });
    if (removedShape) {
      scheduleRender();
    }
    return updated;
  }

  const handle = getViewer().addBox(buildMapBoxSpec(map));
  scheduleRender();
  return updateMapEntry(map.name, { handles: [handle] });
}

function buildMapBoxSpec(map) {
  return {
    center: map.bounds.center,
    dimensions: map.bounds.dimensions,
    color: map.color,
    opacity: map.visible ? map.opacity : 0,
    wireframe: true,
  };
}

function updateAndRedrawIsosurface(name, patch) {
  const iso = updateIsosurfaceEntry(name, patch);
  return redrawIsosurface(iso);
}

function redrawIsosurface(iso) {
  if (!iso) return undefined;

  removeViewerShape(iso.handle);
  const map = getState().maps.get(iso.mapName);
  if (!map) {
    updateIsosurfaceEntry(iso.name, { handle: null });
    throw new Error(`Map "${iso.mapName}" not found`);
  }

  const handle = getViewer().addIsosurface(map.volumeData, buildIsosurfaceSpec(iso));
  scheduleRender();
  return updateIsosurfaceEntry(iso.name, { handle });
}

function normalizeIsosurfaceRepresentation(value) {
  const representation = String(value || '').trim().toLowerCase();
  if (!ISOSURFACE_REPRESENTATIONS.has(representation)) {
    throw new Error(`Unknown isosurface representation "${value}"`);
  }
  return representation;
}

function removeViewerShapes(handles) {
  let removed = false;
  for (const handle of handles || []) {
    removed = removeViewerShape(handle) || removed;
  }
  return removed;
}

function removeViewerShape(handle) {
  if (handle == null) {
    return false;
  }
  const viewer = getViewer();
  if (viewer && typeof viewer.removeShape === 'function') {
    viewer.removeShape(handle);
    return true;
  }
  return false;
}

function hasPositiveDimension(value) {
  return Number.isFinite(value) && value > 0;
}

function isCoordinate(coord) {
  return (
    coord &&
    Number.isFinite(coord.x) &&
    Number.isFinite(coord.y) &&
    Number.isFinite(coord.z)
  );
}
