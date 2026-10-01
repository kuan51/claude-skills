'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./helpers/frontmatter.js');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// Maintainer-only skills that must NOT be auto-selected by the model during an org's normal use --
// they stay reachable as an explicit /ciso:<name> invocation. Keep in sync with the
// `disable-model-invocation: true` frontmatter on each listed SKILL.md.
const MAINTAINER_ONLY = new Set(['hitrust-controls-compiler']);

// Anthropic's skill-name rules (per the marketplace authoring rubric): lowercase letters, digits,
// and hyphens only; <= 64 chars; must not contain the reserved words "anthropic" or "claude".
const NAME_RE = /^[a-z0-9-]+$/;
const RESERVED = ['anthropic', 'claude'];
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

function findSkillFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findSkillFiles(full));
    } else if (entry.name === 'SKILL.md') {
      out.push(full);
    }
  }
  return out;
}

const skillFiles = findSkillFiles(SKILLS_DIR);

// The org-facing surface is verbs, not certifications: one skill per action a user takes, each
// resolving which certification it applies to at runtime. A certification module (skills/hitrust/,
// skills/soc2/, skills/iso27001/) deliberately ships NO SKILL.md -- it is reference files, lib
// scripts and control sets that the verbs dispatch into. See ADDING-A-CERTIFICATION.md.
const EXPECTED_SKILLS = [
  'audit', 'evidence', 'hitrust-controls-compiler', 'import', 'init', 'interview',
  'register', 'review', 'roadmap', 'scope', 'sync-tasks', 'upgrade',
];

test('every expected verb ships a SKILL.md', () => {
  const names = skillFiles.map((f) => path.basename(path.dirname(f))).sort();
  for (const expected of EXPECTED_SKILLS) {
    assert.ok(names.includes(expected), `missing SKILL.md for skill "${expected}"`);
  }
});

test('certification modules ship no SKILL.md -- they are dispatched into, not invoked', () => {
  const names = skillFiles.map((f) => path.basename(path.dirname(f)));
  for (const certModule of ['hitrust', 'soc2', 'iso27001']) {
    assert.ok(
      !names.includes(certModule),
      `skills/${certModule}/SKILL.md exists -- certification modules are reference files and lib scripts that verbs dispatch into, not skills a user invokes directly`
    );
  }
});

for (const file of skillFiles) {
  const dirName = path.basename(path.dirname(file));

  test(`${dirName}/SKILL.md has valid name + description frontmatter`, () => {
    const fields = parseFrontmatter(fs.readFileSync(file, 'utf8'));

    assert.ok(fields.name, `${dirName}: missing name`);
    assert.ok(fields.name.length <= MAX_NAME, `${dirName}: name exceeds ${MAX_NAME} chars`);
    assert.ok(NAME_RE.test(fields.name), `${dirName}: name must be lowercase letters/digits/hyphens`);
    for (const word of RESERVED) {
      assert.ok(!fields.name.includes(word), `${dirName}: name must not contain reserved word "${word}"`);
    }

    assert.ok(fields.description, `${dirName}: missing description`);
    assert.ok(
      fields.description.length <= MAX_DESCRIPTION,
      `${dirName}: description exceeds ${MAX_DESCRIPTION} chars (${fields.description.length})`
    );
  });

  test(`${dirName}/SKILL.md model-invocation matches its maintainer-only status`, () => {
    const fields = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    const flag = fields['disable-model-invocation'];
    if (MAINTAINER_ONLY.has(dirName)) {
      assert.equal(
        flag,
        'true',
        `${dirName} is maintainer-only and must set "disable-model-invocation: true"`
      );
    } else {
      assert.notEqual(
        flag,
        'true',
        `${dirName} is an org-facing skill and must stay model-invocable (no disable-model-invocation)`
      );
    }
  });

  test(`${dirName}/SKILL.md declares a least-privilege allowed-tools list`, () => {
    const fields = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    // allowed-tools is additive pre-approval (tools usable without a permission prompt during the
    // invoking turn), not a restriction -- so declaring it can only reduce prompts, never break a
    // flow. Every ciso skill declares the minimal set it actually drives so its scripted node runs
    // don't each prompt. See https://code.claude.com/docs/en/skills#pre-approve-tools-for-a-skill
    const tools = fields['allowed-tools'];
    assert.ok(tools && tools.trim().length > 0, `${dirName}: must declare a non-empty allowed-tools list`);
  });
}

// The load-bearing rule of the verb-first surface. When each certification had its own SKILL.md,
// that page was always loaded and its content-authority section reached the user on every
// invocation for free. Verbs are certification-generic, so each one has to go and read the
// ground rules itself after resolving certKey -- and a verb that forgets silently drops the
// guarantee. Pin it here rather than trusting nine files to stay in step by convention.
const CERT_AWARE_VERBS = [
  'audit', 'evidence', 'import', 'interview', 'register', 'review', 'roadmap', 'scope', 'upgrade',
];

for (const verb of CERT_AWARE_VERBS) {
  test(`${verb}/SKILL.md names ground-rules.md and generic-ground-rules.md`, () => {
    const body = fs.readFileSync(path.join(SKILLS_DIR, verb, 'SKILL.md'), 'utf8');
    assert.match(body, /<dir>\/ground-rules\.md/, `${verb} never reads the framework's ground-rules.md`);
    assert.match(
      body,
      /skills\/_shared\/generic-ground-rules\.md/,
      `${verb} never reads generic-ground-rules.md -- a project framework would get no plugin-owned rules`
    );
    assert.match(body, /frameworks\.js" list/, `${verb} must resolve the framework through frameworks.js list`);
  });
}

// A project framework has no flows/, so these verbs need a plugin-owned generic flow to follow.
for (const verb of ['register', 'interview', 'roadmap']) {
  test(`${verb}/SKILL.md names its generic flow, and the flow exists`, () => {
    const body = fs.readFileSync(path.join(SKILLS_DIR, verb, 'SKILL.md'), 'utf8');
    assert.ok(body.includes(`skills/${verb}/references/generic.md`), `${verb} never names its generic.md`);
    const generic = path.join(SKILLS_DIR, verb, 'references', 'generic.md');
    assert.ok(fs.existsSync(generic), `${generic} is missing`);
    assert.ok(fs.readFileSync(generic, 'utf8').trim().length > 0, `${generic} is empty`);
  });
}
