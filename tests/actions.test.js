import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockViewer = {
  setStyle: vi.fn(),
  addStyle: vi.fn(),
  selectedAtoms: vi.fn(() => []),
  render: vi.fn(),
};

vi.mock('../src/viewer.js', () => ({
  getViewer: vi.fn(() => mockViewer),
  repStyle: vi.fn((rep) => ({ [rep]: {} })),
  repKey: vi.fn((rep) => rep),
  addTrackedLabel: vi.fn(),
  clearAllLabels: vi.fn(),
}));

vi.mock('../src/state.js', () => ({
  getState: vi.fn(() => ({
    objects: new Map(),
    settings: {},
  })),
  notifyStateChange: vi.fn(),
}));

vi.mock('../src/presets.js', () => ({
  applyPreset: vi.fn(() => new Set(['line'])),
  PRESETS: { simple: { label: 'Simple' }, sites: { label: 'Sites' } },
}));

import {
  parseColorScheme,
  formatColorDisplay,
  applyColor,
  applyColorToSelection,
  applyLabel,
  applyShow,
  applyHide,
  applyHideSelection,
  applyViewPreset,
  getPresetLabel,
} from '../src/actions.js';
import { getViewer, addTrackedLabel, clearAllLabels, repStyle, repKey } from '../src/viewer.js';
import { getState, notifyStateChange } from '../src/state.js';
import { applyPreset, PRESETS } from '../src/presets.js';

/* ------------------------------------------------------------------ */
/*  Reset mocks between tests                                          */
/* ------------------------------------------------------------------ */

/** Default atoms returned by selectedAtoms — no .style triggers fallback path */
const defaultAtoms = [
  { serial: 1, atom: 'CA', chain: 'A', x: 0, y: 0, z: 0 },
  { serial: 2, atom: 'CB', chain: 'A', x: 1, y: 1, z: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default mock implementations (clearAllMocks only clears call history)
  repKey.mockImplementation((rep) => rep);
  repStyle.mockImplementation((rep) => ({ [rep]: {} }));
  mockViewer.selectedAtoms.mockReturnValue(defaultAtoms);
  getState.mockReturnValue({
    objects: new Map(),
    settings: {},
  });
});

/* ================================================================== */
/*  parseColorScheme  (existing tests preserved)                       */
/* ================================================================== */

describe('parseColorScheme', () => {
  it('parses plain scheme', () => {
    expect(parseColorScheme('red')).toEqual({
      scheme: 'red', carbonHex: null, chainPalette: null, ssPalette: null,
    });
  });

  it('parses element with carbon hex', () => {
    expect(parseColorScheme('element:#FF0000')).toEqual({
      scheme: 'element', carbonHex: '#FF0000', chainPalette: null, ssPalette: null,
    });
  });

  it('parses chain palette', () => {
    expect(parseColorScheme('chain:pastel')).toEqual({
      scheme: 'chain', carbonHex: null, chainPalette: 'pastel', ssPalette: null,
    });
  });

  it('parses ss palette', () => {
    expect(parseColorScheme('ss:cool')).toEqual({
      scheme: 'ss', carbonHex: null, chainPalette: null, ssPalette: 'cool',
    });
  });

  it('passes through hex values unchanged', () => {
    expect(parseColorScheme('#ABCDEF')).toEqual({
      scheme: '#ABCDEF', carbonHex: null, chainPalette: null, ssPalette: null,
    });
  });
});

/* ================================================================== */
/*  formatColorDisplay  (existing tests preserved)                     */
/* ================================================================== */

describe('formatColorDisplay', () => {
  it('formats element with carbon', () => {
    expect(formatColorDisplay('element:#FF0000')).toBe('element (C=#FF0000)');
  });

  it('formats chain palette', () => {
    expect(formatColorDisplay('chain:pastel')).toBe('chain (pastel)');
  });

  it('formats ss palette', () => {
    expect(formatColorDisplay('ss:cool')).toBe('ss (cool)');
  });

  it('formats plain scheme', () => {
    expect(formatColorDisplay('red')).toBe('red');
  });

  it('formats bare element', () => {
    expect(formatColorDisplay('element')).toBe('element');
  });
});

/* ================================================================== */
/*  applyColor                                                         */
/* ================================================================== */

