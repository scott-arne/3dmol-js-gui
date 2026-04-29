import { loadStructure, loadStructureFile } from '../loading/structure-loader.js';

/**
 * Register the loading commands (fetch, load) into the given command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerLoadingCommands(registry) {
  registry.register('fetch', {
    handler: async (args, ctx) => {
      const pdbId = args.trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(pdbId)) {
        throw new Error('Usage: fetch <pdb_id> (must be a 4-character PDB ID)');
      }
      ctx.terminal.print(`Fetching PDB ${pdbId}...`, 'info');
      const result = await loadStructure({ kind: 'pdb', pdbId });
      if (!result.ok) {
        throw new Error(result.message);
      }
      ctx.terminal.print(result.message, 'result');
    },
    usage: 'fetch <pdb_id>',
    help: 'Fetch a structure from the RCSB PDB by ID.',
  });

  registry.register('load', {
    handler: (args, ctx) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      input.accept = '.pdb,.sdf,.mol2,.xyz,.cube,.pqr,.gro,.cif,.mmcif';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        const result = await loadStructureFile(file);
        if (!result.ok) {
          ctx.terminal.print(result.message, 'error');
          return;
        }
        ctx.terminal.print(result.message, 'result');
      };
      input.click();
    },
    usage: 'load',
    help: 'Open a file picker to load a local molecular structure file.',
  });
}
