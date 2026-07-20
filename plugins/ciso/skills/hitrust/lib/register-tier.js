'use strict';

const fs = require('fs');
const path = require('path');

const STRUCTURE_FILE = path.join(__dirname, '..', 'controls', 'e1.v11.8.structure.json');

function loadStructure(structureFilePath) {
  const raw = fs.readFileSync(structureFilePath || STRUCTURE_FILE, 'utf8');
  return JSON.parse(raw);
}

const R2_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];

function defaultMaturityDimension() {
  return {
    status: 'not_assessed',
    justification: null,
    inProgress: { currentState: null, estimatedCloseness: null },
    assessedAt: null,
  };
}

// Builds a control record with every field defaulted per the docs/ciso/state.json contract.
// Preserves every field already on `entry` (id/type/level/relatedControlCode/relatedControlName/
// legacyCategoryPrefix for e1; id/domain/topicLabel/topicSummary/citations/applicabilityTier/
// nonAuthoritative for i1/r2's topic-level shape) via spread, rather than enumerating a fixed
// e1-shaped field list -- this is what lets the same registration path work for both structure
// shapes without the dashboard silently losing i1/r2-specific fields. `sourceAuthority` is the
// tier's declared authority level ("structural-only" for e1, "public-topic-level" for i1/r2),
// used as this control's initial `statementSource` too (they start in lockstep; e1's per-control
// statementSource then advances independently to "imported" as export rows get matched).
// `tierKey === 'r2'` seeds a five-dimension `maturity` object (Policy/Procedure/Implemented/
// Measured/Managed, each independently assessable) instead of a flat status -- r2 is the only
// HITRUST tier that scores multiple PRISMA maturity dimensions; e1/i1 keep the flat shape since
// they are officially Implemented-only. See docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md.
function defaultControl(entry, sourceAuthority, tierKey) {
  const assessment = tierKey === 'r2'
    ? {
        status: null,
        maturity: R2_DIMENSIONS.reduce((acc, dim) => {
          acc[dim] = defaultMaturityDimension();
          return acc;
        }, {}),
      }
    : {
        status: 'not_assessed',
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: null,
      };

  return Object.assign({}, entry, {
    statementText: null,
    statementSource: sourceAuthority || 'structural-only',
    assessment,
    roadmap: {
      budgetTier: null,
      vendorResearch: [],
      recommendation: null,
      status: 'not_started',
    },
  });
}

// Sorted, deduped set of grouping keys actually present in the structure file. Prefers `domainKey`
// (the modern 19-domain numbering every current e1/i1/r2 entry carries) since a single tier can now
// mix entries that also have a `legacyCategoryPrefix` (e1's OLD legacy control-category numbering,
// e.g. "04" from relatedControlCode "04.a" -- a DIFFERENT numbering scheme than the modern domains,
// never a safe substitute for grouping) with entries that don't -- falls back to legacyCategoryPrefix
// then `domain` only for older/synthetic structures that predate domainKey. Data-driven so a future
// structure-file version needs no code change here.
function computeDomains(structure) {
  return Array.from(new Set(structure.controls.map((c) => c.domainKey || c.legacyCategoryPrefix || c.domain))).sort();
}

