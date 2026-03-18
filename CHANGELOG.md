# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-17

### Added

- Entry tree system with groups, hierarchies, and dot-notation selection
  - `group` / `ungroup` commands for organizing entries into collapsible groups
  - `reparent` / `unparent` commands for creating parent-child hierarchies
  - Dot-notation tab completion for hierarchy members (e.g. `5fqd-1.CC-885`)
- `entry` selection keyword to scope selections by loaded object or group name
- `visible` / `enabled` selection keyword to filter by visibility state
- `capping` / `caps` selection keyword for terminal capping groups (ACE, NME)
- `by_entry` flag for `show` and `hide` commands to evaluate selections independently per entry
- Per-entry preset evaluation — presets now apply independently to each loaded entry
- `sele` command for quick unnamed selections
- `get_view` / `set_view` commands for saving and restoring camera positions
- PCA-based `orient` command for automatic view alignment
- `__C3D_INIT__` payload system for embedded initialization (molecules, operations, view, theme, UI)
- Auto theme detection resolving `"auto"` to dark/light based on VSCode parent iframe or OS `prefers-color-scheme`
- Draggable sidebar resize handle (160px–600px range)
- Split-zone sidebar interactions for groups and hierarchy parents: left zone collapses/expands, right zone toggles visibility
- "Enable All" / "Disable All" in group action menu
- Multi-molecule SDF splitting in demo (individual named children)
- Demo assets: 5hxb-receptor.pdb, CC-885_docked.sdf with 5 docked poses as hierarchy children
- Test suite expansion: 928 tests across 18 files

### Changed

- Default sidebar width increased from 240px to 300px (CSS variable `--sidebar-width`)
- Default theme changed from `"light"` to `"auto"` (resolves at render time)
- Clicking hidden/invisible atoms no longer triggers selection
- Group and hierarchy row heights match regular object rows
- Sidebar group name click area expanded — full left zone triggers collapse instead of tiny toggle icon

### Fixed

- Per-atom colors being lost during hide operations
- Context menu appearing during right-click zoom
- Sites preset applying near-residue indices globally instead of per-model
- `stick` style rendering issues with PCA orient
- CSS class-based menubar hiding instead of inline style
- Line representation default in tests

## [0.1.1] - 2026-02-16

### Added

- `polar_hydrogen` / `polarh` selection keyword for hydrogen atoms bonded to N, O, or S
- `nonpolar_hydrogen` / `apolarh` selection keyword for hydrogen atoms bonded to C
- Fetch concurrency guard preventing overlapping PDB fetches
- CIF/mmCIF format support in the file load dialog
- Collision detection for `renameObject` and `renameSelection` (throws on duplicate names)
- Modal rename dialog replacing the browser `prompt()` for object and selection renaming
- Quickstart dialog extracted to a reusable component in `dialogs.js`
- Shared action functions module (`actions.js`) consolidating color, label, show, hide, and view logic
- Two-tier atom highlight system: sphere shapes for small selections (<500 atoms), `addStyle` for larger ones
- ResizeObserver debouncing with `requestAnimationFrame` to prevent layout thrash
- Terminal output pruning at 1000 lines to limit memory usage
- Incremental DOM diffing in sidebar refresh (replaces full innerHTML rebuild)
- Meta description and SVG favicon in `index.html`
- CDN comment in `index.html` with self-hosting instructions
- Test suite expansion: 166 tests across 7 files (previously 115 across 4 files)
  - `tests/state.test.js` -- 29 tests covering all state management functions
  - `tests/actions.test.js` -- 10 tests for `parseColorScheme` and `formatColorDisplay`
  - `tests/ui/terminal.test.js` -- 5 tests for terminal print, clear, pruning, and input
  - `tests/integration.test.js` -- 5 tests for command registry lifecycle
  - `tests/helpers/mock-3dmol.js` -- reusable 3Dmol.js viewer mock
- `happy-dom` dev dependency for DOM-based test environment

### Changed

- `main.js` reduced by approximately 37% through extraction of duplicated color, label, show/hide, and view logic into `actions.js`
- `stick_radius` and `sphere_scale` commands now correctly rebuild all representations per-object instead of only re-applying the modified representation
- `resolve-selection.js` uses atom `index` instead of `serial` for correct atom targeting
- Vite `base` set to `'./'` for portable static hosting (no absolute path assumptions)
- Export dialog gracefully handles missing canvas with an error message instead of failing silently
- Sidebar uses `data-kind` and `data-name` attributes for incremental DOM updates
- `line`/`stick` visual interaction guard applied consistently in both `applyHide` and `applyHideSelection`

### Fixed

- `stick_radius` and `sphere_scale` settings losing other active representations when applied
- `cartoon_style` rebuild loop not respecting the line/stick interaction guard
- Rename operations allowing duplicate names and causing silent state corruption
- Export failing without feedback when the viewer canvas was unavailable
- Selection resolution using `serial` (which may be absent or non-unique) instead of `index`

## [0.1.0] - 2025-02-13

### Added

- Interactive 3Dmol.js viewer with click-to-select atoms
- Expressive selection language with boolean operators, property selectors, and macro syntax
- 30 terminal commands: fetch, load, select, show, hide, color, label, zoom, preset, and more
- Sidebar with object and selection management (visibility toggle, rename, delete, labels)
- Right-click context menu with show/hide/color/label submenus
- 7 representations: cartoon, stick, line, sphere, surface, cross, ribbon
- 60+ named colors including extended and pastel palettes
- Color schemes: element, chain, secondary structure, B-factor spectrum
- 3 view presets: Simple, Sites, Ball-and-Stick
- Dark and light themes with localStorage persistence
- Compact (hamburger) menu mode
- PNG export
- PDB fetching from RCSB
- Local file loading (PDB, SDF, MOL2, XYZ, CIF)
