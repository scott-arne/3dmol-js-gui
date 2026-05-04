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
const DEFAULT_ISOSURFACE_COLOR = '#0000FF';

const CONTOUR_STATS_FALLBACK = {
  min: 0,
  max: 1,
  robustMin: 0,
  robustMax: 1,
  mean: 0,
  stdDev: 1,
  suggestedLevel: 1,
};

const MAX_CONTOUR_SAMPLE_SIZE = 50000;

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
 * CCP4/MRC volumes use `matrix` for scene placement. 3Dmol applies that
 * matrix when generating isosurface vertices, so map boxes must use the same
 * transform rather than VolumeData#getCoordinates, which ignores `matrix`.
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
    (!hasVolumeMatrix(volumeData) && typeof volumeData.getCoordinates !== 'function')
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
        const coord = getVolumeCornerCoordinate(volumeData, x, y, z);
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
 * Compute lightweight contour statistics from parsed density values.
 *
 * @param {object} volumeData - 3Dmol VolumeData-like object.
 * @returns {{min: number, max: number, robustMin: number, robustMax: number, mean: number, stdDev: number, suggestedLevel: number}} Contour statistics.
 */
export function computeContourStats(volumeData) {
  const summary = getFiniteVolumeSummary(volumeData);
  const values = summary.values.sort((a, b) => a - b);

  if (values.length === 0) {
    return { ...CONTOUR_STATS_FALLBACK };
  }

  const min = summary.min;
  const max = summary.max;
  let robustMin = getSortedPercentile(values, 0.01);
  let robustMax = getSortedPercentile(values, 0.99);

  if (!hasPositiveRange(robustMin, robustMax)) {
    robustMin = min;
    robustMax = max;

    if (!hasPositiveRange(robustMin, robustMax)) {
      const halfRange = Math.max(Math.abs(min) * 0.01, 1e-6);
      robustMin = min - halfRange;
      robustMax = min + halfRange;
    }
  }

  return {
    min,
    max,
    robustMin,
    robustMax,
    mean: summary.mean,
    stdDev: summary.stdDev,
    suggestedLevel: getSuggestedContourLevel(summary, robustMin, robustMax),
  };
}

function getFiniteVolumeSummary(volumeData) {
  const data = volumeData?.data;
  const values = [];
  if (!data || !Number.isFinite(data.length)) {
    return { values, min: 0, max: 0, mean: 0, stdDev: 1, finiteCount: 0 };
  }

  let finiteCount = 0;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSquares = 0;

  for (let index = 0; index < data.length; index++) {
    const value = data[index];
    if (isFiniteDensityValue(value)) {
      finiteCount += 1;
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
      sumSquares += value * value;
      if (values.length < MAX_CONTOUR_SAMPLE_SIZE) {
        values.push(value);
      }
    }
  }

  if (finiteCount === 0) {
    return { values: [], min: 0, max: 0, mean: 0, stdDev: 1, finiteCount: 0 };
  }

  const mean = sum / finiteCount;
  const variance = Math.max(0, (sumSquares / finiteCount) - (mean * mean));
  const stdDev = Math.sqrt(variance);

  if (finiteCount > MAX_CONTOUR_SAMPLE_SIZE) {
    return {
      values: sampleFiniteVolumeValues(data, finiteCount),
      min,
      max,
      mean,
      stdDev,
      finiteCount,
    };
  }

  return { values, min, max, mean, stdDev, finiteCount };
}

function sampleFiniteVolumeValues(data, finiteCount) {
  const targetCount = Math.min(MAX_CONTOUR_SAMPLE_SIZE, finiteCount);
  if (targetCount <= 0) {
    return [];
  }

  const values = [];
  const interval = targetCount === 1 ? 0 : (finiteCount - 1) / (targetCount - 1);
  let finiteIndex = 0;

  for (let index = 0; index < data.length && values.length < targetCount; index++) {
    const value = data[index];
    if (!isFiniteDensityValue(value)) {
      continue;
    }

    const targetIndex = Math.round(values.length * interval);
    if (finiteIndex >= targetIndex) {
      values.push(value);
    }
    finiteIndex += 1;
  }

  return values;
}

