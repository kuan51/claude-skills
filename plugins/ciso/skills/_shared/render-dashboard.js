#!/usr/bin/env node
'use strict';

/**
 * Regenerates <target-dir>/dashboard.html from <target-dir>/state.json.
 *
 * Usage: node render-dashboard.js <target-dir>
 *
 * This is the single canonical renderer for the ciso plugin's dashboard. Both
 * the `init` and `hitrust` skills call it as their last step:
 *
 *   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <target-dir>
 *
 * Stdlib only -- no npm dependencies.
 */

const fs = require('fs');
const path = require('path');

// The 5 assessment statuses defined by the state.json schema. Fixed and
// enumerable (unlike control "type" or certification/tier keys, which are
// treated as open-ended), so it's safe to bake this list in.
const STATUSES = ['not_assessed', 'met', 'in_progress', 'gap', 'not_applicable'];

// Exact token the template must contain. Both sides (this file and
// dashboard-template.html) are owned by this same change, so an exact,
// space-free match is intentional -- if this ever fails to find the marker,
// that's a real bug to fix, not a case to work around.
const DATA_MARKER = '/*__CISO_DATA__*/null';

function emptyStatusCounts() {
  const counts = {};
  for (const status of STATUSES) counts[status] = 0;
  return counts;
}

// Aggregates one flat list of control objects into the counts/percentages
// shape used for both the tier-level rollup and each per-domain rollup.
function summarizeControls(controls) {
  const byStatus = emptyStatusCounts();
  let total = 0;
  let assessedCount = 0;

  for (const control of controls) {
    total += 1;
    const status = control && control.assessment && control.assessment.status;
    if (status && Object.prototype.hasOwnProperty.call(byStatus, status)) {
      byStatus[status] += 1;
    }
    const assessedAt = control && control.assessment && control.assessment.assessedAt;
    if (assessedAt != null) {
      assessedCount += 1;
    }
  }

  const applicableTotal = total - byStatus.not_applicable;
  const compliancePercent = applicableTotal === 0
    ? 0
    : Math.round((100 * byStatus.met) / applicableTotal);
  // Deliberately divides by `total` (not `applicableTotal`) -- "assessed" measures
  // interview progress, which is a different question from "compliant".
  const assessedPercent = total === 0
    ? 0
    : Math.round((100 * assessedCount) / total);

  return { total, byStatus, applicableTotal, compliancePercent, assessedPercent };
}

/**
 * Pure, unit-testable rollup computation. Iterates certifications/tiers/domains
 * generically (Object.keys everywhere) -- never hardcodes "hitrust", "e1", or
 * the legacy "01".."11" category prefixes, so future certifications/tiers/domains
 * require zero changes here.
 *
 * Returns a structure mirroring `state.certifications`:
 *   { [certKey]: { [tierKey]: { total, byStatus, applicableTotal,
 *                                compliancePercent, assessedPercent,
 *                                byDomain: { [domainKey]: {...same shape, plus domainName} } } } }
 *
 * Note: byDomain entries carry `total`/`applicableTotal` too, a harmless
 * superset of the spec's stated byStatus/compliancePercent/assessedPercent
 * shape, kept for symmetry with the tier-level rollup and because the
 * template's domain bars want a raw count as well as a percentage.
 * `domainName` is a real display name read off the group's controls (see below),
 * or null if no control in the group carries one.
 */
function computeRollups(state) {
  const rollups = {};
  const certifications = (state && state.certifications) || {};

  for (const certKey of Object.keys(certifications)) {
    const cert = certifications[certKey] || {};
    const tiers = cert.tiers || {};
    rollups[certKey] = {};

    for (const tierKey of Object.keys(tiers)) {
      const tier = tiers[tierKey] || {};
      const controls = Object.values(tier.controls || {});

      const byDomainLists = {};
      for (const control of controls) {
        // Same fallback key used here and in the template's client-side grouping -- keep them
        // identical or jump-link anchors won't match the group a control actually renders under.
        // Prefers `domainKey` (the modern 19-domain numbering every current entry carries) since a
        // single tier can mix entries that also carry `legacyCategoryPrefix` (e1's OLD legacy
        // control-category numbering -- a DIFFERENT scheme than the modern domains) with entries
        // that don't; falls back to legacyCategoryPrefix then `domain` only for structures that
        // predate domainKey.
        const prefix = (control && (control.domainKey || control.legacyCategoryPrefix || control.domain)) || 'unknown';
        if (!byDomainLists[prefix]) byDomainLists[prefix] = [];
        byDomainLists[prefix].push(control);
      }

      const byDomain = {};
      for (const prefix of Object.keys(byDomainLists)) {
        const groupControls = byDomainLists[prefix];
        // `domainName` is a real display name (e.g. "Access Control") read directly off any control
        // in the group that has one, computed once here rather than the template guessing a display
        // label from the shape of `prefix` -- necessary now that `prefix` is usually a 2-digit
        // `domainKey` for every tier, so a "does this look numeric" heuristic can no longer tell a
        // modern domain group apart from an old-style e1 legacyCategoryPrefix-only group. Absent only
        // for structures with no `domain` field on any control (e.g. an org's real, legacy-shaped
        // MyCSF import), in which case the template falls back to a bare "Legacy Category <prefix>" label.
        const withDomain = groupControls.find((c) => c && c.domain);
        byDomain[prefix] = Object.assign(
          summarizeControls(groupControls),
          { domainName: (withDomain && withDomain.domain) || null }
        );
      }

      rollups[certKey][tierKey] = Object.assign(
        summarizeControls(controls),
        { byDomain }
      );
    }
  }

  return rollups;
}

