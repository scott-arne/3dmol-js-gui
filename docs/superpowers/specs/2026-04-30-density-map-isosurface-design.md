# Density Map And Isosurface Design

**Date:** 2026-04-30
**Repository:** 3dmol-js-gui
**Branch:** feat/density
**Status:** Approved design, pending spec review

## Goal

Add first-class density map support to the GUI while preserving the existing
static-first browser architecture. Density maps should load through the same
user-facing load paths as molecules, appear as sidebar entries with their own
glyph, display a real 3D bounding box when visible, and support child
isosurface mesh entries created from map data.

The first implementation should support the density fixture formats currently
being added under `tests/assets`: CCP4-style maps (`.ccp4`, `.map`, `.mrc`) and
Gaussian cube files (`.cube`). Cube files are hybrid inputs and should create
both a molecule entry and a map entry.

## External 3Dmol.js Behavior

The design relies on existing 3Dmol.js volume APIs:

- `$3Dmol.VolumeData(data, format)` parses volumetric data, including `cube`
  and binary `ccp4` formats.
- `GLViewer.addIsosurface(volumeData, spec)` creates a shape from a
  `VolumeData` object and accepts `IsoSurfaceSpec` fields such as `isoval`,
  `wireframe`, `opacity`, `color`, `selection`, and `seldist`.

References:

- <https://3dmol.csb.pitt.edu/doc/VolumeData.html>
- <https://3dmol.csb.pitt.edu/doc/GLViewer.html#addIsosurface>
- <https://3dmol.csb.pitt.edu/doc/IsoSurfaceSpec.html>

## Non-Goals

This phase does not include:

- General multi-state support. The PyMOL-style `state` argument is omitted from
  the `isosurface` command.
- Full volumetric rendering.
- Map arithmetic, normalization controls, or sigma recalculation UI.
- Advanced isosurface editing beyond contour level, representation, opacity,
  color, rename, delete, center, and zoom.
- A separate map-loading command. The existing single load path remains the
  user-facing entry point.

## State Model

Add two new first-class state maps:

```js
state.maps = new Map();
state.isosurfaces = new Map();
```

Map entries should include:

```js
{
  name,
  format,              // "ccp4" or "cube"
  sourceFormat,        // original extension such as "map" or "mrc"
  volumeData,          // $3Dmol.VolumeData
  bounds,              // computed viewer-space bounds/corners
  handles: [],         // one or more bounding-box shape handles
  visible: true,
  color: "#38BDF8",
  opacity: 1.0
}
```

Isosurface entries should include:

```js
{
  name,
  mapName,
  level: 1.0,
  selectionText: null,
  selection: null,
  buffer: null,
  carve: null,
  representation: "mesh",
  handle,              // isosurface shape handle
  visible: true,
  parentVisible: true,
  color: "#FFFFFF",
  opacity: 0.75
}
```

`entryTree` gains two node types:

```js
{ type: "map", name, collapsed, children: [...] }
{ type: "isosurface", name }
```

Maps can be top-level entries. Isosurfaces created from maps are always children
of their parent map. Deleting a map removes its child isosurfaces from state and
from the viewer, matching the current molecule-to-surface cleanup behavior.

Explicit command-created isosurfaces replace existing isosurfaces with the same
name. Action-menu-created isosurfaces use global generated names:

```text
isosurface_1
isosurface_2
...
```

## Loading Behavior

The existing single load pipeline should classify files by format:

- structure-only: `.pdb`, `.sdf`, `.mol2`, `.xyz`, `.pqr`, `.gro`, `.cif`,
  `.mmcif`
- map-only: `.ccp4`, `.map`, `.mrc`
- hybrid: `.cube`

Map-only files create one map entry. Map names should be uniquified with the
same suffix pattern used for molecule objects when a requested name collides.
Cube files create:

- a molecule entry named from the filename stem, using existing molecule load
  behavior
- a map entry named `<actual_molecule_name>_map`, where
  `<actual_molecule_name>` is the final unique molecule name returned by the
  object loader

Binary map formats are read as `ArrayBuffer`; text formats continue to use text
loading. Format normalization should pass CCP4-compatible data to 3Dmol as
`ccp4`, including `.map` and `.mrc`. If fixture tests reveal that the current
3Dmol build cannot parse MRC data through the CCP4 path, the implementation
should add the needed compatibility shim while keeping `.mrc` as a supported
user-facing map extension.

Remote and URL loading should use the same classification path as local file
loading, so `load_url <name>, ccp4, <url>` and configured remote sources can
produce map entries without a separate API.

## Viewer Services

Add a `maps.js` service boundary, analogous to `surfaces.js`, for map and
isosurface viewer handles.

Map service responsibilities:

- parse volume data through `$3Dmol.VolumeData`
- compute viewer-space bounds from volume metadata
- create, update, and remove the bounding-box shape
- update bounding-box visibility, color, and opacity
- remove child isosurfaces when deleting a map

Isosurface service responsibilities:

- create and replace isosurface entries from map `VolumeData`
- call `viewer.addIsosurface(volumeData, spec)`
- remove old shape handles before replacing or recontouring
- update visibility, representation, opacity, color, and contour level
- preserve state metadata even when the viewer shape is recreated

