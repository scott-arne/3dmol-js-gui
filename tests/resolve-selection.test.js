import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockState = {
  selections: new Map(),
  objects: new Map(),
  entryTree: [],
};

vi.mock('../src/parser/selection.pegjs', () => ({
  parse: vi.fn(),
}));

vi.mock('../src/parser/evaluator.js', () => ({
  evaluate: vi.fn(),
  toAtomSelectionSpec: vi.fn(),
}));

vi.mock('../src/state.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getState: () => mockState,
  };
});

vi.mock('../src/viewer.js', () => ({
  getAllAtoms: vi.fn(),
}));

// Import after mocks are declared
import { resolveSelection, getSelSpec, resolveSelectionByEntry } from '../src/commands/resolve-selection.js';
import { parse } from '../src/parser/selection.pegjs';
import { evaluate, toAtomSelectionSpec } from '../src/parser/evaluator.js';
import { getAllAtoms } from '../src/viewer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.selections.clear();
    mockState.objects.clear();
    mockState.entryTree.length = 0;
  });

  // 1. Empty / null / undefined
  it('returns { spec: {} } for empty string', () => {
    expect(resolveSelection('')).toEqual({ spec: {} });
  });

  it('returns { spec: {} } for null', () => {
    expect(resolveSelection(null)).toEqual({ spec: {} });
  });

  it('returns { spec: {} } for undefined', () => {
    expect(resolveSelection(undefined)).toEqual({ spec: {} });
  });

  it('returns { spec: {} } for whitespace-only string', () => {
    expect(resolveSelection('   ')).toEqual({ spec: {} });
  });

  // 2. "all" (case insensitive)
  it('returns { spec: {} } for "all"', () => {
    expect(resolveSelection('all')).toEqual({ spec: {} });
  });

  it('returns { spec: {} } for "ALL"', () => {
    expect(resolveSelection('ALL')).toEqual({ spec: {} });
  });

  it('returns { spec: {} } for "All"', () => {
    expect(resolveSelection('All')).toEqual({ spec: {} });
  });

  // 3. Named selection lookup
  it('returns named selection spec when name matches exactly', () => {
    const selSpec = { chain: 'A' };
    mockState.selections.set('mysel', { spec: selSpec });
    const result = resolveSelection('mysel');
    expect(result).toEqual({ spec: { chain: 'A' } });
  });

  // 4. Object name lookup
  it('returns model spec when object name matches exactly', () => {
    const modelObj = { model: 7 };
    mockState.objects.set('1UBQ', modelObj);
    const result = resolveSelection('1UBQ');
    expect(result).toEqual({ spec: { model: 7 } });
  });

  it('named selections shadow object names', () => {
    mockState.selections.set('thing', { spec: { chain: 'B' } });
    mockState.objects.set('thing', { model: 3 });
    const result = resolveSelection('thing');
    expect(result).toEqual({ spec: { chain: 'B' } });
  });

  // 5. Prefix matching with single selection match
  it('returns spec for single prefix match on selection', () => {
    mockState.selections.set('longSelectionName', { spec: { resn: ['ALA'] } });
    const result = resolveSelection('longSel');
    expect(result).toEqual({ spec: { resn: ['ALA'] } });
  });

  // 6. Prefix matching with single object match
  it('returns model spec for single prefix match on object', () => {
    mockState.objects.set('myProtein', { model: 5 });
    const result = resolveSelection('myPro');
    expect(result).toEqual({ spec: { model: 5 } });
  });

  // 7. Prefix matching with multiple matches throws "Ambiguous"
  it('throws Ambiguous error when prefix matches multiple names', () => {
    mockState.selections.set('alpha', { spec: { chain: 'A' } });
    mockState.objects.set('alphaObj', { model: 1 });
    expect(() => resolveSelection('alph')).toThrow(/Ambiguous name "alph"/);
    expect(() => resolveSelection('alph')).toThrow(/alpha, alphaObj/);
  });

  it('throws Ambiguous for multiple selection matches', () => {
    mockState.selections.set('selA', { spec: {} });
    mockState.selections.set('selB', { spec: {} });
    expect(() => resolveSelection('sel')).toThrow(/Ambiguous/);
  });

  // 8. Parse expression + toAtomSelectionSpec success
  it('returns spec from parsed expression when toAtomSelectionSpec succeeds', () => {
    const fakeAst = { type: 'comparison', field: 'chain', value: 'A' };
    const fakeSpec = { chain: 'A' };
    parse.mockReturnValue(fakeAst);
    toAtomSelectionSpec.mockReturnValue(fakeSpec);
    getAllAtoms.mockReturnValue([{ serial: 1 }, { serial: 2 }]);

    const result = resolveSelection('chain A');
    expect(parse).toHaveBeenCalledWith('chain A');
    expect(toAtomSelectionSpec).toHaveBeenCalledWith(fakeAst);
    expect(getAllAtoms).toHaveBeenCalledWith(fakeSpec);
    expect(result).toEqual({ spec: fakeSpec });
  });

  // 9. toAtomSelectionSpec returns spec but no atoms match
  it('throws when toAtomSelectionSpec returns spec but no atoms match', () => {
    parse.mockReturnValue({ type: 'test' });
    toAtomSelectionSpec.mockReturnValue({ resn: ['XYZ'] });
    getAllAtoms.mockReturnValue([]);

    expect(() => resolveSelection('resn XYZ')).toThrow(
      /No atoms match the selection "resn XYZ"/,
    );
  });

  it('throws when toAtomSelectionSpec returns spec and getAllAtoms returns null', () => {
    parse.mockReturnValue({ type: 'test' });
    toAtomSelectionSpec.mockReturnValue({ resn: ['XYZ'] });
    getAllAtoms.mockReturnValue(null);

    expect(() => resolveSelection('resn XYZ')).toThrow(
      /No atoms match the selection "resn XYZ"/,
    );
  });

  // 10. toAtomSelectionSpec returns null, falls back to evaluate
  it('falls back to atom-by-atom evaluation when toAtomSelectionSpec returns null', () => {
    const fakeAst = { type: 'complex' };
    const atoms = [{ serial: 1 }, { serial: 2 }, { serial: 3 }];
    const selected = [{ serial: 2 }];

    parse.mockReturnValue(fakeAst);
    toAtomSelectionSpec.mockReturnValue(null);
    getAllAtoms.mockReturnValue(atoms);
    evaluate.mockReturnValue(selected);

    const result = resolveSelection('complex_expr');
    expect(getAllAtoms).toHaveBeenCalledWith({});
    expect(evaluate).toHaveBeenCalledWith(fakeAst, atoms, expect.objectContaining({ entries: expect.any(Map) }));
    expect(result).toEqual({ atoms: selected });
  });

  // 11. evaluate fallback with no atoms loaded
  it('throws when evaluate fallback has no atoms loaded (empty array)', () => {
    parse.mockReturnValue({ type: 'complex' });
    toAtomSelectionSpec.mockReturnValue(null);
    getAllAtoms.mockReturnValue([]);

    expect(() => resolveSelection('complex_expr')).toThrow(
      /requires atom-level evaluation but no atoms are loaded/,
    );
  });

  it('throws when evaluate fallback has no atoms loaded (null)', () => {
    parse.mockReturnValue({ type: 'complex' });
    toAtomSelectionSpec.mockReturnValue(null);
    getAllAtoms.mockReturnValue(null);

    expect(() => resolveSelection('complex_expr')).toThrow(
      /requires atom-level evaluation but no atoms are loaded/,
    );
  });

  // 12. evaluate fallback with no matches
  it('throws when evaluate returns empty array', () => {
    parse.mockReturnValue({ type: 'complex' });
    toAtomSelectionSpec.mockReturnValue(null);
    getAllAtoms.mockReturnValue([{ serial: 1 }]);
    evaluate.mockReturnValue([]);

    expect(() => resolveSelection('no_match')).toThrow(
      /No atoms match the selection "no_match"/,
    );
  });

  // 13. Parse failure
  it('throws Invalid selection when parse fails', () => {
    parse.mockImplementation(() => {
      throw new Error('Unexpected token');
    });

    expect(() => resolveSelection('!!!bad')).toThrow(
      /Invalid selection "!!!bad": Unexpected token/,
    );
  });
});

