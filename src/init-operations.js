import { getNextIsosurfaceName, getNextSurfaceName } from './state.js';
import { getSelSpec, resolveSelection } from './commands/resolve-selection.js';

export function decodeInitMapData(op) {
  if (op.encoding === 'base64') {
    const binary = globalThis.atob(op.data || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  return op.data || '';
}

export function resolveInitSceneSelection(selection) {
  if (typeof selection === 'string') {
    return getSelSpec(resolveSelection(selection));
  }
  return selection || {};
}

function requireService(service, label) {
  if (!service) {
    throw new Error(`${label} service is unavailable`);
  }
  return service;
}

function getSurfaceName(op) {
  if (op.name) {
    return op.name;
  }
  const prefix = typeof op.selection === 'string' ? `${op.selection}_surface` : 'surface';
  return getNextSurfaceName(prefix);
}

export async function applyInitSceneOperation(op, ctx) {
  if (op.op === 'add_surface') {
    const surfaceService = requireService(ctx.surfaceService, 'Surface');
    const selection = resolveInitSceneSelection(op.selection);
    const parentName = surfaceService.findSingleSurfaceParent(selection) || null;
    await surfaceService.createSurface({
      name: getSurfaceName(op, selection),
      selection,
      type: op.type || 'molecular',
      parentName,
      color: op.color || '#FFFFFF',
      opacity: op.opacity ?? 0.75,
      mode: op.mode || 'surface',
    });
    return true;
  }

  if (op.op === 'remove_surface') {
    const surfaceService = requireService(ctx.surfaceService, 'Surface');
    surfaceService.removeSurface(op.name);
    return true;
  }

  if (op.op === 'add_map') {
    const mapService = requireService(ctx.mapService, 'Map');
    mapService.createMap({
      name: op.name,
      data: decodeInitMapData(op),
      format: op.format,
      color: op.color || '#38BDF8',
      opacity: op.opacity ?? 1,
      showBoundingBox: op.showBoundingBox === true,
    });
    return true;
  }

  if (op.op === 'remove_map') {
    const mapService = requireService(ctx.mapService, 'Map');
    mapService.removeMap(op.name);
    return true;
  }

  if (op.op === 'add_isosurface') {
    const mapService = requireService(ctx.mapService, 'Map');
    const selection = op.selection == null ? null : resolveInitSceneSelection(op.selection);
    mapService.createIsosurface({
      name: op.name || getNextIsosurfaceName(),
      mapName: op.mapName,
      level: op.level,
      selection,
      buffer: op.buffer,
      carve: op.carve,
      representation: op.representation || 'mesh',
      color: op.color || '#0000FF',
      opacity: op.opacity ?? 0.75,
    });
    return true;
  }

  if (op.op === 'remove_isosurface') {
    const mapService = requireService(ctx.mapService, 'Map');
    mapService.removeIsosurface(op.name);
    return true;
  }

  return false;
}
