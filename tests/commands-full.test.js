import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommandRegistry } from '../src/commands/registry.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockViewer = {
  selectedAtoms: vi.fn(() => []),
  setStyle: vi.fn(),
  addStyle: vi.fn(),
  render: vi.fn(),
  zoomTo: vi.fn(),
  center: vi.fn(),
  rotate: vi.fn(),
  translate: vi.fn(),
  setSlab: vi.fn(),
  zoom: vi.fn(),
  removeModel: vi.fn(),
  addLabel: vi.fn(),
  removeAllLabels: vi.fn(),
  removeAllShapes: vi.fn(),
  pngURI: vi.fn(() => 'data:image/png;base64,fake'),
  getView: vi.fn(() => [0, 0, 0, 1, 0, 0, 0, 1]),
  setView: vi.fn(),
  setBackgroundColor: vi.fn(),
};

const mockState = {
  objects: new Map(),
  selections: new Map(),
  activeSelection: null,
  selectionMode: 'atoms',
  settings: {
    bgColor: '#000000',
    theme: 'dark',
    userSetBgColor: false,
  },
  _listeners: [],
};

vi.mock('../src/viewer.js', () => ({
  getViewer: () => mockViewer,
  getAllAtoms: vi.fn(() => []),
  fetchPDB: vi.fn(async () => ({ getID: () => 0 })),
  loadModelData: vi.fn(() => ({ getID: () => 0 })),
  repStyle: vi.fn((rep) => {
    if (rep === 'line') return { stick: { radius: 0.05 } };
    if (rep === 'stick') return { stick: { radius: 0.25 } };
    if (rep === 'cartoon') return { cartoon: {} };
    if (rep === 'sphere') return { sphere: {} };
    if (rep === 'surface') return { surface: {} };
    if (rep === 'cross') return { cross: {} };
    if (rep === 'ribbon') return { ribbon: {} };
    return { [rep]: {} };
  }),
  repKey: vi.fn((rep) => (rep === 'line' ? 'stick' : rep)),
  orientView: vi.fn(),
  addTrackedLabel: vi.fn(),
  clearAllLabels: vi.fn(),
  removeModel: vi.fn(),
  clearHighlight: vi.fn(),
  applyHighlight: vi.fn(),
}));

vi.mock('../src/state.js', () => ({
  getState: () => mockState,
  addObject: vi.fn((name) => name),
  removeObject: vi.fn(),
  addSelection: vi.fn(),
  removeSelection: vi.fn(),
  renameSelection: vi.fn(),
  renameObject: vi.fn(),
  pruneSelections: vi.fn(),
  notifyStateChange: vi.fn(),
}));

vi.mock('../src/commands/resolve-selection.js', () => ({
  resolveSelection: vi.fn((str) => {
    if (!str || str === 'all') return { spec: {} };
    if (str === 'protein') return { spec: { hetflag: false } };
    if (str.startsWith('resn ')) return { spec: { resn: [str.replace('resn ', '')] } };
    return { spec: { resn: [str] } };
  }),
  getSelSpec: vi.fn((result) => result.spec || {}),
}));

vi.mock('../src/parser/selection.pegjs', () => ({
  parse: vi.fn((expr) => {
    if (expr === '__INVALID__') throw new Error('Syntax error');
    return { type: 'comparison', field: 'resn', op: '=', value: expr };
  }),
}));

vi.mock('../src/parser/evaluator.js', () => ({
  evaluate: vi.fn((ast, atoms) => atoms),
  toAtomSelectionSpec: vi.fn((ast) => {
    if (ast && ast.value) return { resn: [ast.value] };
    return null;
  }),
}));

vi.mock('../src/presets.js', () => ({
  applyPreset: vi.fn((name, viewer, selSpec) => {
    if (name.toLowerCase() === 'unknown') {
      throw new Error('Unknown preset "unknown". Available: Simple, Sites, Ball-and-Stick');
    }
    return new Set(['cartoon', 'stick']);
  }),
  PRESET_NAMES: ['simple', 'sites', 'ball-and-stick'],
  PRESETS: {
    simple: { label: 'Simple' },
    sites: { label: 'Sites' },
    'ball-and-stick': { label: 'Ball-and-Stick' },
  },
}));

