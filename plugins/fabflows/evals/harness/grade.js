'use strict';
// Grades one finished run against its task's assertions and writes grading.json in the exact
// shape skill-creator's viewer and aggregate_benchmark.py read: expectations[].text / passed /
// evidence, plus summary. Everything here is checked against the fixture clone and the run's
// metrics, never against what the lead said it did.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function sh(command, cwd) {
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: 5 * 60 * 1000 });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

// Porcelain lines are `XY path`; the leading space of ` M path` is significant, so the raw
// stdout is split without trimming.
function gitStatus(fixture) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: fixture, encoding: 'utf8' });
  return (r.stdout || '')
    .split(/\r?\n/)
    .filter((l) => l.length > 3)
    .map((l) => ({ code: l.slice(0, 2).trim(), file: l.slice(3).trim().replace(/^"|"$/g, '').replace(/\\/g, '/') }));
}

const tail = (s, n = 4) => s.split(/\r?\n/).filter(Boolean).slice(-n).join(' | ');
const posix = (p) => p.replace(/\\/g, '/');

// Same parse as test/helpers/frontmatter.js, plus the line number of each field.
function agentTruth(fixture) {
  const rows = [];
  const pluginsDir = path.join(fixture, 'plugins');
  if (!fs.existsSync(pluginsDir)) return rows;
  for (const plugin of fs.readdirSync(pluginsDir)) {
    const agentsDir = path.join(pluginsDir, plugin, 'agents');
    if (!fs.existsSync(agentsDir)) continue;
    for (const f of fs.readdirSync(agentsDir).filter((x) => x.endsWith('.md'))) {
      const lines = fs.readFileSync(path.join(agentsDir, f), 'utf8').split(/\r?\n/);
      if (lines[0].trim() !== '---') continue;
      const fields = {};
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') break;
        const idx = lines[i].indexOf(':');
        if (idx === -1) continue;
        fields[lines[i].slice(0, idx).trim()] = { value: lines[i].slice(idx + 1).trim(), line: i + 1 };
      }
      rows.push({
        file: `plugins/${plugin}/agents/${f}`,
        base: f,
        model: fields.model ? fields.model.value : null,
        modelLine: fields.model ? fields.model.line : null,
      });
    }
  }
  return rows;
}

// The window of text around the first mention of an agent: its line plus the next two, which
// covers a table row, a bullet with sub-bullets, and a heading followed by fields. With
// `withLeadIn`, the window also reaches back to the section's lead-in (a heading, a bold line,
// or a line ending in a colon), because a lead that writes "11 agents pin no model" above a
// table has flagged every row in it as surely as one that writes "none" in each row.
function windowFor(text, needle, withLeadIn = false) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => l.toLowerCase().includes(needle.toLowerCase()));
  if (i === -1) return null;
  let start = i;
  if (withLeadIn) {
    for (let k = i - 1; k >= 0 && k >= i - 25; k--) {
      const l = lines[k].trim();
      if (/^#{1,6}\s/.test(l) || /^\*\*.+\*\*:?$/.test(l) || /:$/.test(l)) {
        start = k;
        break;
      }
    }
  }
  return lines.slice(start, i + 3).join('\n');
}

