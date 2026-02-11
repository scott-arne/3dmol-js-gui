import { parseArgs } from './registry.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer } from '../viewer.js';
import { getState, notifyStateChange } from '../state.js';
import { applyPreset, PRESET_NAMES, PRESETS } from '../presets.js';

/**
 * Register the preset command into the given command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerPresetCommands(registry) {
  registry.register('preset', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length === 0) {
        throw new Error('Usage: preset <style> [, selection]\nStyles: Simple, Sites, Ball-and-Stick');
      }

      const presetName = parts[0].trim();
      const selStr = parts.slice(1).join(', ') || null;

      let selSpec = {};
      if (selStr) {
        const result = resolveSelection(selStr);
        selSpec = getSelSpec(result);
      }

      const viewer = getViewer();
      const reps = applyPreset(presetName, viewer, selSpec);

      // Update object representation tracking
      const state = getState();
      if (!selStr) {
        for (const [, obj] of state.objects) {
          obj.representations = new Set(reps);
        }
      } else {
        // When scoped to a selection, don't modify object-wide representation sets
      }
      notifyStateChange();

      const label = PRESETS[presetName.toLowerCase()].label;
      ctx.terminal.print(
        `Applied preset "${label}"${selStr ? ` to ${selStr}` : ''}`,
        'result'
      );
    },
    usage: 'preset <style> [, selection]',
    help: 'Apply a preset view. Styles: Simple, Sites, Ball-and-Stick.',
  });
}
