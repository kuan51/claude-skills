'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { splitNotebooks } = require('../lib/split-notebooks.js');

const SCRIPT = path.join(__dirname, '..', 'lib', 'split-notebooks.js');

const NOTEBOOK = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { kernelspec: { name: 'python3', display_name: 'Python 3' }, widgets: { state: { w: 1 } } },
  cells: [
    { cell_type: 'markdown', id: 'm1', metadata: {}, source: ['Conclusion: lift is 7.31%'] },
    { cell_type: 'code', id: 'c1', execution_count: 3, metadata: { tags: ['t'] }, source: ['x = 1\n', 'x'], outputs: [{ output_type: 'execute_result', data: { 'text/plain': ['4242'] } }] },
    { cell_type: 'raw', id: 'r1', metadata: {}, source: ['raw text'] },
    { cell_type: 'code', id: 'c2', execution_count: null, metadata: {}, source: 'print(2)', outputs: [] },
  ],
};
const NB_TEXT = JSON.stringify(NOTEBOOK, null, 1) + '\n';

const made = [];
test.after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'split-nb-'));
  made.push(d);
  return d;
}

// A fresh layout: <base>/real (the "project"), <base>/sb/project (its copy).
function layout(files = {}) {
  const base = tmp();
  const real = path.join(base, 'real');
  const sb = path.join(base, 'sb');
  const proj = path.join(sb, 'project');
  fs.mkdirSync(real);
  fs.mkdirSync(proj, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
    fs.writeFileSync(path.join(proj, rel), text);
  }
  return { base, real, sb, proj };
}

// Every file under dir (links read as their target string), so "unchanged" covers links too.
function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isSymbolicLink()) out[abs] = `link:${fs.readlinkSync(abs)}`;
      else if (e.isDirectory()) walk(abs);
      else out[abs] = fs.readFileSync(abs, 'utf8');
    }
  })(dir);
  return out;
}

const cli = (real, sb) => spawnSync(process.execPath, [SCRIPT, real, sb], { encoding: 'utf8' });

test('the code-only copy keeps only code cells, with empty outputs and their other fields unchanged', () => {
  const { real, sb, proj } = layout({ 'a.ipynb': NB_TEXT });
  splitNotebooks(real, sb);
  const nb = JSON.parse(fs.readFileSync(path.join(proj, 'a.ipynb'), 'utf8'));
  assert.deepEqual(nb.cells.map((c) => c.cell_type), ['code', 'code']);
  for (const [i, orig] of [NOTEBOOK.cells[1], NOTEBOOK.cells[3]].entries()) {
    const c = nb.cells[i];
    assert.deepEqual(c.outputs, []);
    for (const k of ['source', 'execution_count', 'metadata', 'id']) assert.deepEqual(c[k], orig[k], k);
  }
  assert.equal(nb.metadata.widgets, undefined);
  assert.deepEqual(nb.metadata.kernelspec, NOTEBOOK.metadata.kernelspec);
  assert.equal(nb.nbformat, 4);
  assert.ok(!fs.readFileSync(path.join(proj, 'a.ipynb'), 'utf8').includes('7.31'));
  assert.ok(!fs.readFileSync(path.join(proj, 'a.ipynb'), 'utf8').includes('4242'));
});

test('each conclusions/ copy is byte-identical; nested, checkpoint and .IPYNB notebooks are split; others untouched', () => {
  const odd = NB_TEXT.replace('\n', '\r\n');
  const { real, sb, proj } = layout({
    'a.ipynb': NB_TEXT,
    'nb/deep/b.ipynb': odd,
    'nb/.ipynb_checkpoints/b-checkpoint.ipynb': NB_TEXT,
    'C.IPYNB': NB_TEXT,
    'notes.txt': NB_TEXT,
    '.git/x.ipynb': NB_TEXT,
  });
  const result = splitNotebooks(real, sb);
  const rels = ['C.IPYNB', 'a.ipynb', 'nb/.ipynb_checkpoints/b-checkpoint.ipynb', 'nb/deep/b.ipynb'];
  assert.deepEqual(result.map((r) => r.code), rels.map((r) => `${sb}/project/${r}`));
  for (const rel of rels) {
    const full = fs.readFileSync(path.join(sb, 'conclusions', rel), 'utf8');
    assert.equal(full, rel === 'nb/deep/b.ipynb' ? odd : NB_TEXT, rel);
    assert.notEqual(fs.readFileSync(path.join(proj, rel), 'utf8'), full, `${rel} split`);
  }
  assert.equal(fs.readFileSync(path.join(proj, 'notes.txt'), 'utf8'), NB_TEXT);
  assert.equal(fs.readFileSync(path.join(proj, '.git/x.ipynb'), 'utf8'), NB_TEXT);
  assert.ok(!fs.existsSync(path.join(sb, 'conclusions', '.git')));
});