vi.mock('../src/ui/color-swatches.js', () => ({
  buildBfactorScheme: vi.fn((min, max) => {
    return function colorfunc() { return 0xFFFFFF; };
  }),
  BFACTOR_DEFAULTS: { min: 10, max: 50 },
  CHAIN_PALETTES: {
    pastel: { label: 'Pastel', colors: ['#A3C4F3', '#B9FBC0'] },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { registerCameraCommands } from '../src/commands/camera.js';
import { registerDisplayCommands } from '../src/commands/display.js';
import { registerSelectionCommands } from '../src/commands/selection.js';
import { registerEditingCommands } from '../src/commands/editing.js';
import { registerExportCommands } from '../src/commands/export.js';
import { registerLabelingCommands } from '../src/commands/labeling.js';
import { registerLoadingCommands } from '../src/commands/loading.js';
import { registerStylingCommands } from '../src/commands/styling.js';
import { registerPresetCommands } from '../src/commands/preset.js';
import { registerAllCommands } from '../src/commands/index.js';

import { getViewer, orientView, addTrackedLabel, clearAllLabels, fetchPDB, clearHighlight, applyHighlight, loadModelData } from '../src/viewer.js';
import { addObject, removeObject, addSelection, removeSelection, renameSelection, renameObject, pruneSelections, notifyStateChange } from '../src/state.js';
import { resolveSelection, getSelSpec } from '../src/commands/resolve-selection.js';
import { parse } from '../src/parser/selection.pegjs';
import { toAtomSelectionSpec, evaluate } from '../src/parser/evaluator.js';
import { applyPreset } from '../src/presets.js';
import { buildBfactorScheme } from '../src/ui/color-swatches.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTerminal() {
  return {
    lines: [],
    print(msg, type) {
      this.lines.push({ msg, type });
    },
  };
}

function makeCtx(terminal) {
  return { terminal };
}

function resetMocks() {
  vi.clearAllMocks();
  mockState.objects.clear();
  mockState.selections.clear();
  mockState.activeSelection = null;
  mockState.selectionMode = 'atoms';
  mockState.settings = {
    bgColor: '#000000',
    theme: 'dark',
    userSetBgColor: false,
  };
  mockViewer.selectedAtoms.mockReturnValue([]);
}

// ---------------------------------------------------------------------------
// Camera Commands
// ---------------------------------------------------------------------------

describe('camera.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerCameraCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('zoom', () => {
    it('zooms to all atoms when no arguments', () => {
      registry.execute('zoom', ctx);
      expect(mockViewer.zoomTo).toHaveBeenCalledWith();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toBe('Zoomed to selection');
    });

    it('zooms to a selection when arguments provided', () => {
      registry.execute('zoom protein', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('protein');
      expect(mockViewer.zoomTo).toHaveBeenCalledWith({ hetflag: false });
      expect(mockViewer.render).toHaveBeenCalled();
    });
  });

  describe('center', () => {
    it('centers on all atoms when no arguments', () => {
      registry.execute('center', ctx);
      expect(mockViewer.center).toHaveBeenCalledWith();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toBe('Centered on selection');
    });

    it('centers on a selection when arguments provided', () => {
      registry.execute('center protein', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('protein');
      expect(mockViewer.center).toHaveBeenCalledWith({ hetflag: false });
      expect(mockViewer.render).toHaveBeenCalled();
    });
  });

  describe('orient', () => {
    it('orients all atoms when no arguments', () => {
      registry.execute('orient', ctx);
      expect(orientView).toHaveBeenCalledWith();
      expect(terminal.lines[0].msg).toBe('Oriented to selection');
    });

    it('orients to a selection when arguments provided', () => {
      registry.execute('orient protein', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('protein');
      expect(orientView).toHaveBeenCalledWith({ hetflag: false });
    });
  });

  describe('rotate', () => {
    it('rotates around x axis', () => {
      registry.execute('rotate x, 45', ctx);
      expect(mockViewer.rotate).toHaveBeenCalledWith(45, 'x');
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('45');
      expect(terminal.lines[0].msg).toContain('x');
    });

    it('rotates around y axis', () => {
      registry.execute('rotate y, 90', ctx);
      expect(mockViewer.rotate).toHaveBeenCalledWith(90, 'y');
    });

    it('rotates around z axis', () => {
      registry.execute('rotate z, 30', ctx);
      expect(mockViewer.rotate).toHaveBeenCalledWith(30, 'z');
    });

    it('throws on missing arguments', () => {
      expect(() => registry.execute('rotate', ctx)).toThrow('Usage: rotate');
    });

    it('throws on single argument (no angle)', () => {
      expect(() => registry.execute('rotate x', ctx)).toThrow('Usage: rotate');
    });

    it('throws on invalid axis', () => {
      expect(() => registry.execute('rotate w, 45', ctx)).toThrow('Axis must be x, y, or z');
    });

    it('throws on non-numeric angle', () => {
      expect(() => registry.execute('rotate x, abc', ctx)).toThrow('Angle must be a number');
    });

    it('handles uppercase axis by lowercasing', () => {
      registry.execute('rotate X, 10', ctx);
      expect(mockViewer.rotate).toHaveBeenCalledWith(10, 'x');
    });

    it('handles negative angle', () => {
      registry.execute('rotate x, -45', ctx);
      expect(mockViewer.rotate).toHaveBeenCalledWith(-45, 'x');
    });
  });

  describe('translate', () => {
    it('translates by x and y', () => {
      registry.execute('translate 1, 2', ctx);
      expect(mockViewer.translate).toHaveBeenCalledWith(1, 2);
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('1');
      expect(terminal.lines[0].msg).toContain('2');
    });

    it('handles floating point values', () => {
      registry.execute('translate 1.5, 2.7', ctx);
      expect(mockViewer.translate).toHaveBeenCalledWith(1.5, 2.7);
    });

    it('throws on missing arguments', () => {
      expect(() => registry.execute('translate', ctx)).toThrow('Usage: translate');
    });

    it('throws on single argument', () => {
      expect(() => registry.execute('translate 5', ctx)).toThrow('Usage: translate');
    });

    it('throws on non-numeric x', () => {
      expect(() => registry.execute('translate abc, 2', ctx)).toThrow('x and y must be numbers');
    });

    it('throws on non-numeric y', () => {
      expect(() => registry.execute('translate 1, abc', ctx)).toThrow('x and y must be numbers');
    });
  });

  describe('clip', () => {
    it('sets clipping planes', () => {
      registry.execute('clip 0, 100', ctx);
      expect(mockViewer.setSlab).toHaveBeenCalledWith(0, 100);
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('near=0');
      expect(terminal.lines[0].msg).toContain('far=100');
    });

    it('throws on missing arguments', () => {
      expect(() => registry.execute('clip', ctx)).toThrow('Usage: clip');
    });

    it('throws on single argument', () => {
      expect(() => registry.execute('clip 10', ctx)).toThrow('Usage: clip');
    });

    it('throws on non-numeric near', () => {
      expect(() => registry.execute('clip abc, 100', ctx)).toThrow('near and far must be numbers');
    });

    it('throws on non-numeric far', () => {
      expect(() => registry.execute('clip 0, abc', ctx)).toThrow('near and far must be numbers');
    });

    it('handles float clipping values', () => {
      registry.execute('clip 5.5, 95.2', ctx);
      expect(mockViewer.setSlab).toHaveBeenCalledWith(5.5, 95.2);
    });
  });

  describe('reset', () => {
    it('resets the view', () => {
      registry.execute('reset', ctx);
      expect(mockViewer.zoomTo).toHaveBeenCalledWith();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toBe('View reset');
    });
  });
});

// ---------------------------------------------------------------------------
// Display Commands
// ---------------------------------------------------------------------------

describe('display.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerDisplayCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('show', () => {
    it('throws when no arguments', () => {
      expect(() => registry.execute('show', ctx)).toThrow('Usage: show');
    });

    it('shows cartoon for all atoms', () => {
      registry.execute('show cartoon', ctx);
      expect(mockViewer.addStyle).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(notifyStateChange).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toBe('Showing cartoon');
    });

    it('shows sticks for a selection', () => {
      registry.execute('show sticks, resn ALA', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('resn ALA');
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('stick');
      expect(terminal.lines[0].msg).toContain('resn ALA');
    });

    it('shows lines representation', () => {
      registry.execute('show lines', ctx);
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('line');
    });

    it('shows sphere representation', () => {
      registry.execute('show sphere', ctx);
      expect(terminal.lines[0].msg).toContain('sphere');
    });

    it('shows surface representation', () => {
      registry.execute('show surface', ctx);
      expect(terminal.lines[0].msg).toContain('surface');
    });

    it('shows cross representation', () => {
      registry.execute('show cross', ctx);
      expect(terminal.lines[0].msg).toContain('cross');
    });

    it('shows ribbon representation', () => {
      registry.execute('show ribbon', ctx);
      expect(terminal.lines[0].msg).toContain('ribbon');
    });

    it('normalizes plural sticks to stick', () => {
      registry.execute('show sticks', ctx);
      expect(terminal.lines[0].msg).toContain('stick');
    });

    it('normalizes plural lines to line', () => {
      registry.execute('show lines', ctx);
      expect(terminal.lines[0].msg).toContain('line');
    });

    it('normalizes plural spheres to sphere', () => {
      registry.execute('show spheres', ctx);
      expect(terminal.lines[0].msg).toContain('sphere');
    });

    it('normalizes plural crosses to cross', () => {
      registry.execute('show crosses', ctx);
      expect(terminal.lines[0].msg).toContain('cross');
    });

    it('normalizes plural ribbons to ribbon', () => {
      registry.execute('show ribbons', ctx);
      expect(terminal.lines[0].msg).toContain('ribbon');
    });

    it('throws on unknown representation', () => {
      expect(() => registry.execute('show foobar', ctx)).toThrow('Unknown representation');
    });

    it('supports prefix matching for representation', () => {
      // "car" should match "cartoon" uniquely
      registry.execute('show car', ctx);
      expect(terminal.lines[0].msg).toContain('cartoon');
    });

    it('throws on ambiguous prefix', () => {
      // "s" matches stick, sticks, sphere, spheres, surface
      expect(() => registry.execute('show s', ctx)).toThrow('Ambiguous representation');
    });

    it('skips visual when adding line while stick is active (global)', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('show line', ctx);
      // Should still render and add 'line' to representations
      expect(mockObj.representations.has('line')).toBe(true);
      expect(mockViewer.render).toHaveBeenCalled();
    });

    it('rebuilds visual when adding stick while line is active (global)', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['line']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('show stick', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockObj.representations.has('stick')).toBe(true);
    });

    it('updates state for affected objects when no selection', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('show cartoon', ctx);
      expect(mockObj.representations.has('cartoon')).toBe(true);
    });

    it('updates state for model-specific selection', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(),
      };
      mockState.objects.set('mol', mockObj);
      resolveSelection.mockReturnValueOnce({ spec: { model: modelRef } });

      registry.execute('show cartoon, mol', ctx);
      expect(mockObj.representations.has('cartoon')).toBe(true);
    });
  });

  describe('hide', () => {
    it('throws when no arguments', () => {
      expect(() => registry.execute('hide', ctx)).toThrow('Usage: hide');
    });

    it('hides cartoon representation', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon', 'stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('hide cartoon', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(notifyStateChange).toHaveBeenCalled();
      expect(mockObj.representations.has('cartoon')).toBe(false);
      expect(terminal.lines[0].msg).toContain('cartoon');
    });

    it('hides everything (no selection)', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon', 'stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('hide everything', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith({ model: mockObj.model }, {});
      expect(mockObj.representations.size).toBe(0);
      expect(terminal.lines[0].msg).toContain('everything');
    });

    it('hides everything with model selection', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);
      resolveSelection.mockReturnValueOnce({ spec: { model: modelRef } });

      registry.execute('hide everything, mol', ctx);
      expect(mockObj.representations.size).toBe(0);
    });

    it('hides a rep with selection targeting model', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(['cartoon', 'stick']),
      };
      mockState.objects.set('mol', mockObj);
      resolveSelection.mockReturnValueOnce({ spec: { model: modelRef } });

      registry.execute('hide cartoon, mol', ctx);
      expect(mockObj.representations.has('cartoon')).toBe(false);
      expect(mockObj.representations.has('stick')).toBe(true);
    });

    it('hides a rep with atom-level selection (does not modify object reps)', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon', 'stick']),
      };
      mockState.objects.set('mol', mockObj);
      resolveSelection.mockReturnValueOnce({ spec: { resn: ['ALA'] } });

      registry.execute('hide cartoon, resn ALA', ctx);
      // atom-level: does not modify object-wide reps
      expect(mockObj.representations.has('cartoon')).toBe(true);
    });

    it('skips line in rebuild when stick is active (hide branch)', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['line', 'stick', 'cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('hide cartoon', ctx);
      // line should be skipped when stick is present
      expect(mockObj.representations.has('cartoon')).toBe(false);
      expect(mockObj.representations.has('stick')).toBe(true);
      expect(mockObj.representations.has('line')).toBe(true);
    });

    it('skips invisible objects during rebuild', () => {
      const mockObj = {
        model: {},
        visible: false,
        representations: new Set(['cartoon', 'stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('hide cartoon', ctx);
      // Object reps still modified but no addStyle calls for invisible objects
      expect(mockObj.representations.has('cartoon')).toBe(false);
    });

    it('throws on unknown representation', () => {
      expect(() => registry.execute('hide foobar', ctx)).toThrow('Unknown representation');
    });

    it('includes selection in output message', () => {
      registry.execute('hide cartoon, protein', ctx);
      expect(terminal.lines[0].msg).toContain('protein');
    });
  });

  describe('enable', () => {
    it('enables an object', () => {
      const mockModel = { show: vi.fn(), hide: vi.fn() };
      mockState.objects.set('mol', {
        model: mockModel,
        visible: false,
        representations: new Set(['cartoon']),
      });

      registry.execute('enable mol', ctx);
      expect(mockModel.show).toHaveBeenCalled();
      expect(mockState.objects.get('mol').visible).toBe(true);
      expect(mockViewer.render).toHaveBeenCalled();
      expect(notifyStateChange).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('Enabled');
      expect(terminal.lines[0].msg).toContain('mol');
    });

    it('throws on empty name', () => {
      expect(() => registry.execute('enable', ctx)).toThrow('Usage: enable');
    });

    it('throws on nonexistent object', () => {
      expect(() => registry.execute('enable nonexistent', ctx)).toThrow('not found');
    });
  });

  describe('disable', () => {
    it('disables an object', () => {
      const mockModel = { show: vi.fn(), hide: vi.fn() };
      mockState.objects.set('mol', {
        model: mockModel,
        visible: true,
        representations: new Set(['cartoon']),
      });

      registry.execute('disable mol', ctx);
      expect(mockModel.hide).toHaveBeenCalled();
      expect(mockState.objects.get('mol').visible).toBe(false);
      expect(mockViewer.render).toHaveBeenCalled();
      expect(notifyStateChange).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('Disabled');
      expect(terminal.lines[0].msg).toContain('mol');
    });

    it('throws on empty name', () => {
      expect(() => registry.execute('disable', ctx)).toThrow('Usage: disable');
    });

    it('throws on nonexistent object', () => {
      expect(() => registry.execute('disable nonexistent', ctx)).toThrow('not found');
    });
  });

  describe('normalizeRep edge cases', () => {
    it('throws on ambiguous prefix "rib" (matches ribbon, ribbons)', () => {
      // "rib" matches "ribbon" and "ribbons" in REP_MAP keys.
      // Even though both map to "ribbon", the code considers multi-key matches ambiguous.
      expect(() => registry.execute('show rib', ctx)).toThrow('Ambiguous representation');
    });

    it('throws on ambiguous prefix "li" (matches line, lines)', () => {
      // "li" matches "line" and "lines" -> 2 keys -> throws ambiguous
      expect(() => registry.execute('show li', ctx)).toThrow('Ambiguous representation');
    });

    it('handles exact match over prefix', () => {
      registry.execute('show line', ctx);
      expect(terminal.lines[0].msg).toContain('line');
    });

    it('handles case-insensitive input', () => {
      registry.execute('show CARTOON', ctx);
      expect(terminal.lines[0].msg).toContain('cartoon');
    });

    it('matches prefix with single key match "su" -> surface', () => {
      registry.execute('show su', ctx);
      expect(terminal.lines[0].msg).toContain('surface');
    });
  });
});

