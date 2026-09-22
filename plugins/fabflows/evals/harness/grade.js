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
function windowsFor(text, needle, withLeadIn = false) {
  const lines = text.split(/\r?\n/);
  const out = [];
  lines.forEach((l, i) => {
    if (!l.toLowerCase().includes(needle.toLowerCase())) return;
    let start = i;
    if (withLeadIn) {
      for (let k = i - 1; k >= 0 && k >= i - 25; k--) {
        const t = lines[k].trim();
        if (/^#{1,6}\s/.test(t) || /^\*\*.+\*\*:?$/.test(t) || /:$/.test(t)) {
          start = k;
          break;
        }
      }
    }
    out.push(lines.slice(start, i + 3).join('\n'));
  });
  return out;
}

// A needle can be mentioned in a preamble before its table row, so a check passes if any
// mention's window satisfies it, not only the first.
const anyWindow = (text, needle, pred, withLeadIn = false) => windowsFor(text, needle, withLeadIn).some(pred);

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
  const wrongModel = pinned.filter((t) => !anyWindow(text, `agents/${t.base}`, (w) => new RegExp(`\\b${t.model}\\b`, 'i').test(w)));
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
  const unflagged = unpinned.filter((t) => !anyWindow(text, `agents/${t.base}`, (w) => flagRe.test(w), true));
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

