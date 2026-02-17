import { vi } from 'vitest';

/**
 * Create a mock $3Dmol viewer for testing.
 */
export function createMockViewer() {
  const atoms = [];

  return {
    addModel: vi.fn(() => ({ getID: () => 0 })),
    removeModel: vi.fn(),
    setStyle: vi.fn(),
    addStyle: vi.fn(),
    setClickable: vi.fn(),
    selectedAtoms: vi.fn(() => atoms),
    addSphere: vi.fn(() => ({})),
    removeShape: vi.fn(),
    removeAllShapes: vi.fn(),
    addLabel: vi.fn(),
    removeAllLabels: vi.fn(),
    center: vi.fn(),
    zoomTo: vi.fn(),
    zoom: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    setSlab: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
    pngURI: vi.fn(() => 'data:image/png;base64,fake'),
    getCanvas: vi.fn(() => ({
      width: 800, height: 600,
      toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
    })),
    setBackgroundColor: vi.fn(),
    _atoms: atoms,
    _addAtoms(newAtoms) {
      atoms.push(...newAtoms);
      this.selectedAtoms.mockImplementation((sel) => {
        if (!sel || Object.keys(sel).length === 0) return [...atoms];
        return atoms.filter(a => {
          for (const [key, val] of Object.entries(sel)) {
            if (key === 'model') continue;
            if (Array.isArray(val)) { if (!val.includes(a[key])) return false; }
            else { if (a[key] !== val) return false; }
          }
          return true;
        });
      });
    },
  };
}

/**
 * Install the mock $3Dmol global.
 */
export function installMock3Dmol(mockViewer) {
  globalThis.$3Dmol = {
    createViewer: vi.fn(() => mockViewer),
  };
}
