import { describe, it, expect, beforeEach } from 'vitest';
import {
  getState, addObject, removeObject, addSelection, removeSelection,
  addSurfaceEntry,
  renameObject, renameSelection, addGroup, removeGroup, ungroupGroup,
  renameGroup, toggleCollapsed, reparentEntry, unparentEntry,
  findTreeNode, removeTreeNode, renameTreeNode,
  collectEntryNames, collectAllEntryNames, buildDefaultTree, getDisplayTree,
} from '../src/state.js';

function resetState() {
  const state = getState();
  state.objects.clear();
  state.selections.clear();
  state.surfaces.clear();
  state.entryTree.length = 0;
  state._listeners.length = 0;
  state.selectionMode = 'atoms';
}

describe('entryTree integration with addObject/removeObject', () => {
  beforeEach(resetState);

  it('addObject appends to entryTree', () => {
    addObject('mol1', {}, 0);
    const state = getState();
    expect(state.entryTree).toEqual([{ type: 'object', name: 'mol1' }]);
  });

  it('multiple addObject calls maintain order', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    const names = getState().entryTree.map(n => n.name);
    expect(names).toEqual(['A', 'B']);
  });

  it('removeObject removes from entryTree', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    removeObject('A');
    const names = getState().entryTree.map(n => n.name);
    expect(names).toEqual(['B']);
  });

  it('addObject with duplicate name gets suffix in tree', () => {
    addObject('A', {}, 0);
    addObject('A', {}, 1);
    const names = getState().entryTree.map(n => n.name);
    expect(names).toEqual(['A', 'A_2']);
  });

  it('objects are inserted before selections in tree', () => {
    addSelection('sele', 'test', {}, 5);
    addObject('mol', {}, 0);
    const names = getState().entryTree.map(n => n.name);
    expect(names).toEqual(['mol', 'sele']);
  });
});

describe('entryTree integration with addSelection/removeSelection', () => {
  beforeEach(resetState);

  it('addSelection appends to entryTree', () => {
    addSelection('sele', 'protein', {}, 10);
    expect(getState().entryTree).toEqual([{ type: 'selection', name: 'sele' }]);
  });

  it('overwriting selection does not duplicate in tree', () => {
    addSelection('sele', 'first', {}, 5);
    addSelection('sele', 'second', {}, 10);
    const selNodes = getState().entryTree.filter(n => n.name === 'sele');
    expect(selNodes.length).toBe(1);
  });

  it('removeSelection removes from entryTree', () => {
    addSelection('sele', 'test', {}, 5);
    removeSelection('sele');
    expect(getState().entryTree.length).toBe(0);
  });
});

describe('rename updates entryTree', () => {
  beforeEach(resetState);

  it('renameObject updates tree node name', () => {
    addObject('A', {}, 0);
    renameObject('A', 'B');
    expect(getState().entryTree[0].name).toBe('B');
  });

  it('renameSelection updates tree node name', () => {
    addSelection('sele', 'test', {}, 5);
    renameSelection('sele', 'mySel');
    expect(getState().entryTree[0].name).toBe('mySel');
  });
});

describe('findTreeNode', () => {
  it('finds a node in flat tree', () => {
    const tree = [
      { type: 'object', name: 'A' },
      { type: 'object', name: 'B' },
    ];
    const result = findTreeNode(tree, 'B');
    expect(result.node.name).toBe('B');
    expect(result.index).toBe(1);
  });

  it('finds a node in nested tree', () => {
    const tree = [
      { type: 'group', name: 'G', children: [
        { type: 'object', name: 'A' },
      ]},
    ];
    const result = findTreeNode(tree, 'A');
    expect(result.node.name).toBe('A');
    expect(result.parent).toBe(tree[0].children);
  });

  it('returns null for missing node', () => {
    expect(findTreeNode([], 'nope')).toBeNull();
  });

  it('filters by type', () => {
    const tree = [
      { type: 'object', name: 'A' },
      { type: 'group', name: 'A', children: [] },
    ];
    const result = findTreeNode(tree, 'A', 'group');
    expect(result.node.type).toBe('group');
  });
});

describe('removeTreeNode', () => {
  it('removes and returns a node', () => {
    const tree = [
      { type: 'object', name: 'A' },
      { type: 'object', name: 'B' },
    ];
    const removed = removeTreeNode(tree, 'A');
    expect(removed.name).toBe('A');
    expect(tree.length).toBe(1);
  });

  it('removes from nested tree', () => {
    const tree = [
      { type: 'group', name: 'G', children: [
        { type: 'object', name: 'A' },
        { type: 'object', name: 'B' },
      ]},
    ];
    removeTreeNode(tree, 'A');
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].name).toBe('B');
  });

  it('returns null for missing node', () => {
    expect(removeTreeNode([], 'nope')).toBeNull();
  });
});

