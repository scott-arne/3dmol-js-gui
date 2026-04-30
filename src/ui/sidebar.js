/**
 * Sidebar component for the 3Dmol.js GUI.
 *
 * Renders an object list with status indicators and popup menus
 * for controlling visibility, representation, labeling, and coloring of
 * molecular objects. Supports groups (collapsible containers) and
 * hierarchical parent-child relationships between objects.
 */

import { CARBON_SWATCHES, SOLID_SWATCHES, CHAIN_PALETTES, SS_PALETTES } from './color-swatches.js';

/** @type {HTMLElement|null} */
let activePopup = null;

/** @type {HTMLElement|null} */
let activePopupAnchor = null;

/** @type {function|null} */
let activePopupCleanup = null;

/** @type {Map<Array, HTMLElement>} Cache of popup menu DOM elements keyed by items array reference. */
const menuCache = new Map();

/** @type {function|null} Mutable callback reference used by cached menu listeners. */
let currentMenuOnClick = null;

/**
 * Close any currently open popup menu and remove its outside-click listener.
 */
function closeActivePopup() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
  activePopupAnchor = null;
  if (activePopupCleanup) {
    activePopupCleanup();
    activePopupCleanup = null;
  }
}

function menuHasDynamicItems(items) {
  return items.some((item) => {
    if (item.children) return true;
    return Object.prototype.hasOwnProperty.call(item, 'checked');
  });
}

function appendMenuItemLabel(menuItem, item) {
  if (item.checked) {
    const check = document.createElement('span');
    check.className = 'popup-menu-check';
    check.textContent = '\u2713';
    menuItem.appendChild(check);
  }

  const labelSpan = document.createElement('span');
  labelSpan.textContent = item.label;
  menuItem.appendChild(labelSpan);
}

function appendGenericMenuItems(parent, items, isSubmenu = false) {
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'popup-menu-separator';
      parent.appendChild(sep);
    } else if (item.children) {
      const menuItem = document.createElement('div');
      const itemClass = isSubmenu ? 'popup-menu-submenu-item' : 'popup-menu-item';
      menuItem.className = `${itemClass} popup-menu-has-submenu`;
      if (item.checked) {
        menuItem.classList.add('checked');
      }
      appendMenuItemLabel(menuItem, item);

      const arrow = document.createElement('span');
      arrow.className = 'popup-menu-arrow';
      arrow.textContent = '\u25B6';
      menuItem.appendChild(arrow);

      const submenu = document.createElement('div');
      submenu.className = 'popup-menu-submenu';
      appendGenericMenuItems(submenu, item.children, true);
      menuItem.appendChild(submenu);
      parent.appendChild(menuItem);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = isSubmenu ? 'popup-menu-submenu-item' : 'popup-menu-item';
      if (item.checked) {
        menuItem.classList.add('checked');
      }
      if (item.value !== undefined) {
        menuItem.dataset.value = item.value;
      }
      appendMenuItemLabel(menuItem, item);

      const plainValue = item.value;
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeActivePopup();
        currentMenuOnClick(plainValue);
      });
      parent.appendChild(menuItem);
    }
  }
}

/**
 * Create and display a popup menu anchored to a button element.
 *
 * The menu is positioned below the anchor by default. If there is not enough
 * viewport space below, it is placed above instead. Only one popup may be open
 * at a time; opening a new one closes the previous.
 *
 * @param {HTMLElement} anchor - The button element to anchor the menu to.
 * @param {Array<{label: string, value: string, checked?: boolean, children?: Array}|{separator: true}>} items
 *   Menu items.
 * @param {function} onClick - Callback invoked with the selected item's value.
 */