describe('getSelSpec', () => {
  // 14. getSelSpec with spec result
  it('returns spec directly when result has spec', () => {
    const result = { spec: { chain: 'A' } };
    expect(getSelSpec(result)).toEqual({ chain: 'A' });
  });

  it('returns empty spec when result.spec is empty object', () => {
    const result = { spec: {} };
    expect(getSelSpec(result)).toEqual({});
  });

  // 15. getSelSpec with atoms result
  it('returns serial array when result has atoms', () => {
    const result = {
      atoms: [{ serial: 10 }, { serial: 20 }, { serial: 30 }],
    };
    expect(getSelSpec(result)).toEqual({ serial: [10, 20, 30] });
  });

  it('returns empty serial array when atoms is empty', () => {
    const result = { atoms: [] };
    expect(getSelSpec(result)).toEqual({ serial: [] });
  });
});

describe('resolveSelection - group names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.selections.clear();
    mockState.objects.clear();
    mockState.entryTree.length = 0;
  });

  it('resolves group name to union of group member models', () => {
    const modelA = { id: 'A' };
    const modelB = { id: 'B' };
    mockState.objects.set('molA', { model: modelA });
    mockState.objects.set('molB', { model: modelB });
    mockState.entryTree.push({
      type: 'group', name: 'myGroup', collapsed: false, children: [
        { type: 'object', name: 'molA' },
        { type: 'object', name: 'molB' },
      ],
    });

    const result = resolveSelection('myGroup');
    expect(result.spec.model).toEqual([modelA, modelB]);
  });

  it('resolves group with single member to single model spec', () => {
    const modelA = { id: 'A' };
    mockState.objects.set('molA', { model: modelA });
    mockState.entryTree.push({
      type: 'group', name: 'grp', collapsed: false, children: [
        { type: 'object', name: 'molA' },
      ],
    });

    const result = resolveSelection('grp');
    expect(result.spec.model).toBe(modelA);
  });

  it('named selections shadow group names', () => {
    mockState.selections.set('grp', { spec: { chain: 'X' } });
    mockState.objects.set('mol', { model: 1 });
    mockState.entryTree.push({
      type: 'group', name: 'grp', collapsed: false, children: [
        { type: 'object', name: 'mol' },
      ],
    });

    const result = resolveSelection('grp');
    expect(result.spec).toEqual({ chain: 'X' });
  });
});

