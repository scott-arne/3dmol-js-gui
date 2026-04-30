import { getState } from '../state.js';
import { normalizeSurfaceType } from '../surfaces.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';

const SURFACE_USAGE = 'Usage: surface <parent> [, <type>] | surface <name>, <selection> [, <type>]';

function splitSurfaceArgs(args) {
  const raw = args.trim();
  if (!raw) {
    throw new Error(SURFACE_USAGE);
  }
  return raw.includes(',')
    ? raw.split(',').map(part => part.trim())
    : [raw];
}

function requireSurfaceService(ctx) {
  if (!ctx.surfaceService) {
    throw new Error('Surface service is unavailable');
  }
  return ctx.surfaceService;
}

function normalizeCommandSurfaceType(rawType) {
  return normalizeSurfaceType(rawType || 'molecular').type;
}

function isSurfaceTypeToken(rawType) {
  const type = String(rawType || '').trim().toLowerCase();
  return type.length > 0 && !/\s/.test(type);
}

async function createParentSurface(parts, ctx, state) {
  const parentName = parts[0];
  const type = normalizeCommandSurfaceType(parts[1]);
  const surfaceService = requireSurfaceService(ctx);
  const obj = state.objects.get(parentName);

  if (!obj) {
    throw new Error(`"${parentName}" not found`);
  }

  const surfaceName = `${parentName}_surface`;
  await surfaceService.createSurface({
    name: surfaceName,
    selection: { model: obj.model },
    type,
    parentName,
  });
  ctx.terminal.print(`Created ${type} surface "${surfaceName}" for "${parentName}"`, 'result');
}

async function createNamedSurface(parts, ctx) {
  const name = parts[0];
  if (!name || parts.length < 2) {
    throw new Error(SURFACE_USAGE);
  }

  const hasType = parts.length > 2 && isSurfaceTypeToken(parts[parts.length - 1]);
  const type = normalizeCommandSurfaceType(hasType ? parts[parts.length - 1] : undefined);
  const selectionText = (hasType ? parts.slice(1, -1) : parts.slice(1)).join(', ').trim();
  const surfaceService = requireSurfaceService(ctx);
  const result = resolveSelection(selectionText);
  const selection = getSelSpec(result);
  const parentName = surfaceService.findSingleSurfaceParent(selection) || null;

  await surfaceService.createSurface({ name, selection, type, parentName });
  ctx.terminal.print(`Created ${type} surface "${name}"`, 'result');
}

/**
 * Register first-class surface commands into the command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerSurfaceCommands(registry) {
  registry.register('surface', {
    handler: async (args, ctx) => {
      const parts = splitSurfaceArgs(args);
      const state = getState();
      const isParentForm = parts.length === 1 ||
        (parts.length === 2 && state.objects.has(parts[0]));

      if (isParentForm) {
        await createParentSurface(parts, ctx, state);
        return;
      }

      await createNamedSurface(parts, ctx);
    },
    usage: 'surface <parent> [, <type>] | surface <name>, <selection> [, <type>]',
    help: 'Create or replace a molecular or solvent-accessible surface.',
  });
}
