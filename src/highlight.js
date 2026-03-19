/**
 * Highlight renderer using a batched icosphere mesh.
 *
 * Builds a single triangle mesh of small translucent spheres at atom
 * positions, submitted as one addCustom shape. O(1) WebGL calls for
 * both creation and removal regardless of atom count.
 */

import { scheduleRender } from './viewer.js';

const HIGHLIGHT_RADIUS = 0.45;
const HIGHLIGHT_COLOR = '#FFFF00';
const HIGHLIGHT_OPACITY = 0.75;

// ---------------------------------------------------------------------------
// Icosphere template (subdivided icosahedron, 42 vertices, 80 faces)
// ---------------------------------------------------------------------------

function buildIcosphereTemplate() {
  // Golden ratio
  const t = (1 + Math.sqrt(5)) / 2;

  // 12 vertices of a regular icosahedron (normalized to unit sphere)
  const raw = [
    [-1,  t,  0], [ 1,  t,  0], [-1, -t,  0], [ 1, -t,  0],
    [ 0, -1,  t], [ 0,  1,  t], [ 0, -1, -t], [ 0,  1, -t],
    [ t,  0, -1], [ t,  0,  1], [-t,  0, -1], [-t,  0,  1],
  ];

  let vertices = raw.map(([x, y, z]) => {
    const mag = Math.sqrt(x * x + y * y + z * z);
    return { x: x / mag, y: y / mag, z: z / mag };
  });

  // 20 faces of the icosahedron
  let faces = [
    0,11,5,  0,5,1,   0,1,7,   0,7,10,  0,10,11,
    1,5,9,   5,11,4,  11,10,2, 10,7,6,  7,1,8,
    3,9,4,   3,4,2,   3,2,6,   3,6,8,   3,8,9,
    4,9,5,   2,4,11,  6,2,10,  8,6,7,   9,8,1,
  ];

  // One subdivision
  const midpointCache = new Map();

  function getMidpoint(i, j) {
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    if (midpointCache.has(key)) return midpointCache.get(key);
    const a = vertices[i], b = vertices[j];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    const mag = Math.sqrt(mx * mx + my * my + mz * mz);
    const idx = vertices.length;
    vertices.push({ x: mx / mag, y: my / mag, z: mz / mag });
    midpointCache.set(key, idx);
    return idx;
  }

  const newFaces = [];
  for (let i = 0; i < faces.length; i += 3) {
    const a = faces[i], b = faces[i + 1], c = faces[i + 2];
    const ab = getMidpoint(a, b);
    const bc = getMidpoint(b, c);
    const ca = getMidpoint(c, a);
    newFaces.push(
      a, ab, ca,
      b, bc, ab,
      c, ca, bc,
      ab, bc, ca,
    );
  }
  faces = newFaces;

  return { vertices, faces };
}

const TEMPLATE = buildIcosphereTemplate();

/**
 * Expose template for testing only.
 * @returns {{ vertices: Array<{x,y,z}>, faces: number[] }}
 */
export function _templateForTest() {
  return TEMPLATE;
}

// ---------------------------------------------------------------------------
// Renderer state
// ---------------------------------------------------------------------------

let viewer = null;
let currentShape = null;

export function initHighlight(v) {
  viewer = v;
}

export function hasHighlight() {
  return currentShape !== null;
}

export function clearHighlight() {
  if (currentShape === null) return;
  if (viewer) viewer.removeShape(currentShape);
  currentShape = null;
  scheduleRender();
}

export function renderHighlight(atoms) {
  if (!viewer) return;
  if (atoms.length === 0) return;

  // Clear any existing highlight
  if (currentShape !== null) {
    viewer.removeShape(currentShape);
    currentShape = null;
  }

  const nAtoms = atoms.length;
  const tVerts = TEMPLATE.vertices;
  const tFaces = TEMPLATE.faces;
  const nv = tVerts.length;

  const vertexArr = new Array(nAtoms * nv);
  const normalArr = new Array(nAtoms * nv);
  const faceArr = new Array(nAtoms * tFaces.length);

  for (let i = 0; i < nAtoms; i++) {
    const ax = atoms[i].x, ay = atoms[i].y, az = atoms[i].z;
    const vOff = i * nv;
    const fOff = i * tFaces.length;

    for (let j = 0; j < nv; j++) {
      const tv = tVerts[j];
      vertexArr[vOff + j] = {
        x: ax + tv.x * HIGHLIGHT_RADIUS,
        y: ay + tv.y * HIGHLIGHT_RADIUS,
        z: az + tv.z * HIGHLIGHT_RADIUS,
      };
      normalArr[vOff + j] = { x: tv.x, y: tv.y, z: tv.z };
    }

    for (let j = 0; j < tFaces.length; j++) {
      faceArr[fOff + j] = tFaces[j] + vOff;
    }
  }

  currentShape = viewer.addCustom({
    vertexArr,
    normalArr,
    faceArr,
    color: HIGHLIGHT_COLOR,
    opacity: HIGHLIGHT_OPACITY,
  });
  scheduleRender();
}
