#!/usr/bin/env node
'use strict';

/**
 * A tripwire against copying, for the shareable import: rejects a control whose own-words
 * wording shares a run of RUN or more words with any of its mapped source cells, or whose label
 * or summary equals one. Passing it is not proof of a paraphrase; a person still reviews.
 *
 * Usage: node check-overlap.js <controls.json>   { rejections } as JSON; exit 1 when any
 * The file is { controls: [...] } or a bare array; each control carries `source`, as
 * convert-controls.js writes it. Stdlib only.
 */

const fs = require('fs');

const RUN = 8;
const CHECKED = ['topicLabel', 'topicSummary', 'domain'];
// domain is kept from the mapping, as the bundled frameworks keep the publishers' category
// names, so it is only checked for a copied run.
const EQUALITY = ['topicLabel', 'topicSummary'];

function tokens(text) {
  return String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function runs(words) {
  const out = new Set();
  for (let i = 0; i + RUN <= words.length; i++) out.add(words.slice(i, i + RUN).join(' '));
  return out;
}

function findOverlaps(controls) {
  const rejections = [];
  for (const c of controls) {
    const cells = c.source && typeof c.source === 'object' ? Object.values(c.source).map(tokens) : [];
    if (cells.length === 0) {
      rejections.push({ id: c.id, field: 'source', reason: 'no source cells to check against' });
      continue;
    }
    const sourceRuns = new Set(cells.flatMap((words) => [...runs(words)]));
    const sourceTexts = new Set(cells.map((words) => words.join(' ')).filter(Boolean));
    for (const field of CHECKED) {
      const words = tokens(c[field]);
      if ([...runs(words)].some((r) => sourceRuns.has(r))) {
        rejections.push({ id: c.id, field, reason: `shares a run of ${RUN} or more words with a source cell` });
      } else if (EQUALITY.includes(field) && words.length && sourceTexts.has(words.join(' '))) {
        rejections.push({ id: c.id, field, reason: 'equals a source cell' });
      }
    }
  }
  return rejections;
}

module.exports = { findOverlaps, tokens, RUN };

if (require.main === module) {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: node check-overlap.js <controls.json>');
    process.exit(1);
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rejections = findOverlaps(Array.isArray(data) ? data : data.controls || []);
    console.log(JSON.stringify({ rejections }, null, 2));
    process.exitCode = rejections.length ? 1 : 0;
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
