// PyMOL Selection Language Parser — Peggy PEG Grammar
// Produces AST nodes for consumption by 3Dmol.js GUI.
//
// Operator precedence (lowest to highest): XOR < OR < AND < NOT

Selection
  = _ expr:Expression _ { return expr; }

// ---------------------------------------------------------------------------
// Expression hierarchy (precedence climbing)
// ---------------------------------------------------------------------------

Expression
  = XorExpr

XorExpr
  = head:OrExpr tail:(_ XOR _ OrExpr)* {
      if (tail.length === 0) return head;
      const children = [head, ...tail.map(t => t[3])];
      return { type: 'xor', children };
    }

OrExpr
  = head:AndExpr tail:(_ OR _ AndExpr)* {
      if (tail.length === 0) return head;
      const children = [head, ...tail.map(t => t[3])];
      return { type: 'or', children };
    }

AndExpr
  = head:NotExpr tail:(_ AND _ NotExpr)* {
      if (tail.length === 0) return head;
      const children = [head, ...tail.map(t => t[3])];
      return { type: 'and', children };
    }

NotExpr
  = NOT __ child:NotExpr { return { type: 'not', child }; }
  / Primary

// ---------------------------------------------------------------------------
// Primary — ordered alternatives (most specific first)
// ---------------------------------------------------------------------------

Primary
  = "(" _ expr:Expression _ ")" { return expr; }
  / ByResSpec
  / ByChainSpec
  / AroundSpec
  / XAroundSpec
  / BeyondSpec
  / NameSpec
  / ResnSpec
  / ResiSpec
  / ChainSpec
  / ElemSpec
  / IndexSpec
  / MacroSpec
  / NonpolarHSpec
  / PolarHSpec
  / HeavySpec
  / HydrogenSpec
  / ProteinSpec
  / LigandSpec
  / WaterSpec
  / SolventSpec
  / OrganicSpec
  / BackboneSpec
  / SidechainSpec
  / MetalSpec
  / HelixSpec
  / SheetSpec
  / TurnSpec
  / LoopSpec
  / AllSpec
  / NoneSpec

// ---------------------------------------------------------------------------
// Expansion operators
// ---------------------------------------------------------------------------

ByResSpec
  = "byres"i !IdentChar __ child:Primary { return { type: 'byres', child }; }

ByChainSpec
  = "bychain"i !IdentChar __ child:Primary { return { type: 'bychain', child }; }

// ---------------------------------------------------------------------------
// Distance operators
// ---------------------------------------------------------------------------

AroundSpec
  = "around"i !IdentChar __ r:Float __ child:Primary {
      return { type: 'around', radius: r, child };
    }

XAroundSpec
  = "xaround"i !IdentChar __ r:Float __ child:Primary {
      return { type: 'xaround', radius: r, child };
    }

BeyondSpec
  = "beyond"i !IdentChar __ r:Float __ child:Primary {
      return { type: 'beyond', radius: r, child };
    }

// ---------------------------------------------------------------------------
// Property specifiers
// ---------------------------------------------------------------------------

NameSpec
  = "name"i !IdentChar __ vals:ValueList { return { type: 'name', values: vals }; }

ResnSpec
  = "resn"i !IdentChar __ vals:ValueList { return { type: 'resn', values: vals }; }

ResiSpec
  = "resi"i !IdentChar __ spec:NumericSpec { return { type: 'resi', ...spec }; }

IndexSpec
  = "index"i !IdentChar __ spec:NumericSpec { return { type: 'index', ...spec }; }

NumericSpec
  = op:CompOp _ n:Number { return { op, value: n }; }
  / lo:Number "-" hi:Number { return { op: 'range', low: lo, high: hi }; }
  / n:Number { return { op: '==', value: n }; }

ChainSpec
  = "chain"i !IdentChar __ id:ChainId { return { type: 'chain', value: id }; }

ElemSpec
  = "elem"i !IdentChar __ sym:ElemSymbol { return { type: 'elem', value: sym }; }

// ---------------------------------------------------------------------------
// Macro syntax: //chain/resi/name
// ---------------------------------------------------------------------------

MacroSpec
  = "//" chain:ChainId? "/" tail:MacroTail {
      const parts = [];
      if (chain) parts.push({ type: 'chain', value: chain });
      if (tail.resi !== null && tail.resi !== undefined) parts.push({ type: 'resi', op: '==', value: tail.resi });
      if (tail.name) parts.push({ type: 'name', values: [tail.name] });
      if (parts.length === 0) error('Empty macro specifier');
      if (parts.length === 1) return parts[0];
      return { type: 'and', children: parts };
    }