describe('renameTreeNode', () => {
  it('renames a node', () => {
    const tree = [{ type: 'object', name: 'A' }];
    renameTreeNode(tree, 'A', 'B');
    expect(tree[0].name).toBe('B');
  });

  it('renames nested node', () => {
    const tree = [
      { type: 'group', name: 'G', children: [
        { type: 'object', name: 'A' },
      ]},
    ];
    renameTreeNode(tree, 'A', 'B');
    expect(tree[0].children[0].name).toBe('B');
  });
});

describe('collectEntryNames', () => {
  it('collects from simple object', () => {
    const result = collectEntryNames({ type: 'object', name: 'A' });
    expect(result).toEqual({ objects: ['A'], selections: [], surfaces: [] });
  });

  it('collects from group with mixed children', () => {
    const node = {
      type: 'group', name: 'G', children: [
        { type: 'object', name: 'A' },
        { type: 'selection', name: 'S' },
        { type: 'object', name: 'B' },
      ],
    };
    const result = collectEntryNames(node);
    expect(result.objects).toEqual(['A', 'B']);
    expect(result.selections).toEqual(['S']);
  });

  it('collects recursively from nested groups', () => {
    const node = {
      type: 'group', name: 'G1', children: [
        { type: 'group', name: 'G2', children: [
          { type: 'object', name: 'deep' },
        ]},
      ],
    };
    const result = collectEntryNames(node);
    expect(result.objects).toEqual(['deep']);
  });
});

describe('collectAllEntryNames', () => {
  it('collects from array of nodes', () => {
    const nodes = [
      { type: 'object', name: 'A' },
      { type: 'selection', name: 'S' },
    ];
    const result = collectAllEntryNames(nodes);
    expect(result.objects).toEqual(['A']);
    expect(result.selections).toEqual(['S']);
  });
});

describe('surface tree integration', () => {
  beforeEach(resetState);

  it('collectEntryNames includes surfaces', () => {
    const node = {
      type: 'group',
      name: 'grp',
      children: [
        { type: 'object', name: 'mol' },
        { type: 'surface', name: 'surf' },
        { type: 'selection', name: 'sel' },
      ],
    };

    expect(collectEntryNames(node)).toEqual({
      objects: ['mol'],
      selections: ['sel'],
      surfaces: ['surf'],
    });
  });

  it('surface children make molecule nodes hierarchy parents', () => {
    addObject('mol', {}, 0);
    addSurfaceEntry({
      name: 'mol_surface',
      selection: { model: {} },
      type: 'molecular',
      surfaceType: 'MS',
      parentName: 'mol',
    });

    const parent = getState().entryTree[0];
    expect(parent.children).toEqual([{ type: 'surface', name: 'mol_surface' }]);
    expect(parent.collapsed).toBe(false);
  });

  it('inserts top-level surfaces before top-level selections', () => {
    addSelection('sel', 'test', {}, 5);
    addSurfaceEntry({
      name: 'surf',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
    });

    expect(getState().entryTree).toEqual([
      { type: 'surface', name: 'surf' },
      { type: 'selection', name: 'sel' },
    ]);
  });
});

describe('buildDefaultTree / getDisplayTree', () => {
  beforeEach(resetState);

  it('buildDefaultTree creates flat tree from maps', () => {
    const st = {
      objects: new Map([['A', {}], ['B', {}]]),
      selections: new Map([['sele', {}]]),
    };
    const tree = buildDefaultTree(st);
    expect(tree.map(n => n.name)).toEqual(['A', 'B', 'sele']);
  });

  it('buildDefaultTree includes surfaces from the surface map', () => {
    const st = {
      objects: new Map([['mol', {}]]),
      surfaces: new Map([
        ['mol_surface', { parentName: 'mol' }],
        ['top_surface', { parentName: null }],
      ]),
      selections: new Map([['sel', {}]]),
    };

    const tree = buildDefaultTree(st);
    expect(tree).toEqual([
      {
        type: 'object',
        name: 'mol',
        collapsed: false,
        children: [{ type: 'surface', name: 'mol_surface' }],
      },
      { type: 'surface', name: 'top_surface' },
      { type: 'selection', name: 'sel' },
    ]);
  });

  it('getDisplayTree returns entryTree when non-empty', () => {
    addObject('A', {}, 0);
    const st = getState();
    const tree = getDisplayTree(st);
    expect(tree).toBe(st.entryTree);
  });

  it('getDisplayTree falls back to default when entryTree is empty', () => {
    const st = {
      objects: new Map([['A', {}]]),
      selections: new Map(),
      entryTree: [],
    };
    const tree = getDisplayTree(st);
    expect(tree.map(n => n.name)).toEqual(['A']);
  });
});

