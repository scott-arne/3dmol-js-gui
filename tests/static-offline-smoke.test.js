import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockViewer, installMock3Dmol } from './helpers/mock-3dmol.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, 'fixtures/static-inline-init.html');

function getInitPayload(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const payloadEl = document.getElementById('c3d-init-payload');
  return JSON.parse(payloadEl.textContent);
}

function installFixtureDom(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
  window.__C3D_INIT__ = getInitPayload(html);
}

async function bootFixtureApp() {
  const html = readFileSync(fixturePath, 'utf8');
  const mockViewer = createMockViewer();

  installFixtureDom(html);
  installMock3Dmol(mockViewer);

  await import('../src/main.js');
  const state = await import('../src/state.js');

  return { mockViewer, ...state };
}

async function flushStateUpdates() {
  await Promise.resolve();
  await Promise.resolve();
}

function clickPopupItem(value) {
  document.querySelector(`[data-value="${value}"]`).click();
}

function makeBounds() {
  return {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
    center: { x: 0.5, y: 0.5, z: 0.5 },
    dimensions: { w: 1, h: 1, d: 1 },
  };
}

function installMockVolumeData(volumeData = createVolumeData()) {
  globalThis.$3Dmol.VolumeData = vi.fn(() => volumeData);
  return volumeData;
}

function createVolumeData() {
  return {
    size: { x: 2, y: 2, z: 2 },
    matrix: {
      elements: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ],
    },
    data: new Float32Array([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]),
  };
}

