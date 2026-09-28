'use strict';
// The benchmark itself is on-demand tooling that spends real tokens (see evals/README.md), so
// it never runs here. What runs here is the free, deterministic part most likely to break
// silently: the task file's shape and the stream parser that attributes tokens to the lead
// and to each worker type.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseTranscript, computeMetrics, summarizeProbe } = require('../evals/harness/metrics.js');

const EVALS = path.join(__dirname, '..', 'evals');
const FIXTURE = path.join(__dirname, 'fixtures', 'transcript-sample.jsonl');
const DEP_RESOLVER = path.join(EVALS, 'fixtures', 'dep-resolver');
const OUTDATED = path.join(EVALS, 'fixtures', 'lockstep-outdated');
const UPDATE = path.join(EVALS, 'fixtures', 'lockstep-update');

test('tasks.json is well formed: unique ids, both arms or per-task arms, a prompt and a grade kind per task', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(EVALS, 'tasks.json'), 'utf8'));
  assert.deepEqual(Object.keys(cfg.arms).sort(), ['superpowers', 'with_skill', 'without_skill']);
  assert.ok(cfg.arms.with_skill.pluginDir, 'with_skill must name the plugin directory to load');
  // superpowers loads a cached install, not a path, and starts from its own SessionStart hook.
  assert.deepEqual(cfg.arms.superpowers, { plugin: 'superpowers@claude-plugins-official', promptPrefix: '' });
  assert.ok(cfg.caps.maxTurns > 0 && cfg.caps.maxBudgetUsd > 0, 'caps must be set: an uncapped run is an open wallet');
  // The default fixture is a pinned commit so no session ever sees the benchmark's own tasks,
  // graders or results inside its working tree.
  assert.equal(cfg.fixture.kind, 'repo', 'the default fixture must be a clone of this repo');
  assert.equal(typeof cfg.fixture.ref, 'string', 'the default fixture must pin a ref');
  const ids = cfg.tasks.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'task ids must be unique');
  for (const t of cfg.tasks) {
    assert.ok(t.name && t.prompt && t.routing, `task ${t.id} needs name, prompt and routing`);
    assert.ok(['agent-inventory', 'edit', 'new-tests', 'test-triage', 'decision-digest', 'hidden-tests', 'agent-report', 'agent-missing-part'].includes(t.grade.kind), `task ${t.id} has unknown grade kind ${t.grade.kind}`);
    if (['edit', 'new-tests', 'test-triage', 'hidden-tests'].includes(t.grade.kind)) assert.ok(t.grade.testCommand, `task ${t.id} must name the test command that proves it`);
    if (t.grade.kind === 'hidden-tests') assert.ok(t.grade.hidden && t.grade.rootEnv, `task ${t.id} must name the hidden suite and the env var that points it at the fixture`);
    for (const s of t.setup || []) assert.ok(s.file && s.find && typeof s.replace === 'string', `task ${t.id} setup entries need file, find and replace`);
    if (t.fixture) {
      assert.ok(['repo', 'dir'].includes(t.fixture.kind), `task ${t.id} has unknown fixture kind ${t.fixture.kind}`);
      if (t.fixture.kind === 'repo') assert.equal(typeof t.fixture.ref, 'string', `task ${t.id} repo fixture must pin a ref`);
      if (t.fixture.kind === 'dir') {
        assert.equal(typeof t.fixture.from, 'string', `task ${t.id} dir fixture must say where it is copied from`);
        assert.ok(fs.existsSync(path.join(EVALS, t.fixture.from, t.agent ? 'package.json' : 'SPEC.md')), `task ${t.id} dir fixture must exist${t.agent ? '' : ' and carry a SPEC.md'}`);
      }
    }
    for (const [k, v] of Object.entries(t.caps || {})) assert.ok(typeof v === 'number' && v > 0, `task ${t.id} cap ${k} must be a positive number`);
    // A task's own arms replace the global pair; each one names its tools to remove as a list.
    for (const [name, arm] of Object.entries(t.arms || {})) {
      assert.equal(typeof arm.promptPrefix, 'string', `task ${t.id} arm ${name} needs a promptPrefix`);
      if (arm.disallowedTools) assert.ok(Array.isArray(arm.disallowedTools) && arm.disallowedTools.every((x) => typeof x === 'string'), `task ${t.id} arm ${name} disallowedTools must be a list of tool names`);
    }
    // An agent task names an agent the plugin ships, its own tools, and caps of its own.
    if (t.agent) {
      assert.ok(fs.existsSync(path.join(EVALS, '..', 'agents', `${t.agent}.md`)), `task ${t.id} names no fabflows agent: ${t.agent}`);
      assert.ok(Array.isArray(t.allowedTools) && t.allowedTools.length > 0, `task ${t.id} must list its allowed tools`);
      assert.ok(t.caps && t.caps.maxTurns > 0 && t.caps.maxBudgetUsd > 0, `task ${t.id} must set its own turn cap and budget`);
      assert.ok(['agent-report', 'agent-missing-part'].includes(t.grade.kind), `agent task ${t.id} needs an agent grade kind`);
      for (const o of t.grade.order || []) assert.doesNotThrow(() => new RegExp(o.pattern), `task ${t.id} order pattern ${o.pattern}`);
    }
    if (t.repeats !== undefined) assert.ok(Number.isInteger(t.repeats) && t.repeats > 0, `task ${t.id} repeats must be a positive integer`);
  }
});

