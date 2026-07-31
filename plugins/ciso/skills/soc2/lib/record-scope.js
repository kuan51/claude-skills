'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Records a SOC 2 engagement's scope decisions onto its tier in state.json.
 *
 * Scope is the group of decisions made BEFORE any criterion is assessed -- report type,
 * which Trust Services Categories are in scope, the observation period, how subservice
 * organizations are treated. They are properties of the engagement, not of any one
 * criterion, so they live on the tier object rather than being smuggled in as pseudo-controls
 * (which would pollute the compliance percentage with decisions that aren't controls).
 *
 * `registerTier` creates the tier; this is the only writer of its `scope` object.
 *
 * Contract, mirroring register-tier.js:
 *   - Requires certKey and tierKey explicitly -- it never guesses which engagement you mean.
 *   - Touches ONLY tier.scope. `controls`, `archivedControls` and `interviewSessions` are
 *     never read, rewritten or reordered, so recording scope can never drop assessment data.
 *   - Idempotent and safe to re-run: it merges into any existing scope, so recording the
 *     observation period later doesn't erase the category selection recorded earlier.
 *
 * Stdlib only -- no npm dependencies.
 */

// Fail-closed allowlist. An unrecognized key is a typo or a field someone expected this
// script to understand -- either way, rejecting loudly beats writing it somewhere the
// dashboard and the skill will never look at again.
const SCOPE_FIELDS = new Set([
  'reportType',
  'tscCategories',
  'observationPeriodStart',
  'observationPeriodEnd',
  'systemDescription',
  'systemBoundary',
  'subserviceMethod',
  'subserviceOrganizations',
  'complementaryUserEntityControls',
  'serviceAuditor',
  'notes',
]);

const REPORT_TYPES = new Set(['type1', 'type2']);
const TSC_CATEGORIES = new Set(['security', 'availability', 'confidentiality', 'processing-integrity', 'privacy']);
const SUBSERVICE_METHODS = new Set(['carve-out', 'inclusive', 'none']);

function assertOneOf(value, allowed, field) {
  if (value === undefined) return;
  if (!allowed.has(value)) {
    throw new Error(`recordScope: ${field} must be one of ${[...allowed].join(', ')} -- got "${value}"`);
  }
}

function validate(scope) {
  for (const key of Object.keys(scope)) {
    if (!SCOPE_FIELDS.has(key)) {
      throw new Error(`recordScope: unknown scope field "${key}" -- allowed fields are ${[...SCOPE_FIELDS].join(', ')}`);
    }
  }

  assertOneOf(scope.reportType, REPORT_TYPES, 'reportType');
  assertOneOf(scope.subserviceMethod, SUBSERVICE_METHODS, 'subserviceMethod');

  if (scope.tscCategories !== undefined) {
    if (!Array.isArray(scope.tscCategories)) {
      throw new Error('recordScope: tscCategories must be an array');
    }
    for (const category of scope.tscCategories) {
      assertOneOf(category, TSC_CATEGORIES, 'tscCategories entry');
    }
    // Security is the Common Criteria; every SOC 2 report includes it, so a selection that
    // omits it is a mistake worth catching here rather than three flows later when the
    // interview quietly marks all 33 common criteria out of scope.
    if (!scope.tscCategories.includes('security')) {
      throw new Error('recordScope: tscCategories must include "security" -- the Common Criteria are mandatory in every SOC 2 report');
    }
  }
}

/**
 * Reads <stateJsonPath>, merges `scope` into
 * state.certifications[certKey].tiers[tierKey].scope, and writes it back.
 */
function recordScope(stateJsonPath, certKey, tierKey, scope) {
  if (!certKey) throw new Error('recordScope: certKey is required (e.g. "soc2")');
  if (!tierKey) throw new Error('recordScope: tierKey is required (e.g. "type2")');
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    throw new Error('recordScope: scope must be an object of scope fields');
  }

  validate(scope);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state
    && state.certifications
    && state.certifications[certKey]
    && state.certifications[certKey].tiers
    && state.certifications[certKey].tiers[tierKey];

  if (!tier) {
    throw new Error(`recordScope: tier ${certKey}/${tierKey} not found in state.json -- register it first.`);
  }

  tier.scope = Object.assign({}, tier.scope, scope, { recordedAt: new Date().toISOString() });

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return tier.scope;
}

module.exports = { recordScope, SCOPE_FIELDS, TSC_CATEGORIES, REPORT_TYPES, SUBSERVICE_METHODS };

if (require.main === module) {
  const [targetDir, certKey, tierKey, scopeJson] = process.argv.slice(2);
  if (!targetDir || !certKey || !tierKey || !scopeJson) {
    console.error('Usage: node record-scope.js <target-dir> <certKey> <tierKey> \'<jsonScope>\'');
    process.exit(1);
  }
  const stateJsonPath = path.join(targetDir, 'state.json');
  if (!fs.existsSync(stateJsonPath)) {
    console.error(`No state.json found at ${stateJsonPath} -- run ciso:init first.`);
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(recordScope(stateJsonPath, certKey, tierKey, JSON.parse(scopeJson)), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
