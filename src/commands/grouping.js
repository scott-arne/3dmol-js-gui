import { parseArgs } from './registry.js';
import { addGroup, ungroupGroup, reparentEntry, unparentEntry } from '../state.js';

/**
 * Register the grouping and hierarchy commands into the given command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerGroupingCommands(registry) {
  registry.register('group', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: group <group_name>, <entry1> [, entry2, ...]');
      }
      const groupName = parts[0].trim();
      const memberNames = parts.slice(1).map(s => s.trim());

      addGroup(groupName, memberNames);
      ctx.terminal.print(`Created group "${groupName}" with ${memberNames.length} entries`, 'result');
    },
    usage: 'group <group_name>, <entry1> [, entry2, ...]',
    help: 'Create a named group containing the specified entries.',
  });

  registry.register('ungroup', {
    handler: (args, ctx) => {
      const name = args.trim();
      if (!name) {
        throw new Error('Usage: ungroup <group_name>');
      }

      ungroupGroup(name);
      ctx.terminal.print(`Ungrouped "${name}"`, 'result');
    },
    usage: 'ungroup <group_name>',
    help: 'Dissolve a group, promoting its contents to the parent level.',
  });

  registry.register('reparent', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: reparent <child>, <parent>');
      }
      const childName = parts[0].trim();
      const parentName = parts[1].trim();

      reparentEntry(childName, parentName);
      ctx.terminal.print(`Reparented "${childName}" under "${parentName}"`, 'result');
    },
    usage: 'reparent <child>, <parent>',
    help: 'Move an entry to become a child of a parent object (hierarchy).',
  });

  registry.register('unparent', {
    handler: (args, ctx) => {
      const name = args.trim();
      if (!name) {
        throw new Error('Usage: unparent <child_name>');
      }

      unparentEntry(name);
      ctx.terminal.print(`Unparented "${name}"`, 'result');
    },
    usage: 'unparent <child_name>',
    help: 'Remove an entry from its parent hierarchy and move it to the top level.',
  });
}
