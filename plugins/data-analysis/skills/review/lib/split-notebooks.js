'use strict';

// Splits every .ipynb in <sandbox-root>/project: the untouched bytes go to
// <sandbox-root>/conclusions/<same relative path>, and the notebook itself is replaced by a
// code-only copy (code cells with empty outputs), so blind roles never read a conclusion.
// Every notebook is read and parsed before any file is written, so a refusal writes nothing.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalize } = require('./sandbox-paths.js');

const isNotebook = (name) => name.toLowerCase().endsWith('.ipynb');

function refuse(reason, p) {
  throw new Error(`split-notebooks: ${reason}: ${p}. Nothing was written.`);
}

function realpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return refuse('cannot resolve path', p);
  }
}

function inside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

// Read-only scan of a folder reached through a link: follows no links, skips unreadable folders.
// Any entry named *.ipynb counts, a link included, since reading it reaches a notebook.
function holdsNotebook(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((e) => (e.isDirectory() ? holdsNotebook(path.join(dir, e.name)) : isNotebook(e.name)));
}

function parseNotebook(file) {
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    refuse('cannot read notebook', file);
  }
  let nb;
  try {
    nb = JSON.parse(bytes.toString('utf8'));
  } catch {
    refuse('notebook is not valid JSON', file);
  }
  if (!nb || typeof nb !== 'object' || !Array.isArray(nb.cells)) refuse('notebook has no cells array', file);
  if (!Number.isInteger(nb.nbformat) || nb.nbformat < 4) refuse('notebook nbformat is not an integer of 4 or more', file);
  const out = { ...nb, cells: nb.cells.filter((c) => c && c.cell_type === 'code').map((c) => ({ ...c, outputs: [] })) };
  if (nb.metadata && typeof nb.metadata === 'object') {
    const { widgets, ...metadata } = nb.metadata;
    out.metadata = metadata;
  }
  return { bytes, code: JSON.stringify(out, null, 1) + '\n' };
}

function collect(projectDir, realProject, dir, rel, found, links) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    refuse('cannot read folder', dir);
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (e.name === '.git') continue;
    const abs = path.join(dir, e.name);
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      collect(projectDir, realProject, abs, relPath, found, links);
    } else if (e.isSymbolicLink()) {
      links.push(abs);
      let target = null;
      try {
        target = fs.statSync(abs);
      } catch {
        // dangling link
      }
      if (isNotebook(e.name)) {
        if (!target || !target.isFile()) refuse('notebook link does not point at a regular file', abs);
        found.push({ abs, rel: relPath, ...parseNotebook(abs) });
      } else if (target && target.isDirectory()) {
        const real = realpath(abs);
        // A link into the copy is skipped: its target is walked anyway.
        if (!inside(real, realProject) && holdsNotebook(real)) refuse('linked folder outside the project copy holds a notebook', abs);
      }
    } else if (e.isFile() && isNotebook(e.name)) {
      found.push({ abs, rel: relPath, ...parseNotebook(abs) });
    }
  }
}

function splitNotebooks(projectRoot, sandboxRoot) {
  const realProjectRoot = realpath(projectRoot);
  const realSandbox = realpath(sandboxRoot);
  // Compared ignoring case: on a case-insensitive file system two spellings name one folder,
  // and ignoring case only ever refuses more.
  const [p, s] = [realProjectRoot.toLowerCase(), realSandbox.toLowerCase()];
  if (inside(p, s) || inside(s, p)) {
    refuse(`project root and sandbox root overlap (${projectRoot})`, sandboxRoot);
  }
  const projectDir = path.join(sandboxRoot, 'project');
  let st = null;
  try {
    st = fs.lstatSync(projectDir);
  } catch {
    // missing
  }
  if (!st || !st.isDirectory()) refuse('not a folder', projectDir);
  const conclusionsDir = path.join(sandboxRoot, 'conclusions');
  let exists = true;
  try {
    fs.lstatSync(conclusionsDir);
  } catch {
    exists = false;
  }
  if (exists) refuse('already exists', conclusionsDir);

  const found = [];
  const links = [];
  collect(projectDir, realpath(projectDir), projectDir, '', found, links);

  for (const nb of found) {
    const full = path.join(conclusionsDir, ...nb.rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, nb.bytes, { flag: 'wx' });
    const tmp = path.join(path.dirname(nb.abs), `.split-${crypto.randomBytes(6).toString('hex')}.tmp`);
    fs.writeFileSync(tmp, nb.code, { flag: 'wx' });
    fs.renameSync(tmp, nb.abs);
  }

  // A link can point at conclusions/ before it exists (`peek -> ../conclusions`), so it is
  // resolved again once the untouched notebooks are on disk.
  if (found.length) {
    const realConclusions = realpath(conclusionsDir);
    for (const link of links) {
      let real;
      try {
        real = fs.realpathSync(link);
      } catch {
        continue;
      }
      if (inside(real, realConclusions)) {
        throw new Error(`split-notebooks: link resolves into the conclusions folder: ${link}. Files were written, so delete the sandbox.`);
      }
    }
  }

  const root = normalize(sandboxRoot);
  return found
    .map((nb) => ({ code: `${root}/project/${nb.rel}`, full: `${root}/conclusions/${nb.rel}` }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

module.exports = { splitNotebooks };

if (require.main === module) {
  const [projectRoot, sandboxRoot] = process.argv.slice(2);
  if (!projectRoot || !sandboxRoot) {
    console.error('Usage: node split-notebooks.js <project-root> <sandbox-root>');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(splitNotebooks(projectRoot, sandboxRoot), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