// ---------------------------------------------------------------------------
// Selection Commands
// ---------------------------------------------------------------------------

describe('selection.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerSelectionCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('sele', () => {
    it('creates a sele selection with simple spec', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([{ serial: 1 }, { serial: 2 }]);
      toAtomSelectionSpec.mockReturnValueOnce({ resn: ['ALA'] });

      registry.execute('sele resn ALA', ctx);
      expect(parse).toHaveBeenCalledWith('resn ALA');
      expect(addSelection).toHaveBeenCalledWith('sele', 'resn ALA', { resn: ['ALA'] }, 2);
      expect(terminal.lines[0].msg).toBe('(sele): 2 atoms');
    });

    it('falls back to index-based spec when toAtomSelectionSpec returns null', () => {
      toAtomSelectionSpec.mockReturnValueOnce(null);
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { serial: 10, atom: 'CA' },
        { serial: 20, atom: 'CB' },
      ]);
      evaluate.mockReturnValueOnce([{ serial: 10 }, { serial: 20 }]);

      registry.execute('sele complex_expr', ctx);
      expect(addSelection).toHaveBeenCalledWith(
        'sele',
        'complex_expr',
        { serial: [10, 20] },
        2
      );
    });

    it('throws when no expression provided', () => {
      expect(() => registry.execute('sele', ctx)).toThrow('Usage: sele');
    });

    it('throws on invalid expression (parse error)', () => {
      expect(() => registry.execute('sele __INVALID__', ctx)).toThrow(
        'Invalid selection expression'
      );
    });
  });

  describe('select', () => {
    it('defines a named selection with simple spec', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([{ serial: 5 }]);
      toAtomSelectionSpec.mockReturnValueOnce({ resn: ['GLY'] });

      registry.execute('select mysel, resn GLY', ctx);
      expect(addSelection).toHaveBeenCalledWith('mysel', 'resn GLY', { resn: ['GLY'] }, 1);
      expect(terminal.lines[0].msg).toContain('mysel');
      expect(terminal.lines[0].msg).toContain('1 atoms');
    });

    it('falls back to index-based spec when toAtomSelectionSpec returns null', () => {
      toAtomSelectionSpec.mockReturnValueOnce(null);
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { serial: 1 },
        { serial: 2 },
        { serial: 3 },
      ]);
      evaluate.mockReturnValueOnce([{ serial: 1 }, { serial: 3 }]);

      registry.execute('select pick, complex_expr', ctx);
      expect(addSelection).toHaveBeenCalledWith(
        'pick',
        'complex_expr',
        { serial: [1, 3] },
        2
      );
    });

    it('throws when no arguments provided', () => {
      expect(() => registry.execute('select', ctx)).toThrow('Usage: select');
    });

    it('throws when only name provided (no expression)', () => {
      expect(() => registry.execute('select mysel', ctx)).toThrow('Usage: select');
    });

    it('throws on invalid expression', () => {
      expect(() => registry.execute('select mysel, __INVALID__', ctx)).toThrow(
        'Invalid selection expression'
      );
    });

    it('joins multi-part expressions correctly', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([]);
      toAtomSelectionSpec.mockReturnValueOnce({ resn: ['ALA'] });

      registry.execute('select mysel, resn ALA, chain A', ctx);
      // The expression should be "resn ALA, chain A"
      expect(parse).toHaveBeenCalledWith('resn ALA, chain A');
    });
  });

  describe('count_atoms', () => {
    it('counts all atoms when no arguments', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([1, 2, 3]);

      registry.execute('count_atoms', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('all');
      expect(terminal.lines[0].msg).toBe('Count: 3 atoms');
    });

    it('counts atoms for a specific selection', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([1, 2, 3, 4, 5]);

      registry.execute('count_atoms protein', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('protein');
      expect(terminal.lines[0].msg).toBe('Count: 5 atoms');
    });

    it('handles atom-list results (no spec)', () => {
      resolveSelection.mockReturnValueOnce({ atoms: [{ serial: 1 }, { serial: 2 }] });

      registry.execute('count_atoms custom', ctx);
      expect(terminal.lines[0].msg).toBe('Count: 2 atoms');
    });
  });

  describe('get_model', () => {
    it('prints summary for all atoms when no arguments', () => {
      mockViewer.selectedAtoms.mockReturnValue([
        { chain: 'A', resi: '1', serial: 1 },
        { chain: 'A', resi: '2', serial: 2 },
        { chain: 'B', resi: '3', serial: 3 },
      ]);

      registry.execute('get_model', ctx);
      expect(terminal.lines[0].msg).toBe('Atoms: 3');
      expect(terminal.lines[1].msg).toBe('Residues: 3');
      expect(terminal.lines[2].msg).toContain('Chains: 2');
      expect(terminal.lines[2].msg).toContain('A');
      expect(terminal.lines[2].msg).toContain('B');
    });

    it('prints summary for a specific selection', () => {
      mockViewer.selectedAtoms.mockReturnValue([
        { chain: 'A', resi: '10', serial: 10 },
      ]);

      registry.execute('get_model protein', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('protein');
      expect(terminal.lines[0].msg).toBe('Atoms: 1');
    });

    it('handles atom-list results (no spec)', () => {
      resolveSelection.mockReturnValueOnce({
        atoms: [
          { chain: 'C', resi: '5', serial: 50 },
          { chain: 'C', resi: '6', serial: 51 },
        ],
      });
      // selectedAtoms still called for model membership check
      mockViewer.selectedAtoms.mockReturnValue([]);

      registry.execute('get_model custom', ctx);
      expect(terminal.lines[0].msg).toBe('Atoms: 2');
      expect(terminal.lines[1].msg).toBe('Residues: 2');
    });

    it('finds objects that contain selected atoms', () => {
      const modelRef = {};
      mockState.objects.set('1UBQ', { model: modelRef });

      mockViewer.selectedAtoms.mockImplementation((spec) => {
        if (spec && spec.model === modelRef) {
          return [{ serial: 1 }, { serial: 2 }];
        }
        return [
          { chain: 'A', resi: '1', serial: 1 },
          { chain: 'A', resi: '2', serial: 2 },
        ];
      });

      registry.execute('get_model', ctx);
      expect(terminal.lines[3].msg).toContain('1UBQ');
    });

    it('defaults to "all" when no args', () => {
      mockViewer.selectedAtoms.mockReturnValue([]);
      registry.execute('get_model', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('all');
    });
  });
});

