/**
 * Demo initialization script.
 *
 * Fetches PDB files from demo/assets/ and configures window.__C3D_INIT__
 * so the main application loads them on startup.
 */

const FILES = [
  '5fqd-1',
  '5hxb-1',
  '6bn7-1',
  '6boy-1',
  '6h0f-1',
];

const ENABLED = new Set(['5fqd-1']);
const LDD_GROUP = { name: 'LDDs', members: ['6bn7-1', '6boy-1'] };

async function loadPDB(name) {
  const resp = await fetch(`/demo/assets/${name}.pdb`);
  if (!resp.ok) throw new Error(`Failed to fetch ${name}.pdb: ${resp.status}`);
  return resp.text();
}

const entries = await Promise.all(
  FILES.map(async (name) => {
    const data = await loadPDB(name);
    return { name, data, format: 'pdb', disabled: !ENABLED.has(name) };
  })
);

// Separate LDD group members from the flat entries
const lddNames = new Set(LDD_GROUP.members);
const flatEntries = entries.filter((e) => !lddNames.has(e.name));
const lddEntries = entries.filter((e) => lddNames.has(e.name));

const molecules = [
  ...flatEntries,
  { group: LDD_GROUP.name, entries: lddEntries },
];

window.__C3D_INIT__ = {
  molecules,
  operations: [{ op: 'preset', name: 'sites' }],
  view: [-132.68175, -114.9638125, -186.015, 56.730947931242525, 0.5202687781357112, -0.22768503834899134, -0.10416441395320486, -0.8164739412099927],
};