describe('applyColor', () => {
  const selSpec = { model: 0 };

  it('applies element scheme via setStyle and renders', () => {
    const reps = new Set(['cartoon']);
    applyColor(selSpec, reps, 'element');

    expect(mockViewer.setStyle).toHaveBeenCalled();
    expect(mockViewer.render).toHaveBeenCalled();
    // Verify the style object references the 'cartoon' key via repKey
    const styleArg = mockViewer.setStyle.mock.calls[0][1];
    expect(styleArg).toHaveProperty('cartoon');
  });

  it('applies a named solid color (red) using COLOR_MAP hex', () => {
    const reps = new Set(['line']);
    applyColor(selSpec, reps, 'red');

    const [sel, styleObj] = mockViewer.setStyle.mock.calls[0];
    expect(sel).toEqual(selSpec);
    expect(styleObj.line).toHaveProperty('color', '#FF0000');
    expect(mockViewer.render).toHaveBeenCalled();
  });

  it('applies a raw hex color directly', () => {
    const reps = new Set(['stick']);
    applyColor(selSpec, reps, '#ABCDEF');

    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    expect(styleObj.stick).toHaveProperty('color', '#ABCDEF');
  });

  it('defaults to line representation when representations set is empty', () => {
    const reps = new Set();
    applyColor(selSpec, reps, 'red');

    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    expect(styleObj).toHaveProperty('line');
    expect(styleObj.line).toHaveProperty('color', '#FF0000');
  });

  it('handles element with carbonHex override (calls setStyle twice)', () => {
    const reps = new Set(['cartoon']);
    applyColor(selSpec, reps, 'element:#00FF00');

    // First call: element colorscheme
    expect(mockViewer.setStyle.mock.calls.length).toBeGreaterThanOrEqual(2);
    const firstCall = mockViewer.setStyle.mock.calls[0];
    expect(firstCall[1].cartoon).toHaveProperty('colorscheme');

    // Second call: carbon override
    const secondCall = mockViewer.setStyle.mock.calls[1];
    expect(secondCall[0]).toHaveProperty('elem', 'C');
    expect(secondCall[1].cartoon).toHaveProperty('color', '#00FF00');
  });

  it('applies chain palette with custom colorscheme from selectedAtoms', () => {
    mockViewer.selectedAtoms.mockReturnValue([
      { chain: 'A' },
      { chain: 'B' },
      { chain: 'A' },
    ]);

    const reps = new Set(['cartoon']);
    applyColor(selSpec, reps, 'chain:pastel');

    expect(mockViewer.selectedAtoms).toHaveBeenCalled();
    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    // Should have a custom colorscheme with prop:'chain' and a map
    expect(styleObj.cartoon.colorscheme).toHaveProperty('prop', 'chain');
    expect(styleObj.cartoon.colorscheme).toHaveProperty('map');
    expect(styleObj.cartoon.colorscheme.map).toHaveProperty('A');
    expect(styleObj.cartoon.colorscheme.map).toHaveProperty('B');
  });

  it('applies ss palette with default key (uses built-in ssJmol)', () => {
    const reps = new Set(['cartoon']);
    applyColor(selSpec, reps, 'ss:default');

    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    // 'default' palette should NOT produce a customScheme — uses 'ssJmol'
    expect(styleObj.cartoon.colorscheme).toBe('ssJmol');
  });

  it('applies ss palette with non-default key (custom map)', () => {
    const reps = new Set(['cartoon']);
    applyColor(selSpec, reps, 'ss:cool');

    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    expect(styleObj.cartoon.colorscheme).toHaveProperty('prop', 'ss');
    expect(styleObj.cartoon.colorscheme).toHaveProperty('map');
  });

  it('applies bfactor scheme using colorfunc instead of colorscheme', () => {
    const reps = new Set(['cartoon']);
    applyColor(selSpec, reps, 'bfactor');

    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    expect(styleObj.cartoon).toHaveProperty('colorfunc');
    expect(typeof styleObj.cartoon.colorfunc).toBe('function');
  });

  it('applies bfactor with custom settings from state', () => {
    getState.mockReturnValue({
      objects: new Map(),
      settings: { bfactorMin: 5, bfactorMax: 80 },
    });

    const reps = new Set(['cartoon']);
    applyColor(selSpec, reps, 'bfactor');

    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    expect(typeof styleObj.cartoon.colorfunc).toBe('function');
  });

  it('applies color across multiple representations', () => {
    const reps = new Set(['cartoon', 'stick']);
    applyColor(selSpec, reps, 'green');

    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    expect(styleObj.cartoon).toHaveProperty('color', '#00FF00');
    expect(styleObj.stick).toHaveProperty('color', '#00FF00');
  });
});

/* ================================================================== */
/*  applyColorToSelection                                              */
/* ================================================================== */