// ---------------------------------------------------------------------------
// Editing Commands
// ---------------------------------------------------------------------------

describe('editing.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerEditingCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('remove', () => {
    it('throws when no arguments', () => {
      expect(() => registry.execute('remove', ctx)).toThrow('Usage: remove');
    });

    it('removes atoms matching selection', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { index: 0, serial: 1 },
        { index: 1, serial: 2 },
      ]);

      registry.execute('remove resn ALA', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('resn ALA');
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(pruneSelections).toHaveBeenCalledWith([0, 1]);
      expect(terminal.lines[0].msg).toBe('Removed 2 atoms');
    });

    it('prints info message when no atoms match', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([]);

      registry.execute('remove resn XYZ', ctx);
      expect(terminal.lines[0].msg).toBe('No atoms match the selection');
      expect(terminal.lines[0].type).toBe('info');
    });

    it('handles atom-list results (no spec)', () => {
      resolveSelection.mockReturnValueOnce({
        atoms: [{ index: 5, serial: 50 }],
      });
      getSelSpec.mockReturnValueOnce({ serial: [50] });

      registry.execute('remove custom', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toBe('Removed 1 atoms');
    });

    it('calls clearHighlight and applyHighlight after remove when activeSelection is set', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([{ index: 0, serial: 1 }]);
      mockState.activeSelection = { resn: ['ALA'] };

      registry.execute('remove resn ALA', ctx);
      expect(clearHighlight).toHaveBeenCalled();
      expect(applyHighlight).toHaveBeenCalledWith({ resn: ['ALA'] });
    });
  });

  describe('delete', () => {
    it('throws when no arguments', () => {
      expect(() => registry.execute('delete', ctx)).toThrow('Usage: delete');
    });

    it('deletes a selection', () => {
      mockState.selections.set('mysel', { spec: {}, atomCount: 5 });

      registry.execute('delete mysel', ctx);
      expect(removeSelection).toHaveBeenCalledWith('mysel');
      expect(terminal.lines[0].msg).toContain('Deleted selection');
      expect(terminal.lines[0].msg).toContain('mysel');
    });

    it('deletes an object', () => {
      const modelRef = {};
      mockState.objects.set('mol', {
        model: modelRef,
        visible: true,
        representations: new Set(['cartoon']),
      });
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { index: 0 },
        { index: 1 },
      ]);

      registry.execute('delete mol', ctx);
      expect(mockViewer.removeModel).toHaveBeenCalledWith(modelRef);
      expect(mockViewer.render).toHaveBeenCalled();
      expect(removeObject).toHaveBeenCalledWith('mol');
      expect(pruneSelections).toHaveBeenCalledWith([0, 1]);
      expect(terminal.lines[0].msg).toContain('Deleted object');
      expect(terminal.lines[0].msg).toContain('mol');
    });

    it('throws when name not found as selection or object', () => {
      expect(() => registry.execute('delete nonexistent', ctx)).toThrow('"nonexistent" not found');
    });

    it('prefers selection over object when name exists in both', () => {
      mockState.selections.set('dup', { spec: {}, atomCount: 3 });
      mockState.objects.set('dup', {
        model: {},
        visible: true,
        representations: new Set(),
      });

      registry.execute('delete dup', ctx);
      expect(removeSelection).toHaveBeenCalledWith('dup');
      expect(removeObject).not.toHaveBeenCalled();
    });

    it('calls clearHighlight and applyHighlight after delete when activeSelection is set', () => {
      const modelRef = {};
      mockState.objects.set('mol', { model: modelRef, visible: true, representations: new Set() });
      mockViewer.selectedAtoms.mockReturnValueOnce([]);
      mockState.activeSelection = { chain: 'A' };

      registry.execute('delete mol', ctx);
      expect(clearHighlight).toHaveBeenCalled();
      expect(applyHighlight).toHaveBeenCalledWith({ chain: 'A' });
    });
  });

  describe('set_name', () => {
    it('throws when insufficient arguments', () => {
      expect(() => registry.execute('set_name', ctx)).toThrow('Usage: set_name');
    });

    it('throws when only one argument', () => {
      expect(() => registry.execute('set_name old', ctx)).toThrow('Usage: set_name');
    });

    it('renames a selection', () => {
      mockState.selections.set('oldSel', { spec: {}, atomCount: 5 });

      registry.execute('set_name oldSel, newSel', ctx);
      expect(renameSelection).toHaveBeenCalledWith('oldSel', 'newSel');
      expect(terminal.lines[0].msg).toContain('Renamed selection');
      expect(terminal.lines[0].msg).toContain('oldSel');
      expect(terminal.lines[0].msg).toContain('newSel');
    });

    it('renames an object', () => {
      mockState.objects.set('oldObj', { model: {}, visible: true, representations: new Set() });

      registry.execute('set_name oldObj, newObj', ctx);
      expect(renameObject).toHaveBeenCalledWith('oldObj', 'newObj');
      expect(terminal.lines[0].msg).toContain('Renamed');
      expect(terminal.lines[0].msg).toContain('oldObj');
      expect(terminal.lines[0].msg).toContain('newObj');
    });

    it('prefers selection over object when name exists in both', () => {
      mockState.selections.set('dup', { spec: {} });
      mockState.objects.set('dup', { model: {} });

      registry.execute('set_name dup, newName', ctx);
      expect(renameSelection).toHaveBeenCalledWith('dup', 'newName');
      expect(renameObject).not.toHaveBeenCalled();
    });

    it('throws when old name not found', () => {
      expect(() => registry.execute('set_name nonexistent, newName', ctx)).toThrow(
        '"nonexistent" not found'
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Export Commands
// ---------------------------------------------------------------------------

describe('export.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerExportCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('png', () => {
    it('saves screenshot with default filename', () => {
      registry.execute('png', ctx);
      expect(mockViewer.pngURI).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('screenshot.png');
    });

    it('saves screenshot with custom filename', () => {
      registry.execute('png myimage', ctx);
      expect(terminal.lines[0].msg).toContain('myimage.png');
    });

    it('does not double-append .png extension', () => {
      registry.execute('png output.png', ctx);
      expect(terminal.lines[0].msg).toContain('output.png');
      // Should not be "output.png.png"
      expect(terminal.lines[0].msg).not.toContain('.png.png');
    });

    it('creates a download link element', () => {
      const clickSpy = vi.fn();
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        if (tag === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      registry.execute('png test', ctx);
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(clickSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  describe('help', () => {
    it('lists all commands when no arguments', () => {
      registry.execute('help', ctx);
      expect(terminal.lines[0].msg).toBe('Available commands:');
      // Should list png and help
      const allText = terminal.lines.map((l) => l.msg).join('\n');
      expect(allText).toContain('png');
      expect(allText).toContain('help');
    });

    it('shows help for a specific command', () => {
      registry.execute('help png', ctx);
      expect(terminal.lines[0].msg).toContain('png');
      expect(terminal.lines[0].type).toBe('info');
    });

    it('throws on unknown command', () => {
      expect(() => registry.execute('help nonexistent', ctx)).toThrow('Unknown command');
    });

    it('shows usage and description for specific command', () => {
      registry.execute('help png', ctx);
      expect(terminal.lines[0].msg).toContain('Usage:');
      expect(terminal.lines[1].msg).toContain('PNG');
    });

    it('ends generic help with tip to use help <command>', () => {
      registry.execute('help', ctx);
      const lastLine = terminal.lines[terminal.lines.length - 1];
      expect(lastLine.msg).toContain('help <command>');
    });
  });
});

// ---------------------------------------------------------------------------
// Labeling Commands
// ---------------------------------------------------------------------------

describe('labeling.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerLabelingCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('label', () => {
    it('throws when fewer than 2 arguments', () => {
      expect(() => registry.execute('label resn', ctx)).toThrow('Usage: label');
    });

    it('throws with only the property (no selection)', () => {
      expect(() => registry.execute('label name', ctx)).toThrow('Usage: label');
    });

    it('adds labels for a selection and property', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { atom: 'CA', resn: 'ALA', resi: '1', chain: 'A', elem: 'C', serial: 1, x: 0, y: 0, z: 0 },
        { atom: 'CB', resn: 'ALA', resi: '1', chain: 'A', elem: 'C', serial: 2, x: 1, y: 1, z: 1 },
      ]);

      registry.execute('label all, elem', ctx);
      expect(addTrackedLabel).toHaveBeenCalledTimes(2);
      expect(addTrackedLabel).toHaveBeenCalledWith('C', { x: 0, y: 0, z: 0 });
      expect(addTrackedLabel).toHaveBeenCalledWith('C', { x: 1, y: 1, z: 1 });
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('2 labels');
      expect(terminal.lines[0].msg).toContain('elem');
    });

    it('filters to CA atoms for residue-level properties (resn)', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { atom: 'CA', resn: 'ALA', resi: '1', chain: 'A', x: 0, y: 0, z: 0 },
        { atom: 'CB', resn: 'ALA', resi: '1', chain: 'A', x: 1, y: 1, z: 1 },
        { atom: 'CA', resn: 'GLY', resi: '2', chain: 'A', x: 2, y: 2, z: 2 },
      ]);

      registry.execute('label all, resn', ctx);
      // Only CA atoms should get labels
      expect(addTrackedLabel).toHaveBeenCalledTimes(2);
      expect(addTrackedLabel).toHaveBeenCalledWith('ALA', { x: 0, y: 0, z: 0 });
      expect(addTrackedLabel).toHaveBeenCalledWith('GLY', { x: 2, y: 2, z: 2 });
    });

    it('filters to CA atoms for resi property', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { atom: 'CA', resi: '10', x: 0, y: 0, z: 0 },
        { atom: 'N', resi: '10', x: 1, y: 1, z: 1 },
      ]);

      registry.execute('label all, resi', ctx);
      expect(addTrackedLabel).toHaveBeenCalledTimes(1);
      expect(addTrackedLabel).toHaveBeenCalledWith('10', { x: 0, y: 0, z: 0 });
    });

    it('filters to CA atoms for chain property', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { atom: 'CA', chain: 'A', x: 0, y: 0, z: 0 },
        { atom: 'CB', chain: 'A', x: 1, y: 1, z: 1 },
      ]);

      registry.execute('label all, chain', ctx);
      expect(addTrackedLabel).toHaveBeenCalledTimes(1);
    });

    it('uses "name" property mapping to atom prop', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { atom: 'CA', x: 0, y: 0, z: 0 },
      ]);

      registry.execute('label all, name', ctx);
      expect(addTrackedLabel).toHaveBeenCalledWith('CA', { x: 0, y: 0, z: 0 });
    });

    it('uses "atom" property mapping to atom prop', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { atom: 'CB', x: 1, y: 2, z: 3 },
      ]);

      registry.execute('label all, atom', ctx);
      expect(addTrackedLabel).toHaveBeenCalledWith('CB', { x: 1, y: 2, z: 3 });
    });

    it('uses "index" property mapping to serial', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { atom: 'CA', serial: 42, x: 0, y: 0, z: 0 },
      ]);

      registry.execute('label all, index', ctx);
      expect(addTrackedLabel).toHaveBeenCalledWith('42', { x: 0, y: 0, z: 0 });
    });

    it('throws on unknown label property', () => {
      expect(() => registry.execute('label all, foobar', ctx)).toThrow(
        'Unknown label property "foobar"'
      );
    });

    it('handles atom-list results (no spec)', () => {
      resolveSelection.mockReturnValueOnce({
        atoms: [{ atom: 'CA', elem: 'C', x: 0, y: 0, z: 0 }],
      });

      registry.execute('label custom, elem', ctx);
      expect(addTrackedLabel).toHaveBeenCalledWith('C', { x: 0, y: 0, z: 0 });
    });

    it('handles multi-part selection with property at end', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([
        { atom: 'CA', elem: 'C', x: 0, y: 0, z: 0 },
      ]);

      registry.execute('label resn ALA, chain A, elem', ctx);
      // Selection is "resn ALA, chain A", property is "elem"
      expect(resolveSelection).toHaveBeenCalledWith('resn ALA, chain A');
    });
  });

  describe('unlabel', () => {
    it('removes all labels', () => {
      registry.execute('unlabel', ctx);
      expect(clearAllLabels).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toBe('All labels removed');
    });
  });
});

