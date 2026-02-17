import { fetchPDB, loadModelData } from '../viewer.js';
import { addObject } from '../state.js';

let fetching = false;

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
      if (fetching) {
        throw new Error('A fetch is already in progress. Please wait.');
      }
      fetching = true;
      try {
        ctx.terminal.print(`Fetching PDB ${pdbId}...`, 'info');
        const model = await fetchPDB(pdbId);
        const modelIndex = model.getID ? model.getID() : null;
        const name = addObject(pdbId, model, modelIndex);
        ctx.terminal.print(`Loaded ${pdbId} as "${name}"`, 'result');
      } catch (e) {
        throw new Error(`Failed to fetch ${pdbId}: ${e.message}`);
      } finally {
        fetching = false;
      }
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
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const format = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const model = loadModelData(ev.target.result, format);
            const modelIndex = model.getID ? model.getID() : null;
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const name = addObject(baseName, model, modelIndex);
            ctx.terminal.print(`Loaded "${file.name}" as "${name}"`, 'result');
          } catch (err) {
            ctx.terminal.print(`Error loading file: ${err.message}`, 'error');
          }
        };
        reader.onerror = () => {
          ctx.terminal.print(`Error reading file: ${reader.error?.message || 'unknown error'}`, 'error');
        };
        reader.readAsText(file);
      };
      input.click();
    },
    usage: 'load',
    help: 'Open a file picker to load a local molecular structure file.',
  });
}