// Escapes a JSON string so it can be safely embedded as the body of
// `const CISO_DATA = /*__CISO_DATA__*/<here>;` inside an inline <script> tag.
//
// Two independent hazards, both handled by the same unicode-escape pass:
//   1. HTML parsing: the HTML parser closes a <script> element on the literal
//      byte sequence "</script>" regardless of JS-string context, so a
//      control name or justification containing "</script><script>...".
//      would break out of the data island. JSON.stringify does not escape
//      "<", so this must be done explicitly.
//   2. `&` also gets escaped for the same reason ("&amp;" mid-token type
//      confusion is not a risk here, but escaping it is cheap and matches
//      the proven prior art this pattern is copied from).
//
// Unicode escapes (< etc.), not HTML entities (&lt; etc.), are used
// deliberately: entity escaping would corrupt the JSON (a JS string literal
// inside <script> is never HTML-entity-decoded, so `<` stays data,
// while `&lt;` would be stored as the literal 4 characters "&lt;") and would
// double-escape against the template's own render-time `esc()` helper. A
// unicode escape inside a JSON string is valid JSON, so this round-trips
// through JSON.parse unchanged.
function escapeForInlineScript(jsonString) {
  return jsonString
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// Splices the escaped JSON into the template in place of DATA_MARKER.
//
// Deliberately NOT `template.replace(DATA_MARKER, replacementString)`: the
// two-argument string form of String.prototype.replace treats `$` sequences
// in the replacement as special patterns ($$, $&, $`, $') and will silently
// splice unrelated template bytes into the output (or garble the payload)
// whenever injected data contains a `$`. Using split/join sidesteps this
// entirely, since neither treats its input as a pattern.
function injectData(template, payload) {
  if (!template.includes(DATA_MARKER)) {
    throw new Error(
      `render-dashboard: data marker "${DATA_MARKER}" not found in dashboard template -- refusing to hand-write HTML`
    );
  }
  const escaped = escapeForInlineScript(JSON.stringify(payload));
  const replacement = `/*__CISO_DATA__*/${escaped}`;
  return template.split(DATA_MARKER).join(replacement);
}

function readState(targetDir) {
  const statePath = path.join(targetDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error(`render-dashboard: no state.json found at ${statePath}`);
  }
  const raw = fs.readFileSync(statePath, 'utf8');
  return { statePath, state: JSON.parse(raw) };
}

function readTemplate() {
  // Relative to this file's own location, NOT the caller's CWD or
  // ${CLAUDE_PLUGIN_ROOT} -- that env var is only needed in the invocation
  // line callers use to find *this script*; this script always knows where
  // its sibling template asset lives relative to itself.
  const templatePath = path.join(__dirname, '..', '..', 'assets', 'dashboard-template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`render-dashboard: template not found at ${templatePath}`);
  }
  return { templatePath, template: fs.readFileSync(templatePath, 'utf8') };
}

/**
 * Renders <target-dir>/dashboard.html from <target-dir>/state.json.
 *
 * The only mutation ever made to state.json is stamping `generatedAt` --
 * every other field is written back byte-for-byte (value-wise) unchanged.
 */
function renderDashboard(targetDir) {
  const { statePath, state } = readState(targetDir);
  const { template } = readTemplate();

  state.generatedAt = new Date().toISOString();

  const rollups = computeRollups(state);
  const html = injectData(template, { state, rollups });

  fs.writeFileSync(path.join(targetDir, 'dashboard.html'), html, 'utf8');
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  return { state, rollups, html };
}

function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: node render-dashboard.js <target-dir>');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(path.join(targetDir, 'state.json'))) {
    console.error(`render-dashboard: no state.json found at ${path.join(targetDir, 'state.json')}`);
    process.exitCode = 1;
    return;
  }
  try {
    const { html } = renderDashboard(targetDir);
    console.log(`Wrote ${path.join(targetDir, 'dashboard.html')} (${html.length} bytes)`);
  } catch (err) {
    console.error(`render-dashboard: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  STATUSES,
  DATA_MARKER,
  computeRollups,
  escapeForInlineScript,
  injectData,
  renderDashboard,
};
