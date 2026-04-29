import { registerLoadingCommands } from './loading.js';
import { registerDisplayCommands } from './display.js';
import { registerStylingCommands } from './styling.js';
import { registerCameraCommands } from './camera.js';
import { registerSelectionCommands } from './selection.js';
import { registerLabelingCommands } from './labeling.js';
import { registerEditingCommands } from './editing.js';
import { registerExportCommands } from './export.js';
import { registerPresetCommands } from './preset.js';
import { registerGroupingCommands } from './grouping.js';

/**
 * Register all available commands into the given command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 * @param {object} options - Optional command registration configuration.
 */
export function registerAllCommands(registry, options = {}) {
  registerLoadingCommands(registry, options);
  registerDisplayCommands(registry);
  registerStylingCommands(registry);
  registerCameraCommands(registry);
  registerSelectionCommands(registry);
  registerLabelingCommands(registry);
  registerEditingCommands(registry);
  registerExportCommands(registry);
  registerPresetCommands(registry);
  registerGroupingCommands(registry);
}
