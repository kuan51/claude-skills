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
  has(read(PLUGIN, 'skills', 'fabflows-setup', 'SKILL.md'), ['AskUserQuestion', '.claude/fabflows.json', 'never runs `claude mcp add`', '"parent"', 'filed under a parent', 'hold child tickets', 'jira_get_issue'], 'fabflows-setup/SKILL.md');
});

test('ticket names every tool, every template label and each standing rule', () => {
  const tools = [
    'issue_read', 'issue_write', 'add_issue_comment',
    'getJiraIssue', 'createJiraIssue', 'editJiraIssue', 'getTransitionsForJiraIssue', 'transitionJiraIssue',
    'addCommentToJiraIssue', 'addOrEditJiraIssueComment',
    'get_issue', 'save_issue', 'save_comment',
    'parent_issue_number', 'parent_owner',
    'getJiraIssueRemoteIssueLinks', 'jira_create_remote_issue_link',
  ];
  const labels = ['## Why', '## Behaviour', '## Check', '## Out of scope', '## Decisions', '## Links'];
  const rules = ['## Parent', 'never re-parents', 'read the parent', '**confirmed**', 'Closes #N', 'Fixes KEY', 'carries `Refs` only', 'edited in place', '## Web link', '| Web link |', 'include: "remote_links"', '`jira_links`', 'skip steps 2 and 3', 'never after a later push', 'as a web link by hand', 'never ask for, read or use an API token', 'add the web link', 'was really created', 'go to step 3', 'rather than replacing the list', 'jira_transition_issue', 'jira_add_comment'];
  has(read(PLUGIN, 'skills', 'ticket', 'SKILL.md'), [...tools, ...labels, ...rules], 'ticket/SKILL.md');
});

test('ticket assigns the PR and the linked ticket to the MCP user', () => {
  const ticket = read(PLUGIN, 'skills', 'ticket', 'SKILL.md');
  const section = (h) => {
    const start = ticket.indexOf(h);
    assert.ok(start >= 0, `ticket/SKILL.md must have ${h}`);
    const end = ticket.indexOf('\n## ', start + h.length);
    return ticket.slice(start, end < 0 ? undefined : end);
  };
  has(section('## Permission'), ['assign the PR, and an unassigned ticket, to the signed-in user'], 'ticket/SKILL.md Permission');
  has(section('## The pull request'), [
    'get_me', 'atlassianUserInfo', 'getJiraIssue', 'issue_read', 'issue_number',
    'gh pr edit <number> --add-assignee @me', 'gh issue edit <number> --add-assignee @me',
    'assignee: { accountId', 'replaces every assignee', 'current assignee first',
    'held by someone else', 'mcp-atlassian', 'never blocks',
  ], 'ticket/SKILL.md The pull request');
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
  const needles = ['compliance.frameworks', '`soc2`', '`iso27001`', '`iec62304`', 'lowercased', 'leaves compliance off', '**None** leaves compliance off', 'typed `none`', '**None** together with any framework is refused'];
  has(read(PLUGIN, 'skills', 'fabflows-setup', 'SKILL.md'), needles, 'fabflows-setup/SKILL.md');
});

test('ticket and brainstorming carry the Compliance section and its labels', () => {
  const ticket = read(PLUGIN, 'skills', 'ticket', 'SKILL.md');
  has(ticket, [
    '## Compliance', '- Controls:', '- Change:', '- Class:', '- Traces:', 'ticket.js labels',
    'never guesses', 'never blocks', 'before `Links`', 'Decisions or Compliance;\n  then re-approve',
    '`editJiraIssue` with `fields: { labels: [...] }`',
  ], 'ticket/SKILL.md');
  has(read(PLUGIN, 'skills', 'brainstorming', 'SKILL.md'), ['Compliance section', 'show the user the refusal'], 'brainstorming/SKILL.md');
});

test('trace enriches through MCP, reports flags only and keeps the report out of the repo', () => {
  const needles = [
    'ticket.js trace', '--enrich', 'get_reviews', 'never commits', 'Write tool', 'newest tag',
    '--unshallow', 'Delete the scratch directory', 'outside the repo', 'SHA, PR, key and flags',
    'merge_commit_sha', '$HOME', 'whether or not',
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

test('0.9.0 documents the trace report and the compliance limits', () => {
  const plugin = JSON.parse(read(PLUGIN, '.claude-plugin', 'plugin.json'));
  const market = JSON.parse(read(ROOT, '.claude-plugin', 'marketplace.json')).plugins.find((p) => p.name === 'fabflows');
  const bullet = read(ROOT, 'README.md').split('\n- **').find((b) => b.startsWith('[fabflows]'));
  for (const [text, file] of [[plugin.description, 'plugin.json'], [market.description, 'marketplace.json'], [bullet, 'root README bullet']]) {
    has(text.replace(/\s+/g, ' '), ['trace report'], file);
  }
  const readme = read(PLUGIN, 'README.md');
  assert.match(readme, /^## Compliance$/m);
  const start = readme.indexOf('\n## Compliance');
  const section = readme.slice(start, readme.indexOf('\n## The build loop', start)).replace(/\s+/g, ' ');
  const limits = [
    'Labels are best-effort', 'AI authorship is detected by trailer and author name only',
    'A re-approved ticket marks earlier commits `spec-changed`', 'no proof of review quality',
  ];
  has(section, limits, 'README Compliance');
  has(read(ROOT, 'CHANGELOG.md'), ['fabflows 0.9.0'], 'CHANGELOG.md');
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
