/**
 * Uniform cell grid for fast spatial neighbor queries.
 *
 * Partitions atoms into cells of `cellSize` width. Neighbor queries scan the
 * cells touched by the query radius, turning O(n*m) distance searches into
 * O(n*k) where k is the average atoms per relevant cell neighborhood.
 */
function assertPositiveNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

export class SpatialGrid {
  constructor(atoms, cellSize) {
    assertPositiveNumber(cellSize, 'cellSize');
    this._cellSize = cellSize;
    this._cells = new Map();

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
    assertPositiveNumber(radius, 'radius');

    const rSq = radius * radius;
    const cs = this._cellSize;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(y / cs);
    const cz = Math.floor(z / cs);
    const cellSpan = Math.ceil(radius / cs);
    const result = [];

    for (let dx = -cellSpan; dx <= cellSpan; dx++) {
      for (let dy = -cellSpan; dy <= cellSpan; dy++) {
        for (let dz = -cellSpan; dz <= cellSpan; dz++) {
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
