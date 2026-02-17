/**
 * Sidebar component for the 3Dmol.js GUI.
 *
 * Renders an object list with status indicators and popup menus
 * for controlling visibility, representation, labeling, and coloring of
 * molecular objects.
 */

import { CARBON_SWATCHES, SOLID_SWATCHES, CHAIN_PALETTES, SS_PALETTES } from './color-swatches.js';

/** @type {HTMLElement|null} */
let activePopup = null;

/** @type {HTMLElement|null} */
let activePopupAnchor = null;

/** @type {function|null} */
let activePopupCleanup = null;

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

/**
 * Create and display a popup menu anchored to a button element.
 *
 * The menu is positioned below the anchor by default. If there is not enough
 * viewport space below, it is placed above instead. Only one popup may be open
 * at a time; opening a new one closes the previous.
 *
 * @param {HTMLElement} anchor - The button element to anchor the menu to.
 * @param {Array<{label: string, value: string}|{separator: true}>} items - Menu items.
 * @param {function} onClick - Callback invoked with the selected item's value.
 */
function createPopupMenu(anchor, items, onClick) {
  if (activePopupAnchor === anchor) {
    closeActivePopup();
    return;
  }
  closeActivePopup();

  const menu = document.createElement('div');
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
      stdItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeActivePopup();
        onClick(item.value);
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
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          closeActivePopup();
          onClick(item.value + ':' + swatch.hex);
        });
        grid.appendChild(cell);
      }
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
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          closeActivePopup();
          onClick(swatch.hex);
        });
        grid.appendChild(cell);
      }
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
        palItem.addEventListener('click', (e) => {
          e.stopPropagation();
          closeActivePopup();
          onClick('chain:' + key);
        });
        submenu.appendChild(palItem);
      }

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

        palItem.addEventListener('click', (e) => {
          e.stopPropagation();
          closeActivePopup();
          onClick('ss:' + pal.key);
        });
        submenu.appendChild(palItem);
      }

      menuItem.appendChild(submenu);
      menu.appendChild(menuItem);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = 'popup-menu-item';
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeActivePopup();
        onClick(item.value);
      });
      menu.appendChild(menuItem);
    }
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
 * Mapping from S/H/L/C button labels to selection-specific callback keys.
 */
const SELECTION_CALLBACK_MAP = {
  S: 'onSelectionShow',
  H: 'onSelectionHide',
  L: 'onSelectionLabel',
  C: 'onSelectionColor',
};

