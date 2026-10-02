#!/usr/bin/env node
'use strict';

/**
 * Finds and validates ciso frameworks. A framework is one folder `<certKey>/` holding
 * framework.json, ground-rules.md and one <tier>.<controlSetVersion>.structure.json per tier.
 * See ADDING-A-CERTIFICATION.md for the format.
 *
 * Two roots, two trust levels:
 *   bundled  plugins/ciso/frameworks/          plugin code; may carry flows/
 *   project  <docs/ciso-dir>/frameworks/       data only; flows/ is an error
 *
 * Usage:
 *   node frameworks.js list <docs/ciso-dir>       frameworks as JSON on stdout, errors on stderr;
 *                                                 exit 1 only when a bundled framework is invalid
 *                                                 or none is found
 *   node frameworks.js validate <dir> [--bundled] errors on stderr and exit 1, or "ok"
 *
 * Stdlib only -- no npm dependencies.
 */

const fs = require('fs');
const path = require('path');
const { STATE_ONLY_FIELDS } = require('../hitrust/lib/versioning/reconcile-state-version.js');

const BUNDLED_ROOT = path.join(__dirname, '..', '..', 'frameworks');
// No leading, trailing or doubled hyphen: render-dashboard.js's certPageSlug trims edge hyphens, so
// `hitrust-` would otherwise share cert-hitrust.html with `hitrust`.
const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION_RE = /^v[A-Za-z0-9.-]+$/;
const SOURCE_AUTHORITIES = ['public-topic-level', 'publisher-verbatim', 'imported', 'paraphrased'];
const CONTROL_STRINGS = ['domain', 'domainKey', 'topicLabel', 'topicSummary'];
const STRUCTURE_SUFFIX = '.structure.json';
// id and domainKey reach shell commands in the generic flows, so only characters that are inert
// there. Every bundled id and domainKey fits.
const SAFE_TOKEN_RE = /^[A-Za-z0-9._-]+$/;
// displayName is passed inside double quotes; none of these may appear in it.
const UNSAFE_IN_DOUBLE_QUOTES_RE = /["$`\\\u0000-\u001f\u007f]/;

// Keys become property names of plain objects downstream (state.json maps, dashboard grouping), so
// any name Object.prototype already carries (constructor, toString, __proto__, ...) would collide.
function isReservedKey(k) {
  return k === 'prototype' || Object.prototype.hasOwnProperty.call(Object.prototype, k);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function readJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${path.basename(file)}: not readable JSON (${err.message})`);
    return null;
  }
}

function validateStructure(file, origin, errors) {
  const name = path.basename(file);
  const s = readJson(file, errors);
  if (!s || typeof s !== 'object' || Array.isArray(s)) {
    if (s) errors.push(`${name}: must be a JSON object`);
    return;
  }
  if (typeof s.tier !== 'string' || !KEY_RE.test(s.tier)) {
    errors.push(`${name}: tier "${s.tier}" must be a string matching ${KEY_RE}`);
  } else if (isReservedKey(s.tier)) {
    errors.push(`${name}: tier "${s.tier}" is not allowed`);
  }
  if (typeof s.controlSetVersion !== 'string' || !VERSION_RE.test(s.controlSetVersion)) {
    errors.push(`${name}: controlSetVersion "${s.controlSetVersion}" must be a string matching ${VERSION_RE}`);
  }
  if (name !== `${s.tier}.${s.controlSetVersion}${STRUCTURE_SUFFIX}`) {
    errors.push(`${name}: filename must be <tier>.<controlSetVersion>${STRUCTURE_SUFFIX} from its own fields ("${s.tier}", "${s.controlSetVersion}")`);
  }
  if (!SOURCE_AUTHORITIES.includes(s.sourceAuthority)) {
    errors.push(`${name}: sourceAuthority "${s.sourceAuthority}" must be one of ${SOURCE_AUTHORITIES.join(', ')}`);
  } else if (origin === 'bundled' && s.sourceAuthority === 'imported') {
    errors.push(`${name}: a bundled tier may not be "imported" -- licensed wording never ships with the plugin`);
  }
  if (typeof s.nonAuthoritative !== 'boolean') errors.push(`${name}: nonAuthoritative must be a boolean`);
  if (!Array.isArray(s.controls) || s.controls.length === 0) {
    errors.push(`${name}: controls must be a non-empty array`);
    return;
  }
  const seen = new Set();
  s.controls.forEach((c, i) => {
    const where = `${name}: controls[${i}]`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (!isNonEmptyString(c.id)) {
      errors.push(`${where}: id must be a non-empty string`);
    } else if (!SAFE_TOKEN_RE.test(c.id)) {
      errors.push(`${where}: id "${c.id}" must match ${SAFE_TOKEN_RE}`);
    } else if (isReservedKey(c.id)) {
      errors.push(`${where}: id "${c.id}" is not allowed`);
    } else if (seen.has(c.id)) {
      errors.push(`${where}: duplicate id "${c.id}"`);
    } else {
      seen.add(c.id);
    }
    for (const field of CONTROL_STRINGS) {
      if (!isNonEmptyString(c[field])) errors.push(`${where}: ${field} must be a non-empty string`);
    }
    if (isNonEmptyString(c.domainKey) && !SAFE_TOKEN_RE.test(c.domainKey)) {
      errors.push(`${where}: domainKey "${c.domainKey}" must match ${SAFE_TOKEN_RE}`);
    } else if (isReservedKey(c.domainKey)) {
      errors.push(`${where}: domainKey "${c.domainKey}" is not allowed`);
    }
    for (const field of STATE_ONLY_FIELDS) {
      // An imported tier holds the org's licensed wording, and registration carries it into state.
      // A project folder lives in the gitignored docs/ciso/, so the wording stays on the machine.
      if (field === 'statementText' && s.sourceAuthority === 'imported') {
        if (c.statementText !== undefined && !isNonEmptyString(c.statementText)) errors.push(`${where}: statementText must be a non-empty string`);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(c, field)) {
        errors.push(`${where}: "${field}" is a field ciso state owns and may not appear in a structure file`);
      }
    }
  });
}

// Returns [message]; empty means valid. `origin` is "bundled" or "project". A file that exists but
// cannot be read (a directory named ground-rules.md, a folder without read permission) is reported
// as an error rather than thrown, so one broken project folder never stops a listing.
function validateFramework(dir, origin) {
  return inspectFramework(dir, origin).errors;
}

// { errors, fw }, where fw is the parsed framework.json, so a listing reads it only once.
function inspectFramework(dir, origin) {
  try {
    return checkFramework(dir, origin);
  } catch (err) {
    return { errors: [`not readable (${err.message})`], fw: null };
  }
}

// A project framework's files are read and quoted to the user, so a symlink could point a verb at
// any file on the machine (an .env, a credentials file). Such a file is refused and never read.
// Bundled frameworks are plugin code and exempt. The folder itself may still be a link.
function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function checkFramework(dir, origin) {
  const errors = [];
  const folder = path.basename(path.resolve(dir));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { errors: [`${dir} is not a directory`], fw: null };
  const linked = (p) => origin !== 'bundled' && isLink(p);
  const linkError = (name) => `${name} may not be a symlink in a project framework`;

  const fwPath = path.join(dir, 'framework.json');
  let fw = null;
  if (!fs.existsSync(fwPath)) {
    errors.push('framework.json is missing');
  } else if (linked(fwPath)) {
    errors.push(linkError('framework.json'));
  } else {
    fw = readJson(fwPath, errors);
    if (fw && (typeof fw !== 'object' || Array.isArray(fw))) {
      errors.push('framework.json: must be a JSON object');
      fw = null;
    }
  }
  if (fw) {
    if (!isNonEmptyString(fw.certKey) || !KEY_RE.test(fw.certKey)) {
      errors.push(`framework.json: certKey "${fw.certKey}" must match ${KEY_RE}`);
    } else if (isReservedKey(fw.certKey)) {
      errors.push(`framework.json: certKey "${fw.certKey}" is not allowed`);
    } else if (fw.certKey !== folder) {
      errors.push(`framework.json: certKey "${fw.certKey}" must equal the folder name "${folder}"`);
    }
    for (const field of ['displayName', 'summary']) {
      if (!isNonEmptyString(fw[field])) errors.push(`framework.json: ${field} must be a non-empty string`);
    }
    if (isNonEmptyString(fw.displayName) && UNSAFE_IN_DOUBLE_QUOTES_RE.test(fw.displayName)) {
      errors.push('framework.json: displayName may not contain ", $, `, \\ or control characters');
    }
    if (!Array.isArray(fw.tiers) || fw.tiers.length === 0) {
      errors.push('framework.json: tiers must be a non-empty array');
      fw.tiers = [];
    } else {
      const seen = new Set();
      for (const t of fw.tiers) {
        if (typeof t !== 'string' || !KEY_RE.test(t)) errors.push(`framework.json: tier "${t}" must match ${KEY_RE}`);
        else if (isReservedKey(t)) errors.push(`framework.json: tier "${t}" is not allowed`);
        else if (seen.has(t)) errors.push(`framework.json: duplicate tier "${t}"`);
        seen.add(t);
      }
    }
  }

  const rulesPath = path.join(dir, 'ground-rules.md');
  if (!fs.existsSync(rulesPath)) errors.push('ground-rules.md is missing');
  else if (linked(rulesPath)) errors.push(linkError('ground-rules.md'));
  else if (fs.readFileSync(rulesPath, 'utf8').trim().length === 0) errors.push('ground-rules.md is empty');

  if (origin !== 'bundled' && fs.existsSync(path.join(dir, 'flows'))) {
    errors.push('flows/ is not allowed in a project framework -- project frameworks are data, not instructions');
  }

  const structureFiles = fs.readdirSync(dir).filter((n) => n.endsWith(STRUCTURE_SUFFIX)).sort();
  const declared = (fw && fw.tiers) || [];
  const perTier = Object.create(null);
  for (const name of structureFiles) {
    const tier = name.split('.')[0];
    if (fw && !declared.includes(tier)) errors.push(`${name}: tier "${tier}" is not declared in framework.json`);
    perTier[tier] = (perTier[tier] || 0) + 1;
    if (linked(path.join(dir, name))) errors.push(linkError(name));
    else validateStructure(path.join(dir, name), origin, errors);
  }
  for (const tier of declared) {
    if (!perTier[tier]) errors.push(`tier "${tier}" is declared but has no ${tier}.<controlSetVersion>${STRUCTURE_SUFFIX}`);
    else if (perTier[tier] > 1) errors.push(`tier "${tier}" has ${perTier[tier]} structure files; exactly one is allowed`);
  }
  return { errors, fw };
}

