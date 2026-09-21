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

test('tasks.json is well formed: unique ids, both arms, a prompt and a grade kind per task', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(EVALS, 'tasks.json'), 'utf8'));
  assert.deepEqual(Object.keys(cfg.arms).sort(), ['with_skill', 'without_skill']);
  assert.ok(cfg.arms.with_skill.pluginDir, 'with_skill must name the plugin directory to load');
  assert.ok(cfg.caps.maxTurns > 0 && cfg.caps.maxBudgetUsd > 0, 'caps must be set: an uncapped run is an open wallet');
  // The default fixture is a pinned commit so no session ever sees the benchmark's own tasks,
  // graders or results inside its working tree.
  assert.equal(cfg.fixture.kind, 'repo', 'the default fixture must be a clone of this repo');
  assert.equal(typeof cfg.fixture.ref, 'string', 'the default fixture must pin a ref');
  const ids = cfg.tasks.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'task ids must be unique');
  for (const t of cfg.tasks) {
    assert.ok(t.name && t.prompt && t.routing, `task ${t.id} needs name, prompt and routing`);
    assert.ok(['agent-inventory', 'edit', 'new-tests', 'test-triage', 'decision-digest', 'hidden-tests'].includes(t.grade.kind), `task ${t.id} has unknown grade kind ${t.grade.kind}`);
    if (['edit', 'new-tests', 'test-triage', 'hidden-tests'].includes(t.grade.kind)) assert.ok(t.grade.testCommand, `task ${t.id} must name the test command that proves it`);
    if (t.grade.kind === 'hidden-tests') assert.ok(t.grade.hidden && t.grade.rootEnv, `task ${t.id} must name the hidden suite and the env var that points it at the fixture`);
    for (const s of t.setup || []) assert.ok(s.file && s.find && typeof s.replace === 'string', `task ${t.id} setup entries need file, find and replace`);
    if (t.fixture) {
      assert.ok(['repo', 'dir'].includes(t.fixture.kind), `task ${t.id} has unknown fixture kind ${t.fixture.kind}`);
      if (t.fixture.kind === 'repo') assert.equal(typeof t.fixture.ref, 'string', `task ${t.id} repo fixture must pin a ref`);
      if (t.fixture.kind === 'dir') {
        assert.equal(typeof t.fixture.from, 'string', `task ${t.id} dir fixture must say where it is copied from`);
        assert.ok(fs.existsSync(path.join(EVALS, t.fixture.from, 'SPEC.md')), `task ${t.id} dir fixture must exist and carry a SPEC.md`);
      }
    }
    for (const [k, v] of Object.entries(t.caps || {})) assert.ok(typeof v === 'number' && v > 0, `task ${t.id} cap ${k} must be a positive number`);
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

test('the visible fixture carries no benchmark context', () => {
  // The lead builds from SPEC.md alone; a stray mention of the plugin or its vocabulary would
  // prime one arm and not the other.
  const visible = path.join(DEP_RESOLVER, 'visible');
  const banned = /fabflows|delegate|subagent|worker|workflow|benchmark|refuter/i;
  const files = fs.readdirSync(visible, { recursive: true })
    .map((f) => path.join(visible, f))
    .filter((f) => fs.statSync(f).isFile());
  assert.ok(files.length > 0, 'the visible fixture is empty');
  for (const f of files) {
    const hit = fs.readFileSync(f, 'utf8').match(banned);
    assert.equal(hit, null, `${path.relative(visible, f)} mentions "${hit && hit[0]}"`);
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
