import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockViewer } from './helpers/mock-3dmol.js';
import { getState } from '../src/state.js';
import { getViewer, scheduleRender } from '../src/viewer.js';
import {
  buildIsosurfaceSpec,
  computeContourStats,
  computeVolumeBounds,
  createIsosurface,
  createMap,
  getSuggestedIsosurfaceLevel,
  normalizeVolumeFormat,
  removeIsosurface,
  removeMap,
  setIsosurfaceColor,
  setIsosurfaceLevel,
  setIsosurfaceOpacity,
  setIsosurfaceRepresentation,
  setIsosurfaceVisibility,
  setMapBoundingBoxVisibility,
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

function createCornerVolume(data = []) {
  const size = { x: 3, y: 2, z: 2 };
  return {
    size,
    data,
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

function createOutlierDensityValues() {
  return [
    -1000,
    ...Array.from({ length: 99 }, (_, index) => index),
    1000,
    NaN,
    Infinity,
    -Infinity,
    'ignored',
  ];
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

  it('uses the volume matrix for transformed map bounds', () => {
    const volumeData = {
      size: { x: 3, y: 2, z: 2 },
      matrix: {
        elements: new Float32Array([
          0, 2, 0, 0,
          3, 0, 0, 0,
          0, 0, 4, 0,
          10, 20, 30, 1,
        ]),
      },
      getCoordinates: vi.fn(() => ({ x: 999, y: 999, z: 999 })),
    };

    expect(computeVolumeBounds(volumeData)).toEqual({
      min: { x: 10, y: 20, z: 30 },
      max: { x: 13, y: 24, z: 34 },
      center: { x: 11.5, y: 22, z: 32 },
      dimensions: { w: 3, h: 4, d: 4 },
    });
    expect(volumeData.getCoordinates).not.toHaveBeenCalled();
  });

  it('computes robust contour statistics from finite density values', () => {
    const stats = computeContourStats({ data: createOutlierDensityValues() });

    expect(stats).toMatchObject({
      min: -1000,
      max: 1000,
      robustMin: 0,
      robustMax: 98,
    });
    expect(stats.suggestedLevel).toBeCloseTo(stats.mean + stats.stdDev);
  });

  it('computes mean and standard deviation for sigma contour controls', () => {
    const stats = computeContourStats({ data: [0, 2, 4] });

    expect(stats.mean).toBeCloseTo(2);
    expect(stats.stdDev).toBeCloseTo(Math.sqrt(8 / 3));
    expect(stats.suggestedLevel).toBeCloseTo(stats.mean + stats.stdDev);
  });

  it('interpolates robust percentiles from indexed finite density values', () => {
    const data = {
      length: 4,
      0: 0,
      1: 100,
      2: 200,
      3: 300,
      [Symbol.iterator]: () => {
        throw new Error('data should be read by index');
      },
    };

    const stats = computeContourStats({ data });

    expect(stats.min).toBe(0);
    expect(stats.max).toBe(300);
    expect(stats.robustMin).toBeCloseTo(3);
    expect(stats.robustMax).toBeCloseTo(297);
    expect(stats.suggestedLevel).toBeCloseTo(stats.mean + stats.stdDev);
  });

  it('ignores non-number density values even when they are numerically coercible', () => {
    const stats = computeContourStats({
      data: [1, '2', null, false, '', 3],
    });

    expect(stats.min).toBe(1);
    expect(stats.max).toBe(3);
    expect(stats.robustMin).toBeCloseTo(1.02);
    expect(stats.robustMax).toBeCloseTo(2.98);
    expect(stats.suggestedLevel).toBeCloseTo(3);
  });

  it('caps the sorted percentile sample for large density arrays', () => {
    const data = {
      length: 50001,
    };
    for (let index = 0; index < data.length; index++) {
      data[index] = index;
    }
    const originalSort = Array.prototype.sort;
    const sortLengths = [];
    const sortSpy = vi
      .spyOn(Array.prototype, 'sort')
      .mockImplementation(function captureSortLength(compareFn) {
        sortLengths.push(this.length);
        return originalSort.call(this, compareFn);
      });

    try {
      const stats = computeContourStats({ data });

      expect(stats.min).toBe(0);
      expect(stats.max).toBe(50000);
      expect(sortLengths.length).toBeGreaterThan(0);
      expect(Math.max(...sortLengths)).toBeLessThan(data.length);
    } finally {
      sortSpy.mockRestore();
    }
  });

  it('uses a small centered robust range when finite density values collapse', () => {
    const stats = computeContourStats({ data: new Float32Array([NaN, 2.5, Infinity]) });

    expect(stats.min).toBeCloseTo(2.5);
    expect(stats.max).toBeCloseTo(2.5);
    expect(stats.robustMin).toBeLessThan(2.5);
    expect(stats.robustMax).toBeGreaterThan(2.5);
    expect((stats.robustMin + stats.robustMax) / 2).toBeCloseTo(2.5);
    expect(stats.suggestedLevel).toBeCloseTo(2.5);
  });

  it('uses the final robust range rule when collapsed zero density values expand', () => {
    const stats = computeContourStats({ data: new Float32Array([0, 0, 0]) });

    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.robustMin).toBeCloseTo(-1e-6);
    expect(stats.robustMax).toBeCloseTo(1e-6);
    expect(stats.suggestedLevel).toBeGreaterThan(0);
    expect(stats.suggestedLevel).toBeCloseTo(5e-7, 12);
  });

  it('returns fallback contour statistics when density data has no finite values', () => {
    expect(computeContourStats({ data: [NaN, Infinity, -Infinity, 'ignored'] })).toEqual({
      min: 0,
      max: 1,
      robustMin: 0,
      robustMax: 1,
      mean: 0,
      stdDev: 1,
      suggestedLevel: 1,
    });
  });

  it('creates a VolumeData-backed map entry with its bounding box hidden by default', () => {
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
      showBoundingBox: false,
      color: '#123456',
      opacity: 0.6,
      handles: [],
    });
    expect(getState().maps.get('density')).toBe(map);
    expect(mockViewer.addBox).not.toHaveBeenCalled();
    expect(scheduleRender).not.toHaveBeenCalled();
  });

  it('stores contour statistics from parsed map data and returns the suggested level', () => {
    const volumeData = createCornerVolume(new Float32Array(createOutlierDensityValues()));
    installVolumeData(volumeData);
    mockViewer.addBox.mockReturnValue({ box: true });

    const map = createMap({ name: 'density', data: 'map data', format: 'map' });

    expect(map.contourStats).toMatchObject({
      min: -1000,
      max: 1000,
      robustMin: 0,
      robustMax: 98,
    });
    expect(map.contourStats.suggestedLevel).toBeCloseTo(
      map.contourStats.mean + map.contourStats.stdDev,
    );
    expect(getSuggestedIsosurfaceLevel(map)).toBeCloseTo(map.contourStats.suggestedLevel);
    expect(getSuggestedIsosurfaceLevel({ contourStats: { suggestedLevel: Infinity } })).toBe(1);
    expect(getSuggestedIsosurfaceLevel({ contourStats: null })).toBe(1);
    expect(getSuggestedIsosurfaceLevel(null)).toBe(1);
  });

  it('uses one sigma above the map mean as the default isosurface level', () => {
    expect(getSuggestedIsosurfaceLevel({
      contourStats: {
        mean: 0.25,
        stdDev: 0.1,
        suggestedLevel: -0.5,
      },
    })).toBeCloseTo(0.35);
  });

  it('creates the initial map box without rendering when showBoundingBox is true and render is false', () => {
    const boxHandle = { box: true };
    mockViewer.addBox.mockReturnValue(boxHandle);

    const map = createMap({
      name: 'density',
      data: 'map data',
      format: 'ccp4',
      showBoundingBox: true,
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

  it('toggles map bounding boxes independently from map visibility', () => {
    const handles = [{ id: 'box-1' }, { id: 'box-2' }, { id: 'box-3' }];
    mockViewer.addBox
      .mockReturnValueOnce(handles[0])
      .mockReturnValueOnce(handles[1])
      .mockReturnValueOnce(handles[2]);
    createMap({ name: 'density', data: 'map data', format: 'ccp4' });
    expect(getState().maps.get('density')).toMatchObject({
      visible: true,
      showBoundingBox: false,
      handles: [],
    });
    expect(mockViewer.addBox).not.toHaveBeenCalled();

    setMapBoundingBoxVisibility('density', true);
    expect(getState().maps.get('density')).toMatchObject({
      visible: true,
      showBoundingBox: true,
      handles: [handles[0]],
    });
    expect(mockViewer.addBox).toHaveBeenCalledTimes(1);

    scheduleRender.mockClear();
    setMapVisibility('density', false);
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(handles[0]);
    expect(getState().maps.get('density')).toMatchObject({
      visible: false,
      showBoundingBox: true,
      handles: [],
    });
    expect(mockViewer.addBox).toHaveBeenCalledTimes(1);
    expect(scheduleRender).toHaveBeenCalledTimes(1);

    scheduleRender.mockClear();
    setMapColor('density', '#FF0000');
    expect(mockViewer.addBox).toHaveBeenCalledTimes(1);
    expect(getState().maps.get('density')).toMatchObject({
      color: '#FF0000',
      visible: false,
      showBoundingBox: true,
      handles: [],
    });

    setMapVisibility('density', true);
    expect(mockViewer.addBox).toHaveBeenLastCalledWith(expect.objectContaining({
      color: '#FF0000',
      opacity: 1,
    }));
    expect(getState().maps.get('density').handles).toEqual([handles[1]]);
    expect(scheduleRender).toHaveBeenCalledTimes(1);

    scheduleRender.mockClear();
    setMapOpacity('density', 0.25);
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(handles[1]);
    expect(mockViewer.addBox).toHaveBeenLastCalledWith(expect.objectContaining({
      color: '#FF0000',
      opacity: 0.25,
    }));
    expect(getState().maps.get('density').handles).toEqual([handles[2]]);
    expect(scheduleRender).toHaveBeenCalledTimes(1);

    setMapBoundingBoxVisibility('density', false);
    expect(mockViewer.removeShape).toHaveBeenLastCalledWith(handles[2]);
    expect(getState().maps.get('density')).toMatchObject({
      visible: true,
      showBoundingBox: false,
      handles: [],
    });
  });

  it('keeps the existing visible map handle when addBox throws during redraw', () => {
    const oldHandle = { id: 'box-old' };
    mockViewer.addBox.mockReturnValue(oldHandle);
    createMap({
      name: 'density',
      data: 'map data',
      format: 'ccp4',
      opacity: 1,
      showBoundingBox: true,
    });
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

    expect(() => createMap({
      name: 'density',
      data: 'map data',
      format: 'ccp4',
      showBoundingBox: true,
    })).toThrow('box failed');

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

  it('defaults newly created isosurfaces to blue', () => {
    const isoHandle = { id: 'iso-blue' };
    mockViewer.addIsosurface.mockReturnValueOnce(isoHandle);
    const map = createMap({ name: 'density', data: 'map data', format: 'ccp4' });

    const iso = createIsosurface({ name: 'mesh', mapName: 'density', level: 1 });

    expect(iso).toMatchObject({
      name: 'mesh',
      color: '#0000FF',
      handle: isoHandle,
    });
    expect(mockViewer.addIsosurface).toHaveBeenCalledWith(map.volumeData, expect.objectContaining({
      color: '#0000FF',
    }));
  });

  it('uses the parent map suggested contour level when no isosurface level is provided', () => {
    const isoHandle = { id: 'iso-suggested' };
    mockViewer.addIsosurface.mockReturnValueOnce(isoHandle);

    const map = createMap({ name: 'density', data: 'map data', format: 'mrc' });
    map.contourStats = {
      ...map.contourStats,
      mean: 0.25,
      stdDev: 0.1,
      suggestedLevel: 0.35,
    };

    const iso = createIsosurface({ name: 'mesh', mapName: 'density' });

    expect(iso).toMatchObject({
      name: 'mesh',
      mapName: 'density',
      level: 0.35,
      handle: isoHandle,
    });
    expect(mockViewer.addIsosurface).toHaveBeenCalledWith(map.volumeData, expect.objectContaining({
      isoval: 0.35,
    }));
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
    const map = createMap({
      name: 'density',
      data: 'map data',
      format: 'ccp4',
      showBoundingBox: true,
    });
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
    createMap({
      name: 'density',
      data: 'map data',
      format: 'ccp4',
      showBoundingBox: true,
    });
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
    createMap({
      name: 'density',
      data: 'map data',
      format: 'ccp4',
      showBoundingBox: true,
    });
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