function isFiniteDensityValue(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Return the stored contour suggestion for a map entry.
 *
 * @param {object} map - Map state entry.
 * @returns {number} Suggested raw isosurface level.
 */
export function getSuggestedIsosurfaceLevel(map) {
  const suggestedLevel = getOneSigmaContourLevel(map?.contourStats)
    ?? map?.contourStats?.suggestedLevel;
  return Number.isFinite(suggestedLevel) ? suggestedLevel : 1;
}

function getSuggestedContourLevel(summary, robustMin, robustMax) {
  return getOneSigmaContourLevel(summary) ?? getSuggestedLevelFromRange(robustMin, robustMax);
}

function getOneSigmaContourLevel(stats = {}) {
  if (!stats || typeof stats !== 'object') {
    return null;
  }
  const { mean, stdDev } = stats;
  if (!Number.isFinite(mean) || !Number.isFinite(stdDev) || stdDev <= 0) {
    return null;
  }
  return mean + stdDev;
}

function getSortedPercentile(sortedValues, percentile) {
  const position = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  return lowerValue + (upperValue - lowerValue) * (position - lowerIndex);
}

function getSuggestedLevelFromRange(robustMin, robustMax) {
  if (robustMax > 0) {
    return (Math.max(robustMin, 0) + robustMax) / 2;
  }
  return (robustMin + robustMax) / 2;
}

function hasPositiveRange(min, max) {
  return Number.isFinite(min) && Number.isFinite(max) && max > min;
}

function getVolumeCornerCoordinate(volumeData, x, y, z) {
  if (hasVolumeMatrix(volumeData)) {
    return transformPoint(volumeData.matrix.elements, x, y, z);
  }

  const { size } = volumeData;
  const index = x * size.y * size.z + y * size.z + z;
  return volumeData.getCoordinates(index);
}

function hasVolumeMatrix(volumeData) {
  const elements = volumeData?.matrix?.elements;
  return elements?.length >= 16 && Array.from(elements).every(Number.isFinite);
}

function transformPoint(elements, x, y, z) {
  return {
    x: elements[0] * x + elements[4] * y + elements[8] * z + elements[12],
    y: elements[1] * x + elements[5] * y + elements[9] * z + elements[13],
    z: elements[2] * x + elements[6] * y + elements[10] * z + elements[14],
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
    color: iso.color || DEFAULT_ISOSURFACE_COLOR,
  };

  if (iso.selection != null) {
    spec.selection = iso.selection;
  }
  if (iso.carve != null) {
    spec.seldist = iso.carve;
  } else if (iso.buffer != null) {
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
  showBoundingBox = false,
  render = true,
}) {
  const normalized = normalizeVolumeFormat(format);
  const volumeData = new globalThis.$3Dmol.VolumeData(data, normalized.format);
  const bounds = computeVolumeBounds(volumeData);
  const contourStats = computeContourStats(volumeData);
  const map = addMapEntry({
    name,
    format: normalized.format,
    sourceFormat: normalized.sourceFormat,
    volumeData,
    bounds,
    contourStats,
    visible: true,
    showBoundingBox,
    color,
    opacity,
    handles: [],
  });

  try {
    return redrawMapBox(map, { render });
  } catch (error) {
    removeMapEntry(map.name);
    throw error;
  }
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
  const map = getState().maps.get(name);
  if (!map) return undefined;

  const previousMap = snapshotMapEntry(map);
  const previousChildren = [];
  for (const iso of getState().isosurfaces.values()) {
    if (iso.mapName === name) {
      previousChildren.push(snapshotIsosurfaceEntry(iso));
    }
  }

  const stagedHandles = [];
  let nextMapHandles = [];
  const nextChildren = [];

  try {
    const nextMap = { ...previousMap, visible };
    if (visible !== false) {
      const handle = getViewer().addBox(buildMapBoxSpec(nextMap));
      stagedHandles.push(handle);
      nextMapHandles = [handle];
    }

    for (const previousChild of previousChildren) {
      const nextChild = { ...previousChild, parentVisible: visible !== false };
      const handle = getViewer().addIsosurface(
        previousMap.volumeData,
        buildIsosurfaceSpec(nextChild),
      );
      stagedHandles.push(handle);
      nextChildren.push({ ...nextChild, handle });
    }
  } catch (error) {
    removeViewerShapes(stagedHandles);
    restoreMapEntry(previousMap);
    for (const previousChild of previousChildren) {
      restoreIsosurfaceEntry(previousChild);
    }
    throw error;
  }

  updateMapEntry(name, { visible, handles: nextMapHandles });
  for (const nextChild of nextChildren) {
    updateIsosurfaceEntry(nextChild.name, {
      parentVisible: nextChild.parentVisible,
      handle: nextChild.handle,
    });
  }

  removeViewerShapes(previousMap.handles);
  for (const previousChild of previousChildren) {
    removeViewerShape(previousChild.handle);
  }
  scheduleRender();

  return getState().maps.get(name);
}

/**
 * Set map box color and redraw when visible.
 *
 * @param {string} name - Map name.
 * @param {string} color - CSS color value.
 * @returns {object|undefined} Updated map entry.
 */
export function setMapColor(name, color) {
  return updateAndRedrawMap(name, { color });
}

/**
 * Set map box opacity and redraw when visible.
 *
 * @param {string} name - Map name.
 * @param {number} opacity - Box opacity.
 * @returns {object|undefined} Updated map entry.
 */
export function setMapOpacity(name, opacity) {
  return updateAndRedrawMap(name, { opacity });
}

/**
 * Set map bounding-box visibility and redraw only the map box.
 *
 * @param {string} name - Map name.
 * @param {boolean} showBoundingBox - Whether to draw the map bounds box.
 * @returns {object|undefined} Updated map entry.
 */
export function setMapBoundingBoxVisibility(name, showBoundingBox) {
  return updateAndRedrawMap(name, { showBoundingBox });
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
  const level = Number.isFinite(options.level)
    ? options.level
    : getSuggestedIsosurfaceLevel(map);

  const previous = snapshotIsosurfaceEntry(getState().isosurfaces.get(options.name));

  const iso = addIsosurfaceEntry({
    ...options,
    level,
    representation,
    parentVisible: map.visible !== false,
    handle: previous?.handle ?? null,
  });
  try {
    return redrawIsosurface(iso);
  } catch (error) {
    if (previous) {
      restoreIsosurfaceEntry(previous);
    } else {
      removeIsosurfaceEntry(iso.name);
    }
    throw error;
  }
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

function redrawMapBox(map, { render = true } = {}) {
  if (!map) return undefined;

  if (map.visible === false || map.showBoundingBox !== true) {
    const removedShape = removeViewerShapes(map.handles);
    const updated = updateMapEntry(map.name, { handles: [] });
    if (removedShape && render) {
      scheduleRender();
    }
    return updated;
  }

  const oldHandles = [...(map.handles || [])];
  const handle = getViewer().addBox(buildMapBoxSpec(map));
  removeViewerShapes(oldHandles);
  if (render) {
    scheduleRender();
  }
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
  const previous = snapshotIsosurfaceEntry(getState().isosurfaces.get(name));
  if (!previous) return undefined;
  const iso = updateIsosurfaceEntry(name, patch);
  try {
    return redrawIsosurface(iso);
  } catch (error) {
    restoreIsosurfaceEntry(previous);
    throw error;
  }
}

function redrawIsosurface(iso) {
  if (!iso) return undefined;

  const map = getState().maps.get(iso.mapName);
  if (!map) {
    throw new Error(`Map "${iso.mapName}" not found`);
  }

  const oldHandle = iso.handle;
  const handle = getViewer().addIsosurface(map.volumeData, buildIsosurfaceSpec(iso));
  removeViewerShape(oldHandle);
  scheduleRender();
  return updateIsosurfaceEntry(iso.name, { handle });
}

function updateAndRedrawMap(name, patch) {
  const previous = snapshotMapEntry(getState().maps.get(name));
  if (!previous) return undefined;
  const map = updateMapEntry(name, patch);
  try {
    return redrawMapBox(map);
  } catch (error) {
    restoreMapEntry(previous);
    throw error;
  }
}

function snapshotMapEntry(map) {
  if (!map) return null;
  return {
    ...map,
    handles: [...(map.handles || [])],
  };
}

function restoreMapEntry(map) {
  const { name, handles, ...metadata } = map;
  updateMapEntry(name, { ...metadata, handles: [...handles] });
}

function snapshotIsosurfaceEntry(iso) {
  if (!iso) return null;
  return { ...iso };
}

function restoreIsosurfaceEntry(iso) {
  addIsosurfaceEntry(iso);
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
