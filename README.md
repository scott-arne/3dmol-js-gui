# 3Dmol.js GUI

A graphical interface for [3Dmol.js](https://3dmol.csb.pitt.edu/), providing an interactive molecular viewer with a command terminal, sidebar object manager, and an expressive selection language. Designed for structural biologists and computational chemists who want a desktop-style workflow in the browser.

## Features

- **Interactive Viewer** — Click atoms to select, right-click for context menus
- **Command Terminal** — 30 commands with tab-completion and command history
- **Selection Language** — Expressive atom selection with boolean operators, property selectors, and macro syntax
- **Sidebar** — Manage objects and named selections with visibility toggles, renaming, and per-object labels
- **Representations** — Cartoon, stick, line, sphere, surface, cross, ribbon
- **Coloring** — 60+ named colors, custom color definitions, and schemes (element, chain, secondary structure, B-factor spectrum)
- **Presets** — Quick-apply view styles: Simple, Sites, Ball-and-Stick
- **Themes** — Dark and light themes with persistent preference
- **Export** — Save views as PNG images

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install and Run

```bash
npm install
npm run dev
```

This opens a development server at `localhost:5173` with hot module replacement.

### Load a Structure

From the command terminal, fetch a structure from the RCSB PDB:

```
fetch 1ubq
```

Or use **File > Load...** to open a local structure file.

## Building

| Task | Command | Notes |
|------|---------|-------|
| Development | `npm run dev` | Starts Vite dev server with HMR |
| Production | `npm run build` | Outputs to `dist/`; PEG grammar compiled at build time |
| Preview | `npm run preview` | Serves the production build locally |
| Tests | `npm test` | Runs the test suite once |
| Test (watch) | `npm run test:watch` | Reruns tests on file changes |

## Commands

| Command | Usage | Description |
|---------|-------|-------------|
| fetch | `fetch <pdb_id>` | Fetch a structure from RCSB PDB |
| load | `load` | Open file picker for local structure files |
| select | `select <name>, <expression>` | Define a named selection |
| count_atoms | `count_atoms [selection]` | Count atoms matching a selection |
| get_model | `get_model [selection]` | Print summary info about a selection |
| show | `show <rep> [, selection]` | Show a representation |
| hide | `hide <rep> [, selection]` | Hide a representation |
| enable | `enable <object>` | Show a hidden object |
| disable | `disable <object>` | Hide an object without removing it |
| color | `color <color\|scheme> [, sel]` | Color atoms by name, hex, or scheme |
| set_color | `set_color <name>, <hex>` | Define a custom named color |
| bg_color | `bg_color <color>` | Set viewer background color |
| set | `set <setting>, <value>` | Change a viewer setting |
| cartoon_style | `cartoon_style <style> [, entry]` | Set cartoon rendering style |
| bfactor_spectrum | `bfactor_spectrum <min>, <max>` | Set B-factor coloring range |
| preset | `preset <style> [, selection]` | Apply a view preset |
| label | `label <selection>, <property>` | Add atom labels |
| unlabel | `unlabel` | Remove all labels |
| zoom | `zoom [selection]` | Zoom to fit a selection |
| center | `center [selection]` | Center the view on a selection |
| orient | `orient [selection]` | Orient view to fit a selection |
| rotate | `rotate <axis>, <angle>` | Rotate the view |
| translate | `translate <x>, <y>` | Translate the view |
| clip | `clip <near>, <far>` | Set clipping planes |
| reset | `reset` | Reset the view |
| remove | `remove <selection>` | Remove atoms from the viewer |
| delete | `delete <name>` | Delete an object or selection |
| set_name | `set_name <old>, <new>` | Rename an object or selection |
| png | `png [filename]` | Export the view as PNG |
| help | `help [command]` | Show help for a command |

## Selection Language

Selections can be typed in the command terminal or used as arguments to commands like `show`, `hide`, `color`, and `select`.

### Keywords

| Keyword | Description |
|---------|-------------|
| `all` | All atoms |
| `none` | No atoms |
| `protein` | Protein atoms |
| `ligand` | Ligand atoms |
| `water` / `solvent` | Water molecules |
| `organic` | Organic molecules |
| `backbone` / `bb` | Backbone atoms |
| `sidechain` / `sc` | Side chain atoms |
| `metal` / `metals` | Metal atoms |
| `helix` | Alpha helices |
| `sheet` | Beta sheets |
| `turn` | Turn regions |
| `loop` | Loop regions |
| `hydrogen` / `h.` | Hydrogen atoms |
| `heavy` | Non-hydrogen atoms |

### Property Selectors

| Selector | Example | Description |
|----------|---------|-------------|
| `name` | `name CA` | Atom name |
| `resn` | `resn ALA+GLY` | Residue name (`+` for OR) |
| `resi` | `resi 10-20` | Residue index (ranges, `>`, `<`) |
| `chain` | `chain A` | Chain identifier |
| `elem` | `elem C` | Element symbol |
| `index` | `index 1-100` | Atom index |

### Operators

| Operator | Example | Description |
|----------|---------|-------------|
| `and` | `protein and chain A` | Intersection |
| `or` | `helix or sheet` | Union |
| `not` | `not water` | Negation |
| `xor` | `chain A xor chain B` | Exclusive OR |
| `around <r>` | `ligand around 5` | Atoms within radius (angstroms) |
| `beyond <r>` | `ligand beyond 10` | Atoms beyond radius (angstroms) |
| `byres` | `byres ligand around 5` | Expand to full residues |
| `bychain` | `bychain resi 50` | Expand to full chains |

### Macro Syntax

Use the slash-separated macro format for quick selections:

```
//chain/resi/name
```

Examples:

- `//A/10/CA` — atom CA in residue 10 of chain A
- `//A/10` — all atoms in residue 10 of chain A
- `//A` — all atoms in chain A

### Combining Expressions

```
select active_site, byres ligand around 5 and protein
show sticks, active_site
color green, active_site
label active_site, resn
```

## Project Structure

```
├── index.html              Entry point (loads 3Dmol.js from CDN)
├── package.json            Project metadata and scripts
├── vite.config.js          Vite build config with Peggy plugin
├── src/
│   ├── main.js             Application bootstrap and wiring
│   ├── viewer.js           3Dmol.js wrapper (init, load, select, highlight)
│   ├── state.js            Observable application state store
│   ├── presets.js           View preset definitions
│   ├── commands/
│   │   ├── registry.js     Command parsing and registry
│   │   ├── resolve-selection.js  Selection string resolution
│   │   ├── camera.js       Camera/view commands
│   │   ├── display.js      Show/hide/enable/disable commands
│   │   ├── editing.js      Remove/delete/rename commands
│   │   ├── export.js       PNG export and help commands
│   │   ├── labeling.js     Label/unlabel commands
│   │   ├── loading.js      Fetch/load commands
│   │   ├── preset.js       Preset command
│   │   ├── selection.js    Select/count_atoms/get_model commands
│   │   └── styling.js      Color/set/bg_color/cartoon_style commands
│   ├── parser/
│   │   ├── selection.pegjs          PEG grammar for selection language
│   │   └── evaluator.js    AST evaluator for parsed selections
│   └── ui/
│       ├── styles.css      All CSS (dark + light themes)
│       ├── menubar.js      Menu bar with File/View/Select/Window menus
│       ├── sidebar.js      Object and selection manager panel
│       ├── terminal.js     Command terminal with history and completion
│       ├── context-menu.js Right-click context menu
│       ├── color-swatches.js Color picker palette and B-factor scheme
│       └── dialogs.js      Modal dialogs (load file, quickstart)
└── tests/
    ├── parser.test.js      Selection language parser tests
    ├── evaluator.test.js   AST evaluator tests
    └── commands.test.js    Command handler tests
```

## Hosting and Distribution

### npm

1. Update the `repository` URLs in `package.json` to point to your repository.
2. Authenticate with npm:
   ```bash
   npm login
   ```
3. Build and verify the package contents:
   ```bash
   npm run build
   npm pack --dry-run
   ```
4. Publish:
   ```bash
   npm publish
   ```
5. Users install with:
   ```bash
   npm install 3dmol-js-gui
   ```

### Static Hosting

The production build outputs a self-contained `dist/` folder that can be deployed to any static hosting provider:

- **GitHub Pages** — Push `dist/` to a `gh-pages` branch or use GitHub Actions to build and deploy automatically.
- **Netlify / Vercel** — Connect the repository, set the build command to `npm run build`, and the publish directory to `dist`.
- **Any web server** — Copy the contents of `dist/` to the document root.

> **Note:** 3Dmol.js is loaded from CDN at runtime. No additional server-side dependencies are required.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