MacroTail
  = resi:MacroResi "/" name:GlobPattern? { return { resi, name: name || null }; }
  / "/" name:GlobPattern?                 { return { resi: null, name: name || null }; }
  / name:GlobPattern                      { return { resi: null, name }; }
  / ""                                    { return { resi: null, name: null }; }

MacroResi
  = digits:[0-9]+ { return parseInt(digits.join(''), 10); }

// ---------------------------------------------------------------------------
// Component keywords
// ---------------------------------------------------------------------------

ProteinSpec
  = "protein"i !IdentChar { return { type: 'protein' }; }

LigandSpec
  = "ligand"i !IdentChar { return { type: 'ligand' }; }

WaterSpec
  = "water"i !IdentChar { return { type: 'water' }; }

SolventSpec
  = "solvent"i !IdentChar { return { type: 'solvent' }; }

OrganicSpec
  = "organic"i !IdentChar { return { type: 'organic' }; }

BackboneSpec
  = ("backbone"i / "bb"i) !IdentChar { return { type: 'backbone' }; }

SidechainSpec
  = ("sidechain"i / "sc"i) !IdentChar { return { type: 'sidechain' }; }

MetalSpec
  = ("metals"i / "metal"i) !IdentChar { return { type: 'metal' }; }

// ---------------------------------------------------------------------------
// Atom type keywords
// ---------------------------------------------------------------------------

NonpolarHSpec
  = ("nonpolar_hydrogen"i / "apolarh"i) !IdentChar { return { type: 'nonpolar_hydrogen' }; }

PolarHSpec
  = ("polar_hydrogen"i / "polarh"i) !IdentChar { return { type: 'polar_hydrogen' }; }

HeavySpec
  = "heavy"i !IdentChar { return { type: 'heavy' }; }

HydrogenSpec
  = ("hydrogen"i / "h"i) !IdentChar { return { type: 'hydrogen' }; }

// ---------------------------------------------------------------------------
// Secondary structure keywords
// ---------------------------------------------------------------------------

HelixSpec
  = "helix"i !IdentChar { return { type: 'helix' }; }

SheetSpec
  = "sheet"i !IdentChar { return { type: 'sheet' }; }

TurnSpec
  = "turn"i !IdentChar { return { type: 'turn' }; }

LoopSpec
  = "loop"i !IdentChar { return { type: 'loop' }; }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

AllSpec
  = "all"i !IdentChar { return { type: 'all' }; }

NoneSpec
  = "none"i !IdentChar { return { type: 'none' }; }

// ---------------------------------------------------------------------------
// Logical operator keywords
// ---------------------------------------------------------------------------

AND = "and"i !IdentChar
OR  = "or"i  !IdentChar
NOT = "not"i !IdentChar
XOR = "xor"i !IdentChar

// ---------------------------------------------------------------------------
// Value list (for name / resn)
// ---------------------------------------------------------------------------

ValueList
  = first:Value rest:("+" v:Value { return v; })* { return [first, ...rest]; }

Value
  = QuotedString
  / GlobPattern

QuotedString
  = '"' chars:[^"]* '"' { return chars.join(''); }

GlobPattern
  = chars:[a-zA-Z0-9*?_\-]+ { return chars.join(''); }

// ---------------------------------------------------------------------------
// Comparison operators
// ---------------------------------------------------------------------------

CompOp
  = ">=" { return '>='; }
  / "<=" { return '<='; }
  / ">"  { return '>'; }
  / "<"  { return '<'; }

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

Number
  = digits:[0-9]+ { return parseInt(digits.join(''), 10); }

Float
  = neg:"-"? int_part:[0-9]+ frac:("." dec:[0-9]* { return '.' + dec.join(''); })? {
      return parseFloat((neg || '') + int_part.join('') + (frac || ''));
    }

ChainId
  = c:[a-zA-Z0-9] { return c; }

ElemSymbol
  = first:[a-zA-Z] rest:[a-z]? { return first + (rest || ''); }

IdentChar
  = [a-zA-Z0-9_]

// ---------------------------------------------------------------------------
// Whitespace
// ---------------------------------------------------------------------------

_ "optional whitespace"
  = [ \t\n\r]*

__ "required whitespace"
  = [ \t\n\r]+
