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
  return {
    confirm: v.confirm, regrade: v.regrade, model: v.model, effort: v.effort,
    iteration: Number(v.iteration), repeats: v.repeats ? Number(v.repeats) : null, parallel: Number(v.parallel),
    tasks: v.tasks ? v.tasks.split(',').map(Number) : null, arms: v.arms ? v.arms.split(',') : null,
    pluginDir: v['plugin-dir'] ? path.resolve(v['plugin-dir']) : null,
    configName: v['config-name'] || null,
  };
}

// Clean room: every installed plugin off (fabflows comes back only through --plugin-dir in the
// with_skill arm) and the advisor tool removed, so the two arms differ by fabflows alone.
// The probe runs behind this choice were logged in the since-deleted run log:
// `git show 735ea1d:docs/RUNLOG.md`.
function cleanRoomSettings() {
  const userSettings = path.join(os.homedir(), '.claude', 'settings.json');
  let enabled = {};
  try {
    enabled = JSON.parse(fs.readFileSync(userSettings, 'utf8')).enabledPlugins || {};
  } catch {
    // No user settings: nothing to disable.
  }
  const off = {};
  for (const k of Object.keys(enabled)) off[k] = false;
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

function resolveOnPath(name, env) {
  const dirs = keysOf(env, 'PATH').flatMap((k) => env[k].split(path.delimiter)).filter(Boolean);
  const pathext = keysOf(env, 'PATHEXT').map((k) => env[k])[0] || '.EXE;.CMD;.BAT';
  const exts = process.platform === 'win32' ? pathext.split(';').filter(Boolean) : [''];
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

// Every agent task runs isolated, because a prompt with a rule planted out of it may reach for
// `gh` or a nested `claude` with this machine's credentials. `claude` is resolved to its full
// path first, since the PATH the session gets has a shim of that name in front. Both shims log
// the call to `shimLog` and exit non-zero; a run whose log is not empty fails its grade.
function isolatedLaunch({ baseEnv, dir, shimLog }) {
  const command = resolveOnPath('claude', baseEnv);
  if (!command) throw new Error('claude not found on PATH');
  fs.rmSync(dir, { recursive: true, force: true });
  const shimDir = path.join(dir, 'shims');
  const ghConfigDir = path.join(dir, 'gh-config');
  fs.mkdirSync(shimDir, { recursive: true });
  fs.mkdirSync(ghConfigDir, { recursive: true });
  fs.mkdirSync(path.dirname(shimLog), { recursive: true });
  fs.writeFileSync(shimLog, '');
  const log = shimLog.replace(/\\/g, '/');
  for (const name of ['gh', 'claude']) {
    fs.writeFileSync(path.join(shimDir, name), `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> '${log}'\necho "${name} is not available in this session" >&2\nexit 97\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(shimDir, `${name}.cmd`), `@>>"${shimLog}" echo ${name} %*\r\n@echo ${name} is not available in this session 1>&2\r\n@exit /b 97\r\n`);
  }
  const env = { ...baseEnv };
  const oldPath = keysOf(env, 'PATH').map((k) => env[k])[0] || '';
  for (const k of [...keysOf(env, 'PATH'), ...keysOf(env, 'GH_TOKEN'), ...keysOf(env, 'GITHUB_TOKEN'), ...keysOf(env, 'GH_CONFIG_DIR')]) delete env[k];
  env.PATH = [shimDir, oldPath].filter(Boolean).join(path.delimiter);
  env.GH_CONFIG_DIR = ghConfigDir;
  return { command, env, remote: FIXTURE_REMOTE, shimLog, shimDir, ghConfigDir };
}

// Interleaved by repeat, then arm (inline-1 delegate-1 loop-1 inline-2 ...), so drift over a
// long run (rate limits, model load) falls on every arm alike. --repeats overrides the task's
// own `repeats`; 2 is the fallback.
function buildCells(a) {
  const tasks = CONFIG.tasks.filter((t) => !a.tasks || a.tasks.includes(t.id));
  const cells = [];
  for (const task of tasks) {
    const arms = Object.keys(armsFor(task)).filter((x) => !a.arms || a.arms.includes(x));
    const repeats = a.repeats || task.repeats || 2;
    // `config` names the run's directory: the arm, unless --config-name gives another, so an
    // old, new, rerun and planted-regression run of one iteration sit side by side.
    for (let run = 1; run <= repeats; run++) for (const arm of arms) cells.push({ task, arm, run, config: a.configName || arm });
  }
  if (a.configName && new Set(cells.map((c) => c.arm)).size > 1) throw new Error('--config-name names one configuration: pick a single arm with --arms');
  return cells;
}

function runDirFor(a, cell) {
  return path.join(EVALS, 'runs', `iteration-${a.iteration}`, `eval-${cell.task.id}-${cell.task.name}`, cell.config, `run-${cell.run}`);
}

// Fixtures live in a short temp path on purpose: a clone inside the repo's own deep path
// fails on Windows with "Filename too long" at .git/objects/info/commit-graphs. The temp dir
// is resolved to its long name: os.tmpdir() can return an 8.3 form (REXLIN~1), and a cwd in
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
    const fm = agentFrontmatter(a.stagedPluginDir || a.pluginDir || path.join(REPO, armCfg.pluginDir), cell.task.agent);
    session = ['--agent', `fabflows:${cell.task.agent}`, '--model', fm.model, ...(fm.effort ? ['--effort', fm.effort] : [])];
  }
  const args = [
    '-p', prompt,
    ...session,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    // Workflow is offered to both arms so the tool surface is equal; a bare lead has no reason
    // to use it, the fabflows arm is expected to launch fabflows:build on the spec'd task.
    '--allowedTools', (cell.task.allowedTools || CONFIG.allowedTools).join(','),
    // An arm's disallowedTools remove the tool from the session, so it is absent, not denied.
    '--disallowedTools', ['PowerShell', ...(armCfg.disallowedTools || [])].join(','),
    // 'project' is needed for the fixture's CLAUDE.md (the environment note) to load at all;
    // 'user' alone drops it. The repo tracks no .claude/ settings, so nothing else comes in.
    '--setting-sources', 'user,project',
    '--settings', settingsPath,
    '--strict-mcp-config',
    '--max-turns', String(caps.maxTurns),
    '--max-budget-usd', String(caps.maxBudgetUsd),
  ];
  if (armCfg.pluginDir) args.push('--plugin-dir', a.stagedPluginDir);
  return args;
}

// The plugin goes into a session as a copy holding only what a marketplace install would
// carry. Loading plugins/fabflows straight from the repo would ride evals/ (tasks, graders,
// results) along into the lead's context.
const PLUGIN_PARTS = ['.claude-plugin', 'agents', 'hooks', 'skills', 'workflows', 'README.md'];
function stagePlugin(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const part of PLUGIN_PARTS) {
    if (fs.existsSync(path.join(src, part))) fs.cpSync(path.join(src, part), path.join(dest, part), { recursive: true });
  }
  return dest;
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
// remote, when given, becomes the fixture's origin (an agent task's unresolvable host).
function prepareFixture(fixture, branch, spec, setup = [], remote = null) {
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
  if (remote) {
    git(fixture, ['remote', 'remove', 'origin'], 'remote remove', true);
    git(fixture, ['remote', 'add', 'origin', remote], 'remote add');
  }
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
  fs.writeFileSync(path.join(outputs, 'git-status.txt'), spawnSync('git', ['-C', fixture, 'status', '--porcelain'], { encoding: 'utf8' }).stdout);
  fs.writeFileSync(path.join(outputs, 'git-diff.patch'), spawnSync('git', ['-C', fixture, 'diff'], { encoding: 'utf8' }).stdout);

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
  const grading = grade({ task, fixture, metrics, timing, maxTurns: capsFor(cell.task).maxTurns, workflowDir, events, shimLog });
  writeJson(path.join(runDir, 'grading.json'), grading);
  const slim = { ...metrics, result: { ...metrics.result } };
  delete slim.result.result_text;
  writeJson(path.join(runDir, 'metrics.json'), slim);
  return { metrics: slim, grading };
}

function runCell(a, cell, settingsPath) {
  const runDir = runDirFor(a, cell);
  const fixture = fixtureDirFor(a, cell);
  fs.mkdirSync(runDir, { recursive: true });
  const meta = { eval_id: cell.task.id, eval_name: cell.task.name, prompt: cell.task.prompt, routing: cell.task.routing, assertions: [] };
  writeJson(path.join(runDir, 'eval_metadata.json'), meta);
  writeJson(path.join(path.dirname(path.dirname(runDir)), 'eval_metadata.json'), meta);

  if (a.regrade) {
    if (!fs.existsSync(path.join(runDir, 'transcript.jsonl'))) return Promise.resolve({ cell, skipped: 'no transcript' });
    return Promise.resolve({ cell, ...measureAndGrade(a, cell, runDir, fixture) });
  }

  const args = claudeArgs(a, cell, runDir, settingsPath);
  // The guard appends, so a relaunch into the same run directory would carry the abandoned
  // launch's payloads into this run's hook counts (observed in iteration 5, two stale rows).
  const probePath = path.join(runDir, 'hook-probe.jsonl');
  fs.rmSync(probePath, { force: true });
  // A ceiling of '0' lifts the 600 s cap on waiting for background work in print mode.
  let env = { ...process.env, FABFLOWS_PROBE: probePath, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' };
  delete env.CLAUDECODE; // the nested-session guard is for interactive terminals
  let command = 'claude';
  let remote = null;
  if (cell.task.agent) ({ command, env, remote } = isolatedLaunch({ baseEnv: env, dir: `${fixture}-iso`, shimLog: path.join(runDir, 'shim.log') }));
  prepareFixture(fixture, `bench/t${cell.task.id}-${cell.config}-r${cell.run}`, cell.task.fixture || CONFIG.fixture, cell.task.setup || [], remote);
  writeJson(path.join(runDir, 'run.json'), { cwd: fixture, command: [command, ...args], env: { FABFLOWS_PROBE: env.FABFLOWS_PROBE, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS, GH_CONFIG_DIR: env.GH_CONFIG_DIR, PATH: cell.task.agent ? env.PATH.split(path.delimiter)[0] : undefined }, startedAt: new Date().toISOString() });

  const caps = capsFor(cell.task);
  return new Promise((resolve) => {
    const started = Date.now();
    const out = fs.createWriteStream(path.join(runDir, 'transcript.jsonl'));
    const err = fs.createWriteStream(path.join(runDir, 'stderr.txt'));
    const child = spawn(command, args, { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const killer = setTimeout(() => {
      err.write(`\nharness: killed after ${caps.runTimeoutMinutes} minutes\n`);
      child.kill();
    }, caps.runTimeoutMinutes * 60 * 1000);
    child.stdout.pipe(out);
    child.stderr.pipe(err);
    child.on('close', (code) => {
      clearTimeout(killer);
      out.end();
      err.end();
      setTimeout(() => {
        writeJson(path.join(runDir, 'timing.json'), { exit_code: code, duration_ms: Date.now() - started, total_duration_seconds: Number(((Date.now() - started) / 1000).toFixed(1)) });
        try {
          resolve({ cell, ...measureAndGrade(a, cell, runDir, fixture) });
        } catch (e) {
          resolve({ cell, error: String(e) });
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

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cells = buildCells(a);
  const iterDir = path.join(EVALS, 'runs', `iteration-${a.iteration}`);
  console.log(`fabflows benchmark, iteration ${a.iteration}: ${cells.length} runs`);
  console.log(`  lead ${a.model} @ ${a.effort}; arms: ${[...new Set(cells.map((c) => c.arm))].join(', ')}; repeats: ${a.repeats || 'per task'}`);
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
  if (!a.confirm && !a.regrade) {
    console.log('\nDry run. Add --confirm to launch these sessions (they spend real tokens).');
    return;
  }
  fs.mkdirSync(iterDir, { recursive: true });
  const settingsPath = path.join(iterDir, 'settings.json');
  writeJson(settingsPath, cleanRoomSettings());
  // Staged once per invocation, and not on --regrade: that copy records what the runs loaded.
  const pluginArm = cells.map((c) => armsFor(c.task)[c.arm]).find((x) => x.pluginDir);
  // Each configuration stages its own copy, so side-by-side configurations never share one.
  const stageDir = path.join(iterDir, a.configName ? `plugin-${a.configName}` : 'plugin');
  if (pluginArm && !a.regrade) a.stagedPluginDir = stagePlugin(a.pluginDir || path.join(REPO, pluginArm.pluginDir), stageDir);

  await pool(cells, a.parallel, async (cell) => {
    const label = `${cell.task.name}/${cell.config}/run-${cell.run}`;
    console.log(`[${new Date().toISOString()}] start ${label}`);
    const r = await runCell(a, cell, settingsPath);
    const verdict = r.grading ? `${r.grading.summary.passed}/${r.grading.summary.total}` : r.skipped || r.error;
    console.log(`[${new Date().toISOString()}] done  ${label}: ${verdict}`);
    return r;
  });
  // Per-run errors and skips were printed above; the per-cell table comes from the run dirs.
  spawnSync(process.execPath, [path.join(HARNESS, 'summarize.js'), iterDir], { stdio: 'inherit' });
}

module.exports = { prepareFixture, capsFor, compactTranscript, copyWorkflowDirs, stagePlugin, buildCells, claudeArgs, isolatedLaunch, resolveOnPath, runDirFor, parseArgs, FIXTURE_REMOTE };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
