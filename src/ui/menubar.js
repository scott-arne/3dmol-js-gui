/**
 * Menu bar component for the 3Dmol.js GUI.
 *
 * Provides a horizontal menu bar with File, Select, and Window dropdowns.
 * Manages dropdown open/close state,
 * selection-mode radio behavior, and independent window toggle checkmarks.
 */

/**
 * Menu definition: each top-level menu has a label and an array of items.
 * Items can be regular actions, single-select (radio), or independent toggles.
 */
const SELECTION_MODES = ['atoms', 'residues', 'chains', 'molecules'];

/**
 * Create and mount a menu bar inside the given container element.
 *
 * @param {HTMLElement} container - The container element (should have class `.menubar`).
 * @param {object} callbacks - Callback functions for menu actions.
 * @param {function} callbacks.onLoad - Called when File > Load... is clicked.
 * @param {function} callbacks.onExport - Called when File > Export... is clicked.
 * @param {function(string): void} callbacks.onSelectionMode - Called with the mode string when a selection mode is chosen.
 * @param {function} callbacks.onToggleSidebar - Called when Window > Sidebar is toggled.
 * @param {function} callbacks.onToggleTerminal - Called when Window > Terminal is toggled.
 * @returns {object} Menu bar API with `getElement()` and `setSelectionMode(mode)`.
 */
