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

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { metricsFromFiles } = require('./metrics.js');
const { grade } = require('./grade.js');

const HARNESS = __dirname;
const EVALS = path.resolve(HARNESS, '..');
const REPO = path.resolve(EVALS, '..', '..', '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(EVALS, 'tasks.json'), 'utf8'));

function parseArgs(argv) {
  const a = { iteration: 1, repeats: 2, parallel: 1, confirm: false, regrade: false, tasks: null, arms: null, pluginDir: null, model: CONFIG.lead.model, effort: CONFIG.lead.effort };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--confirm') a.confirm = true;
    else if (k === '--regrade') a.regrade = true;
    else if (k === '--iteration') a.iteration = Number(v), i++;
    else if (k === '--repeats') a.repeats = Number(v), i++;
    else if (k === '--parallel') a.parallel = Number(v), i++;
    else if (k === '--tasks') a.tasks = v.split(',').map(Number), i++;
    else if (k === '--arms') a.arms = v.split(','), i++;
    else if (k === '--plugin-dir') a.pluginDir = path.resolve(v), i++;
    else if (k === '--model') a.model = v, i++;
    else if (k === '--effort') a.effort = v, i++;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

// Clean room: every installed plugin off (fabflows comes back only through --plugin-dir in the
// with_skill arm) and the advisor tool removed, so the two arms differ by fabflows alone.
// The probe runs behind this choice are logged in docs/RUNLOG.md.
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

function buildCells(a) {
  const tasks = CONFIG.tasks.filter((t) => !a.tasks || a.tasks.includes(t.id));
  const arms = Object.keys(CONFIG.arms).filter((x) => !a.arms || a.arms.includes(x));
  const cells = [];
  for (const task of tasks) for (const arm of arms) for (let run = 1; run <= a.repeats; run++) cells.push({ task, arm, run });
  return cells;
}

function runDirFor(a, cell) {
  return path.join(EVALS, 'runs', `iteration-${a.iteration}`, `eval-${cell.task.id}-${cell.task.name}`, cell.arm, `run-${cell.run}`);
}

// Fixtures live in a short temp path on purpose: a clone inside the repo's own deep path
// fails on Windows with "Filename too long" at .git/objects/info/commit-graphs. The temp dir
// is resolved to its long name: os.tmpdir() can return an 8.3 form (REXLIN~1), and a cwd in
// that form makes every edit look like it targets a path outside the working directory, so
// don't-ask mode denies it.
const TMP = fs.realpathSync.native(os.tmpdir());
function fixtureDirFor(a, cell) {
  return path.join(TMP, 'fabflows-bench', `i${a.iteration}`, `t${cell.task.id}-${cell.arm}-r${cell.run}`);
}

function claudeArgs(a, cell, runDir, settingsPath) {
  const armCfg = CONFIG.arms[cell.arm];
  const prompt = `${armCfg.promptPrefix || ''}${cell.task.prompt}`;
  const args = [
    '-p', prompt,
    '--model', a.model,
    '--effort', a.effort,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--allowedTools', 'Read,Edit,Write,Grep,Glob,Bash,Agent,Skill,TaskCreate,TaskGet,TaskList,TaskUpdate,TaskOutput,TaskStop,NotebookEdit',
    '--disallowedTools', 'PowerShell',
    '--setting-sources', 'user',
    '--settings', settingsPath,
    '--strict-mcp-config',
    '--max-turns', String(CONFIG.caps.maxTurns),
    '--max-budget-usd', String(CONFIG.caps.maxBudgetUsd),
  ];
  if (armCfg.pluginDir) args.push('--plugin-dir', a.pluginDir || path.join(REPO, armCfg.pluginDir));
  return args;
}

// Don't-ask mode refuses a Bash command that combines `cd` with a pipe, and every PowerShell
// call, whatever the allow list says (probed 2026-09-19; permission rules did not change it).
// Iteration 1 took 28 such denials, a wasted turn each, in both arms. The fix that widens no
// permission is to tell the lead, in the fixture's own CLAUDE.md, and to drop the tool. This is
// benchmark-only: the plugin itself, its guard included, is unchanged. On Linux and macOS the
// PowerShell tool is not offered, so the disallow is expected to be a no-op there (untested).
const ENV_NOTE = [
  '',
  '## Benchmark environment',
  '',
  'The working directory is already this repository root. Run commands as written, without a',
  'leading `cd`. Use the Bash tool for shell commands, never the PowerShell tool.',
  '',
].join('\n');

// setup: [{ file, find, replace }] edits applied and committed before the session starts, so a
// task can plant a failure and still begin from a clean `git status`.
function prepareFixture(fixture, branch, setup = []) {
  fs.rmSync(fixture, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  const clone = spawnSync('git', ['-c', 'core.longpaths=true', 'clone', '-q', '--no-hardlinks', REPO, fixture], { encoding: 'utf8' });
  if (clone.status !== 0) throw new Error(`clone failed: ${clone.stderr}`);
  const co = spawnSync('git', ['-C', fixture, 'checkout', '-q', '-b', branch], { encoding: 'utf8' });
  if (co.status !== 0) throw new Error(`checkout failed: ${co.stderr}`);
  for (const s of setup) {
    const p = path.join(fixture, s.file);
    const before = fs.readFileSync(p, 'utf8');
    if (!before.includes(s.find)) throw new Error(`setup: ${s.file} does not contain ${JSON.stringify(s.find)}`);
    fs.writeFileSync(p, before.replace(s.find, s.replace));
  }
  fs.appendFileSync(path.join(fixture, 'CLAUDE.md'), ENV_NOTE);
  const commit = spawnSync('git', ['-C', fixture, 'commit', '-q', '-am', 'bench: environment note and task setup'], { encoding: 'utf8' });
  if (commit.status !== 0) throw new Error(`setup commit failed: ${commit.stderr}`);
}

function writeJson(p, data) {
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

// A compact transcript for the viewer: the lead's text and tool calls, worker spawns with
// their type. Never the raw stream, which is megabytes of repeated usage blocks.
function compactTranscript(events) {
  const lines = [];
  const seen = new Set();
  for (const e of events) {
    if (e.type !== 'assistant') continue;
    const who = e.parent_tool_use_id ? `  [worker ${e.parent_tool_use_id.slice(-6)}]` : '[lead]';
    for (const b of e.message.content || []) {
      if (b.type === 'text' && b.text.trim()) lines.push(`${who} ${b.text.trim().replace(/\s+/g, ' ').slice(0, 400)}`);
      if (b.type === 'tool_use' && !seen.has(b.id)) {
        seen.add(b.id);
        const brief = b.name === 'Agent' ? `${b.input.subagent_type}: ${(b.input.description || '').slice(0, 80)}` : JSON.stringify(b.input).slice(0, 160);
        lines.push(`${who} -> ${b.name} ${brief}`);
      }
    }
  }
  return lines.join('\n');
}

function measureAndGrade(a, cell, runDir, fixture) {
  const transcript = path.join(runDir, 'transcript.jsonl');
  const probe = path.join(runDir, 'hook-probe.jsonl');
  const metrics = metricsFromFiles(transcript, { probePath: probe, testCommand: cell.task.grade.testCommand || null });
  const outputs = path.join(runDir, 'outputs');
  fs.mkdirSync(outputs, { recursive: true });
  fs.writeFileSync(path.join(outputs, 'result.md'), metrics.result.result_text || '(no result text)');
  fs.writeFileSync(path.join(runDir, 'transcript.md'), compactTranscript(require('./metrics.js').parseTranscript(fs.readFileSync(transcript, 'utf8'))));
  fs.writeFileSync(path.join(outputs, 'git-status.txt'), spawnSync('git', ['-C', fixture, 'status', '--porcelain'], { encoding: 'utf8' }).stdout);
  fs.writeFileSync(path.join(outputs, 'git-diff.patch'), spawnSync('git', ['-C', fixture, 'diff'], { encoding: 'utf8' }).stdout);

  const timingPath = path.join(runDir, 'timing.json');
  const timing = fs.existsSync(timingPath) ? JSON.parse(fs.readFileSync(timingPath, 'utf8')) : {};
  timing.total_tokens = metrics.totals.tokens;
  timing.duration_ms = metrics.result.duration_ms || timing.duration_ms || 0;
  timing.total_duration_seconds = Number((timing.duration_ms / 1000).toFixed(1));
  writeJson(timingPath, timing);

  const grading = grade({ task: cell.task, fixture, metrics, timing, maxTurns: CONFIG.caps.maxTurns });
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

  prepareFixture(fixture, `bench/t${cell.task.id}-${cell.arm}-r${cell.run}`, cell.task.setup || []);
  const args = claudeArgs(a, cell, runDir, settingsPath);
  const env = { ...process.env, FABFLOWS_PROBE: path.join(runDir, 'hook-probe.jsonl') };
  delete env.CLAUDECODE; // the nested-session guard is for interactive terminals
  writeJson(path.join(runDir, 'run.json'), { cwd: fixture, command: ['claude', ...args], env: { FABFLOWS_PROBE: env.FABFLOWS_PROBE }, startedAt: new Date().toISOString() });

  return new Promise((resolve) => {
    const started = Date.now();
    const out = fs.createWriteStream(path.join(runDir, 'transcript.jsonl'));
    const err = fs.createWriteStream(path.join(runDir, 'stderr.txt'));
    const child = spawn('claude', args, { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const killer = setTimeout(() => {
      err.write(`\nharness: killed after ${CONFIG.caps.runTimeoutMinutes} minutes\n`);
      child.kill();
    }, CONFIG.caps.runTimeoutMinutes * 60 * 1000);
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

function summarize(results) {
  const rows = [['task', 'arm', 'run', 'pass', 'turns', 'lead out', 'worker out', 'lead ctx', 'cost $', 'sec', 'workers']];
  for (const r of results) {
    if (!r.metrics) {
      rows.push([r.cell.task.name, r.cell.arm, String(r.cell.run), r.skipped || r.error || '?']);
      continue;
    }
    const m = r.metrics;
    const workerOut = Object.values(m.workersByModel).reduce((s, w) => s + (w.output || 0), 0);
    rows.push([
      r.cell.task.name, r.cell.arm, String(r.cell.run),
      `${r.grading.summary.passed}/${r.grading.summary.total}`,
      String(m.result.num_turns ?? '-'), String(m.lead.output ?? '-'), String(workerOut), String(m.lead.finalContext),
      m.result.total_cost_usd != null ? m.result.total_cost_usd.toFixed(2) : '-',
      String(Math.round((m.result.duration_ms || 0) / 1000)),
      Object.entries(m.workers).map(([k, v]) => `${k.replace('fabflows:', '')}x${v.spawns}`).join(' ') || '-',
    ]);
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] || '').length)));
  return rows.map((r) => r.map((c, i) => (c || '').padEnd(widths[i])).join('  ')).join('\n');
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cells = buildCells(a);
  const iterDir = path.join(EVALS, 'runs', `iteration-${a.iteration}`);
  console.log(`fabflows benchmark, iteration ${a.iteration}: ${cells.length} runs`);
  console.log(`  lead ${a.model} @ ${a.effort}; caps: ${CONFIG.caps.maxTurns} turns, $${CONFIG.caps.maxBudgetUsd} list-price per run, ${CONFIG.caps.runTimeoutMinutes} min`);
  console.log(`  arms: ${[...new Set(cells.map((c) => c.arm))].join(', ')}; tasks: ${[...new Set(cells.map((c) => c.task.name))].join(', ')}; repeats: ${a.repeats}`);
  console.log(`  results -> ${iterDir}\n  fixtures -> ${path.join(TMP, 'fabflows-bench', `i${a.iteration}`)}`);
  if (!a.confirm && !a.regrade) {
    console.log('\nDry run. Add --confirm to launch these sessions (they spend real tokens).');
    return;
  }
  fs.mkdirSync(iterDir, { recursive: true });
  const settingsPath = path.join(iterDir, 'settings.json');
  writeJson(settingsPath, cleanRoomSettings());

  const results = await pool(cells, a.parallel, async (cell) => {
    const label = `${cell.task.name}/${cell.arm}/run-${cell.run}`;
    console.log(`[${new Date().toISOString()}] start ${label}`);
    const r = await runCell(a, cell, settingsPath);
    const verdict = r.grading ? `${r.grading.summary.passed}/${r.grading.summary.total}` : r.skipped || r.error;
    console.log(`[${new Date().toISOString()}] done  ${label}: ${verdict}`);
    return r;
  });
  console.log(`\n${summarize(results)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