const BUTTON_MENUS = {
  A: {
    callbackKey: 'onAction',
    items: [
      { label: 'Rename...', value: 'rename' },
      { label: 'Duplicate', value: 'duplicate' },
      { label: 'Delete', value: 'delete' },
      { separator: true },
      { label: 'Center', value: 'center' },
      { label: 'Orient', value: 'orient' },
      { label: 'Zoom', value: 'zoom' },
    ],
  },
  S: {
    callbackKey: 'onShow',
    items: [
      { label: 'Cartoon', value: 'cartoon' },
      { label: 'Sticks', value: 'stick' },
      { label: 'Lines', value: 'line' },
      { label: 'Spheres', value: 'sphere' },
      { label: 'Surface', value: 'surface' },
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
      { label: 'Surface', value: 'surface' },
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
 * @param {function} callbacks.onToggleVisibility - Called with object name when the status circle is clicked.
 * @param {function} callbacks.onAction - Called with (name, action) when an Action menu item is selected.
 * @param {function} callbacks.onShow - Called with (name, representation) when a Show menu item is selected.
 * @param {function} callbacks.onHide - Called with (name, representation) when a Hide menu item is selected.
 * @param {function} callbacks.onLabel - Called with (name, property) when a Label menu item is selected.
 * @param {function} callbacks.onColor - Called with (name, scheme) when a Color menu item is selected.
 * @returns {{refresh: function, hide: function, show: function, getElement: function}} The sidebar API.
 */
export function createSidebar(container, callbacks) {
  container.classList.add('sidebar');

  /**
   * Build a single object row for the sidebar.
   *
   * @param {string} name - The name of the molecular object.
   * @param {object} obj - The object entry from state.objects.
   * @returns {HTMLElement} The constructed row element.
   */
  function buildObjectRow(name, obj) {
    const row = document.createElement('div');
    row.className = 'sidebar-object';
    if (!obj.visible) {
      row.classList.add('dimmed');
    }

    // Clicking anywhere on the row (outside buttons) toggles visibility
    row.addEventListener('click', () => {
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

    // Button group
    const btnGroup = document.createElement('div');
    btnGroup.className = 'sidebar-buttons';

    for (const label of ['A', 'S', 'H', 'L', 'C']) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-btn';
      btn.textContent = label;

      const menuDef = BUTTON_MENUS[label];
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        createPopupMenu(btn, menuDef.items, (value) => {
          if (value.startsWith('view:') && callbacks.onView) {
            callbacks.onView(name, value.slice(5));
          } else {
            callbacks[menuDef.callbackKey](name, value);
          }
        });
      });

      btnGroup.appendChild(btn);
    }

    row.appendChild(btnGroup);
    return row;
  }

  /**
   * Build a single selection row for the sidebar.
   *
   * @param {string} name - The name of the selection.
   * @param {object} sel - The selection entry from state.selections.
   * @returns {HTMLElement} The constructed row element.
   */
  function buildSelectionRow(name, sel) {
    const row = document.createElement('div');
    row.className = 'sidebar-object sidebar-selection';
    if (!sel.visible) {
      row.classList.add('dimmed');
    }

    // Clicking anywhere on the row (outside buttons) toggles visibility
    row.addEventListener('click', () => {
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

    // A button — uses selection-specific action menu
    const aBtn = document.createElement('button');
    aBtn.className = 'sidebar-btn';
    aBtn.textContent = 'A';
    aBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      createPopupMenu(aBtn, SELECTION_ACTION_MENU, (value) => {
        callbacks.onSelectionAction(name, value);
      });
    });
    btnGroup.appendChild(aBtn);

    // S, H, L, C buttons — reuse BUTTON_MENUS items but route to selection callbacks
    for (const label of ['S', 'H', 'L', 'C']) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-btn';
      btn.textContent = label;

      const menuDef = BUTTON_MENUS[label];
      const selCallback = SELECTION_CALLBACK_MAP[label];
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        createPopupMenu(btn, menuDef.items, (value) => {
          if (value.startsWith('view:') && callbacks.onSelectionView) {
            callbacks.onSelectionView(name, value.slice(5));
          } else {
            callbacks[selCallback](name, value);
          }
        });
      });

      btnGroup.appendChild(btn);
    }

    row.appendChild(btnGroup);
    return row;
  }

  return {
    /**
     * Rebuild the sidebar object list from the current state.
     *
     * @param {object} state - The application state containing an objects Map.
     */
    refresh(state) {
      const expectedNames = new Set();

      // Update or add object rows
      for (const [name, obj] of state.objects) {
        expectedNames.add('obj:' + name);
        let row = container.querySelector(`[data-kind="object"][data-name="${CSS.escape(name)}"]`);
        if (!row) {
          row = buildObjectRow(name, obj);
          row.dataset.kind = 'object';
          row.dataset.name = name;
          const sep = container.querySelector('.sidebar-separator');
          if (sep) {
            container.insertBefore(row, sep);
          } else {
            container.appendChild(row);
          }
        } else {
          row.classList.toggle('dimmed', !obj.visible);
          const status = row.querySelector('.sidebar-object-status');
          if (status) status.classList.toggle('active', obj.visible);
        }
      }

      // Handle separator
      const hasSelections = state.selections.size > 0;
      let sep = container.querySelector('.sidebar-separator');
      if (hasSelections && !sep) {
        sep = document.createElement('div');
        sep.className = 'sidebar-separator';
        container.appendChild(sep);
      } else if (!hasSelections && sep) {
        sep.remove();
      }

      // Update or add selection rows
      for (const [name, sel] of state.selections) {
        expectedNames.add('sel:' + name);
        let row = container.querySelector(`[data-kind="selection"][data-name="${CSS.escape(name)}"]`);
        if (!row) {
          row = buildSelectionRow(name, sel);
          row.dataset.kind = 'selection';
          row.dataset.name = name;
          container.appendChild(row);
        } else {
          row.classList.toggle('dimmed', !sel.visible);
          const status = row.querySelector('.sidebar-object-status');
          if (status) status.classList.toggle('active', sel.visible);
        }
      }

      // Remove stale rows
      for (const row of [...container.querySelectorAll('[data-kind]')]) {
        const key = row.dataset.kind === 'object' ? 'obj:' : 'sel:';
        if (!expectedNames.has(key + row.dataset.name)) {
          row.remove();
        }
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
