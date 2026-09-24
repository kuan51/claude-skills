#!/usr/bin/env node
'use strict';

// fabflows ticket helper -- links a branch to its tracker ticket.
//
// CLI (the ticket skill runs these):
//   link <key> <url> <tracker>   record the ticket for the current branch
//   approve < spec               store the fingerprint and the normalized approved spec
//   check < spec                 exit 0 when the spec still matches that fingerprint
//   normalize < spec             print the text the fingerprint is taken over
//   pr <url>                     record the pull request
//   status                       print this branch's confirmed link as JSON, or exit 1
//   clear [--pr <url>]           forget this branch's link, or the link with that PR
//
// State is one file per branch, fabflows/tickets/<h>.json in the git dir, where <h> is the
// first 16 hex characters of sha256(branch); approve adds <h>.approved.md beside it.
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
// A GitHub PR or GitLab MR: no query, fragment or shell characters.
const PR_URL = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+\/(pull|-\/merge_requests)\/[0-9]+$/;
valid.pr = (v) => valid.url(v) && PR_URL.test(v);
const OPTIONAL = ['specHash', 'pr'];

function validState(s) {
  if (!s || typeof s !== 'object') return false;
  return Object.keys(valid).every((k) => (OPTIONAL.includes(k) && s[k] == null) || valid[k](s[k]));
}

