import { fetchPDB, getViewer, loadModelData, removeModel, scheduleRender } from '../viewer.js';
import { addObject, removeObject } from '../state.js';
import { createMap } from '../maps.js';

const STRUCTURE_FORMATS = new Set(['pdb', 'sdf', 'mol2', 'xyz', 'pqr', 'gro', 'cif', 'mmcif']);
const MAP_FORMATS = new Set(['ccp4', 'map', 'mrc']);
const HYBRID_FORMATS = new Set(['cube']);
const SUPPORTED_FORMATS = new Set([...STRUCTURE_FORMATS, ...MAP_FORMATS, ...HYBRID_FORMATS]);
const FORMAT_ALIASES = new Map([['mmcif', 'cif']]);
const inFlightPdbIds = new Set();

function failure(code, message, detail = null) {
  return { ok: false, code, message, detail };
}

function success(name, model, modelIndex, message) {
  return { ok: true, code: 'loaded', name, model, modelIndex, message };
}

function mapSuccess(name, mapName, map, message) {
  return { ok: true, code: 'loaded_map', name, mapName, map, message };
}

function hybridSuccess(name, model, modelIndex, mapName, map, message) {
  return { ok: true, code: 'loaded_hybrid', name, model, modelIndex, mapName, map, message };
}

function getDeps(deps = {}) {
  return {
    addObject: deps.addObject || addObject,
    createMap: deps.createMap || createMap,
    fetchImpl: deps.fetchImpl || globalThis.fetch,
    fetchPDB: deps.fetchPDB || fetchPDB,
    loadModelData: deps.loadModelData || loadModelData,
    removeModel: deps.removeModel || removeModel,
    removeObject: deps.removeObject || removeObject,
    scheduleRender: deps.scheduleRender || scheduleRender,
    zoomTo: deps.zoomTo || (() => getViewer().zoomTo()),
  };
}

function normalizeFormat(format) {
  const value = String(format || '').trim().toLowerCase();
  return FORMAT_ALIASES.get(value) || value;
}

function validateFormat(format) {
  const normalized = normalizeFormat(format);
  if (!SUPPORTED_FORMATS.has(normalized)) {
    throw new Error(`Unsupported structure format "${format || ''}".`);
  }
  return normalized;
}

function isMapOnlyFormat(format) {
  return MAP_FORMATS.has(format);
}

function isHybridFormat(format) {
  return HYBRID_FORMATS.has(format);
}

function trimRequired(value, message) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function nameFromFilename(filename) {
  return trimRequired(filename, 'Structure filename is required.').replace(/\.[^.]+$/, '');
}

export function getStructureFormatFromFilename(filename) {
  const name = trimRequired(filename, 'Structure filename is required.');
  const match = name.match(/\.([^.]+)$/);
  if (!match) throw new Error('Structure file must have a supported extension.');
  return validateFormat(match[1]);
}

export function normalizeStructureRequest(request) {
  const kind = String(request?.kind || '').trim().toLowerCase();
  if (kind === 'pdb') {
    const pdbId = String(request?.pdbId || request?.id || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(pdbId)) {
      throw new Error('Usage: fetch <pdb_id> (must be a 4-character PDB ID)');
    }
    return { kind: 'pdb', pdbId, name: pdbId, format: 'pdb' };
  }

  if (kind === 'inline') {
    return {
      kind,
      name: trimRequired(request?.name, 'Structure name is required.'),
      format: validateFormat(request?.format),
      data: request?.data,
    };
  }

  if (kind === 'url') {
    return {
      kind,
      name: trimRequired(request?.name, 'Structure name is required.'),
      format: validateFormat(request?.format),
      url: trimRequired(request?.url, 'Structure URL is required.'),
    };
  }

  throw new Error(`Unsupported structure request kind "${kind}".`);
}

function validateStructureData(data) {
  if (typeof data !== 'string' || data.trim() === '') {
    return failure('empty_data', 'Structure data is empty.');
  }
  return null;
}

function validateMapData(data) {
  if (data instanceof ArrayBuffer && data.byteLength > 0) return null;
  if (ArrayBuffer.isView(data) && data.byteLength > 0) return null;
  if (typeof data === 'string' && data.trim() !== '') return null;
  return failure('empty_data', 'Map data is empty.');
}

function validateHttpUrl(url) {
  try {
    const base = globalThis.location?.href || 'http://localhost/';
    const parsed = new URL(url, base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return failure('invalid_url', 'Structure URL must use http or https.');
    }
    return null;
  } catch (e) {
    return failure('invalid_url', `Invalid structure URL: ${e.message}`, e);
  }
}

async function fetchUrlData(url, deps, format) {
  const urlError = validateHttpUrl(url);
  if (urlError) return urlError;

  const response = await deps.fetchImpl(url);
  if (!response.ok) {
    return failure('fetch_failed', `Failed to fetch structure: ${response.status} ${response.statusText}`);
  }

  const data = isMapOnlyFormat(format) ? await response.arrayBuffer() : await response.text();
  const dataError = isMapOnlyFormat(format) ? validateMapData(data) : validateStructureData(data);
  if (dataError) return dataError;
  return { ok: true, data };
}

