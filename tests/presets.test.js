import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../src/viewer.js', () => ({
  repStyle: (rep) => {
    if (rep === 'line') return { stick: { radius: 0.05 } };
    if (rep === 'stick') return { stick: { radius: 0.25 } };
    return { [rep]: {} };
  },
}));

vi.mock('../src/ui/color-swatches.js', () => ({
  CHAIN_PALETTES: {
    pastel: {
      label: 'Pastel',
      colors: ['#FF0000', '#00FF00', '#0000FF'],
    },
  },
}));

import { applyPreset, PRESETS, PRESET_NAMES } from '../src/presets.js';

// ---------------------------------------------------------------------------
// Shared mock viewer factory
// ---------------------------------------------------------------------------

function makeMockViewer(atoms = []) {
  return {
    setStyle: vi.fn(),
    addStyle: vi.fn(),
    render: vi.fn(),
    selectedAtoms: vi.fn(() => atoms),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('presets.js', () => {
  // -----------------------------------------------------------------------
  // PRESET_NAMES
  // -----------------------------------------------------------------------
  describe('PRESET_NAMES', () => {
    it('contains the expected preset names', () => {
      expect(PRESET_NAMES).toContain('simple');
      expect(PRESET_NAMES).toContain('sites');
      expect(PRESET_NAMES).toContain('ball-and-stick');
    });

    it('is an array of strings', () => {
      expect(Array.isArray(PRESET_NAMES)).toBe(true);
      for (const name of PRESET_NAMES) {
        expect(typeof name).toBe('string');
      }
    });
  });

  // -----------------------------------------------------------------------
  // PRESETS object
  // -----------------------------------------------------------------------
  describe('PRESETS', () => {
    it('has entries for all known preset names', () => {
      expect(PRESETS).toHaveProperty('simple');
      expect(PRESETS).toHaveProperty('sites');
      expect(PRESETS).toHaveProperty('ball-and-stick');
    });

    it('each preset has a label, description, and apply function', () => {
      for (const key of PRESET_NAMES) {
        const preset = PRESETS[key];
        expect(preset).toHaveProperty('label');
        expect(preset).toHaveProperty('description');
        expect(typeof preset.apply).toBe('function');
      }
    });
  });

  // -----------------------------------------------------------------------
  // applyPreset — 'simple'
  // -----------------------------------------------------------------------
  describe('applyPreset("simple")', () => {
    it('calls setStyle, addStyle, and render on the viewer', () => {
      const proteinAtoms = [
        { chain: 'A', elem: 'C', resn: 'ALA' },
        { chain: 'A', elem: 'N', resn: 'ALA' },
        { chain: 'B', elem: 'C', resn: 'GLY' },
      ];
      const viewer = makeMockViewer(proteinAtoms);

      const result = applyPreset('simple', viewer);

      expect(viewer.setStyle).toHaveBeenCalled();
      expect(viewer.addStyle).toHaveBeenCalled();
      expect(viewer.render).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Set);
      expect(result.has('cartoon')).toBe(true);
      expect(result.has('stick')).toBe(true);
    });

    it('returns the correct representation set', () => {
      const viewer = makeMockViewer([]);
      const reps = applyPreset('simple', viewer);
      expect(reps).toEqual(new Set(['cartoon', 'stick']));
    });
  });

  // -----------------------------------------------------------------------
  // applyPreset — 'sites'
  // -----------------------------------------------------------------------
  describe('applyPreset("sites")', () => {
    it('shows sticks near het atoms when het atoms are present', () => {
      // Create atoms: some protein, some het (ligand) nearby
      const atoms = [
        // Protein atoms
        { chain: 'A', resi: 1, elem: 'C', resn: 'ALA', hetflag: false, x: 0, y: 0, z: 0, index: 0 },
        { chain: 'A', resi: 1, elem: 'N', resn: 'ALA', hetflag: false, x: 1, y: 0, z: 0, index: 1 },
        // Het atom close to protein atoms (within 5A)
        { chain: 'A', resi: 500, elem: 'C', resn: 'LIG', hetflag: true, x: 2, y: 0, z: 0, index: 2 },
        // Protein atom far away (beyond 5A)
        { chain: 'B', resi: 10, elem: 'C', resn: 'GLY', hetflag: false, x: 100, y: 100, z: 100, index: 3 },
      ];

      const viewer = makeMockViewer(atoms);

      // selectedAtoms will be called several times with different specs.
      // First call: base selection for setStyle; second call: hetSpec; etc.
      // We return the full array for all calls and let the preset logic filter.
      viewer.selectedAtoms.mockImplementation((spec) => {
        if (spec && spec.hetflag === true) {
          return atoms.filter(a => a.hetflag);
        }
        if (spec && spec.hetflag === false) {
          return atoms.filter(a => !a.hetflag);
        }
        if (spec && spec.index) {
          return atoms.filter(a => spec.index.includes(a.index));
        }
        return atoms;
      });

      const result = applyPreset('sites', viewer);

      expect(viewer.setStyle).toHaveBeenCalled();
      expect(viewer.addStyle).toHaveBeenCalled();
      expect(viewer.render).toHaveBeenCalled();
      expect(result).toEqual(new Set(['cartoon', 'stick']));
    });

    it('still works when there are no het atoms', () => {
      const atoms = [
        { chain: 'A', resi: 1, elem: 'C', resn: 'ALA', hetflag: false, x: 0, y: 0, z: 0, index: 0 },
      ];
      const viewer = makeMockViewer(atoms);
      viewer.selectedAtoms.mockImplementation((spec) => {
        if (spec && spec.hetflag === true) return [];
        if (spec && spec.hetflag === false) return atoms;
        return atoms;
      });

      const result = applyPreset('sites', viewer);
      expect(result).toEqual(new Set(['cartoon', 'stick']));
      expect(viewer.render).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // applyPreset — 'ball-and-stick'
  // -----------------------------------------------------------------------
  describe('applyPreset("ball-and-stick")', () => {
    it('applies stick and sphere styles to het atoms', () => {
      const viewer = makeMockViewer([]);
      const result = applyPreset('ball-and-stick', viewer);

      // Should clear with setStyle, then addStyle twice (stick + sphere)
      expect(viewer.setStyle).toHaveBeenCalledTimes(1);
      expect(viewer.addStyle).toHaveBeenCalledTimes(2);

      // First addStyle: stick representation
      const stickCall = viewer.addStyle.mock.calls[0];
      expect(stickCall[1]).toEqual({ stick: { radius: 0.25 } });

      // Second addStyle: sphere with scale
      const sphereCall = viewer.addStyle.mock.calls[1];
      expect(sphereCall[1]).toEqual({ sphere: { scale: 0.3 } });

      expect(viewer.render).toHaveBeenCalled();
      expect(result).toEqual(new Set(['stick', 'sphere']));
    });
  });

  // -----------------------------------------------------------------------
  // applyPreset — error handling
  // -----------------------------------------------------------------------
  describe('applyPreset — error handling', () => {
    it('throws an error for unknown preset names', () => {
      const viewer = makeMockViewer();
      expect(() => applyPreset('unknown', viewer)).toThrow(
        /Unknown preset "unknown"/
      );
    });

    it('includes available preset labels in the error message', () => {
      const viewer = makeMockViewer();
      try {
        applyPreset('nonexistent', viewer);
      } catch (e) {
        expect(e.message).toContain('Available:');
        expect(e.message).toContain('Simple');
      }
    });
  });

  // -----------------------------------------------------------------------
  // applyPreset — case insensitive
  // -----------------------------------------------------------------------
  describe('applyPreset — case insensitive', () => {
    it('accepts "Simple" (capitalized)', () => {
      const viewer = makeMockViewer([]);
      const result = applyPreset('Simple', viewer);
      expect(result).toBeInstanceOf(Set);
    });

    it('accepts "SIMPLE" (all caps)', () => {
      const viewer = makeMockViewer([]);
      const result = applyPreset('SIMPLE', viewer);
      expect(result).toBeInstanceOf(Set);
    });

    it('accepts "Ball-And-Stick" (mixed case)', () => {
      const viewer = makeMockViewer([]);
      const result = applyPreset('Ball-And-Stick', viewer);
      expect(result).toEqual(new Set(['stick', 'sphere']));
    });
  });

  // -----------------------------------------------------------------------
  // applyPreset — optional selSpec
  // -----------------------------------------------------------------------
  describe('applyPreset — optional selSpec', () => {
    it('defaults to empty selSpec when none is provided', () => {
      const viewer = makeMockViewer([]);
      applyPreset('simple', viewer);

      // setStyle's first arg (base spec) should be {}
      const baseSpec = viewer.setStyle.mock.calls[0][0];
      expect(baseSpec).toEqual({});
    });

    it('passes through a provided selSpec', () => {
      const viewer = makeMockViewer([]);
      applyPreset('ball-and-stick', viewer, { model: 0 });

      // The het spec should include model: 0 merged in
      const firstAddStyleSpec = viewer.addStyle.mock.calls[0][0];
      expect(firstAddStyleSpec).toHaveProperty('model', 0);
    });
  });
});
