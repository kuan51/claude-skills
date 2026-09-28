'use strict';
// The runner's free parts: cells that fail alone, the arguments and fixtures every session gets,
// the clean room and the cached superpowers arm. A stand-in replaces the session, and every home,
// cache and plugin directory is a fake under the temp dir, never this machine's own.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { spawnSync } = require('node:child_process');
const run = require('../evals/harness/run.js');

const SAMPLE = path.join(__dirname, 'fixtures', 'transcript-sample.jsonl');
const TMP = fs.realpathSync.native(os.tmpdir());
const made = [];
const tmp = (p) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), p));
  made.push(d);
  return d;
};
const iteration = `runner-test-${process.pid}`;
test.after(() => {
  for (const d of [...made, path.join(TMP, 'fabflows-bench', `i${iteration}`)]) fs.rmSync(d, { recursive: true, force: true });
});

const baseArgs = (extra = {}) => ({ iteration, runsDir: tmp('runs-'), parallel: 1, model: 'fable', effort: 'medium', settingsPath: path.join(tmp('set-'), 'settings.json'), ...extra });
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const after = (args, flag) => args[args.indexOf(flag) + 1];

// A stand-in for child_process.spawn: records each call and ends the "session" with an event.
// A call is recorded only once onCall returns, so a check that throws there (which the runner
// would record as a launch error) leaves the call uncounted and fails the test's count.
function standIn(end, onCall = () => {}) {
  const calls = [];
  const spawnSession = (command, args, opts) => {
    onCall(opts);
    calls.push({ command, args, opts });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    process.nextTick(() => {
      child.stdout.end();
      child.stderr.end();
      if (end === 'error') child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));
      else child.emit('close', 0);
    });
    return child;
  };
  return { calls, spawnSession };
}

test('a cell whose fixture setup throws gets an error.json naming its stage, and the next cell still runs', async () => {
  const a = baseArgs();
  const [first, second] = run.buildCells({ tasks: [7], arms: ['without_skill'], repeats: 2 });
  const broken = { ...first, task: { ...first.task, setup: [{ file: 'SPEC.md', find: 'text the spec never contains', replace: '' }] } };
  const { calls, spawnSession } = standIn('error');
  const { failed, exitCode } = await run.runAll(a, [broken, second], spawnSession);
  const e1 = readJson(path.join(run.runDirFor(a, broken), 'error.json'));
  assert.equal(e1.stage, 'fixture');
  assert.match(e1.message, /does not contain/);
  assert.equal(calls.length, 1, 'the second cell still launched');
  assert.equal(calls[0].opts.cwd.endsWith('-r2'), true);
  // The stand-in's spawn 'error' is recorded the same way, at the launch stage.
  const e2 = readJson(path.join(run.runDirFor(a, second), 'error.json'));
  assert.deepEqual(e2, { stage: 'launch', message: 'spawn claude ENOENT' });
  assert.equal(failed.length, 2);
  assert.notEqual(exitCode, 0);
});

test('a successful regrade removes the cell\'s stale error.json', async () => {
  const a = baseArgs({ regrade: true });
  const [cell] = run.buildCells({ tasks: [11], arms: null, repeats: 1 });
  const dir = run.runDirFor(a, cell);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(SAMPLE, path.join(dir, 'transcript.jsonl'));
  fs.writeFileSync(path.join(dir, 'error.json'), '{"stage":"grade","message":"old"}\n');
  const { failed, exitCode, results } = await run.runAll(a, [cell], () => assert.fail('a regrade never launches a session'));
  assert.deepEqual(failed, []);
  assert.equal(exitCode, 0);
  assert.ok(results[0].grading, 'the cell was graded');
  assert.equal(fs.existsSync(path.join(dir, 'error.json')), false);
});

test('the baseline matrix: 54 cells for tasks 1-6 at 3 repeats, 18 per arm, 6 for task 7 at 2, and the first arm rotates', () => {
  const cells = run.buildCells({ tasks: [1, 2, 3, 4, 5, 6], arms: null, repeats: 3 });
  assert.equal(cells.length, 54);
  for (const arm of ['with_skill', 'without_skill', 'superpowers']) assert.equal(cells.filter((c) => c.arm === arm).length, 18, arm);
  assert.equal(run.buildCells({ tasks: [7], arms: null, repeats: 2 }).length, 6);
  const t1 = cells.filter((c) => c.task.id === 1);
  assert.notEqual(t1.find((c) => c.run === 1).arm, t1.find((c) => c.run === 2).arm, 'repeat 1 and repeat 2 start with different arms');
});

