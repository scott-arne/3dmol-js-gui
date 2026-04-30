import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getState, addObject, removeObject, addSelection, removeSelection,
  renameObject, renameSelection, toggleObjectVisibility,
  toggleSelectionVisibility, pruneSelections,
  setSelectionMode, onStateChange, notifyStateChange,
  addSurfaceEntry, removeSurfaceEntry, renameSurfaceEntry,
  toggleSurfaceVisibility, updateSurfaceEntry, setSurfaceHandle,
  getNextSurfaceName, getChildSurfaceNames,
  addMapEntry, removeMapEntry, renameMapEntry, updateMapEntry,
  toggleMapVisibility, addIsosurfaceEntry, removeIsosurfaceEntry,
  renameIsosurfaceEntry, updateIsosurfaceEntry, toggleIsosurfaceVisibility,
  getChildIsosurfaceNames, getNextIsosurfaceName,
} from '../src/state.js';

function resetState() {
  const state = getState();
  state.objects.clear();
  state.selections.clear();
  state.surfaces.clear();
  state.maps?.clear();
  state.isosurfaces?.clear();
  state.entryTree.length = 0;
  state._listeners.length = 0;
  state.selectionMode = 'atoms';
}

describe('renameObject', () => {
  beforeEach(resetState);

  it('throws when target name already exists', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    expect(() => renameObject('A', 'B')).toThrow(/already exists/);
  });

  it('succeeds when target name is unused', () => {
    addObject('A', {}, 0);
    expect(renameObject('A', 'C')).toBe(true);
    expect(getState().objects.has('C')).toBe(true);
    expect(getState().objects.has('A')).toBe(false);
  });
});

describe('renameSelection', () => {
  beforeEach(resetState);

  it('throws when target name already exists', () => {
    addSelection('sel1', 'protein', {}, 100);
    addSelection('sel2', 'ligand', {}, 10);
    expect(() => renameSelection('sel1', 'sel2')).toThrow(/already exists/);
  });

  it('succeeds when target name is unused', () => {
    addSelection('sel1', 'protein', {}, 100);
    expect(renameSelection('sel1', 'sel3')).toBe(true);
    expect(getState().selections.has('sel3')).toBe(true);
    expect(getState().selections.has('sel1')).toBe(false);
  });
});

describe('addObject', () => {
  beforeEach(resetState);

  it('adds an object to state', () => {
    const name = addObject('test', {}, 0);
    expect(name).toBe('test');
    expect(getState().objects.has('test')).toBe(true);
  });

  it('appends suffix for duplicate names', () => {
    addObject('A', {}, 0);
    const name2 = addObject('A', {}, 1);
    expect(name2).toBe('A_2');
    expect(getState().objects.size).toBe(2);
  });

  it('increments suffix until unique', () => {
    addObject('A', {}, 0);
    addObject('A', {}, 1); // A_2
    const name3 = addObject('A', {}, 2);
    expect(name3).toBe('A_3');
  });

  it('sets default representations to line', () => {
    addObject('X', {}, 0);
    const obj = getState().objects.get('X');
    expect(obj.representations).toEqual(new Set(['line']));
  });

  it('sets visible to true by default', () => {
    addObject('X', {}, 0);
    expect(getState().objects.get('X').visible).toBe(true);
  });
});

describe('removeObject', () => {
  beforeEach(resetState);

  it('removes the object from state', () => {
    addObject('A', {}, 0);
    removeObject('A');
    expect(getState().objects.has('A')).toBe(false);
  });

  it('does not throw for non-existent name', () => {
    expect(() => removeObject('nonexistent')).not.toThrow();
  });
});

describe('toggleObjectVisibility', () => {
  beforeEach(resetState);

  it('toggles visible flag', () => {
    addObject('A', {}, 0);
    toggleObjectVisibility('A');
    expect(getState().objects.get('A').visible).toBe(false);
    toggleObjectVisibility('A');
    expect(getState().objects.get('A').visible).toBe(true);
  });

  it('returns undefined for non-existent object', () => {
    expect(toggleObjectVisibility('nope')).toBeUndefined();
  });
});

