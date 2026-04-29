import { describe, expect, it } from 'vitest';
import {
  normalizeRemoteLoadingConfig,
  resolveArbitraryUrlRequest,
  resolveConfiguredSourceRequest,
  resolveInitializationStructureRequest,
} from '../src/loading/remote-loading.js';

describe('remote-loading', () => {
  it('normalizes missing config to the static-safe default', () => {
    expect(normalizeRemoteLoadingConfig()).toEqual({
      allowArbitraryUrls: false,
      sources: [],
    });
  });

  it('normalizes configured sources with stable ids', () => {
    const config = normalizeRemoteLoadingConfig({
      allowArbitraryUrls: true,
      sources: [
        { name: 'App Structures', baseUrl: '/api/c3d/structures/' },
        { id: 'pdb-proxy', name: 'PDB Proxy', baseUrl: '/api/c3d/pdb' },
      ],
    });

    expect(config).toEqual({
      allowArbitraryUrls: true,
      sources: [
        { id: 'app-structures', name: 'App Structures', baseUrl: '/api/c3d/structures/' },
        { id: 'pdb-proxy', name: 'PDB Proxy', baseUrl: '/api/c3d/pdb' },
      ],
    });
  });

  it('drops incomplete source entries', () => {
    const config = normalizeRemoteLoadingConfig({
      sources: [
        { name: 'Missing URL' },
        { baseUrl: '/api/no-name/' },
        { name: 'Usable', baseUrl: '/api/usable/' },
      ],
    });

    expect(config.sources).toEqual([
      { id: 'usable', name: 'Usable', baseUrl: '/api/usable/' },
    ]);
  });

  it('builds a loader request for a configured source', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    const { request, source } = resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses/ligand.pdb',
    });

    expect(source.name).toBe('App Structures');
    expect(request).toEqual({
      kind: 'url',
      name: 'ligand',
      format: 'pdb',
      url: '/api/c3d/structures/poses/ligand.pdb',
    });
  });

  it('builds a configured source request with explicit name and format', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ id: 'app', name: 'App Structures', baseUrl: 'https://example.test/api' }],
    });

    const { request } = resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'App Structures',
      path: 'pose/123',
      name: 'Design Unit Pose',
      format: 'PDB',
    });

    expect(request).toEqual({
      kind: 'url',
      name: 'Design Unit Pose',
      format: 'pdb',
      url: 'https://example.test/api/pose/123',
    });
  });

  it('matches configured sources by id or name case-insensitively', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ id: 'app', name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    expect(resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'APP',
      path: 'pose.pdb',
    }).source.name).toBe('App Structures');
    expect(resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app structures',
      path: 'pose.pdb',
    }).source.id).toBe('app');
  });

  it('rejects unknown configured sources', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'missing',
      path: 'pose.pdb',
    })).toThrow('Unknown remote source "missing". Available sources: App Structures');
  });

  it('reports when no configured sources are available', () => {
    const remoteLoading = normalizeRemoteLoadingConfig();

    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app',
      path: 'pose.pdb',
    })).toThrow('No remote structure sources are configured.');
  });

  it('rejects absolute configured source paths', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'https://example.test/pose.pdb',
    })).toThrow('Remote source path must be relative.');
  });

  it('rejects root-relative configured source paths', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: '/pose.pdb',
    })).toThrow('Remote source path must be relative.');
  });

  it('rejects protocol-relative configured source paths', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: '//example.test/pose.pdb',
    })).toThrow('Remote source path must be relative.');
  });

  it('rejects encoded absolute and backslash configured source paths', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: '%2fadmin.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses\\ligand.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses%5cligand.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'pose.pdb?x=%ZZ',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'pose.pdb#%ZZ',
    })).toThrow('Remote source path must be relative.');
  });

  it('rejects configured source paths with parent-directory traversal', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: '../pose.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses/../../pose.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses/%2e%2e/admin.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses/%2e%2e%2fadmin.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: '%2e%2e%2fadmin.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses/..\\admin.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: '..\\admin.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses/%2e%2e%5cadmin.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: 'poses/%2e%2e%2fadmin.pdb%ZZ',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: '%252e%252e%252fadmin.pdb',
    })).toThrow('Remote source path must be relative.');
    expect(() => resolveConfiguredSourceRequest(remoteLoading, {
      sourceId: 'app-structures',
      path: '%25252e%25252e%25252fadmin.pdb',
    })).toThrow('Remote source path must be relative.');
  });

  it('rejects arbitrary URL requests when disabled', () => {
    const remoteLoading = normalizeRemoteLoadingConfig();

    expect(() => resolveArbitraryUrlRequest(remoteLoading, {
      name: 'remote',
      format: 'pdb',
      url: 'https://example.test/remote.pdb',
    })).toThrow('Arbitrary URL loading is disabled.');
  });

  it('builds arbitrary URL requests when enabled', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({ allowArbitraryUrls: true });

    expect(resolveArbitraryUrlRequest(remoteLoading, {
      name: 'remote',
      format: 'PDB',
      url: 'https://example.test/remote.pdb',
    }).request).toEqual({
      kind: 'url',
      name: 'remote',
      format: 'pdb',
      url: 'https://example.test/remote.pdb',
    });
  });

  it('resolves initialization URL entries', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({ allowArbitraryUrls: true });

    expect(resolveInitializationStructureRequest({
      name: 'remote',
      format: 'pdb',
      url: 'https://example.test/remote.pdb',
    }, 'fallback', remoteLoading).request).toEqual({
      kind: 'url',
      name: 'remote',
      format: 'pdb',
      url: 'https://example.test/remote.pdb',
    });
  });

  it('rejects initialization URL entries when arbitrary URLs are disabled', () => {
    const remoteLoading = normalizeRemoteLoadingConfig();

    expect(() => resolveInitializationStructureRequest({
      name: 'remote',
      format: 'pdb',
      url: 'https://example.test/remote.pdb',
    }, 'fallback', remoteLoading)).toThrow('Arbitrary URL loading is disabled.');
  });

  it('does not use a blank fallback name for initialization URL entries', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({ allowArbitraryUrls: true });

    expect(resolveInitializationStructureRequest({
      format: 'pdb',
      url: 'https://example.test/remote.pdb',
    }, '   ', remoteLoading).request).toEqual({
      kind: 'url',
      name: 'remote',
      format: 'pdb',
      url: 'https://example.test/remote.pdb',
    });
  });

  it('resolves initialization configured source entries', () => {
    const remoteLoading = normalizeRemoteLoadingConfig({
      sources: [{ name: 'App Structures', baseUrl: '/api/c3d/structures/' }],
    });

    expect(resolveInitializationStructureRequest({
      source: 'App Structures',
      path: 'remote.cif',
    }, 'fallback', remoteLoading).request).toEqual({
      kind: 'url',
      name: 'remote',
      format: 'cif',
      url: '/api/c3d/structures/remote.cif',
    });
  });

  it('keeps inline initialization entries on the inline loader path', () => {
    const remoteLoading = normalizeRemoteLoadingConfig();

    expect(resolveInitializationStructureRequest({
      name: 'inline',
      format: 'pdb',
      data: 'ATOM',
    }, 'fallback', remoteLoading).request).toEqual({
      kind: 'inline',
      name: 'inline',
      format: 'pdb',
      data: 'ATOM',
    });
  });
});
