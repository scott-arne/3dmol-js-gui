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
  const aliases = new Map();

  function resolveCommandName(name) {
    return aliases.get(name) || name;
  }

  return {
    register(name, { aliases: commandAliases = [], handler, usage, help }) {
      const canonicalName = name.toLowerCase();
      const existingAliasTarget = aliases.get(canonicalName);
      if (existingAliasTarget && existingAliasTarget !== canonicalName) {
        throw new Error(`Command "${canonicalName}" conflicts with an existing alias`);
      }
      commands.set(canonicalName, { handler, usage, help });

      for (const alias of commandAliases) {
        const aliasName = alias.toLowerCase();
        if (commands.has(aliasName) && aliasName !== canonicalName) {
          throw new Error(`Alias "${aliasName}" conflicts with an existing command`);
        }
        const existingAlias = aliases.get(aliasName);
        if (existingAlias && existingAlias !== canonicalName) {
          throw new Error(`Alias "${aliasName}" conflicts with an existing alias`);
        }
        aliases.set(aliasName, canonicalName);
      }
    },
    execute(input, ctx) {
      const { name, args } = parseCommandLine(input);
      let cmd = commands.get(resolveCommandName(name));
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
      const cmd = commands.get(resolveCommandName(name.toLowerCase()));
      if (!cmd) return null;
      return { usage: cmd.usage, help: cmd.help };
    },
    has(name) {
      const lower = name.toLowerCase();
      return commands.has(lower) || aliases.has(lower);
    },
    completions(prefix) {
      const lower = prefix.toLowerCase();
      return [...new Set([...commands.keys(), ...aliases.keys()])]
        .filter(k => k.startsWith(lower))
        .sort();
    },
  };
}

export function createCommandContext({ viewer, terminal, sidebar, state, surfaceService, mapService }) {
  return { viewer, terminal, sidebar, state, surfaceService, mapService };
}