describe('addSelection', () => {
  beforeEach(resetState);

  it('adds a selection to state', () => {
    addSelection('sele', 'protein', { resn: ['ALA'] }, 10);
    const sel = getState().selections.get('sele');
    expect(sel.expression).toBe('protein');
    expect(sel.atomCount).toBe(10);
    expect(sel.visible).toBe(true);
  });

  it('overwrites existing selection with same name', () => {
    addSelection('sele', 'first', {}, 5);
    addSelection('sele', 'second', {}, 10);
    expect(getState().selections.get('sele').expression).toBe('second');
    expect(getState().selections.size).toBe(1);
  });
});

describe('removeSelection', () => {
  beforeEach(resetState);

  it('removes the selection from state', () => {
    addSelection('sele', 'test', {}, 5);
    removeSelection('sele');
    expect(getState().selections.has('sele')).toBe(false);
  });
});

describe('toggleSelectionVisibility', () => {
  beforeEach(resetState);

  it('toggles visible flag', () => {
    addSelection('sele', 'test', {}, 5);
    toggleSelectionVisibility('sele');
    expect(getState().selections.get('sele').visible).toBe(false);
  });

  it('returns undefined for non-existent selection', () => {
    expect(toggleSelectionVisibility('nope')).toBeUndefined();
  });
});

