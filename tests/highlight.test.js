import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock viewer.js module (highlight.js imports scheduleRender)
vi.mock('../src/viewer.js', () => ({
  scheduleRender: vi.fn(),
}));

// Mock viewer instance
const mockViewer = {
  addCustom: vi.fn(() => ({ id: 1 })),
  removeShape: vi.fn(),
};

import {
  initHighlight,
  renderHighlight,
  clearHighlight,
  hasHighlight,
  _templateForTest,
} from '../src/highlight.js';

describe('highlight', () => {
  beforeEach(() => {
    clearHighlight();
    vi.clearAllMocks();
    initHighlight(mockViewer);
  });

  describe('icosphere template', () => {
    it('has 42 vertices', () => {
      const { vertices } = _templateForTest();
      expect(vertices.length).toBe(42);
    });

    it('has 80 faces (240 indices)', () => {
      const { faces } = _templateForTest();
      expect(faces.length).toBe(240);
    });

    it('all vertices lie on the unit sphere', () => {
      const { vertices } = _templateForTest();
      for (const v of vertices) {
        const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        expect(mag).toBeCloseTo(1.0, 4);
      }
    });

    it('all face indices are within vertex bounds', () => {
      const { vertices, faces } = _templateForTest();
      for (const idx of faces) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(vertices.length);
      }
    });
  });

  describe('renderHighlight', () => {
    it('calls addCustom with correct vertex/face counts for N atoms', () => {
      renderHighlight([
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 5, z: 5 },
      ]);

      expect(mockViewer.addCustom).toHaveBeenCalledTimes(1);
      const arg = mockViewer.addCustom.mock.calls[0][0];
      expect(arg.vertexArr.length).toBe(42 * 2);
      expect(arg.normalArr.length).toBe(42 * 2);
      expect(arg.faceArr.length).toBe(240 * 2);
      expect(arg.color).toBe('#FFFF00');
    });

    it('translates vertices by atom position', () => {
      renderHighlight([{ x: 10, y: 20, z: 30 }]);

      const arg = mockViewer.addCustom.mock.calls[0][0];
      // Every vertex should be near (10, 20, 30) ± HIGHLIGHT_RADIUS
      for (const v of arg.vertexArr) {
        expect(v.x).toBeCloseTo(10, 0);
        expect(v.y).toBeCloseTo(20, 0);
        expect(v.z).toBeCloseTo(30, 0);
      }
    });

    it('is a no-op for empty atoms array', () => {
      renderHighlight([]);
      expect(mockViewer.addCustom).not.toHaveBeenCalled();
    });

    it('replaces existing highlight when called twice', () => {
      const shape1 = { id: 1 };
      const shape2 = { id: 2 };
      mockViewer.addCustom.mockReturnValueOnce(shape1).mockReturnValueOnce(shape2);

      renderHighlight([{ x: 0, y: 0, z: 0 }]);
      renderHighlight([{ x: 1, y: 1, z: 1 }]);

      expect(mockViewer.removeShape).toHaveBeenCalledWith(shape1);
      expect(mockViewer.addCustom).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearHighlight', () => {
    it('removes the current shape', () => {
      const shape = { id: 42 };
      mockViewer.addCustom.mockReturnValueOnce(shape);
      renderHighlight([{ x: 0, y: 0, z: 0 }]);
      vi.clearAllMocks();

      clearHighlight();
      expect(mockViewer.removeShape).toHaveBeenCalledWith(shape);
    });

    it('is a no-op when no highlight is active', () => {
      clearHighlight();
      expect(mockViewer.removeShape).not.toHaveBeenCalled();
    });
  });

  describe('hasHighlight', () => {
    it('returns false when no highlight is active', () => {
      expect(hasHighlight()).toBe(false);
    });

    it('returns true after renderHighlight', () => {
      renderHighlight([{ x: 0, y: 0, z: 0 }]);
      expect(hasHighlight()).toBe(true);
    });

    it('returns false after clearHighlight', () => {
      renderHighlight([{ x: 0, y: 0, z: 0 }]);
      clearHighlight();
      expect(hasHighlight()).toBe(false);
    });
  });
});
