import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockViewer } from './helpers/mock-3dmol.js';
import {
  addObject,
  addSurfaceEntry,
  getState,
} from '../src/state.js';
import { getViewer, scheduleRender } from '../src/viewer.js';
import {
  buildSurfaceStyle,
  createSurface,
  findSingleSurfaceParent,
  normalizeSurfaceType,
  removeSurface,
  removeSurfacesForParent,
  renameSurface,
  setSurfaceColor,
  setSurfaceMode,
  setSurfaceOpacity,
  setSurfaceParentVisibility,
  setSurfaceVisibility,
} from '../src/surfaces.js';

vi.mock('../src/viewer.js', () => ({
  getViewer: vi.fn(),
  scheduleRender: vi.fn(),
}));

let mockViewer;

function resetState() {
  const state = getState();
  state.objects.clear();
  state.selections.clear();
  state.surfaces.clear();
  state.entryTree.length = 0;
  state._listeners.length = 0;
  state.selectionMode = 'atoms';
}

function deferredSurface(surfid) {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (surfid !== undefined) {
    promise.surfid = surfid;
  }
  return { promise, resolve, reject };
}

describe('surface service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    mockViewer = createMockViewer();
    getViewer.mockReturnValue(mockViewer);
  });

  it('normalizes supported surface types and rejects unknown values', () => {
    expect(normalizeSurfaceType()).toEqual({ type: 'molecular', surfaceType: 'MS' });
    expect(normalizeSurfaceType('molecular')).toEqual({ type: 'molecular', surfaceType: 'MS' });
    expect(normalizeSurfaceType('sasa')).toEqual({ type: 'sasa', surfaceType: 'SAS' });
    expect(() => normalizeSurfaceType('mesh')).toThrow('Unknown surface type "mesh"');
  });

  it('builds visible and effectively hidden material styles', () => {
    expect(buildSurfaceStyle({
      color: '#FF00AA',
      opacity: 0.4,
      visible: true,
      parentVisible: true,
      mode: 'wireframe',
    })).toEqual({
      color: '#FF00AA',
      opacity: 0.4,
      wireframe: true,
    });

    expect(buildSurfaceStyle({
      color: '#00FFAA',
      opacity: 0.6,
      visible: true,
      parentVisible: false,
      mode: 'surface',
    })).toEqual({
      color: '#00FFAA',
      opacity: 0,
      wireframe: false,
    });

    expect(buildSurfaceStyle({
      color: '#00FFAA',
      opacity: 0.6,
      visible: false,
      parentVisible: true,
      mode: 'surface',
    })).toEqual({
      color: '#00FFAA',
      opacity: 0,
      wireframe: false,
    });
  });

  it('creates a pending state entry and finalizes the handle from the addSurface promise', async () => {
    const pending = deferredSurface(12);
    mockViewer.addSurface.mockReturnValue(pending.promise);

    const createPromise = createSurface({
      name: 'ligand_surface',
      selection: { resn: 'LIG' },
      color: '#AA00FF',
      opacity: 0.5,
    });

    expect(getState().surfaces.get('ligand_surface')).toMatchObject({
      name: 'ligand_surface',
      selection: { resn: 'LIG' },
      type: 'molecular',
      surfaceType: 'MS',
      handle: null,
      pending: true,
      visible: true,
      parentVisible: true,
      mode: 'surface',
      opacity: 0.5,
      color: '#AA00FF',
    });
    expect(mockViewer.addSurface).toHaveBeenCalledWith(
      'MS',
      { color: '#AA00FF', opacity: 0.5, wireframe: false },
      { resn: 'LIG' },
      { resn: 'LIG' },
    );

    pending.resolve({ surfid: 99 });
    const surface = await createPromise;

    expect(surface).toMatchObject({ handle: 12, pending: false });
    expect(getState().surfaces.get('ligand_surface').handle).toBe(12);
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledWith(
      12,
      { color: '#AA00FF', opacity: 0.5, wireframe: false },
    );
    expect(scheduleRender).toHaveBeenCalled();
  });

  it('can resolve a surface handle from the resolved object or resolved value', async () => {
    mockViewer.addSurface.mockResolvedValueOnce({ surfid: 22 });
    await expect(createSurface({ name: 'from_object', selection: {} })).resolves.toMatchObject({
      handle: 22,
    });

    mockViewer.addSurface.mockResolvedValueOnce(33);
    await expect(createSurface({ name: 'from_value', selection: {} })).resolves.toMatchObject({
      handle: 33,
    });
  });

  it('removes the previous viewer handle before replacing a same-name surface', async () => {
    addSurfaceEntry({
      name: 'surf',
      selection: { chain: 'A' },
      type: 'molecular',
      surfaceType: 'MS',
      handle: 7,
      pending: false,
    });
    mockViewer.addSurface.mockResolvedValueOnce({ surfid: 8 });

    await createSurface({ name: 'surf', selection: { chain: 'B' }, type: 'sasa' });

    expect(mockViewer.removeSurface).toHaveBeenCalledWith(7);
    expect(mockViewer.addSurface).toHaveBeenCalledWith(
      'SAS',
      { color: '#FFFFFF', opacity: 0.75, wireframe: false },
      { chain: 'B' },
      { chain: 'B' },
    );
    expect(getState().surfaces.get('surf')).toMatchObject({
      selection: { chain: 'B' },
      surfaceType: 'SAS',
      handle: 8,
      pending: false,
    });
  });

  it('keeps an existing same-name surface intact when replacement type is invalid', async () => {
    addSurfaceEntry({
      name: 'surf',
      selection: { chain: 'A' },
      type: 'molecular',
      surfaceType: 'MS',
      handle: 7,
      pending: false,
      color: '#123456',
      opacity: 0.4,
    });

    await expect(
      createSurface({ name: 'surf', selection: { chain: 'B' }, type: 'mesh' }),
    ).rejects.toThrow('Unknown surface type "mesh"');

    expect(mockViewer.removeSurface).not.toHaveBeenCalled();
    expect(mockViewer.addSurface).not.toHaveBeenCalled();
    expect(getState().surfaces.get('surf')).toMatchObject({
      name: 'surf',
      selection: { chain: 'A' },
      type: 'molecular',
      surfaceType: 'MS',
      handle: 7,
      pending: false,
      color: '#123456',
      opacity: 0.4,
    });
  });

  it('removes pending state and propagates addSurface rejection', async () => {
    const error = new Error('surface failed');
    const pending = deferredSurface(44);
    mockViewer.addSurface.mockReturnValue(pending.promise);

    const createPromise = createSurface({ name: 'failed_surface', selection: { chain: 'A' } });
    expect(getState().surfaces.has('failed_surface')).toBe(true);

    pending.reject(error);
    await expect(createPromise).rejects.toThrow('surface failed');

    expect(getState().surfaces.has('failed_surface')).toBe(false);
    expect(mockViewer.removeSurface).toHaveBeenCalledWith(44);
  });

  it('material setters preserve combined material state and update resolved surfaces', () => {
    addSurfaceEntry({
      name: 'surf',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 5,
      pending: false,
      color: '#111111',
      opacity: 0.8,
      mode: 'surface',
    });

    setSurfaceVisibility('surf', false);
    setSurfaceMode('surf', 'wireframe');
    setSurfaceOpacity('surf', 0.35);
    setSurfaceColor('surf', '#22AAFF');
    setSurfaceVisibility('surf', true);

    expect(getState().surfaces.get('surf')).toMatchObject({
      visible: true,
      mode: 'wireframe',
      opacity: 0.35,
      color: '#22AAFF',
    });
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenLastCalledWith(
      5,
      { color: '#22AAFF', opacity: 0.35, wireframe: true },
    );
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledWith(
      5,
      { color: '#111111', opacity: 0, wireframe: false },
    );
    expect(scheduleRender).toHaveBeenCalledTimes(5);
    expect(() => setSurfaceMode('surf', 'points')).toThrow('Unknown surface mode "points"');
  });

  it('keeps pending material updates in state and applies them after handle resolution', async () => {
    const pending = deferredSurface();
    mockViewer.addSurface.mockReturnValue(pending.promise);

    const createPromise = createSurface({
      name: 'pending_surface',
      selection: { chain: 'A' },
      color: '#FFFFFF',
      opacity: 0.75,
    });

    setSurfaceMode('pending_surface', 'wireframe');
    setSurfaceOpacity('pending_surface', 0.2);
    setSurfaceColor('pending_surface', '#00AA00');
    setSurfaceVisibility('pending_surface', false);

    expect(mockViewer.setSurfaceMaterialStyle).not.toHaveBeenCalled();

    pending.resolve({ surfid: 21 });
    await createPromise;

    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledTimes(1);
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledWith(
      21,
      { color: '#00AA00', opacity: 0, wireframe: true },
    );
  });

  it('updates parent visibility for child surfaces and reapplies material styles', () => {
    addSurfaceEntry({
      name: 'child_a',
      parentName: 'mol',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 1,
      pending: false,
      opacity: 0.5,
    });
    addSurfaceEntry({
      name: 'child_b',
      parentName: 'mol',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 2,
      pending: false,
      mode: 'wireframe',
      opacity: 0.6,
    });
    addSurfaceEntry({
      name: 'other',
      parentName: 'other_mol',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 3,
      pending: false,
    });

    setSurfaceParentVisibility('mol', false);

    expect(getState().surfaces.get('child_a').parentVisible).toBe(false);
    expect(getState().surfaces.get('child_b').parentVisible).toBe(false);
    expect(getState().surfaces.get('other').parentVisible).toBe(true);
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledWith(
      1,
      { color: '#FFFFFF', opacity: 0, wireframe: false },
    );
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledWith(
      2,
      { color: '#FFFFFF', opacity: 0, wireframe: true },
    );
  });

  it('removes a surface viewer handle and state entry', () => {
    addSurfaceEntry({
      name: 'surf',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 6,
      pending: false,
    });

    expect(removeSurface('surf')).toMatchObject({ name: 'surf', handle: 6 });

    expect(mockViewer.removeSurface).toHaveBeenCalledWith(6);
    expect(getState().surfaces.has('surf')).toBe(false);
    expect(scheduleRender).toHaveBeenCalled();
  });

  it('removes all child surface handles and entries for a parent', () => {
    addSurfaceEntry({
      name: 'child_a',
      parentName: 'mol',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 10,
      pending: false,
    });
    addSurfaceEntry({
      name: 'child_b',
      parentName: 'mol',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 11,
      pending: false,
    });
    addSurfaceEntry({
      name: 'other',
      parentName: 'other_mol',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 12,
      pending: false,
    });

    const removed = removeSurfacesForParent('mol');

    expect(removed.map(surface => surface.name)).toEqual(['child_a', 'child_b']);
    expect(mockViewer.removeSurface).toHaveBeenCalledWith(10);
    expect(mockViewer.removeSurface).toHaveBeenCalledWith(11);
    expect(mockViewer.removeSurface).not.toHaveBeenCalledWith(12);
    expect(getState().surfaces.has('child_a')).toBe(false);
    expect(getState().surfaces.has('child_b')).toBe(false);
    expect(getState().surfaces.has('other')).toBe(true);
  });

  it('renames a surface state entry', () => {
    addSurfaceEntry({
      name: 'old',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      handle: 1,
      pending: false,
    });

    expect(renameSurface('old', 'new')).toBe(true);
    expect(getState().surfaces.has('old')).toBe(false);
    expect(getState().surfaces.get('new')).toMatchObject({ name: 'new', handle: 1 });
  });

  it('finalizes a pending surface under its renamed state entry', async () => {
    const pending = deferredSurface();
    mockViewer.addSurface.mockReturnValue(pending.promise);

    const createPromise = createSurface({
      name: 'old_pending',
      selection: { chain: 'A' },
      color: '#00AAFF',
    });

    expect(renameSurface('old_pending', 'new_pending')).toBe(true);
    pending.resolve({ surfid: 41 });
    const surface = await createPromise;

    expect(surface).toMatchObject({
      name: 'new_pending',
      handle: 41,
      pending: false,
    });
    expect(getState().surfaces.has('old_pending')).toBe(false);
    expect(getState().surfaces.get('new_pending')).toMatchObject({
      name: 'new_pending',
      handle: 41,
      pending: false,
    });
    expect(mockViewer.removeSurface).not.toHaveBeenCalled();
  });

  it('finds a single surface parent and returns null for multiple or no matches', () => {
    const modelA = { id: 'A' };
    const modelB = { id: 'B' };
    const modelC = { id: 'C' };
    addObject('mol_a', modelA, 0);
    addObject('mol_b', modelB, 1);
    addObject('mol_c', modelC, 2);

    mockViewer.selectedAtoms.mockImplementation((spec) => (
      spec.model === modelA ? [{ serial: 1 }] : []
    ));
    expect(findSingleSurfaceParent({ chain: 'A' })).toBe('mol_a');
    expect(mockViewer.selectedAtoms).toHaveBeenCalledWith({ chain: 'A', model: modelA });
    expect(mockViewer.selectedAtoms).toHaveBeenCalledWith({ chain: 'A', model: modelB });

    mockViewer.selectedAtoms.mockClear();
    mockViewer.selectedAtoms.mockImplementation(() => [{ serial: 1 }]);
    expect(findSingleSurfaceParent({ chain: 'A' })).toBeNull();
    expect(mockViewer.selectedAtoms).toHaveBeenCalledWith({ chain: 'A', model: modelC });

    mockViewer.selectedAtoms.mockClear();
    mockViewer.selectedAtoms.mockImplementation(() => []);
    expect(findSingleSurfaceParent({ chain: 'A' })).toBeNull();
  });
});
