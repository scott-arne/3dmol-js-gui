import { parseArgs } from './registry.js';
import { resolveSelection, getSelSpec } from './resolve-selection.js';
import { getViewer } from '../viewer.js';

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
      viewer.render();
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
      viewer.render();
      ctx.terminal.print('Centered on selection', 'result');
    },
    usage: 'center [selection]',
    help: 'Center the view on the selection.',
  });

  registry.register('orient', {
    handler: (args, ctx) => {
      const viewer = getViewer();
      if (args.trim()) {
        const result = resolveSelection(args.trim());
        const selSpec = getSelSpec(result);
        viewer.zoomTo(selSpec);
      } else {
        viewer.zoomTo();
      }
      viewer.render();
      ctx.terminal.print('Oriented to selection', 'result');
    },
    usage: 'orient [selection]',
    help: 'Orient the view to fit the selection.',
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
      viewer.render();
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
      viewer.render();
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
      viewer.render();
      ctx.terminal.print(`Clipping planes set: near=${near}, far=${far}`, 'result');
    },
    usage: 'clip <near>, <far>',
    help: 'Set clipping planes (near and far distances).',
  });

  registry.register('reset', {
    handler: (args, ctx) => {
      const viewer = getViewer();
      viewer.zoomTo();
      viewer.render();
      ctx.terminal.print('View reset', 'result');
    },
    usage: 'reset',
    help: 'Reset the view to show all atoms.',
  });
}
