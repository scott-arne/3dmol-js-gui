import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTerminal } from '../../src/ui/terminal.js';

describe('Terminal', () => {
  let container;
  let terminal;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    terminal = createTerminal(container);
  });

  it('prints lines to output', () => {
    terminal.print('hello', 'info');
    const lines = container.querySelectorAll('.terminal-line');
    expect(lines.length).toBe(1);
    expect(lines[0].textContent).toBe('hello');
    expect(lines[0].classList.contains('info')).toBe(true);
  });

  it('prints multiple types', () => {
    terminal.print('cmd', 'command');
    terminal.print('err', 'error');
    terminal.print('res', 'result');
    const lines = container.querySelectorAll('.terminal-line');
    expect(lines.length).toBe(3);
    expect(lines[0].classList.contains('command')).toBe(true);
    expect(lines[1].classList.contains('error')).toBe(true);
    expect(lines[2].classList.contains('result')).toBe(true);
  });

  it('clears output', () => {
    terminal.print('line1', 'info');
    terminal.print('line2', 'info');
    terminal.clear();
    const output = container.querySelector('.terminal-output');
    expect(output.querySelectorAll('.terminal-line').length).toBe(0);
  });

  it('prunes output beyond MAX_LINES', () => {
    for (let i = 0; i < 1010; i++) {
      terminal.print(`line ${i}`, 'info');
    }
    const output = container.querySelector('.terminal-output');
    expect(output.querySelectorAll('.terminal-line').length).toBeLessThanOrEqual(1000);
  });

  it('fires command callback on Enter', () => {
    const cb = vi.fn();
    terminal.onCommand(cb);
    const textarea = container.querySelector('.terminal-input');
    if (textarea) {
      textarea.value = 'test cmd';
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      textarea.dispatchEvent(event);
      expect(cb).toHaveBeenCalledWith('test cmd');
    }
  });
});
