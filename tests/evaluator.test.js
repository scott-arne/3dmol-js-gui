import { describe, it, expect } from 'vitest';
import { evaluate, toAtomSelectionSpec } from '../src/parser/evaluator.js';
import { parse } from '../src/parser/pymol-selection.pegjs';

const atoms = [
  { serial: 0, atom: 'N',  resn: 'ALA', resi: 1, chain: 'A', elem: 'N',  ss: 'h', x: 0, y: 0, z: 0 },
  { serial: 1, atom: 'CA', resn: 'ALA', resi: 1, chain: 'A', elem: 'C',  ss: 'h', x: 1, y: 0, z: 0 },
  { serial: 2, atom: 'C',  resn: 'ALA', resi: 1, chain: 'A', elem: 'C',  ss: 'h', x: 2, y: 0, z: 0 },
  { serial: 3, atom: 'O',  resn: 'ALA', resi: 1, chain: 'A', elem: 'O',  ss: 'h', x: 3, y: 0, z: 0 },
  { serial: 4, atom: 'CB', resn: 'ALA', resi: 1, chain: 'A', elem: 'C',  ss: 'h', x: 1, y: 1, z: 0 },
  { serial: 5, atom: 'H',  resn: 'ALA', resi: 1, chain: 'A', elem: 'H',  ss: 'h', x: 0, y: -1, z: 0 },
  { serial: 6, atom: 'N',  resn: 'GLY', resi: 2, chain: 'A', elem: 'N',  ss: 's', x: 10, y: 0, z: 0 },
  { serial: 7, atom: 'CA', resn: 'GLY', resi: 2, chain: 'A', elem: 'C',  ss: 's', x: 11, y: 0, z: 0 },
  { serial: 8, atom: 'C',  resn: 'GLY', resi: 2, chain: 'A', elem: 'C',  ss: 's', x: 12, y: 0, z: 0 },
  { serial: 9, atom: 'O',  resn: 'GLY', resi: 2, chain: 'A', elem: 'O',  ss: 's', x: 13, y: 0, z: 0 },
  { serial: 10, atom: 'N',  resn: 'VAL', resi: 3, chain: 'B', elem: 'N', ss: 'h', x: 20, y: 0, z: 0 },
  { serial: 11, atom: 'CA', resn: 'VAL', resi: 3, chain: 'B', elem: 'C', ss: 'h', x: 21, y: 0, z: 0 },
  { serial: 12, atom: 'O',  resn: 'HOH', resi: 100, chain: ' ', elem: 'O', ss: '', x: 50, y: 50, z: 50 },
];

function selectAtoms(selectionStr) {
  const ast = parse(selectionStr);
  return evaluate(ast, atoms).map(a => a.serial);
}

describe('Selection Evaluator', () => {
  describe('property selections', () => {
    it('selects by name', () => {
      expect(selectAtoms('name CA')).toEqual([1, 7, 11]);
    });
    it('selects by multi-value name', () => {
      expect(selectAtoms('name CA+CB')).toEqual([1, 4, 7, 11]);
    });
    it('selects by resn', () => {
      expect(selectAtoms('resn ALA')).toEqual([0, 1, 2, 3, 4, 5]);
    });
    it('selects by chain', () => {
      expect(selectAtoms('chain B')).toEqual([10, 11]);
    });
    it('selects by elem', () => {
      expect(selectAtoms('elem O')).toEqual([3, 9, 12]);
    });
    it('selects by resi exact', () => {
      expect(selectAtoms('resi 2')).toEqual([6, 7, 8, 9]);
    });
    it('selects by resi range', () => {
      expect(selectAtoms('resi 1-2')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
    it('selects by resi comparison', () => {
      expect(selectAtoms('resi >= 3')).toEqual([10, 11, 12]);
    });
    it('selects by index exact', () => {
      expect(selectAtoms('index 0')).toEqual([0]);
    });
    it('selects by index range', () => {
      expect(selectAtoms('index 0-2')).toEqual([0, 1, 2]);
    });
  });

  describe('glob patterns', () => {
    it('matches name with wildcard *', () => {
      expect(selectAtoms('name C*')).toEqual([1, 2, 4, 7, 8, 11]);
    });
    it('matches name with wildcard ?', () => {
      expect(selectAtoms('name C?')).toEqual([1, 4, 7, 11]);
    });
  });

  describe('component keywords', () => {
    it('selects water', () => {
      expect(selectAtoms('water')).toEqual([12]);
    });
    it('selects backbone atoms', () => {
      expect(selectAtoms('backbone')).toEqual([0, 1, 2, 3, 6, 7, 8, 9, 10, 11]);
    });
  });

  describe('atom type keywords', () => {
    it('selects hydrogen', () => {
      expect(selectAtoms('hydrogen')).toEqual([5]);
    });
    it('selects heavy (non-hydrogen)', () => {
      expect(selectAtoms('heavy')).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
    });
  });

  describe('secondary structure', () => {
    it('selects helix', () => {
      expect(selectAtoms('helix')).toEqual([0, 1, 2, 3, 4, 5, 10, 11]);
    });
    it('selects sheet', () => {
      expect(selectAtoms('sheet')).toEqual([6, 7, 8, 9]);
    });
  });

  describe('logical operators', () => {
    it('AND', () => {
      expect(selectAtoms('name CA and chain A')).toEqual([1, 7]);
    });
    it('OR', () => {
      expect(selectAtoms('chain A or chain B')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });
    it('NOT', () => {
      expect(selectAtoms('not hydrogen')).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
    });
  });

  describe('constants', () => {
    it('all selects everything', () => {
      expect(selectAtoms('all')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });
    it('none selects nothing', () => {
      expect(selectAtoms('none')).toEqual([]);
    });
  });

  describe('distance operators', () => {
    it('around selects atoms within radius', () => {
      const result = selectAtoms('around 2.0 (name N and resi 1)');
      expect(result).toEqual([0, 1, 2, 4, 5]);
    });
    it('xaround excludes reference atoms', () => {
      const result = selectAtoms('xaround 2.0 (name N and resi 1)');
      expect(result).toEqual([1, 2, 4, 5]);
    });
  });

  describe('expansion operators', () => {
    it('byres expands to full residues', () => {
      const result = selectAtoms('byres name CB');
      expect(result).toEqual([0, 1, 2, 3, 4, 5]);
    });
    it('bychain expands to full chains', () => {
      const result = selectAtoms('bychain resi 3');
      expect(result).toEqual([10, 11]);
    });
  });

  describe('toAtomSelectionSpec', () => {
    it('converts simple name to spec', () => {
      const ast = parse('name CA');
      const spec = toAtomSelectionSpec(ast);
      expect(spec).toEqual({ atom: ['CA'] });
    });
    it('converts chain to spec', () => {
      const ast = parse('chain A');
      const spec = toAtomSelectionSpec(ast);
      expect(spec).toEqual({ chain: 'A' });
    });
    it('converts resi exact to spec', () => {
      const ast = parse('resi 42');
      const spec = toAtomSelectionSpec(ast);
      expect(spec).toEqual({ resi: 42 });
    });
    it('returns null for complex expressions', () => {
      const ast = parse('around 5.0 ligand');
      const spec = toAtomSelectionSpec(ast);
      expect(spec).toBeNull();
    });
  });
});
