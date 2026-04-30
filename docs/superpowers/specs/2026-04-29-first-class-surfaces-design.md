# Design: First-Class Surface Entries

## Goal

Add real 3Dmol.js molecular surfaces as first-class GUI entries. Surfaces should
be managed like durable sidebar entries, not as molecule style toggles. They can
be children of a parent molecule when ownership is clear, or top-level entries
when a surface spans multiple molecules.

This replaces the previous non-functional "Surface" show/hide representation
affordance that only attempted to use `addStyle({ surface: {} })`.

## Current Context

The application already has:

- A sidebar tree with `object`, `selection`, and `group` nodes.
- Object nodes that can own child nodes through the hierarchy support.
- Shared state in `src/state.js`.
- Sidebar callback routing in `src/ui/sidebar.js` and `src/main.js`.
- Command registration through `src/commands`.

The implementation should extend these existing boundaries rather than treating
surfaces as pseudo-molecules.

## 3Dmol.js Surface API Assumptions

Use the actual 3Dmol.js surface API:

- `viewer.addSurface(type, style, atomsel, allsel, focus, callback)` creates a
  surface and returns a promise that resolves to a surface id. It supports
  surface types `VDW`, `MS`, `SAS`, and `SES`.
- `viewer.removeSurface(surfid)` removes a surface by id.
- `viewer.setSurfaceMaterialStyle(surfid, style)` updates an existing surface
  material and requires a render.
- `SurfaceStyleSpec` documents fixed `color`, `colorscheme`, `onesided`,
  `opacity`, and volumetric color fields.

Wireframe mode is a required UX, but the published `SurfaceStyleSpec`
documentation does not list a `wireframe` field. The implementation must verify
against the runtime 3Dmol.js build that a real surface-material wireframe mode is
supported. It must not fake wireframe with atom line/stick representations unless
the design is revisited.

References:

- https://3dmol.org/doc/GLViewer.html#addSurface
- https://3dmol.org/doc/GLViewer.html#removeSurface
- https://3dmol.org/doc/GLViewer.html#setSurfaceMaterialStyle
- https://3dmol.org/doc/SurfaceStyleSpec.html

## Data Model

Add a first-class `state.surfaces` map keyed by surface name. Each entry stores:

```js
{
  name,
  parentName: string | null,
  selection: object,
  type: 'molecular' | 'sasa',
  surfaceType: 'MS' | 'SAS',
  handle: number | null,
  pending: boolean,
  visible: true,
  parentVisible: true,
  mode: 'surface' | 'wireframe',
  opacity: 0.75,
  color: '#FFFFFF'
}
```

The sidebar `entryTree` gains surface nodes:

```js
{ type: 'surface', name }
```

Tree placement rules:

- If a surface selection resolves to exactly one molecule, nest the surface node
  under that molecule.
- If a surface selection spans multiple molecules, place the surface node at the
  top level.
- Top-level surfaces are valid and intentionally support cross-molecule surfaces.
- Action-menu-created surfaces are always children of the molecule that created
  them.

Lifecycle rules:

- Command-created surfaces replace any existing surface with the same name.
- Action-menu-created surfaces use the lowest available generated name:
  `surface_1`, `surface_2`, and so on.
- Deleting a molecule deletes its child surfaces and removes their 3Dmol handles.
- Hiding a parent molecule effectively hides its child surfaces; showing the
  parent restores each child surface according to that surface's own `visible`
  flag.
- Top-level surfaces are independent of molecule visibility except that their
  atoms may be hidden if all source molecules are hidden.

## Surface Creation

Add a terminal command:

```text
surface <parent> [, <type>]
surface <name>, <selection> [, <type>]
```

Accepted type values:

| User type | 3Dmol type |
| --- | --- |
| `molecular` | `MS` |
| `sasa` | `SAS` |

The type argument is optional and defaults to `molecular`.

Examples:

```text
surface 1UBQ
surface 1UBQ, sasa
surface ligand_surface, ligand
surface ligand_surface, ligand, sasa
```

Command behavior:

- The one-argument form treats the argument as an existing molecule entry and
  creates or replaces a whole-molecule surface named `<parent>_surface`.
- The named form resolves the selection, creates or replaces a surface named
  `<name>`, and nests it if the selection belongs to exactly one molecule.
- If the selection spans multiple molecules, the named surface is top-level.
- Empty selections are errors and do not create a sidebar entry.
- Unknown type values are errors.

Molecule Action menu gains:

