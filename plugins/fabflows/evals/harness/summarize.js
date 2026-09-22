'use strict';
// Prints the per-cell table for one iteration and writes cells.json beside it: quality (the
// task assertions, with the "no denial" environment check split out), turns, the lead's
// tokens by category, context sizes, worker tokens, list cost, duration, verification re-runs
// and guard hook payloads. `node summarize.js <iteration-dir>`.

const fs = require('node:fs');
const path = require('node:path');

const iterDir = path.resolve(process.argv[2] || 'plugins/fabflows/evals/runs/iteration-1');
const rows = [];

for (const evalDir of fs.readdirSync(iterDir).filter((d) => d.startsWith('eval-')).sort()) {
  const task = evalDir.replace(/^eval-\d+-/, '');
  for (const arm of fs.readdirSync(path.join(iterDir, evalDir)).filter((d) => fs.statSync(path.join(iterDir, evalDir, d)).isDirectory()).sort()) {
    for (const run of fs.readdirSync(path.join(iterDir, evalDir, arm)).filter((d) => d.startsWith('run-')).sort()) {
      const dir = path.join(iterDir, evalDir, arm, run);
      if (!fs.existsSync(path.join(dir, 'metrics.json'))) continue;
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
      const g = JSON.parse(fs.readFileSync(path.join(dir, 'grading.json'), 'utf8'));
      const events = fs.readFileSync(path.join(dir, 'transcript.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
      const first = events.find((e) => e.type === 'assistant' && !e.parent_tool_use_id);
      const fu = (first && first.message.usage) || {};
      const substantive = g.expectations.filter((e) => e.text !== 'No tool call was denied');
      const wb = m.workersByModel || {};
      rows.push({
        task, arm, run,
        quality: substantive.filter((e) => e.passed).length / substantive.length,
        denials: m.result.permission_denials.length,
        turns: m.result.num_turns,
        lead_out: m.lead.output, lead_think: m.lead.thinking, lead_msgs: m.lead.messages,
        lead_cache_read: m.lead.cacheRead, lead_cache_write: m.lead.cacheWrite,
        first_ctx: (fu.input_tokens || 0) + (fu.cache_read_input_tokens || 0) + (fu.cache_creation_input_tokens || 0),
        final_ctx: m.lead.finalContext,
        worker_out: Object.values(wb).reduce((s, w) => s + w.output, 0),
        worker_in: Object.values(wb).reduce((s, w) => s + w.input + w.cacheRead + w.cacheWrite, 0),
        workers: Object.fromEntries(Object.entries(m.workers).map(([k, v]) => [k, v.spawns])),
        // timing.json holds the harness wall clock, which is the only clock that spans a
        // workflow running between the lead's turns; the result's duration is per turn.
        cost: m.result.total_cost_usd, sec: ((fs.existsSync(path.join(dir, 'timing.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8')).duration_ms) || m.result.duration_ms || 0) / 1000,
        verification_runs: m.lead.verificationRuns,
        hook_payloads: Object.entries(m.hooks.probe || {}).filter(([k]) => !k.startsWith('synthetic') && k !== 'unparseable').reduce((s, [, n]) => s + n, 0),
        tools: m.lead.toolCalls,
      });
    }
  }
}

fs.writeFileSync(path.join(iterDir, 'cells.json'), `${JSON.stringify(rows, null, 1)}\n`);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const cols = [
  ['quality', 'qual', (v) => v.toFixed(2)], ['denials', 'deny', (v) => v.toFixed(1)], ['turns', 'turns', (v) => v.toFixed(1)],
  ['lead_out', 'lead_out', (v) => v.toFixed(0)], ['lead_think', 'think', (v) => v.toFixed(0)],
  ['lead_cache_read', 'cache_rd', (v) => v.toFixed(0)], ['lead_cache_write', 'cache_wr', (v) => v.toFixed(0)],
  ['first_ctx', '1st_ctx', (v) => v.toFixed(0)], ['final_ctx', 'fin_ctx', (v) => v.toFixed(0)],
  ['worker_out', 'w_out', (v) => v.toFixed(0)], ['worker_in', 'w_in', (v) => v.toFixed(0)],
  ['cost', 'cost$', (v) => v.toFixed(2)], ['sec', 'sec', (v) => v.toFixed(0)],
  ['verification_runs', 'verif', (v) => v.toFixed(1)], ['hook_payloads', 'hooks', (v) => v.toFixed(0)],
];
const tasks = [...new Set(rows.map((r) => r.task)), 'ALL'];
const arms = [...new Set(rows.map((r) => r.arm))];
const table = [];
for (const task of tasks) for (const arm of arms) {
  const rs = rows.filter((r) => (task === 'ALL' || r.task === task) && r.arm === arm);
  if (rs.length) table.push({ task, arm, n: rs.length, ...Object.fromEntries(cols.map(([k, h, f]) => [h, f(mean(rs.map((r) => r[k])))])) });
}
console.table(table);
console.log('\nworkers spawned (with_skill):');
for (const r of rows.filter((r) => r.arm === 'with_skill')) console.log(`  ${r.task}/${r.run}: ${JSON.stringify(r.workers)}  lead tools ${JSON.stringify(r.tools)}`);
console.log('\nlead tools (without_skill):');
for (const r of rows.filter((r) => r.arm === 'without_skill')) console.log(`  ${r.task}/${r.run}: ${JSON.stringify(r.tools)}`);
