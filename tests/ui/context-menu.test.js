import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createContextMenu } from '../../src/ui/context-menu.js';

vi.mock('../../src/ui/color-swatches.js', () => ({
  CARBON_SWATCHES: [{ label: 'Red', hex: '#FF0000' }],
  SOLID_SWATCHES: [{ label: 'Blue', hex: '#0000FF' }],
  CHAIN_PALETTES: { pastel: { label: 'Pastel', colors: ['#F00'] } },
  SS_PALETTES: [{ key: 'default', helix: '#F00', sheet: '#0F0', loop: '#00F' }],
}));

/**
 * Simulate a quick right-click: mousedown then immediate mouseup at the same
 * position. Because the implementation uses Date.now() for timing, this must
 * execute within the 300 ms threshold.
 */
function quickRightClick(container, x = 100, y = 100) {
  container.dispatchEvent(
    new MouseEvent('mousedown', { button: 2, clientX: x, clientY: y, bubbles: true }),
  );
  container.dispatchEvent(
    new MouseEvent('mouseup', { button: 2, clientX: x, clientY: y, bubbles: true }),
  );
}

/**
 * Simulate a right-click that is held for longer than the HOLD_THRESHOLD
 * (300 ms). We achieve this by stubbing Date.now() so the elapsed time
 * exceeds the threshold without actually waiting.
 */
function slowRightClick(container, x = 100, y = 100) {
  const originalNow = Date.now;
  let callCount = 0;
  // First call returns a base time; second call returns base + 400 ms
  vi.spyOn(Date, 'now').mockImplementation(() => {
    callCount++;
    return callCount === 1 ? 1000 : 1400;
  });

  container.dispatchEvent(
    new MouseEvent('mousedown', { button: 2, clientX: x, clientY: y, bubbles: true }),
  );
  container.dispatchEvent(
    new MouseEvent('mouseup', { button: 2, clientX: x, clientY: y, bubbles: true }),
  );

  Date.now.mockRestore();
}

/**
 * Simulate a right-click with significant mouse movement (> 4 px).
 */
function draggedRightClick(container) {
  container.dispatchEvent(
    new MouseEvent('mousedown', { button: 2, clientX: 100, clientY: 100, bubbles: true }),
  );
  container.dispatchEvent(
    new MouseEvent('mouseup', { button: 2, clientX: 110, clientY: 110, bubbles: true }),
  );
}