```text
Create Surface >
  Solvent Accessible
  Molecular
```

These actions create whole-molecule surfaces with generated unique names and do
not replace existing surfaces.

## Sidebar UI

Surface rows render as their own row type. They use the same status-dot and name
layout as molecules and selections, but expose only:

```text
A  S  C
```

Clicking the non-button side of a surface row toggles that surface's own
visibility. If the parent molecule is hidden, the row should render as
effectively hidden or dimmed even if the surface's own `visible` flag remains
true.

### Surface Action Menu

The `A` button opens:

```text
Rename...
Delete
---
Center
Zoom
```

Actions:

- `Rename...` renames the state entry and tree node. It rejects duplicate surface
  names.
- `Delete` removes the surface state entry, tree node, and 3Dmol surface handle.
- `Center` and `Zoom` operate on the surface's stored atom selection.

### Surface Menu

The `S` button opens:

```text
Surface
Wireframe
---
Opacity
  25%
  50%
  75%
  100%
```

Only one of `Surface` or `Wireframe` is checked. Only one opacity value is
checked. The default opacity is `75%`.

Changing mode or opacity preserves color and all other surface settings.

### Surface Color Menu

The `C` button opens a Color menu with only:

```text
Solid >
  swatches
```

Changing color preserves opacity and mode.

## Architecture Boundary

Add a small surface service instead of spreading 3Dmol surface calls through UI
code. The public operations should be shaped like:

```js
createSurface({ name, selection, type, parentName, color, opacity, mode })
removeSurface(name)
renameSurface(oldName, newName)
setSurfaceVisibility(name, visible)
setSurfaceMode(name, mode)
setSurfaceOpacity(name, opacity)
setSurfaceColor(name, color)
```

Responsibilities:

- State APIs own metadata, names, replacement, generated names, and tree
  placement.
- The surface service owns 3Dmol handle lifecycle and material updates.
- Sidebar and commands call through main callbacks or command context, not
  directly into 3Dmol.

3Dmol surface creation is async. A new surface should be inserted as pending,
then finalized when the `addSurface` promise resolves. If settings change while
pending, the service applies the current state after the handle exists. If
creation fails, remove the pending entry and print an error.

## Error Handling

Surface operations should fail narrowly and visibly:

- Missing parent molecule: terminal error, no state change.
- Empty selection: terminal error, no state change.
- Unknown type: terminal error, no state change.
- Duplicate rename target: dialog or terminal error, no state change.
- Async creation failure: remove pending entry, remove any partial handle if one
  exists, notify state, and print an error.
- Material update before handle resolution: preserve the state change and apply it
  once the handle resolves.

## Testing Plan

State tests:

- `state.surfaces` lifecycle.
- Add, replace, remove, and rename surface entries.
- Nesting under one parent.
- Top-level cross-molecule surfaces.
- Generated `surface_#` naming.
- Molecule deletion pruning child surfaces.

Surface service tests:

- `addSurface` receives the correct 3Dmol type and style.
- `removeSurface` is called with the stored surface id.
- `setSurfaceMaterialStyle` receives preserved color, opacity, and mode state.
- Async success and failure paths.
- Pending setting changes are applied after resolution.

Sidebar tests:

- Surface rows render as `surface` entries.
- Surface rows expose only `A`, `S`, and `C`.
- Surface Action menu includes `Rename...`, `Delete`, `Center`, and `Zoom`.
- Surface menu shows mode and opacity checkmarks.
- Color menu exposes only solid swatches.
- Row toggle affects only the surface's own visibility.
- Parent-hidden state dims or effectively hides child surfaces.

Command and main integration tests:

- `surface` command parses both syntaxes.
- Default type is `molecular`.
- `sasa` maps to `SAS`; `molecular` maps to `MS`.
- Command-created surfaces replace by name.
- Action-menu-created surfaces generate unique names.
- Parent molecule hide/show affects child surface effective visibility.
- Terminal messages are clear for success and error cases.

Verification:

- Run `npm run verify`.
- Do a browser/runtime check with real 3Dmol.js before claiming wireframe support,
  because the documented surface style fields do not explicitly include
  `wireframe`.

## Out of Scope

- Element, chain, secondary-structure, B-factor, or volumetric coloring for
  surfaces.
- Surface duplication.
- Group-level surface creation.
- Context-menu surface creation from active selection.
- Persisting surfaces across exported initialization configs.
- Faking wireframe through atom-style line or stick representations.
