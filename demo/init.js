/**
 * Demo initialization script.
 *
 * Fetches PDB files from demo/assets/ and configures window.__C3D_INIT__
 * so the main application loads them on startup.
 */

const PDB_FILES = [
  '5fqd-1',
  '5hxb-1',
  '6bn7-1',
  '6boy-1',
  '6h0f-1',
];

const ENABLED = new Set(['5fqd-1']);
const LDD_GROUP = { name: 'LDDs', members: ['6bn7-1', '6boy-1'] };

async function loadAsset(name, ext) {
  const resp = await fetch(`/demo/assets/${name}.${ext}`);
  if (!resp.ok) throw new Error(`Failed to fetch ${name}.${ext}: ${resp.status}`);
  return resp.text();
}

const [pdbEntries, receptorData, cc885Data] = await Promise.all([
  Promise.all(
    PDB_FILES.map(async (name) => {
      const data = await loadAsset(name, 'pdb');
      return { name, data, format: 'pdb', disabled: !ENABLED.has(name) };
    })
  ),
  loadAsset('5hxb-receptor', 'pdb'),
  loadAsset('CC-885_docked', 'sdf'),
]);

// Split multi-molecule SDF into individual records
function splitSDF(sdfText) {
  const records = sdfText.split(/\$\$\$\$\s*\n?/).filter((r) => r.trim());
  const counts = new Map();
  return records.map((block) => {
    const title = block.split('\n')[0].trim() || 'mol';
    const count = (counts.get(title) || 0) + 1;
    counts.set(title, count);
    return { name: `${title}.${count}`, data: block + '$$$$\n', format: 'sdf' };
  });
}

// Build 5hxb-receptor as a hierarchy parent with docked poses as children (disabled)
const cc885Children = splitSDF(cc885Data);
const receptorHierarchy = {
  name: '5hxb-receptor',
  data: receptorData,
  format: 'pdb',
  disabled: true,
  children: cc885Children.map((c) => ({ ...c, disabled: true })),
};

// Separate LDD group members from the flat entries
const lddNames = new Set(LDD_GROUP.members);
const otherEntries = pdbEntries.filter((e) => !lddNames.has(e.name));
const lddEntries = pdbEntries.filter((e) => lddNames.has(e.name));

const molecules = [
  ...otherEntries,
  { group: LDD_GROUP.name, entries: lddEntries },
  receptorHierarchy,
];

window.__C3D_INIT__ = {
  molecules,
  operations: [{ op: 'preset', name: 'sites' }],
  view: [-132.68175, -114.9638125, -186.015, 56.730947931242525, 0.5202687781357112, -0.22768503834899134, -0.10416441395320486, -0.8164739412099927],
};
