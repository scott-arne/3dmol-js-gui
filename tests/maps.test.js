import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockViewer } from './helpers/mock-3dmol.js';
import { getState } from '../src/state.js';
import { getViewer, scheduleRender } from '../src/viewer.js';
import {
  buildIsosurfaceSpec,
  computeVolumeBounds,
  createIsosurface,
  createMap,
  normalizeVolumeFormat,
  removeIsosurface,
  removeMap,
  setIsosurfaceColor,
  setIsosurfaceLevel,
  setIsosurfaceOpacity,
  setIsosurfaceRepresentation,
  setIsosurfaceVisibility,
  setMapColor,
  setMapOpacity,
  setMapVisibility,
} from '../src/maps.js';

vi.mock('../src/viewer.js', () => ({
  getViewer: vi.fn(),
  scheduleRender: vi.fn(),
}));

let mockViewer;

function resetState() {
  const state = getState();
  state.objects.clear();
  state.selections.clear();
  state.surfaces.clear();
  state.maps.clear();
  state.isosurfaces.clear();
  state.entryTree.length = 0;
  state._listeners.length = 0;
  state.selectionMode = 'atoms';
}

function createCornerVolume() {
  const size = { x: 3, y: 2, z: 2 };
  return {
    size,
    origin: { x: 1, y: 2, z: 3 },
    unit: { x: 2, y: 3, z: 4 },
    getCoordinates: vi.fn((index) => {
      const x = Math.floor(index / (size.y * size.z));
      const yz = index % (size.y * size.z);
      const y = Math.floor(yz / size.z);
      const z = yz % size.z;

      return {
        x: 1 + x * 2,
        y: 2 + y * 3,
        z: 3 + z * 4,
      };
    }),
  };
}

function installVolumeData(volumeData) {
  globalThis.$3Dmol = {
    VolumeData: vi.fn(() => volumeData),
  };
}