describe('applyColorToSelection', () => {
  it('iterates over visible objects and applies color per object', () => {
    const obj1 = { model: 0, visible: true, representations: new Set(['cartoon']) };
    const obj2 = { model: 1, visible: true, representations: new Set(['stick']) };
    const objects = new Map([['obj1', obj1], ['obj2', obj2]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyColorToSelection({}, 'red');

    // setStyle should be called once per visible object
    expect(mockViewer.setStyle).toHaveBeenCalledTimes(2);
    // First call scoped to model 0
    expect(mockViewer.setStyle.mock.calls[0][0]).toHaveProperty('model', 0);
    // Second call scoped to model 1
    expect(mockViewer.setStyle.mock.calls[1][0]).toHaveProperty('model', 1);
    expect(mockViewer.render).toHaveBeenCalled();
  });

  it('skips invisible objects', () => {
    const obj1 = { model: 0, visible: false, representations: new Set(['cartoon']) };
    const obj2 = { model: 1, visible: true, representations: new Set(['stick']) };
    const objects = new Map([['obj1', obj1], ['obj2', obj2]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyColorToSelection({}, 'blue');

    // Only one call for the visible object
    expect(mockViewer.setStyle).toHaveBeenCalledTimes(1);
    expect(mockViewer.setStyle.mock.calls[0][0]).toHaveProperty('model', 1);
  });

  it('defaults to line rep for objects with empty representations', () => {
    const obj = { model: 0, visible: true, representations: new Set() };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyColorToSelection({}, 'red');

    const styleObj = mockViewer.setStyle.mock.calls[0][1];
    expect(styleObj).toHaveProperty('line');
  });

  it('merges selSpec with object model', () => {
    const obj = { model: 2, visible: true, representations: new Set(['cartoon']) };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyColorToSelection({ chain: 'A' }, 'red');

    const selArg = mockViewer.setStyle.mock.calls[0][0];
    expect(selArg).toHaveProperty('chain', 'A');
    expect(selArg).toHaveProperty('model', 2);
  });

  it('preserves per-atom styles when atoms have heterogeneous representations', () => {
    // Simulate what happens after "preset sites": some atoms have cartoon only,
    // some have stick only, some have both
    const cartoonAtoms = [
      { serial: 1, style: { cartoon: {} } },
      { serial: 2, style: { cartoon: {} } },
    ];
    const stickAtoms = [
      { serial: 10, style: { stick: { radius: 0.25 } } },
    ];
    const bothAtoms = [
      { serial: 20, style: { cartoon: {}, stick: { radius: 0.25 } } },
    ];
    const allAtoms = [...cartoonAtoms, ...stickAtoms, ...bothAtoms];
    mockViewer.selectedAtoms.mockReturnValue(allAtoms);

    const obj = { model: 0, visible: true, representations: new Set(['cartoon', 'stick']) };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyColorToSelection({}, 'ss:cool');

    // Should call setStyle once per unique representation group (3 groups here)
    expect(mockViewer.setStyle).toHaveBeenCalledTimes(3);

    // Cartoon-only group: style should only have cartoon key
    const cartoonCall = mockViewer.setStyle.mock.calls.find(
      c => c[1].cartoon && !c[1].stick
    );
    expect(cartoonCall).toBeDefined();
    expect(cartoonCall[0]).toHaveProperty('serial', [1, 2]);

    // Stick-only group: style should only have stick key
    const stickCall = mockViewer.setStyle.mock.calls.find(
      c => c[1].stick && !c[1].cartoon
    );
    expect(stickCall).toBeDefined();
    expect(stickCall[0]).toHaveProperty('serial', [10]);

    // Both group: style should have both keys
    const bothCall = mockViewer.setStyle.mock.calls.find(
      c => c[1].cartoon && c[1].stick
    );
    expect(bothCall).toBeDefined();
    expect(bothCall[0]).toHaveProperty('serial', [20]);
  });

  it('uses original selSpec when all atoms share the same reps (single group)', () => {
    // All atoms have the same style — should use original selSpec, not serial-based
    const atoms = [
      { serial: 1, style: { cartoon: {} } },
      { serial: 2, style: { cartoon: {} } },
    ];
    mockViewer.selectedAtoms.mockReturnValue(atoms);

    const obj = { model: 0, visible: true, representations: new Set(['cartoon']) };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyColorToSelection({}, 'red');

    // Single group → uses the original selSpec (model: 0), not serial-based
    expect(mockViewer.setStyle).toHaveBeenCalledTimes(1);
    const selArg = mockViewer.setStyle.mock.calls[0][0];
    expect(selArg).toHaveProperty('model', 0);
    expect(selArg).not.toHaveProperty('serial');
  });
});

/* ================================================================== */
/*  applyLabel                                                         */
/* ================================================================== */

describe('applyLabel', () => {
  it('clears all labels when prop is "clear"', () => {
    applyLabel({}, 'clear');

    expect(clearAllLabels).toHaveBeenCalled();
    expect(mockViewer.render).toHaveBeenCalled();
    // Should NOT call addTrackedLabel or selectedAtoms
    expect(addTrackedLabel).not.toHaveBeenCalled();
  });

  it('labels all atoms by atom name for prop="atom"', () => {
    mockViewer.selectedAtoms.mockReturnValue([
      { atom: 'CA', x: 1, y: 2, z: 3, serial: 1 },
      { atom: 'CB', x: 4, y: 5, z: 6, serial: 2 },
    ]);

    applyLabel({}, 'atom');

    expect(addTrackedLabel).toHaveBeenCalledTimes(2);
    expect(addTrackedLabel).toHaveBeenCalledWith('CA', { x: 1, y: 2, z: 3 });
    expect(addTrackedLabel).toHaveBeenCalledWith('CB', { x: 4, y: 5, z: 6 });
    expect(mockViewer.render).toHaveBeenCalled();
  });

  it('filters to CA atoms for prop="resn"', () => {
    mockViewer.selectedAtoms.mockReturnValue([
      { atom: 'CA', resn: 'ALA', x: 1, y: 2, z: 3 },
      { atom: 'CB', resn: 'ALA', x: 4, y: 5, z: 6 },
      { atom: 'CA', resn: 'GLY', x: 7, y: 8, z: 9 },
    ]);

    applyLabel({}, 'resn');

    // Only CA atoms are labeled
    expect(addTrackedLabel).toHaveBeenCalledTimes(2);
    expect(addTrackedLabel).toHaveBeenCalledWith('ALA', { x: 1, y: 2, z: 3 });
    expect(addTrackedLabel).toHaveBeenCalledWith('GLY', { x: 7, y: 8, z: 9 });
  });

  it('filters to CA atoms for prop="resi"', () => {
    mockViewer.selectedAtoms.mockReturnValue([
      { atom: 'CA', resi: 42, x: 1, y: 2, z: 3 },
      { atom: 'N', resi: 42, x: 4, y: 5, z: 6 },
    ]);

    applyLabel({}, 'resi');

    expect(addTrackedLabel).toHaveBeenCalledTimes(1);
    expect(addTrackedLabel).toHaveBeenCalledWith('42', { x: 1, y: 2, z: 3 });
  });

  it('filters to CA atoms for prop="chain"', () => {
    mockViewer.selectedAtoms.mockReturnValue([
      { atom: 'CA', chain: 'A', x: 1, y: 2, z: 3 },
      { atom: 'O', chain: 'A', x: 4, y: 5, z: 6 },
    ]);

    applyLabel({}, 'chain');

    expect(addTrackedLabel).toHaveBeenCalledTimes(1);
    expect(addTrackedLabel).toHaveBeenCalledWith('A', { x: 1, y: 2, z: 3 });
  });

  it('labels all atoms by element for prop="elem"', () => {
    mockViewer.selectedAtoms.mockReturnValue([
      { atom: 'CA', elem: 'C', x: 1, y: 2, z: 3 },
      { atom: 'N', elem: 'N', x: 4, y: 5, z: 6 },
    ]);

    applyLabel({}, 'elem');

    expect(addTrackedLabel).toHaveBeenCalledTimes(2);
    expect(addTrackedLabel).toHaveBeenCalledWith('C', { x: 1, y: 2, z: 3 });
    expect(addTrackedLabel).toHaveBeenCalledWith('N', { x: 4, y: 5, z: 6 });
  });

  it('labels by serial for prop="index"', () => {
    mockViewer.selectedAtoms.mockReturnValue([
      { atom: 'CA', serial: 100, x: 1, y: 2, z: 3 },
    ]);

    applyLabel({}, 'index');

    expect(addTrackedLabel).toHaveBeenCalledWith('100', { x: 1, y: 2, z: 3 });
  });

  it('falls back to prop name for unknown property', () => {
    mockViewer.selectedAtoms.mockReturnValue([
      { atom: 'CA', customProp: 'xyz', x: 0, y: 0, z: 0 },
    ]);

    applyLabel({}, 'customProp');

    expect(addTrackedLabel).toHaveBeenCalledWith('xyz', { x: 0, y: 0, z: 0 });
  });
});

/* ================================================================== */
/*  applyShow                                                          */
/* ================================================================== */

describe('applyShow', () => {
  const selSpec = { model: 0 };

  it('adds representation and calls addStyle for normal case', () => {
    const obj = { representations: new Set(['cartoon']) };
    applyShow(selSpec, 'stick', obj);

    expect(obj.representations.has('stick')).toBe(true);
    expect(mockViewer.addStyle).toHaveBeenCalledWith(selSpec, { stick: {} });
    expect(mockViewer.render).toHaveBeenCalled();
    expect(notifyStateChange).toHaveBeenCalled();
  });

  it('skip visual: adding line when stick already exists', () => {
    const obj = { representations: new Set(['stick']) };
    applyShow(selSpec, 'line', obj);

    expect(obj.representations.has('line')).toBe(true);
    // Should NOT call addStyle or setStyle since sticks cover lines
    expect(mockViewer.addStyle).not.toHaveBeenCalled();
    expect(mockViewer.setStyle).not.toHaveBeenCalled();
    expect(mockViewer.render).toHaveBeenCalled();
    expect(notifyStateChange).toHaveBeenCalled();
  });

  it('rebuild visual: adding stick when line already exists', () => {
    const obj = { representations: new Set(['line']) };
    applyShow(selSpec, 'stick', obj);

    expect(obj.representations.has('stick')).toBe(true);
    expect(obj.representations.has('line')).toBe(true);
    // Should clear and rebuild — setStyle({}) then addStyle for each non-skipped rep
    expect(mockViewer.setStyle).toHaveBeenCalledWith(selSpec, {});
    // Line is skipped because stick is present, so only stick gets addStyle
    expect(mockViewer.addStyle).toHaveBeenCalledWith(selSpec, { stick: {} });
  });

  it('rebuild visual: skips line rep when stick is present', () => {
    const obj = { representations: new Set(['line', 'cartoon']) };
    applyShow(selSpec, 'stick', obj);

    // After adding stick, rebuild should skip line and add cartoon + stick
    const addedReps = mockViewer.addStyle.mock.calls.map(c => Object.keys(c[1])[0]);
    expect(addedReps).toContain('stick');
    expect(addedReps).toContain('cartoon');
    expect(addedReps).not.toContain('line');
  });

  it('calls notifyStateChange after render', () => {
    const obj = { representations: new Set() };
    applyShow(selSpec, 'cartoon', obj);

    expect(notifyStateChange).toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  applyHide                                                          */
/* ================================================================== */

describe('applyHide', () => {
  const selSpec = { model: 0 };

  it('hides everything: clears all reps and sets empty style', () => {
    const obj = { representations: new Set(['cartoon', 'stick']) };
    applyHide(selSpec, 'everything', obj);

    expect(mockViewer.setStyle).toHaveBeenCalledWith(selSpec, {});
    expect(obj.representations.size).toBe(0);
    expect(mockViewer.render).toHaveBeenCalled();
    expect(notifyStateChange).toHaveBeenCalled();
  });

  it('hides a specific rep and rebuilds remaining', () => {
    const obj = { representations: new Set(['cartoon', 'stick']) };
    applyHide(selSpec, 'cartoon', obj);

    expect(obj.representations.has('cartoon')).toBe(false);
    expect(obj.representations.has('stick')).toBe(true);
    expect(mockViewer.setStyle).toHaveBeenCalledWith(selSpec, {});
    expect(mockViewer.addStyle).toHaveBeenCalledWith(selSpec, { stick: {} });
  });

  it('line/stick interaction on rebuild: skips line when stick remains', () => {
    const obj = { representations: new Set(['line', 'stick', 'cartoon']) };
    applyHide(selSpec, 'cartoon', obj);

    // Rebuild should skip line because stick is still present
    const addedReps = mockViewer.addStyle.mock.calls.map(c => Object.keys(c[1])[0]);
    expect(addedReps).toContain('stick');
    expect(addedReps).not.toContain('line');
    expect(addedReps).not.toContain('cartoon');
  });

  it('rebuilds line when stick is removed and line remains', () => {
    const obj = { representations: new Set(['line', 'stick']) };
    applyHide(selSpec, 'stick', obj);

    expect(obj.representations.has('line')).toBe(true);
    expect(obj.representations.has('stick')).toBe(false);
    const addedReps = mockViewer.addStyle.mock.calls.map(c => Object.keys(c[1])[0]);
    expect(addedReps).toContain('line');
  });

  it('calls notifyStateChange', () => {
    const obj = { representations: new Set(['cartoon']) };
    applyHide(selSpec, 'cartoon', obj);

    expect(notifyStateChange).toHaveBeenCalled();
  });

  it('preserves per-atom styles (colors) when hiding a rep', () => {
    // After "preset sites": some atoms have cartoon+stick with color data,
    // some have cartoon only. Hiding stick should preserve cartoon colors.
    mockViewer.selectedAtoms.mockReturnValue([
      { serial: 1, style: { cartoon: { colorscheme: 'Jmol' }, stick: { radius: 0.25 } } },
      { serial: 2, style: { cartoon: { colorscheme: 'Jmol' } } },
    ]);

    const obj = { representations: new Set(['cartoon', 'stick']) };
    applyHide(selSpec, 'stick', obj);

    // setStyle({}) clears, then two groups are re-applied with remaining styles
    // Group 1 (serial 1): remaining = { cartoon: { colorscheme: 'Jmol' } }
    // Group 2 (serial 2): remaining = { cartoon: { colorscheme: 'Jmol' } }
    // Same keys → single group → uses original selSpec
    const restoreCalls = mockViewer.setStyle.mock.calls.filter(
      c => Object.keys(c[1]).length > 0
    );
    expect(restoreCalls.length).toBe(1);
    expect(restoreCalls[0][1]).toHaveProperty('cartoon');
    expect(restoreCalls[0][1].cartoon).toHaveProperty('colorscheme', 'Jmol');
    expect(restoreCalls[0][1]).not.toHaveProperty('stick');
  });
});

/* ================================================================== */
/*  applyHideSelection                                                 */
/* ================================================================== */

describe('applyHideSelection', () => {
  it('hides everything with setStyle({}) for "everything" rep', () => {
    applyHideSelection({}, 'everything');

    expect(mockViewer.setStyle).toHaveBeenCalledWith({}, {});
    expect(mockViewer.render).toHaveBeenCalled();
  });

  it('iterates visible objects and rebuilds without the hidden rep', () => {
    const obj1 = { model: 0, visible: true, representations: new Set(['cartoon', 'stick']) };
    const obj2 = { model: 1, visible: true, representations: new Set(['line']) };
    const objects = new Map([['obj1', obj1], ['obj2', obj2]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyHideSelection({}, 'cartoon');

    // obj1: setStyle({}) + addStyle for stick (cartoon skipped)
    // obj2: setStyle({}) + addStyle for line (cartoon not in set, line remains)
    expect(mockViewer.setStyle).toHaveBeenCalledTimes(2);
    expect(mockViewer.render).toHaveBeenCalled();
  });

  it('skips invisible objects', () => {
    const obj1 = { model: 0, visible: false, representations: new Set(['cartoon']) };
    const obj2 = { model: 1, visible: true, representations: new Set(['stick']) };
    const objects = new Map([['obj1', obj1], ['obj2', obj2]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyHideSelection({}, 'cartoon');

    // Only obj2 is processed
    expect(mockViewer.setStyle).toHaveBeenCalledTimes(1);
    expect(mockViewer.setStyle.mock.calls[0][0]).toHaveProperty('model', 1);
  });

  it('line/stick interaction: skips line when stick present during rebuild', () => {
    const obj = { model: 0, visible: true, representations: new Set(['line', 'stick', 'sphere']) };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyHideSelection({}, 'sphere');

    const addedReps = mockViewer.addStyle.mock.calls.map(c => Object.keys(c[1])[0]);
    expect(addedReps).toContain('stick');
    expect(addedReps).not.toContain('line');
    expect(addedReps).not.toContain('sphere');
  });

  it('merges selSpec with each object model', () => {
    const obj = { model: 3, visible: true, representations: new Set(['cartoon']) };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyHideSelection({ chain: 'A' }, 'cartoon');

    const selArg = mockViewer.setStyle.mock.calls[0][0];
    expect(selArg).toHaveProperty('chain', 'A');
    expect(selArg).toHaveProperty('model', 3);
  });

  it('preserves per-atom color data when hiding a rep on a selection', () => {
    // Simulate "preset sites" then "hide sticks, not resn TA1":
    // cartoon-only atoms keep their colorscheme, cartoon+stick atoms lose
    // only the stick rep but keep cartoon colorscheme intact.
    const atoms = [
      { serial: 1, style: { cartoon: { colorscheme: 'Jmol' } } },
      { serial: 2, style: { cartoon: { colorscheme: 'Jmol' }, stick: { radius: 0.25 } } },
      { serial: 3, style: { cartoon: { colorscheme: 'Jmol' }, stick: { radius: 0.25 } } },
    ];
    mockViewer.selectedAtoms.mockReturnValue(atoms);

    const obj = { model: 0, visible: true, representations: new Set(['cartoon', 'stick']) };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyHideSelection({}, 'stick');

    // All atoms end up with { cartoon: { colorscheme: 'Jmol' } } — single group
    const restoreCalls = mockViewer.setStyle.mock.calls.filter(
      c => Object.keys(c[1]).length > 0
    );
    expect(restoreCalls.length).toBe(1);
    expect(restoreCalls[0][1]).toHaveProperty('cartoon');
    expect(restoreCalls[0][1].cartoon).toHaveProperty('colorscheme', 'Jmol');
    expect(restoreCalls[0][1]).not.toHaveProperty('stick');
  });

  it('hides rep from atoms that only had that rep (making them invisible)', () => {
    // Het atoms with stick-only: hiding stick removes all representations
    const atoms = [
      { serial: 10, style: { stick: { colorscheme: 'Jmol' } } },
      { serial: 20, style: { cartoon: { colorscheme: 'Jmol' }, stick: { radius: 0.25 } } },
    ];
    mockViewer.selectedAtoms.mockReturnValue(atoms);

    const obj = { model: 0, visible: true, representations: new Set(['cartoon', 'stick']) };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyHideSelection({}, 'stick');

    // Serial 10 has empty remaining style — skipped (becomes invisible)
    // Serial 20 gets { cartoon: { colorscheme: 'Jmol' } }
    const restoreCalls = mockViewer.setStyle.mock.calls.filter(
      c => Object.keys(c[1]).length > 0
    );
    expect(restoreCalls.length).toBe(1);
    expect(restoreCalls[0][0]).toHaveProperty('serial', [20]);
    expect(restoreCalls[0][1]).toEqual({ cartoon: { colorscheme: 'Jmol' } });
  });

  it('preserves per-atom color differences when atoms share same rep keys', () => {
    // After "preset sites", element-by-chain coloring gives atoms the same
    // representation keys (cartoon) but different style values: non-carbon atoms
    // get { colorscheme: 'Jmol' } while carbon atoms get { color: '#FBF8CC' }.
    // Hiding sticks must preserve these different values in separate groups.
    const atoms = [
      { serial: 1, style: { cartoon: { colorscheme: 'Jmol' }, stick: { colorscheme: 'Jmol' } } },
      { serial: 2, style: { cartoon: { color: '#FBF8CC' }, stick: { color: '#FBF8CC' } } },
      { serial: 3, style: { cartoon: { color: '#FDE4CF' }, stick: { color: '#FDE4CF' } } },
      { serial: 4, style: { cartoon: { colorscheme: 'Jmol' } } },
    ];
    mockViewer.selectedAtoms.mockReturnValue(atoms);

    const obj = { model: 0, visible: true, representations: new Set(['cartoon', 'stick']) };
    const objects = new Map([['obj1', obj]]);
    getState.mockReturnValue({ objects, settings: {} });

    applyHideSelection({}, 'stick');

    // Should produce 3 distinct groups (not 1 merged group):
    //   1. { cartoon: { colorscheme: 'Jmol' } } — serials [1, 4]
    //   2. { cartoon: { color: '#FBF8CC' } } — serial [2]
    //   3. { cartoon: { color: '#FDE4CF' } } — serial [3]
    const restoreCalls = mockViewer.setStyle.mock.calls.filter(
      c => Object.keys(c[1]).length > 0
    );
    expect(restoreCalls.length).toBe(3);

    // Find each group by its style content
    const jmolGroup = restoreCalls.find(c => c[1].cartoon?.colorscheme === 'Jmol');
    const chainAGroup = restoreCalls.find(c => c[1].cartoon?.color === '#FBF8CC');
    const chainBGroup = restoreCalls.find(c => c[1].cartoon?.color === '#FDE4CF');

    expect(jmolGroup).toBeDefined();
    expect(jmolGroup[0]).toHaveProperty('serial', [1, 4]);
    expect(jmolGroup[1]).not.toHaveProperty('stick');

    expect(chainAGroup).toBeDefined();
    expect(chainAGroup[0]).toHaveProperty('serial', [2]);
    expect(chainAGroup[1]).not.toHaveProperty('stick');

    expect(chainBGroup).toBeDefined();
    expect(chainBGroup[0]).toHaveProperty('serial', [3]);
    expect(chainBGroup[1]).not.toHaveProperty('stick');
  });
});

/* ================================================================== */
/*  Line/stick key-collision handling                                   */
/* ================================================================== */

describe('line/stick key collision', () => {
  /**
   * Enable realistic repKey/repStyle mocks where 'line' maps to the
   * 'stick' key (matching real viewer behavior).
   */
  function useRealisticLineMock() {
    repKey.mockImplementation(r => r === 'line' ? 'stick' : r);
    repStyle.mockImplementation(r => {
      if (r === 'line') return { stick: { radius: 0.05, doubleBondScaling: 1.5 } };
      return { [r]: {} };
    });
  }

  describe('applyHide — object level', () => {
    const selSpec = { model: 0 };

    it('hiding line is a no-op when stick is active (sticks cover lines)', () => {
      useRealisticLineMock();
      const obj = { representations: new Set(['cartoon', 'stick']) };
      applyHide(selSpec, 'line', obj);

      // No style changes — the helper returns early
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
      expect(mockViewer.addStyle).not.toHaveBeenCalled();
      // Still renders and notifies
      expect(mockViewer.render).toHaveBeenCalled();
      expect(notifyStateChange).toHaveBeenCalled();
    });

    it('hiding stick downgrades to thin sticks when line is active', () => {
      useRealisticLineMock();
      mockViewer.selectedAtoms.mockReturnValue([
        { serial: 1, style: { stick: { radius: 0.25, colorscheme: 'Jmol' } } },
      ]);
      const obj = { representations: new Set(['line', 'stick']) };
      applyHide(selSpec, 'stick', obj);

      // Should replace thick stick params with thin stick (line) params
      const restoreCalls = mockViewer.setStyle.mock.calls.filter(
        c => Object.keys(c[1]).length > 0
      );
      expect(restoreCalls.length).toBe(1);
      // Geometry downgraded to line defaults
      expect(restoreCalls[0][1].stick).toHaveProperty('radius', 0.05);
      expect(restoreCalls[0][1].stick).toHaveProperty('doubleBondScaling', 1.5);
      // Color info preserved
      expect(restoreCalls[0][1].stick).toHaveProperty('colorscheme', 'Jmol');
      // obj.representations updated
      expect(obj.representations.has('stick')).toBe(false);
      expect(obj.representations.has('line')).toBe(true);
    });
  });

  describe('applyHideSelection — selection level', () => {
    it('hiding line is a no-op when object has stick (preset sites case)', () => {
      useRealisticLineMock();
      // After "preset sites": obj has cartoon + stick, no line
      const obj = { model: 0, visible: true, representations: new Set(['cartoon', 'stick']) };
      const objects = new Map([['obj1', obj]]);
      getState.mockReturnValue({ objects, settings: {} });

      applyHideSelection({}, 'line');

      // No style changes — collision detected, line hidden behind sticks
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
      expect(mockViewer.addStyle).not.toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
    });

    it('hiding stick preserves cartoon and downgrades stick to line params', () => {
      useRealisticLineMock();
      mockViewer.selectedAtoms.mockReturnValue([
        { serial: 1, style: { cartoon: { colorscheme: 'Jmol' }, stick: { radius: 0.25, color: '#FF0000' } } },
        { serial: 2, style: { cartoon: { colorscheme: 'Jmol' } } },
      ]);
      const obj = { model: 0, visible: true, representations: new Set(['line', 'stick', 'cartoon']) };
      const objects = new Map([['obj1', obj]]);
      getState.mockReturnValue({ objects, settings: {} });

      applyHideSelection({}, 'stick');

      // Atom 1: cartoon preserved, stick downgraded to line params with color kept
      // Atom 2: cartoon preserved, no stick to downgrade
      const restoreCalls = mockViewer.setStyle.mock.calls.filter(
        c => Object.keys(c[1]).length > 0
      );
      expect(restoreCalls.length).toBeGreaterThanOrEqual(1);

      // Find the call that has both cartoon and stick
      const bothCall = restoreCalls.find(c => c[1].cartoon && c[1].stick);
      if (bothCall) {
        expect(bothCall[1].stick).toHaveProperty('radius', 0.05);
        expect(bothCall[1].stick).toHaveProperty('color', '#FF0000');
        expect(bothCall[1].cartoon).toHaveProperty('colorscheme', 'Jmol');
      }

      // Find the call that has cartoon only (atom 2)
      const cartoonOnlyCall = restoreCalls.find(c => c[1].cartoon && !c[1].stick);
      if (cartoonOnlyCall) {
        expect(cartoonOnlyCall[1].cartoon).toHaveProperty('colorscheme', 'Jmol');
      }
    });
  });
});

/* ================================================================== */
/*  applyViewPreset                                                    */
/* ================================================================== */

describe('applyViewPreset', () => {
  it('calls applyPreset with viewer and returns its result', () => {
    const result = applyViewPreset('simple', { chain: 'A' });

    expect(applyPreset).toHaveBeenCalledWith('simple', mockViewer, { chain: 'A' });
    expect(result).toEqual(new Set(['line']));
  });

  it('passes undefined selSpec as undefined to applyPreset', () => {
    applyViewPreset('sites');

    expect(applyPreset).toHaveBeenCalledWith('sites', mockViewer, undefined);
  });
});

/* ================================================================== */
/*  getPresetLabel                                                     */
/* ================================================================== */

describe('getPresetLabel', () => {
  it('returns label for a known preset', () => {
    expect(getPresetLabel('simple')).toBe('Simple');
  });

  it('returns label for another known preset', () => {
    expect(getPresetLabel('sites')).toBe('Sites');
  });

  it('returns input for an unknown preset', () => {
    expect(getPresetLabel('nonexistent')).toBe('nonexistent');
  });

  it('is case-insensitive (uppercased input)', () => {
    expect(getPresetLabel('SIMPLE')).toBe('Simple');
  });
});