describe('resolveSelection - hierarchy dot-notation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.selections.clear();
    mockState.objects.clear();
    mockState.entryTree.length = 0;
  });

  it('PARENT.* resolves to parent + all children', () => {
    const parentModel = { id: 'P' };
    const childModel1 = { id: 'C1' };
    const childModel2 = { id: 'C2' };
    mockState.objects.set('ensemble', { model: parentModel });
    mockState.objects.set('conf1', { model: childModel1 });
    mockState.objects.set('conf2', { model: childModel2 });
    mockState.entryTree.push({
      type: 'object', name: 'ensemble', collapsed: false, children: [
        { type: 'object', name: 'conf1' },
        { type: 'object', name: 'conf2' },
      ],
    });

    const result = resolveSelection('ensemble.*');
    expect(result.spec.model).toEqual([parentModel, childModel1, childModel2]);
  });

  it('PARENT.CHILD resolves to specific child', () => {
    const parentModel = { id: 'P' };
    const childModel = { id: 'C' };
    mockState.objects.set('ensemble', { model: parentModel });
    mockState.objects.set('conf1', { model: childModel });
    mockState.entryTree.push({
      type: 'object', name: 'ensemble', collapsed: false, children: [
        { type: 'object', name: 'conf1' },
      ],
    });

    const result = resolveSelection('ensemble.conf1');
    expect(result.spec.model).toBe(childModel);
  });

  it('PARENT.PREFIX* resolves matching children by prefix', () => {
    const parentModel = { id: 'P' };
    const child1 = { id: 'C1' };
    const child2 = { id: 'C2' };
    const child3 = { id: 'C3' };
    mockState.objects.set('mol', { model: parentModel });
    mockState.objects.set('conf_a', { model: child1 });
    mockState.objects.set('conf_b', { model: child2 });
    mockState.objects.set('other', { model: child3 });
    mockState.entryTree.push({
      type: 'object', name: 'mol', collapsed: false, children: [
        { type: 'object', name: 'conf_a' },
        { type: 'object', name: 'conf_b' },
        { type: 'object', name: 'other' },
      ],
    });

    const result = resolveSelection('mol.conf_*');
    expect(result.spec.model).toEqual([child1, child2]);
  });

  it('dot-notation falls through to parse when parent has no children', () => {
    mockState.objects.set('mol', { model: 1 });
    mockState.entryTree.push({ type: 'object', name: 'mol' });

    const fakeAst = { type: 'test' };
    const fakeSpec = { chain: 'A' };
    parse.mockReturnValue(fakeAst);
    toAtomSelectionSpec.mockReturnValue(fakeSpec);
    getAllAtoms.mockReturnValue([{ serial: 1 }]);

    const result = resolveSelection('mol.chain');
    // Should have fallen through to parser
    expect(parse).toHaveBeenCalled();
  });
});

