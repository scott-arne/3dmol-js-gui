import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMenuBar } from '../../src/ui/menubar.js';

vi.mock('../../src/ui/dialogs.js', () => ({
  showLoadDialog: vi.fn(),
  showExportDialog: vi.fn(),
}));

describe('Menu Bar', () => {
  let container;
  let callbacks;
  let menuBar;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.className = 'menubar';
    document.body.appendChild(container);

    callbacks = {
      onLoad: vi.fn(),
      onExport: vi.fn(),
      onView: vi.fn(),
      onSelect: vi.fn(),
      onExpand: vi.fn(),
      onSelectionAction: vi.fn(),
      onSelectionMode: vi.fn(),
      onToggleSidebar: vi.fn(),
      onToggleTerminal: vi.fn(),
      onToggleCompact: vi.fn(),
      onThemeChange: vi.fn(),
    };

    menuBar = createMenuBar(container, callbacks);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('DOM structure', () => {
    it('creates menubar DOM structure with expected elements', () => {
      // Should have menu items plus a mode picker and a hamburger
      const items = container.querySelectorAll('.menubar-item');
      expect(items.length).toBe(4);
    });

    it('has File, View, Select, Window menu items in order', () => {
      const items = container.querySelectorAll('.menubar-item');
      const labels = Array.from(items).map((el) => el.textContent);
      expect(labels).toEqual(['File', 'View', 'Select', 'Window']);
    });

    it('has a mode picker element', () => {
      const modePicker = container.querySelector('.menubar-mode-picker');
      expect(modePicker).not.toBeNull();
    });

    it('mode picker displays "Atoms" initially', () => {
      const modePicker = container.querySelector('.menubar-mode-picker');
      expect(modePicker.textContent).toContain('Atoms');
    });

    it('has a hamburger element (hidden by default)', () => {
      const hamburger = container.querySelector('.menubar-hamburger');
      expect(hamburger).not.toBeNull();
      expect(hamburger.style.display).toBe('none');
    });

    it('mode picker has a down-arrow indicator', () => {
      const arrow = container.querySelector('.menubar-mode-arrow');
      expect(arrow).not.toBeNull();
      expect(arrow.textContent).toBe('\u25BC');
    });
  });

  describe('return value / public API', () => {
    it('returns object with setSelectionMode, setTheme, setCompact methods', () => {
      expect(typeof menuBar.setSelectionMode).toBe('function');
      expect(typeof menuBar.setTheme).toBe('function');
      expect(typeof menuBar.setCompact).toBe('function');
    });

    it('returns object with getElement method', () => {
      expect(typeof menuBar.getElement).toBe('function');
      expect(menuBar.getElement()).toBe(container);
    });
  });

  describe('setSelectionMode', () => {
    it('updates mode picker label when called with valid mode', () => {
      menuBar.setSelectionMode('residues');
      const modePicker = container.querySelector('.menubar-mode-picker');
      expect(modePicker.textContent).toContain('Residues');
    });

    it('updates to chains', () => {
      menuBar.setSelectionMode('chains');
      const modePicker = container.querySelector('.menubar-mode-picker');
      expect(modePicker.textContent).toContain('Chains');
    });

    it('updates to molecules', () => {
      menuBar.setSelectionMode('molecules');
      const modePicker = container.querySelector('.menubar-mode-picker');
      expect(modePicker.textContent).toContain('Molecules');
    });

    it('ignores invalid mode', () => {
      menuBar.setSelectionMode('invalid');
      const modePicker = container.querySelector('.menubar-mode-picker');
      // Should remain as Atoms (the initial value)
      expect(modePicker.textContent).toContain('Atoms');
    });

    it('updates checked state in mode picker dropdown after programmatic change', () => {
      menuBar.setSelectionMode('chains');

      // Open mode picker dropdown
      const modePicker = container.querySelector('.menubar-mode-picker');
      modePicker.click();

      const checkedItems = modePicker.querySelectorAll('.menubar-dropdown-item.checked');
      expect(checkedItems.length).toBe(1);
      expect(checkedItems[0].textContent).toBe('Chains');
    });
  });

  describe('setTheme', () => {
    it('updates internal theme to light', () => {
      menuBar.setTheme('light');

      // Open Window dropdown to check theme radio state
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const dropdown = windowItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      // Find theme items: Dark and Light
      const darkItem = Array.from(items).find((el) => el.textContent === 'Dark');
      const lightItem = Array.from(items).find((el) => el.textContent === 'Light');

      expect(darkItem.classList.contains('checked')).toBe(false);
      expect(lightItem.classList.contains('checked')).toBe(true);
    });

    it('updates internal theme back to dark', () => {
      menuBar.setTheme('light');
      menuBar.setTheme('dark');

      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const dropdown = windowItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const darkItem = Array.from(items).find((el) => el.textContent === 'Dark');

      expect(darkItem.classList.contains('checked')).toBe(true);
    });

    it('ignores invalid theme value', () => {
      menuBar.setTheme('invalid');

      // Open Window dropdown to confirm dark is still checked
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const dropdown = windowItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const darkItem = Array.from(items).find((el) => el.textContent === 'Dark');

      expect(darkItem.classList.contains('checked')).toBe(true);
    });
  });

  describe('setCompact', () => {
    it('shows hamburger and hides menu items in compact mode', () => {
      menuBar.setCompact(true);

      const hamburger = container.querySelector('.menubar-hamburger');
      expect(hamburger.style.display).toBe('');

      const menuItems = container.querySelectorAll('.menubar-item');
      menuItems.forEach((item) => {
        expect(item.style.display).toBe('none');
      });
    });

    it('hides hamburger and shows menu items in normal mode', () => {
      menuBar.setCompact(true);
      menuBar.setCompact(false);

      const hamburger = container.querySelector('.menubar-hamburger');
      expect(hamburger.style.display).toBe('none');

      const menuItems = container.querySelectorAll('.menubar-item');
      menuItems.forEach((item) => {
        expect(item.style.display).toBe('');
      });
    });
  });

  describe('dropdown interactions', () => {
    it('clicking File opens its dropdown', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      fileItem.click();

      const dropdown = fileItem.querySelector('.menubar-dropdown');
      expect(dropdown).not.toBeNull();
      expect(fileItem.classList.contains('active')).toBe(true);
    });

    it('clicking the same menu item again closes the dropdown', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      fileItem.click();

      expect(fileItem.querySelector('.menubar-dropdown')).not.toBeNull();

      fileItem.click();
      expect(fileItem.querySelector('.menubar-dropdown')).toBeNull();
      expect(fileItem.classList.contains('active')).toBe(false);
    });

    it('clicking a different menu item closes the first and opens the second', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      const viewItem = container.querySelectorAll('.menubar-item')[1];

      fileItem.click();
      expect(fileItem.querySelector('.menubar-dropdown')).not.toBeNull();

      viewItem.click();
      expect(fileItem.querySelector('.menubar-dropdown')).toBeNull();
      expect(fileItem.classList.contains('active')).toBe(false);
      expect(viewItem.querySelector('.menubar-dropdown')).not.toBeNull();
      expect(viewItem.classList.contains('active')).toBe(true);
    });

    it('Escape key closes the dropdown', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      fileItem.click();
      expect(fileItem.querySelector('.menubar-dropdown')).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(fileItem.querySelector('.menubar-dropdown')).toBeNull();
    });

    it('clicking outside the menu closes the dropdown', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      fileItem.click();
      expect(fileItem.querySelector('.menubar-dropdown')).not.toBeNull();

      // Click on document body (outside menu bar)
      document.body.click();
      expect(fileItem.querySelector('.menubar-dropdown')).toBeNull();
    });
  });

  describe('File dropdown', () => {
    it('has Load... and Export Image... items', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      fileItem.click();

      const dropdown = fileItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const labels = Array.from(items).map((el) => el.textContent);

      expect(labels).toContain('Load...');
      expect(labels).toContain('Export Image...');
    });

    it('Load... item fires onLoad callback', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      fileItem.click();

      const dropdown = fileItem.querySelector('.menubar-dropdown');
      const loadItem = Array.from(
        dropdown.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Load...');
      loadItem.click();

      expect(callbacks.onLoad).toHaveBeenCalled();
    });

    it('Export Image... item fires onExport callback', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      fileItem.click();

      const dropdown = fileItem.querySelector('.menubar-dropdown');
      const exportItem = Array.from(
        dropdown.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Export Image...');
      exportItem.click();

      expect(callbacks.onExport).toHaveBeenCalled();
    });

    it('closes dropdown after clicking Load...', () => {
      const fileItem = container.querySelectorAll('.menubar-item')[0];
      fileItem.click();

      const loadItem = Array.from(
        fileItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Load...');
      loadItem.click();

      expect(fileItem.querySelector('.menubar-dropdown')).toBeNull();
    });
  });

  describe('View dropdown', () => {
    it('has Simple, Sites, Ball-and-Stick items', () => {
      const viewItem = container.querySelectorAll('.menubar-item')[1];
      viewItem.click();

      const dropdown = viewItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const labels = Array.from(items).map((el) => el.textContent);

      expect(labels).toContain('Simple');
      expect(labels).toContain('Sites');
      expect(labels).toContain('Ball-and-Stick');
    });

    it('fires onView callback when an item is clicked', () => {
      const viewItem = container.querySelectorAll('.menubar-item')[1];
      viewItem.click();

      const dropdown = viewItem.querySelector('.menubar-dropdown');
      const simpleItem = Array.from(
        dropdown.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Simple');
      simpleItem.click();

      expect(callbacks.onView).toHaveBeenCalledWith('simple');
    });
  });

  describe('Select dropdown', () => {
    it('has Selections section with Protein, Ligand, Backbone, Side Chains', () => {
      const selectItem = container.querySelectorAll('.menubar-item')[2];
      selectItem.click();

      const dropdown = selectItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const labels = Array.from(items).map((el) => el.textContent);

      expect(labels).toContain('Protein');
      expect(labels).toContain('Ligand');
      expect(labels).toContain('Backbone');
      expect(labels).toContain('Side Chains');
    });

    it('has Expand section with Residues, Chains, Molecules, Near Atoms, Near Residues', () => {
      const selectItem = container.querySelectorAll('.menubar-item')[2];
      selectItem.click();

      const dropdown = selectItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const labels = Array.from(items).map((el) => el.textContent);

      expect(labels).toContain('Residues');
      expect(labels).toContain('Chains');
      expect(labels).toContain('Molecules');
    });

    it('has Action section with Center and Zoom', () => {
      const selectItem = container.querySelectorAll('.menubar-item')[2];
      selectItem.click();

      const dropdown = selectItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const labels = Array.from(items).map((el) => el.textContent);

      expect(labels).toContain('Center');
      expect(labels).toContain('Zoom');
    });

    it('has section headers', () => {
      const selectItem = container.querySelectorAll('.menubar-item')[2];
      selectItem.click();

      const dropdown = selectItem.querySelector('.menubar-dropdown');
      const headers = dropdown.querySelectorAll('.menubar-dropdown-section-header');
      const labels = Array.from(headers).map((el) => el.textContent);

      expect(labels).toContain('Selections');
      expect(labels).toContain('Expand');
      expect(labels).toContain('Action');
    });

    it('has separators between sections', () => {
      const selectItem = container.querySelectorAll('.menubar-item')[2];
      selectItem.click();

      const dropdown = selectItem.querySelector('.menubar-dropdown');
      const separators = dropdown.querySelectorAll('.menubar-dropdown-separator');
      expect(separators.length).toBeGreaterThanOrEqual(2);
    });

    it('fires onSelect for selection items', () => {
      const selectItem = container.querySelectorAll('.menubar-item')[2];
      selectItem.click();

      const proteinItem = Array.from(
        selectItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Protein');
      proteinItem.click();

      expect(callbacks.onSelect).toHaveBeenCalledWith('protein');
    });

    it('fires onExpand for expand items', () => {
      const selectItem = container.querySelectorAll('.menubar-item')[2];
      selectItem.click();

      const residuesItem = Array.from(
        selectItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Residues');
      residuesItem.click();

      expect(callbacks.onExpand).toHaveBeenCalledWith('residues');
    });

    it('fires onSelectionAction for action items', () => {
      const selectItem = container.querySelectorAll('.menubar-item')[2];
      selectItem.click();

      const centerItem = Array.from(
        selectItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Center');
      centerItem.click();

      expect(callbacks.onSelectionAction).toHaveBeenCalledWith('center');
    });
  });

  describe('Window dropdown', () => {
    it('has Sidebar and Terminal toggle items (checked by default)', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const dropdown = windowItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const sidebarItem = Array.from(items).find((el) => el.textContent === 'Sidebar');
      const terminalItem = Array.from(items).find((el) => el.textContent === 'Terminal');

      expect(sidebarItem).not.toBeUndefined();
      expect(terminalItem).not.toBeUndefined();
      expect(sidebarItem.classList.contains('checked')).toBe(true);
      expect(terminalItem.classList.contains('checked')).toBe(true);
    });

    it('fires onToggleSidebar when Sidebar is clicked', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const sidebarItem = Array.from(
        windowItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Sidebar');
      sidebarItem.click();

      expect(callbacks.onToggleSidebar).toHaveBeenCalled();
    });

    it('fires onToggleTerminal when Terminal is clicked', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const terminalItem = Array.from(
        windowItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Terminal');
      terminalItem.click();

      expect(callbacks.onToggleTerminal).toHaveBeenCalled();
    });

    it('has Compact Menu toggle (unchecked by default)', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const compactItem = Array.from(
        windowItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Compact Menu');

      expect(compactItem).not.toBeUndefined();
      expect(compactItem.classList.contains('checked')).toBe(false);
    });

    it('fires onToggleCompact when Compact Menu is clicked', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const compactItem = Array.from(
        windowItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Compact Menu');
      compactItem.click();

      expect(callbacks.onToggleCompact).toHaveBeenCalledWith(true);
    });

    it('has Dark and Light theme items', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const dropdown = windowItem.querySelector('.menubar-dropdown');
      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const labels = Array.from(items).map((el) => el.textContent);

      expect(labels).toContain('Dark');
      expect(labels).toContain('Light');
    });

    it('Dark theme is checked by default', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const darkItem = Array.from(
        windowItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Dark');

      expect(darkItem.classList.contains('checked')).toBe(true);
    });

    it('fires onThemeChange when Light is clicked', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const lightItem = Array.from(
        windowItem.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Light');
      lightItem.click();

      expect(callbacks.onThemeChange).toHaveBeenCalledWith('light');
    });

    it('has a Theme section header', () => {
      const windowItem = container.querySelectorAll('.menubar-item')[3];
      windowItem.click();

      const dropdown = windowItem.querySelector('.menubar-dropdown');
      const headers = dropdown.querySelectorAll('.menubar-dropdown-section-header');
      expect(Array.from(headers).some((h) => h.textContent === 'Theme')).toBe(true);
    });
  });

  describe('mode picker dropdown', () => {
    it('clicking mode picker opens a dropdown with all selection modes', () => {
      const modePicker = container.querySelector('.menubar-mode-picker');
      modePicker.click();

      const dropdown = modePicker.querySelector('.menubar-dropdown');
      expect(dropdown).not.toBeNull();

      const items = dropdown.querySelectorAll('.menubar-dropdown-item');
      const labels = Array.from(items).map((el) => el.textContent);
      expect(labels).toEqual(['Atoms', 'Residues', 'Chains', 'Molecules']);
    });

    it('current mode is checked in the mode picker dropdown', () => {
      const modePicker = container.querySelector('.menubar-mode-picker');
      modePicker.click();

      const items = modePicker.querySelectorAll('.menubar-dropdown-item');
      const atomsItem = Array.from(items).find((el) => el.textContent === 'Atoms');
      expect(atomsItem.classList.contains('checked')).toBe(true);
    });

    it('clicking a mode updates the label and fires onSelectionMode', () => {
      const modePicker = container.querySelector('.menubar-mode-picker');
      modePicker.click();

      const residuesItem = Array.from(
        modePicker.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Residues');
      residuesItem.click();

      expect(callbacks.onSelectionMode).toHaveBeenCalledWith('residues');
      expect(modePicker.textContent).toContain('Residues');
    });

    it('clicking mode picker again toggles the dropdown closed', () => {
      const modePicker = container.querySelector('.menubar-mode-picker');
      modePicker.click();
      expect(modePicker.querySelector('.menubar-dropdown')).not.toBeNull();

      modePicker.click();
      expect(modePicker.querySelector('.menubar-dropdown')).toBeNull();
    });

    it('mode dropdown has right-aligned positioning', () => {
      const modePicker = container.querySelector('.menubar-mode-picker');
      modePicker.click();

      const dropdown = modePicker.querySelector('.menubar-dropdown');
      // happy-dom normalizes '0' to '0px' when setting style.right
      expect(dropdown.style.right).toMatch(/^0(px)?$/);
      expect(dropdown.style.left).toBe('auto');
    });
  });

  describe('hamburger menu', () => {
    it('clicking hamburger opens a dropdown with all menu labels', () => {
      menuBar.setCompact(true);

      const hamburger = container.querySelector('.menubar-hamburger');
      hamburger.click();

      const dropdown = hamburger.querySelector('.menubar-hamburger-dropdown');
      expect(dropdown).not.toBeNull();

      const items = dropdown.querySelectorAll('.menubar-hamburger-menu-item');
      const labels = Array.from(items).map(
        (el) => el.querySelector('span').textContent,
      );
      expect(labels).toEqual(['File', 'View', 'Select', 'Window']);
    });

    it('clicking hamburger again closes the dropdown', () => {
      menuBar.setCompact(true);

      const hamburger = container.querySelector('.menubar-hamburger');
      hamburger.click();
      expect(hamburger.querySelector('.menubar-hamburger-dropdown')).not.toBeNull();

      hamburger.click();
      expect(hamburger.querySelector('.menubar-hamburger-dropdown')).toBeNull();
    });

    it('each hamburger item has a submenu', () => {
      menuBar.setCompact(true);

      const hamburger = container.querySelector('.menubar-hamburger');
      hamburger.click();

      const items = hamburger.querySelectorAll('.menubar-hamburger-menu-item');
      items.forEach((item) => {
        const submenu = item.querySelector('.menubar-hamburger-submenu');
        expect(submenu).not.toBeNull();
      });
    });

    it('each hamburger item has an arrow indicator', () => {
      menuBar.setCompact(true);

      const hamburger = container.querySelector('.menubar-hamburger');
      hamburger.click();

      const arrows = hamburger.querySelectorAll('.menubar-hamburger-arrow');
      expect(arrows.length).toBe(4);
    });
  });

  describe('callback safety', () => {
    it('handles missing onLoad callback gracefully', () => {
      const safeCallbacks = { ...callbacks, onLoad: undefined };
      const bar = createMenuBar(document.createElement('div'), safeCallbacks);

      // Should not throw
      expect(bar).toBeDefined();
    });

    it('handles missing onSelectionMode callback gracefully', () => {
      const safeCallbacks = { ...callbacks, onSelectionMode: undefined };
      const newContainer = document.createElement('div');
      document.body.appendChild(newContainer);
      createMenuBar(newContainer, safeCallbacks);

      const modePicker = newContainer.querySelector('.menubar-mode-picker');
      modePicker.click();

      const residuesItem = Array.from(
        modePicker.querySelectorAll('.menubar-dropdown-item'),
      ).find((el) => el.textContent === 'Residues');

      // Should not throw even without the callback
      expect(() => residuesItem.click()).not.toThrow();
    });
  });
});
