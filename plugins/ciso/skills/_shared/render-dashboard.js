#!/usr/bin/env node
'use strict';

/**
 * Regenerates <target-dir>'s dashboard pages from <target-dir>/state.json.
 *
 * Usage: node render-dashboard.js <target-dir>
 *
 * Writes one page per view, all from the same template:
 *   dashboard.html        -- the meta index: one card per certification this plugin
 *                            supports (from assets/certifications.json), whether or not
 *                            this project tracks it yet.
 *   cert-<certKey>.html   -- one page per certification actually registered in state,
 *                            carrying that certification's overview cards, filter bar
 *                            and control drilldowns.
 *
 * `dashboard.html` deliberately keeps its name as the index rather than gaining a new
 * one: it is what every existing bookmark, .gitignore entry and skill doc already points
 * at, so the entry point never moves.
 *
 * This is the single canonical renderer for the ciso plugin's dashboards. Both
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

// r2's five PRISMA maturity dimensions. Duplicated locally per this codebase's established
// cross-file-independence precedent (see reconcile-state-version.js).
const MATURITY_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];

// Exact token the template must contain. Both sides (this file and
// dashboard-template.html) are owned by this same change, so an exact,
// space-free match is intentional -- if this ever fails to find the marker,
// that's a real bug to fix, not a case to work around.
const DATA_MARKER = '/*__CISO_DATA__*/null';

// The part of DATA_MARKER that survives into a rendered page (where `null` has been replaced
// by the real payload). Used to tell a page this renderer wrote apart from any other file the
// user happens to keep in the same directory -- see pruneStaleCertPages.
const DATA_MARKER_PREFIX = '/*__CISO_DATA__*/';

function emptyStatusCounts() {
  const counts = {};
  for (const status of STATUSES) counts[status] = 0;
  return counts;
}

// r2 controls carry assessment.maturity instead of a flat assessment.status. For rollup purposes
// (gauges, byStatus counts), the "effective" status/assessedAt is always the Implemented
// dimension -- the one dimension e1/i1 also solely measure -- so e1/i1/r2 domain gauges stay
// directly comparable. See docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md.
function effectiveStatus(assessment) {
  if (assessment && assessment.maturity) {
    return (assessment.maturity.implemented && assessment.maturity.implemented.status) || 'not_assessed';
  }
  return (assessment && assessment.status) || null;
}
function effectiveAssessedAt(assessment) {
  if (assessment && assessment.maturity) {
    return assessment.maturity.implemented && assessment.maturity.implemented.assessedAt;
  }
  return assessment && assessment.assessedAt;
}

