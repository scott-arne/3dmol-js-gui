import { describe, it, expect } from 'vitest';
import { parseColorScheme, formatColorDisplay } from '../src/actions.js';

describe('parseColorScheme', () => {
  it('parses plain scheme', () => {
    expect(parseColorScheme('red')).toEqual({
      scheme: 'red', carbonHex: null, chainPalette: null, ssPalette: null,
    });
  });

  it('parses element with carbon hex', () => {
    expect(parseColorScheme('element:#FF0000')).toEqual({
      scheme: 'element', carbonHex: '#FF0000', chainPalette: null, ssPalette: null,
    });
  });

  it('parses chain palette', () => {
    expect(parseColorScheme('chain:pastel')).toEqual({
      scheme: 'chain', carbonHex: null, chainPalette: 'pastel', ssPalette: null,
    });
  });

  it('parses ss palette', () => {
    expect(parseColorScheme('ss:cool')).toEqual({
      scheme: 'ss', carbonHex: null, chainPalette: null, ssPalette: 'cool',
    });
  });

  it('passes through hex values unchanged', () => {
    expect(parseColorScheme('#ABCDEF')).toEqual({
      scheme: '#ABCDEF', carbonHex: null, chainPalette: null, ssPalette: null,
    });
  });
});

describe('formatColorDisplay', () => {
  it('formats element with carbon', () => {
    expect(formatColorDisplay('element:#FF0000')).toBe('element (C=#FF0000)');
  });

  it('formats chain palette', () => {
    expect(formatColorDisplay('chain:pastel')).toBe('chain (pastel)');
  });

  it('formats ss palette', () => {
    expect(formatColorDisplay('ss:cool')).toBe('ss (cool)');
  });

  it('formats plain scheme', () => {
    expect(formatColorDisplay('red')).toBe('red');
  });

  it('formats bare element', () => {
    expect(formatColorDisplay('element')).toBe('element');
  });
});
