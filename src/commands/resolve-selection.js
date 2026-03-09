import { parse } from '../parser/selection.pegjs';
import { evaluate, toAtomSelectionSpec } from '../parser/evaluator.js';
import { getState, findTreeNode, collectEntryNames } from '../state.js';
import { getAllAtoms } from '../viewer.js';

/**
 * Resolve a group name to a union spec of all objects it contains.
 * Returns null if the name is not a group.
 *
 * @param {string} name - The group name.
 * @param {object} state - Application state.
 * @returns {object|null} A 3Dmol spec, or null.
 */
function resolveGroupSpec(name, state) {
  const found = findTreeNode(state.entryTree, name, 'group');
  if (!found) return null;

  const entries = collectEntryNames(found.node);
  const models = [];
  for (const objName of entries.objects) {
    const obj = state.objects.get(objName);
    if (obj) models.push(obj.model);
  }
  if (models.length === 0) return null;
  if (models.length === 1) return { model: models[0] };
  return { model: models };
}

/**
 * Resolve dot-notation for hierarchy selections:
 *   PARENT.*          -> parent + all children
 *   PARENT.CHILD      -> specific child
 *   PARENT.PREFIX*    -> wildcard children by prefix
 *
 * @param {string} str - The dot-notation string.
 * @param {object} state - Application state.
 * @returns {object|null} A spec, or null if not a valid hierarchy reference.
 */
function resolveHierarchyDotNotation(str, state) {
  const dotIdx = str.indexOf('.');
  if (dotIdx < 0) return null;

  const parentName = str.slice(0, dotIdx);
  const suffix = str.slice(dotIdx + 1);

  // Find the parent in the tree — must be an object with children
  const parentFound = findTreeNode(state.entryTree, parentName, 'object');
  if (!parentFound || !parentFound.node.children || parentFound.node.children.length === 0) {
    return null;
  }

  const parentObj = state.objects.get(parentName);
  if (!parentObj) return null;

  if (suffix === '*') {
    // PARENT.* -> parent + all children
    const models = [parentObj.model];
    for (const child of parentFound.node.children) {
      if (child.type === 'object') {
        const childObj = state.objects.get(child.name);
        if (childObj) models.push(childObj.model);
      }
    }
    return models.length === 1 ? { model: models[0] } : { model: models };
  }

  // Check for trailing wildcard: PARENT.PREFIX*
  if (suffix.endsWith('*')) {
    const prefix = suffix.slice(0, -1);
    const models = [];
    for (const child of parentFound.node.children) {
      if (child.type === 'object' && child.name.startsWith(prefix)) {
        const childObj = state.objects.get(child.name);
        if (childObj) models.push(childObj.model);
      }
    }
    if (models.length === 0) return null;
    return models.length === 1 ? { model: models[0] } : { model: models };
  }

  // PARENT.CHILD -> specific child
  const childObj = state.objects.get(suffix);
  if (childObj) {
    // Verify it's actually a child of this parent
    const childFound = parentFound.node.children.find(c => c.name === suffix);
    if (childFound) {
      return { model: childObj.model };
    }
  }
  return null;
}

/**
 * Resolve a selection string to a 3Dmol.js AtomSelectionSpec or atom list.
 *
 * Resolution order:
 *
 * 1. Empty/null/undefined or "all" -> ``{ spec: {} }`` (select everything)
 * 2. Hierarchy dot-notation (PARENT.CHILD, PARENT.*, PARENT.PREFIX*)
 * 3. Check if it matches a named selection in ``state.selections``
 * 4. Check if it matches a group name -> union of all group members
 * 5. Check if it matches an object name in ``state.objects``
 * 6. Prefix matching against selections and objects
 * 7. Parse as selection expression
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

  // Check hierarchy dot-notation first (PARENT.CHILD, PARENT.*, PARENT.PREFIX*)
  if (trimmed.includes('.')) {
    const hierarchySpec = resolveHierarchyDotNotation(trimmed, state);
    if (hierarchySpec) {
      return { spec: hierarchySpec };
    }
  }

  // Check named selections first (named selections shadow object names)
  const namedSel = state.selections.get(trimmed);
  if (namedSel) {
    return { spec: namedSel.spec };
  }

  // Check if it's a group name
  const groupSpec = resolveGroupSpec(trimmed, state);
  if (groupSpec) {
    return { spec: groupSpec };
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
 * builds a spec using atom serial numbers.
 *
 * @param {{ spec?: object, atoms?: Array<object> }} result - The result from resolveSelection.
 * @returns {object} A 3Dmol.js AtomSelectionSpec.
 */
export function getSelSpec(result) {
  if (result.spec) return result.spec;
  return { serial: result.atoms.map((a) => a.serial) };
}