test('every arm loads project settings only, and each plugin arm its own staged copy', () => {
  const a = { tasks: [1], arms: null, repeats: 1, model: 'fable', effort: 'medium', stagedPluginDirs: { with_skill: '/plugin-with_skill', superpowers: '/plugin-superpowers' } };
  const byArm = Object.fromEntries(run.buildCells(a).map((c) => [c.arm, run.claudeArgs(a, c, '/run', '/settings.json')]));
  assert.deepEqual(Object.keys(byArm).sort(), ['superpowers', 'with_skill', 'without_skill']);
  for (const args of Object.values(byArm)) assert.equal(after(args, '--setting-sources'), 'project');
  assert.equal(after(byArm.with_skill, '--plugin-dir'), '/plugin-with_skill');
  assert.equal(after(byArm.superpowers, '--plugin-dir'), '/plugin-superpowers');
  assert.equal(byArm.without_skill.includes('--plugin-dir'), false);
  for (const id of [8, 10]) {
    for (const c of run.buildCells({ tasks: [id], arms: null, repeats: 1 })) assert.equal(after(run.claudeArgs({ ...a, stagedPluginDirs: {} }, c, '/run', '/s.json'), '--setting-sources'), 'project', `task ${id} ${c.arm}`);
  }

  // An agent task reads its frontmatter from its own arm's staged copy.
  const staged = tmp('plugin-agent-');
  fs.mkdirSync(path.join(staged, 'agents'));
  fs.writeFileSync(path.join(staged, 'agents', 'explorer.md'), '---\nname: explorer\nmodel: sonnet\n---\nbody\n');
  const b = { tasks: [10], arms: null, repeats: 1, model: 'fable', effort: 'medium', stagedPluginDirs: { agent: staged, other: '/elsewhere' } };
  const args = run.claudeArgs(b, run.buildCells(b)[0], '/run', '/s.json');
  assert.equal(after(args, '--model'), 'sonnet');
  assert.equal(after(args, '--plugin-dir'), staged);
});

test('every fixture kind gets an unresolvable origin, and every session an empty gh config, no credentials and a clean git status', async (t) => {
  const a = baseArgs();
  const cells = [...run.buildCells({ tasks: [1], arms: ['without_skill'], repeats: 1 }), ...run.buildCells({ tasks: [7], arms: ['without_skill'], repeats: 1 })];
  const saved = process.env.GH_TOKEN;
  process.env.GH_TOKEN = 'dummy-token';
  t.after(() => {
    if (saved === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = saved;
  });
  const seen = [];
  const { calls, spawnSession } = standIn('error', (opts) => {
    const origin = spawnSync('git', ['-C', opts.cwd, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
    // The session's own git: no system or global config, so line endings come from the fixture.
    const status = spawnSync('git', ['-C', opts.cwd, 'status', '--porcelain'], { env: opts.env, encoding: 'utf8' });
    const pinned = spawnSync('git', ['-C', opts.cwd, 'config', '--local', '--get', 'core.autocrlf'], { encoding: 'utf8' }).stdout.trim();
    seen.push({ origin, gh: fs.readdirSync(opts.env.GH_CONFIG_DIR), env: opts.env, status: status.stdout + status.stderr, pinned });
  });
  await run.runAll(a, cells, spawnSession);
  assert.equal(calls.length, 2, 'both the repo and the dir fixture reached the session');
  const preparing = spawnSync('git', ['config', '--get', 'core.autocrlf'], { cwd: TMP, encoding: 'utf8' }).stdout.trim();
  const secrets = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GIT_ASKPASS', 'SSH_ASKPASS'];
  for (const s of seen) {
    assert.ok(new URL(s.origin).hostname.endsWith('.invalid'), `${s.origin} is not under the reserved .invalid domain`);
    assert.deepEqual(s.gh, []);
    assert.deepEqual(Object.keys(s.env).filter((k) => secrets.includes(k.toUpperCase())), []);
    assert.deepEqual([s.env.GIT_CONFIG_NOSYSTEM, s.env.GIT_TERMINAL_PROMPT, s.env.GIT_SSH_COMMAND], ['1', '0', 'false']);
    assert.equal(fs.readFileSync(s.env.GIT_CONFIG_GLOBAL, 'utf8'), '');
    assert.equal(s.status, '', 'the session sees the prepared fixture unmodified');
    assert.equal(s.pinned, preparing, 'the preparing git\'s core.autocrlf is pinned in the fixture');
  }
});

function writeManifest(dir, manifest) {
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest));
}

test('the clean room turns off each synced plugin by its plugin.json name, once, and the settings-enabled ones', () => {
  const home = tmp('home-');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'ciso@claude-skills': true } }));
  const synced = path.join(home, '.claude', 'plugins', 'synced');
  writeManifest(path.join(synced, 'org-a', 'data-analysis-review~g2'), { name: 'data-analysis-review' });
  writeManifest(path.join(synced, 'org-b', 'data-analysis-review'), { name: 'data-analysis-review' });
  writeManifest(path.join(synced, 'org-a', 'fabflows'), { name: 'fabflows' });
  fs.mkdirSync(path.join(synced, 'org-a', 'no-manifest'), { recursive: true });
  const s = run.cleanRoomSettings(home);
  assert.deepEqual(s.enabledPlugins, { 'ciso@claude-skills': false, 'data-analysis-review@synced': false, 'fabflows@synced': false });
  assert.equal('syncClaudeAiPlugins' in s, false);
  assert.equal(JSON.stringify(s).includes('syncClaudeAiPlugins'), false);
});