// ---------------------------------------------------------------- normalize
// The text the fingerprint is taken over, and the text the user approves and the build
// gets: the ticket as written, minus HTML comments outside fences, invisible and control
// characters, and the Links section. Nothing is rendered, so nothing a renderer does can
// change it. A comment inside 4-space indented code (not fenced) is still removed.
const INVISIBLE = /[\p{Cf}︀-️\u{E0100}-\u{E01EF}]|(?![\n\t])\p{Cc}/gu;
const LINKS = /^ {0,3}(?:#{1,6}[ \t]+Links:?|\*\*Links(?::\*\*|\*\*:?))[ \t]*$/;

function normalize(text) {
  const t = String(text).replace(/\r\n/g, '\n');
  const strip = (s) => s.replace(INVISIBLE, '');
  let out = '';
  const code = []; // [start, end) of each fenced block in `out`
  let i = 0;
  let lineStart = true;
  while (i < t.length) {
    const nl = t.indexOf('\n', i);
    const lineEnd = nl < 0 ? t.length : nl + 1;
    const fence = lineStart && /^[ \t]*(`{3,}|~{3,})/.exec(t.slice(i, lineEnd));
    if (fence) {
      const [c, n] = [fence[1][0], fence[1].length];
      const close = new RegExp(`^[ \\t]*${c}{${n},}[ \\t]*$`, 'm').exec(t.slice(lineEnd));
      const end = close ? lineEnd + close.index + close[0].length : t.length; // unclosed runs to the end
      const s = strip(t.slice(i, end));
      code.push([out.length, out.length + s.length]);
      out += s;
      i = end;
      lineStart = false;
      continue;
    }
    const open = t.indexOf('<!--', i);
    if (open < 0 || open >= lineEnd) {
      out += strip(t.slice(i, lineEnd));
      i = lineEnd;
      lineStart = true;
      continue;
    }
    out += strip(t.slice(i, open));
    const shut = t.indexOf('-->', open + 4);
    i = shut < 0 ? t.length : shut + 3; // an unclosed comment removes the rest
    lineStart = false;
  }
  // Drop the Links section: from the last Links heading outside a fence to the end.
  const inCode = (o) => code.some(([s, e]) => o >= s && o < e);
  let cut = -1;
  for (let o = 0; o <= out.length; ) {
    const nl = out.indexOf('\n', o);
    const line = out.slice(o, nl < 0 ? out.length : nl);
    if (LINKS.test(line) && !inCode(o)) cut = o;
    if (nl < 0) break;
    o = nl + 1;
  }
  if (cut >= 0) out = out.slice(0, cut);
  return out.split('\n').map((l) => l.replace(/\s+$/u, '')).join('\n').replace(/\s+$/u, '');
}

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const fingerprint = (text) => 'sha256:' + sha(normalize(text));

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

const stateDir = (cwd) => path.resolve(cwd, git(['rev-parse', '--git-path', 'fabflows/tickets'], cwd));
const statePath = (cwd, branch) => path.join(stateDir(cwd), sha(branch).slice(0, 16) + '.json');
const approvedPath = (p) => p.replace(/\.json$/, '.approved.md');

function readFile(p) {
  try {
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    return validState(s) && path.basename(p) === sha(s.branch).slice(0, 16) + '.json' ? s : null;
  } catch {
    return null;
  }
}
const readState = (cwd, branch) => readFile(statePath(cwd, branch));

// Every valid state file, for a lookup by PR after the branch may be gone.
function allStates(cwd) {
  let dir, names;
  try {
    dir = stateDir(cwd);
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names.map((n) => ({ file: path.join(dir, n), s: readFile(path.join(dir, n)) })).filter((e) => e.s);
}

function writeState(cwd, s) {
  if (!validState(s)) throw new Error('invalid ticket state');
  const { key, url, tracker, branch, specHash = null, pr = null } = s;
  const p = statePath(cwd, branch);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ key, url, tracker, branch, specHash, pr }) + '\n');
}

const removeState = (file) => {
  fs.rmSync(file, { force: true });
  fs.rmSync(approvedPath(file), { force: true });
};

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
  const state = readState(cwd, branch);
  if (state) return { ...state, confirmed: true };
  const b = base(cwd);
  const log = b && tryGit(['log', '-n', '200', '--format=%(trailers:key=Refs,valueonly)%x1e', `${b}..HEAD`], cwd);
  const key = (log || '').split(/[\x1e\n]/).map((s) => s.trim()).find(valid.key);
  return key ? { key, confirmed: false } : null;
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
    const l = confirmed();
    const text = normalize(stdin());
    fs.writeFileSync(approvedPath(statePath(cwd, l.branch)), text + '\n');
    writeState(cwd, { ...state(l), specHash: 'sha256:' + sha(text) });
  } else if (cmd === 'check') {
    const l = confirmed();
    const got = fingerprint(stdin());
    if (got !== l.specHash) {
      const msg = `spec changed: approved ${l.specHash || 'none'}, now ${got}`;
      if (!l.specHash) fail(msg);
      const p = approvedPath(statePath(cwd, l.branch));
      let approved = null;
      try {
        approved = fs.readFileSync(p, 'utf8').replace(/\n$/, '');
      } catch {
        // missing: reported as tampered below
      }
      if (approved === null || 'sha256:' + sha(approved) !== l.specHash) {
        fail(`${msg}; the approved text was tampered with or is missing, so there is nothing to diff against`);
      }
      if (/[\p{Cc}\p{Cf}]/u.test(p)) fail(`${msg}; the approved text's path holds control characters`);
      fail(`${msg}; approved text: ${p}`);
    }
  } else if (cmd === 'pr') {
    if (!valid.pr(args[0])) fail('invalid pr url');
    writeState(cwd, { ...state(confirmed()), pr: args[0] });
  } else if (cmd === 'status') {
    const l = linked(cwd);
    if (!l || !l.confirmed) process.exit(1);
    process.stdout.write(JSON.stringify({ key: l.key, specHash: l.specHash, pr: l.pr }) + '\n');
  } else if (cmd === 'clear') {
    if (args[0] === '--pr') {
      if (!valid.pr(args[1])) fail('invalid pr url');
      for (const e of allStates(cwd)) if (e.s.pr === args[1]) removeState(e.file);
    } else {
      const branch = currentBranch(cwd);
      if (!branch) fail('not on a branch; use clear --pr <url>');
      removeState(statePath(cwd, branch));
    }
  } else {
    fail(`unknown subcommand ${cmd}; use link, approve, check, normalize, pr, status or clear`);
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

// What to do once a PR merged. Without a PR URL, `clear` works on the current branch only.
function afterMerge(key, pr, note = '') {
  const [what, clear] = pr ? [`PR ${pr}`, `ticket.js clear --pr '${pr}'`] : [`the PR for ${key}`, 'ticket.js clear'];
  return `If ${what} merged${note}: if it carried a closing phrase for ${key}, confirm ${key} is closed and transition it if not, then run \`${clear}\`. If it was Refs-only, leave ${key} open.`;
}

function sessionStart(cwd) {
  const l = linked(cwd);
  if (l && l.confirmed) {
    // 600: the after-merge text names the PR URL twice.
    let line = `fabflows: this branch is linked to ticket ${l.key} (${l.url}). Follow fabflows:ticket. ${afterMerge(l.key, l.pr)}`;
    if (line.length > 600) line = `fabflows: this branch is linked to ticket ${l.key}. Follow fabflows:ticket. ${afterMerge(l.key, l.pr)}`;
    if (line.length > 600) line = `fabflows: this branch is linked to ticket ${l.key}. Follow fabflows:ticket. ${afterMerge(l.key, null)}`;
    return context('SessionStart', line.slice(0, 600));
  }
  if (l && l.key) {
    return context('SessionStart', `fabflows: ticket ${l.key} found in commit trailers, not confirmed: ask the user before editing it.`);
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

const unconfirmed = (key) => ` The link to ${key} came from commit trailers and is not confirmed: ask the user before touching the ticket.`;

// The PR a merge named: { url }, { suffix } for a number, {} for none, or null for no merge.
// `gh pr merge --auto` only queues a merge, so it is none of these.
const VALUE_FLAG = /^(-[AbFtR]|--(author-email|body|body-file|match-head-commit|subject|repo))$/;
function mergeTarget(tool, ti) {
  if (isMcp(tool, 'merge')) {
    const n = String(ti.pullNumber ?? '');
    if (!/^[0-9]+$/.test(n)) return {};
    const repo = [ti.owner, ti.repo].every((v) => str(v) && /^[A-Za-z0-9_.-]+$/.test(v)) ? `/${ti.owner}/${ti.repo}` : '';
    return { suffix: `${repo}/pull/${n}` };
  }
  const cmd = str(ti.command) ? ti.command : '';
  const m = GH_PR('merge').exec(cmd);
  if (!m) return null;
  const rest = cmd.slice(m.index + m[0].length).split(/[;&|\n]/)[0];
  const tokens = (rest.match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^(["'])([\s\S]*)\1$/, '$2'));
  if (tokens.includes('--auto')) return null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (VALUE_FLAG.test(t)) i++;
    else if (t.startsWith('-')) continue;
    else if (/^#?[0-9]+$/.test(t)) return { suffix: `/pull/${t.replace('#', '')}` };
    else if (/^https?:/.test(t)) return { url: t }; // an invalid URL matches no state
    else return {}; // a branch name
  }
  return {};
}

function postToolUse(tool, ti, cwd) {
  const cmd = str(ti.command) ? ti.command : '';
  const target = mergeTarget(tool, ti);
  if (target) return mergeReminder(target, cwd);
  if (!(isMcp(tool, 'create') || PUSH.test(cmd) || GH_PR('create').test(cmd))) return;
  const l = linked(cwd);
  if (!l || !l.key) return;
  let text = `fabflows: update ticket ${l.key}: Links and status, per fabflows:ticket.`;
  if (!l.confirmed) text += unconfirmed(l.key);
  context('PostToolUse', text);
}

// Found by PR first: `gh pr merge -d` has already switched branch when this runs.
function mergeReminder(target, cwd) {
  let found;
  if (target.url) found = allStates(cwd).map((e) => e.s).filter((s) => s.pr === target.url);
  else if (target.suffix) found = allStates(cwd).map((e) => e.s).filter((s) => s.pr && s.pr.endsWith(target.suffix));
  else {
    const l = linked(cwd);
    found = l && l.key ? [l] : [];
  }
  if (found.length === 0) return;
  if (found.length > 1) {
    const keys = found.map((s) => s.key).join(', ');
    return context('PostToolUse', `fabflows: this merge matches several linked tickets (${keys}): ask the user which one merged, then follow fabflows:ticket for it.`);
  }
  const l = found[0];
  let text = `fabflows: ${afterMerge(l.key, l.pr, ' (check first: this also fires after a failed merge command)')}`;
  if (l.confirmed === false) text += unconfirmed(l.key);
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