Map bounding boxes must be real viewer objects. Prefer `viewer.addBox` if it can
accurately express the parsed map bounds. If the shape API is insufficient for
the required bounds, draw the 12 box edges with lightweight line or cylinder
shapes through the viewer's shape APIs and store all resulting handles on the
map entry.

Isosurfaces default to mesh:

```js
{
  isoval: 1.0,
  wireframe: true,
  color: "#FFFFFF",
  opacity: 0.75
}
```

Representation mapping:

- `mesh` -> `wireframe: true`
- `surface` -> `wireframe: false`

## Command Design

Add the command:

```text
isosurface name, map, level [,(selection) [,buffer [,carve [,representation]]]]
```

Field behavior:

- `name`: required isosurface name.
- `map`: required existing map entry name.
- `level`: optional float contour level; default `1.0`.
- `selection`: optional atom selection expression resolved against loaded
  molecular atoms.
- `buffer`: optional float distance around the selection, mapped to 3Dmol
  `seldist`.
- `carve`: optional float retained in metadata. 3Dmol's documented
  `IsoSurfaceSpec` does not expose a PyMOL-style carve field, so the first
  implementation will not promise carve clipping unless runtime testing
  identifies a supported 3Dmol property. Selection plus `buffer` is the
  supported region-control path for this phase.
- `representation`: optional `mesh` or `surface`; default `mesh`.

Parsing rules:

- Use quote-aware comma splitting.
- Selection expressions that contain commas must be quoted.
- Unquoted commas delimit command arguments.
- Invalid quote syntax reports command usage.

Examples:

```text
isosurface iso1, 1d26_2fofc, 1.0
isosurface ligand_density, 1d26_2fofc, 2.0, resn LIG, 3
isosurface pocket_density, 1d26_2fofc, 1.5, "chain A, resn LIG", 3, 2, mesh
```

## Sidebar And Menus

Map rows:

- distinct map glyph
- top-level by default
- buttons: `A`, `S`, `C`
- row click toggles bounding-box visibility
- `A` menu: `Create Isosurface`, `Rename`, `Delete`, `Center`, `Zoom`
- `S` menu: `Opacity > 25%, 50%, 75%, 100%`
- `C` menu: solid swatches for bounding-box color

`Create Isosurface` immediately creates a child isosurface with:

```js
{
  name: getNextIsosurfaceName(),
  mapName,
  level: 1.0,
  selection: null,
  representation: "mesh"
}
```

Isosurface rows:

- distinct isosurface glyph
- children of their parent map
- buttons: `A`, `S`, `C`
- row click toggles isosurface visibility
- `A` menu: `Contour > -10, -5, -4, -3, -2, -1, +1, +2, +3, +4, +5, +10`,
  plus `Rename`, `Delete`, `Center`, `Zoom`
- `S` menu: `Mesh`, `Surface`, and `Opacity > 25%, 50%, 75%, 100%`
- `C` menu: solid swatches only

Top-level maps render with object and surface entries before the selections
separator. Child isosurfaces render nested under their map and do not appear as
separate top-level rows.

Choosing a contour value updates the isosurface level and recreates the viewer
shape in place without changing the entry name or parent map.

## Error Handling

Use explicit user-facing errors:

- unsupported map formats fail during request normalization
- missing map names in `isosurface` produce `Map "<name>" not found`
- invalid level, buffer, or carve values produce field-specific errors
- invalid representations produce `Unknown isosurface representation`
- malformed quote/comma syntax reports command usage
- failed `VolumeData` parsing removes partial map state and viewer handles
- failed isosurface creation removes only the partial isosurface entry

Command and loader failures should follow the existing structured loader result
pattern where possible.

## Testing Plan

Add coverage at the same levels as molecule surfaces:

- State tests for maps, isosurfaces, tree nesting, replacement, rename, delete
  cleanup, parent visibility, and generated names.
- Loader tests for `.ccp4`, `.map`, `.mrc`, and `.cube` classification,
  including hybrid cube behavior.
- Service tests with mocked 3Dmol APIs for `VolumeData`, bounding-box shapes,
  `addIsosurface`, shape deletion, recontour, visibility, color, and opacity.
- Command tests for quote-aware parsing and `isosurface` creation/replacement.
- Sidebar tests for map and isosurface glyphs, menus, callbacks, and row-toggle
  behavior.
- Static smoke tests for the new entry types in the browser fixture.
- Full verification with `npm run verify`.

Real files in `tests/assets` should be used where the cost is reasonable.
Expensive mesh generation should remain mocked unless real fixture coverage is
needed to catch integration bugs in `VolumeData` parsing.

## Implementation Notes

The implementation should be incremental:

1. Add state primitives and tests.
2. Add volume loading classification and binary/text file handling.
3. Add map service and bounding-box rendering.
4. Add isosurface service and command parsing.
5. Add sidebar rows, glyphs, menus, and callbacks.
6. Wire main app behavior and update documentation.
7. Run focused tests and then `npm run verify`.

Keep the existing surface service intact. Isosurface service code may share small
helpers with surfaces where it reduces duplication, but map-derived isosurfaces
remain a distinct entry type because their future actions, especially
recontour, are different from molecule surfaces.