// ---------------------------------------------------------------------------
// Loading Commands
// ---------------------------------------------------------------------------

describe('loading.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerLoadingCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('fetch', () => {
    it('fetches a PDB by valid 4-char ID', async () => {
      await registry.execute('fetch 1UBQ', ctx);
      expect(fetchPDB).toHaveBeenCalledWith('1UBQ');
      expect(addObject).toHaveBeenCalledWith('1UBQ', expect.anything(), 0);
      expect(terminal.lines[0].msg).toContain('Fetching PDB 1UBQ');
      expect(terminal.lines[1].msg).toContain('Loaded 1UBQ');
    });

    it('uppercases the PDB ID', async () => {
      await registry.execute('fetch 1ubq', ctx);
      expect(fetchPDB).toHaveBeenCalledWith('1UBQ');
    });

    it('throws on empty PDB ID', async () => {
      await expect(registry.execute('fetch', ctx)).rejects.toThrow('must be a 4-character PDB ID');
    });

    it('throws on invalid PDB ID (too short)', async () => {
      await expect(registry.execute('fetch AB', ctx)).rejects.toThrow('must be a 4-character PDB ID');
    });

    it('throws on invalid PDB ID (too long)', async () => {
      await expect(registry.execute('fetch ABCDE', ctx)).rejects.toThrow('must be a 4-character PDB ID');
    });

    it('throws on invalid PDB ID (special chars)', async () => {
      await expect(registry.execute('fetch AB!D', ctx)).rejects.toThrow('must be a 4-character PDB ID');
    });

    it('handles fetch failure', async () => {
      fetchPDB.mockRejectedValueOnce(new Error('Network error'));
      await expect(registry.execute('fetch 1UBQ', ctx)).rejects.toThrow('Failed to fetch 1UBQ');
    });

    it('handles model without getID', async () => {
      fetchPDB.mockResolvedValueOnce({});
      await registry.execute('fetch 1ABC', ctx);
      expect(addObject).toHaveBeenCalledWith('1ABC', expect.anything(), null);
    });

    it('prevents concurrent fetches', async () => {
      // Make the first fetch hang by never resolving
      let resolveFirst;
      fetchPDB.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));

      const firstFetch = registry.execute('fetch 1UBQ', ctx);

      // Second fetch should throw while first is in progress
      await expect(registry.execute('fetch 1ABC', ctx)).rejects.toThrow(
        'A fetch is already in progress'
      );

      // Resolve first fetch so fetching flag resets
      resolveFirst({ getID: () => 0 });
      await firstFetch;
    });

    it('resets fetching flag after failure', async () => {
      fetchPDB.mockRejectedValueOnce(new Error('fail'));
      await expect(registry.execute('fetch 1UBQ', ctx)).rejects.toThrow();

      // Next fetch should work (fetching flag was reset in finally)
      fetchPDB.mockResolvedValueOnce({ getID: () => 1 });
      await registry.execute('fetch 2ABC', ctx);
      expect(addObject).toHaveBeenCalled();
    });
  });

  describe('load', () => {
    it('creates a file input and clicks it', () => {
      const clickSpy = vi.fn();
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        if (tag === 'input') {
          el.click = clickSpy;
        }
        return el;
      });

      registry.execute('load', ctx);
      expect(document.createElement).toHaveBeenCalledWith('input');
      expect(clickSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('creates input with correct attributes', () => {
      const elements = [];
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        el.click = vi.fn();
        if (tag === 'input') elements.push(el);
        return el;
      });

      registry.execute('load', ctx);
      const input = elements[0];
      expect(input.type).toBe('file');
      expect(input.style.display).toBe('none');
      expect(input.accept).toContain('.pdb');
      expect(input.accept).toContain('.sdf');
      expect(input.accept).toContain('.mol2');

      vi.restoreAllMocks();
    });

    it('handles file selection via onchange callback', () => {
      let capturedInput = null;
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        el.click = vi.fn();
        if (tag === 'input') capturedInput = el;
        return el;
      });

      registry.execute('load', ctx);

      // Simulate file selection
      const mockFile = new File(['ATOM      1  CA  ALA A   1'], 'test.pdb', { type: 'text/plain' });
      Object.defineProperty(mockFile, 'name', { value: 'test.pdb' });

      // Simulate the onchange event
      capturedInput.onchange({ target: { files: [mockFile] } });

      // The FileReader.readAsText is async, but we can verify the flow was initiated
      vi.restoreAllMocks();
    });

    it('handles empty file selection (no file)', () => {
      let capturedInput = null;
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        el.click = vi.fn();
        if (tag === 'input') capturedInput = el;
        return el;
      });

      registry.execute('load', ctx);

      // Simulate file selection with no file
      capturedInput.onchange({ target: { files: [] } });

      // Should not print anything (early return)
      expect(terminal.lines.length).toBe(0);

      vi.restoreAllMocks();
    });

    it('loads a file successfully via FileReader onload', async () => {
      let capturedInput = null;
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        el.click = vi.fn();
        if (tag === 'input') capturedInput = el;
        return el;
      });

      registry.execute('load', ctx);

      // Create a real blob-backed file so FileReader can read it
      const fileContent = 'ATOM      1  CA  ALA A   1';
      const blob = new Blob([fileContent], { type: 'text/plain' });
      const mockFile = new File([blob], 'protein.pdb', { type: 'text/plain' });

      // Trigger the onchange callback
      capturedInput.onchange({ target: { files: [mockFile] } });

      // Wait for the FileReader to finish (microtask)
      await new Promise(r => setTimeout(r, 50));

      expect(loadModelData).toHaveBeenCalledWith(fileContent, 'pdb');
      expect(addObject).toHaveBeenCalledWith('protein', expect.anything(), 0);
      expect(terminal.lines[0].msg).toContain('Loaded');
      expect(terminal.lines[0].msg).toContain('protein.pdb');

      vi.restoreAllMocks();
    });

    it('handles loadModelData error in FileReader onload', async () => {
      let capturedInput = null;
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        el.click = vi.fn();
        if (tag === 'input') capturedInput = el;
        return el;
      });

      loadModelData.mockImplementationOnce(() => {
        throw new Error('Parse error');
      });

      registry.execute('load', ctx);

      const blob = new Blob(['bad data'], { type: 'text/plain' });
      const mockFile = new File([blob], 'bad.xyz', { type: 'text/plain' });

      capturedInput.onchange({ target: { files: [mockFile] } });

      await new Promise(r => setTimeout(r, 50));

      expect(terminal.lines[0].msg).toContain('Error loading file');
      expect(terminal.lines[0].msg).toContain('Parse error');
      expect(terminal.lines[0].type).toBe('error');

      vi.restoreAllMocks();
    });

    it('handles FileReader onerror', async () => {
      let capturedInput = null;
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        el.click = vi.fn();
        if (tag === 'input') capturedInput = el;
        return el;
      });

      // Override FileReader to simulate an error
      const OriginalFileReader = globalThis.FileReader;
      const mockReader = {
        onload: null,
        onerror: null,
        error: { message: 'Read failed' },
        readAsText: vi.fn(function () {
          // Trigger onerror asynchronously
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 0);
        }),
      };
      globalThis.FileReader = vi.fn(() => mockReader);

      registry.execute('load', ctx);

      const blob = new Blob(['data'], { type: 'text/plain' });
      const mockFile = new File([blob], 'bad.pdb', { type: 'text/plain' });

      capturedInput.onchange({ target: { files: [mockFile] } });

      await new Promise(r => setTimeout(r, 50));

      expect(terminal.lines[0].msg).toContain('Error reading file');
      expect(terminal.lines[0].msg).toContain('Read failed');
      expect(terminal.lines[0].type).toBe('error');

      globalThis.FileReader = OriginalFileReader;
      vi.restoreAllMocks();
    });

    it('handles FileReader onerror with no error message', async () => {
      let capturedInput = null;
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        el.click = vi.fn();
        if (tag === 'input') capturedInput = el;
        return el;
      });

      const OriginalFileReader = globalThis.FileReader;
      const mockReader = {
        onload: null,
        onerror: null,
        error: null,  // no error object
        readAsText: vi.fn(function () {
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 0);
        }),
      };
      globalThis.FileReader = vi.fn(() => mockReader);

      registry.execute('load', ctx);

      const blob = new Blob(['data'], { type: 'text/plain' });
      const mockFile = new File([blob], 'bad.pdb', { type: 'text/plain' });

      capturedInput.onchange({ target: { files: [mockFile] } });

      await new Promise(r => setTimeout(r, 50));

      expect(terminal.lines[0].msg).toContain('unknown error');
      expect(terminal.lines[0].type).toBe('error');

      globalThis.FileReader = OriginalFileReader;
      vi.restoreAllMocks();
    });

    it('handles model without getID in load callback', async () => {
      let capturedInput = null;
      const createElementOriginal = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElementOriginal(tag);
        el.click = vi.fn();
        if (tag === 'input') capturedInput = el;
        return el;
      });

      loadModelData.mockReturnValueOnce({});  // no getID method

      registry.execute('load', ctx);

      const blob = new Blob(['data'], { type: 'text/plain' });
      const mockFile = new File([blob], 'mol.sdf', { type: 'text/plain' });

      capturedInput.onchange({ target: { files: [mockFile] } });

      await new Promise(r => setTimeout(r, 50));

      expect(addObject).toHaveBeenCalledWith('mol', expect.anything(), null);

      vi.restoreAllMocks();
    });
  });
});

