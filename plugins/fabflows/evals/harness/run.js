'use strict';
// Runs the fabflows benchmark matrix: for each task x arm x repeat, clone the repo into a fresh
// fixture, launch a headless `claude -p` lead, capture the stream, then measure and grade.
//
// This is on-demand tooling. It spends real tokens (a Fable lead per run), so it never runs
// under `node --test`, and without --confirm it only prints the matrix and the caps.
//
//   node plugins/fabflows/evals/harness/run.js --iteration 1            # print the plan
//   node plugins/fabflows/evals/harness/run.js --iteration 1 --confirm  # run it
//
// Options: --tasks 1,2  --arms with_skill  --repeats 2  --parallel 1  --plugin-dir <path>
//          --model fable --effort medium  --regrade (re-grade existing runs, no new sessions)
//          --config-name <name> (the configuration directory, in place of the arm's name)

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { parseArgs: parseArgv } = require('node:util');
const { metricsFromFiles, parseTranscript, textOf } = require('./metrics.js');
const { grade } = require('./grade.js');
const { parseFrontmatter } = require('../../test/helpers/frontmatter.js');

const HARNESS = __dirname;
const EVALS = path.resolve(HARNESS, '..');
const REPO = path.resolve(EVALS, '..', '..', '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(EVALS, 'tasks.json'), 'utf8'));

function parseArgs(argv) {
  const s = { type: 'string' };
  const { values: v } = parseArgv({ args: argv, strict: true, options: {
    confirm: { type: 'boolean', default: false }, regrade: { type: 'boolean', default: false },
    iteration: { ...s, default: '1' }, repeats: s, parallel: { ...s, default: '1' },
    tasks: s, arms: s, 'plugin-dir': s, 'config-name': s, model: { ...s, default: CONFIG.lead.model }, effort: { ...s, default: CONFIG.lead.effort },
  } });
  // It names directories that are emptied before use, so it must not climb out of the iteration.
  const name = v['config-name'];
  if (name !== undefined && (!/^[A-Za-z0-9][\w.-]*$/.test(name) || name.includes('..'))) throw new Error(`--config-name ${name}: use letters, digits, '.', '_' and '-' only, with no '..'`);
  return {
    confirm: v.confirm, regrade: v.regrade, model: v.model, effort: v.effort,
    iteration: Number(v.iteration), repeats: v.repeats ? Number(v.repeats) : null, parallel: Number(v.parallel),
    tasks: v.tasks ? v.tasks.split(',').map(Number) : null, arms: v.arms ? v.arms.split(',') : null,
    pluginDir: v['plugin-dir'] ? path.resolve(v['plugin-dir']) : null,
    configName: v['config-name'] || null,
  };
}

const subdirs = (d) => {
  try {
    return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

// Clean room: every installed plugin off (a plugin arm's copy comes back only through
// --plugin-dir) and the advisor tool removed, so the arms differ by their plugin alone.
// The probe runs behind this choice were logged in the since-deleted run log:
// `git show 735ea1d:docs/RUNLOG.md`.
// Synced claude.ai plugins load whatever the user settings say, so each one is turned off by
// the name in its own plugin.json (the folder `x~g2` loads as `x`). Never `syncClaudeAiPlugins`:
// in user settings that moves the synced copies to the plugins' .trash directory.
function cleanRoomSettings(home = os.homedir()) {
  const userSettings = path.join(home, '.claude', 'settings.json');
  let enabled = {};
  try {
    enabled = JSON.parse(fs.readFileSync(userSettings, 'utf8')).enabledPlugins || {};
  } catch {
    // No user settings: nothing to disable.
  }
  const off = {};
  for (const k of Object.keys(enabled)) off[k] = false;
  const synced = path.join(home, '.claude', 'plugins', 'synced');
  for (const org of subdirs(synced)) {
    for (const d of subdirs(path.join(synced, org))) {
      try {
        const { name } = JSON.parse(fs.readFileSync(path.join(synced, org, d, '.claude-plugin', 'plugin.json'), 'utf8'));
        if (typeof name === 'string' && name) off[`${name}@synced`] = false;
      } catch {
        // No readable manifest: nothing names the plugin to disable.
      }
    }
  }
  return { enabledPlugins: off, advisorModel: '' };
}

// A task may raise the caps (a build loop runs long); everything else keeps the defaults.
function capsFor(task) {
  return { ...CONFIG.caps, ...(task.caps || {}) };
}

// A task's own `arms` replace the global set for that task.
const armsFor = (task) => task.arms || CONFIG.arms;

// The model and effort an agent pins, read from the plugin copy the run loads.
function agentFrontmatter(pluginDir, name) {
  return parseFrontmatter(fs.readFileSync(path.join(pluginDir, 'agents', `${name}.md`), 'utf8'));
}

// Environment keys are case-insensitive on Windows, and a copy of process.env keeps whatever
// case the system used (`Path`), so every lookup and delete matches the name in any case.
const keysOf = (env, name) => Object.keys(env).filter((k) => k.toUpperCase() === name);

// On Windows only .com and .exe, the names libuv tries: spawn without a shell refuses a .cmd or
// .bat (EINVAL since the CVE-2024-27980 fix), so npm's claude.cmd must not win over claude.exe.
function resolveOnPath(name, env) {
  const dirs = keysOf(env, 'PATH').flatMap((k) => env[k].split(path.delimiter)).filter(Boolean);
  const exts = process.platform === 'win32' ? ['.com', '.exe'] : [''];
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, name + e);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
  }
  return null;
}

// `.invalid` is reserved (RFC 6761) and never resolves, so a push or fetch fails at once.
const FIXTURE_REMOTE = 'https://fixture.invalid/bench/fixture.git';

// Every session, agent task or not, gets this: no GitHub token and an empty gh config, so gh has
// no login of this machine's, and a git that cannot use this machine's credentials: the
// credential helper (Git Credential Manager lives in Git for Windows' system config), a global
// helper, or an SSH key. The fixture's own repo config (user.name, user.email, the pinned line
// endings) still applies. `dir` is emptied first.
function lockedEnv(baseEnv, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const ghConfigDir = path.join(dir, 'gh-config');
  fs.mkdirSync(ghConfigDir, { recursive: true });
  const gitGlobal = path.join(dir, 'gitconfig');
  fs.writeFileSync(gitGlobal, '');
  const env = { ...baseEnv };
  const set = { GH_CONFIG_DIR: ghConfigDir, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: gitGlobal, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'false' };
  const drop = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GIT_ASKPASS', 'SSH_ASKPASS', ...Object.keys(set)];
  for (const k of drop.flatMap((n) => keysOf(env, n))) delete env[k];
  return { env: Object.assign(env, set), ghConfigDir };
}

// Every agent task also runs with shims, because a prompt with a rule planted out of it may reach
// for `gh` or a nested `claude`. `claude` is resolved to its full path first, since the PATH the
// session gets has a shim of that name in front. Both shims log the call to `shimLog` and exit
// non-zero; a run whose log is not empty fails its grade.
function isolatedLaunch({ baseEnv, dir, shimLog }) {
  const command = resolveOnPath('claude', baseEnv);
  if (!command) throw new Error('claude not found on PATH');
  const { env, ghConfigDir } = lockedEnv(baseEnv, dir);
  const shimDir = path.join(dir, 'shims');
  fs.mkdirSync(shimDir, { recursive: true });
  fs.mkdirSync(path.dirname(shimLog), { recursive: true });
  fs.writeFileSync(shimLog, '');
  const log = shimLog.replace(/\\/g, '/');
  for (const name of ['gh', 'claude']) {
    fs.writeFileSync(path.join(shimDir, name), `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> '${log}'\necho "${name} is not available in this session" >&2\nexit 97\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(shimDir, `${name}.cmd`), `@>>"${shimLog}" echo ${name} %*\r\n@echo ${name} is not available in this session 1>&2\r\n@exit /b 97\r\n`);
  }
  const oldPath = keysOf(env, 'PATH').map((k) => env[k])[0] || '';
  for (const k of keysOf(env, 'PATH')) delete env[k];
  env.PATH = [shimDir, oldPath].filter(Boolean).join(path.delimiter);
  return { command, env, remote: FIXTURE_REMOTE, shimLog, shimDir, ghConfigDir };
}

// Interleaved by repeat, then arm, with the arm order rotating each repeat (inline-1 loop-1
// loop-2 inline-2 ...), so drift over a long run (rate limits, model load) falls on every arm
// alike and no arm always pays the first cache write. --repeats overrides the task's own
// `repeats`; 2 is the fallback.
function buildCells(a) {
  const tasks = CONFIG.tasks.filter((t) => !a.tasks || a.tasks.includes(t.id));
  const cells = [];
  for (const task of tasks) {
    const arms = Object.keys(armsFor(task)).filter((x) => !a.arms || a.arms.includes(x));
    const repeats = a.repeats || task.repeats || 2;
    // `config` names the run's directory: the arm, unless --config-name gives another, so an
    // old, new, rerun and planted-regression run of one iteration sit side by side.
    for (let run = 1; run <= repeats; run++) {
      for (let i = 0; i < arms.length; i++) {
        const arm = arms[(i + run - 1) % arms.length];
        cells.push({ task, arm, run, config: a.configName || arm });
      }
    }
  }
  if (a.configName && new Set(cells.map((c) => c.arm)).size > 1) throw new Error('--config-name names one configuration: pick a single arm with --arms');
  return cells;
}

function runDirFor(a, cell) {
  return path.join(a.runsDir || path.join(EVALS, 'runs'), `iteration-${a.iteration}`, `eval-${cell.task.id}-${cell.task.name}`, cell.config, `run-${cell.run}`);
}

function takenRunDirs(a, cells, exists = fs.existsSync) {
  return cells.map((c) => runDirFor(a, c)).filter((d) => exists(d));
}

function refuseTakenRunDirs(a, cells, exists = fs.existsSync) {
  const taken = a.regrade ? [] : takenRunDirs(a, cells, exists);
  if (taken.length) throw new Error(`${taken.length} run director${taken.length === 1 ? 'y already exists' : 'ies already exist'}, first ${taken[0]}: delete them, or pass --regrade to re-grade them`);
}

// Fixtures live in a short temp path on purpose: a clone inside the repo's own deep path
// fails on Windows with "Filename too long" at .git/objects/info/commit-graphs. The temp dir
// is resolved to its long name: os.tmpdir() can return an 8.3 form (USERNA~1), and a cwd in
// that form makes every edit look like it targets a path outside the working directory, so
// don't-ask mode denies it.
const TMP = fs.realpathSync.native(os.tmpdir());
function fixtureDirFor(a, cell) {
  return path.join(TMP, 'fabflows-bench', `i${a.iteration}`, `t${cell.task.id}-${cell.config}-r${cell.run}`);
}

function claudeArgs(a, cell, runDir, settingsPath) {
  const armCfg = armsFor(cell.task)[cell.arm];
  const caps = capsFor(cell.task);
  const prompt = `${armCfg.promptPrefix || ''}${cell.task.prompt}`;
  // An agent task runs the agent as the session itself, on its own frontmatter tier, so the
  // brief reaches it unchanged and its report is the run's result. No lead sits in between.
  let session = ['--model', a.model, '--effort', a.effort];
  if (cell.task.agent) {
    const fm = agentFrontmatter((a.stagedPluginDirs || {})[cell.config] || a.pluginDir || path.join(REPO, armCfg.pluginDir), cell.task.agent);
    session = ['--agent', `fabflows:${cell.task.agent}`, '--model', fm.model, ...(fm.effort ? ['--effort', fm.effort] : [])];
  }
  const args = [
    '-p', prompt,
    ...session,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    // Workflow is offered to every arm so the tool surface is equal; a bare lead has no reason
    // to use it, the fabflows arm is expected to launch fabflows:build on the spec'd task.
    '--allowedTools', (cell.task.allowedTools || CONFIG.allowedTools).join(','),
    // An arm's disallowedTools remove the tool from the session, so it is absent, not denied.
    '--disallowedTools', ['PowerShell', ...(armCfg.disallowedTools || [])].join(','),
    // 'project' is needed for the fixture's CLAUDE.md (the environment note) to load at all.
    // The repo tracks no .claude/ settings, so nothing else comes in. No arm loads 'user': the
    // maintainer's own CLAUDE.md may name a plugin and prime one arm, could supply rules a
    // planted regression deletes from an agent's prompt, and would make results machine-bound.
    '--setting-sources', 'project',
    '--settings', settingsPath,
    '--strict-mcp-config',
    '--max-turns', String(caps.maxTurns),
    '--max-budget-usd', String(caps.maxBudgetUsd),
  ];
  if (armCfg.pluginDir || armCfg.plugin) args.push('--plugin-dir', (a.stagedPluginDirs || {})[cell.config]);
  return args;
}

// The plugin goes into a session as a copy holding only what a marketplace install would
// carry. Loading plugins/fabflows straight from the repo would ride evals/ (tasks, graders,
// results) along into the lead's context.
// A cached plugin is already what an install carries, so its whole tree is copied (parts null).
const PLUGIN_PARTS = ['.claude-plugin', 'agents', 'hooks', 'skills', 'workflows', 'README.md'];
function stagePlugin(src, dest, parts = PLUGIN_PARTS) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const part of parts || fs.readdirSync(src)) {
    if (fs.existsSync(path.join(src, part))) fs.cpSync(path.join(src, part), path.join(dest, part), { recursive: true });
  }
  return dest;
}

// A configuration's staged copy records what its runs loaded, so a later invocation may reuse it
// only when it would stage the same files; otherwise earlier runs would lose their record.
const treeFiles = (d) => fs.readdirSync(d, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(d, f)).isFile()).sort();
function stageOnce(src, dest, parts = PLUGIN_PARTS) {
  if (!fs.existsSync(dest)) return stagePlugin(src, dest, parts);
  const fresh = stagePlugin(src, `${dest}.new`, parts);
  const [a, b] = [treeFiles(fresh), treeFiles(dest)];
  const same = a.length === b.length && a.every((f, i) => f === b[i] && fs.readFileSync(path.join(fresh, f)).equals(fs.readFileSync(path.join(dest, f))));
  fs.rmSync(fresh, { recursive: true, force: true });
  if (!same) throw new Error(`${dest} holds a different plugin copy from an earlier run of this configuration: use a new --config-name, or delete that directory to restage`);
  return dest;
}

// An arm's `plugin` names a cached install, `<name>@<marketplace>`; its copy is the highest
// version in the cache, compared as semver.
// ponytail: a prerelease suffix is ignored in the comparison; parse it if one ever lands in the cache.
const semverParts = (v) => v.split(/[.+-]/).slice(0, 3).map(Number);
function compareSemver(x, y) {
  const [p, q] = [semverParts(x), semverParts(y)];
  for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] - q[i];
  return 0;
}
function cachedPluginDir(ref, home = os.homedir()) {
  const [name, market] = ref.split('@');
  const dir = path.join(home, '.claude', 'plugins', 'cache', market, name);
  const versions = subdirs(dir).filter((v) => /^\d+\.\d+\.\d+/.test(v)).sort(compareSemver);
  return versions.length ? path.join(dir, versions[versions.length - 1]) : null;
}

// Where each plugin arm's copy comes from, by configuration. --plugin-dir overrides only an arm
// that names a pluginDir. A missing cached copy stops a run that would launch it, before anything
// is staged; a dry run and a regrade launch nothing, so they carry on with `src: null`.
function pluginSources(a, cells, home = os.homedir()) {
  const sources = {};
  for (const c of cells) {
    const arm = armsFor(c.task)[c.arm];
    if (arm.pluginDir) sources[c.config] = { src: a.pluginDir || path.join(REPO, arm.pluginDir), parts: PLUGIN_PARTS };
    else if (arm.plugin) {
      const src = cachedPluginDir(arm.plugin, home);
      const [name, market] = arm.plugin.split('@');
      if (!src && a.confirm && !a.regrade) throw new Error(`${arm.plugin} is not in the plugin cache (${path.join(home, '.claude', 'plugins', 'cache', market, name)}): install ${name}, then disable it, so the copy stays on disk without loading in your own sessions`);
      sources[c.config] = { src, parts: null, plugin: arm.plugin };
    }
  }
  return sources;
}

// sha256 over every file's relative path and content hash, in sorted order.
function treeHash(d) {
  const h = crypto.createHash('sha256');
  for (const f of treeFiles(d)) h.update(`${f.split(path.sep).join('/')}\0${crypto.createHash('sha256').update(fs.readFileSync(path.join(d, f))).digest('hex')}\n`);
  return h.digest('hex');
}

// What an arm loaded: the staged copy's name, version and tree hash, and for a cached plugin the
// marketplace's pin, which is only what the marketplace named at run time, not the cached copy.
function pluginRecord(dir, ref = null, home = os.homedir()) {
  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8'));
  } catch {
    // No manifest: name and version stay null, the tree hash still identifies the copy.
  }
  const record = { name: manifest.name || null, version: manifest.version || null, treeSha256: treeHash(dir) };
  if (ref) {
    const [name, market] = ref.split('@');
    let sha = null;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'plugins', 'marketplaces', market, '.claude-plugin', 'marketplace.json'), 'utf8'));
      const entry = (m.plugins || []).find((p) => p.name === name);
      sha = (entry && entry.source && entry.source.sha) || null;
    } catch {
      // No marketplace clone: the pin is unknown.
    }
    record.marketplacePin = { sha, label: "the marketplace entry's source.sha at run time, not tied to the cached copy" };
  }
  return record;
}

// Each plugin arm stages its own copy at <iteration>/plugin-<config>, so arms never share one.
function stagePluginArms(a, sources, iterDir, home = os.homedir()) {
  a.stagedPluginDirs = {};
  a.pluginRecords = {};
  for (const [config, s] of Object.entries(sources)) {
    const dir = stageOnce(s.src, path.join(iterDir, `plugin-${config}`), s.parts);
    a.stagedPluginDirs[config] = dir;
    a.pluginRecords[config] = pluginRecord(dir, s.plugin || null, home);
  }
}

// Don't-ask mode refuses a Bash command that combines `cd` with a pipe, and every PowerShell
// call, whatever the allow list says (probed 2026-09-19; permission rules did not change it).
// Iteration 1 took 28 such denials, a wasted turn each, in both arms. The fix that widens no
// permission is to tell the lead, in the fixture's own CLAUDE.md, and to drop the tool. This is
// benchmark-only: the plugin itself, its guard included, is unchanged. On Linux and macOS the
// PowerShell tool is not offered, so the disallow is expected to be a no-op there (untested).
// The Haiku smoke of task 7 added a second shape: `cd /mnt/c/...` (a WSL path that does not
// exist here) is denied as a move outside the working directory, and the lead then spent its
// remaining turns trying to edit permissions instead of retrying. Pipes, `$VAR`, redirects and
// a quoted `cd` into the fixture's real path were all allowed when probed (CLI 2.1.272).
const ENV_NOTE = [
  '',
  '## Benchmark environment',
  '',
  'The working directory is already this repository root: run commands as written, without a',
  'leading `cd`.' + (process.platform === 'win32' ? ' Paths on this machine are Windows paths (`C:/...`); there is no `/mnt/c`, and a' : ' A'),
  'command that changes into a path outside this directory is denied. Permissions cannot be',
  'changed from inside this session, so if a command is denied, rewrite it without the `cd` and',
  'run it again rather than editing settings. Use the Bash tool for shell commands, never the',
  'PowerShell tool.',
  'Add no project documentation beyond what `SPEC.md` asks for.',
  '',
].join('\n');

function git(fixture, args, what, mayFail = false) {
  const r = spawnSync('git', ['-C', fixture, ...args], { encoding: 'utf8' });
  if (r.status !== 0 && !mayFail) throw new Error(`${what} failed: ${r.stderr}`);
}

// spec.kind "repo" clones this repo at spec.ref, a commit pinned before the benchmark existed
// so no fixture carries the tasks, graders or results; "dir" copies <evals>/<spec.from> into a
// fresh repository (a greenfield task). setup: [{ file, find, replace }] edits applied and
// committed before the session starts, so a task can plant a failure and still begin from a
// clean `git status`. The branch matters: fabflows:build refuses to run on main or master.
// remote becomes the fixture's origin: an unresolvable host by default, for every fixture kind, so
// no session can push to or fetch from a real repository (a repo clone's origin is this checkout).
function prepareFixture(fixture, branch, spec, setup = [], remote = FIXTURE_REMOTE) {
  fs.rmSync(fixture, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  if (spec.kind === 'repo') {
    const clone = spawnSync('git', ['-c', 'core.longpaths=true', 'clone', '-q', '--no-hardlinks', REPO, fixture], { encoding: 'utf8' });
    if (clone.status !== 0) throw new Error(`clone failed: ${clone.stderr}`);
    git(fixture, ['checkout', '-q', '-b', branch, spec.ref], 'checkout');
  } else if (spec.kind === 'dir') {
    // A stray node_modules in the source would fail the task's "no dependency added" check.
    fs.cpSync(path.join(EVALS, spec.from), fixture, { recursive: true, filter: (p) => path.basename(p) !== 'node_modules' });
    git(fixture, ['init', '-q'], 'init');
    git(fixture, ['add', '-A'], 'add');
    git(fixture, ['commit', '-q', '-m', 'bench: fixture'], 'fixture commit');
    git(fixture, ['checkout', '-q', '-b', branch], 'checkout');
  } else {
    throw new Error(`unknown fixture kind ${JSON.stringify(spec.kind)}`);
  }
  // The harness's setup commits and the lead's own commits both need an identity; a machine
  // without a global one would otherwise fail here or leave the lead unable to commit.
  git(fixture, ['config', 'user.name', 'bench'], 'config');
  git(fixture, ['config', 'user.email', 'bench@localhost'], 'config');
  // The session's git ignores the system and global config, where Git for Windows may set
  // core.autocrlf, so the values this git checks out and commits with are pinned in the fixture;
  // otherwise the session could see the prepared files as modified.
  for (const key of ['core.autocrlf', 'core.eol']) {
    const value = spawnSync('git', ['-C', fixture, 'config', '--get', key], { encoding: 'utf8' }).stdout.trim();
    if (value) git(fixture, ['config', key, value], 'config');
  }
  git(fixture, ['remote', 'remove', 'origin'], 'remote remove', true);
  git(fixture, ['remote', 'add', 'origin', remote], 'remote add');
  for (const s of setup) {
    const p = path.join(fixture, s.file);
    const before = fs.readFileSync(p, 'utf8');
    if (!before.includes(s.find)) throw new Error(`setup: ${s.file} does not contain ${JSON.stringify(s.find)}`);
    fs.writeFileSync(p, before.replace(s.find, s.replace));
  }
  // A dir fixture has no CLAUDE.md yet, so the note creates it and `add -A` picks it up.
  fs.appendFileSync(path.join(fixture, 'CLAUDE.md'), ENV_NOTE);
  git(fixture, ['add', '-A'], 'setup add');
  git(fixture, ['commit', '-q', '-m', 'bench: environment note and task setup'], 'setup commit');
}

function writeJson(p, data) {
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

const shortModel = (m) => ((m || '').match(/haiku|sonnet|opus|fable/) || [m])[0];

// Workflow tool_use ids from the lead: the join key for their tool_results, progress events and
// completion notices, which is how a stray "Transcript dir:" in a Bash result is never mistaken
// for a workflow.
function workflowIds(events) {
  const ids = new Set();
  for (const e of events) {
    if (e.type !== 'assistant' || e.parent_tool_use_id) continue;
    for (const b of e.message.content || []) if (b.type === 'tool_use' && b.name === 'Workflow') ids.add(b.id);
  }
  return ids;
}

// Workflow agents leave the session's own transcript dir when the session ends; a copy beside
// the run keeps metrics.js re-runnable (--regrade) after that dir is gone. Missing is skipped:
// the metrics fall back to the stream's per-agent totals.
function copyWorkflowDirs(events, dest) {
  const ids = workflowIds(events);
  for (const e of events) {
    if (e.type !== 'user') continue;
    for (const b of (e.message && e.message.content) || []) {
      if (!b || b.type !== 'tool_result' || !ids.has(b.tool_use_id)) continue;
      const m = /^Transcript dir: (.+)$/m.exec(textOf(b.content));
      if (!m) continue;
      const src = m[1].trim();
      if (fs.existsSync(src)) fs.cpSync(src, path.join(dest, path.basename(src)), { recursive: true });
    }
  }
}

// A compact transcript for the viewer: the lead's text and tool calls, worker spawns with
// their type, workflow agents as they start and finish. Never the raw stream, which is
// megabytes of repeated usage blocks.
function compactTranscript(events) {
  const lines = [];
  const seen = new Set();
  const ids = workflowIds(events);
  const agentState = {};
  for (const e of events) {
    if (e.type === 'system' && ids.has(e.tool_use_id)) {
      if (e.subtype === 'task_notification') lines.push(`[workflow] ${e.status}`);
      for (const w of e.workflow_progress || []) {
        if (w.type !== 'workflow_agent' || agentState[w.agentId] === w.state) continue;
        agentState[w.agentId] = w.state;
        const tally = w.state === 'done' ? ` ${Math.round((w.tokens || 0) / 1000)}k tokens, ${w.toolCalls || 0} tool calls` : '';
        lines.push(`  [workflow ${w.label}:${w.index} ${shortModel(w.model)}] ${w.state}${tally}`);
      }
      continue;
    }
    if (e.type !== 'assistant') continue;
    const who = e.parent_tool_use_id ? `  [worker ${e.parent_tool_use_id.slice(-6)}]` : '[lead]';
    for (const b of e.message.content || []) {
      if (b.type === 'text' && b.text.trim()) lines.push(`${who} ${b.text.trim().replace(/\s+/g, ' ').slice(0, 400)}`);
      if (b.type === 'tool_use' && !seen.has(b.id)) {
        seen.add(b.id);
        let brief = JSON.stringify(b.input).slice(0, 160);
        if (b.name === 'Agent') brief = `${b.input.subagent_type}: ${(b.input.description || '').slice(0, 80)}`;
        if (b.name === 'Workflow') brief = b.input.name || 'inline script';
        lines.push(`${who} -> ${b.name} ${brief}`);
      }
    }
  }
  return lines.join('\n');
}

function measureAndGrade(a, cell, runDir, fixture) {
  const transcript = path.join(runDir, 'transcript.jsonl');
  const probe = path.join(runDir, 'hook-probe.jsonl');
  const events = parseTranscript(fs.readFileSync(transcript, 'utf8'));
  const workflowDir = path.join(runDir, 'workflows');
  copyWorkflowDirs(events, workflowDir);
  const metrics = metricsFromFiles(transcript, { probePath: probe, testCommand: cell.task.grade.testCommand || null, workflowDir });
  const outputs = path.join(runDir, 'outputs');
  fs.mkdirSync(outputs, { recursive: true });
  fs.writeFileSync(path.join(outputs, 'result.md'), metrics.result.result_text || '(no result text)');
  fs.writeFileSync(path.join(runDir, 'transcript.md'), compactTranscript(events));
  // The fixture's state when the session ended. A regrade keeps what the run recorded, since the
  // temp fixture may since have been cleaned or reused; it fills in only a file that is missing.
  const state = { 'git-status.txt': ['status', '--porcelain'], 'git-diff.patch': ['diff'], 'git-head.txt': ['log', '-1', '--format=%s'] };
  for (const [file, args] of Object.entries(state)) {
    if (!a.regrade || !fs.existsSync(path.join(outputs, file))) fs.writeFileSync(path.join(outputs, file), spawnSync('git', ['-C', fixture, ...args], { encoding: 'utf8' }).stdout || '');
  }
  const saved = { status: fs.readFileSync(path.join(outputs, 'git-status.txt'), 'utf8'), head: fs.readFileSync(path.join(outputs, 'git-head.txt'), 'utf8') };

  const timingPath = path.join(runDir, 'timing.json');
  const timing = fs.existsSync(timingPath) ? JSON.parse(fs.readFileSync(timingPath, 'utf8')) : {};
  timing.total_tokens = metrics.totals.tokens;
  // A workflow wakes the lead for a second turn, and each result's duration is that turn's
  // alone; the time between them is the workflow running, which only the spawn clock sees. A
  // run killed while its workflow was still running has one result and the same problem.
  if (!(metrics.result.resultEvents > 1) && !(metrics.workflows || []).length) timing.duration_ms = metrics.result.duration_ms || timing.duration_ms;
  timing.duration_ms = timing.duration_ms || 0;
  timing.total_duration_seconds = Number((timing.duration_ms / 1000).toFixed(1));
  writeJson(timingPath, timing);

  // An arm may add grade options (task 8's loop arm sets requireReview).
  const task = { ...cell.task, grade: { ...cell.task.grade, ...(armsFor(cell.task)[cell.arm].grade || {}) } };
  const shimLog = cell.task.agent ? path.join(runDir, 'shim.log') : null;
  const grading = grade({ task, fixture, metrics, timing, maxTurns: capsFor(cell.task).maxTurns, workflowDir, events, shimLog, saved });
  writeJson(path.join(runDir, 'grading.json'), grading);
  const slim = { ...metrics, result: { ...metrics.result } };
  delete slim.result.result_text;
  writeJson(path.join(runDir, 'metrics.json'), slim);
  return { metrics: slim, grading };
}

// Tags an error with the stage it came from, so a cell's error.json says where it failed.
const tagged = (stage, e) => Object.assign(e instanceof Error ? e : new Error(String(e)), { stage: (e && e.stage) || stage });
function at(stage, fn) {
  try {
    return fn();
  } catch (e) {
    throw tagged(stage, e);
  }
}

// On a timeout the whole tree goes, not just the top process: a session's own children (a test
// run, a shell) would otherwise outlive it. Off Windows the session leads its own process group.
function killTree(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

// The sessions still running. Each leads its own process group off Windows, so Ctrl-C at the
// runner no longer reaches it: main ends each one's tree on SIGINT and SIGTERM.
const live = new Set();
function stopLive(signal) {
  console.error(`\nharness: ${signal}, ending ${live.size} running session${live.size === 1 ? '' : 's'}`);
  for (const child of live) killTree(child);
  process.exit(1);
}

function runCell(a, cell, settingsPath, spawnSession = spawn) {
  const runDir = runDirFor(a, cell);
  const fixture = fixtureDirFor(a, cell);
  // A regrade skips a cell that never ran before writing anything, so it leaves no run directory
  // that a later run would count as taken. The transcript is created before the spawn, so a cell
  // whose launch failed has an empty one and is skipped too.
  const transcript = path.join(runDir, 'transcript.jsonl');
  if (a.regrade && !(fs.existsSync(transcript) && fs.statSync(transcript).size > 0)) return Promise.resolve({ cell, skipped: 'no transcript' });
  fs.mkdirSync(runDir, { recursive: true });
  const meta = { eval_id: cell.task.id, eval_name: cell.task.name, prompt: cell.task.prompt, routing: cell.task.routing, assertions: [] };
  writeJson(path.join(runDir, 'eval_metadata.json'), meta);
  writeJson(path.join(path.dirname(path.dirname(runDir)), 'eval_metadata.json'), meta);

  if (a.regrade) return Promise.resolve({ cell, ...at('grade', () => measureAndGrade(a, cell, runDir, fixture)) });

  const args = at('args', () => claudeArgs(a, cell, runDir, settingsPath));
  // The guard appends, so the probe file starts empty.
  const probePath = path.join(runDir, 'hook-probe.jsonl');
  fs.rmSync(probePath, { force: true });
  // A ceiling of '0' lifts the 600 s cap on waiting for background work in print mode.
  let env = { ...process.env, FABFLOWS_PROBE: probePath, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' };
  delete env.CLAUDECODE; // the nested-session guard is for interactive terminals
  let command = 'claude';
  if (cell.task.agent) ({ command, env } = at('launch', () => isolatedLaunch({ baseEnv: env, dir: `${fixture}-iso`, shimLog: path.join(runDir, 'shim.log') })));
  else ({ env } = at('launch', () => lockedEnv(env, `${fixture}-iso`)));
  at('fixture', () => prepareFixture(fixture, `bench/t${cell.task.id}-${cell.config}-r${cell.run}`, cell.task.fixture || CONFIG.fixture, cell.task.setup || []));
  writeJson(path.join(runDir, 'run.json'), { cwd: fixture, command: [command, ...args], env: { FABFLOWS_PROBE: env.FABFLOWS_PROBE, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS, GH_CONFIG_DIR: env.GH_CONFIG_DIR, PATH: cell.task.agent ? env.PATH.split(path.delimiter)[0] : undefined }, plugin: (a.pluginRecords || {})[cell.config] || null, startedAt: new Date().toISOString() });

  const caps = capsFor(cell.task);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const out = fs.createWriteStream(path.join(runDir, 'transcript.jsonl'));
    const err = fs.createWriteStream(path.join(runDir, 'stderr.txt'));
    let settled = false;
    let killer = null;
    // The first of 'error' and 'close' decides the cell; a 'close' that follows an 'error' is ignored.
    const settle = () => {
      if (settled) return false;
      settled = true;
      live.delete(child);
      clearTimeout(killer);
      out.end();
      err.end();
      return true;
    };
    const failLaunch = (e) => {
      if (settle()) reject(tagged('launch', e));
    };
    let child;
    try {
      child = spawnSession(command, args, { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    } catch (e) {
      failLaunch(e);
      return;
    }
    child.on('error', failLaunch);
    live.add(child);
    killer = setTimeout(() => {
      err.write(`\nharness: killed after ${caps.runTimeoutMinutes} minutes\n`);
      killTree(child);
    }, caps.runTimeoutMinutes * 60 * 1000);
    child.stdout.pipe(out);
    child.stderr.pipe(err);
    child.on('close', (code) => {
      if (!settle()) return;
      setTimeout(() => {
        writeJson(path.join(runDir, 'timing.json'), { exit_code: code, duration_ms: Date.now() - started, total_duration_seconds: Number(((Date.now() - started) / 1000).toFixed(1)) });
        try {
          resolve({ cell, ...measureAndGrade(a, cell, runDir, fixture) });
        } catch (e) {
          reject(tagged('grade', e));
        }
      }, 200);
    });
  });
}

async function pool(items, size, fn) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, size) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

function errorStage(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')).stage;
  } catch {
    return null; // none, or unreadable: left as it is
  }
}

// Every cell runs through here. An error at any stage (args, launch, fixture, grade) goes to that
// cell's error.json and the other cells still run; the caller gets the failures and an exit code.
// spawnSession stands in for child_process.spawn, so a test can run cells without a session.
async function runAll(a, cells, spawnSession = spawn) {
  const failed = [];
  const results = await pool(cells, a.parallel || 1, async (cell) => {
    const label = `${cell.task.name}/${cell.config}/run-${cell.run}`;
    const errorPath = path.join(runDirFor(a, cell), 'error.json');
    console.log(`[${new Date().toISOString()}] start ${label}`);
    let r;
    try {
      r = await runCell(a, cell, a.settingsPath, spawnSession);
      // A successful regrade replaces the failure an earlier grade recorded, and only that one.
      if (a.regrade && r.grading && errorStage(errorPath) === 'grade') fs.rmSync(errorPath);
    } catch (e) {
      const error = { stage: (e && e.stage) || 'run', message: (e && e.message) || String(e) };
      fs.mkdirSync(path.dirname(errorPath), { recursive: true });
      writeJson(errorPath, error);
      failed.push({ label, ...error });
      r = { cell, error };
    }
    const verdict = r.grading ? `${r.grading.summary.passed}/${r.grading.summary.total}` : r.skipped || `${r.error.stage} failed: ${r.error.message}`;
    console.log(`[${new Date().toISOString()}] done  ${label}: ${verdict}`);
    return r;
  });
  return { results, failed, exitCode: failed.length ? 1 : 0 };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cells = buildCells(a);
  // Before anything is written: a run that would launch a missing cached plugin stops here.
  const sources = pluginSources(a, cells);
  const iterDir = path.join(EVALS, 'runs', `iteration-${a.iteration}`);
  console.log(`fabflows benchmark, iteration ${a.iteration}: ${cells.length} runs`);
  // An agent task has no lead: it runs on the agent's frontmatter tier, whatever --model says.
  const lead = cells.every((c) => c.task.agent) ? 'no lead (each agent runs on its own frontmatter tier; --model and --effort do not apply)' : `lead ${a.model} @ ${a.effort}${cells.some((c) => c.task.agent) ? ' (not for the agent tasks, which run on their own tier)' : ''}`;
  console.log(`  ${lead}; arms: ${[...new Set(cells.map((c) => c.arm))].join(', ')}; repeats: ${a.repeats || 'per task'}`);
  for (const task of new Set(cells.map((c) => c.task))) {
    const caps = capsFor(task);
    let who = '';
    if (task.agent) {
      const fm = agentFrontmatter(a.pluginDir || path.join(REPO, Object.values(armsFor(task))[0].pluginDir), task.agent);
      who = ` fabflows:${task.agent} as the session agent on ${fm.model}${fm.effort ? ` @ ${fm.effort}` : ''}, isolated;`;
    }
    console.log(`  task ${task.id} ${task.name}:${who} caps ${caps.maxTurns} turns, $${caps.maxBudgetUsd} list-price per run, ${caps.runTimeoutMinutes} min`);
  }
  console.log(`  results -> ${iterDir}\n  fixtures -> ${path.join(TMP, 'fabflows-bench', `i${a.iteration}`)}`);
  for (const s of Object.values(sources)) if (s.plugin && !s.src) console.log(`  ${s.plugin} is not in the plugin cache: a --confirm run would stop (install it, then disable it)`);
  if (!a.confirm && !a.regrade) {
    console.log('\nDry run. Add --confirm to launch these sessions (they spend real tokens).');
    return;
  }
  // A run never writes into an old run's directory: leftover files would mix two records.
  refuseTakenRunDirs(a, cells);
  fs.mkdirSync(iterDir, { recursive: true });
  a.settingsPath = path.join(iterDir, 'settings.json');
  writeJson(a.settingsPath, cleanRoomSettings());
  // Staged once per invocation, one copy per plugin arm, and not on --regrade: each copy records
  // what its arm's runs loaded.
  if (!a.regrade) stagePluginArms(a, sources, iterDir);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stopLive(signal));

  const { failed, exitCode } = await runAll(a, cells);
  // The per-cell table comes from the run dirs.
  spawnSync(process.execPath, [path.join(HARNESS, 'summarize.js'), iterDir], { stdio: 'inherit' });
  if (failed.length) {
    console.error(`\n${failed.length} cell${failed.length === 1 ? '' : 's'} failed (each has an error.json in its run directory):`);
    for (const f of failed) console.error(`  ${f.label}: ${f.stage}: ${f.message}`);
  }
  process.exitCode = exitCode;
}

module.exports = { prepareFixture, capsFor, compactTranscript, copyWorkflowDirs, stagePlugin, stageOnce, buildCells, claudeArgs, isolatedLaunch, resolveOnPath, runDirFor, takenRunDirs, refuseTakenRunDirs, parseArgs, runAll, cleanRoomSettings, cachedPluginDir, pluginSources, stagePluginArms, pluginRecord, FIXTURE_REMOTE };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
