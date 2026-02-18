import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getState, addObject, removeObject, addSelection, removeSelection,
  renameObject, renameSelection, toggleObjectVisibility,
  toggleSelectionVisibility, pruneSelections, setActiveSelection,
  setSelectionMode, onStateChange, notifyStateChange,
} from '../src/state.js';

function resetState() {
  const state = getState();
  state.objects.clear();
  state.selections.clear();
  state._listeners.length = 0;
  state.activeSelection = null;
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

  it('prunes activeSelection', () => {
    setActiveSelection({ index: [1, 2, 3] });
    pruneSelections([2]);
    expect(getState().activeSelection.index).toEqual([1, 3]);
  });

  it('clears activeSelection when all atoms pruned', () => {
    setActiveSelection({ index: [1] });
    pruneSelections([1]);
    expect(getState().activeSelection).toBeNull();
  });

  it('does not affect selections without index spec', () => {
    addSelection('sele', 'test', { chain: 'A' }, 100);
    pruneSelections([1, 2]);
    expect(getState().selections.get('sele').spec).toEqual({ chain: 'A' });
  });
});

describe('setActiveSelection', () => {
  beforeEach(resetState);

  it('sets the active selection', () => {
    setActiveSelection({ chain: 'A' });
    expect(getState().activeSelection).toEqual({ chain: 'A' });
  });

  it('clears the active selection with null', () => {
    setActiveSelection({ chain: 'A' });
    setActiveSelection(null);
    expect(getState().activeSelection).toBeNull();
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

  it('listener is called on state mutations', () => {
    const listener = vi.fn();
    onStateChange(listener);
    addObject('test', {}, 0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(getState());
  });

  it('notifyStateChange triggers listeners manually', () => {
    const listener = vi.fn();
    onStateChange(listener);
    notifyStateChange();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('multiple listeners all receive notifications', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    onStateChange(l1);
    onStateChange(l2);
    addObject('test', {}, 0);
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });
});
