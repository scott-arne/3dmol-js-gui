import { fetchPDB, loadModelData } from '../viewer.js';
import { addObject } from '../state.js';

const SUPPORTED_FORMATS = new Set(['pdb', 'sdf', 'mol2', 'xyz', 'cube', 'pqr', 'gro', 'cif', 'mmcif']);
const FORMAT_ALIASES = new Map([['mmcif', 'cif']]);
const inFlightPdbIds = new Set();

function failure(code, message, detail = null) {
  return { ok: false, code, message, detail };
}

function success(name, model, modelIndex, message) {
  return { ok: true, code: 'loaded', name, model, modelIndex, message };
}

function getDeps(deps = {}) {
  return {
    addObject: deps.addObject || addObject,
    fetchImpl: deps.fetchImpl || globalThis.fetch,
    fetchPDB: deps.fetchPDB || fetchPDB,
    loadModelData: deps.loadModelData || loadModelData,
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

async function fetchUrlData(url, deps) {
  const urlError = validateHttpUrl(url);
  if (urlError) return urlError;

  const response = await deps.fetchImpl(url);
  if (!response.ok) {
    return failure('fetch_failed', `Failed to fetch structure: ${response.status} ${response.statusText}`);
  }

  const data = await response.text();
  const dataError = validateStructureData(data);
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
      const fetched = await fetchUrlData(normalized.url, deps);
      if (!fetched.ok) return fetched;
      return registerLoadedModel(normalized, fetched.data, options, deps);
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
    const data = await readFileText(file);
    return loadStructure({ kind: 'inline', name, format, data }, options);
  } catch (e) {
    return failure('file_read_failed', `Error reading "${file.name}": ${e.message || 'unknown error'}`, e);
  }
}
