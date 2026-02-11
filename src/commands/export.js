import { getViewer } from '../viewer.js';

/**
 * Register the export and help commands (png, help) into the given command
 * registry.
 *
 * The help command captures the registry reference via closure so it can
 * list all registered commands and retrieve per-command help text.
 *
 * @param {object} registry - The command registry to register commands with.
 */
export function registerExportCommands(registry) {
  registry.register('png', {
    handler: (args, ctx) => {
      const filename = args.trim() || 'screenshot';
      const viewer = getViewer();
      const dataUri = viewer.pngURI();

      const link = document.createElement('a');
      link.href = dataUri;
      link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
      link.click();

      ctx.terminal.print(`Screenshot saved as "${link.download}"`, 'result');
    },
    usage: 'png [filename]',
    help: 'Export the current view as a PNG image.',
  });

  registry.register('help', {
    handler: (args, ctx) => {
      const cmdName = args.trim().toLowerCase();

      if (cmdName) {
        // Help for a specific command
        const info = registry.getHelp(cmdName);
        if (!info) {
          throw new Error(`Unknown command "${cmdName}". Type "help" for a list.`);
        }
        ctx.terminal.print(`Usage: ${info.usage}`, 'info');
        ctx.terminal.print(info.help, 'info');
      } else {
        // List all commands
        ctx.terminal.print('Available commands:', 'info');
        const commands = registry.list();
        for (const name of commands) {
          const info = registry.getHelp(name);
          ctx.terminal.print(`  ${info.usage}`, 'info');
        }
        ctx.terminal.print('', 'info');
        ctx.terminal.print('Type "help <command>" for details.', 'info');
      }
    },
    usage: 'help [command]',
    help: 'Show available commands or help for a specific command.',
  });
}
