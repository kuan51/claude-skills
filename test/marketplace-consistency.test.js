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
test('marketplace.json and each plugin.json agree on name, version and description', () => {
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
    assert.equal(
      pluginJson.description, entry.description,
      `${entry.name}: description drift -- plugin.json and marketplace.json descriptions differ; update both in the same commit.`
    );
  }
});

// Claude desktop and claude.ai refuse a plugin description over 500 characters (#163). The
// drift check above keeps plugin.json equal to this, so checking the marketplace covers both.
test('every plugin description fits the marketplace limit', () => {
  for (const entry of marketplace.plugins) {
    assert.ok(
      (entry.description || '').length <= 499,
      `${entry.name}: description is ${entry.description.length} characters; the marketplace allows at most 499 here`
    );
  }
});

// Caret ranges only, as npm reads them: ^2.0 accepts 2.x.y, ^0.3 accepts 0.3.x, ^0.0 accepts 0.0.x, ^0.0.4 only 0.0.4.
// shortcut: any other range form throws, so a new form fails the test until this learns it.
function caretSatisfies(range, version) {
  const m = /^\^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(range);
  if (!m) throw new Error(`unsupported range "${range}": only ^X.Y or ^X.Y.Z is understood`);
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
  const [vMaj, vMin, vPat] = version.split('.').map(Number);
  if (vMaj !== maj) return false;
  if (maj > 0) return vMin > min || (vMin === min && vPat >= pat);
  if (vMin !== min) return false;
  // ^0.0 (no patch) is <0.1.0 in npm; only ^0.0.Z pins the patch exactly.
  return min > 0 || m[3] === undefined ? vPat >= pat : vPat === pat;
}

test('caretSatisfies follows npm caret semantics', () => {
  assert.ok(caretSatisfies('^2.0', '2.0.0'));
  assert.ok(caretSatisfies('^2.0', '2.9.3'));
  assert.ok(!caretSatisfies('^2.0', '3.0.0'));
  assert.ok(!caretSatisfies('^2.1', '2.0.9'));
  assert.ok(!caretSatisfies('^3.0', '2.0.0'));
  assert.ok(caretSatisfies('^0.3', '0.3.7'));
  assert.ok(!caretSatisfies('^0.3', '0.4.0'));
  assert.ok(caretSatisfies('^0.0.4', '0.0.4'));
  assert.ok(!caretSatisfies('^0.0.4', '0.0.5'));
  assert.ok(caretSatisfies('^0.0', '0.0.3'));
  assert.ok(!caretSatisfies('^0.0', '0.1.0'));
  assert.throws(() => caretSatisfies('~2.0', '2.0.0'));
  assert.throws(() => caretSatisfies('>=2.0', '2.0.0'));
});

// Claude Code dependencies are hard: a missing or unsatisfied one disables the plugin that declared it.
test("every plugin's dependencies are registered and their ranges match the current version", () => {
  const versions = new Map(marketplace.plugins.map((e) => [e.name, e.version]));
  for (const entry of marketplace.plugins) {
    const deps = JSON.parse(fs.readFileSync(pluginJsonPathFor(entry), 'utf8')).dependencies || [];
    for (const dep of deps) {
      const name = typeof dep === 'string' ? dep : dep.name;
      assert.ok(versions.has(name), `${entry.name}: depends on "${name}", which is not registered in marketplace.json`);
      assert.ok(dep.version, `${entry.name}: dependency "${name}" has no version range`);
      assert.ok(
        caretSatisfies(dep.version, versions.get(name)),
        `${entry.name}: dependency range ${name} ${dep.version} does not accept its current version ${versions.get(name)}`
      );
    }
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