describe('addGroup', () => {
  beforeEach(resetState);

  it('creates a group with specified members', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    addGroup('myGroup', ['A', 'B']);
    const state = getState();
    expect(state.entryTree.length).toBe(1);
    expect(state.entryTree[0].type).toBe('group');
    expect(state.entryTree[0].name).toBe('myGroup');
    expect(state.entryTree[0].children.length).toBe(2);
  });

  it('group is inserted at position of first member', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    addObject('C', {}, 2);
    addGroup('grp', ['B', 'C']);
    const names = getState().entryTree.map(n => n.name);
    expect(names).toEqual(['A', 'grp']);
  });

  it('throws when group name already exists', () => {
    addObject('A', {}, 0);
    expect(() => addGroup('A', ['A'])).toThrow(/already exists/);
  });

  it('throws when member not found', () => {
    addObject('A', {}, 0);
    expect(() => addGroup('grp', ['A', 'missing'])).toThrow(/not found/);
  });

  it('throws when no members specified', () => {
    expect(() => addGroup('grp', [])).toThrow(/at least one entry/);
  });

  it('group starts expanded (collapsed: false)', () => {
    addObject('A', {}, 0);
    addGroup('grp', ['A']);
    expect(getState().entryTree[0].collapsed).toBe(false);
  });

  it('can create nested groups (groups within groups)', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    addGroup('inner', ['A']);
    addGroup('outer', ['inner', 'B']);
    const state = getState();
    expect(state.entryTree.length).toBe(1);
    expect(state.entryTree[0].name).toBe('outer');
    const outerChildren = state.entryTree[0].children;
    expect(outerChildren[0].type).toBe('group');
    expect(outerChildren[0].name).toBe('inner');
    expect(outerChildren[1].name).toBe('B');
  });
});

describe('removeGroup', () => {
  beforeEach(resetState);

  it('removes group and all contained objects from state', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    addGroup('grp', ['A', 'B']);
    const removed = removeGroup('grp');
    expect(removed.objects).toEqual(['A', 'B']);
    expect(getState().objects.size).toBe(0);
    expect(getState().entryTree.length).toBe(0);
  });

  it('removes nested groups recursively', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    addGroup('inner', ['A']);
    addGroup('outer', ['inner', 'B']);
    const removed = removeGroup('outer');
    expect(removed.objects).toEqual(['A', 'B']);
    expect(getState().objects.size).toBe(0);
  });

  it('throws for non-existent group', () => {
    expect(() => removeGroup('nope')).toThrow(/not found/);
  });

  it('removes contained selections from state', () => {
    addSelection('sele', 'test', {}, 5);
    addObject('A', {}, 0);
    addGroup('grp', ['A', 'sele']);
    removeGroup('grp');
    expect(getState().selections.size).toBe(0);
  });

  it('removes contained surfaces from state', () => {
    addSurfaceEntry({
      name: 'surf',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
    });
    addGroup('grp', ['surf']);

    const removed = removeGroup('grp');
    expect(removed.surfaces).toEqual(['surf']);
    expect(getState().surfaces.has('surf')).toBe(false);
  });
});

describe('ungroupGroup', () => {
  beforeEach(resetState);

  it('dissolves group and promotes children to parent level', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    addGroup('grp', ['A', 'B']);
    ungroupGroup('grp');
    const names = getState().entryTree.map(n => n.name);
    expect(names).toEqual(['A', 'B']);
    // Objects still exist in the map
    expect(getState().objects.has('A')).toBe(true);
    expect(getState().objects.has('B')).toBe(true);
  });

  it('dissolves nested group correctly', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    addObject('C', {}, 2);
    addGroup('inner', ['A', 'B']);
    addGroup('outer', ['inner', 'C']);
    ungroupGroup('inner');
    // outer should now contain A, B, C
    const outer = getState().entryTree[0];
    expect(outer.children.map(n => n.name)).toEqual(['A', 'B', 'C']);
  });

  it('throws for non-existent group', () => {
    expect(() => ungroupGroup('nope')).toThrow(/not found/);
  });

  it('throws for non-group nodes', () => {
    addObject('A', {}, 0);
    expect(() => ungroupGroup('A')).toThrow(/not found/);
  });
});