describe('static offline smoke fixture', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
    });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.__C3D_INIT__;
    delete globalThis.$3Dmol;
    delete globalThis.ResizeObserver;
    delete globalThis.localStorage;
    vi.restoreAllMocks();
  });

  it('initializes from inline molecule data without external URLs', () => {
    const html = readFileSync(fixturePath, 'utf8');
    const payload = getInitPayload(html);

    expect(html).toContain('window.__C3D_INIT__');
    expect(html).toContain('id="app"');
    expect(html).toContain('id="viewer-container"');
    expect(html).toContain('id="menubar-container"');
    expect(html).toContain('id="sidebar-container"');
    expect(html).toContain('id="terminal-container"');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('/demo/init.js');
    expect(html).not.toContain('fetch(');

    expect(payload.molecules).toEqual([
      {
        name: 'static-water',
        format: 'pdb',
        data: expect.stringContaining('HETATM'),
      },
    ]);
    expect(payload.molecules[0]).not.toHaveProperty('url');
    expect(payload.molecules[0]).not.toHaveProperty('source');
    expect(payload.molecules[0]).not.toHaveProperty('path');
  });

  it('boots the app from the fixture payload without fetches', async () => {
    const { mockViewer } = await bootFixtureApp();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockViewer.addModel).toHaveBeenCalledWith(
      expect.stringContaining('static-water'),
      'pdb',
      { keepH: true, assignBonds: true }
    );
    expect(mockViewer.zoomTo).toHaveBeenCalled();
    expect(mockViewer.render).toHaveBeenCalled();
  });

  it('accepts console as an initialization visibility alias', async () => {
    const html = readFileSync(fixturePath, 'utf8');
    const mockViewer = createMockViewer();

    installFixtureDom(html);
    window.__C3D_INIT__.ui = {
      sidebar: true,
      menubar: true,
      console: false,
    };
    installMock3Dmol(mockViewer);

    await import('../src/main.js');

    expect(document.getElementById('app').classList.contains('terminal-hidden')).toBe(true);
  });

  it('keeps the viewer row shrinkable so console input remains visible', () => {
    const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf8');

    expect(css).toContain('grid-template-rows: 28px minmax(0, 1fr) auto;');
    expect(css).toMatch(/\.viewer-container\s*{[^}]*min-height:\s*0;/s);
  });

  it('applies initialization remove_style operations', async () => {
    const html = readFileSync(fixturePath, 'utf8');
    const mockViewer = createMockViewer();
    mockViewer._addAtoms([
      {
        serial: 1,
        style: { cartoon: { color: 'red' }, stick: { radius: 0.25 } },
      },
    ]);

    installFixtureDom(html);
    window.__C3D_INIT__.operations = [
      { op: 'style', selection: null, style: { cartoon: { color: 'red' } } },
      { op: 'remove_style', selection: null, style: { cartoon: {} } },
    ];
    installMock3Dmol(mockViewer);

    await import('../src/main.js');

    expect(mockViewer.addStyle).toHaveBeenCalledWith(
      {},
      { cartoon: { color: 'red' } }
    );
    expect(mockViewer.setStyle).toHaveBeenCalledWith(
      { model: expect.any(Object) },
      { stick: { radius: 0.25 } }
    );
  });

  it('applies initialization remove_style everything to nonpolar hydrogens', async () => {
    const html = readFileSync(fixturePath, 'utf8');
    const mockViewer = createMockViewer();
    mockViewer._addAtoms([
      { serial: 1, elem: 'C', x: 0, y: 0, z: 0, style: { stick: {} } },
      { serial: 2, elem: 'H', x: 1, y: 0, z: 0, style: { stick: {} } },
    ]);

    installFixtureDom(html);
    window.__C3D_INIT__.operations = [
      {
        op: 'remove_style',
        selection: 'nonpolar_hydrogens',
        style: { everything: {} },
      },
    ];
    installMock3Dmol(mockViewer);

    await import('../src/main.js');

    expect(mockViewer.setStyle).toHaveBeenCalledWith(
      { serial: [2], model: expect.any(Object) },
      {}
    );
  });

  it('applies initialization surface add and remove operations in order', async () => {
    const html = readFileSync(fixturePath, 'utf8');
    const mockViewer = createMockViewer();

    installFixtureDom(html);
    window.__C3D_INIT__.molecules = [
      {
        name: 'complex',
        format: 'pdb',
        data: 'HETATM    1  C   LIG A   1       0.000   0.000   0.000  1.00  0.00           C',
      },
    ];
    window.__C3D_INIT__.operations = [
      {
        op: 'add_surface',
        selection: 'complex',
        name: 'complex_surface',
        type: 'molecular',
        color: '#FFFFFF',
        opacity: 0.75,
        mode: 'surface',
      },
      { op: 'remove_surface', name: 'complex_surface' },
    ];
    installMock3Dmol(mockViewer);

    const { getState } = await import('../src/state.js');
    await import('../src/main.js');

    expect(mockViewer.addSurface).toHaveBeenCalled();
    expect(mockViewer.removeSurface).toHaveBeenCalled();
    expect(getState().surfaces.has('complex_surface')).toBe(false);
  });

  it('applies initialization map, isosurface, and map removal operations in order', async () => {
    const html = readFileSync(fixturePath, 'utf8');
    const mockViewer = createMockViewer();
    const isoHandle = { id: 'iso' };
    mockViewer.addIsosurface.mockReturnValue(isoHandle);

    installFixtureDom(html);
    window.__C3D_INIT__.operations = [
      {
        op: 'add_map',
        name: 'density',
        format: 'ccp4',
        encoding: 'base64',
        data: 'AQIDBA==',
        color: '#38BDF8',
        opacity: 1,
        showBoundingBox: true,
      },
      {
        op: 'add_isosurface',
        name: 'mesh',
        mapName: 'density',
        level: null,
        representation: 'mesh',
        color: '#0000FF',
        opacity: 0.75,
      },
      { op: 'remove_map', name: 'density' },
    ];
    installMock3Dmol(mockViewer);
    installMockVolumeData();

    const { getState } = await import('../src/state.js');
    await import('../src/main.js');

    expect(globalThis.$3Dmol.VolumeData).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'ccp4');
    expect(mockViewer.addIsosurface).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ color: '#0000FF', wireframe: true }),
    );
    expect(mockViewer.removeShape).toHaveBeenCalled();
    expect(getState().maps.has('density')).toBe(false);
    expect(getState().isosurfaces.has('mesh')).toBe(false);
  });

  it('group visibility toggles direct grouped surfaces', async () => {
    const { mockViewer, addSurfaceEntry, addGroup, getState } = await bootFixtureApp();

    addSurfaceEntry({
      name: 'direct_surface',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
      handle: 101,
      pending: false,
      visible: true,
      parentVisible: true,
    });
    addGroup('surface_group', ['direct_surface']);
    await flushStateUpdates();
    mockViewer.setSurfaceMaterialStyle.mockClear();

    document
      .querySelector('.sidebar-group-header[data-name="surface_group"] .sidebar-zone-toggle')
      .click();

    expect(getState().surfaces.get('direct_surface').visible).toBe(false);
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledWith(
      101,
      { color: '#FFFFFF', opacity: 0, wireframe: false },
    );
  });

  it('group enable and disable actions update direct grouped surfaces', async () => {
    const { mockViewer, addSurfaceEntry, addGroup, getState } = await bootFixtureApp();

    addSurfaceEntry({
      name: 'direct_surface',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
      handle: 102,
      pending: false,
      visible: true,
      parentVisible: true,
    });
    addGroup('surface_group', ['direct_surface']);
    await flushStateUpdates();
    mockViewer.setSurfaceMaterialStyle.mockClear();

    document.querySelector('.sidebar-group-header[data-name="surface_group"] [data-btn="A"]').click();
    clickPopupItem('disable_all');

    expect(getState().surfaces.get('direct_surface').visible).toBe(false);
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledWith(
      102,
      { color: '#FFFFFF', opacity: 0, wireframe: false },
    );

    mockViewer.setSurfaceMaterialStyle.mockClear();
    document.querySelector('.sidebar-group-header[data-name="surface_group"] [data-btn="A"]').click();
    clickPopupItem('enable_all');

    expect(getState().surfaces.get('direct_surface').visible).toBe(true);
    expect(mockViewer.setSurfaceMaterialStyle).toHaveBeenCalledWith(
      102,
      { color: '#FFFFFF', opacity: 0.75, wireframe: false },
    );
  });

  it('group deletion removes direct grouped surface viewer handles', async () => {
    const { mockViewer, addSurfaceEntry, addGroup, getState } = await bootFixtureApp();

    addSurfaceEntry({
      name: 'direct_surface',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      parentName: null,
      handle: 103,
      pending: false,
    });
    addGroup('surface_group', ['direct_surface']);
    await flushStateUpdates();

    document.querySelector('.sidebar-group-header[data-name="surface_group"] [data-btn="A"]').click();
    clickPopupItem('delete');

    expect(mockViewer.removeSurface).toHaveBeenCalledWith(103);
    expect(getState().surfaces.has('direct_surface')).toBe(false);
  });

  it('group visibility toggles grouped maps and child isosurfaces through viewer handles', async () => {
    const { mockViewer, addMapEntry, addIsosurfaceEntry, addGroup, getState } = await bootFixtureApp();
    const boxHandle = { kind: 'box' };
    const isoHandle = { kind: 'iso' };
    const volumeData = { kind: 'volume' };

    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData,
      bounds: makeBounds(),
      handles: [boxHandle],
    });
    addIsosurfaceEntry({
      name: 'mesh',
      mapName: 'density',
      level: 1,
      handle: isoHandle,
      visible: true,
      parentVisible: true,
    });
    addGroup('density_group', ['density']);
    await flushStateUpdates();
    mockViewer.removeShape.mockClear();
    mockViewer.addIsosurface.mockClear();

    document
      .querySelector('.sidebar-group-header[data-name="density_group"] .sidebar-zone-toggle')
      .click();

    expect(getState().maps.get('density').visible).toBe(false);
    expect(getState().isosurfaces.get('mesh').parentVisible).toBe(false);
    expect(mockViewer.removeShape).toHaveBeenCalledWith(boxHandle);
    expect(mockViewer.removeShape).toHaveBeenCalledWith(isoHandle);
    expect(mockViewer.addIsosurface).toHaveBeenCalledWith(
      volumeData,
      expect.objectContaining({ opacity: 0 }),
    );
  });

  it('group deletion removes grouped map and isosurface viewer handles', async () => {
    const { mockViewer, addMapEntry, addIsosurfaceEntry, addGroup, getState } = await bootFixtureApp();
    const boxHandle = { kind: 'box' };
    const isoHandle = { kind: 'iso' };

    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: makeBounds(),
      handles: [boxHandle],
    });
    addIsosurfaceEntry({
      name: 'mesh',
      mapName: 'density',
      level: 1,
      handle: isoHandle,
    });
    addGroup('density_group', ['density']);
    await flushStateUpdates();
    mockViewer.removeShape.mockClear();

    document.querySelector('.sidebar-group-header[data-name="density_group"] [data-btn="A"]').click();
    clickPopupItem('delete');

    expect(mockViewer.removeShape).toHaveBeenCalledWith(boxHandle);
    expect(mockViewer.removeShape).toHaveBeenCalledWith(isoHandle);
    expect(getState().maps.has('density')).toBe(false);
    expect(getState().isosurfaces.has('mesh')).toBe(false);
  });

  it('object rename reparents child surfaces to the new object name', async () => {
    const { addSurfaceEntry, getState } = await bootFixtureApp();

    addSurfaceEntry({
      name: 'child_surface',
      selection: {},
      type: 'molecular',
      surfaceType: 'MS',
      parentName: 'static-water',
      handle: 104,
      pending: false,
    });
    await flushStateUpdates();

    document.querySelector('[data-kind="object"][data-name="static-water"] [data-btn="A"]').click();
    clickPopupItem('rename');
    document.querySelector('.modal-input').value = 'renamed-water';
    document.querySelector('.modal-btn').click();

    expect(getState().surfaces.get('child_surface').parentName).toBe('renamed-water');
  });

  it('selection Action menu creates a surface from the selection spec', async () => {
    const { mockViewer, addSelection, getState } = await bootFixtureApp();

    addSelection('ligand', 'ligand atoms', { resn: 'LIG' }, 3);
    await flushStateUpdates();

    document.querySelector('[data-kind="selection"][data-name="ligand"] [data-btn="A"]').click();
    expect(document.querySelector('[data-value="surface:sasa"]')).not.toBeNull();
    clickPopupItem('surface:sasa');
    await flushStateUpdates();

    const surface = getState().surfaces.get('surface_1');
    expect(surface).toMatchObject({
      name: 'surface_1',
      selection: { resn: 'LIG' },
      type: 'sasa',
      surfaceType: 'SAS',
      parentName: null,
    });
    expect(mockViewer.addSurface).toHaveBeenCalledWith(
      'SAS',
      expect.objectContaining({ opacity: 0.75, wireframe: false }),
      { resn: 'LIG' },
      { resn: 'LIG' },
    );
  });

  it('map action menu creates and recontours child isosurfaces', async () => {
    const { mockViewer, addMapEntry, getState } = await bootFixtureApp();

    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: makeBounds(),
      handles: [],
    });
    await flushStateUpdates();

    document.querySelector('[data-kind="map"][data-name="density"] [data-btn="A"]').click();
    clickPopupItem('create_isosurface');
    await flushStateUpdates();

    const iso = getState().isosurfaces.get('isosurface_1');
    expect(iso).toMatchObject({
      name: 'isosurface_1',
      mapName: 'density',
      level: 1,
      representation: 'mesh',
    });
    expect(document.querySelector('[data-kind="isosurface"][data-name="isosurface_1"]')).not.toBeNull();
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(
      getState().maps.get('density').volumeData,
      expect.objectContaining({ isoval: 1, wireframe: true }),
    );

    vi.useFakeTimers();

    document.querySelector('[data-kind="isosurface"][data-name="isosurface_1"] [data-btn="A"]').click();
    clickPopupItem('contour');
    const contourInput = document.querySelector('.contour-level-input');
    expect(contourInput).not.toBeNull();
    contourInput.value = '0.42';
    contourInput.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(150);
    await flushStateUpdates();

    expect(getState().isosurfaces.get('isosurface_1').level).toBe(0.42);
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(
      getState().maps.get('density').volumeData,
      expect.objectContaining({ isoval: 0.42 }),
    );
  });

  it('map action menu focuses map bounds', async () => {
    const { mockViewer, addMapEntry } = await bootFixtureApp();

    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: makeBounds(),
      handles: [],
    });
    await flushStateUpdates();

    document.querySelector('[data-kind="map"][data-name="density"] [data-btn="A"]').click();
    clickPopupItem('center');

    expect(mockViewer.setView).toHaveBeenLastCalledWith([
      -0.5, -0.5, -0.5, 0, 0, 0, 0, 1,
    ]);

    document.querySelector('[data-kind="map"][data-name="density"] [data-btn="A"]').click();
    clickPopupItem('zoom');

    const zoomView = mockViewer.setView.mock.calls.at(-1)[0];
    expect(zoomView.slice(0, 3)).toEqual([-0.5, -0.5, -0.5]);
    expect(zoomView[3]).not.toBe(0);
  });

  it('map action menu toggles the bounding box without hiding child isosurfaces', async () => {
    const { mockViewer, addMapEntry, addIsosurfaceEntry, getState } = await bootFixtureApp();

    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: makeBounds(),
      handles: [],
    });
    addIsosurfaceEntry({
      name: 'isosurface_1',
      mapName: 'density',
      handle: { id: 'iso' },
      parentVisible: true,
    });
    await flushStateUpdates();

    document.querySelector('[data-kind="map"][data-name="density"] [data-btn="A"]').click();
    const item = document.querySelector('[data-value="show_bounding_box"]');
    expect(item.classList.contains('checked')).toBe(false);
    item.click();
    await flushStateUpdates();

    expect(getState().maps.get('density')).toMatchObject({
      showBoundingBox: true,
      visible: true,
    });
    expect(getState().isosurfaces.get('isosurface_1')).toMatchObject({
      parentVisible: true,
    });
    expect(mockViewer.addBox).toHaveBeenLastCalledWith(expect.objectContaining({
      center: makeBounds().center,
      wireframe: true,
    }));

    document.querySelector('[data-kind="map"][data-name="density"] [data-btn="A"]').click();
    expect(document.querySelector('[data-value="show_bounding_box"]').classList.contains('checked')).toBe(true);
  });

  it('terminal isosurface command uses the main map service context', async () => {
    const { mockViewer, addMapEntry, getState } = await bootFixtureApp();

    addMapEntry({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'ccp4',
      volumeData: {},
      bounds: makeBounds(),
      handles: [],
    });
    await flushStateUpdates();

    const input = document.querySelector('.terminal-input');
    input.value = 'isosurface command_iso, density, 2';
    document.querySelector('.terminal-send').click();
    await flushStateUpdates();

    expect(getState().isosurfaces.get('command_iso')).toMatchObject({
      name: 'command_iso',
      mapName: 'density',
      level: 2,
      representation: 'mesh',
    });
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(
      getState().maps.get('density').volumeData,
      expect.objectContaining({ isoval: 2, wireframe: true }),
    );
  });

  it('selection Action menu orients to the selection spec', async () => {
    const { mockViewer, addSelection } = await bootFixtureApp();

    addSelection('ligand', 'ligand atoms', { resn: 'LIG' }, 3);
    await flushStateUpdates();

    document.querySelector('[data-kind="selection"][data-name="ligand"] [data-btn="A"]').click();
    const orientItem = Array.from(
      document.querySelectorAll('.popup-menu-item'),
    ).find((el) => el.textContent === 'Orient');
    expect(orientItem).not.toBeUndefined();
    orientItem.click();

    expect(mockViewer.selectedAtoms).toHaveBeenCalledWith({ resn: 'LIG' });
    expect(mockViewer.zoomTo).toHaveBeenCalledWith({ resn: 'LIG' });
  });
});
