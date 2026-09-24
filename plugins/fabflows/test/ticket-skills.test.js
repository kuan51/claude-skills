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

test('brainstorming and ticket show the user raw ticket text', () => {
  const review = ['raw diff', 'description only', 'diff -u', 'did not write', 'full raw'];
  const brainstorming = read(PLUGIN, 'skills', 'brainstorming', 'SKILL.md');
  has(brainstorming, [...review, 'ticket.js status'], 'brainstorming/SKILL.md');
  const ticket = read(PLUGIN, 'skills', 'ticket', 'SKILL.md');
  has(ticket, review, 'ticket/SKILL.md');
  const afterMerge = ticket.slice(ticket.indexOf('After a PR merges'));
  has(afterMerge, ['Refs-only', 'clear --pr'], 'ticket/SKILL.md after-merge paragraph');
});

test('fabflows-setup asks for compliance frameworks', () => {
  const needles = ['compliance.frameworks', '`soc2`', '`iso27001`', '`iec62304`', 'lowercased', 'leaves compliance off'];
  has(read(PLUGIN, 'skills', 'fabflows-setup', 'SKILL.md'), needles, 'fabflows-setup/SKILL.md');
});

test('ticket and brainstorming carry the Compliance section and its labels', () => {
  const ticket = read(PLUGIN, 'skills', 'ticket', 'SKILL.md');
  has(ticket, [
    '## Compliance', '- Controls:', '- Change:', '- Class:', '- Traces:', 'ticket.js labels',
    'never guesses', 'never blocks', 'before `Links`', 'Decisions or Compliance;\n  then re-approve',
  ], 'ticket/SKILL.md');
  has(read(PLUGIN, 'skills', 'brainstorming', 'SKILL.md'), ['Compliance section', 'show the user the refusal'], 'brainstorming/SKILL.md');
});

test('trace enriches through MCP, reports flags only and keeps the report out of the repo', () => {
  const needles = [
    'ticket.js trace', '--enrich', 'get_reviews', 'never commits', 'Write tool', 'newest tag',
    '--unshallow', 'Delete the scratch directory', 'outside the repo', 'SHA, PR, key and flags',
  ];
  has(read(PLUGIN, 'skills', 'trace', 'SKILL.md'), needles, 'trace/SKILL.md');
});

test('no skill or README names the old single state file', () => {
  const files = [
    ['README.md'],
    ...fs.readdirSync(path.join(PLUGIN, 'skills')).map((d) => ['skills', d, 'SKILL.md']),
  ];
  for (const f of files) {
    const text = read(PLUGIN, ...f);
    assert.ok(!/fabflows\/ticket(?!s)/.test(text), `${f.join('/')} names fabflows/ticket`);
  }
});

test('the README names the ticket hook, the ticket skills and raw review', () => {
  const readme = read(PLUGIN, 'README.md');
  const warning = readme.slice(0, readme.indexOf('## The problem'));
  has(warning, ['ticket.js'], 'README hook warning');
  const included = readme.slice(readme.indexOf("## What's included"), readme.indexOf('## Brainstorming'));
  has(included, ['`fabflows-setup`', '`ticket`'], "README What's included");
  const tickets = readme.slice(readme.indexOf('## Tickets'), readme.indexOf('\n## ', readme.indexOf('## Tickets') + 1));
  has(tickets, ['raw diff', 'per-branch', 'unclosed `<!--`', 'refuses', 'worktree'], 'README Tickets');
});

test('the current version is documented', () => {
  const { version } = JSON.parse(read(PLUGIN, '.claude-plugin', 'plugin.json'));
  assert.match(read(PLUGIN, 'README.md'), /^## Tickets$/m);
  const log = read(ROOT, 'CHANGELOG.md');
  assert.ok(log.includes(`fabflows ${version}`), `CHANGELOG.md must name fabflows ${version}`);
  // The tickets entry, whichever release is current: a later bump adds its own entry.
  const start = log.indexOf('specs can live in the tracker ticket');
  assert.ok(start >= 0, 'CHANGELOG.md must describe the tickets release');
  const entry = log.slice(start, log.indexOf('\n- **', start));
  has(entry, ['raw', 'per-branch'], 'CHANGELOG.md tickets entry');
});
