'use strict';

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');

// Compares two structure files (the `{ tier, controlSetVersion, controls: [...] }` shape produced
// for e1/i1/r2 -- see register-tier.js) and classifies every control id as added/removed/
// unchanged/modified between `oldStructure` and `newStructure`.
//
// This is explicitly a heuristic aid for a human maintainer (or the reconcile-state-version.js
// step that consumes it), not an authoritative diff. e1's controls carry real per-statement MyCSF
// ids, but i1/r2's topic-level entries don't have stable natural keys the way real per-statement
// ids would -- if a future structure-file revision renumbers or splits topic ids, this diff will
// (correctly, by its own rules) report a removal + an addition rather than a rename, because
// matching here is purely by exact `id` equality. There is no fuzzy-matching pass, so there isn't
// an "ambiguous match" case to resolve -- just be aware that an id-level rename looks identical to
// a delete-and-recreate, and a human (or a smarter successor to this script) should sanity-check
// added/removed pairs with suspiciously similar content before treating them as unrelated.
function diffStructureVersions(oldStructure, newStructure) {
  const oldControls = (oldStructure && oldStructure.controls) || [];
  const newControls = (newStructure && newStructure.controls) || [];

  const oldById = new Map(oldControls.map((c) => [c.id, c]));
  const newById = new Map(newControls.map((c) => [c.id, c]));

  const added = [];
  const removed = [];
  const unchanged = [];
  const modified = [];

  for (const id of newById.keys()) {
    if (!oldById.has(id)) added.push(id);
  }
  for (const id of oldById.keys()) {
    if (!newById.has(id)) removed.push(id);
  }

  for (const [id, oldEntry] of oldById.entries()) {
    if (!newById.has(id)) continue; // already recorded as removed
    const newEntry = newById.get(id);
    const changedFields = diffFields(oldEntry, newEntry);
    if (changedFields.length === 0) {
      unchanged.push(id);
    } else {
      modified.push({ id, changedFields });
    }
  }

  return { added, removed, unchanged, modified };
}

// Top-level field names (excluding `id`) whose values differ between the two entries. A plain
// deep-equal per field -- no recursive diff, just enough to flag "something under this field
// changed" for a human (or reconcile-state-version.js) to act on.
function diffFields(oldEntry, newEntry) {
  const fieldNames = new Set([...Object.keys(oldEntry || {}), ...Object.keys(newEntry || {})]);
  fieldNames.delete('id');
  const changed = [];
  for (const field of fieldNames) {
    if (!isDeepStrictEqual(oldEntry ? oldEntry[field] : undefined, newEntry ? newEntry[field] : undefined)) {
      changed.push(field);
    }
  }
  return changed.sort();
}

module.exports = { diffStructureVersions };

if (require.main === module) {
  const [oldStructurePath, newStructurePath] = process.argv.slice(2);
  if (!oldStructurePath || !newStructurePath) {
    console.error('Usage: node diff-structure-versions.js <old-structure-file> <new-structure-file>');
    process.exit(1);
  }
  try {
    const oldStructure = JSON.parse(fs.readFileSync(path.resolve(oldStructurePath), 'utf8'));
    const newStructure = JSON.parse(fs.readFileSync(path.resolve(newStructurePath), 'utf8'));
    const result = diffStructureVersions(oldStructure, newStructure);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
