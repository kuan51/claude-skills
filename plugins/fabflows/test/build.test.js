'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'workflows', 'build.js');
const source = fs.readFileSync(SCRIPT, 'utf8');

// The Workflow runtime runs the script body in an async context and supplies agent, log and
// args. Dropping the `export` keyword lets the same text run here against stubs.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const body = source.replace(/^export const meta\b/m, 'const meta');

async function run(args, replies = []) {
  const calls = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    return replies.shift();
  };
  const fn = new AsyncFunction('agent', 'log', 'args', body);
  const result = await fn(agent, () => {}, args);
  return { result, calls };
}

const ARGS = { spec: 'Add a --dry-run flag.', branch: 'feat/dry-run', baseRef: 'abc1234', testCommand: 'npm test' };
const built = { status: 'done', report: 'r' };
const blocked = { status: 'blocked', blocker: 'spec contradicts itself', report: 'r' };
const accept = { verdict: 'ACCEPT', mustFix: [], report: 'r' };
const rework = {
  verdict: 'REWORK',
  mustFix: [{ location: 'src/cli.js:10', problem: 'flag is parsed but ignored', evidence: 'no branch reads it', severity: 'high' }],
  report: 'r',
};
const reviewBlocked = { verdict: 'BLOCKED', blocker: 'npm is not installed', mustFix: [], report: 'r' };

test('starts nothing without settings, with partial settings, or on a default branch', async () => {
  for (const args of [undefined, {}, '']) {
    const { result, calls } = await run(args);
    assert.equal(result.reason, 'missing-args', `args=${JSON.stringify(args)}`);
    assert.deepEqual(result.missing, ['spec', 'branch', 'baseRef', 'testCommand']);
    assert.equal(calls.length, 0);
  }
  const partial = await run({ spec: 'x', branch: 'feat/x' });
  assert.deepEqual(partial.result.missing, ['baseRef', 'testCommand']);
  assert.equal(partial.calls.length, 0);
  const blank = await run({ ...ARGS, spec: '   ' });
  assert.deepEqual(blank.result.missing, ['spec']);
  for (const branch of ['master', 'main', 'Main', ' main ']) {
    const { result, calls } = await run({ ...ARGS, branch });
    assert.equal(result.reason, 'default-branch', branch);
    assert.equal(calls.length, 0, `${branch} must spawn no agent`);
  }
});

