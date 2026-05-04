import { describe, expect, it, vi } from 'vitest';
import { applyInitSceneOperation, decodeInitMapData } from '../src/init-operations.js';
import { addMapEntry, addSurfaceEntry, getState } from '../src/state.js';

function resetState() {
  const state = getState();
  state.objects.clear();
  state.selections.clear();
  state.surfaces.clear();
  state.maps.clear();
  state.isosurfaces.clear();
  state.entryTree.length = 0;
  state._listeners.length = 0;
}

describe('init operation helpers', () => {
  it('decodes base64 map payloads into ArrayBuffer values', () => {
    const decoded = decodeInitMapData({
      encoding: 'base64',
      data: 'AQIDBA==',
    });

    expect(decoded).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(decoded)]).toEqual([1, 2, 3, 4]);
  });

  it('passes text map payloads through unchanged', () => {
    expect(decodeInitMapData({
      encoding: 'text',
      data: 'cube text',
    })).toBe('cube text');
  });

  it('generates a stable name for unnamed isosurface operations', async () => {
    resetState();
    addMapEntry({ name: 'density' });
    const mapService = {
      createIsosurface: vi.fn(),
    };

    await applyInitSceneOperation({
      op: 'add_isosurface',
      mapName: 'density',
    }, { mapService });

    expect(mapService.createIsosurface).toHaveBeenCalledWith(expect.objectContaining({
      name: 'isosurface_1',
      mapName: 'density',
    }));
  });

  it('generates unique names for unnamed surface operations', async () => {
    resetState();
    const surfaceService = {
      findSingleSurfaceParent: vi.fn(() => null),
      createSurface: vi.fn((options) => addSurfaceEntry({
        ...options,
        surfaceType: 'MS',
      })),
    };

    await applyInitSceneOperation({
      op: 'add_surface',
      selection: { chain: 'A' },
    }, { surfaceService });
    await applyInitSceneOperation({
      op: 'add_surface',
      selection: { chain: 'B' },
    }, { surfaceService });

    expect(surfaceService.createSurface).toHaveBeenNthCalledWith(1, expect.objectContaining({
      name: 'surface_1',
      selection: { chain: 'A' },
    }));
    expect(surfaceService.createSurface).toHaveBeenNthCalledWith(2, expect.objectContaining({
      name: 'surface_2',
      selection: { chain: 'B' },
    }));
  });
});
