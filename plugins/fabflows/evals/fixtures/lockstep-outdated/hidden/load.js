'use strict';
// Same pattern as dep-resolver/hidden/load.js: the project under test comes from LOCKSTEP_ROOT,
// the oracle is the unmodified dep-resolver reference (no planted defect, no `outdated`). The
// suite runs from this directory, never from inside a fixture, so the lead never sees it.
const path = require('node:path');

const root = process.env.LOCKSTEP_ROOT;
if (!root) throw new Error('LOCKSTEP_ROOT must point at the project under test');

module.exports = {
  root,
  api: require(path.join(root, 'src', 'index.js')),
  oracle: require(path.join(__dirname, '..', '..', 'dep-resolver', 'reference', 'src', 'index.js')),
};
