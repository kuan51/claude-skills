'use strict';
// Prints, for each task and assertion, how many runs passed in each configuration of one
// iteration, read from every run's grading.json. `--add a+b` adds a combined column that sums
// two configurations, such as a new run and its rerun.
//
//   node plugins/fabflows/evals/harness/assertions.js <iteration-dir> [--add new+rerun ...]

const fs = require('node:fs');
const path = require('node:path');

const dirs = (p) => (fs.existsSync(p) ? fs.readdirSync(p).filter((d) => fs.statSync(path.join(p, d)).isDirectory()).sort() : []);

// rows: [{ task, assertion, counts: { <config>: { passed, runs } } }], in first-seen order.
function tally(iterDir, adds = []) {
  const rows = new Map();
  const configs = new Set();
  for (const evalDir of dirs(iterDir).filter((d) => d.startsWith('eval-'))) {
    const task = evalDir.replace(/^eval-/, '');
    for (const config of dirs(path.join(iterDir, evalDir))) {
      for (const run of dirs(path.join(iterDir, evalDir, config)).filter((d) => d.startsWith('run-'))) {
        const file = path.join(iterDir, evalDir, config, run, 'grading.json');
        if (!fs.existsSync(file)) continue;
        configs.add(config);
        for (const e of JSON.parse(fs.readFileSync(file, 'utf8')).expectations) {
          const key = `${task}\u0000${e.text}`;
          if (!rows.has(key)) rows.set(key, { task, assertion: e.text, counts: {} });
          const c = (rows.get(key).counts[config] ||= { passed: 0, runs: 0 });
          c.runs += 1;
          if (e.passed) c.passed += 1;
        }
      }
    }
  }
  for (const add of adds) {
    const parts = add.split('+');
    if (parts.length < 2 || parts.some((p) => !configs.has(p))) throw new Error(`--add ${add}: each part must be a configuration in ${iterDir} (${[...configs].join(', ')})`);
    for (const row of rows.values()) {
      const have = parts.map((p) => row.counts[p]).filter(Boolean);
      if (have.length) row.counts[add] = { passed: have.reduce((s, c) => s + c.passed, 0), runs: have.reduce((s, c) => s + c.runs, 0) };
    }
    configs.add(add);
  }
  return { configs: [...configs], rows: [...rows.values()] };
}

function render({ configs, rows }) {
  const head = ['task', 'assertion', ...configs];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const r of rows) lines.push(`| ${[r.task, r.assertion.replace(/\|/g, '\\|'), ...configs.map((c) => (r.counts[c] ? `${r.counts[c].passed}/${r.counts[c].runs}` : '-'))].join(' | ')} |`);
  return lines.join('\n');
}

module.exports = { tally, render };

if (require.main === module) {
  const args = process.argv.slice(2);
  const adds = [];
  let iterDir = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--add') adds.push(args[++i]);
    else iterDir = args[i];
  }
  if (!iterDir) {
    console.error('usage: assertions.js <iteration-dir> [--add a+b ...]');
    process.exit(2);
  }
  console.log(render(tally(path.resolve(iterDir), adds)));
}