test('the returned array and the CLI stdout are the same sorted {code, full} list in the pinned format', () => {
  const files = { 'z.ipynb': NB_TEXT, 'b/a.ipynb': NB_TEXT };
  const one = layout(files);
  const returned = splitNotebooks(one.real, one.sb + '/');
  assert.deepEqual(returned, [
    { code: `${one.sb}/project/b/a.ipynb`, full: `${one.sb}/conclusions/b/a.ipynb` },
    { code: `${one.sb}/project/z.ipynb`, full: `${one.sb}/conclusions/z.ipynb` },
  ]);
  const two = layout(files);
  const printed = JSON.parse(execFileSync(process.execPath, [SCRIPT, two.real, two.sb + '/'], { encoding: 'utf8' }));
  assert.deepEqual(printed, returned.map((r) => ({ code: r.code.replace(one.sb, two.sb), full: r.full.replace(one.sb, two.sb) })));
});

function assertRefuses(real, sb, re) {
  const before = snapshot(path.dirname(sb));
  assert.throws(() => splitNotebooks(real, sb), (err) => re.test(err.message) && /Nothing was written/.test(err.message));
  assert.deepEqual(snapshot(path.dirname(sb)), before, 'nothing changed after the throw');
  const r = cli(real, sb);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, re);
  assert.deepEqual(snapshot(path.dirname(sb)), before, 'nothing changed after the CLI');
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('refuses equal or nested roots', () => {
  const { base, sb, proj } = layout({ 'a.ipynb': NB_TEXT });
  assertRefuses(sb, sb, new RegExp(esc(sb)));
  assertRefuses(base, sb, new RegExp(esc(sb)));
  assertRefuses(proj, sb, new RegExp(esc(sb)));
  fs.symlinkSync(sb, path.join(base, 'alias'));
  assertRefuses(path.join(base, 'alias'), sb, new RegExp(esc(sb)));
});

test('refuses a missing project/, an existing conclusions/ and a dangling conclusions link', () => {
  const missing = layout();
  fs.rmSync(missing.proj, { recursive: true });
  assertRefuses(missing.real, missing.sb, new RegExp(esc(missing.proj)));
  const existing = layout({ 'a.ipynb': NB_TEXT });
  fs.mkdirSync(path.join(existing.sb, 'conclusions'));
  assertRefuses(existing.real, existing.sb, new RegExp(esc(path.join(existing.sb, 'conclusions'))));
  const dangling = layout({ 'a.ipynb': NB_TEXT });
  fs.symlinkSync(path.join(dangling.base, 'nowhere'), path.join(dangling.sb, 'conclusions'));
  assertRefuses(dangling.real, dangling.sb, new RegExp(esc(path.join(dangling.sb, 'conclusions'))));
});

test('refuses an invalid notebook even when a valid one comes first in the walk', () => {
  const cases = {
    'invalid JSON': '{ not json',
    'no cells': JSON.stringify({ nbformat: 4, metadata: {} }),
    'nbformat 3': JSON.stringify({ ...NOTEBOOK, nbformat: 3 }),
    'missing nbformat': JSON.stringify({ metadata: {}, cells: [] }),
  };
  for (const text of Object.values(cases)) {
    const { real, sb, proj } = layout({ 'a.ipynb': NB_TEXT, 'z/bad.ipynb': text });
    assertRefuses(real, sb, new RegExp(esc(path.join(proj, 'z', 'bad.ipynb'))));
  }
});

