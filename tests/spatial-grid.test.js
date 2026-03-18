import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../src/spatial-grid.js';

describe('SpatialGrid', () => {
  const atoms = [
    { serial: 0, x: 0, y: 0, z: 0, elem: 'N' },
    { serial: 1, x: 1, y: 0, z: 0, elem: 'C' },
    { serial: 2, x: 5, y: 0, z: 0, elem: 'O' },
    { serial: 3, x: 10, y: 10, z: 10, elem: 'C' },
  ];

  it('returns atoms within radius', () => {
    const grid = new SpatialGrid(atoms, 2.0);
    const result = grid.neighborsWithin(0, 0, 0, 2.0);
    const serials = result.map(a => a.serial).sort();
    expect(serials).toEqual([0, 1]);
  });

  it('excludes atoms outside radius', () => {
    const grid = new SpatialGrid(atoms, 2.0);
    const result = grid.neighborsWithin(0, 0, 0, 2.0);
    const serials = result.map(a => a.serial);
    expect(serials).not.toContain(2);
    expect(serials).not.toContain(3);
  });

  it('returns empty for empty atom list', () => {
    const grid = new SpatialGrid([], 5.0);
    expect(grid.neighborsWithin(0, 0, 0, 5.0)).toEqual([]);
  });

  it('works with single atom inside radius', () => {
    const single = [{ serial: 0, x: 1, y: 1, z: 1, elem: 'C' }];
    const grid = new SpatialGrid(single, 5.0);
    const result = grid.neighborsWithin(0, 0, 0, 5.0);
    expect(result.map(a => a.serial)).toEqual([0]);
  });

  it('works with single atom outside radius', () => {
    const single = [{ serial: 0, x: 100, y: 100, z: 100, elem: 'C' }];
    const grid = new SpatialGrid(single, 5.0);
    expect(grid.neighborsWithin(0, 0, 0, 5.0)).toEqual([]);
  });

  it('handles atoms at cell boundaries correctly', () => {
    const boundaryAtoms = [
      { serial: 0, x: 0, y: 0, z: 0, elem: 'N' },
      { serial: 1, x: 5, y: 0, z: 0, elem: 'C' },
      { serial: 2, x: 5.01, y: 0, z: 0, elem: 'O' },
    ];
    const grid = new SpatialGrid(boundaryAtoms, 5.0);
    const result = grid.neighborsWithin(0, 0, 0, 5.0);
    const serials = result.map(a => a.serial).sort();
    expect(serials).toEqual([0, 1]);
  });

  it('returns correct results with default cell size matching radius', () => {
    const grid = new SpatialGrid(atoms, 5.0);
    const result = grid.neighborsWithin(0, 0, 0, 5.0);
    const serials = result.map(a => a.serial).sort();
    expect(serials).toEqual([0, 1, 2]);
  });

  it('handles negative coordinates', () => {
    const negAtoms = [
      { serial: 0, x: -1, y: -1, z: -1, elem: 'N' },
      { serial: 1, x: -2, y: 0, z: 0, elem: 'C' },
      { serial: 2, x: -100, y: 0, z: 0, elem: 'O' },
    ];
    const grid = new SpatialGrid(negAtoms, 5.0);
    const result = grid.neighborsWithin(-1, -1, -1, 3.0);
    const serials = result.map(a => a.serial).sort();
    expect(serials).toEqual([0, 1]);
  });

  it('handles 50k atoms within 100ms for 5A query', () => {
    const largeAtoms = [];
    for (let i = 0; i < 50000; i++) {
      largeAtoms.push({
        serial: i,
        x: Math.random() * 200 - 100,
        y: Math.random() * 200 - 100,
        z: Math.random() * 200 - 100,
        elem: 'C',
      });
    }
    const start = performance.now();
    const grid = new SpatialGrid(largeAtoms, 5.0);
    for (let i = 0; i < 100; i++) {
      grid.neighborsWithin(
        Math.random() * 200 - 100,
        Math.random() * 200 - 100,
        Math.random() * 200 - 100,
        5.0,
      );
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
