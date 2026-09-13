'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'workflows', 'build.js');
const source = fs.readFileSync(SCRIPT, 'utf8');

// The Workflow runtime runs the script body in an async context and supplies agent, phase, log
// and args. Dropping the `export` keyword lets the same text run here against stubs.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const body = source.replace(/^export const meta\b/m, 'const meta');
const meta = new Function(source.slice(0, source.indexOf('\n}\n') + 3).replace('export const meta =', 'return'))();

async function run(args, replies = []) {
  const calls = [];
  const phases = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    return replies.shift();
  };
  const fn = new AsyncFunction('agent', 'phase', 'log', 'args', body);
  const result = await fn(agent, (t) => phases.push(t), () => {}, args);
  return { result, calls, phases };
}

const ARGS = { spec: 'Add a --dry-run flag.', branch: 'feat/dry-run', baseRef: 'abc1234', testCommand: 'npm test' };
const built = { status: 'done', commits: ['def5678'], testOutput: 'ok', deviations: [], report: 'r' };
const blocked = { status: 'blocked', commits: [], testOutput: '', deviations: [], blocker: 'spec contradicts itself', report: 'r' };
const accept = { verdict: 'ACCEPT', mustFix: [], notes: [], testOutput: 'ok', report: 'r' };
const rework = {
  verdict: 'REWORK',
  mustFix: [{ location: 'src/cli.js:10', problem: 'flag is parsed but ignored', evidence: 'no branch reads it', severity: 'high' }],
  notes: [],
  testOutput: 'fail',
  report: 'r',
};

test('meta is a literal naming the build workflow and its two phases', () => {
  assert.equal(meta.name, 'build');
  assert.deepEqual(meta.phases.map((p) => p.title), ['Build', 'Review']);
});

test('starts nothing without settings, with partial settings, or on a default branch', async () => {
  for (const args of [undefined, {}, '']) {
    const { result, calls } = await run(args);
    assert.equal(result.reason, 'no-args', `args=${JSON.stringify(args)}`);
    assert.equal(calls.length, 0);
  }
  const partial = await run({ spec: 'x', branch: 'feat/x' });
  assert.equal(partial.result.reason, 'missing-args');
  assert.deepEqual(partial.result.missing, ['baseRef', 'testCommand']);
  assert.equal(partial.calls.length, 0);
  for (const branch of ['master', 'main', 'Main']) {
    const { result, calls } = await run({ ...ARGS, branch });
    assert.equal(result.reason, 'default-branch', branch);
    assert.equal(calls.length, 0, `${branch} must spawn no agent`);
  }
});

test('accepts on the first round: Opus editor builds, Fable refuter reviews', async () => {
  const { result, calls, phases } = await run(ARGS, [built, accept]);
  assert.equal(result.status, 'accepted');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].opts.agentType, 'fabflows:editor');
  assert.equal(calls[0].opts.model, 'opus');
  assert.equal(calls[1].opts.agentType, 'fabflows:refuter');
  assert.equal(calls[1].opts.model, 'fable');
  assert.match(calls[1].prompt, /git diff abc1234\.\.HEAD/);
  assert.match(result.next, /npm test/);
  for (const t of phases) assert.ok(meta.phases.some((p) => p.title === t), `phase ${t} is not in meta.phases`);
});

test('reworks with the must-fix list, then accepts', async () => {
  const { result, calls } = await run(ARGS, [built, rework, built, accept]);
  assert.equal(result.status, 'accepted');
  assert.equal(result.rounds.length, 2);
  assert.equal(calls.length, 4);
  assert.match(calls[2].prompt, /src\/cli\.js:10 -- flag is parsed but ignored/);
  assert.match(calls[2].prompt, /git diff abc1234\.\.HEAD/);
  assert.doesNotMatch(calls[0].prompt, /rework round/);
});

test('escalates at the rework cap instead of looping', async () => {
  const capped = await run(ARGS, [built, rework, built, rework, built, rework]);
  assert.equal(capped.result.status, 'escalate');
  assert.equal(capped.result.reason, 'rework-cap');
  assert.equal(capped.calls.length, 6);

  const none = await run({ ...ARGS, maxRework: 0 }, [built, rework]);
  assert.equal(none.result.reason, 'rework-cap');
  assert.equal(none.calls.length, 2);
});

test('stops when the builder is blocked or an agent returns nothing', async () => {
  const b = await run(ARGS, [blocked]);
  assert.equal(b.result.reason, 'blocked');
  assert.equal(b.calls.length, 1);

  const dead = await run(ARGS, [null]);
  assert.equal(dead.result.reason, 'builder-failed');

  const noReview = await run(ARGS, [built, null]);
  assert.equal(noReview.result.reason, 'reviewer-failed');

  const empty = await run(ARGS, [built, { ...rework, mustFix: [] }]);
  assert.equal(empty.result.reason, 'rework-without-must-fix');
  assert.equal(empty.calls.length, 2);
});

test('reviewerModel overrides the Fable default', async () => {
  const { calls } = await run({ ...ARGS, reviewerModel: 'opus' }, [built, accept]);
  assert.equal(calls[1].opts.model, 'opus');
});

test('every call pins effort, requires a prose report, and carries all four brief parts', async () => {
  const { calls } = await run(ARGS, [built, rework, built, accept]);
  for (const { prompt, opts } of calls) {
    assert.ok(opts.effort, `${opts.label} must pass effort`);
    assert.ok(opts.schema.required.includes('report'), `${opts.label} schema must require report`);
    for (const part of ['Objective', 'Output', 'Tools and paths', 'Boundaries']) {
      assert.match(prompt, new RegExp(`\\*\\*${part}:\\*\\*`), `${opts.label} brief is missing ${part}`);
    }
  }
});