function registerLoadedModel(request, data, options, deps) {
  const loadOptions = options.loadOptions || {};
  const model = deps.loadModelData(data, request.format, loadOptions);
  const modelIndex = model.getID ? model.getID() : null;
  const name = deps.addObject(request.name, model, modelIndex);
  return success(name, model, modelIndex, `Loaded "${name}"`);
}

function registerLoadedMap(request, data, deps) {
  const map = deps.createMap({ name: request.name, data, format: request.format });
  return mapSuccess(map.name, map.name, map, `Loaded map "${map.name}"`);
}

function registerLoadedHybrid(request, data, options, deps) {
  const loadOptions = options.loadOptions || {};
  const shouldZoom = loadOptions.zoom !== false;
  const shouldRender = loadOptions.render !== false;
  const stagingLoadOptions = { ...loadOptions, zoom: false, render: false };
  const model = deps.loadModelData(data, request.format, stagingLoadOptions);
  const modelIndex = model.getID ? model.getID() : null;
  const name = deps.addObject(request.name, model, modelIndex);
  const mapName = `${name}_map`;
  try {
    const map = deps.createMap({ name: mapName, data, format: request.format });
    if (shouldZoom) deps.zoomTo();
    if (shouldRender) deps.scheduleRender();
    return hybridSuccess(name, model, modelIndex, map.name, map, `Loaded "${name}" and map "${map.name}"`);
  } catch (error) {
    try {
      deps.removeObject(name);
    } catch {
      // Cleanup must not mask the original map creation failure.
    }
    try {
      deps.removeModel(model);
    } catch {
      // Cleanup must not mask the original map creation failure.
    }
    throw error;
  }
}

async function loadPdb(request, deps) {
  if (inFlightPdbIds.has(request.pdbId)) {
    return failure(
      'pdb_fetch_in_progress',
      `PDB ${request.pdbId} is already being fetched. Please wait.`,
    );
  }

  inFlightPdbIds.add(request.pdbId);
  try {
    const model = await deps.fetchPDB(request.pdbId);
    const modelIndex = model.getID ? model.getID() : null;
    const name = deps.addObject(request.pdbId, model, modelIndex);
    return success(name, model, modelIndex, `Loaded ${request.pdbId} as "${name}"`);
  } finally {
    inFlightPdbIds.delete(request.pdbId);
  }
}

export async function loadStructure(request, options = {}) {
  let normalized;
  try {
    normalized = normalizeStructureRequest(request);
  } catch (e) {
    return failure('invalid_request', e.message, e);
  }

  const deps = getDeps(options.deps);

  try {
    if (normalized.kind === 'pdb') {
      return await loadPdb(normalized, deps);
    }

    if (normalized.kind === 'url') {
      const fetched = await fetchUrlData(normalized.url, deps, normalized.format);
      if (!fetched.ok) return fetched;
      if (isMapOnlyFormat(normalized.format)) {
        return registerLoadedMap(normalized, fetched.data, deps);
      }
      if (isHybridFormat(normalized.format)) {
        return registerLoadedHybrid(normalized, fetched.data, options, deps);
      }
      return registerLoadedModel(normalized, fetched.data, options, deps);
    }

    if (isMapOnlyFormat(normalized.format)) {
      const dataError = validateMapData(normalized.data);
      if (dataError) return dataError;
      return registerLoadedMap(normalized, normalized.data, deps);
    }

    if (isHybridFormat(normalized.format)) {
      const dataError = validateStructureData(normalized.data);
      if (dataError) return dataError;
      return registerLoadedHybrid(normalized, normalized.data, options, deps);
    }

    const dataError = validateStructureData(normalized.data);
    if (dataError) return dataError;
    return registerLoadedModel(normalized, normalized.data, options, deps);
  } catch (e) {
    return failure('load_failed', `Failed to load structure: ${e.message}`, e);
  }
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(reader.error || new Error('unknown error'));
    reader.readAsText(file);
  });
}

function readFileArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(reader.error || new Error('unknown error'));
    reader.readAsArrayBuffer(file);
  });
}

export async function loadStructureFile(file, options = {}) {
  if (!file) {
    return failure('missing_file', 'Choose a structure file to load.');
  }

  let format;
  let name;
  try {
    format = getStructureFormatFromFilename(file.name);
    name = nameFromFilename(file.name);
  } catch (e) {
    return failure('invalid_file', e.message, e);
  }

  try {
    const data = isMapOnlyFormat(format)
      ? await readFileArrayBuffer(file)
      : await readFileText(file);
    return loadStructure({ kind: 'inline', name, format, data }, options);
  } catch (e) {
    return failure('file_read_failed', `Error reading "${file.name}": ${e.message || 'unknown error'}`, e);
  }
}
