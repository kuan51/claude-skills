#!/usr/bin/env node
'use strict';

/**
 * Writes a project framework, <docs/ciso-dir>/frameworks/<certKey>/, from converted controls.
 *
 * Usage:
 *   node write-framework.js <docs/ciso-dir> <meta.json> <converted.json>
 *        [--paraphrases <paraphrases.json> --terms-permit-derivatives]
 *
 * meta.json is { certKey, displayName, summary, tier, controlSetVersion, mode }, mode "private"
 * (the default) or "shareable". converted.json is convert-controls.js's output.
 *
 *   private    the source wording, verbatim. sourceAuthority "imported": it stays on this machine.
 *   shareable  each label and summary from paraphrases.json, in the org's own words, and nothing
 *              else from the source but ids, domains and codes. sourceAuthority "paraphrased".
 *              Needs --terms-permit-derivatives, which records the user's answer that the
 *              publisher's terms permit derivative works and verifies nothing. Refused while any
 *              control fails check-overlap.js.
 *
 * Writes nothing when it refuses, and removes the folder when the result fails validation.
 * Stdlib only.
 */

const fs = require('fs');
const path = require('path');
const { validateFramework, BUNDLED_ROOT, KEY_RE, VERSION_RE } = require('../../_shared/frameworks.js');
const { findOverlaps, applyParaphrases } = require('./check-overlap.js');

const PRIVATE_FIELDS = ['id', 'domain', 'domainKey', 'topicLabel', 'topicSummary', 'statementText', 'relatedControlCode'];
const SHAREABLE_FIELDS = ['id', 'domain', 'domainKey', 'topicLabel', 'topicSummary', 'relatedControlCode'];

function pick(control, fields) {
  const out = {};
  for (const f of fields) if (control[f] !== undefined) out[f] = control[f];
  return out;
}

function groundRules(meta) {
  if (meta.mode === 'private') {
    return `# ${meta.displayName}

Imported by \`ciso:import\` in private mode, from your organization's own copy of the standard.

- Each control's \`statementText\` is licensed wording, copied verbatim. Its labels and summaries
  came from the same source, so treat them as licensed too.
- Keep it on this machine. This folder sits inside \`docs/ciso/\`, which ciso keeps out of git: do
  not commit it or share it. Vendor research gets only control codes, and task sync sends no
  labels or summaries.
- Your licence decides whether you may give this text to an AI service such as Claude. ciso does
  not check that.
`;
  }
  return `# ${meta.displayName}

Written by \`ciso:import\` in shareable mode. Each control's label and summary are in your
organization's own words, with the same intended outcome as the standard's requirement. The ids,
domains and codes are the standard's own.

- The user said the publisher's terms of use permit derivative works. \`--terms-permit-derivatives\`
  recorded that answer and verified nothing. Check the terms yourself before you share this folder.
- Every label and summary passed a check that rejects a run of 8 or more words shared with the
  source, and a label or summary equal to a source cell. That check is a tripwire against copying,
  not proof of a paraphrase. Have a person review the wording before you share it.
- This set is non-authoritative. Consult the standard itself and your assessor or auditor for exact
  scope and wording.
`;
}

function writeFramework(docsCisoDir, meta, controls, { termsPermitDerivatives = false } = {}) {
  meta = Object.assign({ mode: 'private' }, meta);
  if (meta.mode !== 'private' && meta.mode !== 'shareable') throw new Error(`mode "${meta.mode}" must be "private" or "shareable"`);
  // These three become path segments, so they are checked before anything is written.
  if (typeof meta.certKey !== 'string' || !KEY_RE.test(meta.certKey)) throw new Error(`certKey "${meta.certKey}" must match ${KEY_RE}`);
  if (typeof meta.tier !== 'string' || !KEY_RE.test(meta.tier)) throw new Error(`tier "${meta.tier}" must match ${KEY_RE}`);
  if (typeof meta.controlSetVersion !== 'string' || !VERSION_RE.test(meta.controlSetVersion)) {
    throw new Error(`controlSetVersion "${meta.controlSetVersion}" must match ${VERSION_RE}`);
  }
  if (fs.existsSync(path.join(BUNDLED_ROOT, meta.certKey))) {
    throw new Error(`certKey "${meta.certKey}" is a bundled framework's; ciso would ignore a project folder with that name. Pick another.`);
  }
  const dir = path.join(path.resolve(docsCisoDir), 'frameworks', meta.certKey);
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists -- ciso never overwrites a framework folder`);
  if (!Array.isArray(controls) || controls.length === 0) throw new Error('there are no controls to write');

  let fields = PRIVATE_FIELDS;
  if (meta.mode === 'shareable') {
    if (!termsPermitDerivatives) {
      throw new Error('shareable mode needs --terms-permit-derivatives: the user\'s answer that the publisher\'s terms of use permit derivative works');
    }
    const rejections = findOverlaps(controls);
    if (rejections.length) {
      throw new Error(`${rejections.length} control(s) too close to the source, nothing written:\n${rejections.map((r) => `${r.id} ${r.field}: ${r.reason}`).join('\n')}`);
    }
    fields = SHAREABLE_FIELDS;
  }

  const structure = {
    tier: meta.tier,
    controlSetVersion: meta.controlSetVersion,
    sourceAuthority: meta.mode === 'private' ? 'imported' : 'paraphrased',
    nonAuthoritative: meta.mode === 'shareable',
    controls: controls.map((c) => pick(c, fields)),
  };
  const framework = { certKey: meta.certKey, displayName: meta.displayName, summary: meta.summary, tiers: [meta.tier] };
  const structureFile = path.join(dir, `${meta.tier}.${meta.controlSetVersion}.structure.json`);

  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'framework.json'), JSON.stringify(framework, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'ground-rules.md'), groundRules(meta));
  fs.writeFileSync(structureFile, JSON.stringify(structure, null, 2) + '\n');
  const errors = validateFramework(dir, 'project');
  if (errors.length) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`the framework did not validate, nothing written:\n${errors.join('\n')}`);
  }
  return { dir, structureFile, mode: meta.mode, controls: structure.controls.length };
}

module.exports = { writeFramework };

function main(argv) {
  const flag = (name) => argv.includes(name);
  const value = (name) => (argv.indexOf(name) === -1 ? null : argv[argv.indexOf(name) + 1]);
  const [docs, metaFile, convertedFile] = argv;
  if (!docs || !metaFile || !convertedFile || docs.startsWith('--')) {
    console.error('Usage: node write-framework.js <docs/ciso-dir> <meta.json> <converted.json> [--paraphrases <file> --terms-permit-derivatives]');
    return 1;
  }
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const meta = read(metaFile);
  const converted = read(convertedFile);
  let controls = Array.isArray(converted) ? converted : converted.controls;
  const paraphrasesFile = value('--paraphrases');
  if ((meta.mode || 'private') === 'private' && paraphrasesFile) throw new Error('--paraphrases is for shareable mode; private mode keeps the source wording');
  if (meta.mode === 'shareable') {
    if (!paraphrasesFile) throw new Error('shareable mode needs --paraphrases <file>: each control\'s label and summary in your own words');
    controls = applyParaphrases(controls, read(paraphrasesFile));
  }
  console.log(JSON.stringify(writeFramework(docs, meta, controls, { termsPermitDerivatives: flag('--terms-permit-derivatives') }), null, 2));
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
