import { clearAllLabels, getViewer, scheduleRender } from './viewer.js';
import { clearHighlight } from './highlight.js';
import { getState, notifyStateChange } from './state.js';

function requireService(service, methodName, label) {
  if (!service || typeof service[methodName] !== 'function') {
    throw new Error(`${label} service is unavailable`);
  }
}

/**
 * Clear all loaded scene entries from the viewer and state.
 *
 * @param {object} [options] - Clear options and service dependencies.
 * @param {object} [options.viewer] - Viewer instance to clear.
 * @param {object} [options.surfaceService] - Surface service.
 * @param {object} [options.mapService] - Density map service.
 * @returns {{entryCount: number}} Number of cleared entries.
 */
export function clearScene(options = {}) {
  const viewer = options.viewer || getViewer();
  const state = getState();
  const objectEntries = [...state.objects.values()];
  const surfaceNames = [...state.surfaces.keys()];
  const mapNames = [...state.maps.keys()];
  const mapNameSet = new Set(mapNames);
  const orphanIsosurfaceNames = [...state.isosurfaces.entries()]
    .filter(([, iso]) => !mapNameSet.has(iso.mapName))
    .map(([name]) => name);
  const entryCount =
    state.objects.size +
    state.selections.size +
    state.surfaces.size +
    state.maps.size +
    state.isosurfaces.size;

  if (surfaceNames.length > 0) {
    requireService(options.surfaceService, 'removeSurface', 'Surface');
  }
  if (mapNames.length > 0 || orphanIsosurfaceNames.length > 0) {
    requireService(options.mapService, 'removeMap', 'Map');
    requireService(options.mapService, 'removeIsosurface', 'Map');
  }

  for (const obj of objectEntries) {
    if (obj?.model && typeof viewer?.removeModel === 'function') {
      viewer.removeModel(obj.model);
    }
  }

  for (const surfaceName of surfaceNames) {
    options.surfaceService.removeSurface(surfaceName);
  }

  for (const mapName of mapNames) {
    options.mapService.removeMap(mapName);
  }

  for (const isoName of orphanIsosurfaceNames) {
    options.mapService.removeIsosurface(isoName);
  }

  state.objects.clear();
  state.selections.clear();
  state.surfaces.clear();
  state.maps.clear();
  state.isosurfaces.clear();
  state.entryTree.length = 0;

  clearAllLabels();
  clearHighlight();
  scheduleRender();
  notifyStateChange();

  return { entryCount };
}
