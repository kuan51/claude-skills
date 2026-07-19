'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { diffStructureVersions } = require('../diff-structure-versions.js');

// Synthetic "version bump" fixture -- a fictional old/new pair, not any real HITRUST release.
const OLD_STRUCTURE = {
  tier: 'e1',
  controlSetVersion: 'v11.8.0',
  controls: [
    { id: 'CTRL-A', type: 'Organizational', level: 1, relatedControlCode: '01.a', relatedControlName: 'Control A', legacyCategoryPrefix: '01' },
    { id: 'CTRL-B', type: 'System', level: 1, relatedControlCode: '02.b', relatedControlName: 'Control B', legacyCategoryPrefix: '02' },
    { id: 'CTRL-C', type: 'System', level: 1, relatedControlCode: '03.c', relatedControlName: 'Control C', legacyCategoryPrefix: '03' },
  ],
};

const NEW_STRUCTURE = {
  tier: 'e1',
  controlSetVersion: 'v99.0.0-test',
  controls: [
    { id: 'CTRL-A', type: 'Organizational', level: 1, relatedControlCode: '01.a', relatedControlName: 'Control A', legacyCategoryPrefix: '01' },
    // CTRL-B: relatedControlName changed.
    { id: 'CTRL-B', type: 'System', level: 1, relatedControlCode: '02.b', relatedControlName: 'Control B (revised)', legacyCategoryPrefix: '02' },
    // CTRL-C removed entirely.
    // CTRL-D is new.
    { id: 'CTRL-D', type: 'System', level: 1, relatedControlCode: '04.d', relatedControlName: 'Control D', legacyCategoryPrefix: '04' },
  ],
};

test('diffStructureVersions classifies added/removed/unchanged/modified ids', () => {
  const diff = diffStructureVersions(OLD_STRUCTURE, NEW_STRUCTURE);

  assert.deepEqual(diff.added, ['CTRL-D']);
  assert.deepEqual(diff.removed, ['CTRL-C']);
  assert.deepEqual(diff.unchanged, ['CTRL-A']);
  assert.equal(diff.modified.length, 1);
  assert.equal(diff.modified[0].id, 'CTRL-B');
  assert.deepEqual(diff.modified[0].changedFields, ['relatedControlName']);
});

test('diffStructureVersions: identical structures produce no added/removed/modified', () => {
  const diff = diffStructureVersions(OLD_STRUCTURE, OLD_STRUCTURE);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.modified, []);
  assert.deepEqual(diff.unchanged.sort(), ['CTRL-A', 'CTRL-B', 'CTRL-C']);
});

test('diffStructureVersions: multiple changed fields on one id are all reported', () => {
  const oldStructure = {
    controls: [{ id: 'X', level: 1, relatedControlName: 'Old Name', legacyCategoryPrefix: '01' }],
  };
  const newStructure = {
    controls: [{ id: 'X', level: 2, relatedControlName: 'New Name', legacyCategoryPrefix: '01' }],
  };
  const diff = diffStructureVersions(oldStructure, newStructure);
  assert.equal(diff.modified.length, 1);
  assert.deepEqual(diff.modified[0].changedFields, ['level', 'relatedControlName']);
});

test('diffStructureVersions: works with i1/r2-shaped fields (topicLabel/topicSummary/domain/citations) not just e1 fields', () => {
  const oldStructure = {
    controls: [
      {
        id: 'TOPIC-1',
        topicLabel: 'Access Control',
        topicSummary: 'Old summary text.',
        domain: 'Identity',
        citations: ['ref-1'],
        nonAuthoritative: true,
      },
    ],
  };
  const newStructure = {
    controls: [
      {
        id: 'TOPIC-1',
        topicLabel: 'Access Control',
        topicSummary: 'Updated summary text.',
        domain: 'Identity',
        citations: ['ref-1', 'ref-2'],
        nonAuthoritative: true,
      },
    ],
  };
  const diff = diffStructureVersions(oldStructure, newStructure);
  assert.equal(diff.modified.length, 1);
  assert.deepEqual(diff.modified[0].changedFields, ['citations', 'topicSummary']);
});

test('diffStructureVersions: empty structures produce empty results', () => {
  const diff = diffStructureVersions({ controls: [] }, { controls: [] });
  assert.deepEqual(diff, { added: [], removed: [], unchanged: [], modified: [] });
});
