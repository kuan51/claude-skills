'use strict';
// Prints the per-cell table for one iteration and writes cells.json beside it: quality (the
// task assertions, with the "no denial" environment check split out), turns, the lead's
// tokens by category, context sizes, worker tokens, list cost, duration, verification re-runs
// and guard hook payloads, cache writes by lifetime, Skill and SessionStart hook text, spawns
// and synced plugins; then each arm's mean cost against without_skill, and with_skill against
// superpowers. `node summarize.js <iteration-dir>`.

const fs = require('node:fs');
const path = require('node:path');

const iterDir = path.resolve(process.argv[2] || 'plugins/fabflows/evals/runs/iteration-1');
const rows = [];
const leftOut = []; // cells kept out of the means, with the reason
const syncedNames = []; // printed only: an organization's plugin names may be private

for (const evalDir of fs.readdirSync(iterDir).filter((d) => d.startsWith('eval-')).sort()) {
  const task = evalDir.replace(/^eval-\d+-/, '');
  for (const arm of fs.readdirSync(path.join(iterDir, evalDir)).filter((d) => fs.statSync(path.join(iterDir, evalDir, d)).isDirectory()).sort()) {
    for (const run of fs.readdirSync(path.join(iterDir, evalDir, arm)).filter((d) => d.startsWith('run-')).sort()) {
      const dir = path.join(iterDir, evalDir, arm, run);
      if (!fs.existsSync(path.join(dir, 'metrics.json'))) {
        leftOut.push(`${task}/${arm}/${run} (no metrics.json)`);
        continue;
      }
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
      const g = JSON.parse(fs.readFileSync(path.join(dir, 'grading.json'), 'utf8'));
      const events = fs.readFileSync(path.join(dir, 'transcript.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
      const first = events.find((e) => e.type === 'assistant' && !e.parent_tool_use_id);
      const fu = (first && first.message.usage) || {};
      const substantive = g.expectations.filter((e) => e.text !== 'No tool call was denied' && !e.informational);
      const wb = m.workersByModel || {};
      const runJson = path.join(dir, 'run.json');
      const plugin = (fs.existsSync(runJson) && JSON.parse(fs.readFileSync(runJson, 'utf8')).plugin) || null;
      const workerList = Object.values(m.workers);
      const synced = (m.initPlugins || []).filter((p) => p.source === 'synced').map((p) => p.name);
      if (synced.length) syncedNames.push(`${task}/${arm}/${run}: ${synced.join(', ')}`);
      const cost = typeof m.result.total_cost_usd === 'number' ? m.result.total_cost_usd : null;
      if (cost === null) leftOut.push(`${task}/${arm}/${run} (no total_cost_usd)`);
      rows.push({
        task, arm, run, plugin,
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
        spawns: workerList.reduce((s, w) => s + (w.spawns || 0), 0),
        // Lead and workers together; a metrics.json from before the split reads as 0.
        cache_write_1h: [m.lead, ...workerList].reduce((s, x) => s + (x.cacheWrite1h || 0), 0),
        cache_write_5m: [m.lead, ...workerList].reduce((s, x) => s + (x.cacheWrite5m || 0), 0),
        skill_chars: (m.skillLoads || []).reduce((s, l) => s + (l.chars || 0), 0),
        hook_chars: m.hookChars || 0,
        synced_plugin_count: synced.length,
        // timing.json holds the harness wall clock, which is the only clock that spans a
        // workflow running between the lead's turns; the result's duration is per turn.
        cost, sec: ((fs.existsSync(path.join(dir, 'timing.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8')).duration_ms) || m.result.duration_ms || 0) / 1000,
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
  ['cache_write_1h', 'cw_1h', (v) => v.toFixed(0)], ['cache_write_5m', 'cw_5m', (v) => v.toFixed(0)],
  ['skill_chars', 'skill_ch', (v) => v.toFixed(0)], ['hook_chars', 'hook_ch', (v) => v.toFixed(0)],
  ['spawns', 'spawns', (v) => v.toFixed(1)], ['synced_plugin_count', 'synced', (v) => v.toFixed(1)],
];
// Only cells with a cost enter the means; the rest are named below.
const priced = rows.filter((r) => r.cost !== null);
const tasks = [...new Set(priced.map((r) => r.task)), 'ALL'];
const arms = [...new Set(priced.map((r) => r.arm))];
const cellsOf = (task, arm) => priced.filter((r) => (task === 'ALL' || r.task === task) && r.arm === arm);
const table = [];
for (const task of tasks) for (const arm of arms) {
  const rs = cellsOf(task, arm);
  const costs = rs.map((r) => r.cost);
  if (rs.length) table.push({ task, arm, n: rs.length, ...Object.fromEntries(cols.map(([k, h, f]) => [h, f(mean(rs.map((r) => r[k])))])), cost_range: `${Math.min(...costs).toFixed(2)}-${Math.max(...costs).toFixed(2)}` });
}
console.table(table);

// Mean cost of one arm against another, per task and overall. The overall figure pools the
// cells of the tasks where both arms have cells, so a task only one arm ran never skews it.
const diff = (a, b) => {
  const d = mean(a.map((r) => r.cost)) - mean(b.map((r) => r.cost));
  const base = mean(b.map((r) => r.cost));
  return `${d >= 0 ? '+' : '-'}$${Math.abs(d).toFixed(2)} (${base ? `${d >= 0 ? '+' : ''}${((d / base) * 100).toFixed(0)}%` : 'n/a'})`;
};
function compare(arm, base) {
  if (!arms.includes(arm) || !arms.includes(base)) return;
  console.log(`\nmean cost, ${arm} against ${base}:`);
  const shared = tasks.filter((t) => t !== 'ALL' && cellsOf(t, arm).length && cellsOf(t, base).length);
  for (const t of shared) console.log(`  ${t}: ${diff(cellsOf(t, arm), cellsOf(t, base))}`);
  const pool = (x) => priced.filter((r) => r.arm === x && shared.includes(r.task));
  if (shared.length) console.log(`  overall (${shared.length} shared tasks): ${diff(pool(arm), pool(base))}`);
}
for (const arm of arms) if (arm !== 'without_skill') compare(arm, 'without_skill');
compare('with_skill', 'superpowers');

if (syncedNames.length) {
  console.log('\nsynced plugins loaded (names are printed, never written to cells.json):');
  for (const s of syncedNames) console.log(`  ${s}`);
}
if (leftOut.length) {
  console.log('\nleft out of the means:');
  for (const s of leftOut) console.log(`  ${s}`);
}
for (const arm of arms) {
  console.log(`\nworkers spawned and lead tools (${arm}):`);
  for (const r of rows.filter((r) => r.arm === arm)) console.log(`  ${r.task}/${r.run}: ${JSON.stringify(r.workers)}  lead tools ${JSON.stringify(r.tools)}`);
}