test('the hidden acceptance suite passes against the reference implementation', () => {
  // If the ground truth stops being satisfiable, every build-component run would grade 0/N and
  // look like the lead's failure rather than the benchmark's.
  const hidden = path.join(DEP_RESOLVER, 'hidden');
  const files = fs.readdirSync(hidden).filter((f) => f.endsWith('.test.js'));
  assert.ok(files.length > 0, 'the hidden suite has no test files');
  const r = spawnSync(process.execPath, ['--test', ...files], {
    cwd: hidden,
    env: { ...process.env, LOCKSTEP_ROOT: path.join(DEP_RESOLVER, 'reference') },
    timeout: 120000,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `hidden suite failed against the reference:\n${(r.stdout || '').slice(-2000)}\n${(r.stderr || '').slice(-2000)}`);
});

// Runs a hidden suite against a project root and returns node's exit status and the names of
// the failing tests, read from the TAP reporter.
// NODE_TEST_CONTEXT is dropped so the child reports as a standalone run, not to this runner.
function runHidden(hiddenDir, rootDir) {
  const files = fs.readdirSync(hiddenDir).filter((f) => f.endsWith('.test.js'));
  assert.ok(files.length > 0, 'the hidden suite has no test files');
  const env = { ...process.env, LOCKSTEP_ROOT: rootDir };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: hiddenDir,
    env,
    timeout: 120000,
    encoding: 'utf8',
  });
  const failed = [...(r.stdout || '').matchAll(/^not ok \d+ - (.+?)(?: # .*)?$/gm)].map((m) => m[1]).filter((n) => !files.includes(n));
  return { status: r.status, failed, out: `${(r.stdout || '').slice(-2000)}\n${(r.stderr || '').slice(-2000)}` };
}

test('the review-catch hidden suite passes against its solution', () => {
  const r = runHidden(path.join(OUTDATED, 'hidden'), path.join(OUTDATED, 'solution'));
  assert.equal(r.status, 0, `hidden suite failed against the solution:\n${r.out}`);
});

test('the review-catch fixture, defect in place, fails only the caret-on-zero tests', () => {
  // `outdated` is absent from the fixture, so its tests fail too; everything else must pass,
  // or the planted defect is not the only thing wrong with the baseline.
  const r = runHidden(path.join(OUTDATED, 'hidden'), path.join(OUTDATED, 'visible'));
  assert.notEqual(r.status, 0);
  assert.ok(r.failed.includes("caret-on-zero: satisfies('0.3.0', '^0.2.3') is false"), `the satisfies case must fail on the fixture:\n${r.out}`);
  const other = r.failed.filter((n) => !n.startsWith('outdated:') && !n.startsWith('caret-on-zero:'));
  assert.deepEqual(other, [], 'no other hidden test may fail on the fixture');
});

test('the update-minimal hidden suite passes against its solution', () => {
  const r = runHidden(path.join(UPDATE, 'hidden'), path.join(UPDATE, 'solution'));
  assert.equal(r.status, 0, `hidden suite failed against the solution:\n${r.out}`);
});

test('the update-minimal fixture fails only the update and cli cases', () => {
  // `update` is absent from the fixture; the regression cases must pass, or the baseline is
  // broken somewhere the task does not ask to touch.
  const r = runHidden(path.join(UPDATE, 'hidden'), path.join(UPDATE, 'visible'));
  assert.notEqual(r.status, 0);
  assert.ok(r.failed.some((n) => n.startsWith('update:')), `the update cases must fail on the fixture:\n${r.out}`);
  const other = r.failed.filter((n) => !n.startsWith('update:') && !n.startsWith('cli:'));
  assert.deepEqual(other, [], 'no other hidden test may fail on the fixture');
});

test('cells interleave by repeat then arm, rotating the arm order, and a task sets its own repeats unless --repeats is given', () => {
  const { buildCells } = require('../evals/harness/run.js');
  const labels = buildCells({ tasks: [8], arms: null, repeats: null }).map((c) => `${c.arm}-${c.run}`);
  assert.deepEqual(labels, ['inline-1', 'loop-1', 'loop-2', 'inline-2', 'inline-3', 'loop-3', 'loop-4', 'inline-4', 'inline-5', 'loop-5']);
  assert.equal(buildCells({ tasks: [8], arms: null, repeats: 1 }).length, 2, 'the flag overrides the task');
  assert.equal(buildCells({ tasks: [7], arms: null, repeats: null }).length, 6, 'a task without repeats falls back to 2, across the three arms');
});

test('takenRunDirs lists only the run directories that already exist', () => {
  const { buildCells, runDirFor, takenRunDirs } = require('../evals/harness/run.js');
  const a = { tasks: [8], arms: null, repeats: 1, iteration: 1 };
  const cells = buildCells(a);
  const old = runDirFor(a, cells[1]);
  assert.deepEqual(takenRunDirs(a, cells, (d) => d === old), [old]);
  assert.deepEqual(takenRunDirs(a, cells, () => false), [], 'nothing taken, nothing refused');
});

test('refuseTakenRunDirs stops on a taken run directory unless re-grading', () => {
  const { buildCells, runDirFor, refuseTakenRunDirs } = require('../evals/harness/run.js');
  const a = { tasks: [8], arms: null, repeats: 1, iteration: 1 };
  const cells = buildCells(a);
  const old = runDirFor(a, cells[1]);
  const taken = (d) => d === old;
  assert.throws(() => refuseTakenRunDirs(a, cells, taken), (e) => e.message.includes(old) && e.message.includes('--regrade'));
  assert.doesNotThrow(() => refuseTakenRunDirs({ ...a, regrade: true }, cells, taken), '--regrade reuses the directory');
  assert.doesNotThrow(() => refuseTakenRunDirs(a, cells, () => false), 'nothing taken, nothing refused');
});

test("an arm's disallowedTools reach the claude argument list", () => {
  const { buildCells, claudeArgs } = require('../evals/harness/run.js');
  const a = { tasks: [8], arms: null, repeats: 1, model: 'fable', effort: 'medium', stagedPluginDirs: { inline: '/staged-inline', loop: '/staged-loop' } };
  const byArm = Object.fromEntries(buildCells(a).map((c) => {
    const args = claudeArgs(a, c, '/run', '/settings.json');
    return [c.arm, args[args.indexOf('--disallowedTools') + 1]];
  }));
  assert.deepEqual(byArm, { inline: 'PowerShell,Agent,Workflow', loop: 'PowerShell' });
});

test('every visible fixture carries no benchmark context', () => {
  // The lead builds from SPEC.md alone; a stray mention of the plugin, its vocabulary or the
  // hidden suite would prime one arm and not the other.
  const cfg = JSON.parse(fs.readFileSync(path.join(EVALS, 'tasks.json'), 'utf8'));
  const banned = /fabflows|delegate|subagent|worker|workflow|benchmark|refuter|hidden/i;
  const fixtures = cfg.tasks.filter((t) => t.fixture && t.fixture.kind === 'dir').map((t) => path.join(EVALS, t.fixture.from));
  assert.ok(fixtures.length > 0, 'no dir fixture to check');
  for (const visible of fixtures) {
    const files = fs.readdirSync(visible, { recursive: true })
      .map((f) => path.join(visible, f))
      .filter((f) => fs.statSync(f).isFile());
    assert.ok(files.length > 0, `${visible} is empty`);
    for (const f of files) {
      const hit = fs.readFileSync(f, 'utf8').match(banned);
      assert.equal(hit, null, `${path.relative(EVALS, f)} mentions "${hit && hit[0]}"`);
    }
  }
});

test('metrics take input-side sums from the stream and output from the result, per lead and worker type', () => {
  const events = parseTranscript(fs.readFileSync(FIXTURE, 'utf8'));
  const m = computeMetrics(events, { testCommand: 'node --test' });

  // msg_1 appears twice (thinking block, then the Agent call) but is counted once.
  assert.equal(m.lead.messages, 3);
  assert.equal(m.lead.model, 'claude-fable-5-1');
  assert.equal(m.lead.cacheRead, 30000 + 37000 + 37900);
  assert.equal(m.lead.cacheWrite, 7000 + 900 + 400);
  assert.equal(m.lead.finalContext, 8 + 37900 + 400, "final context is the last lead message's full input");
  // Output never comes from the per-message snapshots (a few placeholder tokens each).
  assert.equal(m.lead.output, 180, 'lead output is the result usage, not the stream snapshots');
  assert.equal(m.lead.thinking, 60);
  assert.deepEqual(m.lead.toolCalls, { Agent: 1, Bash: 1 });
  assert.equal(m.lead.verificationRuns, 1, 'a lead test run after a spawn counts as verification');

  const w = m.workers['fabflows:explorer'];
  assert.ok(w, 'worker usage is keyed by the subagent_type from the Agent call');
  assert.equal(w.model, 'claude-haiku-4-5-20251001');
  assert.equal(w.spawns, 1);
  assert.equal(w.messages, 2);
  assert.equal(w.cacheWrite, 8300);
  assert.equal(w.reportedTokens, 16410, 'the Agent tool_result usage block is kept as reported');
  assert.equal(w.output, 100, "worker output is its model's residual after the lead's share, since it is the only Haiku worker");
  assert.deepEqual(w.toolCalls, { Read: 1 });

  assert.equal(m.byModel['claude-fable-5-1'].output, 180);
  assert.equal(m.byModel['claude-haiku-4-5-20251001'].output, 100);
  assert.deepEqual(Object.keys(m.workersByModel), ['claude-haiku-4-5-20251001'], 'the lead share is subtracted from its own model');
  assert.equal(m.workersByModel['claude-haiku-4-5-20251001'].output, 100);
  assert.equal(m.totals.output, 280);
  assert.equal(m.totals.tokens, 40 + 280 + 112900 + 16600);

  assert.equal(m.result.is_error, false);
  assert.equal(m.result.num_turns, 4);
  assert.equal(m.result.total_cost_usd, 1.23);
  assert.equal(m.result.result_text, 'Found it at x.js:12.');
  assert.deepEqual(m.hooks.started, { 'PreToolUse:Read': 1, SubagentStop: 1 });
  assert.equal(m.hooks.rateLimitEvents, 1);
});

test('probe summary counts hook payloads by event, tool and agent type, and sets synthetic ones aside', () => {
  const s = 'sess-1';
  const probe = [
    JSON.stringify({ session_id: s, hook_event_name: 'PreToolUse', tool_name: 'Read', agent_type: 'fabflows:explorer' }),
    JSON.stringify({ session_id: s, hook_event_name: 'PreToolUse', tool_name: 'Read', agent_type: 'fabflows:explorer' }),
    JSON.stringify({ session_id: s, hook_event_name: 'SubagentStop', agent_type: 'fabflows:explorer' }),
    JSON.stringify({ session_id: s, hook_event_name: 'PreToolUse', tool_name: 'Bash' }),
    // guard.test.js drives guard.js with payloads like this one while the task's tests run
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm install x' }, cwd: '.' }),
    'not json',
  ].join('\n');
  assert.deepEqual(summarizeProbe(probe), {
    'PreToolUse:Read:fabflows:explorer': 2,
    'SubagentStop:-:fabflows:explorer': 1,
    'PreToolUse:Bash:lead': 1,
    'synthetic (fixture tests)': 1,
    unparseable: 1,
  });
});

test('grade reads the two halves of the review question from the workflow journal and the hidden run', () => {
  const { grade } = require('../evals/harness/grade.js');
  const os = require('node:os');
  const cfg = JSON.parse(fs.readFileSync(path.join(EVALS, 'tasks.json'), 'utf8'));
  const t8 = cfg.tasks.find((t) => t.id === 8);
  const task = { ...t8, grade: { ...t8.grade, ...t8.arms.loop.grade, testCommand: 'node -e 0' } };
  // The solution passes the hidden suite, so "shipped" can only come from the review naming it.
  const fixture = path.join(OUTDATED, 'solution');
  const metrics = { result: {}, lead: { output: 0 }, totals: { output: 0 }, workers: {}, workflows: [{ name: 'fabflows:build', completed: true, agents: [{ agentType: 'fabflows:refuter' }] }], hooks: {} };
  const withJournal = (rows) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
    fs.mkdirSync(path.join(dir, 'wf_x'));
    fs.writeFileSync(path.join(dir, 'wf_x', 'journal.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'));
    const g = grade({ task, fixture, metrics, timing: {}, maxTurns: 10, workflowDir: dir });
    return Object.fromEntries(g.expectations.filter((e) => e.informational).map((e) => [e.text, e.passed]));
  };
  const rework = withJournal([{ type: 'result', result: { verdict: 'REWORK', mustFix: [{ location: 'src/index.js:90', problem: 'caret on a zero major admits the next minor' }] } }]);
  assert.equal(rework['The review named the planted defect'], true);
  assert.equal(rework['The build round shipped the planted defect'], true);
  assert.equal(rework['The review returned REWORK on any round'], true);
  const accept = withJournal([{ type: 'result', result: { verdict: 'ACCEPT', mustFix: [] } }]);
  assert.equal(accept['The review named the planted defect'], false);
  assert.equal(accept['The build round shipped the planted defect'], false);
});

test('metrics record the cache-write split, each Skill load, SessionStart hook text and where each init plugin came from', () => {
  const events = parseTranscript(fs.readFileSync(path.join(__dirname, 'fixtures', 'transcript-cache-split.jsonl'), 'utf8'));
  const m = computeMetrics(events);
  assert.equal(m.lead.cacheWrite1h, 4000);
  assert.equal(m.lead.cacheWrite5m, 1000 + 300);
  const w = m.workers['fabflows:explorer'];
  assert.equal(w.cacheWrite1h, 0);
  assert.equal(w.cacheWrite5m, 2000);
  assert.equal(m.workersByModel['claude-haiku-4-5-20251001'].cacheWrite5m, 2000, 'each worker model carries its split');
  const body = 'Base directory for this skill: /x\n\nAsk one question at a time.';
  assert.deepEqual(m.skillLoads, [{ name: 'superpowers:brainstorming', chars: body.length }], "the skill's text is the synthetic message after its tool_result");
  assert.equal(m.hookChars, 'You have superpowers.'.length + 'plain text'.length, 'additionalContext when stdout is hook JSON, else stdout; other events not counted');
  assert.deepEqual(m.initPlugins, [
    { name: 'fabflows', source: 'staged' },
    { name: 'data-analysis-review', source: 'synced' },
    { name: 'core', source: 'builtin' },
    { name: 'mine', source: 'other' },
  ]);
});

// One cell's files, as the runner leaves them. cost undefined means a result with no cost.
function writeCell(iterDir, evalDir, arm, run, { cost, synced = [] } = {}) {
  const dir = path.join(iterDir, evalDir, arm, run);
  fs.mkdirSync(dir, { recursive: true });
  const lead = { output: 10, thinking: 0, messages: 1, cacheRead: 0, cacheWrite: 30, cacheWrite1h: 20, cacheWrite5m: 10, finalContext: 0, verificationRuns: 0, toolCalls: {} };
  const metrics = {
    result: { permission_denials: [], num_turns: 1, duration_ms: 1000, total_cost_usd: cost },
    lead, workers: { 'fabflows:explorer': { spawns: 2, cacheWrite1h: 5, cacheWrite5m: 0 } }, workersByModel: {}, hooks: {},
    skillLoads: [{ name: 's', chars: 100 }], hookChars: 7,
    initPlugins: synced.map((name) => ({ name, source: 'synced' })),
  };
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(metrics));
  fs.writeFileSync(path.join(dir, 'grading.json'), JSON.stringify({ expectations: [{ text: 'a', passed: true }] }));
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), '');
}