// Reads <stateJsonPath>, registers/merges `tierKey` from `structure` under
// state.certifications[certKey] (creating that certification entry with `certDisplayName` if it
// doesn't exist yet), and writes the result back. Safe to re-run: existing controls and an
// existing interview session are never touched, only ids missing from state get added. `certKey`
// and `certDisplayName` are both required -- there is no default, since a generic registration
// function cannot guess which certification (or its human-readable name) a caller means.
function registerTier(stateJsonPath, structure, certKey, certDisplayName) {
  if (!certKey) throw new Error('registerTier: certKey is required (e.g. "hitrust")');
  if (!certDisplayName) throw new Error('registerTier: certDisplayName is required (e.g. "HITRUST CSF")');

  const resolvedStructure = structure || loadStructure();
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));

  if (!state.certifications) state.certifications = {};
  if (!state.certifications[certKey]) {
    state.certifications[certKey] = {
      displayName: certDisplayName,
      activeTier: resolvedStructure.tier,
      tiers: {},
    };
  }
  const certEntry = state.certifications[certKey];
  if (!certEntry.tiers) certEntry.tiers = {};

  const tierKey = resolvedStructure.tier;
  let tier = certEntry.tiers[tierKey];
  const isNewTier = !tier;

  // The structure file declares its own authority level ("structural-only" for e1's real-but-
  // text-free structure, "public-topic-level" for i1/r2's researched-and-cited topic content).
  // Falls back to "structural-only" for older structure files (e.g. e1's) that predate this field.
  const tierSourceAuthority = resolvedStructure.sourceAuthority || 'structural-only';

  if (isNewTier) {
    tier = {
      controlSetVersion: resolvedStructure.controlSetVersion,
      sourceAuthority: tierSourceAuthority,
      importedFrom: null,
      importedAt: null,
      controls: {},
      archivedControls: {},
    };
    certEntry.tiers[tierKey] = tier;
  }
  if (!tier.controls) tier.controls = {};
  if (!tier.archivedControls) tier.archivedControls = {};

  let added = 0;
  for (const entry of resolvedStructure.controls) {
    if (!Object.prototype.hasOwnProperty.call(tier.controls, entry.id)) {
      tier.controls[entry.id] = defaultControl(entry, tierSourceAuthority, tierKey);
      added += 1;
    }
  }

  if (!Array.isArray(state.interviewSessions)) state.interviewSessions = [];
  const hasSession = state.interviewSessions.some(
    (s) => s.certification === certKey && s.tier === tierKey
  );
  if (!hasSession) {
    const now = new Date().toISOString();
    state.interviewSessions.push({
      certification: certKey,
      tier: tierKey,
      startedAt: now,
      lastUpdatedAt: now,
      domainsCompleted: [],
      domainsRemaining: computeDomains(resolvedStructure),
      status: 'in_progress',
    });
  }

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return { tier: tierKey, added, totalControls: Object.keys(tier.controls).length, isNewTier };
}

// Resolves the CLI's optional second argument to a structure file path. Accepts either a bare
// tier name ("e1", "i1", "r2" -- looked up as controls/<tier>.v11.8.structure.json alongside this
// script's bundled controls/ directory) or a full/relative path to a structure JSON file directly
// (so a maintainer testing a not-yet-bundled structure file, e.g. during a version-upgrade
// rehearsal, doesn't need to place it under controls/ first). Defaults to e1 for backward
// compatibility with existing callers that only ever pass <target-dir>.
function resolveStructurePath(tierArg) {
  if (!tierArg) return STRUCTURE_FILE;
  if (/^(e1|i1|r2)$/.test(tierArg)) {
    return path.join(__dirname, '..', 'controls', `${tierArg}.v11.8.structure.json`);
  }
  return path.resolve(tierArg);
}

module.exports = { registerTier, defaultControl, computeDomains, loadStructure, resolveStructurePath, STRUCTURE_FILE };

if (require.main === module) {
  const [targetDir, certKey, certDisplayName, tierArg] = process.argv.slice(2);
  if (!targetDir || !certKey || !certDisplayName) {
    console.error('Usage: node register-tier.js <target-dir> <certKey> <certDisplayName> [<tier: e1|i1|r2, or a structure-file path>]');
    process.exit(1);
  }
  const stateJsonPath = path.join(targetDir, 'state.json');
  if (!fs.existsSync(stateJsonPath)) {
    console.error(`No state.json found at ${stateJsonPath} -- run ciso:init first.`);
    process.exit(1);
  }
  const structurePath = resolveStructurePath(tierArg);
  if (!fs.existsSync(structurePath)) {
    console.error(`No structure file found at ${structurePath}`);
    process.exit(1);
  }
  try {
    const result = registerTier(stateJsonPath, loadStructure(structurePath), certKey, certDisplayName);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
