import {
  getStructureFormatFromFilename,
  normalizeStructureRequest,
} from './structure-loader.js';

function trimValue(value) {
  return String(value || '').trim();
}

function slugify(value) {
  return trimValue(value).toLowerCase().match(/[a-z0-9]+/g)?.join('-') || '';
}

function normalizeSource(source) {
  const name = trimValue(source?.name);
  const baseUrl = trimValue(source?.baseUrl);
  if (!name || !baseUrl) return null;

  return {
    id: trimValue(source?.id) || slugify(name),
    name,
    baseUrl,
  };
}

function findSource(remoteLoading, sourceId) {
  const normalized = normalizeRemoteLoadingConfig(remoteLoading);
  if (normalized.sources.length === 0) {
    throw new Error('No remote structure sources are configured.');
  }

  const requested = trimValue(sourceId).toLowerCase();
  const source = normalized.sources.find(candidate => (
    candidate.id.toLowerCase() === requested
    || candidate.name.toLowerCase() === requested
  ));
  if (!source) {
    const names = normalized.sources.map(candidate => candidate.name).join(', ');
    throw new Error(`Unknown remote source "${sourceId}". Available sources: ${names}`);
  }
  return source;
}

function rejectUnsafeRelativePath(path) {
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(path)
    || path.startsWith('/')
    || path.startsWith('\\')
    || path.includes('\\')
    || path.split('/').includes('..')
  ) {
    throw new Error('Remote source path must be relative.');
  }
}

function validateRelativePath(path) {
  const value = trimValue(path);
  if (!value) {
    throw new Error('Remote source path is required.');
  }
  rejectUnsafeRelativePath(value);
  try {
    decodeURIComponent(value);
  } catch {
    throw new Error('Remote source path must be relative.');
  }

  let pathOnly = value.split(/[?#]/, 1)[0];
  for (let i = 0; i < 3; i += 1) {
    rejectUnsafeRelativePath(pathOnly);

    let decoded;
    try {
      decoded = decodeURIComponent(pathOnly);
    } catch {
      throw new Error('Remote source path must be relative.');
    }
    if (decoded === pathOnly) break;
    pathOnly = decoded;
  }
  rejectUnsafeRelativePath(pathOnly);
  let decoded;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    throw new Error('Remote source path must be relative.');
  }
  if (decoded !== pathOnly) {
    throw new Error('Remote source path must be relative.');
  }
  return value;
}

function joinSourceUrl(baseUrl, path) {
  const base = baseUrl.replace(/\/+$/, '');
  const relative = path.replace(/^\.\/+/, '');
  return `${base}/${relative}`;
}

function nameFromPath(path) {
  const pathOnly = trimValue(path).split(/[?#]/, 1)[0];
  const filename = pathOnly.split('/').filter(Boolean).pop() || pathOnly;
  return filename.replace(/\.[^.]+$/, '');
}

function formatFromPath(path) {
  const pathOnly = trimValue(path).split(/[?#]/, 1)[0];
  return getStructureFormatFromFilename(pathOnly);
}

function buildUrlRequest({ name, format, url, path, fallbackName }) {
  return normalizeStructureRequest({
    kind: 'url',
    name: trimValue(name) || trimValue(fallbackName) || nameFromPath(path || url),
    format: trimValue(format) || formatFromPath(path || url),
    url,
  });
}

export function normalizeRemoteLoadingConfig(config = {}) {
  const sources = Array.isArray(config?.sources)
    ? config.sources.map(normalizeSource).filter(Boolean)
    : [];

  return {
    allowArbitraryUrls: Boolean(config?.allowArbitraryUrls),
    sources,
  };
}

export function resolveConfiguredSourceRequest(remoteLoading, params) {
  const source = findSource(remoteLoading, params?.sourceId);
  const path = validateRelativePath(params?.path);
  const url = joinSourceUrl(source.baseUrl, path);
  const request = buildUrlRequest({
    name: params?.name,
    format: params?.format,
    url,
    path,
  });

  return { request, source };
}

export function resolveArbitraryUrlRequest(remoteLoading, params) {
  const normalized = normalizeRemoteLoadingConfig(remoteLoading);
  if (!normalized.allowArbitraryUrls) {
    throw new Error('Arbitrary URL loading is disabled.');
  }

  return {
    request: buildUrlRequest({
      name: params?.name,
      format: params?.format,
      url: params?.url,
    }),
  };
}

export function resolveInitializationStructureRequest(entry, fallbackName, remoteLoading) {
  if (entry?.url) {
    const name = trimValue(entry.name) || trimValue(fallbackName) || nameFromPath(entry.url);
    return resolveArbitraryUrlRequest(remoteLoading, {
      name,
      format: entry.format,
      url: entry.url,
    });
  }

  if (entry?.source) {
    return resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: entry.source,
      path: entry.path,
      name: entry.name,
      format: entry.format,
    });
  }

  return {
    request: normalizeStructureRequest({
      kind: 'inline',
      name: entry?.name || fallbackName || entry?.format,
      format: entry?.format,
      data: entry?.data,
    }),
  };
}