function fakeCache() {
  const home = tmp('home-');
  const cache = path.join(home, '.claude', 'plugins', 'cache', 'claude-plugins-official', 'superpowers');
  for (const v of ['6.9.0', '6.10.0']) {
    writeManifest(path.join(cache, v), { name: 'superpowers', version: v });
    fs.mkdirSync(path.join(cache, v, 'skills', 'brainstorming'), { recursive: true });
    fs.writeFileSync(path.join(cache, v, 'skills', 'brainstorming', 'SKILL.md'), `brainstorming ${v}\n`);
  }
  const market = path.join(home, '.claude', 'plugins', 'marketplaces', 'claude-plugins-official', '.claude-plugin');
  fs.mkdirSync(market, { recursive: true });
  fs.writeFileSync(path.join(market, 'marketplace.json'), JSON.stringify({ plugins: [{ name: 'other', source: { sha: 'nope' } }, { name: 'superpowers', source: { sha: 'abc123' } }] }));
  return { home, cache };
}

test('the superpowers arm resolves to the highest semver copy, and its version, tree hash and marketplace pin are recorded', () => {
  const { home, cache } = fakeCache();
  assert.equal(run.cachedPluginDir('superpowers@claude-plugins-official', home), path.join(cache, '6.10.0'));
  const a = { tasks: [1], arms: ['with_skill', 'superpowers'], repeats: 1, confirm: true };
  const cells = run.buildCells(a);
  const sources = run.pluginSources(a, cells, home);
  assert.equal(sources.superpowers.src, path.join(cache, '6.10.0'));
  assert.ok(sources.with_skill.src.endsWith(path.join('plugins', 'fabflows')));
  // --plugin-dir overrides only an arm that names a pluginDir.
  const over = run.pluginSources({ ...a, pluginDir: '/snapshot' }, cells, home);
  assert.equal(over.with_skill.src, '/snapshot');
  assert.equal(over.superpowers.src, path.join(cache, '6.10.0'));

  const iterDir = tmp('iter-');
  run.stagePluginArms(a, { superpowers: sources.superpowers }, iterDir, home);
  assert.equal(a.stagedPluginDirs.superpowers, path.join(iterDir, 'plugin-superpowers'));
  assert.equal(fs.readFileSync(path.join(a.stagedPluginDirs.superpowers, 'skills', 'brainstorming', 'SKILL.md'), 'utf8'), 'brainstorming 6.10.0\n');
  const r = a.pluginRecords.superpowers;
  assert.equal(r.name, 'superpowers');
  assert.equal(r.version, '6.10.0');
  assert.match(r.treeSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.treeSha256, run.pluginRecord(path.join(cache, '6.10.0')).treeSha256, 'the staged copy hashes like its source');
  assert.notEqual(r.treeSha256, run.pluginRecord(path.join(cache, '6.9.0')).treeSha256);
  assert.equal(r.marketplacePin.sha, 'abc123');
  assert.match(r.marketplacePin.label, /at run time/);
});

test('a missing superpowers copy stops only a run that would launch the arm', () => {
  const home = tmp('empty-home-');
  const withIt = { tasks: [1], arms: null, repeats: 1 };
  const cells = run.buildCells(withIt);
  assert.throws(() => run.pluginSources({ ...withIt, confirm: true }, cells, home), /superpowers@claude-plugins-official is not in the plugin cache.*install superpowers, then disable it/);
  const without = { tasks: [1], arms: ['with_skill', 'without_skill'], repeats: 1, confirm: true };
  assert.doesNotThrow(() => run.pluginSources(without, run.buildCells(without), home), 'a run without the arm');
  assert.equal(run.pluginSources({ ...withIt, confirm: false }, cells, home).superpowers.src, null, 'a dry run reports it and carries on');
  assert.doesNotThrow(() => run.pluginSources({ ...withIt, confirm: true, regrade: true }, cells, home), 'a regrade');
});
