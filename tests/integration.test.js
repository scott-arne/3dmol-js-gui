import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommandRegistry } from '../src/commands/registry.js';

describe('Command Pipeline Integration', () => {
  let registry;
  let mockTerminal;

  beforeEach(() => {
    mockTerminal = {
      print: vi.fn(),
      clear: vi.fn(),
    };
    registry = createCommandRegistry();
  });

  it('registers and executes a command', () => {
    const handler = vi.fn();
    registry.register('test', { handler, usage: 'test', help: 'A test command' });
    registry.execute('test foo', { terminal: mockTerminal });
    expect(handler).toHaveBeenCalledWith('foo', { terminal: mockTerminal });
  });

  it('throws on unknown command', () => {
    expect(() => registry.execute('nonexistent', {})).toThrow(/unknown command/i);
  });

  it('lists registered commands alphabetically', () => {
    registry.register('beta', { handler: () => {}, usage: 'beta', help: 'Beta' });
    registry.register('alpha', { handler: () => {}, usage: 'alpha', help: 'Alpha' });
    expect(registry.list()).toEqual(['alpha', 'beta']);
  });

  it('provides help for registered commands', () => {
    registry.register('zoom', { handler: () => {}, usage: 'zoom [sel]', help: 'Zoom to fit.' });
    const info = registry.getHelp('zoom');
    expect(info.usage).toBe('zoom [sel]');
    expect(info.help).toBe('Zoom to fit.');
  });

  it('returns completions for command prefix', () => {
    registry.register('fetch', { handler: () => {}, usage: 'fetch', help: 'Fetch' });
    registry.register('focus', { handler: () => {}, usage: 'focus', help: 'Focus' });
    registry.register('help', { handler: () => {}, usage: 'help', help: 'Help' });
    const results = registry.completions('f');
    expect(results).toContain('fetch');
    expect(results).toContain('focus');
    expect(results).not.toContain('help');
  });
});
