import { parse } from '../parser/selection.pegjs';
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
 * 4. Parse as selection expression:
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

  // Check named selections first (named selections shadow object names)
  const namedSel = state.selections.get(trimmed);
  if (namedSel) {
    return { spec: namedSel.spec };
  }

  // Check if it's an object name
  const obj = state.objects.get(trimmed);
  if (obj) {
    return { spec: { model: obj.model } };
  }

  // Try prefix matching against selections and objects
  const selMatches = [...state.selections.keys()].filter(k => k.startsWith(trimmed));
  const objMatches = [...state.objects.keys()].filter(k => k.startsWith(trimmed));
  const allNameMatches = [...selMatches, ...objMatches];
  if (allNameMatches.length === 1) {
    const match = allNameMatches[0];
    if (selMatches.length === 1) {
      return { spec: state.selections.get(match).spec };
    }
    return { spec: { model: state.objects.get(match).model } };
  }
  if (allNameMatches.length > 1) {
    throw new Error(`Ambiguous name "${trimmed}": ${allNameMatches.join(', ')}`);
  }

  // Parse as selection expression
  let ast;
  try {
    ast = parse(trimmed);
  } catch (err) {
    throw new Error(`Invalid selection "${trimmed}": ${err.message}`);
  }

  // Try simple conversion to AtomSelectionSpec
  const spec = toAtomSelectionSpec(ast);
  if (spec) {
    const matched = getAllAtoms(spec);
    if (!matched || matched.length === 0) {
      throw new Error(`No atoms match the selection "${trimmed}"`);
    }
    return { spec };
  }

  // Fall back to atom-by-atom evaluation
  const allAtoms = getAllAtoms({});
  if (!allAtoms || allAtoms.length === 0) {
    throw new Error(`Selection "${trimmed}" requires atom-level evaluation but no atoms are loaded`);
  }
  const selected = evaluate(ast, allAtoms);
  if (selected.length === 0) {
    throw new Error(`No atoms match the selection "${trimmed}"`);
  }
  return { atoms: selected };
}

/**
 * Convert a resolveSelection result to a 3Dmol.js AtomSelectionSpec.
 *
 * If the result contains a spec, returns it directly. If it contains atoms,
 * builds a spec using the atom indices.
 *
 * @param {{ spec?: object, atoms?: Array<object> }} result - The result from resolveSelection.
 * @returns {object} A 3Dmol.js AtomSelectionSpec.
 */
export function getSelSpec(result) {
  if (result.spec) return result.spec;
  return { index: result.atoms.map((a) => a.index) };
}
