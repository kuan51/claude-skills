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
// State is one file per branch, fabflows/tickets/<h>.json in the common git dir, where <h> is
// the first 16 hex characters of sha256(branch); approve adds <h>.approved.md beside it.
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
  branch: (v) => str(v) && [...v].length <= 200 && /^[^-]/.test(v) && !/[\s\p{Cc}\p{Cf}~^:?*[\\]/u.test(v),
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
// change it. A `<!--` inside an inline code span on its line is text. A comment inside
// 4-space indented code (not fenced) is still removed.
const INVISIBLE = /[\p{Cf}\uFE00-\uFE0F\u{E0100}-\u{E01EF}]|(?![\n\t])\p{Cc}/gu;
const LINKS = /^ {0,3}(?:#{1,6}[ \t]+Links:?|\*\*Links(?::\*\*|\*\*:?))[ \t]*$/;

// Inline code spans on t[from, to): a run of N backticks closed by the next run of exactly N.
function codeSpans(t, from, to) {
  const runs = [...t.slice(from, to).matchAll(/`+/g)].map((m) => [from + m.index, m[0].length]);
  const next = []; // the next run of the same length, found right to left so this stays linear
  const seen = new Map();
  for (let a = runs.length - 1; a >= 0; a--) {
    next[a] = seen.get(runs[a][1]);
    seen.set(runs[a][1], a);
  }
  const spans = [];
  for (let a = 0; a < runs.length; a++) {
    const b = next[a];
    if (b === undefined) continue;
    spans.push([runs[a][0], runs[b][0] + runs[b][1]]);
    a = b;
  }
  return spans;
}

// { text, unclosedAt }: unclosedAt is the line of a `<!--` that never closes, which removes
// everything after it, as a renderer hides it; approve refuses such text.
function normalizeInfo(text) {
  const t = String(text).replace(/\r\n/g, '\n');
  const strip = (s) => s.replace(INVISIBLE, '');
  let out = '';
  const code = []; // [start, end) of each fenced block in `out`
  let i = 0;
  let lineStart = true;
  let open = -1; // the next `<!--` at or after i, found once: searching per line is quadratic
  let spans = [], spansEnd = -1, sp = 0; // this line's code spans, and the first not yet passed
  let unclosedAt = null;
  while (i < t.length) {
    const nl = t.indexOf('\n', i);
    const lineEnd = nl < 0 ? t.length : nl + 1;
    const fence = lineStart && /^[ \t]*(`{3,}|~{3,})/.exec(t.slice(i, lineEnd));
    if (fence) {
      const [c, n] = [fence[1][0], fence[1].length];
      // Lines split on \n only: an `m`-flag regex would also break at a lone \r, U+2028 or U+2029.
      const closer = new RegExp(`^[ \\t]*${c}{${n},}[ \\t]*$`);
      let end = t.length; // unclosed runs to the end
      for (let j = lineEnd; j < t.length; ) {
        const k = t.indexOf('\n', j);
        const stop = k < 0 ? t.length : k;
        if (closer.test(t.slice(j, stop))) {
          end = stop;
          break;
        }
        j = stop + 1;
      }
      const s = strip(t.slice(i, end));
      code.push([out.length, out.length + s.length]);
      out += s;
      i = end;
      lineStart = false;
      continue;
    }
    if (open < i) {
      open = t.indexOf('<!--', i);
      if (open < 0) open = Infinity;
    }
    if (open < lineEnd && spansEnd !== lineEnd) [spans, spansEnd, sp] = [codeSpans(t, i, lineEnd), lineEnd, 0];
    while (open < lineEnd) {
      while (sp < spans.length && spans[sp][1] <= open) sp++;
      if (sp === spans.length || spans[sp][0] > open) break;
      open = t.indexOf('<!--', spans[sp][1]); // this one is code
      if (open < 0) open = Infinity;
    }
    if (open >= lineEnd) {
      out += strip(t.slice(i, lineEnd));
      i = lineEnd;
      lineStart = true;
      continue;
    }
    out += strip(t.slice(i, open));
    const shut = t.indexOf('-->', open + 4);
    if (shut < 0) unclosedAt = (t.slice(0, open).match(/\n/g) || []).length + 1;
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
  return { text: out.split('\n').map((l) => l.trimEnd()).join('\n').trimEnd(), unclosedAt };
}
const normalize = (text) => normalizeInfo(text).text;
const unclosed = (line) => `line ${line}: a <!-- is never closed, so it removes everything after it; close it with --> or put it in code`;

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

// The common git dir, so every worktree sees the same links: git checks a branch out in one
// worktree at a time, so branch-keyed files never collide.
const stateDir = (cwd) => path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd), 'fabflows', 'tickets');
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

// The base for trailer recovery: origin/HEAD, else origin/main or origin/master, else a
// local main or master.
function base(cwd) {
  for (const b of ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master']) {
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
    const { text, unclosedAt } = normalizeInfo(stdin());
    if (unclosedAt) process.stderr.write(`ticket.js: warning: ${unclosed(unclosedAt)}\n`);
    process.stdout.write(text + '\n');
  } else if (cmd === 'link') {
    const [key, url, tracker] = args;
    const branch = currentBranch(cwd);
    const s = { key, url, tracker, branch, specHash: null, pr: null };
    for (const k of ['key', 'url', 'tracker', 'branch']) if (!valid[k](s[k])) fail(`invalid ${k}`);
    writeState(cwd, s);
  } else if (cmd === 'approve') {
    const l = confirmed();
    const { text, unclosedAt } = normalizeInfo(stdin());
    if (unclosedAt) fail(`${unclosed(unclosedAt)}, then ask the user to approve again`);
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

// ---------------------------------------------------------------- shell
// The simple commands a shell line runs, split at unquoted && || ; | &, newlines and
// parentheses. Each is { text, words }: text is its source plus the body of any heredoc it
// opened, words its arguments with quotes removed. It knows quotes, \ escapes, $(...),
// backticks and heredocs at any depth, and the commands inside $(...) and backticks are
// listed too; not aliases, eval, functions, here-strings, case patterns or # comments.
// Returns null when quotes or parentheses don't balance.
function commands(s, level = 0) {
  const out = [];
  const docs = []; // heredocs whose bodies start after the next newline
  const stack = []; // open nested contexts: '"', or '(' for $( and the parentheses inside it
  const subs = []; // [from, to) of each outermost $(...) or backtick body, read again at the end
  let cur, from, word, open, sub;
  let depth = 0; // top-level subshell parentheses
  let parens = 0; // '(' entries on the stack
  const begin = (at) => {
    cur = { text: '', words: [] };
    out.push(cur);
    [from, word] = [at, null];
  };
  const add = (w) => (word = (word ?? '') + w);
  const end = (at) => {
    if (word !== null) cur.words.push(word);
    word = null;
    cur.text = s.slice(from, at).trim() + cur.text;
  };
  // Skip heredoc bodies from p, just after a newline. A top-level heredoc's body joins the
  // text of the command that opened it; a nested one is already inside its text.
  const bodies = (p) => {
    for (const d of docs.splice(0)) {
      const b = p;
      for (;;) {
        const nl = s.indexOf('\n', p);
        const stop = nl < 0 ? s.length : nl;
        const line = s.slice(p, stop);
        p = stop + 1;
        if ((d.dash ? line.replace(/^\t+/, '') : line) === d.word || nl < 0) {
          if (d.cmd) d.cmd.text += '\n' + s.slice(b, stop);
          break;
        }
      }
    }
    return Math.min(p, s.length);
  };
  // The index of the backtick closing the one at i, or -1.
  const tick = (i) => {
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] === '\\') j++;
      else if (s[j] === '`') return j;
    }
    return -1;
  };
  begin(0);
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    const top = stack.length === 0;
    const inner = stack[stack.length - 1];
    if (c === '\\') {
      if (top && s[i + 1] !== '\n') add(s[i + 1] ?? '');
      i += 2;
    } else if (c === '`') {
      const j = tick(i);
      if (j < 0) return null;
      if (!parens) subs.push([i + 1, j]);
      if (top) add(s.slice(i, j + 1));
      i = j + 1;
    } else if (inner === '"') {
      if (c === '"') stack.pop();
      else if (s.startsWith('$(', i)) {
        if (!parens++) sub = i + 2;
        stack.push('(');
        i++;
      }
      i++;
    } else if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) return null;
      if (top) add(s.slice(i + 1, j));
      i = j + 1;
    } else if (c === '"') {
      if (top) open = i;
      stack.push('"');
      i++;
    } else if (s.startsWith('$(', i)) {
      if (top) open = i;
      if (!parens++) sub = i + 2;
      stack.push('(');
      i += 2;
    } else if (s.startsWith('<<<', i)) {
      if (top) add('<<<');
      i += 3;
    } else if (s.startsWith('<<', i)) {
      const m = /^<<(-?)[ \t]*([^\s;&|()<>]+)/.exec(s.slice(i, i + 300));
      if (!m) return null;
      docs.push({ dash: m[1] === '-', word: m[2].replace(/['"\\]/g, ''), cmd: top ? cur : null });
      i += m[0].length;
    } else if (c === '\n') {
      if (top) end(i);
      i = bodies(i + 1);
      if (top) begin(i);
    } else if (!top) {
      if (c === '(') {
        parens++;
        stack.push('(');
      } else if (c === ')') {
        stack.pop();
        if (!--parens) subs.push([sub, i]);
      }
      i++;
    } else if (c === ' ' || c === '\t') {
      if (word !== null) cur.words.push(word);
      word = null;
      i++;
    } else if (/[;&|()]/.test(c) && !(c === '&' && (/[<>]/.test(s[i - 1]) || s[i + 1] === '>'))) {
      depth += c === '(' ? 1 : c === ')' ? -1 : 0;
      if (depth < 0) return null;
      end(i);
      begin(++i);
    } else {
      add(c);
      i++;
    }
    if (!top && stack.length === 0) {
      const piece = s.slice(open, i);
      add(piece[0] === '"' ? piece.slice(1, -1).replace(/\\([\\"$`\n])/g, (_, ch) => (ch === '\n' ? '' : ch)) : piece);
    }
  }
  if (stack.length || depth) return null;
  end(s.length);
  if (level < 8) for (const [a, b] of subs) for (const c of commands(s.slice(a, b), level + 1) || []) out.push(c);
  return out.filter((x) => x.text);
}

// When commands() can't parse a line, it is one command with words split on spaces.
const split = (cmd) =>
  commands(cmd) || [{ text: cmd, words: (cmd.match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^(["'])([\s\S]*)\1$/, '$2')) }];

// ---------------------------------------------------------------- hooks
// Like guard.js: JSON output, always exit 0, and fail open on anything unexpected.
const emit = (hookEventName, extra) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, ...extra } }));
const context = (event, text) => emit(event, { additionalContext: text });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The key must stand alone: `Refs: ABC-12` is not ABC-1, and `#70` or `x/y#7` is not #7.
const hasKey = (text, prefix, key) =>
  new RegExp(`${esc(prefix)}(?<![A-Za-z0-9/#-])${esc(key)}(?![A-Za-z0-9-])`).test(text);
// A trailer stands on its own line of the message: in the command it starts at a line start,
// after a quote or after `-m `, and ends at a line end or a quote. The label is
// case-insensitive; the value is exact. A trailer nested in another quoted string still passes.
const anyCase = (s) => s.replace(/[A-Za-z]/g, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const hasTrailer = (text, label, value) =>
  new RegExp(`(?:^|["']|-m )[ \\t]*${anyCase(label)}:[ \\t]*${esc(value)}[ \\t]*(?=$|["'])`, 'm').test(text);

// git by name or path, then any global options (`-C d`, `-c k=v`, `--git-dir=x`, `-P`).
const ARG = String.raw`(?:"[^"]*"|'[^']*'|\S+)`;
const GIT = String.raw`(?:^|[\s;&|(])(?:[^\s;&|()]*[/\\])?git(?:\.exe)?(?:\s+(?:-[Cc]\s+${ARG}|--[A-Za-z-]+(?:=${ARG})?|-[A-Za-z](?=\s)))*\s+`;
const COMMIT = new RegExp(GIT + String.raw`commit\b`);
const PUSH = new RegExp(GIT + String.raw`push\b`);
const INLINE_MSG = /\s(?:-[a-zA-Z]*m|--message)(?:[\s="']|$)|\s(?:-F\s*-|--file[=\s]-)(?:\s|$)/;
// The arguments after `gh pr <verb>` in a command's words, or null.
function ghArgs(words, verb) {
  const k = words.findIndex((w, j) => /(^|[/\\])gh(\.exe)?$/.test(w) && words[j + 1] === 'pr' && words[j + 2] === verb);
  return k < 0 ? null : words.slice(k + 3);
}
// The title a `gh pr create` passes: the word after --title or -t, or the rest of --title=.
function prTitle(args) {
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--title' || args[k] === '-t') return args[k + 1] ?? '';
    if (args[k].startsWith('--title=')) return args[k].slice(8);
  }
  return null;
}
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
  if (cfg && typeof cfg.tracker === 'string' && cfg.tracker && cfg.tracker !== 'none' && !defaults.includes(branch)) {
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
  const target = mergeTarget(tool, ti);
  if (target && !target.url && !target.suffix) {
    try {
      rememberMerge(cwd);
    } catch {
      // the reminder falls back to the current branch
    }
  }
  const cmds = split(ti.command);
  // Each commit's trailers must be in its own text: not in an echo, not in another commit.
  const commits = cmds.filter((c) => {
    const m = COMMIT.exec(c.text);
    return m && INLINE_MSG.test(c.text.slice(m.index));
  });
  if (commits.length) {
    const l = linked(cwd);
    if (!l || !l.key) return;
    const need = [['Refs', l.key]];
    if (l.specHash) need.push(['Spec', l.specHash]);
    const bad = commits.find((c) => !need.every(([p, v]) => hasTrailer(c.text, p, v)));
    if (!bad) return;
    let reason = `fabflows: this branch is linked to ticket ${l.key}. Put these lines in the commit message's last paragraph, next to any Co-Authored-By trailer:\n${need.map(([p, v]) => `${p}: ${v}`).join('\n')}`;
    if (commits.length > 1) reason += `\nEvery commit in the command needs them; this one does not: ${bad.text.split('\n')[0].slice(0, 80)}`;
    return deny(reason);
  }
  for (const c of cmds) {
    const args = ghArgs(c.words, 'create');
    if (!args) continue;
    const l = linked(cwd);
    if (!l || !l.key) return;
    const title = prTitle(args); // null for --fill, --web or none: the key can't be checked
    if (title === null) return deny(`fabflows: this branch is linked to ticket ${l.key}; pass --title containing ${l.key}.`);
    if (!hasKey(title, '', l.key)) return deny(`fabflows: this branch is linked to ticket ${l.key}; put ${l.key} in the pull request title (--title).`);
  }
}

const unconfirmed = (key) => ` The link to ${key} came from commit trailers and is not confirmed: ask the user before touching the ticket.`;

// The PR a merge named: { url }, { suffix } for a number, {} for none, or null for no merge.
// `gh pr merge --auto` only queues a merge and `--disable-auto` cancels one, so neither counts.
const VALUE_FLAG = /^(-[AbFtR]|--(author-email|body|body-file|match-head-commit|subject|repo))$/;
function mergeTarget(tool, ti) {
  if (isMcp(tool, 'merge')) {
    const n = String(ti.pullNumber ?? '');
    if (!/^[0-9]+$/.test(n)) return {};
    const repo = [ti.owner, ti.repo].every((v) => str(v) && /^[A-Za-z0-9_.-]+$/.test(v)) ? `/${ti.owner}/${ti.repo}` : '';
    return { suffix: `${repo}/pull/${n}` };
  }
  const tokens = str(ti.command) && split(ti.command).map((c) => ghArgs(c.words, 'merge')).find(Boolean);
  if (!tokens) return null;
  if (tokens.includes('--auto') || tokens.includes('--disable-auto')) return null;
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
  if (!(isMcp(tool, 'create') || PUSH.test(cmd) || split(cmd).some((c) => ghArgs(c.words, 'create')))) return;
  const l = linked(cwd);
  if (!l || !l.key) return;
  let text = `fabflows: update ticket ${l.key}: Links and status, per fabflows:ticket.`;
  if (!l.confirmed) text += unconfirmed(l.key);
  context('PostToolUse', text);
}

// `gh pr merge -d` switches branch before PostToolUse runs, so PreToolUse notes the current
// branch's link for a merge that names no PR: { file, at } in this worktree's git dir.
const pendingPath = (cwd) => path.resolve(cwd, git(['rev-parse', '--git-path', 'fabflows/pending-merge.json'], cwd));
function rememberMerge(cwd) {
  const p = pendingPath(cwd);
  const branch = currentBranch(cwd);
  if (!branch || !readState(cwd, branch)) return fs.rmSync(p, { force: true });
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ file: path.basename(statePath(cwd, branch)), at: Date.now() }) + '\n');
}
// The link noted before this merge, used once; a note older than 10 minutes is stale.
function recallMerge(cwd) {
  const p = pendingPath(cwd);
  let r;
  try {
    r = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
  fs.rmSync(p, { force: true });
  const age = Date.now() - (r && r.at);
  const s = age >= 0 && age < 10 * 60 * 1000 && /^[0-9a-f]{16}\.json$/.test(r.file) && readFile(path.join(stateDir(cwd), r.file));
  return s ? { ...s, confirmed: true } : null;
}

// Found by PR first, else by the link noted before the merge, else by the current branch.
function mergeReminder(target, cwd) {
  let found;
  if (target.url) found = allStates(cwd).map((e) => e.s).filter((s) => s.pr === target.url);
  else if (target.suffix) found = allStates(cwd).map((e) => e.s).filter((s) => s.pr && s.pr.endsWith(target.suffix));
  else {
    const l = recallMerge(cwd) || linked(cwd);
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

module.exports = { normalize, normalizeInfo, fingerprint, valid };

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
