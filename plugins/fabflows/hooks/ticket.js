#!/usr/bin/env node
'use strict';

// fabflows ticket helper -- links a branch to its tracker ticket.
//
// CLI (the ticket skill runs these):
//   link <key> <url> <tracker>   record the ticket for the current branch
//   approve < spec               store the fingerprint of the approved spec
//   check < spec                 exit 0 when the spec still matches that fingerprint
//   normalize < spec             print the text the fingerprint is taken over
//   pr <url>                     record the pull request
//   clear                        forget the link
//
// Every value is validated on every read and write: the state file, commit trailers and
// the git dir can hold any text, and what this prints reaches Claude's context.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// ---------------------------------------------------------------- validation
const KEY = [/^[A-Z][A-Z0-9]*-[0-9]+$/, /^([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*)?#[0-9]+$/];
const str = (v) => typeof v === 'string';
const valid = {
  key: (v) => str(v) && KEY.some((re) => re.test(v)),
  url: (v) => str(v) && v.startsWith('https://') && v.length <= 300 && !/[\s'\p{Cc}]/u.test(v),
  tracker: (v) => str(v) && /^[a-z][a-z0-9-]{0,30}$/.test(v),
  branch: (v) => str(v) && /^[A-Za-z0-9._/-]{1,200}$/.test(v),
  specHash: (v) => str(v) && /^sha256:[0-9a-f]{64}$/.test(v),
};
valid.pr = valid.url;
const OPTIONAL = ['specHash', 'pr'];

function validState(s) {
  if (!s || typeof s !== 'object') return false;
  return Object.keys(valid).every((k) => (OPTIONAL.includes(k) && s[k] == null) || valid[k](s[k]));
}

// ---------------------------------------------------------------- normalize
// Split into code (fenced blocks, inline spans) and prose, left to right, so a comment
// that opens first swallows backticks and a code span that opens first keeps `<!--`.
function split(t) {
  const parts = [];
  let buf = '';
  const code = (s) => {
    if (buf) parts.push({ code: false, s: buf });
    buf = '';
    parts.push({ code: true, s });
  };
  let i = 0;
  while (i < t.length) {
    if (i === 0 || t[i - 1] === '\n') {
      const nl = t.indexOf('\n', i);
      const lineEnd = nl < 0 ? t.length : nl + 1;
      const m = /^ {0,3}(`{3,}|~{3,})([^\n]*)/.exec(t.slice(i, lineEnd));
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) {
        const close = new RegExp(`^ {0,3}${m[1][0]}{${m[1].length},}[ \\t]*$`, 'm').exec(t.slice(lineEnd));
        const end = close ? lineEnd + close.index + close[0].length : t.length; // unclosed runs to the end
        code(t.slice(i, end));
        i = end;
        continue;
      }
    }
    if (t.startsWith('<!--', i)) {
      const e = t.indexOf('-->', i + 4);
      const end = e < 0 ? t.length : e + 3;
      buf += t.slice(i, end);
      i = end;
      continue;
    }
    if (t[i] === '`') {
      let n = 1;
      while (t[i + n] === '`') n++;
      const close = new RegExp(`(?<!\`)\`{${n}}(?!\`)`, 'g');
      close.lastIndex = i + n;
      const m = close.exec(t);
      // A span never crosses a blank line: that ends the paragraph.
      if (m && !/\n[ \t]*\n/.test(t.slice(i + n, m.index))) {
        code(t.slice(i, m.index + n));
        i = m.index + n;
      } else {
        buf += t.slice(i, i + n);
        i += n;
      }
      continue;
    }
    buf += t[i++];
  }
  if (buf) parts.push({ code: false, s: buf });
  return parts;
}

const TITLE = String.raw`(?:"[^"]*"|'[^']*'|\([^)]*\))`;
const DEST = String.raw`(?:<[^>\n]*>|[^\s()]+)`;
const LABEL = String.raw`\[((?:[^\]\\]|\\.)+)\]:`;
const DEF_TITLE = new RegExp(String.raw`^( {0,3}${LABEL}[ \t]*\n?[ \t]*${DEST})[ \t]*\n?[ \t]*${TITLE}[ \t]*$`, 'gm');
const DEF = new RegExp(String.raw`^ {0,3}${LABEL}[ \t]*\n?[ \t]*${DEST}[ \t]*(?:\n|$)`, 'gm');
const labelOf = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function decode(_, hex, dec) {
  const n = hex ? parseInt(hex, 16) : parseInt(dec, 10);
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '�';
}

function prose(s) {
  return s
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?\/?>/g, '')
    .replace(/!\[[^\]]*\]\(/g, '![](')
    .replace(new RegExp(String.raw`(\]\(\s*${DEST})\s+${TITLE}\s*\)`, 'g'), '$1)')
    .replace(DEF_TITLE, '$1');
}

function normalize(text) {
  const parts = split(String(text).replace(/\r\n/g, '\n')).map((p) => (p.code ? p : { code: false, s: prose(p.s) }));
  // A definition is used when its label appears in brackets anywhere else in the prose.
  const refs = parts.filter((p) => !p.code).map((p) => p.s.replace(DEF, '\n')).join('\n').toLowerCase();
  const used = (label) => refs.includes(`[${labelOf(label)}]`);
  // Entities are decoded last, so a decoded character is never read as markup.
  const entities = (s) => s.replace(/&#(?:[xX]([0-9a-fA-F]{1,6})|([0-9]{1,7}));/g, decode);
  let out = parts.map((p) => (p.code ? p.s : entities(p.s.replace(DEF, (m, label) => (used(label) ? m : ''))))).join('');
  out = out.replace(/[\p{Cf}\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, '').replace(/\[[xX]\]/g, '[ ]');
  const lines = out.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*(#{1,6}\s*)?(\*\*)?Links\b/.test(lines[i])) {
      lines.length = i;
      break;
    }
  }
  return lines.map((l) => l.replace(/\s+$/u, '')).join('\n').replace(/\s+$/u, '');
}

const fingerprint = (text) => 'sha256:' + crypto.createHash('sha256').update(normalize(text), 'utf8').digest('hex');

// ---------------------------------------------------------------- git and state
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
const tryGit = (args, cwd) => {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
};

function currentBranch(cwd) {
  const b = tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return b && b !== 'HEAD' && valid.branch(b) ? b : null;
}

const statePath = (cwd) => path.resolve(cwd, git(['rev-parse', '--git-path', 'fabflows/ticket'], cwd));

function readState(cwd) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(cwd), 'utf8'));
    return validState(s) ? s : null;
  } catch {
    return null;
  }
}