function gradeInventory(exp, fixture, resultText) {
  const truth = agentTruth(fixture);
  const text = posix(resultText);
  const missing = truth.filter((t) => !text.toLowerCase().includes(t.file.toLowerCase()) && !text.toLowerCase().includes(`agents/${t.base}`.toLowerCase()));
  exp.push({
    text: `Names every agent file (${truth.length} agents)`,
    passed: missing.length === 0,
    evidence: missing.length ? `missing: ${missing.map((m) => m.file).join(', ')}` : `all ${truth.length} agent paths present`,
  });

  const pinned = truth.filter((t) => t.model);
  const wrongModel = pinned.filter((t) => {
    const w = windowFor(text, `agents/${t.base}`);
    return !w || !new RegExp(`\\b${t.model}\\b`, 'i').test(w);
  });
  exp.push({
    text: `Reports the correct model for every pinned agent (${pinned.length})`,
    passed: wrongModel.length === 0,
    evidence: wrongModel.length ? `wrong or absent for: ${wrongModel.map((m) => `${m.base} (${m.model})`).join(', ')}` : 'every pinned model matches the frontmatter',
  });

  const noLine = pinned.filter((t) => !new RegExp(`${t.base.replace('.', '\\.')}:${t.modelLine}\\b`).test(text));
  exp.push({
    text: 'Gives the model pin as path:line for every pinned agent',
    passed: noLine.length === 0,
    evidence: noLine.length ? `no path:line for: ${noLine.map((m) => `${m.base}:${m.modelLine}`).join(', ')}` : 'every pinned agent cited with its line number',
  });

  const unpinned = truth.filter((t) => !t.model);
  const flagRe = /\b(none|no model|no pin|not pinned|unpinned|missing|inherits?|no `?model`?:?`?|pins? no|without a? ?`?model)\b|\|\s*[-—–]+\s*\|/i;
  const unflagged = unpinned.filter((t) => {
    const w = windowFor(text, `agents/${t.base}`, true);
    return !w || !flagRe.test(w);
  });
  exp.push({
    text: `Flags every agent without a model pin (${unpinned.length})`,
    passed: unflagged.length === 0,
    evidence: unflagged.length ? `not flagged: ${unflagged.map((m) => m.base).join(', ')}` : 'every unpinned agent is flagged',
  });

  const mentioned = [...new Set((text.match(/plugins\/[\w.-]+\/agents\/[\w.-]+\.md/gi) || []).map((s) => s.toLowerCase()))];
  const invented = mentioned.filter((m) => !truth.some((t) => t.file.toLowerCase() === m));
  exp.push({
    text: 'Invents no agent file',
    passed: invented.length === 0,
    evidence: invented.length ? `not in the repo: ${invented.join(', ')}` : `${mentioned.length} distinct agent paths mentioned, all real`,
  });

  const status = gitStatus(fixture);
  exp.push({
    text: 'Changed nothing in the repo',
    passed: status.length === 0,
    evidence: status.length ? `git status: ${status.map((s) => `${s.code} ${s.file}`).join(', ')}` : 'git status --porcelain is empty',
  });
}

function gradeEdit(exp, spec, fixture) {
  const t = sh(spec.testCommand, fixture);
  exp.push({
    text: `Test command passes in the fixture (${spec.testCommand})`,
    passed: t.status === 0,
    evidence: `exit ${t.status}: ${tail(t.out)}`,
  });

  const status = gitStatus(fixture);
  const changed = status.map((s) => s.file).sort();
  const expected = [...spec.expectFiles].map(posix).sort();
  exp.push({
    text: `Changed exactly the expected files (${expected.length})`,
    passed: JSON.stringify(changed) === JSON.stringify(expected),
    evidence: `git status: ${status.length ? status.map((s) => `${s.code} ${s.file}`).join(', ') : '(clean)'}`,
  });

  for (const mc of spec.mustContain || []) {
    const p = path.join(fixture, mc.file);
    const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    const re = new RegExp(mc.pattern);
    exp.push({
      text: `${mc.file} contains /${mc.pattern}/`,
      passed: re.test(content),
      evidence: re.test(content) ? 'pattern found' : fs.existsSync(p) ? 'pattern absent' : 'file missing',
    });
  }

  for (const gc of spec.guardChecks || []) {
    const guard = path.join(fixture, 'plugins', 'fabflows', 'hooks', 'guard.js');
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: gc.command }, cwd: '.' });
    const r = spawnSync(process.execPath, [guard], { input: payload, encoding: 'utf8', cwd: fixture });
    let decision = 'allow';
    try {
      const out = r.stdout.trim() ? JSON.parse(r.stdout) : {};
      decision = (out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision) || out.decision || 'allow';
    } catch {
      decision = `unparseable: ${r.stdout.slice(0, 80)}`;
    }
    exp.push({
      text: `Guard ${gc.expect === 'deny' ? 'denies' : 'allows'} \`${gc.command}\``,
      passed: decision === gc.expect,
      evidence: `guard.js decision: ${decision}`,
    });
  }
}