describe('surface entries', () => {
  beforeEach(resetState);

  it('adds a top-level surface entry', () => {
    addSurfaceEntry({
      name: 'ligand_surface',
      selection: { resn: ['LIG'] },
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
    });

    const surface = getState().surfaces.get('ligand_surface');
    expect(surface).toMatchObject({
      name: 'ligand_surface',
      selection: { resn: ['LIG'] },
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
      handle: null,
      pending: true,
      visible: true,
      parentVisible: true,
      mode: 'surface',
      opacity: 0.75,
      color: '#FFFFFF',
    });
    expect(getState().entryTree).toEqual([{ type: 'surface', name: 'ligand_surface' }]);
  });

  it('nests a surface under its parent molecule', () => {
    const model = {};
    addObject('1UBQ', model, 0);
    addSurfaceEntry({
      name: '1UBQ_surface',
      selection: { model },
      type: 'molecular',
      surfaceType: 'MS',
      parentName: '1UBQ',
    });

    expect(getState().entryTree[0]).toMatchObject({
      type: 'object',
      name: '1UBQ',
      collapsed: false,
      children: [{ type: 'surface', name: '1UBQ_surface' }],
    });
  });

  it('replaces an existing surface with the same name without duplicating tree nodes', () => {
    addSurfaceEntry({
      name: 'surf',
      selection: { resn: ['LIG'] },
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
      handle: 3,
      pending: false,
    });
    addSurfaceEntry({
      name: 'surf',
      selection: { chain: 'A' },
      type: 'sasa',
      surfaceType: 'SAS',
      parentName: null,
    });

    expect(getState().surfaces.get('surf')).toMatchObject({
      selection: { chain: 'A' },
      type: 'sasa',
      surfaceType: 'SAS',
      handle: null,
      pending: true,
    });
    expect(getState().entryTree.filter(n => n.type === 'surface' && n.name === 'surf')).toHaveLength(1);
  });

  it('replacing a surface does not remove a selection with the same name', () => {
    addSelection('same', 'test', {}, 5);
    addSurfaceEntry({ name: 'same', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    addSurfaceEntry({ name: 'same', selection: { chain: 'A' }, type: 'molecular', surfaceType: 'MS', parentName: null });

    expect(getState().entryTree).toEqual([
      { type: 'surface', name: 'same' },
      { type: 'selection', name: 'same' },
    ]);
    expect(getState().selections.has('same')).toBe(true);
    expect(getState().surfaces.get('same').selection).toEqual({ chain: 'A' });
  });

  it('renames a surface map entry and tree node', () => {
    addSurfaceEntry({
      name: 'old_surface',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
    });

    expect(renameSurfaceEntry('old_surface', 'new_surface')).toBe(true);
    expect(getState().surfaces.has('old_surface')).toBe(false);
    expect(getState().surfaces.has('new_surface')).toBe(true);
    expect(getState().entryTree[0]).toEqual({ type: 'surface', name: 'new_surface' });
  });

  it('renames only the surface tree node when another entry has the same name', () => {
    addObject('same', {}, 0);
    addSelection('same', 'test', {}, 5);
    addSurfaceEntry({ name: 'same', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });

    expect(renameSurfaceEntry('same', 'surface_only')).toBe(true);

    expect(getState().entryTree).toEqual([
      { type: 'object', name: 'same' },
      { type: 'surface', name: 'surface_only' },
      { type: 'selection', name: 'same' },
    ]);
    expect(getState().objects.has('same')).toBe(true);
    expect(getState().selections.has('same')).toBe(true);
    expect(getState().surfaces.has('surface_only')).toBe(true);
  });

  it('rejects duplicate surface rename targets', () => {
    addSurfaceEntry({ name: 'a', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    addSurfaceEntry({ name: 'b', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });

    expect(() => renameSurfaceEntry('a', 'b')).toThrow(/surface named "b" already exists/);
  });

  it('toggles surface visibility independently', () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    expect(toggleSurfaceVisibility('surf').visible).toBe(false);
    expect(toggleSurfaceVisibility('surf').visible).toBe(true);
  });

  it('removes a surface map entry and tree node', () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });

    expect(removeSurfaceEntry('surf')).toMatchObject({ name: 'surf' });
    expect(getState().surfaces.has('surf')).toBe(false);
    expect(getState().entryTree).toEqual([]);
  });

  it('removes only the surface tree node when an object has the same name', () => {
    addObject('same', {}, 0);
    addSurfaceEntry({ name: 'same', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });

    removeSurfaceEntry('same');

    expect(getState().entryTree).toEqual([{ type: 'object', name: 'same' }]);
    expect(getState().objects.has('same')).toBe(true);
    expect(getState().surfaces.has('same')).toBe(false);
  });

  it('removes only the surface tree node when a selection has the same name', () => {
    addSelection('same', 'test', {}, 5);
    addSurfaceEntry({ name: 'same', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });

    removeSurfaceEntry('same');

    expect(getState().entryTree).toEqual([{ type: 'selection', name: 'same' }]);
    expect(getState().selections.has('same')).toBe(true);
    expect(getState().surfaces.has('same')).toBe(false);
  });

  it('cleans up an empty parent object when removing its only surface child', () => {
    addObject('parent', {}, 0);
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: 'parent' });

    removeSurfaceEntry('surf');

    expect(getState().entryTree[0]).toEqual({ type: 'object', name: 'parent' });
  });

  it('updates handle and pending state when a surface resolves', () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    setSurfaceHandle('surf', 42);
    expect(getState().surfaces.get('surf')).toMatchObject({ handle: 42, pending: false });
  });

  it('updates surface material metadata', () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    updateSurfaceEntry('surf', { opacity: 0.5, color: '#0000FF', mode: 'wireframe' });
    expect(getState().surfaces.get('surf')).toMatchObject({
      opacity: 0.5,
      color: '#0000FF',
      mode: 'wireframe',
    });
  });

  it('reparents a top-level surface when parentName changes to an object', () => {
    addObject('parent', {}, 0);
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });

    updateSurfaceEntry('surf', { parentName: 'parent' });

    expect(getState().entryTree).toEqual([{
      type: 'object',
      name: 'parent',
      collapsed: false,
      children: [{ type: 'surface', name: 'surf' }],
    }]);
  });

  it('reparents a surface between object parents when parentName changes', () => {
    addObject('first', {}, 0);
    addObject('second', {}, 1);
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: 'first' });

    updateSurfaceEntry('surf', { parentName: 'second' });

    expect(getState().entryTree).toEqual([
      { type: 'object', name: 'first' },
      {
        type: 'object',
        name: 'second',
        collapsed: false,
        children: [{ type: 'surface', name: 'surf' }],
      },
    ]);
  });

  it('finds the lowest generated surface name', () => {
    addSurfaceEntry({ name: 'surface_1', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    addSurfaceEntry({ name: 'surface_3', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    expect(getNextSurfaceName()).toBe('surface_2');
  });

  it('finds surface names parented under a molecule', () => {
    addSurfaceEntry({ name: 'parent_surface_1', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: 'parent' });
    addSurfaceEntry({ name: 'other_surface', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: 'other' });
    addSurfaceEntry({ name: 'top_surface', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    addSurfaceEntry({ name: 'parent_surface_2', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: 'parent' });

    expect(getChildSurfaceNames('parent')).toEqual(['parent_surface_1', 'parent_surface_2']);
  });

  it('removing a parent object removes child surface entries from state', () => {
    addObject('parent', {}, 0);
    addSurfaceEntry({
      name: 'surface_1',
      selection: { model: {} },
      type: 'molecular',
      surfaceType: 'MS',
      parentName: 'parent',
    });

    const removed = removeObject('parent');
    expect(removed.surfaces).toEqual(['surface_1']);
    expect(getState().surfaces.has('surface_1')).toBe(false);
  });

  it('removing an object removes stale top-level surface nodes parented to it', () => {
    addObject('parent', {}, 0);
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    getState().surfaces.get('surf').parentName = 'parent';

    const removed = removeObject('parent');

    expect(removed.surfaces).toEqual(['surf']);
    expect(getState().surfaces.has('surf')).toBe(false);
    expect(getState().entryTree).toEqual([]);
  });
});

describe('surface entry notifications', () => {
  beforeEach(resetState);

  async function expectMutationNotifies(mutate) {
    const listener = vi.fn();
    onStateChange(listener);

    mutate();

    expect(listener).toHaveBeenCalledTimes(0);
    await new Promise(r => queueMicrotask(r));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(getState());
  }

  it('notifies when adding a surface', async () => {
    await expectMutationNotifies(() => {
      addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    });
  });

  it('notifies when removing a surface', async () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    await new Promise(r => queueMicrotask(r));
    getState()._listeners.length = 0;

    await expectMutationNotifies(() => {
      removeSurfaceEntry('surf');
    });
  });

  it('notifies when renaming a surface', async () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    await new Promise(r => queueMicrotask(r));
    getState()._listeners.length = 0;

    await expectMutationNotifies(() => {
      renameSurfaceEntry('surf', 'renamed');
    });
  });

  it('notifies when updating a surface', async () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    await new Promise(r => queueMicrotask(r));
    getState()._listeners.length = 0;

    await expectMutationNotifies(() => {
      updateSurfaceEntry('surf', { opacity: 0.4 });
    });
  });

  it('notifies when setting a surface handle', async () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    await new Promise(r => queueMicrotask(r));
    getState()._listeners.length = 0;

    await expectMutationNotifies(() => {
      setSurfaceHandle('surf', 7);
    });
  });

  it('notifies when toggling surface visibility', async () => {
    addSurfaceEntry({ name: 'surf', selection: {}, type: 'molecular', surfaceType: 'MS', parentName: null });
    await new Promise(r => queueMicrotask(r));
    getState()._listeners.length = 0;

    await expectMutationNotifies(() => {
      toggleSurfaceVisibility('surf');
    });
  });
});