describe('resolveSelectionByEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.selections.clear();
    mockState.objects.clear();
    mockState.entryTree.length = 0;
  });

  it('returns all entries with model-scoped specs when selStr is null', () => {
    const modelA = { id: 'A' };
    const modelB = { id: 'B' };
    mockState.objects.set('molA', { model: modelA, modelIndex: 0, visible: true });
    mockState.objects.set('molB', { model: modelB, modelIndex: 1, visible: true });

    const result = resolveSelectionByEntry(null);
    expect(result.size).toBe(2);
    expect(result.get('molA')).toEqual({ spec: { model: modelA } });
    expect(result.get('molB')).toEqual({ spec: { model: modelB } });
  });

  it('evaluates expression independently per model', () => {
    const modelA = { id: 'A' };
    mockState.objects.set('molA', { model: modelA, modelIndex: 0, visible: true });

    const fakeAst = { type: 'complex' };
    parse.mockReturnValue(fakeAst);
    getAllAtoms.mockImplementation((spec) => {
      if (spec.model === modelA) return [{ serial: 1, model: 0 }, { serial: 2, model: 0 }];
      return [];
    });
    evaluate.mockReturnValue([{ serial: 1, model: 0 }]);

    const result = resolveSelectionByEntry('ligand around 5.0');
    expect(result.size).toBe(1);
    expect(result.get('molA').spec).toEqual({ serial: [1] });
  });

  it('omits entries with zero matched atoms', () => {
    const modelA = { id: 'A' };
    const modelB = { id: 'B' };
    mockState.objects.set('molA', { model: modelA, modelIndex: 0, visible: true });
    mockState.objects.set('molB', { model: modelB, modelIndex: 1, visible: true });

    const fakeAst = { type: 'complex' };
    parse.mockReturnValue(fakeAst);
    getAllAtoms.mockImplementation((spec) => {
      if (spec.model === modelA) return [{ serial: 1, model: 0 }];
      if (spec.model === modelB) return [{ serial: 10, model: 1 }];
      return [];
    });
    evaluate.mockImplementation((ast, atoms, ctx) => {
      if (atoms[0]?.model === 0) return [{ serial: 1, model: 0 }];
      return [];
    });

    const result = resolveSelectionByEntry('ligand');
    expect(result.size).toBe(1);
    expect(result.has('molA')).toBe(true);
    expect(result.has('molB')).toBe(false);
  });

  it('returns empty map when no atoms match in any entry', () => {
    const modelA = { id: 'A' };
    mockState.objects.set('molA', { model: modelA, modelIndex: 0, visible: true });

    parse.mockReturnValue({ type: 'complex' });
    getAllAtoms.mockReturnValue([{ serial: 1 }]);
    evaluate.mockReturnValue([]);

    const result = resolveSelectionByEntry('nothing');
    expect(result.size).toBe(0);
  });
});
