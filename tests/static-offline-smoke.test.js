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
    const html = readFileSync(fixturePath, 'utf8');
    const mockViewer = createMockViewer();

    installFixtureDom(html);
    installMock3Dmol(mockViewer);

    await import('../src/main.js');

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockViewer.addModel).toHaveBeenCalledWith(
      expect.stringContaining('static-water'),
      'pdb',
      { keepH: true, assignBonds: true }
    );
    expect(mockViewer.zoomTo).toHaveBeenCalled();
    expect(mockViewer.render).toHaveBeenCalled();
  });
});