describe('map and isosurface entries', () => {
  beforeEach(resetState);

  it('adds maps before selections and uniquifies duplicate map names', () => {
    addSelection('sele1', 'protein', {}, 5);

    const first = addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'map',
      volumeData: { size: { x: 1, y: 1, z: 1 } },
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    });
    const second = addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: { size: { x: 2, y: 2, z: 2 } },
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } },
    });

    expect(first.name).toBe('density');
    expect(second.name).toBe('density_2');
    expect(getState().maps.get('density')).toMatchObject({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'map',
      visible: true,
      color: '#38BDF8',
      opacity: 1,
    });
    expect(getState().entryTree).toEqual([
      { type: 'map', name: 'density', collapsed: false, children: [] },
      { type: 'map', name: 'density_2', collapsed: false, children: [] },
      { type: 'selection', name: 'sele1' },
    ]);
  });

  it('adds a child isosurface under its parent map and replaces the same name', () => {
    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    });

    addIsosurfaceEntry({
      name: 'isosurface_1',
      mapName: 'density',
      level: 1,
      handle: 7,
    });
    addIsosurfaceEntry({
      name: 'isosurface_1',
      mapName: 'density',
      level: 2,
      handle: 8,
    });

    expect(getState().isosurfaces.get('isosurface_1')).toMatchObject({
      name: 'isosurface_1',
      mapName: 'density',
      level: 2,
      representation: 'mesh',
      visible: true,
      parentVisible: true,
      color: '#FFFFFF',
      opacity: 0.75,
    });
    expect(getState().entryTree[0].children).toEqual([
      { type: 'isosurface', name: 'isosurface_1' },
    ]);
  });

  it('removing a map returns and removes child isosurfaces', () => {
    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    });
    addIsosurfaceEntry({ name: 'isosurface_1', mapName: 'density' });

    const removed = removeMapEntry('density');

    expect(removed.map.name).toBe('density');
    expect(removed.isosurfaces.map(entry => entry.name)).toEqual(['isosurface_1']);
    expect(getState().maps.has('density')).toBe(false);
    expect(getState().isosurfaces.has('isosurface_1')).toBe(false);
    expect(getState().entryTree).toEqual([]);
  });

  it('renames maps and isosurfaces in state and tree', () => {
    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    });
    addIsosurfaceEntry({ name: 'isosurface_1', mapName: 'density' });

    expect(renameMapEntry('density', 'density_map')).toBe(true);
    expect(renameIsosurfaceEntry('isosurface_1', 'mesh_a')).toBe(true);

    expect(getState().maps.has('density_map')).toBe(true);
    expect(getState().isosurfaces.get('mesh_a').mapName).toBe('density_map');
    expect(getState().entryTree).toEqual([
      {
        type: 'map',
        name: 'density_map',
        collapsed: false,
        children: [{ type: 'isosurface', name: 'mesh_a' }],
      },
    ]);
  });

  it('updates visibility and generated isosurface names', () => {
    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    });
    addIsosurfaceEntry({ name: 'isosurface_1', mapName: 'density' });
    addIsosurfaceEntry({ name: 'isosurface_3', mapName: 'density' });

    expect(getNextIsosurfaceName()).toBe('isosurface_2');
    expect(toggleMapVisibility('density').visible).toBe(false);
    expect(toggleIsosurfaceVisibility('isosurface_1').visible).toBe(false);
    expect(updateMapEntry('density', { opacity: 0.5 })).toMatchObject({ opacity: 0.5 });
    expect(updateIsosurfaceEntry('isosurface_1', { level: -2 })).toMatchObject({ level: -2 });
    expect(getChildIsosurfaceNames('density')).toEqual(['isosurface_1', 'isosurface_3']);
  });
});

