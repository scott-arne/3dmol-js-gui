import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getStructureFormatFromFilename,
  loadStructure,
  loadStructureFile,
  normalizeStructureRequest,
} from '../src/loading/structure-loader.js';

function makeDeps(overrides = {}) {
  return {
    addObject: vi.fn((name) => name),
    fetchImpl: vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'ATOM      1  CA  ALA A   1',
    })),
    fetchPDB: vi.fn(async () => ({ getID: () => 7 })),
    loadModelData: vi.fn(() => ({ getID: () => 3 })),
    ...overrides,
  };
}

describe('structure-loader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('derives supported formats from filenames', () => {
    expect(getStructureFormatFromFilename('protein.pdb')).toBe('pdb');
    expect(getStructureFormatFromFilename('ligand.SDF')).toBe('sdf');
    expect(getStructureFormatFromFilename('map.cube')).toBe('cube');
    expect(getStructureFormatFromFilename('structure.mmcif')).toBe('cif');
  });

  it('rejects unsupported file extensions', () => {
    expect(() => getStructureFormatFromFilename('notes.txt')).toThrow('Unsupported structure format "txt"');
  });

  it('normalizes inline data requests', () => {
    expect(normalizeStructureRequest({
      kind: 'inline',
      name: 'protein',
      format: 'PDB',
      data: 'ATOM',
    })).toEqual({
      kind: 'inline',
      name: 'protein',
      format: 'pdb',
      data: 'ATOM',
    });
  });

  it('loads inline data and registers the object', async () => {
    const deps = makeDeps();
    const result = await loadStructure({
      kind: 'inline',
      name: 'protein',
      format: 'pdb',
      data: 'ATOM      1  CA  ALA A   1',
    }, { deps });

    expect(result).toMatchObject({
      ok: true,
      code: 'loaded',
      name: 'protein',
      message: 'Loaded "protein"',
    });
    expect(deps.loadModelData).toHaveBeenCalledWith(
      'ATOM      1  CA  ALA A   1',
      'pdb',
      {},
    );
    expect(deps.addObject).toHaveBeenCalledWith('protein', expect.anything(), 3);
  });

  it('returns the actual unique object name from state registration', async () => {
    const deps = makeDeps({
      addObject: vi.fn(() => 'protein_2'),
    });

    const result = await loadStructure({
      kind: 'inline',
      name: 'protein',
      format: 'pdb',
      data: 'ATOM',
    }, { deps });

    expect(result).toMatchObject({
      ok: true,
      name: 'protein_2',
      message: 'Loaded "protein_2"',
    });
  });

  it('uses load options for initialization-style inline loads', async () => {
    const deps = makeDeps();
    await loadStructure({
      kind: 'inline',
      name: 'protein',
      format: 'pdb',
      data: 'ATOM',
    }, {
      deps,
      loadOptions: { applyDefaultStyle: false, zoom: false, render: false },
    });

    expect(deps.loadModelData).toHaveBeenCalledWith(
      'ATOM',
      'pdb',
      { applyDefaultStyle: false, zoom: false, render: false },
    );
  });

  it('loads a public PDB and keeps the per-ID duplicate lock', async () => {
    let resolveFirst;
    const deps = makeDeps({
      fetchPDB: vi.fn(() => new Promise((resolve) => { resolveFirst = resolve; })),
    });

    const first = loadStructure({ kind: 'pdb', pdbId: '1ubq' }, { deps });
    const second = await loadStructure({ kind: 'pdb', pdbId: '1UBQ' }, { deps });

    expect(second).toMatchObject({
      ok: false,
      code: 'pdb_fetch_in_progress',
      message: 'PDB 1UBQ is already being fetched. Please wait.',
    });

    resolveFirst({ getID: () => 4 });
    const firstResult = await first;
    expect(firstResult).toMatchObject({ ok: true, name: '1UBQ' });
    expect(deps.fetchPDB).toHaveBeenCalledWith('1UBQ');
    expect(deps.addObject).toHaveBeenCalledWith('1UBQ', expect.anything(), 4);
  });

  it('allows different PDB IDs to load concurrently', async () => {
    let resolveFirst;
    const deps = makeDeps({
      fetchPDB: vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
        .mockResolvedValueOnce({ getID: () => 8 }),
    });

    const first = loadStructure({ kind: 'pdb', pdbId: '1UBQ' }, { deps });
    const second = await loadStructure({ kind: 'pdb', pdbId: '2ABC' }, { deps });

    expect(second).toMatchObject({ ok: true, name: '2ABC' });
    resolveFirst({ getID: () => 7 });
    await first;
    expect(deps.fetchPDB).toHaveBeenCalledWith('1UBQ');
    expect(deps.fetchPDB).toHaveBeenCalledWith('2ABC');
  });

  it('returns structured failures for invalid inline data', async () => {
    const result = await loadStructure({
      kind: 'inline',
      name: 'empty',
      format: 'pdb',
      data: '',
    }, { deps: makeDeps() });

    expect(result).toMatchObject({
      ok: false,
      code: 'empty_data',
      message: 'Structure data is empty.',
    });
  });

  it('loads URL-backed structure data', async () => {
    const deps = makeDeps();
    const result = await loadStructure({
      kind: 'url',
      name: 'remote',
      format: 'pdb',
      url: 'https://example.test/remote.pdb',
    }, { deps });

    expect(result).toMatchObject({ ok: true, name: 'remote' });
    expect(deps.fetchImpl).toHaveBeenCalledWith('https://example.test/remote.pdb');
    expect(deps.loadModelData).toHaveBeenCalledWith(
      'ATOM      1  CA  ALA A   1',
      'pdb',
      {},
    );
  });

  it('rejects URL requests with unsupported protocols', async () => {
    const result = await loadStructure({
      kind: 'url',
      name: 'bad',
      format: 'pdb',
      url: 'javascript:alert(1)',
    }, { deps: makeDeps() });

    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_url',
      message: 'Structure URL must use http or https.',
    });
  });

  it('loads a local File object through FileReader', async () => {
    const deps = makeDeps();
    const file = new File(['ATOM      1  CA  ALA A   1'], 'protein.pdb', { type: 'text/plain' });

    const result = await loadStructureFile(file, { deps });

    expect(result).toMatchObject({ ok: true, name: 'protein' });
    expect(deps.loadModelData).toHaveBeenCalledWith(
      'ATOM      1  CA  ALA A   1',
      'pdb',
      {},
    );
  });

  it('returns structured failures for missing files', async () => {
    const result = await loadStructureFile(null, { deps: makeDeps() });

    expect(result).toMatchObject({
      ok: false,
      code: 'missing_file',
      message: 'Choose a structure file to load.',
    });
  });
});
