'use strict';

// A framework that is not HITRUST, end to end through the core scripts: a project framework
// rendered on the dashboard, and a flat tier that happens to be named `r2`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKILLS = path.join(__dirname, '..', 'skills');
const { scaffoldStateJson } = require(path.join(SKILLS, 'init/lib/init-project.js'));
const { registerTier, loadStructure } = require(path.join(SKILLS, 'hitrust/lib/register-tier.js'));
const { applyAssessment, markCategoryComplete } = require(path.join(SKILLS, 'hitrust/lib/apply-assessment.js'));
const { classifyState } = require(path.join(SKILLS, 'sync-tasks/lib/diff-tasks.js'));
const { reconcileStateVersion } = require(path.join(SKILLS, 'hitrust/lib/versioning/reconcile-state-version.js'));
const { renderDashboard } = require(path.join(SKILLS, '_shared/render-dashboard.js'));

const EXAMPLE = path.join(__dirname, 'fixtures', 'frameworks', 'example');

function docsDir() {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ciso-project-fw-')), 'docs', 'ciso');
  scaffoldStateJson(dir);
  return dir;
}

const ACME_R2 = {
  tier: 'r2',
  controlSetVersion: 'v1',
  sourceAuthority: 'public-topic-level',
  nonAuthoritative: true,
  controls: [
    { id: 'A-1', domain: 'Access', domainKey: 'AC', topicLabel: 'Accounts', topicSummary: 'One account per person.' },
    { id: 'A-2', domain: 'Access', domainKey: 'AC', topicLabel: 'Reviews', topicSummary: 'Access is reviewed.' },
  ],
};

test('a flat acme/r2 tier registers, assesses, syncs, reconciles and renders with no maturity shape', () => {
  const dir = docsDir();
  const statePath = path.join(dir, 'state.json');

  registerTier(statePath, ACME_R2, 'acme', 'Acme');
  let tier = JSON.parse(fs.readFileSync(statePath, 'utf8')).certifications.acme.tiers.r2;
  for (const c of Object.values(tier.controls)) {
    assert.equal(c.assessment.status, 'not_assessed');
    assert.ok(!('maturity' in c.assessment), 'acme r2 must stay flat');
  }

  applyAssessment(statePath, 'acme', 'r2', 'A-1', { status: 'gap' });
  applyAssessment(statePath, 'acme', 'r2', 'A-2', { status: 'met', justification: 'Quarterly review ticket.' });
  const session = markCategoryComplete(statePath, 'acme', 'r2', 'AC');
  assert.equal(session.status, 'completed');

  const tasks = classifyState(statePath, 'acme', 'r2');
  assert.deepEqual(tasks.creates, [{ controlId: 'A-1', action: 'create' }]);

  const v2 = JSON.parse(JSON.stringify(ACME_R2));
  v2.controlSetVersion = 'v2';
  v2.controls.push({ id: 'A-3', domain: 'Access', domainKey: 'AC', topicLabel: 'New', topicSummary: 'A new one.' });
  reconcileStateVersion(statePath, 'acme', 'r2', v2);
  tier = JSON.parse(fs.readFileSync(statePath, 'utf8')).certifications.acme.tiers.r2;
  assert.ok(!('maturity' in tier.controls['A-3'].assessment), 'a reconciled acme r2 control must stay flat');

  const { rollups, certPages } = renderDashboard(dir);
  assert.equal(certPages.acme, 'cert-acme.html');
  assert.equal(rollups.acme.r2.maturityDepthPercent, null);
});

test('HITRUST r2 still gets the maturity shape', () => {
  const dir = docsDir();
  const statePath = path.join(dir, 'state.json');
  registerTier(statePath, ACME_R2, 'hitrust', 'HITRUST CSF');
  const c = JSON.parse(fs.readFileSync(statePath, 'utf8')).certifications.hitrust.tiers.r2.controls['A-1'];
  assert.ok(c.assessment.maturity && c.assessment.maturity.implemented);
});

test('dashboard: a registered project framework gets its page; an unregistered one gets a card', () => {
  const dir = docsDir();
  fs.cpSync(EXAMPLE, path.join(dir, 'frameworks', 'example'), { recursive: true });

  let result = renderDashboard(dir);
  const entry = result.catalog.find((e) => e.certKey === 'example');
  assert.equal(entry.origin, 'project');
  assert.deepEqual(result.certPages, {});
  assert.ok(result.html.includes('Example Framework'));

  const structure = loadStructure(path.join(dir, 'frameworks', 'example', 'core.v1.structure.json'));
  registerTier(path.join(dir, 'state.json'), structure, 'example', 'Example Framework');
  result = renderDashboard(dir);
  assert.equal(result.certPages.example, 'cert-example.html');
  assert.ok(fs.existsSync(path.join(dir, 'cert-example.html')));
});

test('dashboard: an invalid project framework is reported on stderr and skipped, not thrown', () => {
  const dir = docsDir();
  const bad = path.join(dir, 'frameworks', 'example');
  fs.cpSync(EXAMPLE, bad, { recursive: true });
  fs.rmSync(path.join(bad, 'ground-rules.md'));
  const r = spawnSync(process.execPath, [path.join(SKILLS, '_shared', 'render-dashboard.js'), dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /skipping project .*example: ground-rules\.md is missing/);
  assert.ok(!fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8').includes('Example Framework'));
});