// Folders under `root`, following symlinks so a linked framework folder counts like a real one.
// Throws when `root` exists but cannot be listed (a file, or no read permission).
function subdirs(root) {
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .map((name) => path.join(root, name))
    .filter((p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false; // a dangling symlink is not a framework folder
      }
    })
    .sort();
}

function describe(dir, origin, fw) {
  return { certKey: fw.certKey, displayName: fw.displayName, summary: fw.summary, tiers: fw.tiers, dir, origin };
}

// Bundled frameworks plus any under <docsCisoDir>/frameworks/. Invalid folders and certKey
// clashes go to `errors` only, never to `frameworks`.
function listFrameworks(docsCisoDir, bundledRoot) {
  const frameworks = [];
  const errors = [];
  const bundled = new Map();
  const root = bundledRoot || BUNDLED_ROOT;
  const bundledDirs = subdirs(root);
  // No bundled framework at all is a broken install (a partial copy, a renamed folder), never an
  // empty catalog: report it so `list` exits 1 and the dashboard throws.
  if (bundledDirs.length === 0) {
    errors.push({ origin: 'bundled', dir: root, message: 'no bundled framework found -- the ciso install is incomplete' });
  }
  for (const dir of bundledDirs) {
    // Claimed even when invalid, so a project folder can never stand in for a broken bundled one.
    bundled.set(path.basename(dir), dir);
    const { errors: msgs, fw } = inspectFramework(dir, 'bundled');
    if (msgs.length) msgs.forEach((message) => errors.push({ origin: 'bundled', dir, message }));
    else frameworks.push(describe(dir, 'bundled', fw));
  }
  const projectRoot = docsCisoDir ? path.join(path.resolve(docsCisoDir), 'frameworks') : null;
  let projectDirs = [];
  try {
    projectDirs = subdirs(projectRoot);
  } catch (err) {
    // The project's own folder is the user's data: report it and keep the bundled frameworks.
    errors.push({ origin: 'project', dir: projectRoot, message: `not readable (${err.message})` });
  }
  for (const dir of projectDirs) {
    const name = path.basename(dir);
    if (bundled.has(name)) {
      errors.push({ origin: 'project', dir, message: `certKey "${name}" clashes with the bundled framework at ${bundled.get(name)}; ${dir} is excluded` });
      continue;
    }
    const { errors: msgs, fw } = inspectFramework(dir, 'project');
    if (msgs.length) msgs.forEach((message) => errors.push({ origin: 'project', dir, message }));
    else frameworks.push(describe(dir, 'project', fw));
  }
  return { frameworks, errors };
}

module.exports = { listFrameworks, validateFramework, BUNDLED_ROOT, SOURCE_AUTHORITIES };

function main(argv) {
  const [cmd, target, flag] = argv;
  if (cmd === 'list' && target) {
    const { frameworks, errors } = listFrameworks(target);
    for (const e of errors) console.error(`${e.origin} ${e.dir}: ${e.message}`);
    console.log(JSON.stringify(frameworks, null, 2));
    return errors.some((e) => e.origin === 'bundled') ? 1 : 0;
  }
  if (cmd === 'validate' && target) {
    const errors = validateFramework(target, flag === '--bundled' ? 'bundled' : 'project');
    if (errors.length) {
      for (const message of errors) console.error(message);
      return 1;
    }
    console.log('ok');
    return 0;
  }
  console.error('Usage:\n  node frameworks.js list <docs/ciso-dir>\n  node frameworks.js validate <dir> [--bundled]');
  return 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
