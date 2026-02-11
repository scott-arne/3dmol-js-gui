export function parseCommandLine(input) {
  const trimmed = input.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { name: trimmed.toLowerCase(), args: '' };
  }
  return {
    name: trimmed.substring(0, spaceIdx).toLowerCase(),
    args: trimmed.substring(spaceIdx + 1).trim(),
  };
}

export function parseArgs(argsStr) {
  if (!argsStr) return [];
  return argsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

export function createCommandRegistry() {
  const commands = new Map();

  return {
    register(name, { handler, usage, help }) {
      commands.set(name.toLowerCase(), { handler, usage, help });
    },
    execute(input, ctx) {
      const { name, args } = parseCommandLine(input);
      let cmd = commands.get(name);
      if (!cmd) {
        // Try prefix matching
        const matches = [...commands.keys()].filter(k => k.startsWith(name));
        if (matches.length === 1) {
          cmd = commands.get(matches[0]);
        } else if (matches.length > 1) {
          throw new Error(`Ambiguous command "${name}": ${matches.join(', ')}`);
        } else {
          throw new Error(`Error: unknown command '${name}'`);
        }
      }
      return cmd.handler(args, ctx);
    },
    list() {
      return [...commands.keys()].sort();
    },
    getHelp(name) {
      const cmd = commands.get(name.toLowerCase());
      if (!cmd) return null;
      return { usage: cmd.usage, help: cmd.help };
    },
    has(name) {
      return commands.has(name.toLowerCase());
    },
    completions(prefix) {
      const lower = prefix.toLowerCase();
      return [...commands.keys()].filter(k => k.startsWith(lower)).sort();
    },
  };
}

export function createCommandContext({ viewer, terminal, sidebar, state }) {
  return { viewer, terminal, sidebar, state };
}