function writeState(cwd, s) {
  if (!validState(s)) throw new Error('invalid ticket state');
  const { key, url, tracker, branch, specHash = null, pr = null } = s;
  const p = statePath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ key, url, tracker, branch, specHash, pr }) + '\n');
}

// Same base as guard.js: origin/HEAD, else main or master.
function base(cwd) {
  for (const b of ['origin/HEAD', 'main', 'master']) {
    if (tryGit(['rev-parse', '--verify', '-q', b + '^{commit}'], cwd)) return b;
  }
  return null;
}

// Linked: a valid state file for this branch (confirmed), else the newest valid `Refs:`
// trailer on this branch (unconfirmed, never written back).
function linked(cwd) {
  const branch = currentBranch(cwd);
  if (!branch) return null;
  const state = readState(cwd);
  if (state && state.branch === branch) return { ...state, confirmed: true };
  const b = base(cwd);
  const log = b && tryGit(['log', '-n', '200', '--format=%(trailers:key=Refs,valueonly)%x1e', `${b}..HEAD`], cwd);
  const key = (log || '').split(/[\x1e\n]/).map((s) => s.trim()).find(valid.key);
  if (key) return { key, confirmed: false };
  return state ? { otherBranch: state, branch } : null;
}

// ---------------------------------------------------------------- CLI
function cli(cmd, args) {
  const cwd = process.cwd();
  const fail = (msg) => {
    process.stderr.write(`ticket.js: ${msg}\n`);
    process.exit(1);
  };
  const stdin = () => fs.readFileSync(0, 'utf8');
  const confirmed = () => {
    const l = linked(cwd);
    if (!l || !l.confirmed) fail('this branch has no confirmed ticket link; run link first');
    return l;
  };
  const state = ({ key, url, tracker, branch, specHash, pr }) => ({ key, url, tracker, branch, specHash, pr });

  if (cmd === 'normalize') {
    process.stdout.write(normalize(stdin()) + '\n');
  } else if (cmd === 'link') {
    const [key, url, tracker] = args;
    const branch = currentBranch(cwd);
    const s = { key, url, tracker, branch, specHash: null, pr: null };
    for (const k of ['key', 'url', 'tracker', 'branch']) if (!valid[k](s[k])) fail(`invalid ${k}`);
    writeState(cwd, s);
  } else if (cmd === 'approve') {
    writeState(cwd, { ...state(confirmed()), specHash: fingerprint(stdin()) });
  } else if (cmd === 'check') {
    const l = confirmed();
    const got = fingerprint(stdin());
    if (got !== l.specHash) fail(`spec changed: approved ${l.specHash || 'none'}, now ${got}`);
  } else if (cmd === 'pr') {
    if (!valid.pr(args[0])) fail('invalid pr url');
    writeState(cwd, { ...state(confirmed()), pr: args[0] });
  } else if (cmd === 'clear') {
    fs.rmSync(statePath(cwd), { force: true });
  } else {
    fail(`unknown subcommand ${cmd}; use link, approve, check, normalize, pr or clear`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- hooks
// Like guard.js: JSON output, always exit 0, and fail open on anything unexpected.
const emit = (hookEventName, extra) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, ...extra } }));
const context = (event, text) => emit(event, { additionalContext: text });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The key must stand alone: `Refs: ABC-12` is not ABC-1, and `#70` or `x/y#7` is not #7.
const hasKey = (text, prefix, key) =>
  new RegExp(`${esc(prefix)}(?<![A-Za-z0-9/#-])${esc(key)}(?![A-Za-z0-9-])`).test(text);

