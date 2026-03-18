/**
 * Uniform cell grid for fast spatial neighbor queries.
 *
 * Partitions atoms into cells of `cellSize` width. Neighbor queries check
 * only the 27 adjacent cells (3^3 cube), turning O(n*m) distance searches
 * into O(n*k) where k is the average atoms per cell neighborhood.
 */
export class SpatialGrid {
  constructor(atoms, cellSize) {
    this._cellSize = cellSize;
    this._cells = new Map();
    this._radiusSq = cellSize * cellSize;

    for (const atom of atoms) {
      const ix = Math.floor(atom.x / cellSize);
      const iy = Math.floor(atom.y / cellSize);
      const iz = Math.floor(atom.z / cellSize);
      const key = `${ix},${iy},${iz}`;
      let cell = this._cells.get(key);
      if (!cell) {
        cell = [];
        this._cells.set(key, cell);
      }
      cell.push(atom);
    }
  }

  neighborsWithin(x, y, z, radius) {
    const rSq = radius * radius;
    const cs = this._cellSize;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(y / cs);
    const cz = Math.floor(z / cs);
    const result = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this._cells.get(key);
          if (!cell) continue;
          for (const atom of cell) {
            const ax = atom.x - x;
            const ay = atom.y - y;
            const az = atom.z - z;
            if (ax * ax + ay * ay + az * az <= rSq) {
              result.push(atom);
            }
          }
        }
      }
    }

    return result;
  }
}
