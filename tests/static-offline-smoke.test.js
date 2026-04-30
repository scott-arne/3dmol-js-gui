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
});