test('refuses a notebook link to a non-regular file, and a linked folder outside the copy holding a notebook', () => {
  const toDir = layout({ 'a.ipynb': NB_TEXT });
  fs.mkdirSync(path.join(toDir.base, 'adir'));
  fs.symlinkSync(path.join(toDir.base, 'adir'), path.join(toDir.proj, 'link.ipynb'));
  assertRefuses(toDir.real, toDir.sb, new RegExp(esc(path.join(toDir.proj, 'link.ipynb'))));
  const dangling = layout({ 'a.ipynb': NB_TEXT });
  fs.symlinkSync(path.join(dangling.base, 'gone.ipynb'), path.join(dangling.proj, 'link.ipynb'));
  assertRefuses(dangling.real, dangling.sb, new RegExp(esc(path.join(dangling.proj, 'link.ipynb'))));
  const outside = layout({ 'a.ipynb': NB_TEXT });
  fs.mkdirSync(path.join(outside.base, 'ext', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(outside.base, 'ext', 'deep', 'n.ipynb'), NB_TEXT);
  fs.symlinkSync(path.join(outside.base, 'ext'), path.join(outside.proj, 'vendored'));
  assertRefuses(outside.real, outside.sb, new RegExp(esc(path.join(outside.proj, 'vendored'))));
  assert.equal(fs.readFileSync(path.join(outside.base, 'ext', 'deep', 'n.ipynb'), 'utf8'), NB_TEXT);
});

test('a notebook link to a file outside the sandbox leaves the target untouched and becomes a regular file', () => {
  const { base, real, sb, proj } = layout();
  const target = path.join(base, 'outside.ipynb');
  fs.writeFileSync(target, NB_TEXT);
  fs.symlinkSync(target, path.join(proj, 'linked.ipynb'));
  splitNotebooks(real, sb);
  assert.equal(fs.readFileSync(target, 'utf8'), NB_TEXT);
  assert.ok(fs.lstatSync(path.join(proj, 'linked.ipynb')).isFile());
  assert.equal(fs.readFileSync(path.join(sb, 'conclusions', 'linked.ipynb'), 'utf8'), NB_TEXT);
});

test('a linked folder inside the copy is not entered and does not refuse', () => {
  const { real, sb, proj } = layout({ 'nb/a.ipynb': NB_TEXT });
  fs.symlinkSync(path.join(proj, 'nb'), path.join(proj, 'alias'));
  const result = splitNotebooks(real, sb);
  assert.deepEqual(result.map((r) => r.code), [`${sb}/project/nb/a.ipynb`]);
  assert.ok(fs.lstatSync(path.join(proj, 'alias')).isSymbolicLink());
});

test('two hard-linked notebooks each get a full copy byte-identical to the original', () => {
  const { real, sb, proj } = layout({ 'a.ipynb': NB_TEXT });
  fs.linkSync(path.join(proj, 'a.ipynb'), path.join(proj, 'b.ipynb'));
  splitNotebooks(real, sb);
  for (const n of ['a.ipynb', 'b.ipynb']) {
    assert.equal(fs.readFileSync(path.join(sb, 'conclusions', n), 'utf8'), NB_TEXT, n);
    assert.equal(JSON.parse(fs.readFileSync(path.join(proj, n), 'utf8')).cells.length, 2, n);
  }
});

test('refuses a linked folder outside the copy whose only notebook is itself a link', () => {
  const { base, real, sb, proj } = layout({ 'a.ipynb': NB_TEXT });
  fs.mkdirSync(path.join(base, 'ext', 'inner'), { recursive: true });
  fs.writeFileSync(path.join(base, 'target.ipynb'), NB_TEXT);
  fs.symlinkSync(path.join(base, 'target.ipynb'), path.join(base, 'ext', 'inner', 'n.ipynb'));
  fs.symlinkSync(path.join(base, 'ext'), path.join(proj, 'data'));
  const before = snapshot(sb);
  assert.throws(() => splitNotebooks(real, sb), (e) => e.message.includes(path.join(proj, 'data')) && /Nothing was written/.test(e.message));
  assert.deepEqual(snapshot(sb), before);
});

test('a link in the copy that resolves into conclusions/ once the split has written it stops the run', () => {
  for (const target of ['../conclusions', '../conclusions/a.ipynb']) {
    const { real, sb, proj } = layout({ 'a.ipynb': NB_TEXT });
    fs.symlinkSync(target, path.join(proj, 'peek'));
    assert.throws(
      () => splitNotebooks(real, sb),
      (e) => e.message.includes(path.join(proj, 'peek')) && /delete the sandbox/.test(e.message) && !/Nothing was written/.test(e.message),
      target
    );
    const again = layout({ 'a.ipynb': NB_TEXT });
    fs.symlinkSync(target, path.join(again.proj, 'peek'));
    assert.equal(cli(again.real, again.sb).status, 1, target);
  }
});

test('a sandbox root given with a trailing slash yields code paths that match sandbox-paths.js output', () => {
  const { rewritePath } = require('../lib/sandbox-paths.js');
  const { real, sb } = layout({ 'nb/a.ipynb': NB_TEXT });
  const [entry] = splitNotebooks(real, `${sb}/`);
  assert.equal(entry.code, rewritePath(path.join(real, 'nb', 'a.ipynb'), real, `${sb}//project`));
});

