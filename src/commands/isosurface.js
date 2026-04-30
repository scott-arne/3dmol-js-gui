import { getState } from '../state.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';

const ISOSURFACE_USAGE = 'Usage: isosurface name, map, level [,(selection) [,buffer [,carve [,representation]]]]';
const REPRESENTATIONS = new Set(['mesh', 'surface']);

export function splitIsosurfaceArgs(args) {
  const parts = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if ((ch === '"' || ch === "'") && quote === null && current.trim() === '') {
      quote = ch;
    } else if (ch === quote) {
      quote = null;
    } else if (ch === ',' && quote === null) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (quote !== null) {
    throw new Error(ISOSURFACE_USAGE);
  }
  parts.push(current.trim());
  return parts;
}

function parseOptionalFloat(raw, field, defaultValue = null) {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid isosurface ${field} "${raw}"`);
  }
  return value;
}

function normalizeRepresentation(raw = 'mesh') {
  const representation = String(raw || 'mesh').trim().toLowerCase();
  if (!REPRESENTATIONS.has(representation)) {
    throw new Error(`Unknown isosurface representation "${raw}"`);
  }
  return representation;
}

function requireMapService(ctx) {
  if (!ctx.mapService) {
    throw new Error('Map service is unavailable');
  }
  return ctx.mapService;
}

function formatLevel(level) {
  return level > 0 ? `+${level}` : String(level);
}

export function parseIsosurfaceCommand(args) {
  const parts = splitIsosurfaceArgs(args);
  if (parts.length < 2 || parts.length > 7) {
    throw new Error(ISOSURFACE_USAGE);
  }
  if (parts[0] === '' || parts[1] === '') {
    throw new Error(ISOSURFACE_USAGE);
  }
  if ((parts.length > 3 && parts[2] === '') || parts.slice(3).some(part => part === '')) {
    throw new Error(ISOSURFACE_USAGE);
  }

  const [name, mapName, levelRaw, selectionTextRaw, bufferRaw, carveRaw, representationRaw] = parts;
  const level = parseOptionalFloat(levelRaw, 'level', 1);
  const buffer = parseOptionalFloat(bufferRaw, 'buffer', null);
  const carve = parseOptionalFloat(carveRaw, 'carve', null);
  const representation = normalizeRepresentation(representationRaw);
  const selectionText = selectionTextRaw || null;

  return { name, mapName, level, selectionText, buffer, carve, representation };
}

export function registerIsosurfaceCommands(registry) {
  registry.register('isosurface', {
    handler: async (args, ctx) => {
      const parsed = parseIsosurfaceCommand(args);
      const state = getState();
      if (!state.maps.has(parsed.mapName)) {
        throw new Error(`Map "${parsed.mapName}" not found`);
      }

      let selection = null;
      if (parsed.selectionText) {
        selection = getSelSpec(resolveSelection(parsed.selectionText));
      }

      const mapService = requireMapService(ctx);
      await mapService.createIsosurface({
        ...parsed,
        selection,
      });
      ctx.terminal.print(
        `Created ${parsed.representation} isosurface "${parsed.name}" from map "${parsed.mapName}" at ${formatLevel(parsed.level)}`,
        'result',
      );
    },
    usage: ISOSURFACE_USAGE,
    help: 'Create or replace an isosurface from a loaded density map.',
  });
}
