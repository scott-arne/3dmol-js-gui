/**
 * Right-click context menu for the 3Dmol.js viewer.
 *
 * Displays Action, Show, Hide, Label, and Color submenus that operate on the
 * current active selection. All top-level items are greyed out when nothing
 * is selected.
 */

const MENU_DEFS = {
  Action: {
    callbackKey: 'onAction',
    items: [
      { label: 'Center', value: 'center' },
      { label: 'Zoom', value: 'zoom' },
    ],
  },
  Show: {
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
  Hide: {
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
  Label: {
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
  Color: {
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

/** @type {HTMLElement|null} Currently visible context menu. */
let activeMenu = null;

/**
 * Close the active context menu if one is open.
 */
function closeMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

/**
 * Attach a right-click context menu to the viewer container.
 *
 * @param {HTMLElement} container - The viewer container element.
 * @param {object} callbacks - Action callbacks and selection state accessor.
 * @param {function(): boolean} callbacks.hasSelection - Returns true when an active selection exists.
 * @param {function(string): void} callbacks.onAction - Called with action value (center, zoom).
 * @param {function(string): void} callbacks.onShow - Called with representation value.
 * @param {function(string): void} callbacks.onHide - Called with representation value.
 * @param {function(string): void} callbacks.onLabel - Called with label property value.
 * @param {function(string): void} callbacks.onColor - Called with color/scheme value.
 */
export function createContextMenu(container, callbacks) {
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    closeMenu();

    const hasSelection = callbacks.hasSelection();
    const menu = buildMenu(hasSelection, callbacks);

    document.body.appendChild(menu);
    activeMenu = menu;

    // Position near the cursor, clamped to viewport
    const rect = menu.getBoundingClientRect();
    let top = e.clientY;
    let left = e.clientX;

    if (top + rect.height > window.innerHeight) {
      top = window.innerHeight - rect.height;
    }
    if (left + rect.width > window.innerWidth) {
      left = window.innerWidth - rect.width;
    }
    if (top < 0) top = 0;
    if (left < 0) left = 0;

    menu.style.top = `${top + window.scrollY}px`;
    menu.style.left = `${left + window.scrollX}px`;

    // Close on outside click (deferred to avoid closing immediately)
    requestAnimationFrame(() => {
      document.addEventListener('click', onOutsideClick, true);
      document.addEventListener('contextmenu', onOutsideContext, true);
    });
  });

  function onOutsideClick() {
    closeMenu();
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('contextmenu', onOutsideContext, true);
  }

  function onOutsideContext() {
    closeMenu();
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('contextmenu', onOutsideContext, true);
  }

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

/**
 * Build the context menu DOM.
 */
function buildMenu(hasSelection, callbacks) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';

  for (const [label, def] of Object.entries(MENU_DEFS)) {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    if (!hasSelection) {
      item.classList.add('disabled');
    }

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    item.appendChild(labelEl);

    const arrow = document.createElement('span');
    arrow.className = 'context-menu-arrow';
    arrow.textContent = '\u25B6'; // ▶
    item.appendChild(arrow);

    // Build submenu
    const submenu = document.createElement('div');
    submenu.className = 'context-menu-submenu';

    for (const entry of def.items) {
      if (entry.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        submenu.appendChild(sep);
      } else {
        const subItem = document.createElement('div');
        subItem.className = 'context-menu-submenu-item';
        subItem.textContent = entry.label;
        subItem.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu();
          if (hasSelection && callbacks[def.callbackKey]) {
            callbacks[def.callbackKey](entry.value);
          }
        });
        submenu.appendChild(subItem);
      }
    }

    item.appendChild(submenu);
    menu.appendChild(item);
  }

  return menu;
}