function gradeNewTests(exp, spec, fixture) {
  const t = sh(spec.testCommand, fixture);
  exp.push({
    text: `Test command passes in the fixture (${spec.testCommand})`,
    passed: t.status === 0,
    evidence: `exit ${t.status}: ${tail(t.out)}`,
  });

  const status = gitStatus(fixture);
  const under = posix(spec.newFileUnder);
  const newTests = status.filter((s) => s.code === '??' && s.file.startsWith(under) && /\.test\.(js|mjs|cjs)$/.test(s.file));
  exp.push({
    text: `A new *.test.js file exists under ${under}`,
    passed: newTests.length >= 1,
    evidence: newTests.length ? `new: ${newTests.map((s) => s.file).join(', ')}` : `git status: ${status.map((s) => `${s.code} ${s.file}`).join(', ') || '(clean)'}`,
  });

  const outside = status.filter((s) => !s.file.startsWith(under));
  exp.push({
    text: `Changed nothing outside ${under}`,
    passed: outside.length === 0,
    evidence: outside.length ? `touched: ${outside.map((s) => `${s.code} ${s.file}`).join(', ')}` : 'only test files changed',
  });

  const content = newTests.map((s) => fs.readFileSync(path.join(fixture, s.file), 'utf8')).join('\n');
  const absent = (spec.mustMention || []).filter((needle) => !content.includes(needle));
  const testCount = (content.match(/\b(test|it)\s*\(/g) || []).length;
  exp.push({
    text: 'New test targets parseFrontmatter and covers the three cases',
    passed: newTests.length >= 1 && absent.length === 0 && testCount >= 3,
    evidence: newTests.length ? `${testCount} test() calls; ${absent.length ? `missing mentions: ${absent.join(', ')}` : 'all required mentions present'}` : 'no new test file',
  });
}

function grade({ task, fixture, metrics, timing, maxTurns }) {
  const exp = [];
  const r = metrics.result || {};
  exp.push({
    text: 'Run finished without error',
    passed: r.is_error === false,
    evidence: `is_error=${r.is_error} subtype=${r.subtype} stop=${r.stop_reason}/${r.terminal_reason} turns=${r.num_turns}`,
  });
  exp.push({
    text: 'No tool call was denied',
    passed: (r.permission_denials || []).length === 0 && (metrics.hooks.permissionDenied || 0) === 0,
    evidence: (r.permission_denials || []).length ? `denied: ${r.permission_denials.join(', ')}` : 'no permission denials',
  });
  exp.push({
    text: `Stayed under the turn cap (${maxTurns})`,
    passed: typeof r.num_turns === 'number' && r.num_turns < maxTurns,
    evidence: `num_turns=${r.num_turns}`,
  });

  const spec = task.grade;
  if (spec.kind === 'agent-inventory') gradeInventory(exp, fixture, r.result_text || '');
  else if (spec.kind === 'edit') gradeEdit(exp, spec, fixture);
  else if (spec.kind === 'new-tests') gradeNewTests(exp, spec, fixture);
  else throw new Error(`unknown grade kind ${spec.kind}`);

  const passed = exp.filter((e) => e.passed).length;
  const workerSpawns = Object.entries(metrics.workers || {}).map(([k, v]) => `${k} x${v.spawns} (${v.model})`);
  const leadOut = metrics.lead.output || 0;
  const totalOut = metrics.totals.output || 0;

  return {
    expectations: exp,
    summary: { passed, failed: exp.length - passed, total: exp.length, pass_rate: exp.length ? Number((passed / exp.length).toFixed(4)) : 0 },
    execution_metrics: {
      total_tool_calls:
        Object.values(metrics.lead.toolCalls || {}).reduce((a, b) => a + b, 0) +
        Object.values(metrics.workers || {}).reduce((a, w) => a + Object.values(w.toolCalls || {}).reduce((x, y) => x + y, 0), 0),
      errors_encountered: (r.permission_denials || []).length + (r.is_error ? 1 : 0),
      output_chars: (r.result_text || '').length,
    },
    // No `timing` block here on purpose: aggregate_benchmark.py falls back to the sibling
    // timing.json (duration and total tokens) only when grading.json carries no timing.
    observations: [
      `workers spawned: ${workerSpawns.length ? workerSpawns.join('; ') : 'none'}`,
      `lead output tokens ${leadOut} of ${totalOut} total output (${totalOut ? Math.round((100 * leadOut) / totalOut) : 0}%)`,
      `lead final context ${metrics.lead.finalContext} tokens over ${metrics.lead.messages} messages`,
      `verification re-runs of the test command by the lead after a spawn: ${metrics.lead.verificationRuns}`,
      `hook payloads by event:tool:agent: ${JSON.stringify(metrics.hooks.probe || {})}`,
    ],
  };
}

module.exports = { grade, agentTruth, gitStatus };