// ---------------------------------------------------------------------------
// Preset Commands
// ---------------------------------------------------------------------------

describe('preset.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerPresetCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('preset', () => {
    it('throws when no arguments', () => {
      expect(() => registry.execute('preset', ctx)).toThrow('Usage: preset');
    });

    it('applies the simple preset', () => {
      registry.execute('preset simple', ctx);
      expect(applyPreset).toHaveBeenCalledWith('simple', mockViewer, {});
      expect(notifyStateChange).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('Applied preset');
      expect(terminal.lines[0].msg).toContain('Simple');
    });

    it('applies preset with selection', () => {
      registry.execute('preset simple, protein', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('protein');
      expect(applyPreset).toHaveBeenCalledWith('simple', mockViewer, { hetflag: false });
    });

    it('throws on unknown preset', () => {
      expect(() => registry.execute('preset unknown', ctx)).toThrow('Unknown preset');
    });

    it('updates object representations when no selection (global)', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['line']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('preset simple', ctx);
      // Should replace representations with preset return value
      expect(mockObj.representations).toEqual(new Set(['cartoon', 'stick']));
    });

    it('does not modify object reps when scoped to a selection', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['line']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('preset simple, protein', ctx);
      // Should not be modified
      expect(mockObj.representations).toEqual(new Set(['line']));
    });

    it('includes selection name in output when provided', () => {
      registry.execute('preset simple, protein', ctx);
      expect(terminal.lines[0].msg).toContain('protein');
    });
  });
});

// ---------------------------------------------------------------------------
// Styling Commands
// ---------------------------------------------------------------------------

