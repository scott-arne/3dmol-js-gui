/**
 * Terminal UI component for the 3Dmol.js GUI.
 *
 * Provides a PyMOL-like command terminal with scrollable output, auto-growing
 * textarea input, command history, and collapse toggle.
 */

const MAX_HISTORY = 100;

/**
 * Create a terminal component and mount it inside the given container element.
 *
 * @param {HTMLElement} container - The DOM element to build the terminal inside.
 * @returns {object} Terminal API with print, clear, getElement, onCommand, hide, and show methods.
 */
export function createTerminal(container) {
  // --- State ---
  const commandHistory = [];
  let historyIndex = -1;
  let commandCallback = null;
  let completerCallback = null;

  // --- Build DOM ---

  // Output area
  const output = document.createElement('div');
  output.className = 'terminal-output';

  // Input row
  const inputRow = document.createElement('div');
  inputRow.className = 'terminal-input-row';

  // Prompt indicator
  const prompt = document.createElement('span');
  prompt.className = 'terminal-prompt';
  prompt.textContent = '>';

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'terminal-input';
  textarea.rows = 1;

  // Send button
  const sendBtn = document.createElement('button');
  sendBtn.className = 'terminal-send';
  sendBtn.textContent = 'Send';

  // Collapse toggle button
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'terminal-collapse';
  collapseBtn.textContent = '\u25BE'; // ▾ (expanded)

  // Assemble input row
  inputRow.appendChild(prompt);
  inputRow.appendChild(textarea);
  inputRow.appendChild(sendBtn);
  inputRow.appendChild(collapseBtn);

  // Assemble container
  container.appendChild(output);
  container.appendChild(inputRow);

  // --- Input auto-grow ---

  function autoGrow() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 96) + 'px';
  }

  function resetHeight() {
    textarea.style.height = '';
  }

  textarea.addEventListener('input', autoGrow);

  // --- Submit logic ---

  function submit() {
    const text = textarea.value;
    if (text.trim() === '') {
      return;
    }

    // Add to history (cap at MAX_HISTORY)
    commandHistory.push(text);
    if (commandHistory.length > MAX_HISTORY) {
      commandHistory.shift();
    }
    historyIndex = -1;

    // Clear and reset textarea
    textarea.value = '';
    resetHeight();

    // Invoke callback
    if (commandCallback) {
      commandCallback(text);
    }
  }

  // --- Keyboard handling ---

  textarea.addEventListener('keydown', (e) => {
    // Tab — autocomplete
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!completerCallback) return;
      const text = textarea.value;
      const cursor = textarea.selectionStart;

      // Find the word being typed
      const before = text.substring(0, cursor);
      const after = text.substring(cursor);
      const isFirstWord = !before.includes(' ');

      let wordStart;
      if (isFirstWord) {
        wordStart = 0;
      } else {
        // Find start of current argument token (after last comma or space)
        const lastSep = Math.max(before.lastIndexOf(','), before.lastIndexOf(' '));
        wordStart = lastSep + 1;
        // Skip leading whitespace after separator
        while (wordStart < cursor && before[wordStart] === ' ') wordStart++;
      }

      const prefix = before.substring(wordStart);
      if (!prefix) return;

      const matches = completerCallback(prefix, isFirstWord);
      if (!matches || matches.length === 0) return;

      if (matches.length === 1) {
        // Single match — complete fully and add trailing space
        const completion = matches[0];
        textarea.value = before.substring(0, wordStart) + completion + ' ' + after;
        const newCursor = wordStart + completion.length + 1;
        textarea.selectionStart = textarea.selectionEnd = newCursor;
      } else {
        // Multiple matches — complete to longest common prefix
        let common = matches[0];
        for (let i = 1; i < matches.length; i++) {
          let j = 0;
          while (j < common.length && j < matches[i].length && common[j] === matches[i][j]) j++;
          common = common.substring(0, j);
        }
        if (common.length > prefix.length) {
          textarea.value = before.substring(0, wordStart) + common + after;
          const newCursor = wordStart + common.length;
          textarea.selectionStart = textarea.selectionEnd = newCursor;
        }
      }
      autoGrow();
      return;
    }

    // Enter (without Shift) submits
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    // Arrow Up — navigate history backward
    if (e.key === 'ArrowUp') {
      const isMultiline = textarea.value.includes('\n');
      const cursorAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      if ((!isMultiline || cursorAtStart) && commandHistory.length > 0) {
        e.preventDefault();
        if (historyIndex === -1) {
          historyIndex = commandHistory.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }
        textarea.value = commandHistory[historyIndex];
        autoGrow();
      }
      return;
    }

    // Arrow Down — navigate history forward
    if (e.key === 'ArrowDown') {
      const isMultiline = textarea.value.includes('\n');
      const cursorAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      if ((!isMultiline || cursorAtStart) && historyIndex !== -1) {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          textarea.value = commandHistory[historyIndex];
        } else {
          historyIndex = -1;
          textarea.value = '';
        }
        autoGrow();
      }
      return;
    }
  });

  // --- Send button ---

  sendBtn.addEventListener('click', submit);

  // --- Collapse toggle ---

  collapseBtn.addEventListener('click', () => {
    const isCollapsed = output.classList.toggle('collapsed');
    collapseBtn.textContent = isCollapsed ? '\u25B8' : '\u25BE'; // ▸ or ▾
  });

  // --- Public API ---

  return {
    /**
     * Append a line to the terminal output.
     *
     * @param {string} text - The text content of the line.
     * @param {string} type - One of 'info', 'error', 'result', or 'command'.
     */
    print(text, type) {
      const line = document.createElement('div');
      line.className = 'terminal-line' + (type ? ' ' + type : '');
      line.textContent = text;
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    },

    /**
     * Clear all lines from the terminal output.
     */
    clear() {
      output.innerHTML = '';
    },

    /**
     * Return the container element.
     *
     * @returns {HTMLElement} The container element.
     */
    getElement() {
      return container;
    },

    /**
     * Register a callback invoked when the user submits a command.
     *
     * @param {function} callback - A function called with the command text string.
     */
    onCommand(callback) {
      commandCallback = callback;
    },

    /**
     * Register a tab-completion callback.
     *
     * @param {function} callback - Called with (prefix, isFirstWord) and returns an array of matches.
     */
    setCompleter(callback) {
      completerCallback = callback;
    },

    /**
     * Hide the entire terminal.
     */
    hide() {
      container.style.display = 'none';
    },

    /**
     * Show the terminal.
     */
    show() {
      container.style.display = '';
    },
  };
}
