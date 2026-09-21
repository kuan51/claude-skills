'use strict';
// The hidden acceptance suite loads the project under test from LOCKSTEP_ROOT and the reference
// implementation as an oracle for the resolver's validity checks (so a wrong `satisfies` in the
// project cannot vouch for its own lockfile). It runs from this directory, never from inside a
// fixture, so the lead never sees it.
const path = require('node:path');

const root = process.env.LOCKSTEP_ROOT;
if (!root) throw new Error('LOCKSTEP_ROOT must point at the project under test');

module.exports = {
  root,
  api: require(path.join(root, 'src', 'index.js')),
  oracle: require(path.join(__dirname, '..', 'reference', 'src', 'index.js')),
};
