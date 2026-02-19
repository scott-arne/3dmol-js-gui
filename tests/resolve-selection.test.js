import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockState = {
  selections: new Map(),
  objects: new Map(),
};

vi.mock('../src/parser/selection.pegjs', () => ({
  parse: vi.fn(),
}));

vi.mock('../src/parser/evaluator.js', () => ({
  evaluate: vi.fn(),
  toAtomSelectionSpec: vi.fn(),
}));

vi.mock('../src/state.js', () => ({
  getState: () => mockState,
}));

vi.mock('../src/viewer.js', () => ({
  getAllAtoms: vi.fn(),
}));

// Import after mocks are declared
import { resolveSelection, getSelSpec } from '../src/commands/resolve-selection.js';
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
    expect(evaluate).toHaveBeenCalledWith(fakeAst, atoms);
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