const GIT = String.raw`(?:^|[\s;&|(])git(?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+))*\s+`;
const COMMIT = new RegExp(GIT + String.raw`commit\b`);
const PUSH = new RegExp(GIT + String.raw`push\b`);
const INLINE_MSG = /\s(?:-[a-zA-Z]*m|--message)(?:[\s="']|$)|\s(?:-F\s*-|--file[=\s]-)(?:\s|$)/;
const GH_PR = (verb) => new RegExp(String.raw`(?:^|[\s;&|(])gh\s+pr\s+${verb}\b`);
const TITLE_ARG = /\s(?:--title|-t)(?:\s+|=)("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/;
const isMcp = (tool, verb) => new RegExp(`^mcp__.*${verb}_pull_request$`).test(tool);

function sessionStart(cwd) {
  const l = linked(cwd);
  if (l && l.confirmed) {
    const tail = '. Follow fabflows:ticket; if the PR merged, close the ticket and run `ticket.js clear`.';
    const pr = l.pr ? `, PR ${l.pr}` : '';
    let line = `fabflows: this branch is linked to ticket ${l.key} (${l.url})${pr}${tail}`;
    if (line.length > 300) line = `fabflows: this branch is linked to ticket ${l.key}${tail}`;
    return context('SessionStart', line.slice(0, 300));
  }
  if (l && l.key) {
    return context('SessionStart', `fabflows: ticket ${l.key} found in commit trailers, not confirmed: ask the user before editing it.`);
  }
  if (l && l.otherBranch) {
    return context(
      'SessionStart',
      `fabflows: the ticket link (${l.otherBranch.key}) is for branch ${l.otherBranch.branch}, not ${l.branch}; this branch has no linked ticket.`
    );
  }
  const branch = currentBranch(cwd);
  const top = branch && tryGit(['rev-parse', '--show-toplevel'], cwd);
  if (!top) return;
  let cfg = null;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(top, '.claude', 'fabflows.json'), 'utf8'));
  } catch {
    return;
  }
  const def = tryGit(['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], cwd);
  const defaults = def ? [def.replace(/^origin\//, '')] : ['main', 'master'];
  if (cfg && typeof cfg.tracker === 'string' && cfg.tracker && !defaults.includes(branch)) {
    context(
      'SessionStart',
      'fabflows: this repository tracks work in a ticket tracker (.claude/fabflows.json), but this branch has no linked ticket. Follow fabflows:ticket to link one before building.'
    );
  }
}

function preToolUse(tool, ti, cwd) {
  const deny = (reason) => emit('PreToolUse', { permissionDecision: 'deny', permissionDecisionReason: reason });
  if (isMcp(tool, 'create')) {
    const l = linked(cwd);
    if (l && l.key && !(str(ti.title) && hasKey(ti.title, '', l.key))) {
      deny(`fabflows: this branch is linked to ticket ${l.key}; put ${l.key} in the pull request title.`);
    }
    return;
  }
  if (!str(ti.command)) return;
  const cmd = ti.command;
  const commit = COMMIT.exec(cmd);
  if (commit && INLINE_MSG.test(cmd.slice(commit.index))) {
    const l = linked(cwd);
    if (!l || !l.key) return;
    const need = [['Refs: ', l.key]];
    if (l.specHash) need.push(['Spec: ', l.specHash]);
    if (need.every(([p, v]) => hasKey(cmd, p, v))) return;
    return deny(
      `fabflows: this branch is linked to ticket ${l.key}. Put these lines in the commit message's last paragraph, next to any Co-Authored-By trailer:\n${need.map(([p, v]) => p + v).join('\n')}`
    );
  }
  const pr = GH_PR('create').exec(cmd);
  if (pr) {
    const title = TITLE_ARG.exec(cmd.slice(pr.index));
    const l = title && linked(cwd);
    if (l && l.key && !hasKey(title[1], '', l.key)) {
      deny(`fabflows: this branch is linked to ticket ${l.key}; put ${l.key} in the pull request title (--title).`);
    }
  }
}

function postToolUse(tool, ti, cwd) {
  const cmd = str(ti.command) ? ti.command : '';
  const merged = isMcp(tool, 'merge') || GH_PR('merge').test(cmd);
  const pushed = isMcp(tool, 'create') || PUSH.test(cmd) || GH_PR('create').test(cmd);
  if (!merged && !pushed) return;
  const l = linked(cwd);
  if (!l || !l.key) return;
  let text = merged
    ? `fabflows: PR merged: confirm ${l.key} is closed, transition it if not, then run \`ticket.js clear\`.`
    : `fabflows: update ticket ${l.key}: Links and status, per fabflows:ticket.`;
  if (!l.confirmed) text += ` The link to ${l.key} came from commit trailers and is not confirmed: ask the user before touching the ticket.`;
  context('PostToolUse', text);
}

function hook() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const cwd = input.cwd || process.cwd();
  const ti = input.tool_input || {};
  if (input.hook_event_name === 'SessionStart') sessionStart(cwd);
  else if (input.hook_event_name === 'PreToolUse') preToolUse(input.tool_name, ti, cwd);
  else if (input.hook_event_name === 'PostToolUse') postToolUse(input.tool_name, ti, cwd);
}

module.exports = { normalize, fingerprint, valid };

if (require.main === module) {
  if (process.argv[2]) {
    try {
      cli(process.argv[2], process.argv.slice(3));
    } catch (e) {
      process.stderr.write(`ticket.js: ${e.message}\n`);
      process.exit(1);
    }
  }
  try {
    hook();
  } catch {
    // Fail open, like guard.js.
  }
  process.exit(0);
}