test('summarize.js compares three arms by cost, counts synced plugins without writing their names, and names cells it leaves out', (t) => {
  const os = require('node:os');
  const iterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summarize-'));
  t.after(() => fs.rmSync(iterDir, { recursive: true, force: true }));
  const e1 = 'eval-1-wide-search';
  const e2 = 'eval-2-scoped-edit';
  writeCell(iterDir, e1, 'with_skill', 'run-1', { cost: 1.5 });
  writeCell(iterDir, e1, 'without_skill', 'run-1', { cost: 1.0 });
  fs.mkdirSync(path.join(iterDir, e1, 'without_skill', 'run-2'), { recursive: true }); // failed: no metrics.json
  writeCell(iterDir, e1, 'superpowers', 'run-1', { cost: 1.2, synced: ['secret-org-plugin'] });
  writeCell(iterDir, e1, 'superpowers', 'run-2', {}); // no total_cost_usd
  writeCell(iterDir, e2, 'with_skill', 'run-1', { cost: 2.0 });
  writeCell(iterDir, e2, 'without_skill', 'run-1', { cost: 1.0 });

  const r = spawnSync(process.execPath, [path.join(EVALS, 'harness', 'summarize.js'), iterDir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.doesNotMatch(out, /NaN/);
  assert.match(out, /mean cost, with_skill against without_skill:\s+wide-search: \+\$0\.50 \(\+50%\)\s+scoped-edit: \+\$1\.00 \(\+100%\)\s+overall \(2 shared tasks\): \+\$0\.75 \(\+75%\)/);
  assert.match(out, /mean cost, superpowers against without_skill:\s+wide-search: \+\$0\.20 \(\+20%\)\s+overall \(1 shared tasks\): \+\$0\.20 \(\+20%\)/, 'the overall figure covers only tasks both arms ran');
  assert.match(out, /mean cost, with_skill against superpowers:\s+wide-search: \+\$0\.30 \(\+25%\)/);
  assert.match(out, /left out of the means:\s+wide-search\/superpowers\/run-2 \(no total_cost_usd\)\s+wide-search\/without_skill\/run-2 \(no metrics\.json\)/);
  assert.match(out, /wide-search\/superpowers\/run-1: secret-org-plugin/, 'synced names are printed');

  const text = fs.readFileSync(path.join(iterDir, 'cells.json'), 'utf8');
  assert.doesNotMatch(text, /secret-org-plugin/, 'and never written to cells.json');
  const rows = JSON.parse(text);
  assert.equal(rows.length, 6);
  const sp = rows.find((x) => x.arm === 'superpowers' && x.run === 'run-1');
  assert.equal(sp.synced_plugin_count, 1);
  assert.equal(rows.find((x) => x.arm === 'superpowers' && x.run === 'run-2').cost, null);
  assert.deepEqual(
    { w1h: sp.cache_write_1h, w5m: sp.cache_write_5m, skill: sp.skill_chars, hook: sp.hook_chars, spawns: sp.spawns, plugin: sp.plugin },
    { w1h: 25, w5m: 10, skill: 100, hook: 7, spawns: 2, plugin: null },
  );
});

test('summarize.js leaves out a cell with metrics.json but no grading.json, and still summarizes the rest', (t) => {
  const os = require('node:os');
  const iterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summarize-'));
  t.after(() => fs.rmSync(iterDir, { recursive: true, force: true }));
  const e1 = 'eval-1-wide-search';
  writeCell(iterDir, e1, 'with_skill', 'run-1', { cost: 1.5 });
  const dir = path.join(iterDir, e1, 'without_skill', 'run-1');
  fs.mkdirSync(dir, { recursive: true }); // grading stage failed: no grading.json written
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify({
    result: { permission_denials: [], num_turns: 1, duration_ms: 1000, total_cost_usd: 1.0 },
    lead: { output: 10, thinking: 0, messages: 1, cacheRead: 0, cacheWrite: 30, cacheWrite1h: 20, cacheWrite5m: 10, finalContext: 0, verificationRuns: 0, toolCalls: {} },
    workers: {}, workersByModel: {}, hooks: {}, skillLoads: [], hookChars: 0, initPlugins: [],
  }));
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), '');

  const r = spawnSync(process.execPath, [path.join(EVALS, 'harness', 'summarize.js'), iterDir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /left out of the means:\s+wide-search\/without_skill\/run-1 \(no grading\.json\)/);
  const rows = JSON.parse(fs.readFileSync(path.join(iterDir, 'cells.json'), 'utf8'));
  assert.equal(rows.length, 1, 'the ungraded cell is left out; the other cell is still written');
  assert.equal(rows[0].arm, 'with_skill');
});

