'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Repo-level checks that span plugins, so they can't live inside any one plugin's test dir.
// These exist because a plugin's version and description are duplicated between its own
// plugin.json and the root marketplace.json, and nothing else notices when the two drift --
// ciso once advertised "starting with HITRUST CSF e1" at 0.1.0 in the marketplace while its
// plugin.json had already moved on. See CLAUDE.md.

const REPO_ROOT = path.join(__dirname, '..');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const PLUGINS_DIR = path.join(REPO_ROOT, 'plugins');

const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));

const SEMVER = /^\d+\.\d+\.\d+$/;

function pluginJsonPathFor(entry) {
  // "./plugins/ciso" -> <repo>/plugins/ciso/.claude-plugin/plugin.json
  return path.join(REPO_ROOT, entry.source.replace(/^\.\//, ''), '.claude-plugin', 'plugin.json');
}

test('the marketplace manifest is well-formed', () => {
  assert.ok(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0);
  const seen = new Set();
  for (const entry of marketplace.plugins) {
    assert.ok(entry.name, 'every entry needs a name');
    assert.ok(!seen.has(entry.name), `duplicate plugin entry: ${entry.name}`);
    seen.add(entry.name);
    assert.ok(entry.source, `${entry.name}: needs a source path`);
    assert.match(entry.version || '', SEMVER, `${entry.name}: marketplace version must be semver`);
  }
});

test("every registered plugin's source directory exists and ships a plugin.json", () => {
  for (const entry of marketplace.plugins) {
    const dir = path.join(REPO_ROOT, entry.source.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(dir), `${entry.name}: source path "${entry.source}" does not exist`);
    assert.ok(
      fs.existsSync(pluginJsonPathFor(entry)),
      `${entry.name}: no .claude-plugin/plugin.json under ${entry.source}`
    );
  }
});

// The check that actually earns its keep.
test('marketplace.json and each plugin.json agree on name and version', () => {
  for (const entry of marketplace.plugins) {
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPathFor(entry), 'utf8'));

    assert.equal(
      pluginJson.name, entry.name,
      `${entry.name}: plugin.json name "${pluginJson.name}" does not match its marketplace entry`
    );
    assert.match(pluginJson.version || '', SEMVER, `${entry.name}: plugin.json version must be semver`);
    assert.equal(
      pluginJson.version, entry.version,
      `${entry.name}: version drift -- plugin.json says ${pluginJson.version}, marketplace.json says ` +
      `${entry.version}. plugin.json is the source of truth; update the marketplace entry in the same commit.`
    );
  }
});

test('every plugin directory is registered in the marketplace', () => {
  const registered = new Set(
    marketplace.plugins.map((e) => path.basename(e.source.replace(/^\.\//, '')))
  );
  for (const dirent of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    // Only claim a directory is an unregistered plugin if it actually looks like one.
    if (!fs.existsSync(path.join(PLUGINS_DIR, dirent.name, '.claude-plugin', 'plugin.json'))) continue;
    assert.ok(
      registered.has(dirent.name),
      `plugins/${dirent.name}/ ships a plugin.json but is not registered in marketplace.json -- it will never be installable`
    );
  }
});