// Ground truth for a triage task is whatever the suite reports as failing right now, read from
// the TAP reporter so the grader does not depend on the lead's own output. Each failure carries
// its test name and, from the YAML block, its file.
function failingTests(fixture, testCommand) {
  const cmd = testCommand.replace(/^node --test\b/, 'node --test --test-reporter=tap');
  const r = sh(cmd, fixture);
  const out = [];
  let current = null;
  for (const line of r.out.split(/\r?\n/)) {
    const m = line.match(/^\s*not ok \d+ - (.+?)\s*(?:#.*)?$/);
    if (m) {
      current = { name: m[1].trim(), file: null };
      out.push(current);
      continue;
    }
    // TAP quotes the location as a JS string, so Windows paths arrive with doubled backslashes.
    const loc = current && line.match(/location:\s*'?([^'\s]+?):(\d+):\d+'?/);
    if (loc && !current.file) {
      const raw = posix(loc[1].replace(/\\\\/g, '\\'));
      current.file = raw.toLowerCase().startsWith(posix(fixture).toLowerCase() + '/') ? raw.slice(posix(fixture).length + 1) : raw;
    }
  }
  // Nested subtests repeat the parent as its own `not ok`; keep the leaf names, which have a file.
  return out.filter((t) => t.file);
}

function gradeTriage(exp, spec, fixture, resultText) {
  const truth = failingTests(fixture, spec.testCommand);
  const text = posix(resultText);
  const lower = text.toLowerCase();
  exp.push({
    text: `Names every failing test (${truth.length})`,
    passed: truth.length > 0 && truth.every((t) => lower.includes(t.name.toLowerCase())),
    evidence: truth.length ? `missing: ${truth.filter((t) => !lower.includes(t.name.toLowerCase())).map((t) => t.name).join('; ') || 'none'}` : 'no failing test found in the fixture (setup missing?)',
  });
  const files = [...new Set(truth.map((t) => t.file))];
  exp.push({
    text: `Names every file with a failing test (${files.length})`,
    passed: files.length > 0 && files.every((f) => lower.includes(f.toLowerCase()) || lower.includes(path.basename(f).toLowerCase())),
    evidence: `missing: ${files.filter((f) => !lower.includes(f.toLowerCase()) && !lower.includes(path.basename(f).toLowerCase())).join(', ') || 'none'}`,
  });
  const mentioned = [...new Set((text.match(/[\w./-]+\.test\.js/gi) || []).map((s) => s.toLowerCase()))];
  const allTests = new Set();
  for (const dir of ['test', ...fs.readdirSync(path.join(fixture, 'plugins')).map((p) => `plugins/${p}/test`)]) {
    if (fs.existsSync(path.join(fixture, dir))) for (const f of fs.readdirSync(path.join(fixture, dir))) if (f.endsWith('.test.js')) allTests.add(`${dir}/${f}`.toLowerCase());
  }
  const invented = mentioned.filter((m) => ![...allTests].some((t) => t.endsWith(m.replace(/^\.\//, '')) || m.endsWith(path.basename(t))));
  exp.push({ text: 'Invents no test file', passed: invented.length === 0, evidence: invented.length ? `not in the repo: ${invented.join(', ')}` : `${mentioned.length} test files mentioned, all real` });
  const passingNamed = files.length ? [...allTests].filter((t) => !files.map((f) => f.toLowerCase()).includes(t) && lower.includes(path.basename(t).toLowerCase()) && new RegExp(`${path.basename(t).replace(/\./g, '\\.')}[^\\n]{0,80}(fail|✖|not ok)`, 'i').test(text)) : [];
  exp.push({ text: 'Reports no passing file as failing', passed: passingNamed.length === 0, evidence: passingNamed.length ? `claimed failing: ${passingNamed.join(', ')}` : 'no false failures' });
  const status = gitStatus(fixture);
  exp.push({ text: 'Changed nothing in the repo', passed: status.length === 0, evidence: status.length ? `git status: ${status.map((s) => `${s.code} ${s.file}`).join(', ')}` : 'git status --porcelain is empty' });
}

// Ground truth for the decision digest is each record's frontmatter plus the option number in
// its "Decision outcome" section. A record without that phrase is skipped for the option check.
function decisionTruth(fixture) {
  const dir = path.join(fixture, 'docs', 'decisions');
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^DEC-\d+.*\.md$/.test(x)).sort()) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const get = (k) => (text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1];
    const chose = text.match(/Chose \*\*option (\d+)\*\*/i);
    rows.push({ id: (get('id') || '').trim(), title: (get('title') || '').trim().replace(/^["']|["']$/g, ''), status: (get('status') || '').trim(), option: chose ? chose[1] : null });
  }
  return rows;
}

function gradeDigest(exp, fixture, resultText) {
  const truth = decisionTruth(fixture);
  const text = resultText;
  const missingIds = truth.filter((t) => !text.includes(t.id));
  exp.push({ text: `Lists every record (${truth.length})`, passed: missingIds.length === 0, evidence: missingIds.length ? `missing: ${missingIds.map((t) => t.id).join(', ')}` : 'all ids present' });
  const badTitle = truth.filter((t) => {
    const head = t.title.split(/\s+/).slice(0, 4).join(' ').toLowerCase();
    return !anyWindow(text, t.id, (w) => w.toLowerCase().includes(head));
  });
  exp.push({ text: 'Gives each record its own title', passed: badTitle.length === 0, evidence: badTitle.length ? `title absent or wrong for: ${badTitle.map((t) => t.id).join(', ')}` : 'first four words of every title match' });
  const badStatus = truth.filter((t) => !anyWindow(text, t.id, (w) => w.toLowerCase().includes(t.status.toLowerCase())));
  exp.push({ text: 'Gives each record its frontmatter status', passed: badStatus.length === 0, evidence: badStatus.length ? `status absent or wrong for: ${badStatus.map((t) => t.id).join(', ')}` : 'every status matches' });
  const withOpt = truth.filter((t) => t.option);
  const badOpt = withOpt.filter((t) => !anyWindow(text, t.id, (w) => new RegExp(`\\b(option\\s*)?${t.option}\\b`).test(w.split(t.id).join(''))));
  exp.push({ text: `Gives the chosen option number for every record that states one (${withOpt.length})`, passed: badOpt.length === 0, evidence: badOpt.length ? `option absent or wrong for: ${badOpt.map((t) => `${t.id} (option ${t.option})`).join(', ')}` : 'every chosen option matches' });
  const thin = truth.filter((t) => !anyWindow(text, t.id, (w) => w.split(/\s+/).length >= 20));
  exp.push({ text: 'Says something about each record beyond its metadata (20+ words in its row)', passed: thin.length === 0, evidence: thin.length ? `thin rows: ${thin.map((t) => t.id).join(', ')}` : 'every row carries a summary' });
  const invented = [...new Set(text.match(/DEC-\d{4}/g) || [])].filter((id) => !truth.some((t) => t.id === id));
  exp.push({ text: 'Invents no record id', passed: invented.length === 0, evidence: invented.length ? `not in the repo: ${invented.join(', ')}` : `${(text.match(/DEC-\d{4}/g) || []).length} id mentions, all real` });
  const status = gitStatus(fixture);
  exp.push({ text: 'Changed nothing in the repo', passed: status.length === 0, evidence: status.length ? `git status: ${status.map((s) => `${s.code} ${s.file}`).join(', ')}` : 'git status --porcelain is empty' });
}

// A build task is graded by a hidden acceptance suite that lives outside the fixture, so the lead
// can neither read it nor tune its own tests to it. The suite loads the project through an env
// var (spec.rootEnv) and runs from its own directory with the test files named explicitly, which
// makes node print one column-0 `ok`/`not ok` per test. A project that fails to load instead
// yields one file-level `not ok <file>` per test file; those are set aside so a broken project
// reads as "could not run" rather than as N named failures.
function gradeHiddenTests(exp, spec, fixture, metrics, workflowDir) {
  const after = []; // expectations that need the hidden results, pushed once they exist
  // Status is read before anything runs in the fixture, so a test that writes a scratch file
  // cannot dirty the tree the lead left.
  const status = gitStatus(fixture);
  // `node --test` with a glob that matches nothing exits 0, so a project with no tests at all
  // would pass; the spec asks for tests, so at least one test file has to exist.
  const testDir = path.join(fixture, 'test');
  const ownTests = fs.existsSync(testDir) && fs.readdirSync(testDir, { recursive: true }).some((f) => /\.test\.(js|mjs|cjs)$/.test(String(f)));
  const t = sh(spec.testCommand, fixture);
  exp.push({
    text: `Public test command passes in the fixture (${spec.testCommand})`,
    passed: t.status === 0 && ownTests,
    evidence: `exit ${t.status}${ownTests ? '' : '; no *.test.js under test/'}: ${tail(t.out)}`,
  });

  exp.push({
    text: 'Working tree is clean (work committed)',
    passed: status.length === 0,
    evidence: status.length ? `git status: ${status.map((s) => `${s.code} ${s.file}`).join(', ')}` : 'git status --porcelain is empty',
  });

  // Newest first, so the lead's commits are the ones before the first `bench:` subject.
  const log = spawnSync('git', ['log', '--format=%s'], { cwd: fixture, encoding: 'utf8' });
  const subjects = log.status === 0 ? log.stdout.split(/\r?\n/).filter(Boolean) : [];
  const own = subjects.findIndex((s) => s.startsWith('bench:'));
  const commits = own === -1 ? subjects.length : own;
  exp.push({
    text: 'At least one commit was made on the branch',
    passed: commits >= 1,
    evidence: commits ? `${commits} commit(s): ${subjects.slice(0, commits).join(' | ')}` : `no commit after the bench: setup (${subjects.length} in log)`,
  });

  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  } catch {
    pkg = null;
  }
  const deps = pkg ? [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})] : [];
  const nodeModules = fs.existsSync(path.join(fixture, 'node_modules'));
  exp.push({
    text: 'No dependency was added',
    passed: pkg !== null && deps.length === 0 && !nodeModules,
    evidence: pkg === null ? 'package.json missing or unparseable' : deps.length || nodeModules ? `dependencies: ${deps.join(', ') || 'none'}; node_modules ${nodeModules ? 'present' : 'absent'}` : 'no dependencies, no node_modules',
  });

  const workflows = metrics.workflows || [];
  exp.push({
    text: 'Every launched workflow finished before the session ended',
    passed: workflows.every((w) => w.completed),
    evidence: workflows.length ? workflows.map((w) => `${w.name}: ${w.completed ? 'completed' : 'unfinished'}`).join('; ') : 'no workflow launched',
  });

  if (spec.requireReview) {
    const types = workflows.flatMap((w) => (w.agents || []).map((a) => a.agentType));
    exp.push({
      text: 'A review round ran inside a workflow',
      passed: types.includes('fabflows:refuter'),
      evidence: types.length ? `workflow agents: ${types.join(', ')}` : 'no workflow agent',
    });
    // Verdicts come from the copied journals' result rows; REWORK on any round counts.
    const verdicts = [];
    const mustFix = [];
    const dirs = workflowDir && fs.existsSync(workflowDir) ? fs.readdirSync(workflowDir) : [];
    for (const d of dirs) {
      const journal = path.join(workflowDir, d, 'journal.jsonl');
      if (!fs.existsSync(journal)) continue;
      for (const line of fs.readFileSync(journal, 'utf8').split(/\r?\n/)) {
        try {
          const row = JSON.parse(line);
          if (row.type === 'result' && row.result && row.result.verdict) {
            verdicts.push(row.result.verdict);
            for (const f of row.result.mustFix || []) mustFix.push(`${f.location || ''} ${f.problem || ''}`);
          }
        } catch {
          // A blank or truncated line carries no verdict.
        }
      }
    }
    exp.push({
      text: 'The review returned REWORK on any round',
      informational: true,
      passed: verdicts.includes('REWORK'),
      evidence: verdicts.length ? `verdicts: ${verdicts.join(', ')}` : 'no review verdict in any journal',
    });
    // The two halves of the question: did the build ship the planted defect, and did the review
    // name it. A review that names it proves both; a final hidden failure on the defect's test
    // proves the first and disproves the second. Both are pushed after the hidden run below.
    if (spec.defectPattern) {
      const re = new RegExp(spec.defectPattern, 'i');
      const named = mustFix.filter((m) => re.test(m));
      after.push((tests) => {
        const defectTests = tests.filter((h) => re.test(h.name));
        const shipped = named.length > 0 || defectTests.some((h) => !h.passed);
        exp.push({
          text: 'The build round shipped the planted defect',
          informational: true,
          passed: shipped,
          evidence: named.length ? `review named it: ${named[0].slice(0, 120)}` : defectTests.length ? `defect tests after the run: ${defectTests.map((h) => `${h.passed ? 'ok' : 'not ok'} ${h.name}`).join('; ').slice(0, 160)}` : 'no defect test matched',
        });
        exp.push({
          text: 'The review named the planted defect',
          informational: true,
          passed: named.length > 0,
          evidence: named.length ? named[0].slice(0, 160) : mustFix.length ? `must-fix items: ${mustFix.length}, none matched` : 'no must-fix items',
        });
      });
    }
  }

  const hiddenDir = path.resolve(__dirname, '..', spec.hidden);
  const files = fs.readdirSync(hiddenDir).filter((f) => f.endsWith('.test.js')).sort();
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: hiddenDir,
    // The suite runs from its own directory, so a relative fixture path would resolve there.
    env: { ...process.env, [spec.rootEnv]: path.resolve(fixture) },
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}`;
  const lines = out.split(/\r?\n/);
  const tests = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(not )?ok \d+ - (.+?)(?: # .*)?$/);
    if (!m || files.includes(m[2])) return;
    // The YAML block runs to the next column-0 line. Node writes the assertion as a `|-` block
    // scalar whose first line is the generic header and whose later lines hold the expected and
    // actual values, so the whole scalar is kept, up to the next key.
    let evidence = '';
    for (let k = i + 1; k < lines.length && /^\s/.test(lines[k]); k++) {
      const e = lines[k].match(/^(\s+)(message|error):\s*(.*)$/);
      if (!e) continue;
      let value = e[3];
      if (/^[|>]-?$/.test(value) || !value) {
        const block = [];
        for (let j = k + 1; j < lines.length && (lines[j].trim() === '' || lines[j].startsWith(`${e[1]} `)); j++) {
          if (lines[j].trim()) block.push(lines[j].trim());
        }
        value = block.join(' | ');
      }
      evidence = `${e[2]}: ${value}`.slice(0, 200);
      break;
    }
    tests.push({ name: m[2], passed: !m[1], evidence });
  });
  if (!tests.length) {
    exp.push({
      text: 'Hidden acceptance suite could not run',
      passed: false,
      evidence: lines.find((l) => /\bError\b/.test(l)) || tail(out) || 'no output',
    });
  }
  for (const h of tests) exp.push({ text: `hidden: ${h.name}`, passed: h.passed, evidence: h.passed ? 'ok' : h.evidence || 'not ok' });
  for (const fn of after) fn(tests);
  const passed = tests.filter((h) => h.passed).length;
  // A test file that crashes at load, or a hung one killed by the timeout, prints no per-test
  // lines and so vanishes from the count; the runner's exit status still says it failed.
  exp.push({
    text: `Hidden acceptance suite: ${passed}/${tests.length} tests pass`,
    passed: tests.length > 0 && passed === tests.length && r.status === 0,
    evidence: `exit ${r.status}${r.error ? ` (${r.error.code})` : ''}; ${files.length} test files`,
  });
}

function grade({ task, fixture, metrics, timing, maxTurns, workflowDir }) {
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
  else if (spec.kind === 'test-triage') gradeTriage(exp, spec, fixture, r.result_text || '');
  else if (spec.kind === 'decision-digest') gradeDigest(exp, fixture, r.result_text || '');
  else if (spec.kind === 'hidden-tests') gradeHiddenTests(exp, spec, fixture, metrics, workflowDir);
  else throw new Error(`unknown grade kind ${spec.kind}`);

  // Informational expectations are reported but never scored.
  const scored = exp.filter((e) => !e.informational);
  const passed = scored.filter((e) => e.passed).length;
  const workerSpawns = Object.entries(metrics.workers || {}).map(([k, v]) => `${k} x${v.spawns} (${v.model})`);
  const leadOut = metrics.lead.output || 0;
  const totalOut = metrics.totals.output || 0;
  const workflows = metrics.workflows || [];
  const agents = workflows.flatMap((w) => w.agents || []).map((a) => `${a.label}/${a.model}:${a.output == null ? '?' : a.output}`);

  return {
    expectations: exp,
    summary: { passed, failed: scored.length - passed, total: scored.length, pass_rate: scored.length ? Number((passed / scored.length).toFixed(4)) : 0 },
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
      `workflows launched: ${workflows.length}; agents: ${agents.length ? agents.join(' ') : 'none'}`,
    ],
  };
}

module.exports = { grade, agentTruth, gitStatus };
