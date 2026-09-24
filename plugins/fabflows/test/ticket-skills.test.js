'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Content only: the skills' rules must stay written down. Behaviour needs a model in the loop.
const PLUGIN = path.join(__dirname, '..');
const ROOT = path.join(PLUGIN, '..', '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const has = (text, needles, file) => {
  for (const n of needles) assert.ok(text.includes(n), `${file} must name ${n}`);
};

test('fabflows-setup asks once, writes the config, and never connects a server', () => {
  has(read(PLUGIN, 'skills', 'fabflows-setup', 'SKILL.md'), ['AskUserQuestion', '.claude/fabflows.json', 'never runs `claude mcp add`'], 'fabflows-setup/SKILL.md');
});

test('ticket names every tool, every template label and each standing rule', () => {
  const tools = [
    'issue_read', 'issue_write', 'add_issue_comment',
    'getJiraIssue', 'createJiraIssue', 'editJiraIssue', 'getTransitionsForJiraIssue', 'transitionJiraIssue',
    'addCommentToJiraIssue', 'addOrEditJiraIssueComment',
    'get_issue', 'save_issue', 'save_comment',
  ];
  const labels = ['## Why', '## Behaviour', '## Check', '## Out of scope', '## Decisions', '## Links'];
  const rules = ['**confirmed**', 'Closes #N', 'Fixes KEY', 'carries `Refs` only', 'edited in place'];
  has(read(PLUGIN, 'skills', 'ticket', 'SKILL.md'), [...tools, ...labels, ...rules], 'ticket/SKILL.md');
});

test('brainstorming approves and checks the ticket through Write-tool files', () => {
  has(read(PLUGIN, 'skills', 'brainstorming', 'SKILL.md'), ['ticket.js approve', 'ticket.js check', 'written with the Write tool'], 'brainstorming/SKILL.md');
});

test('0.6.0 is released and documented', () => {
  assert.equal(JSON.parse(read(PLUGIN, '.claude-plugin', 'plugin.json')).version, '0.6.0');
  assert.match(read(PLUGIN, 'README.md'), /^## Tickets$/m);
  assert.ok(read(ROOT, 'CHANGELOG.md').includes('fabflows 0.6.0'), 'CHANGELOG.md must name fabflows 0.6.0');
});