describe('styling.js', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerStylingCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  describe('color', () => {
    it('throws when no arguments', () => {
      expect(() => registry.execute('color', ctx)).toThrow('Usage: color');
    });

    it('applies a named color (red)', () => {
      registry.execute('color red', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('red');
    });

    it('applies color to a selection', () => {
      registry.execute('color red, protein', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('protein');
      expect(terminal.lines[0].msg).toContain('protein');
    });

    it('applies element coloring scheme', () => {
      registry.execute('color element', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          cartoon: { colorscheme: 'Jmol' },
          stick: { colorscheme: 'Jmol' },
        })
      );
      expect(terminal.lines[0].msg).toContain('element');
    });

    it('applies elem coloring scheme (alias)', () => {
      registry.execute('color elem', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ cartoon: { colorscheme: 'Jmol' } })
      );
    });

    it('applies cpk coloring scheme (alias)', () => {
      registry.execute('color cpk', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ stick: { colorscheme: 'Jmol' } })
      );
    });

    it('applies chain coloring scheme', () => {
      registry.execute('color chain', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        { cartoon: { colorscheme: 'chain' } }
      );
    });

    it('applies ss coloring scheme', () => {
      registry.execute('color ss', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        { cartoon: { colorscheme: 'ssJmol' } }
      );
    });

    it('applies secondary_structure coloring scheme', () => {
      registry.execute('color secondary_structure', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        { cartoon: { colorscheme: 'ssJmol' } }
      );
    });

    it('applies spectrum coloring scheme', () => {
      registry.execute('color spectrum', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        { cartoon: { colorscheme: { prop: 'b', gradient: 'roygb' } } }
      );
    });

    it('applies b coloring scheme', () => {
      registry.execute('color b', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        { cartoon: { colorscheme: { prop: 'b', gradient: 'roygb' } } }
      );
    });

    it('applies bfactor coloring scheme', () => {
      registry.execute('color bfactor', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalledWith(
        {},
        { cartoon: { colorscheme: { prop: 'b', gradient: 'roygb' } } }
      );
    });

    it('applies hex color with # prefix', () => {
      registry.execute('color #FF0000', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('#FF0000');
    });

    it('applies hex color with 0x prefix', () => {
      registry.execute('color 0xFF0000', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
    });

    it('applies short hex color (#RGB)', () => {
      registry.execute('color #F00', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
    });

    it('throws on unknown color', () => {
      expect(() => registry.execute('color fakecolor', ctx)).toThrow('Unknown color');
    });

    it('uses representations from state objects for solid color', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon', 'stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('color red', ctx);
      const callArgs = mockViewer.setStyle.mock.calls[0][1];
      expect(callArgs).toHaveProperty('cartoon');
      expect(callArgs).toHaveProperty('stick');
    });

    it('defaults to line representation when no reps exist', () => {
      registry.execute('color red', ctx);
      const callArgs = mockViewer.setStyle.mock.calls[0][1];
      // repKey('line') returns 'stick'
      expect(callArgs).toHaveProperty('stick');
    });

    it('applies scheme color with selection', () => {
      registry.execute('color element, protein', ctx);
      expect(resolveSelection).toHaveBeenCalledWith('protein');
      expect(terminal.lines[0].msg).toContain('element');
      expect(terminal.lines[0].msg).toContain('protein');
    });
  });

  describe('set_color', () => {
    it('throws when fewer than 2 arguments', () => {
      expect(() => registry.execute('set_color', ctx)).toThrow('Usage: set_color');
    });

    it('throws when only name given', () => {
      expect(() => registry.execute('set_color myred', ctx)).toThrow('Usage: set_color');
    });

    it('defines a custom color from hex', () => {
      registry.execute('set_color myred, #FF0000', ctx);
      expect(terminal.lines[0].msg).toContain('Defined color');
      expect(terminal.lines[0].msg).toContain('myred');
      // resolveColor lowercases hex input
      expect(terminal.lines[0].msg).toContain('#ff0000');
    });

    it('defines a custom color from named color', () => {
      registry.execute('set_color custom, red', ctx);
      expect(terminal.lines[0].msg).toContain('Defined color');
      expect(terminal.lines[0].msg).toContain('#FF0000');
    });

    it('defines a custom color from RGB values', () => {
      registry.execute('set_color myblue, 0, 0, 255', ctx);
      expect(terminal.lines[0].msg).toContain('Defined color');
      expect(terminal.lines[0].msg).toContain('myblue');
      expect(terminal.lines[0].msg).toContain('#0000ff');
    });

    it('throws on 3 parts (ambiguous RGB)', () => {
      expect(() => registry.execute('set_color name, 128, 0', ctx)).toThrow(
        'RGB format requires 3 values'
      );
    });

    it('throws on non-numeric RGB values', () => {
      expect(() => registry.execute('set_color name, a, b, c', ctx)).toThrow(
        'RGB values must be numbers'
      );
    });

    it('throws on out-of-range RGB values', () => {
      expect(() => registry.execute('set_color name, 300, 0, 0', ctx)).toThrow(
        'RGB values must be between 0 and 255'
      );
    });

    it('throws on negative RGB values', () => {
      expect(() => registry.execute('set_color name, -1, 0, 0', ctx)).toThrow(
        'RGB values must be between 0 and 255'
      );
    });

    it('throws on invalid hex value', () => {
      expect(() => registry.execute('set_color name, invalidhex', ctx)).toThrow(
        'Invalid color value'
      );
    });

    it('custom color can then be used by the color command', () => {
      // First define the color
      registry.execute('set_color mygreen, #00FF00', ctx);
      // Now use it (the color command is also registered)
      registry.execute('color mygreen', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
    });
  });

  describe('bg_color', () => {
    it('throws when no arguments', () => {
      expect(() => registry.execute('bg_color', ctx)).toThrow('Usage: bg_color');
    });

    it('sets background color from named color', () => {
      registry.execute('bg_color white', ctx);
      expect(mockViewer.setBackgroundColor).toHaveBeenCalledWith('#FFFFFF');
      expect(mockViewer.render).toHaveBeenCalled();
      expect(mockState.settings.bgColor).toBe('#FFFFFF');
      expect(mockState.settings.userSetBgColor).toBe(true);
      expect(notifyStateChange).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('#FFFFFF');
    });

    it('sets background color from hex', () => {
      registry.execute('bg_color #333333', ctx);
      expect(mockViewer.setBackgroundColor).toHaveBeenCalledWith('#333333');
    });

    it('throws on unknown color', () => {
      expect(() => registry.execute('bg_color fakecolor', ctx)).toThrow('Unknown color');
    });
  });

  describe('set', () => {
    it('throws when fewer than 2 arguments', () => {
      expect(() => registry.execute('set', ctx)).toThrow('Usage: set');
    });

    it('throws when only setting name given', () => {
      expect(() => registry.execute('set bg_color', ctx)).toThrow('Usage: set');
    });

    it('sets bg_color', () => {
      registry.execute('set bg_color, white', ctx);
      expect(mockViewer.setBackgroundColor).toHaveBeenCalledWith('#FFFFFF');
      expect(mockState.settings.userSetBgColor).toBe(true);
      expect(terminal.lines[0].msg).toContain('bg_color');
    });

    it('throws on invalid bg_color', () => {
      expect(() => registry.execute('set bg_color, fakecolor', ctx)).toThrow('Unknown color');
    });

    it('sets stick_radius', () => {
      registry.execute('set stick_radius, 0.3', ctx);
      expect(mockState.settings.stickRadius).toBe(0.3);
      expect(mockViewer.render).toHaveBeenCalled();
      expect(notifyStateChange).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('stick_radius');
    });

    it('applies stick_radius to visible objects with stick rep', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(['stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('set stick_radius, 0.4', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.addStyle).toHaveBeenCalled();
    });

    it('skips invisible objects for stick_radius', () => {
      const mockObj = {
        model: {},
        visible: false,
        representations: new Set(['stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('set stick_radius, 0.3', ctx);
      // setStyle should not be called for model scope
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
    });

    it('skips objects without stick rep for stick_radius', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('set stick_radius, 0.3', ctx);
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
    });

    it('skips line visual when stick is also present during stick_radius rebuild', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(['stick', 'line']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('set stick_radius, 0.5', ctx);
      // addStyle should be called for stick, but line should be skipped
      expect(mockViewer.setStyle).toHaveBeenCalled();
    });

    it('throws on non-numeric stick_radius', () => {
      expect(() => registry.execute('set stick_radius, abc', ctx)).toThrow(
        'stick_radius must be a number'
      );
    });

    it('sets sphere_scale', () => {
      registry.execute('set sphere_scale, 0.5', ctx);
      expect(mockState.settings.sphereScale).toBe(0.5);
      expect(terminal.lines[0].msg).toContain('sphere_scale');
    });

    it('applies sphere_scale to visible objects with sphere rep', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(['sphere']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('set sphere_scale, 0.3', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.addStyle).toHaveBeenCalled();
    });

    it('skips invisible objects for sphere_scale', () => {
      const mockObj = {
        model: {},
        visible: false,
        representations: new Set(['sphere']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('set sphere_scale, 0.3', ctx);
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
    });

    it('skips objects without sphere rep for sphere_scale', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('set sphere_scale, 0.3', ctx);
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
    });

    it('throws on non-numeric sphere_scale', () => {
      expect(() => registry.execute('set sphere_scale, abc', ctx)).toThrow(
        'sphere_scale must be a number'
      );
    });

    it('sets label_size', () => {
      registry.execute('set label_size, 14', ctx);
      expect(mockState.settings.labelSize).toBe(14);
      expect(terminal.lines[0].msg).toContain('label_size');
    });

    it('throws on non-numeric label_size', () => {
      expect(() => registry.execute('set label_size, abc', ctx)).toThrow(
        'label_size must be a number'
      );
    });

    it('throws on unknown setting', () => {
      expect(() => registry.execute('set unknown_setting, value', ctx)).toThrow(
        'Unknown setting "unknown_setting"'
      );
    });
  });

  describe('cartoon_style', () => {
    it('throws when no arguments', () => {
      expect(() => registry.execute('cartoon_style', ctx)).toThrow('Usage: cartoon_style');
    });

    it('applies oval style to all cartoon objects', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style oval', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.addStyle).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('oval');
      expect(terminal.lines[0].msg).toContain('all objects');
    });

    it('applies default style (maps to rectangle)', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style default', ctx);
      expect(terminal.lines[0].msg).toContain('rectangle');
    });

    it('applies rectangle style', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style rectangle', ctx);
      expect(terminal.lines[0].msg).toContain('rectangle');
    });

    it('applies trace style', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style trace', ctx);
      expect(terminal.lines[0].msg).toContain('trace');
    });

    it('applies parabola style', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style parabola', ctx);
      expect(terminal.lines[0].msg).toContain('parabola');
    });

    it('applies edged style', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style edged', ctx);
      expect(terminal.lines[0].msg).toContain('edged');
    });

    it('applies style to a specific object', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('1UBQ', mockObj);

      registry.execute('cartoon_style oval, 1UBQ', ctx);
      expect(terminal.lines[0].msg).toContain('1UBQ');
    });

    it('throws when target object not found or has no cartoon', () => {
      expect(() =>
        registry.execute('cartoon_style oval, nonexistent', ctx)
      ).toThrow('not found or has no cartoon');
    });

    it('throws on unknown style', () => {
      expect(() => registry.execute('cartoon_style fakestyle', ctx)).toThrow(
        'Unknown cartoon style'
      );
    });

    it('skips invisible objects', () => {
      const mockObj = {
        model: {},
        visible: false,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style oval', ctx);
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
    });

    it('skips objects without cartoon representation', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style oval', ctx);
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
    });

    it('skips line when stick is present during rebuild', () => {
      const mockObj = {
        model: {},
        visible: true,
        representations: new Set(['cartoon', 'line', 'stick']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('cartoon_style oval', ctx);
      // Should still apply cartoon and stick, but skip line
      expect(mockViewer.setStyle).toHaveBeenCalled();
    });
  });

  describe('bfactor_spectrum', () => {
    it('throws when fewer than 2 arguments', () => {
      expect(() => registry.execute('bfactor_spectrum', ctx)).toThrow(
        'Usage: bfactor_spectrum'
      );
    });

    it('throws when only 1 argument', () => {
      expect(() => registry.execute('bfactor_spectrum 10', ctx)).toThrow(
        'Usage: bfactor_spectrum'
      );
    });

    it('sets bfactor range and applies to visible objects', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('bfactor_spectrum 10, 50', ctx);
      expect(mockState.settings.bfactorMin).toBe(10);
      expect(mockState.settings.bfactorMax).toBe(50);
      expect(buildBfactorScheme).toHaveBeenCalledWith(10, 50);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(notifyStateChange).toHaveBeenCalled();
      expect(terminal.lines[0].msg).toContain('10');
      expect(terminal.lines[0].msg).toContain('50');
    });

    it('throws on non-numeric min', () => {
      expect(() =>
        registry.execute('bfactor_spectrum abc, 50', ctx)
      ).toThrow('min and max must be numbers');
    });

    it('throws on non-numeric max', () => {
      expect(() =>
        registry.execute('bfactor_spectrum 10, abc', ctx)
      ).toThrow('min and max must be numbers');
    });

    it('throws when min >= max', () => {
      expect(() =>
        registry.execute('bfactor_spectrum 50, 50', ctx)
      ).toThrow('min must be less than max');
    });

    it('throws when min > max', () => {
      expect(() =>
        registry.execute('bfactor_spectrum 60, 50', ctx)
      ).toThrow('min must be less than max');
    });

    it('skips invisible objects', () => {
      const mockObj = {
        model: {},
        visible: false,
        representations: new Set(['cartoon']),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('bfactor_spectrum 10, 50', ctx);
      expect(mockViewer.setStyle).not.toHaveBeenCalled();
    });

    it('defaults to line rep when object has no representations', () => {
      const modelRef = {};
      const mockObj = {
        model: modelRef,
        visible: true,
        representations: new Set(),
      };
      mockState.objects.set('mol', mockObj);

      registry.execute('bfactor_spectrum 10, 50', ctx);
      expect(mockViewer.setStyle).toHaveBeenCalled();
      const styleArg = mockViewer.setStyle.mock.calls[0][1];
      // repKey('line') => 'stick'
      expect(styleArg).toHaveProperty('stick');
    });
  });
});

