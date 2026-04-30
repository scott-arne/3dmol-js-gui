import { loadStructure, loadStructureFile } from '../loading/structure-loader.js';
import {
  normalizeRemoteLoadingConfig,
  resolveArbitraryUrlRequest,
  resolveConfiguredSourceRequest,
} from '../loading/remote-loading.js';
import { parseArgs } from './registry.js';

const LOAD_URL_USAGE = 'Usage: load_url <name>, <format>, <url>';

function parseLoadUrlArgs(args) {
  const firstComma = args.indexOf(',');
  if (firstComma === -1) {
    throw new Error(LOAD_URL_USAGE);
  }

  const secondComma = args.indexOf(',', firstComma + 1);
  if (secondComma === -1) {
    throw new Error(LOAD_URL_USAGE);
  }

  const name = args.slice(0, firstComma).trim();
  const format = args.slice(firstComma + 1, secondComma).trim();
  const url = args.slice(secondComma + 1).trim();
  if (!name || !format || !url) {
    throw new Error(LOAD_URL_USAGE);
  }

  return { name, format, url };
}

/**
 * Register the loading commands (fetch, load) into the given command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 * @param {object} options - Optional command registration configuration.
 */
export function registerLoadingCommands(registry, options = {}) {
  const remoteLoading = normalizeRemoteLoadingConfig(options.remoteLoading);

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
      input.accept = '.pdb,.sdf,.mol2,.xyz,.cube,.pqr,.gro,.cif,.mmcif,.ccp4,.map,.mrc';
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

  registry.register('load_remote', {
    handler: async (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: load_remote <source>, <path> [, name] [, format]');
      }

      const { request, source } = resolveConfiguredSourceRequest(remoteLoading, {
        sourceId: parts[0],
        path: parts[1],
        name: parts[2],
        format: parts[3],
      });

      ctx.terminal.print(`Loading "${request.name}" from ${source.name}...`, 'info');
      const result = await loadStructure(request);
      if (!result.ok) {
        throw new Error(result.message);
      }
      ctx.terminal.print(result.message, 'result');
    },
    usage: 'load_remote <source>, <path> [, name] [, format]',
    help: 'Load a remote structure from a configured source.',
  });

  registry.register('load_url', {
    handler: async (args, ctx) => {
      const { name, format, url } = parseLoadUrlArgs(args);

      const { request } = resolveArbitraryUrlRequest(remoteLoading, {
        name,
        format,
        url,
      });

      ctx.terminal.print(`Loading "${request.name}" from URL...`, 'info');
      const result = await loadStructure(request);
      if (!result.ok) {
        throw new Error(result.message);
      }
      ctx.terminal.print(result.message, 'result');
    },
    usage: 'load_url <name>, <format>, <url>',
    help: 'Load a remote structure from a direct URL when enabled.',
  });
}