function createPopupMenu(anchor, items, onClick) {
  if (activePopupAnchor === anchor) {
    closeActivePopup();
    return;
  }
  closeActivePopup();

  // Update the mutable callback reference so cached listeners use the new onClick
  currentMenuOnClick = onClick;

  const canCache = !menuHasDynamicItems(items);
  let menu = canCache ? menuCache.get(items) : null;
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'popup-menu';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'popup-menu-separator';
        menu.appendChild(sep);
      } else if (item.submenu === 'element-swatches') {
        const menuItem = document.createElement('div');
        menuItem.className = 'popup-menu-item popup-menu-has-submenu';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        menuItem.appendChild(labelSpan);

        const arrow = document.createElement('span');
        arrow.className = 'popup-menu-arrow';
        arrow.textContent = '\u25B6';
        menuItem.appendChild(arrow);

        const submenu = document.createElement('div');
        submenu.className = 'popup-menu-submenu';

        // "Standard" option — plain Jmol with no carbon override
        const stdItem = document.createElement('div');
        stdItem.className = 'popup-menu-submenu-item';
        stdItem.textContent = 'Standard';
        const stdValue = item.value;
        stdItem.addEventListener('click', (e) => {
          e.stopPropagation();
          closeActivePopup();
          currentMenuOnClick(stdValue);
        });
        submenu.appendChild(stdItem);

        const sep = document.createElement('div');
        sep.className = 'popup-menu-separator';
        submenu.appendChild(sep);

        // Swatch grid
        const grid = document.createElement('div');
        grid.className = 'swatch-grid';
        for (const swatch of CARBON_SWATCHES) {
          const cell = document.createElement('div');
          cell.className = 'swatch-cell';
          cell.style.backgroundColor = swatch.hex;
          cell.title = `${swatch.label} (${swatch.hex})`;
          cell.dataset.color = swatch.hex;
          grid.appendChild(cell);
        }
        const itemValue = item.value;
        grid.addEventListener('click', (e) => {
          const color = e.target.dataset.color;
          if (color) {
            e.stopPropagation();
            closeActivePopup();
            currentMenuOnClick(itemValue + ':' + color);
          }
        });
        submenu.appendChild(grid);

        menuItem.appendChild(submenu);
        menu.appendChild(menuItem);
      } else if (item.submenu === 'solid-swatches') {
        const menuItem = document.createElement('div');
        menuItem.className = 'popup-menu-item popup-menu-has-submenu';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        menuItem.appendChild(labelSpan);

        const arrow = document.createElement('span');
        arrow.className = 'popup-menu-arrow';
        arrow.textContent = '\u25B6';
        menuItem.appendChild(arrow);

        const submenu = document.createElement('div');
        submenu.className = 'popup-menu-submenu';

        const grid = document.createElement('div');
        grid.className = 'swatch-grid';
        for (const swatch of SOLID_SWATCHES) {
          const cell = document.createElement('div');
          cell.className = 'swatch-cell';
          cell.style.backgroundColor = swatch.hex;
          cell.title = `${swatch.label} (${swatch.hex})`;
          cell.dataset.color = swatch.hex;
          grid.appendChild(cell);
        }
        grid.addEventListener('click', (e) => {
          const color = e.target.dataset.color;
          if (color) {
            e.stopPropagation();
            closeActivePopup();
            currentMenuOnClick(color);
          }
        });
        submenu.appendChild(grid);

        menuItem.appendChild(submenu);
        menu.appendChild(menuItem);
      } else if (item.submenu === 'chain-palettes') {
        const menuItem = document.createElement('div');
        menuItem.className = 'popup-menu-item popup-menu-has-submenu';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        menuItem.appendChild(labelSpan);

        const arrow = document.createElement('span');
        arrow.className = 'popup-menu-arrow';
        arrow.textContent = '\u25B6';
        menuItem.appendChild(arrow);

        const submenu = document.createElement('div');
        submenu.className = 'popup-menu-submenu';

        for (const [key, palette] of Object.entries(CHAIN_PALETTES)) {
          const palItem = document.createElement('div');
          palItem.className = 'popup-menu-submenu-item';
          palItem.textContent = palette.label;
          palItem.dataset.color = 'chain:' + key;
          submenu.appendChild(palItem);
        }
        submenu.addEventListener('click', (e) => {
          const target = e.target.closest('[data-color]');
          if (target) {
            e.stopPropagation();
            closeActivePopup();
            currentMenuOnClick(target.dataset.color);
          }
        });

        menuItem.appendChild(submenu);
        menu.appendChild(menuItem);
      } else if (item.submenu === 'ss-palettes') {
        const menuItem = document.createElement('div');
        menuItem.className = 'popup-menu-item popup-menu-has-submenu';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        menuItem.appendChild(labelSpan);

        const arrow = document.createElement('span');
        arrow.className = 'popup-menu-arrow';
        arrow.textContent = '\u25B6';
        menuItem.appendChild(arrow);

        const submenu = document.createElement('div');
        submenu.className = 'popup-menu-submenu';

        for (const pal of SS_PALETTES) {
          const palItem = document.createElement('div');
          palItem.className = 'popup-menu-submenu-item ss-palette-item';

          const h = document.createElement('span');
          h.textContent = 'Helix';
          h.style.color = pal.helix;
          palItem.appendChild(h);
          palItem.appendChild(document.createTextNode(' \u2013 '));
          const s = document.createElement('span');
          s.textContent = 'Sheet';
          s.style.color = pal.sheet;
          palItem.appendChild(s);
          palItem.appendChild(document.createTextNode(' \u2013 '));
          const l = document.createElement('span');
          l.textContent = 'Loop';
          l.style.color = pal.loop;
          palItem.appendChild(l);

          palItem.dataset.color = 'ss:' + pal.key;
          submenu.appendChild(palItem);
        }
        submenu.addEventListener('click', (e) => {
          const target = e.target.closest('[data-color]');
          if (target) {
            e.stopPropagation();
            closeActivePopup();
            currentMenuOnClick(target.dataset.color);
          }
        });

        menuItem.appendChild(submenu);
        menu.appendChild(menuItem);
      } else if (item.children) {
        const menuItem = document.createElement('div');
        menuItem.className = 'popup-menu-item popup-menu-has-submenu';
        if (item.checked) {
          menuItem.classList.add('checked');
        }
        appendMenuItemLabel(menuItem, item);

        const arrow = document.createElement('span');
        arrow.className = 'popup-menu-arrow';
        arrow.textContent = '\u25B6';
        menuItem.appendChild(arrow);

        const submenu = document.createElement('div');
        submenu.className = 'popup-menu-submenu';
        appendGenericMenuItems(submenu, item.children, true);
        menuItem.appendChild(submenu);
        menu.appendChild(menuItem);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'popup-menu-item';
        if (item.checked) {
          menuItem.classList.add('checked');
        }
        if (item.value !== undefined) {
          menuItem.dataset.value = item.value;
        }
        appendMenuItemLabel(menuItem, item);
        const plainValue = item.value;
        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          closeActivePopup();
          currentMenuOnClick(plainValue);
        });
        menu.appendChild(menuItem);
      }
    }

    if (canCache) {
      menuCache.set(items, menu);
    }
  }

  // Clear stale submenu positioning from previous use
  for (const sub of menu.querySelectorAll('.popup-menu-submenu-left')) {
    sub.classList.remove('popup-menu-submenu-left');
  }

  // Append to body so absolute positioning works relative to viewport
  document.body.appendChild(menu);
  activePopup = menu;
  activePopupAnchor = anchor;

  // Position the popup relative to the anchor button
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const viewportHeight = window.innerHeight;

  let top;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  if (spaceBelow >= menuRect.height || spaceBelow >= anchorRect.top) {
    // Place below
    top = anchorRect.bottom;
  } else {
    // Place above
    top = anchorRect.top - menuRect.height;
  }

  menu.style.position = 'absolute';
  menu.style.top = `${top + window.scrollY}px`;

  let left = anchorRect.left + window.scrollX;
  if (left + menuRect.width > window.innerWidth) {
    left = anchorRect.right + window.scrollX - menuRect.width;
  }
  if (left < 0) left = 0;
  menu.style.left = `${left}px`;

  // Flip submenus to open leftward if the popup is near the right edge
  if (left + menuRect.width + 160 > window.innerWidth) {
    for (const sub of menu.querySelectorAll('.popup-menu-submenu')) {
      sub.classList.add('popup-menu-submenu-left');
    }
  }

  // Close when clicking outside
  function onDocumentClick(e) {
    if (!menu.contains(e.target) && e.target !== anchor) {
      closeActivePopup();
    }
  }

  // Defer attachment so the current click event does not immediately close the menu
  requestAnimationFrame(() => {
    document.addEventListener('click', onDocumentClick, true);
  });

  activePopupCleanup = () => {
    document.removeEventListener('click', onDocumentClick, true);
  };
}

