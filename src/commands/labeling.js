import { parseArgs } from './registry.js';
import { resolveSelection } from './resolve-selection.js';
import { getViewer } from '../viewer.js';

/**
 * Valid label property names that can be used with the label command.
 *
 * @type {string[]}
 */
const VALID_PROPS = ['name', 'atom', 'resn', 'resi', 'chain', 'elem', 'index'];

/**
 * Map from user-facing label property names to 3Dmol.js atom property names.
 *
 * @type {Object<string, string>}
 */
const PROP_MAP = {
  name: 'atom',
  atom: 'atom',
  resn: 'resn',
  resi: 'resi',
  chain: 'chain',
  elem: 'elem',
  index: 'serial',
};

/**
 * Register the labeling commands (label, unlabel) into the given command
 * registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerLabelingCommands(registry) {
  registry.register('label', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: label <selection>, <property>');
      }
      const selStr = parts.slice(0, -1).join(', ').trim();
      const property = parts[parts.length - 1].trim().toLowerCase();

      if (!VALID_PROPS.includes(property)) {
        throw new Error(
          `Unknown label property "${property}". Valid: ${VALID_PROPS.join(', ')}`
        );
      }

      const result = resolveSelection(selStr);
      const viewer = getViewer();
      let atoms;
      if (result.spec) {
        atoms = viewer.selectedAtoms(result.spec);
      } else {
        atoms = result.atoms;
      }

      const atomProp = PROP_MAP[property];
      for (const atom of atoms) {
        const text = String(atom[atomProp]);
        viewer.addLabel(text, {
          position: { x: atom.x, y: atom.y, z: atom.z },
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          fontColor: '#FFFFFF',
          fontSize: 10,
        });
      }
      viewer.render();

      ctx.terminal.print(`Added ${atoms.length} labels (${property})`, 'result');
    },
    usage: 'label <selection>, <property>',
    help: 'Add labels to atoms. Properties: name, resn, resi, chain, elem, index.',
  });

  registry.register('unlabel', {
    handler: (args, ctx) => {
      const viewer = getViewer();
      viewer.removeAllLabels();
      viewer.render();
      ctx.terminal.print('All labels removed', 'result');
    },
    usage: 'unlabel',
    help: 'Remove all labels from the viewer.',
  });
}