describe('map viewer service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    mockViewer = createMockViewer();
    getViewer.mockReturnValue(mockViewer);
    installVolumeData(createCornerVolume());
  });

  it('normalizes supported volume formats and rejects unsupported ones', () => {
    expect(normalizeVolumeFormat('ccp4')).toEqual({ format: 'ccp4', sourceFormat: 'ccp4' });
    expect(normalizeVolumeFormat('map')).toEqual({ format: 'ccp4', sourceFormat: 'map' });
    expect(normalizeVolumeFormat('mrc')).toEqual({ format: 'ccp4', sourceFormat: 'mrc' });
    expect(normalizeVolumeFormat('cube')).toEqual({ format: 'cube', sourceFormat: 'cube' });
    expect(() => normalizeVolumeFormat('txt')).toThrow('Unsupported map format "txt"');
  });

  it('computes bounds from the eight volume grid corners', () => {
    const volumeData = createCornerVolume();

    expect(computeVolumeBounds(volumeData)).toEqual({
      min: { x: 1, y: 2, z: 3 },
      max: { x: 5, y: 5, z: 7 },
      center: { x: 3, y: 3.5, z: 5 },
      dimensions: { w: 4, h: 3, d: 4 },
    });
    expect(volumeData.getCoordinates).toHaveBeenCalledTimes(8);
  });

  it('creates a VolumeData-backed map entry and renders its bounding box', () => {
    const volumeData = createCornerVolume();
    installVolumeData(volumeData);
    const boxHandle = { box: true };
    mockViewer.addBox.mockReturnValue(boxHandle);

    const map = createMap({
      name: 'density',
      data: 'map data',
      format: 'map',
      color: '#123456',
      opacity: 0.6,
    });

    expect(globalThis.$3Dmol.VolumeData).toHaveBeenCalledWith('map data', 'ccp4');
    expect(map).toMatchObject({
      name: 'density',
      format: 'ccp4',
      sourceFormat: 'map',
      volumeData,
      bounds: {
        min: { x: 1, y: 2, z: 3 },
        max: { x: 5, y: 5, z: 7 },
        center: { x: 3, y: 3.5, z: 5 },
        dimensions: { w: 4, h: 3, d: 4 },
      },
      visible: true,
      color: '#123456',
      opacity: 0.6,
      handles: [boxHandle],
    });
    expect(getState().maps.get('density')).toBe(map);
    expect(mockViewer.addBox).toHaveBeenCalledWith({
      center: { x: 3, y: 3.5, z: 5 },
      dimensions: { w: 4, h: 3, d: 4 },
      color: '#123456',
      opacity: 0.6,
      wireframe: true,
    });
    expect(scheduleRender).toHaveBeenCalled();
  });

  it('creates the initial map box without rendering when render is false', () => {
    const boxHandle = { box: true };
    mockViewer.addBox.mockReturnValue(boxHandle);

    const map = createMap({
      name: 'density',
      data: 'map data',
      format: 'ccp4',
      render: false,
    });

    expect(getState().maps.get('density')).toBe(map);
    expect(mockViewer.addBox).toHaveBeenCalledWith(expect.objectContaining({
      center: { x: 3, y: 3.5, z: 5 },
      dimensions: { w: 4, h: 3, d: 4 },
    }));
    expect(map.handles).toEqual([boxHandle]);
    expect(scheduleRender).not.toHaveBeenCalled();
  });

  it('updates map visibility, color, and opacity by rebuilding box handles', () => {
    const handles = [{ id: 'box-1' }, { id: 'box-2' }, { id: 'box-3' }];
    mockViewer.addBox
      .mockReturnValueOnce(handles[0])
      .mockReturnValueOnce(handles[1])
      .mockReturnValueOnce(handles[2]);
    createMap({ name: 'density', data: 'map data', format: 'ccp4' });

    setMapVisibility('density', false);
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(handles[0]);
    expect(getState().maps.get('density').handles).toEqual([]);
    expect(mockViewer.addBox).toHaveBeenCalledTimes(1);

    setMapColor('density', '#FF0000');
    expect(mockViewer.addBox).toHaveBeenCalledTimes(1);
    expect(getState().maps.get('density')).toMatchObject({
      color: '#FF0000',
      visible: false,
      handles: [],
    });

    setMapVisibility('density', true);
    expect(mockViewer.addBox).toHaveBeenLastCalledWith(expect.objectContaining({
      color: '#FF0000',
      opacity: 1,
    }));
    expect(getState().maps.get('density').handles).toEqual([handles[1]]);

    setMapOpacity('density', 0.25);
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(handles[1]);
    expect(mockViewer.addBox).toHaveBeenLastCalledWith(expect.objectContaining({
      color: '#FF0000',
      opacity: 0.25,
    }));
    expect(getState().maps.get('density').handles).toEqual([handles[2]]);
  });

  it('keeps the existing visible map handle when addBox throws during redraw', () => {
    const oldHandle = { id: 'box-old' };
    mockViewer.addBox.mockReturnValue(oldHandle);
    createMap({ name: 'density', data: 'map data', format: 'ccp4', opacity: 1 });
    mockViewer.removeShape.mockClear();
    mockViewer.addBox.mockImplementationOnce(() => {
      throw new Error('box failed');
    });

    expect(() => setMapOpacity('density', 0.25)).toThrow('box failed');

    expect(mockViewer.removeShape).not.toHaveBeenCalled();
    expect(getState().maps.get('density')).toMatchObject({
      handles: [oldHandle],
      opacity: 1,
    });
  });

  it('removes a partial map entry when initial box creation fails', () => {
    mockViewer.addBox.mockImplementationOnce(() => {
      throw new Error('box failed');
    });

    expect(() => createMap({ name: 'density', data: 'map data', format: 'ccp4' })).toThrow(
      'box failed',
    );

    expect(getState().maps.has('density')).toBe(false);
    expect(getState().entryTree).toEqual([]);
  });

  it('builds isosurface specs for representations, visibility, selection, and buffer', () => {
    expect(buildIsosurfaceSpec({
      level: 1.5,
      representation: 'mesh',
      visible: true,
      parentVisible: true,
      color: '#00AAFF',
      opacity: 0.4,
    })).toEqual({
      isoval: 1.5,
      wireframe: true,
      opacity: 0.4,
      color: '#00AAFF',
    });

    expect(buildIsosurfaceSpec({
      level: -2,
      representation: 'surface',
      visible: true,
      parentVisible: true,
      color: '#AA00FF',
      opacity: 0.7,
      selection: { chain: 'A' },
      buffer: 4,
    })).toEqual({
      isoval: -2,
      wireframe: false,
      opacity: 0.7,
      color: '#AA00FF',
      selection: { chain: 'A' },
      seldist: 4,
    });

    expect(buildIsosurfaceSpec({
      level: 1,
      representation: 'surface',
      visible: false,
      parentVisible: true,
      color: '#FFFFFF',
      opacity: 0.8,
    })).toMatchObject({ opacity: 0 });
    expect(buildIsosurfaceSpec({
      level: 1,
      representation: 'surface',
      visible: true,
      parentVisible: false,
      color: '#FFFFFF',
      opacity: 0.8,
    })).toMatchObject({ opacity: 0 });
  });

  it('creates, redraws, and removes isosurfaces', () => {
    const isoHandles = [
      { id: 'iso-1' },
      { id: 'iso-2' },
      { id: 'iso-3' },
      { id: 'iso-4' },
      { id: 'iso-5' },
      { id: 'iso-6' },
    ];
    mockViewer.addIsosurface
      .mockReturnValueOnce(isoHandles[0])
      .mockReturnValueOnce(isoHandles[1])
      .mockReturnValueOnce(isoHandles[2])
      .mockReturnValueOnce(isoHandles[3])
      .mockReturnValueOnce(isoHandles[4])
      .mockReturnValueOnce(isoHandles[5]);

    expect(() => createIsosurface({ name: 'missing', mapName: 'missing' })).toThrow(
      'Map "missing" not found',
    );

    const map = createMap({ name: 'density', data: 'map data', format: 'mrc' });

    const iso = createIsosurface({
      name: 'mesh',
      mapName: 'density',
      level: 1.2,
      color: '#FEDCBA',
      opacity: 0.5,
    });

    expect(iso).toMatchObject({
      name: 'mesh',
      mapName: 'density',
      level: 1.2,
      representation: 'mesh',
      handle: isoHandles[0],
      visible: true,
      parentVisible: true,
      color: '#FEDCBA',
      opacity: 0.5,
    });
    expect(mockViewer.addIsosurface).toHaveBeenCalledWith(map.volumeData, {
      isoval: 1.2,
      wireframe: true,
      opacity: 0.5,
      color: '#FEDCBA',
    });
    expect(scheduleRender).toHaveBeenCalled();

    expect(() => setIsosurfaceRepresentation('mesh', 'volume')).toThrow(
      'Unknown isosurface representation "volume"',
    );

    setIsosurfaceRepresentation('mesh', 'surface');
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(isoHandles[0]);
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(map.volumeData, expect.objectContaining({
      wireframe: false,
    }));

    setIsosurfaceLevel('mesh', 2.5);
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(isoHandles[1]);
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(map.volumeData, expect.objectContaining({
      isoval: 2.5,
    }));

    setIsosurfaceOpacity('mesh', 0.2);
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(isoHandles[2]);
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(map.volumeData, expect.objectContaining({
      opacity: 0.2,
    }));

    setIsosurfaceColor('mesh', '#00FF00');
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(isoHandles[3]);
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(map.volumeData, expect.objectContaining({
      color: '#00FF00',
    }));

    setIsosurfaceVisibility('mesh', false);
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(isoHandles[4]);
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(map.volumeData, expect.objectContaining({
      opacity: 0,
    }));
    expect(getState().isosurfaces.get('mesh').handle).toBe(isoHandles[5]);

    const removed = removeIsosurface('mesh');
    expect(removed.name).toBe('mesh');
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(isoHandles[5]);
    expect(getState().isosurfaces.has('mesh')).toBe(false);
  });

  it('keeps the existing isosurface handle when addIsosurface throws during redraw', () => {
    const oldHandle = { id: 'iso-old' };
    createMap({ name: 'density', data: 'map data', format: 'ccp4' });
    mockViewer.addIsosurface.mockReturnValue(oldHandle);
    createIsosurface({ name: 'mesh', mapName: 'density', level: 1.2 });
    mockViewer.removeShape.mockClear();
    mockViewer.addIsosurface.mockImplementationOnce(() => {
      throw new Error('isosurface failed');
    });

    expect(() => setIsosurfaceLevel('mesh', 2.5)).toThrow('isosurface failed');

    expect(mockViewer.removeShape).not.toHaveBeenCalled();
    expect(getState().isosurfaces.get('mesh')).toMatchObject({
      handle: oldHandle,
      level: 1.2,
    });
  });

  it('removes a partial new isosurface entry when initial isosurface creation fails', () => {
    createMap({ name: 'density', data: 'map data', format: 'ccp4' });
    mockViewer.addIsosurface.mockImplementationOnce(() => {
      throw new Error('isosurface failed');
    });

    expect(() => createIsosurface({ name: 'mesh', mapName: 'density' })).toThrow(
      'isosurface failed',
    );

    expect(getState().isosurfaces.has('mesh')).toBe(false);
    expect(getState().entryTree[0].children).toEqual([]);
  });

  it('removes the previous same-name isosurface handle only after replacement succeeds', () => {
    const oldHandle = { id: 'iso-old' };
    const newHandle = { id: 'iso-new' };
    createMap({ name: 'density', data: 'map data', format: 'ccp4' });
    mockViewer.addIsosurface.mockReturnValueOnce(oldHandle);
    createIsosurface({
      name: 'mesh',
      mapName: 'density',
      level: 1,
      color: '#111111',
    });
    mockViewer.removeShape.mockClear();
    mockViewer.addIsosurface.mockImplementationOnce(() => {
      expect(mockViewer.removeShape).not.toHaveBeenCalled();
      return newHandle;
    });

    const replaced = createIsosurface({
      name: 'mesh',
      mapName: 'density',
      level: 2,
      color: '#222222',
    });

    expect(mockViewer.removeShape).toHaveBeenCalledWith(oldHandle);
    expect(replaced).toMatchObject({
      handle: newHandle,
      level: 2,
      color: '#222222',
    });
  });

  it('restores the previous same-name isosurface when replacement creation fails', () => {
    const oldHandle = { id: 'iso-old' };
    createMap({ name: 'density', data: 'map data', format: 'ccp4' });
    mockViewer.addIsosurface.mockReturnValueOnce(oldHandle);
    createIsosurface({
      name: 'mesh',
      mapName: 'density',
      level: 1,
      color: '#111111',
    });
    mockViewer.removeShape.mockClear();
    mockViewer.addIsosurface.mockImplementationOnce(() => {
      throw new Error('replacement failed');
    });

    expect(() => createIsosurface({
      name: 'mesh',
      mapName: 'density',
      level: 2,
      color: '#222222',
    })).toThrow('replacement failed');

    expect(mockViewer.removeShape).not.toHaveBeenCalled();
    expect(getState().isosurfaces.get('mesh')).toMatchObject({
      handle: oldHandle,
      level: 1,
      color: '#111111',
    });
  });

  it('cascades map visibility to child isosurfaces and redraws them', () => {
    const boxHandles = [{ id: 'box-1' }, { id: 'box-2' }];
    const isoHandles = [{ id: 'iso-1' }, { id: 'iso-2' }, { id: 'iso-3' }];
    mockViewer.addBox
      .mockReturnValueOnce(boxHandles[0])
      .mockReturnValueOnce(boxHandles[1]);
    mockViewer.addIsosurface
      .mockReturnValueOnce(isoHandles[0])
      .mockReturnValueOnce(isoHandles[1])
      .mockReturnValueOnce(isoHandles[2]);
    const map = createMap({ name: 'density', data: 'map data', format: 'ccp4' });
    createIsosurface({
      name: 'mesh',
      mapName: 'density',
      level: 1,
      opacity: 0.5,
    });

    setMapVisibility('density', false);
    expect(getState().isosurfaces.get('mesh')).toMatchObject({
      parentVisible: false,
      handle: isoHandles[1],
    });
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(
      map.volumeData,
      expect.objectContaining({ opacity: 0 }),
    );

    setMapVisibility('density', true);
    expect(getState().isosurfaces.get('mesh')).toMatchObject({
      parentVisible: true,
      handle: isoHandles[2],
    });
    expect(mockViewer.addIsosurface).toHaveBeenLastCalledWith(
      map.volumeData,
      expect.objectContaining({ opacity: 0.5 }),
    );
  });

  it('rolls back map visibility cascade when a child isosurface redraw fails', () => {
    const oldMapHandle = { id: 'box-old' };
    const newMapHandle = { id: 'box-new' };
    const oldIsoHandle = { id: 'iso-old' };
    mockViewer.addBox.mockReturnValueOnce(oldMapHandle);
    mockViewer.addIsosurface.mockReturnValueOnce(oldIsoHandle);
    createMap({ name: 'density', data: 'map data', format: 'ccp4' });
    createIsosurface({ name: 'mesh', mapName: 'density' });
    mockViewer.removeShape.mockClear();
    mockViewer.addBox.mockReturnValueOnce(newMapHandle);
    mockViewer.addIsosurface.mockImplementationOnce(() => {
      throw new Error('isosurface failed');
    });

    expect(() => setMapVisibility('density', true)).toThrow('isosurface failed');

    expect(getState().maps.get('density')).toMatchObject({
      visible: true,
      handles: [oldMapHandle],
    });
    expect(getState().isosurfaces.get('mesh')).toMatchObject({
      parentVisible: true,
      handle: oldIsoHandle,
    });
    expect(mockViewer.removeShape).not.toHaveBeenCalledWith(oldMapHandle);
    expect(mockViewer.removeShape).not.toHaveBeenCalledWith(oldIsoHandle);
    expect(mockViewer.removeShape).toHaveBeenCalledWith(newMapHandle);
  });

  it('removes map boxes and child isosurface handles with their state entries', () => {
    const mapHandle = { id: 'map-box' };
    const isoHandle = { id: 'iso' };
    mockViewer.addBox.mockReturnValue(mapHandle);
    mockViewer.addIsosurface.mockReturnValue(isoHandle);
    createMap({ name: 'density', data: 'map data', format: 'ccp4' });
    createIsosurface({ name: 'mesh', mapName: 'density' });

    const removed = removeMap('density');

    expect(mockViewer.removeShape).toHaveBeenCalledWith(mapHandle);
    expect(mockViewer.removeShape).toHaveBeenCalledWith(isoHandle);
    expect(removed.map.name).toBe('density');
    expect(removed.isosurfaces.map(entry => entry.name)).toEqual(['mesh']);
    expect(getState().maps.has('density')).toBe(false);
    expect(getState().isosurfaces.has('mesh')).toBe(false);
  });
});