test('annotate_benchmark.py orders the arms, sets the delta to with_skill minus without_skill, and adds dollars and true run counts', (t) => {
  const py = spawnSync('python', ['--version'], { encoding: 'utf8' });
  if (py.error || py.status !== 0) {
    t.skip('python is not on PATH');
    return;
  }
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'annotate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const creator = path.join(root, 'skill-creator');
  fs.mkdirSync(path.join(creator, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(creator, 'scripts', 'aggregate_benchmark.py'), 'def generate_markdown(b):\n    return "configs: " + ",".join(b["run_summary"])\n');
  const iterDir = path.join(root, 'iteration-1');
  const cost = (evalDir, arm, run, c) => {
    const dir = path.join(iterDir, evalDir, arm, run);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify({ lead: { model: 'claude-fable-5-1' }, result: { total_cost_usd: c } }));
  };
  cost('eval-1-a', 'with_skill', 'run-1', 1.5);
  cost('eval-1-a', 'with_skill', 'run-2', 2.5);
  cost('eval-2-b', 'with_skill', 'run-1', 2.0);
  cost('eval-1-a', 'without_skill', 'run-1', 1.0);
  cost('eval-2-b', 'without_skill', 'run-1', 1.0);
  cost('eval-1-a', 'superpowers', 'run-1', 1.2);
  const s = (pr, sec, tok) => ({ pass_rate: { mean: pr }, time_seconds: { mean: sec }, tokens: { mean: tok } });
  // The aggregator's shape: configurations sorted by name, the delta taken from the first two.
  fs.writeFileSync(path.join(iterDir, 'benchmark.json'), JSON.stringify({
    metadata: { runs_per_configuration: 3 },
    run_summary: { superpowers: s(0.5, 10, 100), with_skill: s(0.9, 30, 300), without_skill: s(0.6, 20, 200), delta: { pass_rate: '-0.40', time_seconds: '-20.0', tokens: '-200' } },
    notes: [],
  }));

  const r = spawnSync('python', [path.join(EVALS, 'harness', 'annotate_benchmark.py'), iterDir, creator], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(fs.readFileSync(path.join(iterDir, 'benchmark.json'), 'utf8'));
  assert.deepEqual(Object.keys(b.run_summary), ['with_skill', 'without_skill', 'superpowers', 'delta']);
  assert.deepEqual(b.run_summary.delta, { pass_rate: '+0.30', time_seconds: '+10.0', tokens: '+100', cost_usd: '+1.00' });
  assert.deepEqual(b.run_summary.with_skill.cost_usd, { mean: 2, stddev: 0.5, min: 1.5, max: 2.5 });
  assert.deepEqual(b.run_summary.without_skill.cost_usd, { mean: 1, stddev: 0, min: 1, max: 1 });
  assert.deepEqual(b.run_summary.superpowers.cost_usd, { mean: 1.2, stddev: 0, min: 1.2, max: 1.2 });
  assert.deepEqual(b.notes, [
    'Cost: with_skill mean $2.00 per run, $+1.00 (+100%) against without_skill',
    'Cost: without_skill mean $1.00 per run',
    'Cost: superpowers mean $1.20 per run, $+0.20 (+20%) against without_skill',
  ]);
  assert.equal(b.metadata.runs_per_configuration, 'with_skill 3, without_skill 2, superpowers 1');
  assert.equal(fs.readFileSync(path.join(iterDir, 'benchmark.md'), 'utf8').trimEnd(), 'configs: with_skill,without_skill,superpowers,delta');
});
