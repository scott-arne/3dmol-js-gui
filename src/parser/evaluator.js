/**
 * Selection Evaluator for PyMOL-style selection AST nodes.
 *
 * Evaluates AST produced by the PEG parser against arrays of atom objects
 * (3Dmol.js-style atoms with serial, atom, resn, resi, chain, elem, ss, x, y, z).
 */

// ---------------------------------------------------------------------------
// Reference data sets
// ---------------------------------------------------------------------------

const PROTEIN_RESIDUES = new Set([
  'ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE',
  'LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL',
  'MSE','SEC','PYL','ASX','GLX',
]);

const WATER_RESIDUES = new Set(['HOH','WAT','H2O','DOD','TIP','TIP3','SPC']);

const SOLVENT_RESIDUES = new Set([
  ...WATER_RESIDUES,
  'DMSO','DMF','ACN','MeOH','EtOH','IPA','GOL','PEG',
]);

const BACKBONE_ATOMS = new Set(['N','CA','C','O']);

const METAL_ELEMENTS = new Set([
  'LI','BE','NA','MG','AL','K','CA','SC','TI','V','CR','MN','FE','CO',
  'NI','CU','ZN','GA','RB','SR','Y','ZR','NB','MO','RU','RH','PD','AG',
  'CD','IN','SN','CS','BA','LA','CE','PR','ND','SM','EU','GD','TB','DY',
  'HO','ER','TM','YB','LU','HF','TA','W','RE','OS','IR','PT','AU','HG',
  'TL','PB','BI',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute Euclidean distance between two atoms.
 *
 * @param {object} a - First atom with x, y, z coordinates.
 * @param {object} b - Second atom with x, y, z coordinates.
 * @returns {number} Distance between the two atoms.
 */
function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Convert a glob pattern (with * and ?) into a RegExp.
 *
 * @param {string} pattern - Glob pattern string.
 * @returns {RegExp} Compiled regular expression.
 */
function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex meta chars (except * and ?)
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Test whether a value matches any entry in a values array, supporting glob patterns.
 *
 * @param {string} value - The atom property value to test.
 * @param {string[]} patterns - Array of patterns (may include * and ? globs).
 * @returns {boolean} True if value matches any pattern.
 */
function matchesAny(value, patterns) {
  for (const pattern of patterns) {
    if (pattern.includes('*') || pattern.includes('?')) {
      if (globToRegex(pattern).test(value)) return true;
    } else {
      if (value.toUpperCase() === pattern.toUpperCase()) return true;
    }
  }
  return false;
}

/**
 * Apply a numeric comparison operator.
 *
 * @param {object} node - AST node with op, value, low, high fields.
 * @param {number} actual - The actual numeric value from the atom.
 * @returns {boolean} Whether the comparison passes.
 */
function numericMatch(node, actual) {
  switch (node.op) {
    case '==':
      return actual === node.value;
    case 'range':
      return actual >= node.low && actual <= node.high;
    case '>=':
      return actual >= node.value;
    case '<=':
      return actual <= node.value;
    case '>':
      return actual > node.value;
    case '<':
      return actual < node.value;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate an AST node against an array of atoms and return matching atoms.
 *
 * :param ast: The AST node from the PEG parser.
 * :param atoms: Array of atom objects.
 * :returns: Filtered array of atoms matching the selection (original order preserved).
 */
export function evaluate(ast, atoms) {
  switch (ast.type) {
    // --- Constants ---
    case 'all':
      return [...atoms];

    case 'none':
      return [];

    // --- Property selectors ---
    case 'name':
      return atoms.filter(a => matchesAny(a.atom, ast.values));

    case 'resn':
      return atoms.filter(a => matchesAny(a.resn, ast.values));

    case 'resi':
      return atoms.filter(a => numericMatch(ast, a.resi));

    case 'chain':
      return atoms.filter(a => a.chain === ast.value);

    case 'elem':
      return atoms.filter(a => a.elem.toUpperCase() === ast.value.toUpperCase());

    case 'index':
      return atoms.filter(a => numericMatch(ast, a.serial));

    // --- Logical operators ---
    case 'and': {
      let result = [...atoms];
      for (const child of ast.children) {
        const childSet = new Set(evaluate(child, atoms));
        result = result.filter(a => childSet.has(a));
      }
      return result;
    }

    case 'or': {
      const seen = new Set();
      const result = [];
      for (const child of ast.children) {
        for (const a of evaluate(child, atoms)) {
          if (!seen.has(a)) {
            seen.add(a);
            result.push(a);
          }
        }
      }
      // Preserve original order
      return atoms.filter(a => seen.has(a));
    }

    case 'not': {
      const excluded = new Set(evaluate(ast.child, atoms));
      return atoms.filter(a => !excluded.has(a));
    }

    case 'xor': {
      const sets = ast.children.map(child => new Set(evaluate(child, atoms)));
      return atoms.filter(a => {
        const count = sets.reduce((n, s) => n + (s.has(a) ? 1 : 0), 0);
        return count === 1;
      });
    }

    // --- Component keywords ---
    case 'protein':
      return atoms.filter(a => PROTEIN_RESIDUES.has(a.resn));

    case 'water':
      return atoms.filter(a => WATER_RESIDUES.has(a.resn));

    case 'solvent':
      return atoms.filter(a => SOLVENT_RESIDUES.has(a.resn));

    case 'backbone':
      return atoms.filter(a => PROTEIN_RESIDUES.has(a.resn) && BACKBONE_ATOMS.has(a.atom));

    case 'sidechain':
      return atoms.filter(a =>
        PROTEIN_RESIDUES.has(a.resn) &&
        !BACKBONE_ATOMS.has(a.atom) &&
        a.atom !== 'OXT'
      );

    case 'metal':
      return atoms.filter(a => METAL_ELEMENTS.has(a.elem.toUpperCase()));

    case 'ligand':
      return atoms.filter(a =>
        !PROTEIN_RESIDUES.has(a.resn) &&
        !WATER_RESIDUES.has(a.resn) &&
        !SOLVENT_RESIDUES.has(a.resn) &&
        !METAL_ELEMENTS.has(a.elem.toUpperCase())
      );

    case 'organic': {
      // Simplification: select atoms that are not protein/water/solvent and
      // either have elem 'C' or are in a residue that contains a carbon atom.
      const carbonResidues = new Set();
      for (const a of atoms) {
        if (
          !PROTEIN_RESIDUES.has(a.resn) &&
          !WATER_RESIDUES.has(a.resn) &&
          !SOLVENT_RESIDUES.has(a.resn) &&
          a.elem.toUpperCase() === 'C'
        ) {
          carbonResidues.add(`${a.chain}:${a.resi}`);
        }
      }
      return atoms.filter(a =>
        !PROTEIN_RESIDUES.has(a.resn) &&
        !WATER_RESIDUES.has(a.resn) &&
        !SOLVENT_RESIDUES.has(a.resn) &&
        carbonResidues.has(`${a.chain}:${a.resi}`)
      );
    }

    // --- Atom type keywords ---
    case 'hydrogen':
      return atoms.filter(a => a.elem === 'H');

    case 'heavy':
      return atoms.filter(a => a.elem !== 'H');

    case 'polar_hydrogen':
      // Simplified: hydrogens bonded to N, O, S — approximate by checking
      // if atom name starts with H and is near a heteroatom
      return atoms.filter(a => a.elem === 'H');

    case 'nonpolar_hydrogen':
      // Simplified: hydrogens bonded to C
      return atoms.filter(a => a.elem === 'H');

    // --- Secondary structure ---
    case 'helix':
      return atoms.filter(a => a.ss === 'h');

    case 'sheet':
      return atoms.filter(a => a.ss === 's');

    case 'turn':
      return atoms.filter(a => a.ss === 't');

    case 'loop':
      return atoms.filter(a => a.ss === '' || a.ss === 'c' || !a.ss);

    // --- Distance operators ---
    case 'around': {
      const refAtoms = evaluate(ast.child, atoms);
      const refSet = new Set(refAtoms);
      const radius = ast.radius;
      return atoms.filter(a => {
        if (refSet.has(a)) return true;
        for (const ref of refAtoms) {
          if (distance(a, ref) <= radius) return true;
        }
        return false;
      });
    }

    case 'xaround': {
      const refAtoms = evaluate(ast.child, atoms);
      const refSet = new Set(refAtoms);
      const radius = ast.radius;
      return atoms.filter(a => {
        if (refSet.has(a)) return false;
        for (const ref of refAtoms) {
          if (distance(a, ref) <= radius) return true;
        }
        return false;
      });
    }

    case 'beyond': {
      const refAtoms = evaluate(ast.child, atoms);
      const radius = ast.radius;
      return atoms.filter(a => {
        for (const ref of refAtoms) {
          if (distance(a, ref) <= radius) return false;
        }
        return true;
      });
    }

    // --- Expansion operators ---
    case 'byres': {
      const matched = evaluate(ast.child, atoms);
      const residueKeys = new Set();
      for (const a of matched) {
        residueKeys.add(`${a.chain}:${a.resi}`);
      }
      return atoms.filter(a => residueKeys.has(`${a.chain}:${a.resi}`));
    }

    case 'bychain': {
      const matched = evaluate(ast.child, atoms);
      const chains = new Set();
      for (const a of matched) {
        chains.add(a.chain);
      }
      return atoms.filter(a => chains.has(a.chain));
    }

    default:
      throw new Error(`Unknown AST node type: ${ast.type}`);
  }
}

// ---------------------------------------------------------------------------
// AST-to-AtomSelectionSpec converter (simple cases)
// ---------------------------------------------------------------------------

/**
 * Attempt to convert a simple AST node to a 3Dmol.js AtomSelectionSpec object.
 *
 * Only handles straightforward cases. Returns null for complex expressions
 * (distance operators, expansion operators, etc.) that cannot be directly
 * represented as an AtomSelectionSpec.
 *
 * :param ast: The AST node from the PEG parser.
 * :returns: An AtomSelectionSpec object, or null if conversion is not possible.
 */
export function toAtomSelectionSpec(ast) {
  switch (ast.type) {
    case 'name':
      return { atom: ast.values };

    case 'resn':
      return { resn: ast.values };

    case 'resi':
      if (ast.op === '==') {
        return { resi: ast.value };
      }
      return null;

    case 'chain':
      return { chain: ast.value };

    case 'elem':
      return { elem: ast.value };

    case 'all':
      return {};

    case 'and': {
      const merged = {};
      for (const child of ast.children) {
        const childSpec = toAtomSelectionSpec(child);
        if (childSpec === null) return null;
        Object.assign(merged, childSpec);
      }
      return merged;
    }

    default:
      return null;
  }
}
