import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock 3Dmol and fetch globally before importing the module under test
// ---------------------------------------------------------------------------

const mockModel = { getID: () => 0, show: vi.fn(), hide: vi.fn() };

const mockViewer = {
  addModel: vi.fn(() => mockModel),
  removeModel: vi.fn(),
  setStyle: vi.fn(),
  addStyle: vi.fn(),
  render: vi.fn(),
  zoomTo: vi.fn(),
  zoom: vi.fn(),
  center: vi.fn(),
  rotate: vi.fn(),
  resize: vi.fn(),
  selectedAtoms: vi.fn(() => []),
  setClickable: vi.fn(),
  addSphere: vi.fn(() => ({ id: 1 })),
  removeShape: vi.fn(),
  removeAllShapes: vi.fn(),
  addLabel: vi.fn(),
  removeAllLabels: vi.fn(),
  getView: vi.fn(() => [0, 0, 0, 1, 0, 0, 0, 1]),
  setView: vi.fn(),
  pngURI: vi.fn(() => 'data:image/png;base64,fake'),
};

globalThis.$3Dmol = { createViewer: vi.fn(() => mockViewer) };

globalThis.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, text: () => Promise.resolve('ATOM      1  N   ALA A   1') })
);

// Import the module under test AFTER the global mocks are installed
import {
  repKey,
  repStyle,
  initViewer,
  getViewer,
  getViewerElement,
  fetchPDB,
  loadModelData,
  removeModel,
  getAllAtoms,
  orientView,
  setupClickHandler,
  clearHighlight,
  applyHighlight,
  labelStyle,
  addTrackedLabel,
  clearAllLabels,
  refreshLabels,
} from '../src/viewer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal DOM container for initViewer(). */
function makeContainer() {
  const el = document.createElement('div');
  el.id = 'viewer-container';
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('viewer.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // repKey
  // -----------------------------------------------------------------------
  describe('repKey', () => {
    it('maps "line" to "stick" because REP_DEFAULTS.line has _useStick', () => {
      expect(repKey('line')).toBe('stick');
    });

    it('maps "stick" to "stick" (no _useStick flag)', () => {
      expect(repKey('stick')).toBe('stick');
    });

    it('maps "cartoon" to "cartoon" (not in REP_DEFAULTS)', () => {
      expect(repKey('cartoon')).toBe('cartoon');
    });

    it('maps "sphere" to "sphere" (not in REP_DEFAULTS)', () => {
      expect(repKey('sphere')).toBe('sphere');
    });
  });

  // -----------------------------------------------------------------------
  // repStyle
  // -----------------------------------------------------------------------
  describe('repStyle', () => {
    it('returns thin-stick spec for "line"', () => {
      const style = repStyle('line');
      expect(style).toEqual({
        stick: { radius: 0.05, doubleBondScaling: 1.5, tripleBondScaling: 1.0 },
      });
      // _useStick flag should be stripped
      expect(style.stick._useStick).toBeUndefined();
    });

    it('returns stick spec for "stick"', () => {
      expect(repStyle('stick')).toEqual({ stick: { radius: 0.25 } });
    });

    it('returns empty options for "cartoon"', () => {
      expect(repStyle('cartoon')).toEqual({ cartoon: {} });
    });

    it('returns empty options for "sphere"', () => {
      expect(repStyle('sphere')).toEqual({ sphere: {} });
    });

    it('returns empty options for unknown rep names', () => {
      expect(repStyle('surface')).toEqual({ surface: {} });
    });
  });

  // -----------------------------------------------------------------------
  // initViewer / getViewer / getViewerElement
  // -----------------------------------------------------------------------
  describe('initViewer', () => {
    it('creates a viewer element and returns the viewer instance', () => {
      const container = makeContainer();
      const v = initViewer(container);

      expect(v).toBe(mockViewer);
      expect($3Dmol.createViewer).toHaveBeenCalledTimes(1);

      // Verify the child element was created
      const child = container.querySelector('#viewer-canvas');
      expect(child).not.toBeNull();
      expect(child.style.width).toBe('100%');
      expect(child.style.height).toBe('100%');
    });

    it('getViewer() returns the viewer after initialization', () => {
      // initViewer was already called in the previous test
      expect(getViewer()).toBe(mockViewer);
    });

    it('getViewerElement() returns the canvas element after initialization', () => {
      const el = getViewerElement();
      expect(el).not.toBeNull();
      expect(el.id).toBe('viewer-canvas');
    });
  });

  // -----------------------------------------------------------------------
  // fetchPDB
  // -----------------------------------------------------------------------
  describe('fetchPDB', () => {
    it('fetches from RCSB, adds model, styles, zooms, and renders', async () => {
      const model = await fetchPDB('1UBQ');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://files.rcsb.org/download/1UBQ.pdb'
      );
      expect(mockViewer.addModel).toHaveBeenCalledWith(
        'ATOM      1  N   ALA A   1',
        'pdb'
      );
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.zoomTo).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(model).toBe(mockModel);
    });

    it('throws an error when fetch response is not ok', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(fetchPDB('XXXX')).rejects.toThrow(
        'Failed to fetch PDB "XXXX": 404 Not Found'
      );
    });
  });

  // -----------------------------------------------------------------------
  // loadModelData
  // -----------------------------------------------------------------------
  describe('loadModelData', () => {
    it('adds model data, styles, zooms, and renders', () => {
      const data = 'ATOM      1  N   ALA A   1';
      const model = loadModelData(data, 'pdb');

      expect(mockViewer.addModel).toHaveBeenCalledWith(data, 'pdb');
      expect(mockViewer.setStyle).toHaveBeenCalled();
      expect(mockViewer.zoomTo).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
      expect(model).toBe(mockModel);
    });

    it('accepts alternate format strings', () => {
      loadModelData('data', 'sdf');
      expect(mockViewer.addModel).toHaveBeenCalledWith('data', 'sdf');
    });
  });

  // -----------------------------------------------------------------------
  // removeModel
  // -----------------------------------------------------------------------
  describe('removeModel', () => {
    it('calls viewer.removeModel and render', () => {
      removeModel(mockModel);
      expect(mockViewer.removeModel).toHaveBeenCalledWith(mockModel);
      expect(mockViewer.render).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getAllAtoms
  // -----------------------------------------------------------------------
  describe('getAllAtoms', () => {
    it('delegates to viewer.selectedAtoms with the given spec', () => {
      const spec = { chain: 'A' };
      getAllAtoms(spec);
      expect(mockViewer.selectedAtoms).toHaveBeenCalledWith(spec);
    });

    it('defaults to empty spec when called with falsy argument', () => {
      getAllAtoms(null);
      expect(mockViewer.selectedAtoms).toHaveBeenCalledWith({});
    });

    it('defaults to empty spec when called with no argument', () => {
      getAllAtoms();
      expect(mockViewer.selectedAtoms).toHaveBeenCalledWith({});
    });
  });

  // -----------------------------------------------------------------------
  // orientView
  // -----------------------------------------------------------------------
  describe('orientView', () => {
    it('falls back to simple zoomTo when fewer than 2 atoms', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([{ x: 0, y: 0, z: 0 }]);
      orientView();

      expect(mockViewer.zoomTo).toHaveBeenCalledWith({});
      expect(mockViewer.render).toHaveBeenCalled();
      // setView should NOT be called in the fallback path
      expect(mockViewer.setView).not.toHaveBeenCalled();
    });

    it('falls back to zoomTo when zero atoms are returned', () => {
      mockViewer.selectedAtoms.mockReturnValueOnce([]);
      orientView({ chain: 'Z' });

      expect(mockViewer.zoomTo).toHaveBeenCalledWith({ chain: 'Z' });
      expect(mockViewer.render).toHaveBeenCalled();
    });

    it('performs PCA orientation when multiple atoms are provided', () => {
      const atoms = [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 0, y: 5, z: 0 },
        { x: 10, y: 5, z: 0 },
        { x: 5, y: 2.5, z: 1 },
      ];
      mockViewer.selectedAtoms.mockReturnValueOnce(atoms);

      orientView();

      expect(mockViewer.zoomTo).toHaveBeenCalledWith({});
      expect(mockViewer.getView).toHaveBeenCalled();
      expect(mockViewer.setView).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();

      // The quaternion values should have been written into the view
      const setViewArg = mockViewer.setView.mock.calls[0][0];
      expect(setViewArg).toHaveLength(8);
      // Quaternion components in slots 4-7
      expect(typeof setViewArg[4]).toBe('number');
      expect(typeof setViewArg[5]).toBe('number');
      expect(typeof setViewArg[6]).toBe('number');
      expect(typeof setViewArg[7]).toBe('number');
    });

    it('passes selSpec through to selectedAtoms and zoomTo', () => {
      const atoms = [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ];
      mockViewer.selectedAtoms.mockReturnValueOnce(atoms);

      orientView({ chain: 'A' });

      expect(mockViewer.selectedAtoms).toHaveBeenCalledWith({ chain: 'A' });
      expect(mockViewer.zoomTo).toHaveBeenCalledWith({ chain: 'A' });
    });
  });

  // -----------------------------------------------------------------------
  // setupClickHandler
  // -----------------------------------------------------------------------
  describe('setupClickHandler', () => {
    it('registers a click callback via setClickable and renders', () => {
      const callback = vi.fn();
      setupClickHandler(callback);

      expect(mockViewer.setClickable).toHaveBeenCalledWith(
        {},
        true,
        expect.any(Function)
      );
      expect(mockViewer.render).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // clearHighlight / applyHighlight
  // -----------------------------------------------------------------------
  describe('highlight', () => {
    beforeEach(() => {
      // Reset internal module state by clearing any active highlight,
      // then reset all mock call counters.
      clearHighlight();
      vi.clearAllMocks();
    });

    it('applyHighlight adds sphere shapes for small atom counts', () => {
      const atoms = [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
      ];
      mockViewer.selectedAtoms.mockReturnValueOnce(atoms);

      applyHighlight({ chain: 'A' });

      expect(mockViewer.addSphere).toHaveBeenCalledTimes(2);
      expect(mockViewer.addSphere).toHaveBeenCalledWith({
        center: { x: 0, y: 0, z: 0 },
        radius: 0.5,
        color: '#FFFF00',
        alpha: 0.5,
      });
      expect(mockViewer.render).toHaveBeenCalled();
    });

    it('applyHighlight uses addStyle for large atom counts (>= 500)', () => {
      const bigAtomList = Array.from({ length: 500 }, (_, i) => ({
        x: i, y: 0, z: 0,
      }));
      mockViewer.selectedAtoms.mockReturnValueOnce(bigAtomList);

      applyHighlight({ chain: 'A' });

      expect(mockViewer.addStyle).toHaveBeenCalledWith(
        { chain: 'A' },
        { sphere: { radius: 0.4, color: 'yellow', opacity: 0.35 } }
      );
      expect(mockViewer.addSphere).not.toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
    });

    it('clearHighlight removes sphere shapes when small selection was used', () => {
      // Apply a small highlight (single atom)
      const atoms = [{ x: 0, y: 0, z: 0 }];
      mockViewer.selectedAtoms.mockReturnValueOnce(atoms);
      const shape = { id: 42 };
      mockViewer.addSphere.mockReturnValueOnce(shape);
      applyHighlight({});

      vi.clearAllMocks();

      // Clear should remove the tracked shape
      clearHighlight();
      expect(mockViewer.removeShape).toHaveBeenCalledTimes(1);
      expect(mockViewer.removeShape).toHaveBeenCalledWith(shape);
      expect(mockViewer.render).toHaveBeenCalled();
    });

    it('clearHighlight removes style-based highlight for large selections', () => {
      const bigAtomList = Array.from({ length: 600 }, (_, i) => ({
        x: i, y: 0, z: 0,
      }));
      mockViewer.selectedAtoms.mockReturnValueOnce(bigAtomList);
      applyHighlight({ chain: 'B' });

      vi.clearAllMocks();

      clearHighlight();
      expect(mockViewer.removeAllShapes).toHaveBeenCalled();
      expect(mockViewer.render).toHaveBeenCalled();
    });

    it('clearHighlight is a no-op when no highlight is active', () => {
      // No highlight has been applied (beforeEach cleared any previous),
      // so calling clearHighlight should do nothing.
      clearHighlight();
      expect(mockViewer.removeShape).not.toHaveBeenCalled();
      expect(mockViewer.removeAllShapes).not.toHaveBeenCalled();
      expect(mockViewer.render).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // labelStyle
  // -----------------------------------------------------------------------
  describe('labelStyle', () => {
    it('returns black text for light theme', () => {
      document.body.dataset.theme = 'light';
      const style = labelStyle();
      expect(style.fontColor).toBe('#000000');
      expect(style.bold).toBe(true);
      expect(style.backgroundOpacity).toBe(0);
      expect(style.fontSize).toBe(12);
    });

    it('returns white text for dark theme', () => {
      document.body.dataset.theme = 'dark';
      const style = labelStyle();
      expect(style.fontColor).toBe('#FFFFFF');
    });

    it('returns white text when theme attribute is absent (defaults to non-light)', () => {
      delete document.body.dataset.theme;
      const style = labelStyle();
      expect(style.fontColor).toBe('#FFFFFF');
    });
  });

  // -----------------------------------------------------------------------
  // addTrackedLabel / clearAllLabels / refreshLabels
  // -----------------------------------------------------------------------
  describe('tracked labels', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Start with a clean slate
      clearAllLabels();
      vi.clearAllMocks();
    });

    it('addTrackedLabel adds a label to the viewer', () => {
      document.body.dataset.theme = 'dark';
      addTrackedLabel('ALA 1', { x: 1, y: 2, z: 3 });

      expect(mockViewer.addLabel).toHaveBeenCalledTimes(1);
      const [text, opts] = mockViewer.addLabel.mock.calls[0];
      expect(text).toBe('ALA 1');
      expect(opts.position).toEqual({ x: 1, y: 2, z: 3 });
      expect(opts.fontColor).toBe('#FFFFFF');
    });

    it('clearAllLabels removes all labels and resets tracking', () => {
      addTrackedLabel('L1', { x: 0, y: 0, z: 0 });
      vi.clearAllMocks();

      clearAllLabels();
      expect(mockViewer.removeAllLabels).toHaveBeenCalledTimes(1);

      // refreshLabels should be a no-op after clearing
      vi.clearAllMocks();
      refreshLabels();
      expect(mockViewer.addLabel).not.toHaveBeenCalled();
    });

    it('refreshLabels rebuilds all tracked labels with current style', () => {
      document.body.dataset.theme = 'light';
      addTrackedLabel('L1', { x: 0, y: 0, z: 0 });
      addTrackedLabel('L2', { x: 1, y: 1, z: 1 });
      vi.clearAllMocks();

      // Switch theme and refresh
      document.body.dataset.theme = 'dark';
      refreshLabels();

      expect(mockViewer.removeAllLabels).toHaveBeenCalledTimes(1);
      expect(mockViewer.addLabel).toHaveBeenCalledTimes(2);

      // Both labels should use the dark theme color
      for (const call of mockViewer.addLabel.mock.calls) {
        expect(call[1].fontColor).toBe('#FFFFFF');
      }
      expect(mockViewer.render).toHaveBeenCalled();
    });

    it('refreshLabels is a no-op when there are no tracked labels', () => {
      refreshLabels();
      expect(mockViewer.removeAllLabels).not.toHaveBeenCalled();
      expect(mockViewer.addLabel).not.toHaveBeenCalled();
      expect(mockViewer.render).not.toHaveBeenCalled();
    });
  });
});
