/**
 * Sidebar component for the 3Dmol.js GUI.
 *
 * Renders a PyMOL-like object list with status indicators and popup menus
 * for controlling visibility, representation, labeling, and coloring of
 * molecular objects.
 */

/** @type {HTMLElement|null} */
let activePopup = null;

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
  closeActivePopup();

  const menu = document.createElement('div');
  menu.className = 'popup-menu';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'popup-menu-separator';
      menu.appendChild(sep);
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
      { label: 'By Element', value: 'element' },
      { label: 'By Chain', value: 'chain' },
      { label: 'By SS', value: 'ss' },
      { label: 'By B-Factor', value: 'bfactor' },
      { separator: true },
      { label: 'Red', value: 'red' },
      { label: 'Green', value: 'green' },
      { label: 'Blue', value: 'blue' },
      { label: 'Yellow', value: 'yellow' },
      { label: 'Cyan', value: 'cyan' },
      { label: 'Magenta', value: 'magenta' },
      { label: 'Orange', value: 'orange' },
      { label: 'White', value: 'white' },
      { label: 'Grey', value: 'grey' },
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

    // Status circle
    const status = document.createElement('div');
    status.className = 'sidebar-object-status';
    if (obj.visible) {
      status.classList.add('active');
    }
    status.addEventListener('click', () => {
      callbacks.onToggleVisibility(name);
    });
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
          callbacks[menuDef.callbackKey](name, value);
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
      container.innerHTML = '';
      for (const [name, obj] of state.objects) {
        container.appendChild(buildObjectRow(name, obj));
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
