# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-16

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
