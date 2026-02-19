import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSidebar } from '../../src/ui/sidebar.js';

vi.mock('../../src/ui/color-swatches.js', () => ({
  CARBON_SWATCHES: [{ label: 'Red', hex: '#FF0000' }],
  SOLID_SWATCHES: [{ label: 'Blue', hex: '#0000FF' }],
  CHAIN_PALETTES: { pastel: { label: 'Pastel', colors: ['#F00'] } },
  SS_PALETTES: [{ key: 'default', helix: '#F00', sheet: '#0F0', loop: '#00F' }],
}));

/**
 * Build a mock application state object.
 */
function makeState({ objects = new Map(), selections = new Map() } = {}) {
  return { objects, selections };
}

/**
 * Build a mock object entry as stored in state.objects.
 */
function makeObject(overrides = {}) {
  return { model: {}, modelIndex: 0, visible: true, representations: new Set(['line']), ...overrides };
}

/**
 * Build a mock selection entry as stored in state.selections.
 */
function makeSelection(overrides = {}) {
  return { expression: 'chain A', spec: { chain: 'A' }, atomCount: 42, visible: true, ...overrides };
}

describe('Sidebar', () => {
  let container;
  let callbacks;
  let sidebar;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);

    callbacks = {
      onToggleVisibility: vi.fn(),
      onToggleSelectionVisibility: vi.fn(),
      onAction: vi.fn(),
      onShow: vi.fn(),
      onHide: vi.fn(),
      onLabel: vi.fn(),
      onColor: vi.fn(),
      onView: vi.fn(),
      onSelectionAction: vi.fn(),
      onSelectionShow: vi.fn(),
      onSelectionHide: vi.fn(),
      onSelectionLabel: vi.fn(),
      onSelectionColor: vi.fn(),
      onSelectionView: vi.fn(),
    };

    sidebar = createSidebar(container, callbacks);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('initial DOM structure', () => {
    it('creates sidebar DOM with sidebar class on container', () => {
      expect(container.classList.contains('sidebar')).toBe(true);
    });

    it('returns object with refresh method', () => {
      expect(typeof sidebar.refresh).toBe('function');
    });

    it('returns object with hide and show methods', () => {
      expect(typeof sidebar.hide).toBe('function');
      expect(typeof sidebar.show).toBe('function');
    });

    it('returns object with getElement method', () => {
      expect(typeof sidebar.getElement).toBe('function');
      expect(sidebar.getElement()).toBe(container);
    });

    it('empty state shows no items', () => {
      sidebar.refresh(makeState());
      const rows = container.querySelectorAll('.sidebar-object');
      expect(rows.length).toBe(0);
    });
  });

  describe('hide and show', () => {
    it('hide() adds hidden class to container', () => {
      sidebar.hide();
      expect(container.classList.contains('hidden')).toBe(true);
    });

    it('show() removes hidden class from container', () => {
      sidebar.hide();
      sidebar.show();
      expect(container.classList.contains('hidden')).toBe(false);
    });
  });

  describe('object rendering', () => {
    it('refresh() with objects in state renders object items', () => {
      const objects = new Map([
        ['1UBQ', makeObject()],
        ['1CRN', makeObject()],
      ]);
      sidebar.refresh(makeState({ objects }));

      const rows = container.querySelectorAll('[data-kind="object"]');
      expect(rows.length).toBe(2);
    });

    it('each object row has a status indicator', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const row = container.querySelector('[data-kind="object"]');
      const status = row.querySelector('.sidebar-object-status');
      expect(status).not.toBeNull();
    });

    it('visible object has active status', () => {
      const objects = new Map([['1UBQ', makeObject({ visible: true })]]);
      sidebar.refresh(makeState({ objects }));

      const status = container.querySelector('.sidebar-object-status');
      expect(status.classList.contains('active')).toBe(true);
    });

    it('hidden object has dimmed class and inactive status', () => {
      const objects = new Map([['1UBQ', makeObject({ visible: false })]]);
      sidebar.refresh(makeState({ objects }));

      const row = container.querySelector('[data-kind="object"]');
      expect(row.classList.contains('dimmed')).toBe(true);

      const status = row.querySelector('.sidebar-object-status');
      expect(status.classList.contains('active')).toBe(false);
    });

    it('displays the object name', () => {
      const objects = new Map([['myProtein', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const nameEl = container.querySelector('.sidebar-object-name');
      expect(nameEl.textContent).toBe('myProtein');
    });

    it('has A, S, H, L, C buttons for each object row', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      const labels = Array.from(buttons).map((b) => b.textContent);
      expect(labels).toEqual(['A', 'S', 'H', 'L', 'C']);
    });

    it('sets data-kind="object" and data-name on object rows', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const row = container.querySelector('[data-kind="object"]');
      expect(row.dataset.kind).toBe('object');
      expect(row.dataset.name).toBe('1UBQ');
    });
  });

  describe('object row click behavior', () => {
    it('clicking object row fires onToggleVisibility with object name', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const row = container.querySelector('[data-kind="object"]');
      row.click();

      expect(callbacks.onToggleVisibility).toHaveBeenCalledWith('1UBQ');
    });
  });

  describe('selection rendering', () => {
    it('refresh() with selections renders selection items with parenthesized names', () => {
      const selections = new Map([
        ['sele1', makeSelection()],
      ]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      expect(row).not.toBeNull();
      const nameEl = row.querySelector('.sidebar-object-name');
      expect(nameEl.textContent).toBe('(sele1)');
    });

    it('selection rows have sidebar-selection class', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      expect(row.classList.contains('sidebar-selection')).toBe(true);
    });

    it('visible selection has active status', () => {
      const selections = new Map([['sele1', makeSelection({ visible: true })]]);
      sidebar.refresh(makeState({ selections }));

      const status = container.querySelector('[data-kind="selection"] .sidebar-object-status');
      expect(status.classList.contains('active')).toBe(true);
    });

    it('hidden selection has dimmed class', () => {
      const selections = new Map([['sele1', makeSelection({ visible: false })]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      expect(row.classList.contains('dimmed')).toBe(true);
    });

    it('has A, S, H, L, C buttons for selection rows', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      const buttons = row.querySelectorAll('.sidebar-btn');
      const labels = Array.from(buttons).map((b) => b.textContent);
      expect(labels).toEqual(['A', 'S', 'H', 'L', 'C']);
    });

    it('clicking selection row fires onToggleSelectionVisibility', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      row.click();

      expect(callbacks.onToggleSelectionVisibility).toHaveBeenCalledWith('sele1');
    });

    it('sets data-kind="selection" and data-name on selection rows', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      expect(row.dataset.kind).toBe('selection');
      expect(row.dataset.name).toBe('sele1');
    });
  });

  describe('separator between objects and selections', () => {
    it('adds separator when there are selections', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ objects, selections }));

      const sep = container.querySelector('.sidebar-separator');
      expect(sep).not.toBeNull();
    });

    it('does not add separator when there are no selections', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const sep = container.querySelector('.sidebar-separator');
      expect(sep).toBeNull();
    });

    it('removes separator when selections are cleared', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      const selections = new Map([['sele1', makeSelection()]]);

      sidebar.refresh(makeState({ objects, selections }));
      expect(container.querySelector('.sidebar-separator')).not.toBeNull();

      sidebar.refresh(makeState({ objects }));
      expect(container.querySelector('.sidebar-separator')).toBeNull();
    });
  });

  describe('refresh updates existing rows', () => {
    // NOTE: Object names that start with a digit (e.g. "1UBQ") cause
    // CSS.escape to produce escaped identifiers (e.g. "\31 UBQ") which
    // happy-dom's querySelector does not match against data-* attributes.
    // We use letter-prefixed names here so the update-in-place path is
    // exercised correctly in the test environment.

    it('updates visibility of existing object row without rebuilding', () => {
      const obj = makeObject({ visible: true });
      const objects = new Map([['proteinA', obj]]);

      sidebar.refresh(makeState({ objects }));
      let row = container.querySelector('[data-kind="object"]');
      expect(row.classList.contains('dimmed')).toBe(false);

      // Update visibility and refresh
      obj.visible = false;
      sidebar.refresh(makeState({ objects }));
      row = container.querySelector('[data-kind="object"]');
      expect(row.classList.contains('dimmed')).toBe(true);
    });

    it('updates visibility of existing selection row without rebuilding', () => {
      const sel = makeSelection({ visible: true });
      const selections = new Map([['sele1', sel]]);

      sidebar.refresh(makeState({ selections }));
      let row = container.querySelector('[data-kind="selection"]');
      expect(row.classList.contains('dimmed')).toBe(false);

      sel.visible = false;
      sidebar.refresh(makeState({ selections }));
      row = container.querySelector('[data-kind="selection"]');
      expect(row.classList.contains('dimmed')).toBe(true);
    });

    it('removes stale object rows that no longer exist in state', () => {
      const objects = new Map([
        ['proteinA', makeObject()],
        ['proteinB', makeObject()],
      ]);
      sidebar.refresh(makeState({ objects }));
      expect(container.querySelectorAll('[data-kind="object"]').length).toBe(2);

      // Remove one object
      objects.delete('proteinB');
      sidebar.refresh(makeState({ objects }));
      expect(container.querySelectorAll('[data-kind="object"]').length).toBe(1);
      expect(container.querySelector('[data-name="proteinB"]')).toBeNull();
    });

    it('removes stale selection rows that no longer exist in state', () => {
      const selections = new Map([
        ['sele1', makeSelection()],
        ['sele2', makeSelection()],
      ]);
      sidebar.refresh(makeState({ selections }));
      expect(container.querySelectorAll('[data-kind="selection"]').length).toBe(2);

      selections.delete('sele2');
      sidebar.refresh(makeState({ selections }));
      expect(container.querySelectorAll('[data-kind="selection"]').length).toBe(1);
    });

    it('adds new objects on subsequent refresh calls', () => {
      const objects = new Map([['proteinA', makeObject()]]);
      sidebar.refresh(makeState({ objects }));
      expect(container.querySelectorAll('[data-kind="object"]').length).toBe(1);

      objects.set('proteinB', makeObject());
      sidebar.refresh(makeState({ objects }));
      expect(container.querySelectorAll('[data-kind="object"]').length).toBe(2);
    });
  });

  describe('object button popup menus', () => {
    it('clicking A button opens popup with action items', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const aBtn = container.querySelector('.sidebar-btn');
      expect(aBtn.textContent).toBe('A');
      aBtn.click();

      const popup = document.querySelector('.popup-menu');
      expect(popup).not.toBeNull();

      const items = popup.querySelectorAll('.popup-menu-item');
      const labels = Array.from(items).map((el) => el.textContent);
      expect(labels).toContain('Rename...');
      expect(labels).toContain('Duplicate');
      expect(labels).toContain('Delete');
      expect(labels).toContain('Center');
      expect(labels).toContain('Orient');
      expect(labels).toContain('Zoom');
    });

    it('clicking action popup item fires onAction callback', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const aBtn = container.querySelector('.sidebar-btn');
      aBtn.click();

      const popup = document.querySelector('.popup-menu');
      const centerItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Center');
      centerItem.click();

      expect(callbacks.onAction).toHaveBeenCalledWith('1UBQ', 'center');
    });

    it('clicking S button item fires onShow callback', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      const sBtn = buttons[1]; // S button
      expect(sBtn.textContent).toBe('S');
      sBtn.click();

      const popup = document.querySelector('.popup-menu');
      const cartoonItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Cartoon');
      cartoonItem.click();

      expect(callbacks.onShow).toHaveBeenCalledWith('1UBQ', 'cartoon');
    });

    it('clicking S button view: prefixed item fires onView callback', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      const sBtn = buttons[1];
      sBtn.click();

      const popup = document.querySelector('.popup-menu');
      const simpleItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Simple');
      simpleItem.click();

      expect(callbacks.onView).toHaveBeenCalledWith('1UBQ', 'simple');
    });

    it('clicking H button item fires onHide callback', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      const hBtn = buttons[2]; // H button
      hBtn.click();

      const popup = document.querySelector('.popup-menu');
      const everythingItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Everything');
      everythingItem.click();

      expect(callbacks.onHide).toHaveBeenCalledWith('1UBQ', 'everything');
    });

    it('clicking L button item fires onLabel callback', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      const lBtn = buttons[3]; // L button
      lBtn.click();

      const popup = document.querySelector('.popup-menu');
      const atomItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Atom Name');
      atomItem.click();

      expect(callbacks.onLabel).toHaveBeenCalledWith('1UBQ', 'atom');
    });

    it('clicking C button B-Factor item fires onColor callback', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      const cBtn = buttons[4]; // C button
      cBtn.click();

      const popup = document.querySelector('.popup-menu');
      const bfactorItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'By B-Factor');
      bfactorItem.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('1UBQ', 'bfactor');
    });
  });

  describe('selection button popup menus', () => {
    it('selection A button opens popup with selection-specific actions (no Duplicate, no Orient)', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      const aBtn = row.querySelector('.sidebar-btn');
      expect(aBtn.textContent).toBe('A');
      aBtn.click();

      const popup = document.querySelector('.popup-menu');
      const items = popup.querySelectorAll('.popup-menu-item');
      const labels = Array.from(items).map((el) => el.textContent);
      expect(labels).toContain('Rename...');
      expect(labels).toContain('Delete');
      expect(labels).toContain('Center');
      expect(labels).toContain('Zoom');
      expect(labels).not.toContain('Duplicate');
      expect(labels).not.toContain('Orient');
    });

    it('selection A button action fires onSelectionAction callback', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      const aBtn = row.querySelector('.sidebar-btn');
      aBtn.click();

      const popup = document.querySelector('.popup-menu');
      const deleteItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Delete');
      deleteItem.click();

      expect(callbacks.onSelectionAction).toHaveBeenCalledWith('sele1', 'delete');
    });

    it('selection S button fires onSelectionShow callback', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      const buttons = row.querySelectorAll('.sidebar-btn');
      const sBtn = buttons[1]; // S button
      sBtn.click();

      const popup = document.querySelector('.popup-menu');
      const sticksItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Sticks');
      sticksItem.click();

      expect(callbacks.onSelectionShow).toHaveBeenCalledWith('sele1', 'stick');
    });

    it('selection H button fires onSelectionHide callback', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      const buttons = row.querySelectorAll('.sidebar-btn');
      const hBtn = buttons[2];
      hBtn.click();

      const popup = document.querySelector('.popup-menu');
      const cartoonItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Cartoon');
      cartoonItem.click();

      expect(callbacks.onSelectionHide).toHaveBeenCalledWith('sele1', 'cartoon');
    });

    it('selection L button fires onSelectionLabel callback', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      const buttons = row.querySelectorAll('.sidebar-btn');
      const lBtn = buttons[3];
      lBtn.click();

      const popup = document.querySelector('.popup-menu');
      const chainItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Chain ID');
      chainItem.click();

      expect(callbacks.onSelectionLabel).toHaveBeenCalledWith('sele1', 'chain');
    });

    it('selection C button fires onSelectionColor callback', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      const buttons = row.querySelectorAll('.sidebar-btn');
      const cBtn = buttons[4];
      cBtn.click();

      const popup = document.querySelector('.popup-menu');
      const bfactorItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'By B-Factor');
      bfactorItem.click();

      expect(callbacks.onSelectionColor).toHaveBeenCalledWith('sele1', 'bfactor');
    });

    it('selection S button view: prefixed item fires onSelectionView', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ selections }));

      const row = container.querySelector('[data-kind="selection"]');
      const buttons = row.querySelectorAll('.sidebar-btn');
      const sBtn = buttons[1];
      sBtn.click();

      const popup = document.querySelector('.popup-menu');
      const sitesItem = Array.from(
        popup.querySelectorAll('.popup-menu-item'),
      ).find((el) => el.textContent === 'Sites');
      sitesItem.click();

      expect(callbacks.onSelectionView).toHaveBeenCalledWith('sele1', 'sites');
    });
  });

  describe('popup menu positioning and lifecycle', () => {
    it('popup menu is appended to document body', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const aBtn = container.querySelector('.sidebar-btn');
      aBtn.click();

      const popup = document.body.querySelector('.popup-menu');
      expect(popup).not.toBeNull();
    });

    it('popup menu has position absolute style set', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const aBtn = container.querySelector('.sidebar-btn');
      aBtn.click();

      const popup = document.querySelector('.popup-menu');
      expect(popup.style.position).toBe('absolute');
    });

    it('clicking the same button again closes the popup (toggle)', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const aBtn = container.querySelector('.sidebar-btn');
      aBtn.click();
      expect(document.querySelector('.popup-menu')).not.toBeNull();

      aBtn.click();
      expect(document.querySelector('.popup-menu')).toBeNull();
    });

    it('opening a new popup closes the previous one', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      buttons[0].click(); // Open A popup
      expect(document.querySelectorAll('.popup-menu').length).toBe(1);

      buttons[1].click(); // Open S popup
      expect(document.querySelectorAll('.popup-menu').length).toBe(1);
    });

    it('popup menu has separators between item groups', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const aBtn = container.querySelector('.sidebar-btn');
      aBtn.click();

      const popup = document.querySelector('.popup-menu');
      const separators = popup.querySelectorAll('.popup-menu-separator');
      expect(separators.length).toBeGreaterThan(0);
    });
  });

  describe('color popup submenus', () => {
    it('color popup has submenu items for Solid, By Element, By Chain, By SS', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      const cBtn = buttons[4]; // C button
      cBtn.click();

      const popup = document.querySelector('.popup-menu');
      const hasSubmenus = popup.querySelectorAll('.popup-menu-has-submenu');
      expect(hasSubmenus.length).toBe(4);
    });

    it('solid swatch click fires onColor with hex value', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      buttons[4].click(); // C button

      const popup = document.querySelector('.popup-menu');
      const solidSubmenu = popup.querySelectorAll('.popup-menu-has-submenu')[0];
      const swatchCell = solidSubmenu.querySelector('.swatch-cell');
      swatchCell.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('1UBQ', '#0000FF');
    });

    it('element "Standard" click fires onColor with "element"', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      buttons[4].click();

      const popup = document.querySelector('.popup-menu');
      const elementSubmenu = popup.querySelectorAll('.popup-menu-has-submenu')[1];
      const stdItem = Array.from(
        elementSubmenu.querySelectorAll('.popup-menu-submenu-item'),
      ).find((el) => el.textContent === 'Standard');
      stdItem.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('1UBQ', 'element');
    });

    it('element swatch cell click fires onColor with "element:#hex"', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      buttons[4].click();

      const popup = document.querySelector('.popup-menu');
      const elementSubmenu = popup.querySelectorAll('.popup-menu-has-submenu')[1];
      const swatchCell = elementSubmenu.querySelector('.swatch-cell');
      swatchCell.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('1UBQ', 'element:#FF0000');
    });

    it('chain palette click fires onColor with "chain:<key>"', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      buttons[4].click();

      const popup = document.querySelector('.popup-menu');
      const chainSubmenu = popup.querySelectorAll('.popup-menu-has-submenu')[2];
      const palItem = Array.from(
        chainSubmenu.querySelectorAll('.popup-menu-submenu-item'),
      ).find((el) => el.textContent === 'Pastel');
      palItem.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('1UBQ', 'chain:pastel');
    });

    it('SS palette click fires onColor with "ss:<key>"', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      buttons[4].click();

      const popup = document.querySelector('.popup-menu');
      const ssSubmenu = popup.querySelectorAll('.popup-menu-has-submenu')[3];
      const palItem = ssSubmenu.querySelector('.ss-palette-item');
      palItem.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('1UBQ', 'ss:default');
    });

    it('SS palette items display Helix, Sheet, Loop spans', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      sidebar.refresh(makeState({ objects }));

      const buttons = container.querySelectorAll('.sidebar-btn');
      buttons[4].click();

      const popup = document.querySelector('.popup-menu');
      const ssSubmenu = popup.querySelectorAll('.popup-menu-has-submenu')[3];
      const palItem = ssSubmenu.querySelector('.ss-palette-item');
      const spans = palItem.querySelectorAll('span');

      expect(spans[0].textContent).toBe('Helix');
      expect(spans[1].textContent).toBe('Sheet');
      expect(spans[2].textContent).toBe('Loop');
    });
  });

  describe('mixed objects and selections', () => {
    it('renders both objects and selections with separator between them', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ objects, selections }));

      const objectRows = container.querySelectorAll('[data-kind="object"]');
      const selectionRows = container.querySelectorAll('[data-kind="selection"]');
      const sep = container.querySelector('.sidebar-separator');

      expect(objectRows.length).toBe(1);
      expect(selectionRows.length).toBe(1);
      expect(sep).not.toBeNull();
    });

    it('object rows appear before the separator', () => {
      const objects = new Map([['1UBQ', makeObject()]]);
      const selections = new Map([['sele1', makeSelection()]]);
      sidebar.refresh(makeState({ objects, selections }));

      const children = Array.from(container.children);
      const objIdx = children.findIndex((el) => el.dataset.kind === 'object');
      const sepIdx = children.findIndex((el) => el.classList.contains('sidebar-separator'));
      const selIdx = children.findIndex((el) => el.dataset.kind === 'selection');

      expect(objIdx).toBeLessThan(sepIdx);
      expect(sepIdx).toBeLessThan(selIdx);
    });
  });
});
