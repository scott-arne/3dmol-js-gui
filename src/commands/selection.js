import { parseArgs } from './registry.js';
import { resolveSelection } from './resolve-selection.js';
import { getViewer } from '../viewer.js';
import { getState, addSelection } from '../state.js';
import { parse } from '../parser/selection.pegjs';
import { evaluate } from '../parser/evaluator.js';

/**
 * Register the selection commands (select, count_atoms, get_model) into the
 * given command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerSelectionCommands(registry) {
  registry.register('select', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: select <name>, <expression>');
      }
      const name = parts[0].trim();
      const expression = parts.slice(1).join(', ').trim();

      // Validate the expression parses correctly
      let ast;
      try {
        ast = parse(expression);
      } catch (err) {
        throw new Error(`Invalid selection expression: ${err.message}`);
      }

      // Count matching atoms
      const allAtoms = getViewer().selectedAtoms({});
      const matched = evaluate(ast, allAtoms);

      // Store the selection with its spec and atom count
      const spec = { index: matched.map(a => a.index) };
      addSelection(name, expression, spec, matched.length);

      ctx.terminal.print(`Selection "${name}" defined: ${matched.length} atoms`, 'result');
    },
    usage: 'select <name>, <expression>',
    help: 'Define a named selection for use in other commands.',
  });

  registry.register('count_atoms', {
    handler: (args, ctx) => {
      const selStr = args.trim() || 'all';
      const result = resolveSelection(selStr);

      let count;
      if (result.spec) {
        count = getViewer().selectedAtoms(result.spec).length;
      } else {
        count = result.atoms.length;
      }

      ctx.terminal.print(`Count: ${count} atoms`, 'result');
    },
    usage: 'count_atoms [selection]',
    help: 'Count the number of atoms matching the selection.',
  });

  registry.register('get_model', {
    handler: (args, ctx) => {
      const selStr = args.trim() || 'all';
      const result = resolveSelection(selStr);

      let atoms;
      if (result.spec) {
        atoms = getViewer().selectedAtoms(result.spec);
      } else {
        atoms = result.atoms;
      }

      // Gather summary
      const chains = new Set(atoms.map((a) => a.chain));
      const residues = new Set(atoms.map((a) => `${a.chain}:${a.resi}`));

      // Find objects containing selected atoms by checking model membership
      const objectNames = new Set();
      const state = getState();
      for (const [name, obj] of state.objects) {
        const modelAtoms = getViewer().selectedAtoms({ model: obj.model });
        const modelSerials = new Set(modelAtoms.map((a) => a.serial));
        if (atoms.some((a) => modelSerials.has(a.serial))) {
          objectNames.add(name);
        }
      }

      ctx.terminal.print(`Atoms: ${atoms.length}`, 'result');
      ctx.terminal.print(`Residues: ${residues.size}`, 'result');
      ctx.terminal.print(`Chains: ${chains.size} (${[...chains].join(', ')})`, 'result');
      ctx.terminal.print(`Objects: ${objectNames.size} (${[...objectNames].join(', ')})`, 'result');
    },
    usage: 'get_model [selection]',
    help: 'Print summary info about the selection: atoms, residues, chains, objects.',
  });
}