describe('renameGroup', () => {
  beforeEach(resetState);

  it('renames a group', () => {
    addObject('A', {}, 0);
    addGroup('old', ['A']);
    renameGroup('old', 'new');
    expect(getState().entryTree[0].name).toBe('new');
  });

  it('throws when target name exists', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    addGroup('grp1', ['A']);
    expect(() => renameGroup('grp1', 'B')).toThrow(/already exists/);
  });

  it('returns false for non-existent group', () => {
    expect(renameGroup('nope', 'new')).toBe(false);
  });
});

describe('toggleCollapsed', () => {
  beforeEach(resetState);

  it('toggles collapsed state on group', () => {
    addObject('A', {}, 0);
    addGroup('grp', ['A']);
    expect(toggleCollapsed('grp')).toBe(true);
    expect(getState().entryTree[0].collapsed).toBe(true);
    expect(toggleCollapsed('grp')).toBe(false);
  });

  it('returns undefined for leaf nodes', () => {
    addObject('A', {}, 0);
    expect(toggleCollapsed('A')).toBeUndefined();
  });

  it('toggles collapsed on hierarchy parent', () => {
    addObject('parent', {}, 0);
    addObject('child', {}, 1);
    reparentEntry('child', 'parent');
    expect(toggleCollapsed('parent')).toBe(true);
    expect(toggleCollapsed('parent')).toBe(false);
  });
});

describe('reparentEntry', () => {
  beforeEach(resetState);

  it('moves child under parent as hierarchy child', () => {
    addObject('parent', {}, 0);
    addObject('child', {}, 1);
    reparentEntry('child', 'parent');
    const state = getState();
    expect(state.entryTree.length).toBe(1);
    const parentNode = state.entryTree[0];
    expect(parentNode.children.length).toBe(1);
    expect(parentNode.children[0].name).toBe('child');
  });

  it('parent node gets collapsed: false', () => {
    addObject('P', {}, 0);
    addObject('C', {}, 1);
    reparentEntry('C', 'P');
    expect(getState().entryTree[0].collapsed).toBe(false);
  });

  it('multiple children can be reparented', () => {
    addObject('P', {}, 0);
    addObject('C1', {}, 1);
    addObject('C2', {}, 2);
    reparentEntry('C1', 'P');
    reparentEntry('C2', 'P');
    expect(getState().entryTree[0].children.length).toBe(2);
  });

  it('throws when reparenting to self', () => {
    addObject('A', {}, 0);
    expect(() => reparentEntry('A', 'A')).toThrow(/itself/);
  });

  it('throws when parent not found', () => {
    addObject('A', {}, 0);
    expect(() => reparentEntry('A', 'nope')).toThrow(/not found/);
  });

  it('throws when child not found', () => {
    addObject('P', {}, 0);
    expect(() => reparentEntry('nope', 'P')).toThrow(/not found/);
  });

  it('throws when reparenting would create cycle', () => {
    addObject('A', {}, 0);
    addObject('B', {}, 1);
    reparentEntry('B', 'A');
    expect(() => reparentEntry('A', 'B')).toThrow(/cycle/);
  });

  it('objects still exist in flat map after reparenting', () => {
    addObject('P', {}, 0);
    addObject('C', {}, 1);
    reparentEntry('C', 'P');
    expect(getState().objects.has('P')).toBe(true);
    expect(getState().objects.has('C')).toBe(true);
  });
});

describe('unparentEntry', () => {
  beforeEach(resetState);

  it('moves child back to top level next to parent', () => {
    addObject('P', {}, 0);
    addObject('C', {}, 1);
    reparentEntry('C', 'P');
    unparentEntry('C');
    const names = getState().entryTree.map(n => n.name);
    expect(names).toEqual(['P', 'C']);
  });

  it('cleans up empty children array on parent', () => {
    addObject('P', {}, 0);
    addObject('C', {}, 1);
    reparentEntry('C', 'P');
    unparentEntry('C');
    expect(getState().entryTree[0].children).toBeUndefined();
  });

  it('keeps other children when unparenting one', () => {
    addObject('P', {}, 0);
    addObject('C1', {}, 1);
    addObject('C2', {}, 2);
    reparentEntry('C1', 'P');
    reparentEntry('C2', 'P');
    unparentEntry('C1');
    expect(getState().entryTree[0].children.length).toBe(1);
    expect(getState().entryTree[0].children[0].name).toBe('C2');
  });

  it('throws for top-level entry', () => {
    addObject('A', {}, 0);
    expect(() => unparentEntry('A')).toThrow(/not a hierarchy child/);
  });

  it('throws for non-existent entry', () => {
    expect(() => unparentEntry('nope')).toThrow(/not found/);
  });

  it('throws for entry in a group (not hierarchy)', () => {
    addObject('A', {}, 0);
    addGroup('grp', ['A']);
    expect(() => unparentEntry('A')).toThrow(/not a hierarchy child/);
  });
});
