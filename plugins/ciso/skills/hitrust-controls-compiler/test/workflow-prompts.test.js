'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// workflow.js runs inside the Workflow tool with `agent`, `parallel`, `phase`, `log` and `args` in
// scope and a top-level `return`. Evaluate it the same way: as an AsyncFunction body with those
// names as parameters, after stripping the leading `export` (not valid inside a function).
const SOURCE = fs
  .readFileSync(path.join(__dirname, '..', 'workflow.js'), 'utf8')
  .replace(/^export\s+/, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runWorkflow = new AsyncFunction('agent', 'parallel', 'phase', 'args', 'log', SOURCE);

const DOMAINS = [
  { key: '01', name: 'Information Protection Program' },
  { key: '02', name: 'Endpoint Protection' },
  { key: '03', name: 'Portable Media Security' },
];
const BASELINE = 'e1 covers: access control basics; malware protection.';

function args(tier, extra = {}) {
  return { tier, hitrustVersion: 'v11.8', domains: DOMAINS, ...(tier === 'i1' ? { baselineSummary: BASELINE } : {}), ...extra };
}

const candidate = (label) => ({ topicLabel: label, topicSummary: 's', citations: ['https://example.com/a'] });

// research(key) returns what that domain's researcher returns; every candidate survives review.
async function run(a, research = () => ({ candidates: [candidate('t')], r2IllustrativeCandidates: [] })) {
  const calls = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    if (opts.label.startsWith('research:')) return research(opts.label.slice('research:'.length));
    if (opts.label === 'reconcile') {
      return { mergedCandidates: [{ ...candidate('t'), domain: DOMAINS[0].name }], r2IllustrativeCandidates: [], droppedDuplicates: [], coverageGaps: [], zeroCandidateDomains: [] };
    }
    return { verdict: 'accept', citationOk: true, baselineOk: true, precisionOk: true, reason: 'ok' };
  };
  const parallel = (fns) => Promise.all(fns.map((f) => f().catch(() => null)));
  const result = await runWorkflow(agent, parallel, () => {}, a, () => {});
  const judges = calls.filter((c) => /^(refute|confirm):/.test(c.opts.label));
  return { calls, judges, result };
}

test('both verifier passes are told the tier and the HITRUST version to judge staleness against', async () => {
  for (const tier of ['e1', 'i1']) {
    const { judges } = await run(args(tier));
    assert.ok(judges.some((c) => c.opts.label.startsWith('refute:')) && judges.some((c) => c.opts.label.startsWith('confirm:')), tier);
    for (const c of judges) assert.ok(c.prompt.includes(`HITRUST ${tier} v11.8. Judge staleness against this version.`), c.opts.label);
  }
});

test('i1 verifiers get the e1 baseline summary they judge baselineOverlap against; e1 verifiers do not', async () => {
  const i1 = await run(args('i1'));
  for (const c of i1.judges) assert.ok(c.prompt.includes(BASELINE), c.opts.label);
  const e1 = await run(args('e1', { baselineSummary: BASELINE }));
  for (const c of e1.judges) assert.ok(!c.prompt.includes(BASELINE), c.opts.label);
});

test('the i1 reconcile schema keeps baselineOverlapReason, so the reason reaches the verifier', async () => {
  const { calls } = await run(args('i1'));
  const rec = calls.find((c) => c.opts.label === 'reconcile');
  assert.ok(rec.opts.schema.properties.mergedCandidates.items.properties.baselineOverlapReason);
});

test('a domain whose research returned nothing or was blocked is in failedDomains; an honest zero is not', async () => {
  const research = (key) => {
    if (key === '01') return null;
    if (key === '02') return { candidates: [], r2IllustrativeCandidates: [], blocked: 'WebFetch was denied' };
    return { candidates: [], r2IllustrativeCandidates: [] };
  };
  const { calls, result } = await run(args('e1'), research);
  assert.deepEqual(result.failedDomains, [
    { key: '01', reason: 'the research agent returned nothing or failed' },
    { key: '02', reason: 'WebFetch was denied' },
  ]);
  const research01 = calls.find((c) => c.opts.label === 'research:01');
  assert.equal(research01.opts.schema.properties.blocked.type, 'string');
  assert.ok(!research01.opts.schema.required.includes('blocked'), 'blocked is optional');
  assert.match(research01.prompt, /say what failed in `blocked`/, 'the researcher is told to fill blocked');
  const clean = await run(args('e1'));
  assert.deepEqual(clean.result.failedDomains, []);
  // An agent that throws (an unknown agent type, a spent budget) is named too, not a crash.
  const thrown = await run(args('e1'), (key) => {
    if (key === '02') throw new Error('agent type not found');
    return { candidates: [], r2IllustrativeCandidates: [] };
  });
  assert.deepEqual(thrown.result.failedDomains, [{ key: '02', reason: 'the research agent returned nothing or failed' }]);
});
