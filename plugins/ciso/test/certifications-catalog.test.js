'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const CATALOG_PATH = path.join(PLUGIN_ROOT, 'assets', 'certifications.json');

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

// Every <tier>.v<version>.structure.json a certification module ships, paired with the skill
// directory that owns it. Note this enumerates TIERS, not certifications: hitrust alone ships
// e1/i1/r2, which are three tiers of the one `hitrust` catalog entry.
function findStructureFiles() {
  const out = [];
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const controlsDir = path.join(SKILLS_DIR, entry.name, 'controls');
    if (!fs.existsSync(controlsDir)) continue;
    for (const file of fs.readdirSync(controlsDir)) {
      const match = /^(.+)\.v.+\.structure\.json$/.exec(file);
      if (match) out.push({ skillDir: entry.name, tier: match[1], file: path.join(controlsDir, file) });
    }
  }
  return out;
}

const structureFiles = findStructureFiles();

test('the catalog is a non-empty array of well-formed entries with unique certKeys', () => {
  assert.ok(Array.isArray(catalog), 'certifications.json must be a JSON array');
  assert.ok(catalog.length > 0, 'the catalog must list at least one certification');

  const seen = new Set();
  for (const entry of catalog) {
    assert.equal(typeof entry.certKey, 'string');
    assert.ok(entry.certKey.length > 0, 'certKey must be non-empty');
    assert.ok(!seen.has(entry.certKey), `duplicate certKey: ${entry.certKey}`);
    seen.add(entry.certKey);

    assert.equal(typeof entry.displayName, 'string');
    assert.ok(entry.displayName.length > 0, `${entry.certKey}: displayName must be non-empty`);
    assert.equal(typeof entry.skill, 'string');
    assert.ok(entry.skill.startsWith('ciso:'), `${entry.certKey}: skill must be a ciso:<name> invocation, got "${entry.skill}"`);
    assert.ok(Array.isArray(entry.tiers) && entry.tiers.length > 0, `${entry.certKey}: tiers must be a non-empty array`);
    assert.equal(typeof entry.summary, 'string');
    assert.ok(entry.summary.length > 0, `${entry.certKey}: summary must be non-empty -- it is the only text an untracked card shows`);
  }
});

// The renderer turns a certKey into a filename (cert-<certKey>.html) and the template turns it
// into an href, both via the same [a-z0-9-] reduction. A certKey that isn't already in that
// alphabet would still work, but the file on disk would no longer visibly match the key -- so
// keep them literal.
test('every certKey is already filename-safe, so cert-<certKey>.html matches the key exactly', () => {
  for (const entry of catalog) {
    assert.match(entry.certKey, /^[a-z0-9-]+$/, `certKey "${entry.certKey}" must be lowercase letters, digits and hyphens only`);
  }
});

test('every shipped control structure file is claimed by a catalog entry', () => {
  assert.ok(structureFiles.length > 0, 'expected at least one shipped structure file');

  for (const { skillDir, tier, file } of structureFiles) {
    const entry = catalog.find((e) => e.certKey === skillDir);
    assert.ok(
      entry,
      `${path.relative(PLUGIN_ROOT, file)} lives under skills/${skillDir}/, but no catalog entry has certKey "${skillDir}" -- the meta dashboard would never show it`
    );
    assert.ok(
      entry.tiers.includes(tier),
      `${path.relative(PLUGIN_ROOT, file)} ships tier "${tier}", which is missing from catalog entry "${skillDir}"'s tiers: [${entry.tiers.join(', ')}]`
    );
  }
});

test("every catalog entry's declared tiers all ship a structure file", () => {
  for (const entry of catalog) {
    for (const tier of entry.tiers) {
      const found = structureFiles.some((s) => s.skillDir === entry.certKey && s.tier === tier);
      assert.ok(
        found,
        `catalog entry "${entry.certKey}" declares tier "${tier}", but skills/${entry.certKey}/controls/ ships no ${tier}.v*.structure.json`
      );
    }
  }
});

test("every catalog entry's skill resolves to a real SKILL.md", () => {
  for (const entry of catalog) {
    const skillName = entry.skill.slice('ciso:'.length);
    const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    assert.ok(
      fs.existsSync(skillPath),
      `catalog entry "${entry.certKey}" points at "${entry.skill}", but ${path.relative(PLUGIN_ROOT, skillPath)} does not exist -- the untracked card would tell users to run a skill that isn't there`
    );
  }
});