describe('Context Menu', () => {
  let container;
  let callbacks;

  beforeEach(() => {
    // Clean DOM
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);

    callbacks = {
      hasSelection: vi.fn(() => true),
      onAction: vi.fn(),
      onShow: vi.fn(),
      onHide: vi.fn(),
      onLabel: vi.fn(),
      onColor: vi.fn(),
      onView: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('creates context menu without errors', () => {
    expect(() => createContextMenu(container, callbacks)).not.toThrow();
  });

  it('prevents default on contextmenu event', () => {
    createContextMenu(container, callbacks);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    container.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('opens custom menu on quick right-click', () => {
    createContextMenu(container, callbacks);
    quickRightClick(container);

    const menu = document.querySelector('.context-menu');
    expect(menu).not.toBeNull();
    expect(menu).toBeInstanceOf(HTMLElement);
  });

  it('does NOT open menu on slow right-click (> 300 ms hold)', () => {
    createContextMenu(container, callbacks);
    slowRightClick(container);

    const menu = document.querySelector('.context-menu');
    expect(menu).toBeNull();
  });

  it('does NOT open menu on dragged right-click (> 4 px movement)', () => {
    createContextMenu(container, callbacks);
    draggedRightClick(container);

    const menu = document.querySelector('.context-menu');
    expect(menu).toBeNull();
  });

  it('does NOT open menu when button is not right-click', () => {
    createContextMenu(container, callbacks);

    // Left click (button === 0) should not trigger anything
    container.dispatchEvent(
      new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100, bubbles: true }),
    );
    container.dispatchEvent(
      new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100, bubbles: true }),
    );

    const menu = document.querySelector('.context-menu');
    expect(menu).toBeNull();
  });

  it('ignores mouseup without preceding mousedown', () => {
    createContextMenu(container, callbacks);

    // Fire mouseup without mousedown first
    container.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: 100, clientY: 100, bubbles: true }),
    );

    const menu = document.querySelector('.context-menu');
    expect(menu).toBeNull();
  });

  it('has 5 top-level items (Action, Show, Hide, Label, Color)', () => {
    createContextMenu(container, callbacks);
    quickRightClick(container);

    const menu = document.querySelector('.context-menu');
    const items = menu.querySelectorAll(':scope > .context-menu-item');
    expect(items.length).toBe(5);

    const labels = Array.from(items).map(
      (item) => item.querySelector('span').textContent,
    );
    expect(labels).toEqual(['Action', 'Show', 'Hide', 'Label', 'Color']);
  });

  it('items have disabled class when hasSelection returns false', () => {
    callbacks.hasSelection.mockReturnValue(false);
    createContextMenu(container, callbacks);
    quickRightClick(container);

    const items = document.querySelectorAll('.context-menu-item');
    items.forEach((item) => {
      expect(item.classList.contains('disabled')).toBe(true);
    });
  });

  it('items do NOT have disabled class when hasSelection returns true', () => {
    callbacks.hasSelection.mockReturnValue(true);
    createContextMenu(container, callbacks);
    quickRightClick(container);

    const items = document.querySelectorAll('.context-menu-item');
    items.forEach((item) => {
      expect(item.classList.contains('disabled')).toBe(false);
    });
  });

  it('each top-level item has a submenu', () => {
    createContextMenu(container, callbacks);
    quickRightClick(container);

    const items = document.querySelectorAll('.context-menu-item');
    items.forEach((item) => {
      const submenu = item.querySelector('.context-menu-submenu');
      expect(submenu).not.toBeNull();
    });
  });

  it('each top-level item has a right-arrow indicator', () => {
    createContextMenu(container, callbacks);
    quickRightClick(container);

    const items = document.querySelectorAll('.context-menu-item');
    items.forEach((item) => {
      const arrow = item.querySelector('.context-menu-arrow');
      expect(arrow).not.toBeNull();
      expect(arrow.textContent).toBe('\u25B6');
    });
  });

  it('closes the menu on Escape key press', () => {
    createContextMenu(container, callbacks);
    quickRightClick(container);

    expect(document.querySelector('.context-menu')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it('closes the menu on outside click (via requestAnimationFrame)', async () => {
    createContextMenu(container, callbacks);
    quickRightClick(container);

    expect(document.querySelector('.context-menu')).not.toBeNull();

    // The outside-click handler is deferred via requestAnimationFrame.
    // Wait for the rAF callback to register the listener, then click outside.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it('closes the previous menu when a new right-click occurs', () => {
    createContextMenu(container, callbacks);
    quickRightClick(container, 100, 100);

    const firstMenu = document.querySelector('.context-menu');
    expect(firstMenu).not.toBeNull();

    quickRightClick(container, 150, 150);

    // The first menu should be removed
    expect(document.body.contains(firstMenu)).toBe(false);
    // A new menu should exist
    const newMenu = document.querySelector('.context-menu');
    expect(newMenu).not.toBeNull();
    expect(newMenu).not.toBe(firstMenu);
  });

  describe('Action submenu', () => {
    it('has Center and Zoom items', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const actionItem = document.querySelectorAll('.context-menu-item')[0];
      const submenuItems = actionItem.querySelectorAll('.context-menu-submenu-item');
      const labels = Array.from(submenuItems).map((el) => el.textContent);
      expect(labels).toContain('Center');
      expect(labels).toContain('Zoom');
    });

    it('fires onAction callback with "center" when Center is clicked', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const actionItem = document.querySelectorAll('.context-menu-item')[0];
      const centerItem = Array.from(
        actionItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Center');
      centerItem.click();

      expect(callbacks.onAction).toHaveBeenCalledWith('center');
    });

    it('fires onAction callback with "zoom" when Zoom is clicked', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const actionItem = document.querySelectorAll('.context-menu-item')[0];
      const zoomItem = Array.from(
        actionItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Zoom');
      zoomItem.click();

      expect(callbacks.onAction).toHaveBeenCalledWith('zoom');
    });

    it('closes menu after submenu item click', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const actionItem = document.querySelectorAll('.context-menu-item')[0];
      const centerItem = Array.from(
        actionItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Center');
      centerItem.click();

      expect(document.querySelector('.context-menu')).toBeNull();
    });
  });

  describe('Show submenu', () => {
    it('contains representation items (Cartoon, Sticks, Lines, etc.)', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const showItem = document.querySelectorAll('.context-menu-item')[1];
      const submenuItems = showItem.querySelectorAll('.context-menu-submenu-item');
      const labels = Array.from(submenuItems).map((el) => el.textContent);
      expect(labels).toContain('Cartoon');
      expect(labels).toContain('Sticks');
      expect(labels).toContain('Lines');
      expect(labels).toContain('Spheres');
      expect(labels).toContain('Surface');
      expect(labels).toContain('Cross');
    });

    it('fires onShow with the representation value', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const showItem = document.querySelectorAll('.context-menu-item')[1];
      const cartoonItem = Array.from(
        showItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Cartoon');
      cartoonItem.click();

      expect(callbacks.onShow).toHaveBeenCalledWith('cartoon');
    });

    it('fires onView for view: prefixed items (Simple, Sites, Ball-and-Stick)', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const showItem = document.querySelectorAll('.context-menu-item')[1];
      const simpleItem = Array.from(
        showItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Simple');
      simpleItem.click();

      expect(callbacks.onView).toHaveBeenCalledWith('simple');
    });

    it('has separators between representation and view items', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const showItem = document.querySelectorAll('.context-menu-item')[1];
      const separators = showItem.querySelectorAll('.context-menu-separator');
      expect(separators.length).toBeGreaterThan(0);
    });
  });

  describe('Hide submenu', () => {
    it('fires onHide callback with representation value', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const hideItem = document.querySelectorAll('.context-menu-item')[2];
      const everythingItem = Array.from(
        hideItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Everything');
      everythingItem.click();

      expect(callbacks.onHide).toHaveBeenCalledWith('everything');
    });

    it('contains all expected hide options', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const hideItem = document.querySelectorAll('.context-menu-item')[2];
      const submenuItems = hideItem.querySelectorAll('.context-menu-submenu-item');
      const labels = Array.from(submenuItems).map((el) => el.textContent);
      expect(labels).toContain('Everything');
      expect(labels).toContain('Cartoon');
      expect(labels).toContain('Sticks');
      expect(labels).toContain('Lines');
      expect(labels).toContain('Spheres');
      expect(labels).toContain('Surface');
      expect(labels).toContain('Cross');
    });
  });

  describe('Label submenu', () => {
    it('fires onLabel with the label property value', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const labelItem = document.querySelectorAll('.context-menu-item')[3];
      const atomItem = Array.from(
        labelItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Atom Name');
      atomItem.click();

      expect(callbacks.onLabel).toHaveBeenCalledWith('atom');
    });

    it('contains all label options including Clear', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const labelItem = document.querySelectorAll('.context-menu-item')[3];
      const submenuItems = labelItem.querySelectorAll('.context-menu-submenu-item');
      const labels = Array.from(submenuItems).map((el) => el.textContent);
      expect(labels).toContain('Atom Name');
      expect(labels).toContain('Residue Name');
      expect(labels).toContain('Chain ID');
      expect(labels).toContain('Element');
      expect(labels).toContain('Index');
      expect(labels).toContain('Clear');
    });
  });

  describe('Color submenu', () => {
    it('has nested submenu items for Solid, By Element, By Chain, By SS', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const hasSubmenus = colorItem.querySelectorAll('.context-menu-has-submenu');
      expect(hasSubmenus.length).toBe(4); // Solid, By Element, By Chain, By SS
    });

    it('has a plain submenu item for By B-Factor', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const bfactorItem = Array.from(
        colorItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'By B-Factor');
      expect(bfactorItem).not.toBeUndefined();
    });

    it('fires onColor with "bfactor" for By B-Factor item', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const bfactorItem = Array.from(
        colorItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'By B-Factor');
      bfactorItem.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('bfactor');
    });

    it('solid swatch click fires onColor with hex value', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const solidSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[0];
      const swatchCell = solidSubmenu.querySelector('.swatch-cell');
      expect(swatchCell).not.toBeNull();
      swatchCell.click();

      // SOLID_SWATCHES mock has [{ label: 'Blue', hex: '#0000FF' }]
      expect(callbacks.onColor).toHaveBeenCalledWith('#0000FF');
    });

    it('element swatch "Standard" click fires onColor with "element"', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const elementSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[1];
      const stdItem = Array.from(
        elementSubmenu.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Standard');
      expect(stdItem).not.toBeUndefined();
      stdItem.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('element');
    });

    it('element swatch cell click fires onColor with "element:#hex"', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const elementSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[1];
      const swatchCell = elementSubmenu.querySelector('.swatch-cell');
      expect(swatchCell).not.toBeNull();
      swatchCell.click();

      // CARBON_SWATCHES mock has [{ label: 'Red', hex: '#FF0000' }]
      expect(callbacks.onColor).toHaveBeenCalledWith('element:#FF0000');
    });

    it('chain palette click fires onColor with "chain:<key>"', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const chainSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[2];
      const palItem = Array.from(
        chainSubmenu.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Pastel');
      expect(palItem).not.toBeUndefined();
      palItem.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('chain:pastel');
    });

    it('SS palette click fires onColor with "ss:<key>"', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const ssSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[3];
      const palItem = ssSubmenu.querySelector('.ss-palette-item');
      expect(palItem).not.toBeNull();
      palItem.click();

      expect(callbacks.onColor).toHaveBeenCalledWith('ss:default');
    });

    it('SS palette items display Helix, Sheet, Loop spans with colors', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const ssSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[3];
      const palItem = ssSubmenu.querySelector('.ss-palette-item');
      const spans = palItem.querySelectorAll('span');

      expect(spans[0].textContent).toBe('Helix');
      expect(spans[1].textContent).toBe('Sheet');
      expect(spans[2].textContent).toBe('Loop');
    });
  });

  describe('disabled state suppresses callbacks', () => {
    it('does not fire callback when submenu item is clicked with no selection', () => {
      callbacks.hasSelection.mockReturnValue(false);
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const actionItem = document.querySelectorAll('.context-menu-item')[0];
      const centerItem = Array.from(
        actionItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Center');
      centerItem.click();

      expect(callbacks.onAction).not.toHaveBeenCalled();
    });

    it('does not fire solid swatch callback with no selection', () => {
      callbacks.hasSelection.mockReturnValue(false);
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const solidSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[0];
      const swatchCell = solidSubmenu.querySelector('.swatch-cell');
      swatchCell.click();

      expect(callbacks.onColor).not.toHaveBeenCalled();
    });

    it('does not fire element Standard callback with no selection', () => {
      callbacks.hasSelection.mockReturnValue(false);
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const elementSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[1];
      const stdItem = Array.from(
        elementSubmenu.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Standard');
      stdItem.click();

      expect(callbacks.onColor).not.toHaveBeenCalled();
    });

    it('does not fire element swatch callback with no selection', () => {
      callbacks.hasSelection.mockReturnValue(false);
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const elementSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[1];
      const swatchCell = elementSubmenu.querySelector('.swatch-cell');
      swatchCell.click();

      expect(callbacks.onColor).not.toHaveBeenCalled();
    });

    it('does not fire chain palette callback with no selection', () => {
      callbacks.hasSelection.mockReturnValue(false);
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const chainSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[2];
      const palItem = Array.from(
        chainSubmenu.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Pastel');
      palItem.click();

      expect(callbacks.onColor).not.toHaveBeenCalled();
    });

    it('does not fire SS palette callback with no selection', () => {
      callbacks.hasSelection.mockReturnValue(false);
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const colorItem = document.querySelectorAll('.context-menu-item')[4];
      const ssSubmenu = colorItem.querySelectorAll('.context-menu-has-submenu')[3];
      const palItem = ssSubmenu.querySelector('.ss-palette-item');
      palItem.click();

      expect(callbacks.onColor).not.toHaveBeenCalled();
    });

    it('does not fire onView for view: items with no selection', () => {
      callbacks.hasSelection.mockReturnValue(false);
      createContextMenu(container, callbacks);
      quickRightClick(container);

      const showItem = document.querySelectorAll('.context-menu-item')[1];
      const simpleItem = Array.from(
        showItem.querySelectorAll('.context-menu-submenu-item'),
      ).find((el) => el.textContent === 'Simple');
      simpleItem.click();

      expect(callbacks.onView).not.toHaveBeenCalled();
      expect(callbacks.onShow).not.toHaveBeenCalled();
    });
  });

  describe('menu positioning', () => {
    it('sets top and left style on the menu element', () => {
      createContextMenu(container, callbacks);
      quickRightClick(container, 50, 50);

      const menu = document.querySelector('.context-menu');
      expect(menu.style.top).toBeTruthy();
      expect(menu.style.left).toBeTruthy();
    });
  });
});