// ---------------------------------------------------------------------------
// index.js — registerAllCommands
// ---------------------------------------------------------------------------

describe('index.js', () => {
  it('registerAllCommands registers all expected command groups', () => {
    const registry = createCommandRegistry();
    registerAllCommands(registry);

    // Camera commands
    expect(registry.has('zoom')).toBe(true);
    expect(registry.has('center')).toBe(true);
    expect(registry.has('orient')).toBe(true);
    expect(registry.has('rotate')).toBe(true);
    expect(registry.has('translate')).toBe(true);
    expect(registry.has('clip')).toBe(true);
    expect(registry.has('reset')).toBe(true);

    // Display commands
    expect(registry.has('show')).toBe(true);
    expect(registry.has('hide')).toBe(true);
    expect(registry.has('enable')).toBe(true);
    expect(registry.has('disable')).toBe(true);

    // Selection commands
    expect(registry.has('sele')).toBe(true);
    expect(registry.has('select')).toBe(true);
    expect(registry.has('count_atoms')).toBe(true);
    expect(registry.has('get_model')).toBe(true);

    // Editing commands
    expect(registry.has('remove')).toBe(true);
    expect(registry.has('delete')).toBe(true);
    expect(registry.has('set_name')).toBe(true);

    // Export commands
    expect(registry.has('png')).toBe(true);
    expect(registry.has('help')).toBe(true);

    // Labeling commands
    expect(registry.has('label')).toBe(true);
    expect(registry.has('unlabel')).toBe(true);

    // Loading commands
    expect(registry.has('fetch')).toBe(true);
    expect(registry.has('load')).toBe(true);

    // Styling commands
    expect(registry.has('color')).toBe(true);
    expect(registry.has('set_color')).toBe(true);
    expect(registry.has('bg_color')).toBe(true);
    expect(registry.has('set')).toBe(true);
    expect(registry.has('cartoon_style')).toBe(true);
    expect(registry.has('bfactor_spectrum')).toBe(true);

    // Preset commands
    expect(registry.has('preset')).toBe(true);
  });

  it('registerAllCommands lists correct number of commands', () => {
    const registry = createCommandRegistry();
    registerAllCommands(registry);
    const commands = registry.list();
    // 7 camera + 4 display + 4 selection + 3 editing + 2 export + 2 labeling + 2 loading + 6 styling + 1 preset = 31
    expect(commands.length).toBe(31);
  });

  it('all registered commands have help text', () => {
    const registry = createCommandRegistry();
    registerAllCommands(registry);
    const commands = registry.list();
    for (const name of commands) {
      const info = registry.getHelp(name);
      expect(info).not.toBeNull();
      expect(info.usage).toBeTruthy();
      expect(info.help).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Registry edge cases (prefix matching, ambiguous commands, etc.)
// ---------------------------------------------------------------------------

describe('registry edge cases', () => {
  let registry, terminal, ctx;

  beforeEach(() => {
    resetMocks();
    registry = createCommandRegistry();
    registerAllCommands(registry);
    terminal = makeTerminal();
    ctx = makeCtx(terminal);
  });

  it('resolves unambiguous prefix', () => {
    // "zo" should match only "zoom"
    registry.execute('zo', ctx);
    expect(mockViewer.zoomTo).toHaveBeenCalled();
  });

  it('throws on ambiguous prefix', () => {
    // "se" matches "sele", "select", "set", "set_color", "set_name"
    expect(() => registry.execute('se foo', ctx)).toThrow('Ambiguous command');
  });

  it('throws on fully unknown command', () => {
    expect(() => registry.execute('xyznonexistent', ctx)).toThrow("unknown command");
  });

  it('completions returns matching commands', () => {
    const matches = registry.completions('zo');
    expect(matches).toContain('zoom');
    expect(matches.length).toBe(1);
  });

  it('completions returns empty array for no match', () => {
    const matches = registry.completions('xyznonexistent');
    expect(matches).toEqual([]);
  });

  it('has returns false for non-registered command', () => {
    expect(registry.has('xyznonexistent')).toBe(false);
  });

  it('getHelp returns null for unknown command', () => {
    expect(registry.getHelp('xyznonexistent')).toBeNull();
  });
});
