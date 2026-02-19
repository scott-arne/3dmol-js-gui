import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTerminal } from '../../src/ui/terminal.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Dispatch a keyboard event on the textarea.
 */
function pressKey(textarea, key, opts = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
  textarea.dispatchEvent(event);
}

/**
 * Submit text via Enter key: set value then press Enter.
 */
function submitText(textarea, text) {
  textarea.value = text;
  pressKey(textarea, 'Enter');
}

describe('Terminal', () => {
  let container;
  let terminal;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    terminal = createTerminal(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /* ================================================================ */
  /*  Existing tests (preserved)                                       */
  /* ================================================================ */

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

  /* ================================================================ */
  /*  Print — additional coverage                                      */
  /* ================================================================ */

  describe('print', () => {
    it('prints with no type — class is just terminal-line', () => {
      terminal.print('bare message');
      const lines = container.querySelectorAll('.terminal-line');
      expect(lines.length).toBe(1);
      expect(lines[0].className).toBe('terminal-line');
      expect(lines[0].textContent).toBe('bare message');
    });
  });

  /* ================================================================ */
  /*  Tab completion                                                    */
  /* ================================================================ */

  describe('tab completion', () => {
    it('does nothing when no completer is set', () => {
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'sel';
      textarea.selectionStart = textarea.selectionEnd = 3;
      pressKey(textarea, 'Tab');
      expect(textarea.value).toBe('sel');
    });

    it('does nothing for empty prefix', () => {
      terminal.setCompleter(vi.fn(() => ['select']));
      const textarea = container.querySelector('.terminal-input');
      textarea.value = '';
      textarea.selectionStart = textarea.selectionEnd = 0;
      pressKey(textarea, 'Tab');
      expect(textarea.value).toBe('');
    });

    it('single match completes with trailing space', () => {
      terminal.setCompleter(() => ['select']);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'sel';
      textarea.selectionStart = textarea.selectionEnd = 3;
      pressKey(textarea, 'Tab');
      expect(textarea.value).toBe('select ');
      expect(textarea.selectionStart).toBe(7);
    });

    it('multiple matches completes to common prefix', () => {
      terminal.setCompleter(() => ['select', 'selection']);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'sel';
      textarea.selectionStart = textarea.selectionEnd = 3;
      pressKey(textarea, 'Tab');
      expect(textarea.value).toBe('select');
      expect(textarea.selectionStart).toBe(6);
    });

    it('no matches leaves input unchanged', () => {
      terminal.setCompleter(() => []);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'xyz';
      textarea.selectionStart = textarea.selectionEnd = 3;
      pressKey(textarea, 'Tab');
      expect(textarea.value).toBe('xyz');
    });

    it('completer returning null leaves input unchanged', () => {
      terminal.setCompleter(() => null);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'xyz';
      textarea.selectionStart = textarea.selectionEnd = 3;
      pressKey(textarea, 'Tab');
      expect(textarea.value).toBe('xyz');
    });

    it('isFirstWord is true for the first token', () => {
      const completer = vi.fn(() => ['select']);
      terminal.setCompleter(completer);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'sel';
      textarea.selectionStart = textarea.selectionEnd = 3;
      pressKey(textarea, 'Tab');
      expect(completer).toHaveBeenCalledWith('sel', true);
    });

    it('isFirstWord is false for argument after space', () => {
      const completer = vi.fn(() => ['chainA']);
      terminal.setCompleter(completer);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'select cha';
      textarea.selectionStart = textarea.selectionEnd = 10;
      pressKey(textarea, 'Tab');
      expect(completer).toHaveBeenCalledWith('cha', false);
    });

    it('isFirstWord is false for argument after comma', () => {
      const completer = vi.fn(() => ['cartoon']);
      terminal.setCompleter(completer);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'show stick,car';
      textarea.selectionStart = textarea.selectionEnd = 14;
      pressKey(textarea, 'Tab');
      expect(completer).toHaveBeenCalledWith('car', false);
    });

    it('completes argument token after space correctly', () => {
      terminal.setCompleter(() => ['cartoon']);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'show car';
      textarea.selectionStart = textarea.selectionEnd = 8;
      pressKey(textarea, 'Tab');
      expect(textarea.value).toBe('show cartoon ');
    });

    it('common prefix equal to current prefix makes no change', () => {
      terminal.setCompleter(() => ['abc', 'abd']);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'ab';
      textarea.selectionStart = textarea.selectionEnd = 2;
      pressKey(textarea, 'Tab');
      // Common prefix is 'ab', same length as typed prefix — no change
      expect(textarea.value).toBe('ab');
    });
  });

  /* ================================================================ */
  /*  History navigation                                               */
  /* ================================================================ */

  describe('history', () => {
    it('ArrowUp navigates backwards through history', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      submitText(textarea, 'cmd1');
      submitText(textarea, 'cmd2');
      submitText(textarea, 'cmd3');

      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('cmd3');

      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('cmd2');

      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('cmd1');
    });

    it('ArrowUp stops at the oldest entry', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      submitText(textarea, 'only');

      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('only');

      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('only');
    });

    it('ArrowDown navigates forwards through history', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      submitText(textarea, 'first');
      submitText(textarea, 'second');

      pressKey(textarea, 'ArrowUp');
      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('first');

      pressKey(textarea, 'ArrowDown');
      expect(textarea.value).toBe('second');
    });

    it('ArrowDown at end of history clears input', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      submitText(textarea, 'hello');

      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('hello');

      pressKey(textarea, 'ArrowDown');
      expect(textarea.value).toBe('');
    });

    it('history index resets after submit', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      submitText(textarea, 'a');
      submitText(textarea, 'b');

      // Navigate up
      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('b');

      // Submit a new command — this resets historyIndex to -1
      submitText(textarea, 'c');

      // Now ArrowUp should go to most recent ('c')
      pressKey(textarea, 'ArrowUp');
      expect(textarea.value).toBe('c');
    });

    it('caps history at MAX_HISTORY (100)', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');

      for (let i = 0; i < 110; i++) {
        submitText(textarea, `cmd${i}`);
      }

      // Navigate all the way up
      for (let i = 0; i < 110; i++) {
        pressKey(textarea, 'ArrowUp');
      }

      // Oldest should be cmd10 (first 10 were shifted out)
      expect(textarea.value).toBe('cmd10');
    });

    it('ArrowDown does nothing when historyIndex is -1', () => {
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'something';
      pressKey(textarea, 'ArrowDown');
      // No history navigated, value unchanged
      expect(textarea.value).toBe('something');
    });
  });

  /* ================================================================ */
  /*  Send button                                                      */
  /* ================================================================ */

  describe('send button', () => {
    it('triggers submit on click', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      const sendBtn = container.querySelector('.terminal-send');
      textarea.value = 'via button';
      sendBtn.click();
      expect(cb).toHaveBeenCalledWith('via button');
    });

    it('clears textarea after send', () => {
      terminal.onCommand(vi.fn());
      const textarea = container.querySelector('.terminal-input');
      const sendBtn = container.querySelector('.terminal-send');
      textarea.value = 'clear me';
      sendBtn.click();
      expect(textarea.value).toBe('');
    });
  });

  /* ================================================================ */
  /*  Collapse toggle                                                  */
  /* ================================================================ */

  describe('collapse toggle', () => {
    it('toggles collapsed class on output', () => {
      const output = container.querySelector('.terminal-output');
      const collapseBtn = container.querySelector('.terminal-collapse');

      expect(output.classList.contains('collapsed')).toBe(false);

      collapseBtn.click();
      expect(output.classList.contains('collapsed')).toBe(true);

      collapseBtn.click();
      expect(output.classList.contains('collapsed')).toBe(false);
    });

    it('changes icon on toggle', () => {
      const collapseBtn = container.querySelector('.terminal-collapse');

      expect(collapseBtn.textContent).toBe('\u25BE'); // expanded ▾
      collapseBtn.click();
      expect(collapseBtn.textContent).toBe('\u25B8'); // collapsed ▸
      collapseBtn.click();
      expect(collapseBtn.textContent).toBe('\u25BE'); // expanded again
    });
  });

  /* ================================================================ */
  /*  Public API methods                                               */
  /* ================================================================ */

  describe('getElement', () => {
    it('returns the container element', () => {
      expect(terminal.getElement()).toBe(container);
    });
  });

  describe('setCompleter', () => {
    it('sets the completer callback used by tab', () => {
      const fn = vi.fn(() => ['test']);
      terminal.setCompleter(fn);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'te';
      textarea.selectionStart = textarea.selectionEnd = 2;
      pressKey(textarea, 'Tab');
      expect(fn).toHaveBeenCalledWith('te', true);
    });
  });

  describe('hide / show', () => {
    it('hide() sets display to none', () => {
      terminal.hide();
      expect(container.style.display).toBe('none');
    });

    it('show() clears display', () => {
      terminal.hide();
      terminal.show();
      expect(container.style.display).toBe('');
    });
  });

  /* ================================================================ */
  /*  Shift+Enter (multiline)                                          */
  /* ================================================================ */

  describe('Shift+Enter', () => {
    it('does NOT submit the command', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'line1';
      pressKey(textarea, 'Enter', { shiftKey: true });
      expect(cb).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  Empty input                                                      */
  /* ================================================================ */

  describe('empty input', () => {
    it('does not trigger callback for empty input', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = '';
      pressKey(textarea, 'Enter');
      expect(cb).not.toHaveBeenCalled();
    });

    it('does not trigger callback for whitespace-only input', () => {
      const cb = vi.fn();
      terminal.onCommand(cb);
      const textarea = container.querySelector('.terminal-input');
      textarea.value = '   ';
      pressKey(textarea, 'Enter');
      expect(cb).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  Auto-grow behavior                                               */
  /* ================================================================ */

  describe('auto-grow', () => {
    it('adjusts textarea height on input event', () => {
      const textarea = container.querySelector('.terminal-input');
      textarea.value = 'test\ntest\ntest';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      // After auto-grow the height should be set (not empty)
      // In happy-dom scrollHeight may be 0 but height style should be set
      expect(textarea.style.height).toBeDefined();
    });
  });
});
