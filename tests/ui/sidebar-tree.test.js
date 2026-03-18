import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSidebar } from '../../src/ui/sidebar.js';

vi.mock('../../src/ui/color-swatches.js', () => ({
  CARBON_SWATCHES: [{ label: 'Red', hex: '#FF0000' }],
  SOLID_SWATCHES: [{ label: 'Blue', hex: '#0000FF' }],
  CHAIN_PALETTES: { pastel: { label: 'Pastel', colors: ['#F00'] } },
  SS_PALETTES: [{ key: 'default', helix: '#F00', sheet: '#0F0', loop: '#00F' }],
}));

function makeObject(overrides = {}) {
  return { model: {}, modelIndex: 0, visible: true, representations: new Set(['line']), ...overrides };
}

function makeSelection(overrides = {}) {
  return { expression: 'chain A', spec: { chain: 'A' }, atomCount: 42, visible: true, ...overrides };
}

function makeTreeState({ objects = new Map(), selections = new Map(), entryTree = [] } = {}) {
  return { objects, selections, entryTree };
}

describe('Sidebar tree-based rendering', () => {
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
      onToggleCollapsed: vi.fn(),
      onToggleGroupVisibility: vi.fn(),
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
      onGroupAction: vi.fn(),
      onGroupShow: vi.fn(),
      onGroupHide: vi.fn(),
      onGroupLabel: vi.fn(),
      onGroupColor: vi.fn(),
      onGroupView: vi.fn(),
    };

    sidebar = createSidebar(container, callbacks);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('flat tree rendering', () => {
    it('renders objects from entryTree', () => {
      const objects = new Map([
        ['mol1', makeObject()],
        ['mol2', makeObject()],
      ]);
      const entryTree = [
        { type: 'object', name: 'mol1' },
        { type: 'object', name: 'mol2' },
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const rows = container.querySelectorAll('[data-kind="object"]');
      expect(rows.length).toBe(2);
    });

    it('renders selections from entryTree', () => {
      const selections = new Map([['sele1', makeSelection()]]);
      const entryTree = [{ type: 'selection', name: 'sele1' }];
      sidebar.refresh(makeTreeState({ selections, entryTree }));

      const row = container.querySelector('[data-kind="selection"]');
      expect(row).not.toBeNull();
      const nameEl = row.querySelector('.sidebar-object-name');
      expect(nameEl.textContent).toBe('(sele1)');
    });

    it('adds separator between objects and selections', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const selections = new Map([['sele1', makeSelection()]]);
      const entryTree = [
        { type: 'object', name: 'mol1' },
        { type: 'selection', name: 'sele1' },
      ];
      sidebar.refresh(makeTreeState({ objects, selections, entryTree }));

      const sep = container.querySelector('.sidebar-separator');
      expect(sep).not.toBeNull();
    });

    it('no separator when only objects', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [{ type: 'object', name: 'mol1' }];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      expect(container.querySelector('.sidebar-separator')).toBeNull();
    });
  });

  describe('group rendering', () => {
    it('renders group header with group name', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'myGroup', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const header = container.querySelector('[data-kind="group"]');
      expect(header).not.toBeNull();
      const nameEl = header.querySelector('.sidebar-group-name');
      expect(nameEl.textContent).toBe('myGroup');
    });

    it('renders group children in a container', () => {
      const objects = new Map([
        ['mol1', makeObject()],
        ['mol2', makeObject()],
      ]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
          { type: 'object', name: 'mol2' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const childContainer = container.querySelector('[data-group-children="grp"]');
      expect(childContainer).not.toBeNull();
      const childRows = childContainer.querySelectorAll('[data-kind="object"]');
      expect(childRows.length).toBe(2);
    });

    it('collapsed group has collapsed class on children container', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: true, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const childContainer = container.querySelector('[data-group-children="grp"]');
      expect(childContainer.classList.contains('collapsed')).toBe(true);
    });

    it('expanded group shows ▼ toggle icon', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const toggle = container.querySelector('.sidebar-group-toggle');
      expect(toggle.textContent).toBe('\u25BC');
    });

    it('collapsed group shows ▶ toggle icon', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: true, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const toggle = container.querySelector('.sidebar-group-toggle');
      expect(toggle.textContent).toBe('\u25B6');
    });

    it('clicking group toggle fires onToggleCollapsed', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const toggle = container.querySelector('.sidebar-group-toggle');
      toggle.click();
      expect(callbacks.onToggleCollapsed).toHaveBeenCalledWith('grp');
    });

    it('clicking group name zone fires onToggleGroupVisibility', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const toggleZone = container.querySelector('.sidebar-group-header .sidebar-zone-toggle');
      toggleZone.click();
      expect(callbacks.onToggleGroupVisibility).toHaveBeenCalledWith('grp');
    });

    it('group header has A,S,H,L,C buttons', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const header = container.querySelector('.sidebar-group-header');
      const buttons = header.querySelectorAll('.sidebar-btn');
      const labels = Array.from(buttons).map(b => b.textContent);
      expect(labels).toEqual(['A', 'S', 'H', 'L', 'C']);
    });

    it('group A button opens group action menu', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const header = container.querySelector('.sidebar-group-header');
      const aBtn = header.querySelector('.sidebar-btn');
      aBtn.click();

      const popup = document.querySelector('.popup-menu');
      const items = popup.querySelectorAll('.popup-menu-item');
      const labels = Array.from(items).map(el => el.textContent);
      expect(labels).toContain('Rename...');
      expect(labels).toContain('Delete');
      expect(labels).toContain('Ungroup');
    });

    it('group action menu item fires onGroupAction', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const header = container.querySelector('.sidebar-group-header');
      const aBtn = header.querySelector('.sidebar-btn');
      aBtn.click();

      const popup = document.querySelector('.popup-menu');
      const deleteItem = Array.from(popup.querySelectorAll('.popup-menu-item'))
        .find(el => el.textContent === 'Delete');
      deleteItem.click();
      expect(callbacks.onGroupAction).toHaveBeenCalledWith('grp', 'delete');
    });

    it('nested groups render correctly', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const entryTree = [
        { type: 'group', name: 'outer', collapsed: false, children: [
          { type: 'group', name: 'inner', collapsed: false, children: [
            { type: 'object', name: 'mol1' },
          ]},
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const outerChildren = container.querySelector('[data-group-children="outer"]');
      expect(outerChildren).not.toBeNull();
      const innerHeader = outerChildren.querySelector('[data-kind="group"][data-name="inner"]');
      expect(innerHeader).not.toBeNull();
      const innerChildren = outerChildren.querySelector('[data-group-children="inner"]');
      expect(innerChildren).not.toBeNull();
      const objRow = innerChildren.querySelector('[data-kind="object"]');
      expect(objRow).not.toBeNull();
    });
  });

  describe('hierarchy rendering', () => {
    it('renders hierarchy parent with children container', () => {
      const objects = new Map([
        ['parent', makeObject()],
        ['child1', makeObject()],
      ]);
      const entryTree = [
        { type: 'object', name: 'parent', collapsed: false, children: [
          { type: 'object', name: 'child1' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const parentRow = container.querySelector('[data-kind="object"][data-name="parent"]');
      expect(parentRow).not.toBeNull();

      const childContainer = container.querySelector('[data-hierarchy-children="parent"]');
      expect(childContainer).not.toBeNull();
      expect(childContainer.classList.contains('sidebar-hierarchy-children')).toBe(true);

      const childRow = childContainer.querySelector('[data-kind="object"][data-name="child1"]');
      expect(childRow).not.toBeNull();
    });

    it('hierarchy parent row has toggle icon', () => {
      const objects = new Map([
        ['parent', makeObject()],
        ['child', makeObject()],
      ]);
      const entryTree = [
        { type: 'object', name: 'parent', collapsed: false, children: [
          { type: 'object', name: 'child' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const parentRow = container.querySelector('[data-kind="object"][data-name="parent"]');
      const toggle = parentRow.querySelector('.sidebar-hierarchy-toggle');
      expect(toggle).not.toBeNull();
      expect(toggle.textContent).toBe('[\u2212]');
    });

    it('collapsed hierarchy parent shows [+] icon', () => {
      const objects = new Map([
        ['parent', makeObject()],
        ['child', makeObject()],
      ]);
      const entryTree = [
        { type: 'object', name: 'parent', collapsed: true, children: [
          { type: 'object', name: 'child' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const parentRow = container.querySelector('[data-kind="object"][data-name="parent"]');
      const toggle = parentRow.querySelector('.sidebar-hierarchy-toggle');
      expect(toggle.textContent).toBe('[+]');
    });

    it('collapsed hierarchy hides children container', () => {
      const objects = new Map([
        ['parent', makeObject()],
        ['child', makeObject()],
      ]);
      const entryTree = [
        { type: 'object', name: 'parent', collapsed: true, children: [
          { type: 'object', name: 'child' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const childContainer = container.querySelector('[data-hierarchy-children="parent"]');
      expect(childContainer.classList.contains('collapsed')).toBe(true);
    });

    it('clicking hierarchy toggle fires onToggleCollapsed', () => {
      const objects = new Map([
        ['parent', makeObject()],
        ['child', makeObject()],
      ]);
      const entryTree = [
        { type: 'object', name: 'parent', collapsed: false, children: [
          { type: 'object', name: 'child' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const parentRow = container.querySelector('[data-kind="object"][data-name="parent"]');
      const toggle = parentRow.querySelector('.sidebar-hierarchy-toggle');
      toggle.click();
      expect(callbacks.onToggleCollapsed).toHaveBeenCalledWith('parent');
    });

    it('hierarchy children are independent — each has its own A,S,H,L,C buttons', () => {
      const objects = new Map([
        ['parent', makeObject()],
        ['child', makeObject()],
      ]);
      const entryTree = [
        { type: 'object', name: 'parent', collapsed: false, children: [
          { type: 'object', name: 'child' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const childContainer = container.querySelector('[data-hierarchy-children="parent"]');
      const childRow = childContainer.querySelector('[data-kind="object"]');
      const buttons = childRow.querySelectorAll('.sidebar-btn');
      const labels = Array.from(buttons).map(b => b.textContent);
      expect(labels).toEqual(['A', 'S', 'H', 'L', 'C']);
    });

    it('hierarchy children rows have dimmed state when hidden', () => {
      const objects = new Map([
        ['parent', makeObject()],
        ['child', makeObject({ visible: false })],
      ]);
      const entryTree = [
        { type: 'object', name: 'parent', collapsed: false, children: [
          { type: 'object', name: 'child' },
        ]},
      ];
      sidebar.refresh(makeTreeState({ objects, entryTree }));

      const childContainer = container.querySelector('[data-hierarchy-children="parent"]');
      const childRow = childContainer.querySelector('[data-kind="object"]');
      expect(childRow.classList.contains('dimmed')).toBe(true);
    });
  });

  describe('incremental tree updates', () => {
    it('toggling visibility updates status without full rebuild', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const tree = [{ type: 'object', name: 'mol1' }];
      sidebar.refresh(makeTreeState({ objects, entryTree: tree }));

      const firstRow = container.querySelector('[data-name="mol1"]');
      expect(firstRow).toBeTruthy();

      // Toggle visibility
      objects.set('mol1', makeObject({ visible: false }));
      sidebar.refresh(makeTreeState({ objects, entryTree: tree }));

      const secondRow = container.querySelector('[data-name="mol1"]');
      expect(secondRow).toBe(firstRow); // Same DOM element reused
      expect(secondRow.classList.contains('dimmed')).toBe(true);
    });

    it('adding an entry inserts without destroying existing rows', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const tree = [{ type: 'object', name: 'mol1' }];
      sidebar.refresh(makeTreeState({ objects, entryTree: tree }));

      const firstRow = container.querySelector('[data-name="mol1"]');

      // Add second object
      objects.set('mol2', makeObject());
      tree.push({ type: 'object', name: 'mol2' });
      sidebar.refresh(makeTreeState({ objects, entryTree: tree }));

      expect(container.querySelector('[data-name="mol1"]')).toBe(firstRow);
      expect(container.querySelector('[data-name="mol2"]')).toBeTruthy();
    });

    it('removing an entry removes only that row', () => {
      const objects = new Map([['mol1', makeObject()], ['mol2', makeObject()]]);
      const tree = [{ type: 'object', name: 'mol1' }, { type: 'object', name: 'mol2' }];
      sidebar.refresh(makeTreeState({ objects, entryTree: tree }));

      const mol1Row = container.querySelector('[data-name="mol1"]');

      // Remove mol2
      objects.delete('mol2');
      tree.splice(1, 1);
      sidebar.refresh(makeTreeState({ objects, entryTree: tree }));

      expect(container.querySelector('[data-name="mol1"]')).toBe(mol1Row);
      expect(container.querySelector('[data-name="mol2"]')).toBeNull();
    });

    it('group collapse/expand preserves child DOM elements', () => {
      const objects = new Map([['mol1', makeObject()]]);
      const tree = [{
        type: 'group', name: 'grp1', collapsed: false,
        children: [{ type: 'object', name: 'mol1' }],
      }];
      sidebar.refresh(makeTreeState({ objects, entryTree: tree }));

      const childRow = container.querySelector('[data-name="mol1"]');
      expect(childRow).toBeTruthy();

      // Collapse group
      tree[0].collapsed = true;
      sidebar.refresh(makeTreeState({ objects, entryTree: tree }));

      const childRowAfter = container.querySelector('[data-name="mol1"]');
      expect(childRowAfter).toBe(childRow);
    });
  });

  describe('mixed tree', () => {
    it('renders groups, objects, hierarchies, and selections together', () => {
      const objects = new Map([
        ['mol1', makeObject()],
        ['mol2', makeObject()],
        ['parent', makeObject()],
        ['child', makeObject()],
      ]);
      const selections = new Map([['sele1', makeSelection()]]);
      const entryTree = [
        { type: 'group', name: 'grp', collapsed: false, children: [
          { type: 'object', name: 'mol1' },
          { type: 'object', name: 'mol2' },
        ]},
        { type: 'object', name: 'parent', collapsed: false, children: [
          { type: 'object', name: 'child' },
        ]},
        { type: 'selection', name: 'sele1' },
      ];
      sidebar.refresh(makeTreeState({ objects, selections, entryTree }));

      // Group header
      expect(container.querySelector('[data-kind="group"]')).not.toBeNull();
      // Hierarchy parent
      expect(container.querySelector('[data-hierarchy-children="parent"]')).not.toBeNull();
      // Selection
      expect(container.querySelector('[data-kind="selection"]')).not.toBeNull();
      // Separator between objects and selections
      expect(container.querySelector('.sidebar-separator')).not.toBeNull();
    });
  });
});
