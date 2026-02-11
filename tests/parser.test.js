import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/pymol-selection.pegjs';

describe('PyMOL Selection Parser', () => {

  describe('constants', () => {
    it('parses "all"', () => {
      const ast = parse('all');
      expect(ast).toEqual({ type: 'all' });
    });
    it('parses "none"', () => {
      const ast = parse('none');
      expect(ast).toEqual({ type: 'none' });
    });
  });

  describe('atom property keywords', () => {
    it('parses "name CA"', () => {
      const ast = parse('name CA');
      expect(ast).toEqual({ type: 'name', values: ['CA'] });
    });
    it('parses multi-value "name CA+CB+N"', () => {
      const ast = parse('name CA+CB+N');
      expect(ast).toEqual({ type: 'name', values: ['CA', 'CB', 'N'] });
    });
    it('parses glob "name C*"', () => {
      const ast = parse('name C*');
      expect(ast).toEqual({ type: 'name', values: ['C*'] });
    });
    it('parses "resn ALA"', () => {
      const ast = parse('resn ALA');
      expect(ast).toEqual({ type: 'resn', values: ['ALA'] });
    });
    it('parses "resn ALA+GLY+VAL"', () => {
      const ast = parse('resn ALA+GLY+VAL');
      expect(ast).toEqual({ type: 'resn', values: ['ALA', 'GLY', 'VAL'] });
    });
    it('parses "chain A"', () => {
      const ast = parse('chain A');
      expect(ast).toEqual({ type: 'chain', value: 'A' });
    });
    it('parses "elem C"', () => {
      const ast = parse('elem C');
      expect(ast).toEqual({ type: 'elem', value: 'C' });
    });
    it('parses "elem Fe" (two-letter)', () => {
      const ast = parse('elem Fe');
      expect(ast).toEqual({ type: 'elem', value: 'Fe' });
    });
  });

  describe('resi specifiers', () => {
    it('parses "resi 42" (exact)', () => {
      const ast = parse('resi 42');
      expect(ast).toEqual({ type: 'resi', op: '==', value: 42 });
    });
    it('parses "resi 1-100" (range)', () => {
      const ast = parse('resi 1-100');
      expect(ast).toEqual({ type: 'resi', op: 'range', low: 1, high: 100 });
    });
    it('parses "resi >= 50" (comparison)', () => {
      const ast = parse('resi >= 50');
      expect(ast).toEqual({ type: 'resi', op: '>=', value: 50 });
    });
    it('parses "resi < 10"', () => {
      const ast = parse('resi < 10');
      expect(ast).toEqual({ type: 'resi', op: '<', value: 10 });
    });
  });

  describe('index specifiers', () => {
    it('parses "index 0" (exact)', () => {
      const ast = parse('index 0');
      expect(ast).toEqual({ type: 'index', op: '==', value: 0 });
    });
    it('parses "index 0-99" (range)', () => {
      const ast = parse('index 0-99');
      expect(ast).toEqual({ type: 'index', op: 'range', low: 0, high: 99 });
    });
    it('parses "index >= 100"', () => {
      const ast = parse('index >= 100');
      expect(ast).toEqual({ type: 'index', op: '>=', value: 100 });
    });
  });

  describe('component keywords', () => {
    it.each([
      'protein', 'ligand', 'water', 'solvent', 'organic',
      'backbone', 'bb', 'sidechain', 'sc', 'metal', 'metals',
    ])('parses "%s"', (kw) => {
      const ast = parse(kw);
      const normalized = { bb: 'backbone', sc: 'sidechain', metals: 'metal' }[kw] || kw;
      expect(ast).toEqual({ type: normalized });
    });
  });

  describe('atom type keywords', () => {
    it.each([
      ['heavy', 'heavy'],
      ['hydrogen', 'hydrogen'],
      ['h', 'hydrogen'],
      ['polar_hydrogen', 'polar_hydrogen'],
      ['polarh', 'polar_hydrogen'],
      ['nonpolar_hydrogen', 'nonpolar_hydrogen'],
      ['apolarh', 'nonpolar_hydrogen'],
    ])('parses "%s" as %s', (input, expected) => {
      const ast = parse(input);
      expect(ast).toEqual({ type: expected });
    });
  });

  describe('secondary structure keywords', () => {
    it.each(['helix', 'sheet', 'turn', 'loop'])('parses "%s"', (kw) => {
      const ast = parse(kw);
      expect(ast).toEqual({ type: kw });
    });
  });

  describe('logical operators', () => {
    it('parses "protein and chain A"', () => {
      const ast = parse('protein and chain A');
      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'protein' },
          { type: 'chain', value: 'A' },
        ],
      });
    });
    it('parses "water or solvent"', () => {
      const ast = parse('water or solvent');
      expect(ast).toEqual({
        type: 'or',
        children: [
          { type: 'water' },
          { type: 'solvent' },
        ],
      });
    });
    it('parses "not hydrogen"', () => {
      const ast = parse('not hydrogen');
      expect(ast).toEqual({
        type: 'not',
        child: { type: 'hydrogen' },
      });
    });
    it('parses "protein xor ligand"', () => {
      const ast = parse('protein xor ligand');
      expect(ast).toEqual({
        type: 'xor',
        children: [
          { type: 'protein' },
          { type: 'ligand' },
        ],
      });
    });
    it('respects precedence: NOT > AND > OR', () => {
      const ast = parse('not hydrogen or protein and chain A');
      expect(ast).toEqual({
        type: 'or',
        children: [
          { type: 'not', child: { type: 'hydrogen' } },
          {
            type: 'and',
            children: [
              { type: 'protein' },
              { type: 'chain', value: 'A' },
            ],
          },
        ],
      });
    });
    it('respects parentheses for grouping', () => {
      const ast = parse('(water or solvent) and not metal');
      expect(ast).toEqual({
        type: 'and',
        children: [
          {
            type: 'or',
            children: [
              { type: 'water' },
              { type: 'solvent' },
            ],
          },
          { type: 'not', child: { type: 'metal' } },
        ],
      });
    });
    it('flattens chained AND', () => {
      const ast = parse('protein and chain A and name CA');
      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'protein' },
          { type: 'chain', value: 'A' },
          { type: 'name', values: ['CA'] },
        ],
      });
    });
    it('flattens chained OR', () => {
      const ast = parse('water or solvent or organic');
      expect(ast).toEqual({
        type: 'or',
        children: [
          { type: 'water' },
          { type: 'solvent' },
          { type: 'organic' },
        ],
      });
    });
  });

  describe('distance operators', () => {
    it('parses "around 5.0 ligand" (prefix)', () => {
      const ast = parse('around 5.0 ligand');
      expect(ast).toEqual({
        type: 'around',
        radius: 5.0,
        child: { type: 'ligand' },
      });
    });
    it('parses "xaround 3.5 protein" (prefix)', () => {
      const ast = parse('xaround 3.5 protein');
      expect(ast).toEqual({
        type: 'xaround',
        radius: 3.5,
        child: { type: 'protein' },
      });
    });
    it('parses "beyond 10.0 water" (prefix)', () => {
      const ast = parse('beyond 10.0 water');
      expect(ast).toEqual({
        type: 'beyond',
        radius: 10.0,
        child: { type: 'water' },
      });
    });
    it('parses "resn TA1 around 5.0" (postfix)', () => {
      const ast = parse('resn TA1 around 5.0');
      expect(ast).toEqual({
        type: 'around',
        radius: 5.0,
        child: { type: 'resn', values: ['TA1'] },
      });
    });
    it('parses "ligand xaround 3.5" (postfix)', () => {
      const ast = parse('ligand xaround 3.5');
      expect(ast).toEqual({
        type: 'xaround',
        radius: 3.5,
        child: { type: 'ligand' },
      });
    });
    it('parses "protein beyond 10.0" (postfix)', () => {
      const ast = parse('protein beyond 10.0');
      expect(ast).toEqual({
        type: 'beyond',
        radius: 10.0,
        child: { type: 'protein' },
      });
    });
    it('parses postfix around with AND operator', () => {
      const ast = parse('resn TA1 around 5.0 and chain A');
      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'around', radius: 5.0, child: { type: 'resn', values: ['TA1'] } },
          { type: 'chain', value: 'A' },
        ],
      });
    });
  });

  describe('expansion operators', () => {
    it('parses "byres name CA"', () => {
      const ast = parse('byres name CA');
      expect(ast).toEqual({
        type: 'byres',
        child: { type: 'name', values: ['CA'] },
      });
    });
    it('parses "bychain ligand"', () => {
      const ast = parse('bychain ligand');
      expect(ast).toEqual({
        type: 'bychain',
        child: { type: 'ligand' },
      });
    });
  });

  describe('macro syntax', () => {
    it('parses "//A/42/CA"', () => {
      const ast = parse('//A/42/CA');
      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'chain', value: 'A' },
          { type: 'resi', op: '==', value: 42 },
          { type: 'name', values: ['CA'] },
        ],
      });
    });
    it('parses "///CA" (wildcard chain and resi)', () => {
      const ast = parse('///CA');
      expect(ast).toEqual({ type: 'name', values: ['CA'] });
    });
    it('parses "//A//" (chain only)', () => {
      const ast = parse('//A//');
      expect(ast).toEqual({ type: 'chain', value: 'A' });
    });
  });

  describe('quoted strings', () => {
    it('parses name with quoted value', () => {
      const ast = parse('name "C*1"');
      expect(ast).toEqual({ type: 'name', values: ['C*1'] });
    });
  });

  describe('case insensitivity', () => {
    it('parses "NAME CA"', () => {
      const ast = parse('NAME CA');
      expect(ast).toEqual({ type: 'name', values: ['CA'] });
    });
    it('parses "Protein AND Chain A"', () => {
      const ast = parse('Protein AND Chain A');
      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'protein' },
          { type: 'chain', value: 'A' },
        ],
      });
    });
  });

  describe('whitespace handling', () => {
    it('handles leading/trailing whitespace', () => {
      const ast = parse('  protein  ');
      expect(ast).toEqual({ type: 'protein' });
    });
    it('handles extra whitespace between tokens', () => {
      const ast = parse('name   CA');
      expect(ast).toEqual({ type: 'name', values: ['CA'] });
    });
  });

  describe('error cases', () => {
    it('throws on empty input', () => {
      expect(() => parse('')).toThrow();
    });
    it('throws on invalid syntax', () => {
      expect(() => parse('not')).toThrow();
    });
    it('throws on unmatched parens', () => {
      expect(() => parse('(protein')).toThrow();
    });
  });

  describe('additional comparison operators', () => {
    it('parses "resi <= 50"', () => {
      const ast = parse('resi <= 50');
      expect(ast).toEqual({ type: 'resi', op: '<=', value: 50 });
    });
    it('parses "resi > 10"', () => {
      const ast = parse('resi > 10');
      expect(ast).toEqual({ type: 'resi', op: '>', value: 10 });
    });
    it('parses "index <= 200"', () => {
      const ast = parse('index <= 200');
      expect(ast).toEqual({ type: 'index', op: '<=', value: 200 });
    });
    it('parses "index > 0"', () => {
      const ast = parse('index > 0');
      expect(ast).toEqual({ type: 'index', op: '>', value: 0 });
    });
  });

  describe('additional edge cases', () => {
    it('parses integer radius in distance operator', () => {
      const ast = parse('around 5 ligand');
      expect(ast).toEqual({ type: 'around', radius: 5.0, child: { type: 'ligand' } });
    });
    it('parses double-NOT', () => {
      const ast = parse('not not hydrogen');
      expect(ast).toEqual({
        type: 'not',
        child: { type: 'not', child: { type: 'hydrogen' } },
      });
    });
    it('parses deeply nested parentheses', () => {
      const ast = parse('((protein))');
      expect(ast).toEqual({ type: 'protein' });
    });
    it('does not match keyword prefix (e.g., "organic" should not match "or")', () => {
      const ast = parse('organic');
      expect(ast).toEqual({ type: 'organic' });
    });
  });

  describe('complex expressions', () => {
    it('parses "byres around 5.0 (protein and chain A)"', () => {
      const ast = parse('byres around 5.0 (protein and chain A)');
      expect(ast).toEqual({
        type: 'byres',
        child: {
          type: 'around',
          radius: 5.0,
          child: {
            type: 'and',
            children: [
              { type: 'protein' },
              { type: 'chain', value: 'A' },
            ],
          },
        },
      });
    });
  });
});
