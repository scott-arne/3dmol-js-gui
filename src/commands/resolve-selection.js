import { parse } from '../parser/pymol-selection.pegjs';
import { evaluate, toAtomSelectionSpec } from '../parser/evaluator.js';
import { getState } from '../state.js';
import { getAllAtoms } from '../viewer.js';

/**
 * Resolve a selection string to a 3Dmol.js AtomSelectionSpec or atom list.
 *
 * Resolution order:
 *
 * 1. Empty/null/undefined or "all" -> ``{ spec: {} }`` (select everything)
 * 2. Check if it matches a named selection in ``state.selections`` -> use that expression
 * 3. Check if it matches an object name in ``state.objects`` -> ``{ spec: { model: obj.model } }``
 *    (skipped if a named selection matched, so named selections shadow object names)
 * 4. Parse as PyMOL selection expression:
 *
 *    a. Try ``toAtomSelectionSpec`` for simple expressions -> ``{ spec: ... }``
 *    b. Fall back to atom-by-atom evaluation -> ``{ atoms: [...] }``
 *
 * @param {string} selStr - The selection expression or named selection.
 * @returns {{ spec?: object, atoms?: Array<object> }} Either a spec object for 3Dmol.js or an array of matched atoms.
 */
export function resolveSelection(selStr) {
  const trimmed = (selStr || '').trim();

  if (trimmed === '' || trimmed.toLowerCase() === 'all') {
    return { spec: {} };
  }

  const state = getState();

  // Check for active selection keywords
  const lower = trimmed.toLowerCase();
  if (lower === 'selected' || lower === 'sele') {
    if (!state.activeSelection) {
      throw new Error('No active selection — click atoms in the viewer first');
    }
    return { spec: state.activeSelection };
  }

  // Check named selections first (named selections shadow object names)
  const namedExpr = state.selections.get(trimmed);
  const expression = namedExpr || trimmed;

  // Check if it's an object name (only if not a named selection)
  if (!namedExpr) {
    const obj = state.objects.get(expression);
    if (obj) {
      return { spec: { model: obj.model } };
    }
  }

  // Parse as PyMOL selection expression
  let ast;
  try {
    ast = parse(expression);
  } catch (err) {
    throw new Error(`Invalid selection "${expression}": ${err.message}`);
  }

  // Try simple conversion to AtomSelectionSpec
  const spec = toAtomSelectionSpec(ast);
  if (spec) {
    return { spec };
  }

  // Fall back to atom-by-atom evaluation
  const allAtoms = getAllAtoms({});
  if (!allAtoms || allAtoms.length === 0) {
    throw new Error(`Selection "${expression}" requires atom-level evaluation but no atoms are loaded`);
  }
  const selected = evaluate(ast, allAtoms);
  return { atoms: selected };
}

/**
 * Convert a resolveSelection result to a 3Dmol.js AtomSelectionSpec.
 *
 * If the result contains a spec, returns it directly. If it contains atoms,
 * builds a spec using the atom serial numbers.
 *
 * @param {{ spec?: object, atoms?: Array<object> }} result - The result from resolveSelection.
 * @returns {object} A 3Dmol.js AtomSelectionSpec.
 */
export function getSelSpec(result) {
  if (result.spec) return result.spec;
  return { serial: result.atoms.map((a) => a.serial) };
}