test('accepts on the first round: Opus editor builds, Fable refuter reviews', async () => {
  const { result, calls } = await run(ARGS, [built, accept]);
  assert.equal(result.status, 'accepted');
  assert.equal(result.baseRef, 'abc1234');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].opts.agentType, 'fabflows:editor');
  assert.equal(calls[0].opts.model, 'opus');
  assert.match(calls[0].prompt, /git rev-parse --abbrev-ref HEAD`; if it does not print `feat\/dry-run`/);
  assert.equal(calls[1].opts.agentType, 'fabflows:refuter');
  assert.equal(calls[1].opts.model, 'fable');
  assert.match(calls[1].prompt, /git diff abc1234\.\.HEAD/);
});

test('trims the settings before they reach a brief', async () => {
  const { calls } = await run({ ...ARGS, branch: ' feat/dry-run ', baseRef: 'abc1234\n' }, [built, accept]);
  assert.match(calls[0].prompt, /does not print `feat\/dry-run`,/);
  assert.match(calls[1].prompt, /git diff abc1234\.\.HEAD/);
});

test('reworks with the must-fix list, then accepts', async () => {
  const { result, calls } = await run(ARGS, [built, rework, built, accept]);
  assert.equal(result.status, 'accepted');
  assert.equal(result.rounds.length, 2);
  assert.equal(calls.length, 4);
  assert.match(calls[2].prompt, /This is rework round 1\./);
  assert.match(calls[2].prompt, /src\/cli\.js:10 -- flag is parsed but ignored/);
  assert.match(calls[2].prompt, /git diff abc1234\.\.HEAD/);
  assert.doesNotMatch(calls[0].prompt, /rework round/);
});

test('escalates at the rework cap instead of looping', async () => {
  const rework2 = { ...rework, mustFix: [{ ...rework.mustFix[0], location: 'src/cli.js:20' }] };
  const { result, calls } = await run(ARGS, [built, rework, built, rework2, built, rework]);
  assert.equal(result.status, 'escalate');
  assert.equal(result.reason, 'rework-cap');
  assert.equal(calls.length, 6);
  assert.match(calls[4].prompt, /This is rework round 2\./);
  assert.match(calls[4].prompt, /src\/cli\.js:20/);
  assert.doesNotMatch(calls[4].prompt, /src\/cli\.js:10/);
  assert.equal(result.verdict, result.rounds[2].review);
});

test('escalates when a review accepts but still lists must-fix items', async () => {
  const { result, calls } = await run(ARGS, [built, { ...accept, mustFix: rework.mustFix }]);
  assert.equal(result.status, 'escalate');
  assert.equal(result.reason, 'accept-with-must-fix');
  assert.equal(calls.length, 2);
});

test('escalates when the reviewer could not review, in any round', async () => {
  const first = await run(ARGS, [built, reviewBlocked]);
  assert.equal(first.result.reason, 'reviewer-blocked');
  assert.equal(first.result.verdict.blocker, 'npm is not installed');
  assert.equal(first.calls.length, 2);

  const later = await run(ARGS, [built, rework, built, reviewBlocked]);
  assert.equal(later.result.reason, 'reviewer-blocked');
  assert.equal(later.result.rounds.length, 2);
  assert.equal(later.calls.length, 4);

  // Must-fix items sent with BLOCKED are not rework: the review never ran.
  const withItems = await run(ARGS, [built, { ...reviewBlocked, mustFix: rework.mustFix }]);
  assert.equal(withItems.result.reason, 'reviewer-blocked');
  assert.equal(withItems.calls.length, 2);

  assert.match(first.calls[1].prompt, /BLOCKED when you could not run/);
});

test('stops when the builder is blocked or an agent returns nothing', async () => {
  const b = await run(ARGS, [blocked]);
  assert.equal(b.result.reason, 'blocked');
  assert.equal(b.result.rounds[0].build.blocker, 'spec contradicts itself');
  assert.equal(b.calls.length, 1);

  const dead = await run(ARGS, [null]);
  assert.equal(dead.result.reason, 'builder-failed');

  const noReview = await run(ARGS, [built, null]);
  assert.equal(noReview.result.reason, 'reviewer-failed');
  assert.equal(noReview.result.rounds.length, 1);

  const empty = await run(ARGS, [built, { ...rework, mustFix: [] }]);
  assert.equal(empty.result.reason, 'rework-without-must-fix');
  assert.equal(empty.calls.length, 2);
});

test('escalates a done reply that still names a blocker, and tells the builder a denial is one', async () => {
  const { result, calls } = await run(ARGS, [{ ...built, blocker: 'could not run tests' }, accept]);
  assert.equal(result.status, 'escalate');
  assert.equal(result.reason, 'blocked');
  assert.equal(result.rounds[0].build.blocker, 'could not run tests');
  assert.equal(calls.length, 1, 'no review may run on a contradictory reply');
  assert.match(calls[0].prompt, /permission denial/);

  const blank = await run(ARGS, [{ ...built, blocker: ' ' }, accept]);
  assert.equal(blank.result.status, 'accepted', 'a blank blocker is not a blocker');
});

test('every escalation carries status, baseRef, and the last verdict', async () => {
  const cases = [
    [[blocked], 'blocked', null],
    [[{ ...built, blocker: 'could not run tests' }], 'blocked', null],
    [[null], 'builder-failed', null],
    [[built, null], 'reviewer-failed', null],
    [[built, { ...rework, mustFix: [] }], 'rework-without-must-fix', 'REWORK'],
    [[built, { ...accept, mustFix: rework.mustFix }], 'accept-with-must-fix', 'ACCEPT'],
    [[built, reviewBlocked], 'reviewer-blocked', 'BLOCKED'],
    [[built, rework, built, reviewBlocked], 'reviewer-blocked', 'BLOCKED'],
    [[built, rework, null], 'builder-failed', 'REWORK'],
    [[built, rework, built, null], 'reviewer-failed', 'REWORK'],
  ];
  for (const [replies, reason, last] of cases) {
    const { result } = await run(ARGS, replies);
    assert.equal(result.status, 'escalate', reason);
    assert.equal(result.reason, reason);
    assert.equal(result.baseRef, 'abc1234', `${reason} must carry baseRef`);
    assert.ok('verdict' in result, `${reason} must carry verdict`);
    assert.equal(result.verdict ? result.verdict.verdict : null, last, `${reason} last verdict`);
  }
});

test('reviewerModel overrides the Fable default', async () => {
  const { calls } = await run({ ...ARGS, reviewerModel: 'opus' }, [built, accept]);
  assert.equal(calls[1].opts.model, 'opus');
});

test('every call pins effort, requires a prose report, and carries the spec and all four brief parts', async () => {
  const { calls } = await run(ARGS, [built, rework, built, accept]);
  for (const { prompt, opts } of calls) {
    assert.ok(opts.effort, `${opts.label} must pass effort`);
    assert.ok(opts.schema.required.includes('report'), `${opts.label} schema must require report`);
    assert.equal(opts.schema.properties.report.minLength, 1, `${opts.label} report must not be empty`);
    assert.ok(prompt.includes(`<spec>\n${ARGS.spec}\n</spec>`), `${opts.label} brief is missing the spec`);
    for (const part of ['Objective', 'Output', 'Tools and paths', 'Boundaries']) {
      assert.match(prompt, new RegExp(`\\*\\*${part}:\\*\\*`), `${opts.label} brief is missing ${part}`);
    }
  }
});
