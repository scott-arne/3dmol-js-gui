import { parseArgs } from './registry.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer, orientView, scheduleRender } from '../viewer.js';

/**
 * Register the camera commands (zoom, center, orient, rotate, translate, clip,
 * reset) into the given command registry.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerCameraCommands(registry) {
  registry.register('zoom', {
    handler: (args, ctx) => {
      const viewer = getViewer();
      if (args.trim()) {
        const result = resolveSelection(args.trim());
        const selSpec = getSelSpec(result);
        viewer.zoomTo(selSpec);
      } else {
        viewer.zoomTo();
      }
      scheduleRender();
      ctx.terminal.print('Zoomed to selection', 'result');
    },
    usage: 'zoom [selection]',
    help: 'Zoom to fit the selection (or all atoms if none specified).',
  });

  registry.register('center', {
    handler: (args, ctx) => {
      const viewer = getViewer();
      if (args.trim()) {
        const result = resolveSelection(args.trim());
        const selSpec = getSelSpec(result);
        viewer.center(selSpec);
      } else {
        viewer.center();
      }
      scheduleRender();
      ctx.terminal.print('Centered on selection', 'result');
    },
    usage: 'center [selection]',
    help: 'Center the view on the selection.',
  });

  registry.register('orient', {
    handler: (args, ctx) => {
      if (args.trim()) {
        const result = resolveSelection(args.trim());
        const selSpec = getSelSpec(result);
        orientView(selSpec);
      } else {
        orientView();
      }
      ctx.terminal.print('Oriented to selection', 'result');
    },
    usage: 'orient [selection]',
    help: 'Align the longest dimension of the molecule with the x-axis, second-longest with y, shortest with z, then zoom to fit.',
  });

  registry.register('rotate', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: rotate <axis>, <angle>');
      }
      const axis = parts[0].trim().toLowerCase();
      if (!['x', 'y', 'z'].includes(axis)) {
        throw new Error('Axis must be x, y, or z');
      }
      const angle = parseFloat(parts[1]);
      if (isNaN(angle)) {
        throw new Error('Angle must be a number');
      }
      const viewer = getViewer();
      viewer.rotate(angle, axis);
      scheduleRender();
      ctx.terminal.print(`Rotated ${angle}\u00B0 around ${axis} axis`, 'result');
    },
    usage: 'rotate <axis>, <angle>',
    help: 'Rotate the view. Axis: x, y, or z. Angle in degrees.',
  });

  registry.register('translate', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: translate <x>, <y>');
      }
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (isNaN(x) || isNaN(y)) {
        throw new Error('x and y must be numbers');
      }
      const viewer = getViewer();
      viewer.translate(x, y);
      scheduleRender();
      ctx.terminal.print(`Translated by (${x}, ${y})`, 'result');
    },
    usage: 'translate <x>, <y>',
    help: 'Translate the view by x, y pixels.',
  });

  registry.register('clip', {
    handler: (args, ctx) => {
      const parts = parseArgs(args);
      if (parts.length < 2) {
        throw new Error('Usage: clip <near>, <far>');
      }
      const near = parseFloat(parts[0]);
      const far = parseFloat(parts[1]);
      if (isNaN(near) || isNaN(far)) {
        throw new Error('near and far must be numbers');
      }
      const viewer = getViewer();
      viewer.setSlab(near, far);
      scheduleRender();
      ctx.terminal.print(`Clipping planes set: near=${near}, far=${far}`, 'result');
    },
    usage: 'clip <near>, <far>',
    help: 'Set clipping planes (near and far distances).',
  });

  registry.register('reset', {
    handler: (args, ctx) => {
      const viewer = getViewer();
      viewer.zoomTo();
      scheduleRender();
      ctx.terminal.print('View reset', 'result');
    },
    usage: 'reset',
    help: 'Reset the view to show all atoms.',
  });

  registry.register('get_view', {
    handler: (args, ctx) => {
      const viewer = getViewer();
      const view = viewer.getView();
      const json = JSON.stringify(view);
      ctx.terminal.print(json, 'result');
    },
    usage: 'get_view',
    help: 'Print the current camera view as a JSON array (for use with set_view).',
  });

  registry.register('set_view', {
    handler: (args, ctx) => {
      const input = args.trim();
      if (!input) {
        throw new Error('Usage: set_view <json_array>');
      }
      let view;
      try {
        view = JSON.parse(input);
      } catch (e) {
        throw new Error(`Invalid JSON: ${e.message}`);
      }
      if (!Array.isArray(view)) {
        throw new Error('View must be a JSON array (from get_view)');
      }
      const viewer = getViewer();
      viewer.setView(view);
      scheduleRender();
      ctx.terminal.print('View restored', 'result');
    },
    usage: 'set_view <json_array>',
    help: 'Restore a camera view from a JSON array obtained via get_view.',
  });
}