describe('pruneSelections', () => {
  beforeEach(resetState);

  it('removes pruned indices from selection specs', () => {
    addSelection('sele', 'test', { index: [0, 1, 2, 3] }, 4);
    pruneSelections([1, 3]);
    const sel = getState().selections.get('sele');
    expect(sel.spec.index).toEqual([0, 2]);
    expect(sel.atomCount).toBe(2);
  });

  it('deletes selection when all atoms are pruned', () => {
    addSelection('sele', 'test', { index: [5, 6] }, 2);
    pruneSelections([5, 6]);
    expect(getState().selections.has('sele')).toBe(false);
  });

  it('does not affect selections without index spec', () => {
    addSelection('sele', 'test', { chain: 'A' }, 100);
    pruneSelections([1, 2]);
    expect(getState().selections.get('sele').spec).toEqual({ chain: 'A' });
  });
});

describe('setSelectionMode', () => {
  beforeEach(resetState);

  it('sets the selection mode', () => {
    setSelectionMode('chains');
    expect(getState().selectionMode).toBe('chains');
  });
});

describe('onStateChange / notifyStateChange', () => {
  beforeEach(resetState);

  it('listener is called on state mutations', async () => {
    const listener = vi.fn();
    onStateChange(listener);
    addObject('test', {}, 0);
    await new Promise(r => queueMicrotask(r));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(getState());
  });

  it('notifyStateChange triggers listeners manually', async () => {
    const listener = vi.fn();
    onStateChange(listener);
    notifyStateChange();
    await new Promise(r => queueMicrotask(r));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('multiple listeners all receive notifications', async () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    onStateChange(l1);
    onStateChange(l2);
    addObject('test', {}, 0);
    await new Promise(r => queueMicrotask(r));
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple mutations into one notification', async () => {
    const listener = vi.fn();
    onStateChange(listener);
    addObject('a', {}, 0);
    addObject('b', {}, 1);
    addObject('c', {}, 2);
    // Listener should not have been called synchronously
    expect(listener).toHaveBeenCalledTimes(0);
    await new Promise(r => queueMicrotask(r));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