export function createMenuBar(container, callbacks) {
  // --- Internal state ---
  let activeSelectionMode = 'atoms';
  let sidebarChecked = true;
  let terminalChecked = true;
  let compactChecked = false;
  let activeTheme = 'dark';
  let openDropdown = null; // reference to the currently open dropdown element
  let openMenuItem = null; // reference to the currently active menu-item element
  let hamburgerDropdown = null; // reference to the hamburger dropdown when open

  // --- Helper: close any open dropdown (including hamburger) ---
  function closeDropdown() {
    if (openDropdown) {
      openDropdown.remove();
      openDropdown = null;
    }
    if (openMenuItem) {
      openMenuItem.classList.remove('active');
      openMenuItem = null;
    }
    closeHamburger();
  }

  // --- Helper: close the hamburger dropdown ---
  function closeHamburger() {
    if (hamburgerDropdown) {
      hamburgerDropdown.remove();
      hamburgerDropdown = null;
    }
  }

  // --- Helper: create a dropdown item element ---
  function createDropdownItem(label, { checked = false, onClick } = {}) {
    const item = document.createElement('div');
    item.className = 'menubar-dropdown-item';
    if (checked) {
      item.classList.add('checked');
    }
    item.textContent = label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onClick) onClick(item);
    });
    return item;
  }

  // --- Build File dropdown ---
  function buildFileDropdown() {
    const dropdown = document.createElement('div');
    dropdown.className = 'menubar-dropdown';

    dropdown.appendChild(createDropdownItem('Load...', {
      onClick: () => {
        closeDropdown();
        if (callbacks.onLoad) callbacks.onLoad();
      },
    }));

    dropdown.appendChild(createDropdownItem('Export Image...', {
      onClick: () => {
        closeDropdown();
        if (callbacks.onExport) callbacks.onExport();
      },
    }));

    return dropdown;
  }

  // --- Helper: add a section header to a dropdown ---
  function addSectionHeader(dropdown, text) {
    const header = document.createElement('div');
    header.className = 'menubar-dropdown-section-header';
    header.textContent = text;
    dropdown.appendChild(header);
  }

  // --- Helper: add a separator to a dropdown ---
  function addSeparator(dropdown) {
    const sep = document.createElement('div');
    sep.className = 'menubar-dropdown-separator';
    dropdown.appendChild(sep);
  }

  // --- Build Select dropdown ---
  function buildSelectDropdown() {
    const dropdown = document.createElement('div');
    dropdown.className = 'menubar-dropdown';

    // --- Selections section ---
    addSectionHeader(dropdown, 'Selections');
    const selectItems = [
      { label: 'Protein', value: 'protein' },
      { label: 'Ligand', value: 'ligand' },
      { label: 'Backbone', value: 'backbone' },
      { label: 'Side Chains', value: 'sidechains' },
    ];
    for (const entry of selectItems) {
      dropdown.appendChild(createDropdownItem(entry.label, {
        onClick: () => {
          closeDropdown();
          if (callbacks.onSelect) callbacks.onSelect(entry.value);
        },
      }));
    }

    // --- Expand section ---
    addSeparator(dropdown);
    addSectionHeader(dropdown, 'Expand');
    const expandItems = [
      { label: 'Residues', value: 'residues' },
      { label: 'Chains', value: 'chains' },
      { label: 'Molecules', value: 'molecules' },
      { label: 'Near Atoms (5\u00C5)', value: 'nearAtoms' },
      { label: 'Near Residues (5\u00C5)', value: 'nearResidues' },
    ];
    for (const entry of expandItems) {
      dropdown.appendChild(createDropdownItem(entry.label, {
        onClick: () => {
          closeDropdown();
          if (callbacks.onExpand) callbacks.onExpand(entry.value);
        },
      }));
    }

    // --- Action section ---
    addSeparator(dropdown);
    addSectionHeader(dropdown, 'Action');
    const actionItems = [
      { label: 'Center', value: 'center' },
      { label: 'Zoom', value: 'zoom' },
    ];
    for (const entry of actionItems) {
      dropdown.appendChild(createDropdownItem(entry.label, {
        onClick: () => {
          closeDropdown();
          if (callbacks.onSelectionAction) callbacks.onSelectionAction(entry.value);
        },
      }));
    }

    return dropdown;
  }

  // --- Build View dropdown ---
  function buildViewDropdown() {
    const dropdown = document.createElement('div');
    dropdown.className = 'menubar-dropdown';

    const viewItems = [
      { label: 'Simple', value: 'simple' },
      { label: 'Sites', value: 'sites' },
      { label: 'Ball-and-Stick', value: 'ball-and-stick' },
    ];
    for (const entry of viewItems) {
      dropdown.appendChild(createDropdownItem(entry.label, {
        onClick: () => {
          closeDropdown();
          if (callbacks.onView) callbacks.onView(entry.value);
        },
      }));
    }

    return dropdown;
  }

  // --- Build Window dropdown ---
  function buildWindowDropdown() {
    const dropdown = document.createElement('div');
    dropdown.className = 'menubar-dropdown';

    const sidebarItem = createDropdownItem('Sidebar', {
      checked: sidebarChecked,
      onClick: (item) => {
        sidebarChecked = !sidebarChecked;
        item.classList.toggle('checked', sidebarChecked);
        closeDropdown();
        if (callbacks.onToggleSidebar) callbacks.onToggleSidebar();
      },
    });
    dropdown.appendChild(sidebarItem);

    const terminalItem = createDropdownItem('Terminal', {
      checked: terminalChecked,
      onClick: (item) => {
        terminalChecked = !terminalChecked;
        item.classList.toggle('checked', terminalChecked);
        closeDropdown();
        if (callbacks.onToggleTerminal) callbacks.onToggleTerminal();
      },
    });
    dropdown.appendChild(terminalItem);

    const sep = document.createElement('div');
    sep.className = 'menubar-dropdown-separator';
    dropdown.appendChild(sep);

    const compactItem = createDropdownItem('Compact Menu', {
      checked: compactChecked,
      onClick: (item) => {
        compactChecked = !compactChecked;
        item.classList.toggle('checked', compactChecked);
        closeDropdown();
        if (callbacks.onToggleCompact) callbacks.onToggleCompact(compactChecked);
      },
    });
    dropdown.appendChild(compactItem);

    addSeparator(dropdown);
    addSectionHeader(dropdown, 'Theme');

    const themes = [
      { label: 'Dark', value: 'dark' },
      { label: 'Light', value: 'light' },
    ];
    for (const theme of themes) {
      dropdown.appendChild(createDropdownItem(theme.label, {
        checked: activeTheme === theme.value,
        onClick: () => {
          activeTheme = theme.value;
          closeDropdown();
          if (callbacks.onThemeChange) callbacks.onThemeChange(theme.value);
        },
      }));
    }

    return dropdown;
  }

  // --- Menu definitions mapping label -> builder ---
  const menuBuilders = {
    File: buildFileDropdown,
    View: buildViewDropdown,
    Select: buildSelectDropdown,
    Window: buildWindowDropdown,
  };

  // --- Create top-level menu items ---
  const menuItems = [];

  for (const label of Object.keys(menuBuilders)) {
    const menuItem = document.createElement('div');
    menuItem.className = 'menubar-item';
    menuItem.textContent = label;

    menuItem.addEventListener('click', (e) => {
      e.stopPropagation();

      // Toggle: if clicking the same item that is already open, close it
      if (openMenuItem === menuItem) {
        closeDropdown();
        return;
      }

      // Close any previously open dropdown
      closeDropdown();

      // Open this dropdown
      const dropdown = menuBuilders[label]();
      menuItem.appendChild(dropdown);
      menuItem.classList.add('active');
      openDropdown = dropdown;
      openMenuItem = menuItem;
    });

    container.appendChild(menuItem);
    menuItems.push(menuItem);
  }

  // --- Right-aligned selection mode picker ---
  const modePicker = document.createElement('div');
  modePicker.className = 'menubar-mode-picker';

  const modeLabel = document.createElement('span');
  modeLabel.textContent = activeSelectionMode.charAt(0).toUpperCase() + activeSelectionMode.slice(1);
  modePicker.appendChild(modeLabel);

  const modeArrow = document.createElement('span');
  modeArrow.className = 'menubar-mode-arrow';
  modeArrow.textContent = '\u25BC';
  modePicker.appendChild(modeArrow);

  modePicker.addEventListener('click', (e) => {
    e.stopPropagation();

    if (openMenuItem === modePicker) {
      closeDropdown();
      return;
    }

    closeDropdown();

    const dropdown = document.createElement('div');
    dropdown.className = 'menubar-dropdown';
    dropdown.style.right = '0';
    dropdown.style.left = 'auto';

    for (const mode of SELECTION_MODES) {
      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
      dropdown.appendChild(createDropdownItem(label, {
        checked: mode === activeSelectionMode,
        onClick: () => {
          activeSelectionMode = mode;
          modeLabel.textContent = label;
          closeDropdown();
          if (callbacks.onSelectionMode) callbacks.onSelectionMode(mode);
        },
      }));
    }

    modePicker.appendChild(dropdown);
    openDropdown = dropdown;
    openMenuItem = modePicker;
  });

  container.appendChild(modePicker);

  // --- Hamburger button for compact mode ---
  const hamburger = document.createElement('div');
  hamburger.className = 'menubar-hamburger';
  hamburger.textContent = '\u2630'; // ☰
  hamburger.style.display = 'none';

  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();

    if (hamburgerDropdown) {
      closeHamburger();
      return;
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'menubar-dropdown menubar-hamburger-dropdown';

    for (const label of Object.keys(menuBuilders)) {
      const item = document.createElement('div');
      item.className = 'menubar-hamburger-menu-item';

      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      item.appendChild(labelEl);

      const arrow = document.createElement('span');
      arrow.className = 'menubar-hamburger-arrow';
      arrow.textContent = '\u25B6';
      item.appendChild(arrow);

      const submenu = menuBuilders[label]();
      submenu.className = 'menubar-hamburger-submenu';
      item.appendChild(submenu);

      dropdown.appendChild(item);
    }

    hamburger.appendChild(dropdown);
    hamburgerDropdown = dropdown;
  });

  container.insertBefore(hamburger, container.firstChild);

  // --- Global click handler: close dropdown when clicking outside ---
  // closeDropdown() also closes the hamburger dropdown.
  document.addEventListener('click', () => {
    closeDropdown();
  });

  // --- Escape key handler ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  // --- Public API ---
  return {
    /**
     * Return the menu bar container element.
     *
     * @returns {HTMLElement} The container element.
     */
    getElement() {
      return container;
    },

    /**
     * Programmatically update the active selection mode checkmark.
     *
     * @param {string} mode - One of 'atoms', 'residues', 'chains', or 'molecules'.
     */
    setSelectionMode(mode) {
      if (SELECTION_MODES.includes(mode)) {
        activeSelectionMode = mode;
        modeLabel.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      }
    },

    /**
     * Programmatically update the active theme.
     *
     * @param {'dark'|'light'} theme - The theme name.
     */
    setTheme(theme) {
      if (theme === 'dark' || theme === 'light') {
        activeTheme = theme;
      }
    },

    /**
     * Enable or disable compact (hamburger) mode.
     *
     * @param {boolean} compact - True to enable compact mode, false for normal.
     */
    setCompact(compact) {
      compactChecked = compact;
      if (compact) {
        hamburger.style.display = '';
        for (const item of menuItems) {
          item.style.display = 'none';
        }
      } else {
        hamburger.style.display = 'none';
        for (const item of menuItems) {
          item.style.display = '';
        }
        closeHamburger();
      }
    },
  };
}