/**
 * Menu definitions for the five sidebar buttons.
 *
 * Each key corresponds to a button label. `items` lists the menu entries and
 * `callbackKey` identifies which callback on the callbacks object to invoke.
 */
/**
 * Action menu items for selection objects (no Duplicate or Orient).
 */
const SELECTION_ACTION_MENU = [
  { label: 'Rename...', value: 'rename' },
  { label: 'Delete', value: 'delete' },
  { separator: true },
  { label: 'Center', value: 'center' },
  { label: 'Zoom', value: 'zoom' },
];

/**
 * Action menu items for surface objects.
 */
const SURFACE_ACTION_MENU = [
  { label: 'Rename...', value: 'rename' },
  { label: 'Delete', value: 'delete' },
  { separator: true },
  { label: 'Center', value: 'center' },
  { label: 'Zoom', value: 'zoom' },
];

/**
 * Color menu items for surface objects.
 */
const SURFACE_COLOR_MENU = [
  { label: 'Solid', value: 'solid', submenu: 'solid-swatches' },
];

/**
 * Action menu items for groups.
 */
const GROUP_ACTION_MENU = [
  { label: 'Enable All', value: 'enable_all' },
  { label: 'Disable All', value: 'disable_all' },
  { separator: true },
  { label: 'Rename...', value: 'rename' },
  { label: 'Delete', value: 'delete' },
  { label: 'Ungroup', value: 'ungroup' },
];

/**
 * Mapping from S/H/L/C button labels to selection-specific callback keys.
 */
const SELECTION_CALLBACK_MAP = {
  S: 'onSelectionShow',
  H: 'onSelectionHide',
  L: 'onSelectionLabel',
  C: 'onSelectionColor',
};

function buildSurfaceStyleMenu(surface = {}) {
  const mode = surface.mode || 'surface';
  const opacity = surface.opacity ?? 0.75;
  const isOpacity = (value) => Math.abs(opacity - value) < 0.001;

  return [
    { label: 'Surface', value: 'mode:surface', checked: mode === 'surface' },
    { label: 'Wireframe', value: 'mode:wireframe', checked: mode === 'wireframe' },
    { separator: true },
    {
      label: 'Opacity',
      children: [
        { label: '25%', value: 'opacity:0.25', checked: isOpacity(0.25) },
        { label: '50%', value: 'opacity:0.5', checked: isOpacity(0.5) },
        { label: '75%', value: 'opacity:0.75', checked: isOpacity(0.75) },
        { label: '100%', value: 'opacity:1', checked: isOpacity(1) },
      ],
    },
  ];
}

const BUTTON_MENUS = {
  A: {
    callbackKey: 'onAction',
    items: [
      { label: 'Rename...', value: 'rename' },
      { label: 'Delete', value: 'delete' },
      { separator: true },
      { label: 'Center', value: 'center' },
      { label: 'Orient', value: 'orient' },
      { label: 'Zoom', value: 'zoom' },
      { separator: true },
      {
        label: 'Create Surface',
        children: [
          { label: 'Solvent Accessible', value: 'surface:sasa' },
          { label: 'Molecular', value: 'surface:molecular' },
        ],
      },
    ],
  },
  S: {
    callbackKey: 'onShow',
    items: [
      { label: 'Cartoon', value: 'cartoon' },
      { label: 'Sticks', value: 'stick' },
      { label: 'Lines', value: 'line' },
      { label: 'Spheres', value: 'sphere' },
      { label: 'Cross', value: 'cross' },
      { separator: true },
      { label: 'Simple', value: 'view:simple' },
      { label: 'Sites', value: 'view:sites' },
      { label: 'Ball-and-Stick', value: 'view:ball-and-stick' },
    ],
  },
  H: {
    callbackKey: 'onHide',
    items: [
      { label: 'Everything', value: 'everything' },
      { separator: true },
      { label: 'Cartoon', value: 'cartoon' },
      { label: 'Sticks', value: 'stick' },
      { label: 'Lines', value: 'line' },
      { label: 'Spheres', value: 'sphere' },
      { label: 'Cross', value: 'cross' },
    ],
  },
  L: {
    callbackKey: 'onLabel',
    items: [
      { label: 'Atom Name', value: 'atom' },
      { label: 'Residue Name', value: 'resn' },
      { label: 'Chain ID', value: 'chain' },
      { label: 'Element', value: 'elem' },
      { label: 'Index', value: 'index' },
      { separator: true },
      { label: 'Clear', value: 'clear' },
    ],
  },
  C: {
    callbackKey: 'onColor',
    items: [
      { label: 'Solid', value: 'solid', submenu: 'solid-swatches' },
      { label: 'By Element', value: 'element', submenu: 'element-swatches' },
      { label: 'By Chain', value: 'chain', submenu: 'chain-palettes' },
      { label: 'By SS', value: 'ss', submenu: 'ss-palettes' },
      { label: 'By B-Factor', value: 'bfactor' },
    ],
  },
};