// Aggregates one flat list of control objects into the counts/percentages
// shape used for both the tier-level rollup and each per-domain rollup.
function summarizeControls(controls) {
  const byStatus = emptyStatusCounts();
  let total = 0;
  let assessedCount = 0;
  let maturityControlCount = 0;
  let maturityAssessedDimensions = 0;

  for (const control of controls) {
    total += 1;
    const assessment = control && control.assessment;

    const status = effectiveStatus(assessment);
    if (status && Object.prototype.hasOwnProperty.call(byStatus, status)) {
      byStatus[status] += 1;
    }
    const assessedAt = effectiveAssessedAt(assessment);
    if (assessedAt != null) {
      assessedCount += 1;
    }

    if (assessment && assessment.maturity) {
      maturityControlCount += 1;
      for (const dim of MATURITY_DIMENSIONS) {
        const dimStatus = assessment.maturity[dim] && assessment.maturity[dim].status;
        if (dimStatus && dimStatus !== 'not_assessed') maturityAssessedDimensions += 1;
      }
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
  // Only meaningful for r2-shaped groups (controls carrying assessment.maturity); null for e1/i1,
  // which have no per-dimension maturity to measure depth of.
  const maturityDepthPercent = maturityControlCount === 0
    ? null
    : Math.round((100 * maturityAssessedDimensions) / (maturityControlCount * MATURITY_DIMENSIONS.length));

  return { total, byStatus, applicableTotal, compliancePercent, assessedPercent, maturityDepthPercent };
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

/**
 * Rolls a certification's per-tier rollups up into one certification-level summary for
 * the meta index card. Percentages are recomputed from the summed raw counts rather than
 * averaged across tiers -- averaging two percentages would weight a 5-control tier the
 * same as a 300-control one.
 */
function summarizeCert(certRollups) {
  const byStatus = emptyStatusCounts();
  let total = 0;
  let assessedTotal = 0;
  const tierKeys = Object.keys(certRollups || {});

  for (const tierKey of tierKeys) {
    const tier = certRollups[tierKey] || {};
    total += tier.total || 0;
    for (const status of STATUSES) {
      byStatus[status] += (tier.byStatus && tier.byStatus[status]) || 0;
    }
    // assessedPercent is a rounded percentage, so recover the raw assessed count from
    // the tier's own total rather than trying to un-round it.
    assessedTotal += Math.round(((tier.assessedPercent || 0) / 100) * (tier.total || 0));
  }

  const applicableTotal = total - byStatus.not_applicable;
  return {
    tierKeys: tierKeys.sort(),
    total,
    byStatus,
    applicableTotal,
    compliancePercent: applicableTotal === 0 ? 0 : Math.round((100 * byStatus.met) / applicableTotal),
    assessedPercent: total === 0 ? 0 : Math.round((100 * assessedTotal) / total),
  };
}

function computeCertSummaries(rollups) {
  const summaries = {};
  for (const certKey of Object.keys(rollups || {})) {
    summaries[certKey] = summarizeCert(rollups[certKey]);
  }
  return summaries;
}

// Maps a certKey to its page filename. A certKey reaches this function from state.json,
// which is local and org-controlled but still data rather than code -- so it is reduced to
// [a-z0-9-] before ever becoming a path, and a `..` or an absolute path can never escape
// targetDir. The template MUST slugify hrefs with an identical rule, or index links stop
// matching the files written here.
function certPageSlug(certKey) {
  return String(certKey).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'cert';
}

function certPageName(certKey) {
  return `cert-${certPageSlug(certKey)}.html`;
}

/**
 * The slice of state a single certification's page needs: just that certification and
 * just its interview sessions. Keeps each page's embedded data island proportional to
 * the certification it shows instead of growing with every other certification tracked.
 */
function stateForCert(state, certKey) {
  return Object.assign({}, state, {
    certifications: { [certKey]: state.certifications[certKey] },
    interviewSessions: (state.interviewSessions || []).filter((s) => s && s.certification === certKey),
  });
}

/**
 * The slice of state the meta index needs: every certification, but with the `controls`
 * and `archivedControls` maps dropped. The index shows rollups and session progress, never
 * an individual control, so shipping the full control set would bloat the entry page with
 * data nothing on it reads.
 */
function stateForIndex(state) {
  const certifications = {};
  for (const certKey of Object.keys(state.certifications || {})) {
    const cert = state.certifications[certKey] || {};
    const tiers = {};
    for (const tierKey of Object.keys(cert.tiers || {})) {
      const tier = Object.assign({}, cert.tiers[tierKey]);
      delete tier.controls;
      delete tier.archivedControls;
      tiers[tierKey] = tier;
    }
    certifications[certKey] = Object.assign({}, cert, { tiers });
  }
  return Object.assign({}, state, { certifications });
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

// The catalog of certifications this plugin supports, whether or not a given project
// tracks them yet -- the meta index renders a card for each. Resolved relative to this
// file, exactly like readTemplate(). It ships with the plugin, so a missing or malformed
// catalog is a packaging bug to fix, not a condition to render around.
function readCatalog() {
  const catalogPath = path.join(__dirname, '..', '..', 'assets', 'certifications.json');
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`render-dashboard: certification catalog not found at ${catalogPath}`);
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!Array.isArray(catalog)) {
    throw new Error(`render-dashboard: certification catalog at ${catalogPath} must be a JSON array`);
  }
  return catalog;
}

// Removes cert-*.html pages left behind by a previous render whose certification is no
// longer in state.json. Without this, deregistering a certification leaves a stale page
// that the index no longer links to but a stale bookmark still opens -- showing numbers
// that will never update again.
//
// Deletion is fail-closed on TWO conditions, not one: the filename must match, AND the file
// must actually contain this renderer's data-island marker. The target directory belongs to
// the user -- it is their gitignored project data, where they may well have saved a
// `cert-soc2-draft.html` or an exported artifact. Matching the name alone would silently
// destroy such a file on a routine dashboard regen, unrecoverably, since the directory is
// gitignored and has no history to restore from. Only delete files this renderer wrote.
function pruneStaleCertPages(targetDir, writtenNames) {
  const kept = new Set(writtenNames);
  const removed = [];
  for (const name of fs.readdirSync(targetDir)) {
    if (!/^cert-.*\.html$/.test(name) || kept.has(name)) continue;
    // The marker in a RENDERED page has the JSON payload spliced in after it, so match the
    // marker's stable prefix rather than DATA_MARKER itself (which still carries the
    // template's placeholder `null`).
    const filePath = path.join(targetDir, name);
    if (!fs.readFileSync(filePath, 'utf8').includes(DATA_MARKER_PREFIX)) continue;
    fs.unlinkSync(filePath);
    removed.push(name);
  }
  return removed;
}

/**
 * Renders <target-dir>/dashboard.html (the meta index) plus one
 * <target-dir>/cert-<certKey>.html per registered certification, from <target-dir>/state.json.
 *
 * The only mutation ever made to state.json is stamping `generatedAt` --
 * every other field is written back byte-for-byte (value-wise) unchanged. It is stamped
 * once, before any page is written, so every page agrees on when it was generated.
 */
function renderDashboard(targetDir) {
  const { statePath, state } = readState(targetDir);
  const { template } = readTemplate();
  const catalog = readCatalog();

  state.generatedAt = new Date().toISOString();

  const rollups = computeRollups(state);
  const certSummaries = computeCertSummaries(rollups);

  const indexHtml = injectData(template, {
    state: stateForIndex(state),
    rollups,
    certSummaries,
    catalog,
    view: { mode: 'index' },
  });
  fs.writeFileSync(path.join(targetDir, 'dashboard.html'), indexHtml, 'utf8');

  const certPages = {};
  const writtenNames = [];
  for (const certKey of Object.keys(state.certifications || {})) {
    const pageName = certPageName(certKey);
    if (writtenNames.includes(pageName)) {
      throw new Error(
        `render-dashboard: certification keys "${certKey}" and another key both resolve to page "${pageName}" -- rename one so each certification gets its own page`
      );
    }
    const html = injectData(template, {
      state: stateForCert(state, certKey),
      rollups: { [certKey]: rollups[certKey] },
      certSummaries,
      catalog,
      view: { mode: 'cert', certKey },
    });
    fs.writeFileSync(path.join(targetDir, pageName), html, 'utf8');
    certPages[certKey] = pageName;
    writtenNames.push(pageName);
  }

  const removed = pruneStaleCertPages(targetDir, writtenNames);
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  return { state, rollups, certSummaries, catalog, html: indexHtml, certPages, removed };
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
    const { html, certPages, removed } = renderDashboard(targetDir);
    console.log(`Wrote ${path.join(targetDir, 'dashboard.html')} (${html.length} bytes)`);
    for (const certKey of Object.keys(certPages)) {
      console.log(`Wrote ${path.join(targetDir, certPages[certKey])}`);
    }
    for (const name of removed) {
      console.log(`Removed stale ${path.join(targetDir, name)}`);
    }
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
  computeCertSummaries,
  certPageName,
  stateForCert,
  stateForIndex,
  readCatalog,
  escapeForInlineScript,
  injectData,
  renderDashboard,
};
