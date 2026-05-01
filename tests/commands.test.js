import { describe, it, expect, vi } from 'vitest';
import { createCommandRegistry, parseCommandLine } from '../src/commands/registry.js';

describe('parseCommandLine', () => {
  it('parses simple command', () => {
    expect(parseCommandLine('help')).toEqual({ name: 'help', args: '' });
  });
  it('parses command with args', () => {
    expect(parseCommandLine('fetch 1UBQ')).toEqual({ name: 'fetch', args: '1UBQ' });
  });
  it('parses command with comma args', () => {
    expect(parseCommandLine('color red, protein')).toEqual({ name: 'color', args: 'red, protein' });
  });
  it('trims whitespace', () => {
    expect(parseCommandLine('  show  cartoon  ')).toEqual({ name: 'show', args: 'cartoon' });
  });
});

describe('CommandRegistry', () => {
  it('registers and executes a command', () => {
    const registry = createCommandRegistry();
    const handler = vi.fn();
    registry.register('test', { handler, usage: 'test', help: 'A test command' });
    registry.execute('test foo', {});
    expect(handler).toHaveBeenCalledWith('foo', {});
  });
  it('supports exact command aliases without changing canonical list output', () => {
    const registry = createCommandRegistry();
    const handler = vi.fn();
    registry.register('delete', {
      aliases: ['del'],
      handler,
      usage: 'delete <name>',
      help: 'Delete an entry.',
    });

    registry.execute('del mol', {});

    expect(handler).toHaveBeenCalledWith('mol', {});
    expect(registry.has('del')).toBe(true);
    expect(registry.getHelp('del')).toEqual({
      usage: 'delete <name>',
      help: 'Delete an entry.',
    });
    expect(registry.list()).toEqual(['delete']);
  });
  it('keeps prefix matching scoped to canonical commands when an alias exists', () => {
    const registry = createCommandRegistry();
    const handler = vi.fn();
    registry.register('delete', {
      aliases: ['del'],
      handler,
      usage: 'delete <name>',
      help: 'Delete an entry.',
    });

    registry.execute('de mol', {});

    expect(handler).toHaveBeenCalledWith('mol', {});
  });
  it('rejects commands that conflict with existing aliases', () => {
    const registry = createCommandRegistry();
    registry.register('delete', {
      aliases: ['del'],
      handler: () => {},
      usage: 'delete <name>',
      help: 'Delete an entry.',
    });

    expect(() => {
      registry.register('del', {
        handler: () => {},
        usage: 'del <name>',
        help: 'Delete an entry.',
      });
    }).toThrow('conflicts with an existing alias');
  });
  it('throws on unknown command', () => {
    const registry = createCommandRegistry();
    expect(() => registry.execute('nonexistent', {})).toThrow(/unknown command/i);
  });
  it('lists registered commands', () => {
    const registry = createCommandRegistry();
    registry.register('foo', { handler: () => {}, usage: 'foo', help: 'Foo' });
    registry.register('bar', { handler: () => {}, usage: 'bar', help: 'Bar' });
    expect(registry.list()).toEqual(['bar', 'foo']);
  });
  it('gets help for a command', () => {
    const registry = createCommandRegistry();
    registry.register('zoom', { handler: () => {}, usage: 'zoom [selection]', help: 'Zoom to fit.' });
    const info = registry.getHelp('zoom');
    expect(info.usage).toBe('zoom [selection]');
    expect(info.help).toBe('Zoom to fit.');
  });
});