/**
 * Create the sidebar UI component.
 *
 * @param {HTMLElement} container - The DOM element that will hold the sidebar.
 * @param {object} callbacks - Callback functions for sidebar interactions.
 * @returns {{refresh: function, hide: function, show: function, getElement: function}} The sidebar API.
 */
export function createSidebar(container, callbacks) {
  container.classList.add('sidebar');
  let currentState = { objects: new Map(), selections: new Map(), surfaces: new Map() };

  // --- Resize handle ---
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'sidebar-resize-handle';
  container.appendChild(resizeHandle);

  const MIN_WIDTH = 160;
  const MAX_WIDTH = 600;

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizeHandle.classList.add('active');
    const startX = e.clientX;
    const startWidth = container.getBoundingClientRect().width;

    function onMouseMove(ev) {
      const delta = startX - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    }

    function onMouseUp() {
      resizeHandle.classList.remove('active');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // --- Delegated click listener for sidebar buttons ---
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.sidebar-btn[data-btn]');
    if (!btn) return;
    e.stopPropagation();

    // Find the row this button belongs to
    const row = btn.closest('[data-kind][data-name]');
    if (!row) return;

    const name = row.dataset.name;
    const kind = row.dataset.kind; // 'object', 'selection', 'group', or 'surface'
    const label = btn.dataset.btn;

    // Route to the appropriate popup menu and callback
    if (kind === 'object') {
      const menuDef = BUTTON_MENUS[label];
      createPopupMenu(btn, menuDef.items, (value) => {
        if (value.startsWith('surface:')) {
          if (callbacks.onCreateSurface) {
            callbacks.onCreateSurface(name, value.slice(8));
          } else if (callbacks[menuDef.callbackKey]) {
            callbacks[menuDef.callbackKey](name, value);
          }
        } else if (value.startsWith('view:') && callbacks.onView) {
          callbacks.onView(name, value.slice(5));
        } else if (callbacks[menuDef.callbackKey]) {
          callbacks[menuDef.callbackKey](name, value);
        }
      });
    } else if (kind === 'selection') {
      if (label === 'A') {
        createPopupMenu(btn, SELECTION_ACTION_MENU, (value) => {
          callbacks.onSelectionAction(name, value);
        });
      } else {
        const menuDef = BUTTON_MENUS[label];
        const selCallback = SELECTION_CALLBACK_MAP[label];
        createPopupMenu(btn, menuDef.items, (value) => {
          if (value.startsWith('view:') && callbacks.onSelectionView) {
            callbacks.onSelectionView(name, value.slice(5));
          } else {
            callbacks[selCallback](name, value);
          }
        });
      }
    } else if (kind === 'group') {
      if (label === 'A') {
        createPopupMenu(btn, GROUP_ACTION_MENU, (value) => {
          if (callbacks.onGroupAction) {
            callbacks.onGroupAction(name, value);
          }
        });
      } else {
        const menuDef = BUTTON_MENUS[label];
        createPopupMenu(btn, menuDef.items, (value) => {
          const cbKey = 'onGroup' + menuDef.callbackKey.slice(2);
          if (value.startsWith('view:') && callbacks.onGroupView) {
            callbacks.onGroupView(name, value.slice(5));
          } else if (callbacks[cbKey]) {
            callbacks[cbKey](name, value);
          }
        });
      }
    } else if (kind === 'surface') {
      if (label === 'A') {
        createPopupMenu(btn, SURFACE_ACTION_MENU, (value) => {
          if (callbacks.onSurfaceAction) {
            callbacks.onSurfaceAction(name, value);
          }
        });
      } else if (label === 'S') {
        const surface = currentState.surfaces.get(name);
        createPopupMenu(btn, buildSurfaceStyleMenu(surface), (value) => {
          if (callbacks.onSurfaceStyle) {
            callbacks.onSurfaceStyle(name, value);
          }
        });
      } else if (label === 'C') {
        createPopupMenu(btn, SURFACE_COLOR_MENU, (value) => {
          if (callbacks.onSurfaceColor) {
            callbacks.onSurfaceColor(name, value);
          }
        });
      }
    }
  });

  /**
   * Attach A,S,H,L,C buttons for an object row.
   */
  function attachObjectButtons(btnGroup, name) {
    for (const label of ['A', 'S', 'H', 'L', 'C']) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-btn';
      btn.textContent = label;
      btn.dataset.btn = label;
      btnGroup.appendChild(btn);
    }
  }

  /**
   * Attach A,S,H,L,C buttons for a selection row.
   */
  function attachSelectionButtons(btnGroup, name) {
    for (const label of ['A', 'S', 'H', 'L', 'C']) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-btn';
      btn.textContent = label;
      btn.dataset.btn = label;
      btnGroup.appendChild(btn);
    }
  }

  /**
   * Attach A,S,C buttons for a surface row.
   */
  function attachSurfaceButtons(btnGroup, name) {
    for (const label of ['A', 'S', 'C']) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-btn';
      btn.textContent = label;
      btn.dataset.btn = label;
      btnGroup.appendChild(btn);
    }
  }

  /**
   * Attach A,S,H,L,C buttons for a group row.
   * A opens the group action menu; S,H,L,C propagate to group callbacks.
   */
  function attachGroupButtons(btnGroup, name) {
    for (const label of ['A', 'S', 'H', 'L', 'C']) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-btn';
      btn.textContent = label;
      btn.dataset.btn = label;
      btnGroup.appendChild(btn);
    }
  }

  function isSurfaceVisible(surface) {
    return surface.visible !== false && surface.parentVisible !== false;
  }

  /**
   * Build a single object row for the sidebar.
   */
  function buildObjectRow(name, obj, hasChildren) {
    const row = document.createElement('div');
    row.className = 'sidebar-object';
    if (!obj.visible) {
      row.classList.add('dimmed');
    }

    if (hasChildren) {
      row.classList.add('has-children');

      // Left zone: collapse/expand
      const collapseZone = document.createElement('div');
      collapseZone.className = 'sidebar-zone-collapse';
      collapseZone.addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onToggleCollapsed) {
          callbacks.onToggleCollapsed(name);
        }
      });

      const toggle = document.createElement('span');
      toggle.className = 'sidebar-hierarchy-toggle';
      toggle.textContent = '[\u2212]'; // [−]
      collapseZone.appendChild(toggle);
      row.appendChild(collapseZone);

      // Right zone: enable/disable
      const toggleZone = document.createElement('div');
      toggleZone.className = 'sidebar-zone-toggle';
      toggleZone.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onToggleVisibility(name);
      });

      const status = document.createElement('div');
      status.className = 'sidebar-object-status';
      if (obj.visible) {
        status.classList.add('active');
      }
      toggleZone.appendChild(status);

      const nameEl = document.createElement('span');
      nameEl.className = 'sidebar-object-name';
      nameEl.textContent = name;
      toggleZone.appendChild(nameEl);
      row.appendChild(toggleZone);
    } else {
      // Regular object: only the non-button side of the row toggles visibility.
      row.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar-buttons')) return;
        callbacks.onToggleVisibility(name);
      });

      // Status circle
      const status = document.createElement('div');
      status.className = 'sidebar-object-status';
      if (obj.visible) {
        status.classList.add('active');
      }
      row.appendChild(status);

      // Object name
      const nameEl = document.createElement('span');
      nameEl.className = 'sidebar-object-name';
      nameEl.textContent = name;
      row.appendChild(nameEl);
    }

    // Button group
    const btnGroup = document.createElement('div');
    btnGroup.className = 'sidebar-buttons';
    attachObjectButtons(btnGroup, name);
    row.appendChild(btnGroup);

    return row;
  }

  /**
   * Build a single selection row for the sidebar.
   */
  function buildSelectionRow(name, sel) {
    const row = document.createElement('div');
    row.className = 'sidebar-object sidebar-selection';
    if (!sel.visible) {
      row.classList.add('dimmed');
    }

    // Clicking only the non-button side of the row toggles visibility.
    row.addEventListener('click', (e) => {
      if (e.target.closest('.sidebar-buttons')) return;
      callbacks.onToggleSelectionVisibility(name);
    });

    // Status circle
    const status = document.createElement('div');
    status.className = 'sidebar-object-status';
    if (sel.visible) {
      status.classList.add('active');
    }
    row.appendChild(status);

    // Name (parenthesized)
    const nameEl = document.createElement('span');
    nameEl.className = 'sidebar-object-name';
    nameEl.textContent = `(${name})`;
    row.appendChild(nameEl);

    // Button group
    const btnGroup = document.createElement('div');
    btnGroup.className = 'sidebar-buttons';
    attachSelectionButtons(btnGroup, name);
    row.appendChild(btnGroup);

    return row;
  }

  /**
   * Build a single surface row for the sidebar.
   */
  function buildSurfaceRow(name, surface) {
    const row = document.createElement('div');
    row.className = 'sidebar-object sidebar-surface';
    const visible = isSurfaceVisible(surface);
    if (!visible) {
      row.classList.add('dimmed');
    }

    // Clicking only the non-button side of the row toggles visibility.
    row.addEventListener('click', (e) => {
      if (e.target.closest('.sidebar-buttons')) return;
      if (callbacks.onToggleSurfaceVisibility) {
        callbacks.onToggleSurfaceVisibility(name);
      }
    });

    const status = document.createElement('div');
    status.className = 'sidebar-object-status';
    if (visible) {
      status.classList.add('active');
    }
    row.appendChild(status);

    const nameEl = document.createElement('span');
    nameEl.className = 'sidebar-object-name';
    nameEl.textContent = name;
    row.appendChild(nameEl);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'sidebar-buttons';
    attachSurfaceButtons(btnGroup, name);
    row.appendChild(btnGroup);

    return row;
  }

  /**
   * Build a group header row and its children container.
   * Returns a DocumentFragment containing both elements.
   */
  function buildGroupNode(node, state) {
    const frag = document.createDocumentFragment();

    // Group header row
    const header = document.createElement('div');
    header.className = 'sidebar-group-header';
    header.dataset.kind = 'group';
    header.dataset.name = node.name;

    // Left zone: collapse/expand
    const collapseZone = document.createElement('div');
    collapseZone.className = 'sidebar-zone-collapse';
    collapseZone.addEventListener('click', (e) => {
      e.stopPropagation();
      if (callbacks.onToggleCollapsed) {
        callbacks.onToggleCollapsed(node.name);
      }
    });

    const toggle = document.createElement('span');
    toggle.className = 'sidebar-group-toggle';
    toggle.textContent = node.collapsed ? '\u25B6' : '\u25BC'; // ▶ or ▼
    collapseZone.appendChild(toggle);
    header.appendChild(collapseZone);

    // Right zone: enable/disable all
    const toggleZone = document.createElement('div');
    toggleZone.className = 'sidebar-zone-toggle';
    toggleZone.addEventListener('click', (e) => {
      e.stopPropagation();
      if (callbacks.onToggleGroupVisibility) {
        callbacks.onToggleGroupVisibility(node.name);
      }
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'sidebar-group-name';
    nameEl.textContent = node.name;
    toggleZone.appendChild(nameEl);
    header.appendChild(toggleZone);

    // Group A,S,H,L,C buttons
    const btnGroup = document.createElement('div');
    btnGroup.className = 'sidebar-buttons';
    attachGroupButtons(btnGroup, node.name);
    header.appendChild(btnGroup);

    frag.appendChild(header);

    // Children container
    const childContainer = document.createElement('div');
    childContainer.className = 'sidebar-group-children';
    childContainer.dataset.groupChildren = node.name;
    if (node.collapsed) {
      childContainer.classList.add('collapsed');
    }

    // Render children recursively
    if (node.children) {
      renderTreeNodes(node.children, state, childContainer);
    }

    frag.appendChild(childContainer);
    return frag;
  }

  /**
   * Build an object node that has hierarchy children.
   * Returns a DocumentFragment with the object row + children container.
   */
  function buildHierarchyParentNode(node, state) {
    const frag = document.createDocumentFragment();

    const obj = state.objects.get(node.name);
    const row = buildObjectRow(node.name, obj || { visible: true }, true);
    row.dataset.kind = 'object';
    row.dataset.name = node.name;

    // Update the toggle icon based on collapsed state
    const toggle = row.querySelector('.sidebar-hierarchy-toggle');
    if (toggle) {
      toggle.textContent = node.collapsed ? '[+]' : '[\u2212]';
    }

    frag.appendChild(row);

    // Children container
    const childContainer = document.createElement('div');
    childContainer.className = 'sidebar-hierarchy-children';
    childContainer.dataset.hierarchyChildren = node.name;
    if (node.collapsed) {
      childContainer.classList.add('collapsed');
    }

    if (node.children) {
      renderTreeNodes(node.children, state, childContainer);
    }

    frag.appendChild(childContainer);
    return frag;
  }

  /**
   * Render an array of tree nodes into a container element.
   */
  function renderTreeNodes(nodes, state, target) {
    for (const node of nodes) {
      if (node.type === 'group') {
        target.appendChild(buildGroupNode(node, state));
      } else if (node.type === 'object' && node.children && node.children.length > 0) {
        target.appendChild(buildHierarchyParentNode(node, state));
      } else if (node.type === 'object') {
        const obj = state.objects.get(node.name);
        if (obj) {
          const row = buildObjectRow(node.name, obj, false);
          row.dataset.kind = 'object';
          row.dataset.name = node.name;
          target.appendChild(row);
        }
      } else if (node.type === 'selection') {
        const sel = state.selections.get(node.name);
        if (sel) {
          const row = buildSelectionRow(node.name, sel);
          row.dataset.kind = 'selection';
          row.dataset.name = node.name;
          target.appendChild(row);
        }
      } else if (node.type === 'surface') {
        const surface = state.surfaces.get(node.name);
        if (surface) {
          const row = buildSurfaceRow(node.name, surface);
          row.dataset.kind = 'surface';
          row.dataset.name = node.name;
          target.appendChild(row);
        }
      }
    }
  }

  /**
   * Check whether the tree has both non-selection top-level items and
   * selection top-level items, which requires a separator.
   */
  function needsSeparator(tree) {
    let hasObj = false;
    let hasSel = false;
    for (const node of tree) {
      if (node.type === 'selection') hasSel = true;
      else hasObj = true;
      if (hasObj && hasSel) return true;
    }
    return false;
  }

  /**
   * Build a flat list of expected key descriptors from a tree node.
   * Each descriptor has { key, type, node } for matching against existing DOM.
   */
  function addExpectedKeys(node, out) {
    if (node.type === 'group') {
      out.push({ key: `group:${node.name}`, type: 'group-header', node });
      out.push({ key: `group-children:${node.name}`, type: 'group-children', node });
    } else if (node.type === 'object' && node.children && node.children.length > 0) {
      out.push({ key: `object:${node.name}`, type: 'hierarchy-parent', node });
      out.push({ key: `hierarchy-children:${node.name}`, type: 'hierarchy-children', node });
    } else if (node.type === 'object') {
      out.push({ key: `object:${node.name}`, type: 'object', node });
    } else if (node.type === 'selection') {
      out.push({ key: `selection:${node.name}`, type: 'selection', node });
    } else if (node.type === 'surface') {
      out.push({ key: `surface:${node.name}`, type: 'surface', node });
    }
  }

  /**
   * Get a stable key for a DOM element, or null if it has no key.
   */
  function getElementKey(el) {
    if (el.dataset.kind && el.dataset.name) {
      return `${el.dataset.kind}:${el.dataset.name}`;
    }
    if (el.dataset.groupChildren !== undefined) {
      return `group-children:${el.dataset.groupChildren}`;
    }
    if (el.dataset.hierarchyChildren !== undefined) {
      return `hierarchy-children:${el.dataset.hierarchyChildren}`;
    }
    if (el.classList && el.classList.contains('sidebar-separator')) {
      return '__separator__';
    }
    return null;
  }

  /**
   * Update an existing object row in place (visibility + status).
   */
  function updateObjectRow(row, obj) {
    row.classList.toggle('dimmed', !obj.visible);
    const status = row.querySelector('.sidebar-object-status');
    if (status) status.classList.toggle('active', obj.visible);
  }

  /**
   * Update an existing selection row in place (visibility + status).
   */
  function updateSelectionRow(row, sel) {
    row.classList.toggle('dimmed', !sel.visible);
    const status = row.querySelector('.sidebar-object-status');
    if (status) status.classList.toggle('active', sel.visible);
  }

  /**
   * Update an existing surface row in place (visibility + status).
   */
  function updateSurfaceRow(row, surface) {
    const visible = isSurfaceVisible(surface);
    row.classList.toggle('dimmed', !visible);
    const status = row.querySelector('.sidebar-object-status');
    if (status) status.classList.toggle('active', visible);
  }

  /**
   * Update a group header row in place (toggle icon).
   */
  function updateGroupHeader(header, node) {
    const toggle = header.querySelector('.sidebar-group-toggle');
    if (toggle) {
      toggle.textContent = node.collapsed ? '\u25B6' : '\u25BC';
    }
  }

  /**
   * Update a group children container in place (collapsed class + recurse).
   */
  function updateGroupChildren(childContainer, node, state) {
    childContainer.classList.toggle('collapsed', !!node.collapsed);
    // Recursively diff the children
    const childExpected = [];
    if (node.children) {
      for (const child of node.children) {
        addExpectedKeys(child, childExpected);
      }
    }
    diffChildren(childContainer, childExpected, state, null);
  }

  /**
   * Update a hierarchy parent row in place (visibility + toggle icon).
   */
  function updateHierarchyParentRow(row, node, state) {
    const obj = state.objects.get(node.name);
    if (obj) {
      updateObjectRow(row, obj);
    }
    const toggle = row.querySelector('.sidebar-hierarchy-toggle');
    if (toggle) {
      toggle.textContent = node.collapsed ? '[+]' : '[\u2212]';
    }
  }

  /**
   * Update a hierarchy children container in place (collapsed class + recurse).
   */
  function updateHierarchyChildren(childContainer, node, state) {
    childContainer.classList.toggle('collapsed', !!node.collapsed);
    const childExpected = [];
    if (node.children) {
      for (const child of node.children) {
        addExpectedKeys(child, childExpected);
      }
    }
    diffChildren(childContainer, childExpected, state, null);
  }

  /**
   * Create a new DOM element for a given expected descriptor.
   */
  function createElementForDescriptor(desc, state) {
    switch (desc.type) {
      case 'group-header': {
        // buildGroupNode returns a fragment with header + children container
        // We only need the header here; children container is a separate descriptor
        const frag = buildGroupNode(desc.node, state);
        // First child of fragment is the header
        return frag.firstChild;
      }
      case 'group-children': {
        // Build the full group node and return just the children container
        const frag = buildGroupNode(desc.node, state);
        // After extracting header (first child), the next is children container
        // But since we already extracted header in group-header, rebuild here
        const childContainer = document.createElement('div');
        childContainer.className = 'sidebar-group-children';
        childContainer.dataset.groupChildren = desc.node.name;
        if (desc.node.collapsed) {
          childContainer.classList.add('collapsed');
        }
        if (desc.node.children) {
          renderTreeNodes(desc.node.children, state, childContainer);
        }
        return childContainer;
      }
      case 'hierarchy-parent': {
        const obj = state.objects.get(desc.node.name);
        const row = buildObjectRow(desc.node.name, obj || { visible: true }, true);
        row.dataset.kind = 'object';
        row.dataset.name = desc.node.name;
        const toggle = row.querySelector('.sidebar-hierarchy-toggle');
        if (toggle) {
          toggle.textContent = desc.node.collapsed ? '[+]' : '[\u2212]';
        }
        return row;
      }
      case 'hierarchy-children': {
        const childContainer = document.createElement('div');
        childContainer.className = 'sidebar-hierarchy-children';
        childContainer.dataset.hierarchyChildren = desc.node.name;
        if (desc.node.collapsed) {
          childContainer.classList.add('collapsed');
        }
        if (desc.node.children) {
          renderTreeNodes(desc.node.children, state, childContainer);
        }
        return childContainer;
      }
      case 'object': {
        const obj = state.objects.get(desc.node.name);
        if (!obj) return null;
        const row = buildObjectRow(desc.node.name, obj, false);
        row.dataset.kind = 'object';
        row.dataset.name = desc.node.name;
        return row;
      }
      case 'selection': {
        const sel = state.selections.get(desc.node.name);
        if (!sel) return null;
        const row = buildSelectionRow(desc.node.name, sel);
        row.dataset.kind = 'selection';
        row.dataset.name = desc.node.name;
        return row;
      }
      case 'surface': {
        const surface = state.surfaces.get(desc.node.name);
        if (!surface) return null;
        const row = buildSurfaceRow(desc.node.name, surface);
        row.dataset.kind = 'surface';
        row.dataset.name = desc.node.name;
        return row;
      }
      case 'separator': {
        const sep = document.createElement('div');
        sep.className = 'sidebar-separator';
        return sep;
      }
      default:
        return null;
    }
  }

  /**
   * Perform a keyed diff of a container's children against an expected list.
   * Reuses existing DOM elements where keys match, inserts new ones, removes stale ones.
   *
   * @param {HTMLElement} parent - The container element.
   * @param {Array} expectedSequence - Array of { key, type, node } descriptors.
   * @param {object} state - The application state.
   * @param {HTMLElement|null} preserveFirst - Element to preserve as first child (e.g., resizeHandle).
   */
  function diffChildren(parent, expectedSequence, state, preserveFirst) {
    // Index existing keyed children
    const existingByKey = new Map();
    for (const child of parent.children) {
      if (child === preserveFirst) continue;
      const key = getElementKey(child);
      if (key) {
        existingByKey.set(key, child);
      }
    }

    // Track which keys we've seen
    const visitedKeys = new Set();

    // Walk expected sequence and reconcile
    let cursor = preserveFirst ? preserveFirst.nextSibling : parent.firstChild;

    for (const desc of expectedSequence) {
      visitedKeys.add(desc.key);
      const existing = existingByKey.get(desc.key);

      if (existing) {
        // Update in place
        switch (desc.type) {
          case 'object': {
            const obj = state.objects.get(desc.node.name);
            if (obj) updateObjectRow(existing, obj);
            break;
          }
          case 'selection': {
            const sel = state.selections.get(desc.node.name);
            if (sel) updateSelectionRow(existing, sel);
            break;
          }
          case 'surface': {
            const surface = state.surfaces.get(desc.node.name);
            if (surface) updateSurfaceRow(existing, surface);
            break;
          }
          case 'group-header':
            updateGroupHeader(existing, desc.node);
            break;
          case 'group-children':
            updateGroupChildren(existing, desc.node, state);
            break;
          case 'hierarchy-parent':
            updateHierarchyParentRow(existing, desc.node, state);
            break;
          case 'hierarchy-children':
            updateHierarchyChildren(existing, desc.node, state);
            break;
          // separator: nothing to update
        }

        // Move into correct position if needed
        if (existing !== cursor) {
          parent.insertBefore(existing, cursor);
        } else {
          cursor = existing.nextSibling;
        }
      } else {
        // Create new element and insert
        const newEl = createElementForDescriptor(desc, state);
        if (newEl) {
          parent.insertBefore(newEl, cursor);
        }
      }
    }

    // Remove stale elements
    for (const [key, el] of existingByKey) {
      if (!visitedKeys.has(key)) {
        el.remove();
      }
    }
  }

  return {
    /**
     * Rebuild the sidebar object list from the current state.
     *
     * If state.entryTree is populated, renders from the tree structure.
     * Otherwise falls back to rendering from objects, surfaces, and selections
     * for backward compatibility.
     *
     * @param {object} state - The application state.
     */
    refresh(state) {
      currentState = {
        ...state,
        objects: state.objects || new Map(),
        selections: state.selections || new Map(),
        surfaces: state.surfaces || new Map(),
      };
      const hasTree = currentState.entryTree && currentState.entryTree.length > 0;

      if (hasTree) {
        // --- Tree-based rendering (incremental keyed diff) ---
        const tree = currentState.entryTree;

        // Split into non-selection and selection top-level nodes
        const objNodes = tree.filter(n => n.type !== 'selection');
        const selNodes = tree.filter(n => n.type === 'selection');

        // Build the flat sequence of expected top-level elements
        const expectedSequence = [];
        for (const node of objNodes) {
          addExpectedKeys(node, expectedSequence);
        }
        if (objNodes.length > 0 && selNodes.length > 0) {
          expectedSequence.push({ key: '__separator__', type: 'separator' });
        }
        for (const node of selNodes) {
          addExpectedKeys(node, expectedSequence);
        }

        // Perform incremental diff on this container's direct children
        diffChildren(container, expectedSequence, currentState, resizeHandle);
      } else {
        // --- Legacy flat rendering (incremental keyed diff) ---
        const expectedSequence = [];
        for (const name of currentState.objects.keys()) {
          expectedSequence.push({
            key: `object:${name}`,
            type: 'object',
            node: { type: 'object', name },
          });
        }
        for (const name of currentState.surfaces.keys()) {
          expectedSequence.push({
            key: `surface:${name}`,
            type: 'surface',
            node: { type: 'surface', name },
          });
        }
        if (currentState.selections.size > 0) {
          expectedSequence.push({ key: '__separator__', type: 'separator' });
        }
        for (const name of currentState.selections.keys()) {
          expectedSequence.push({
            key: `selection:${name}`,
            type: 'selection',
            node: { type: 'selection', name },
          });
        }

        diffChildren(container, expectedSequence, currentState, resizeHandle);
      }
    },

    /**
     * Hide the sidebar by adding the hidden class to the container.
     */
    hide() {
      container.classList.add('hidden');
    },

    /**
     * Show the sidebar by removing the hidden class from the container.
     */
    show() {
      container.classList.remove('hidden');
    },

    /**
     * Return the sidebar container element.
     *
     * @returns {HTMLElement} The sidebar container.
     */
    getElement() {
      return container;
    },
  };
}
