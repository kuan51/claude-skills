#!/usr/bin/env node
'use strict';

// fabflows ticket helper -- links a branch to its tracker ticket.
//
// CLI (the ticket skill runs these):
//   link <key> <url> <tracker>   record the ticket for the current branch
//   approve < spec               store the fingerprint and the normalized approved spec
//   check < spec                 exit 0 when the spec still matches that fingerprint
//   normalize < spec             print the text the fingerprint is taken over
//   fingerprint < spec           print the fingerprint approve would store
//   labels < spec                print the labels for the spec's Compliance section
//   pr <url>                     record the pull request
//   status                       print this branch's confirmed link as JSON, or exit 1
//   clear [--pr <url>]           forget this branch's link, or the link with that PR
//   trace <from> [<to>] --json   print each first-parent commit's PR, keys and specs; <to>
//                                defaults to origin/HEAD, else main, master, origin/main or
//                                origin/master
//   trace <from> [<to>] [--enrich <file>] --out <dir>
//                                write trace.md and trace.csv with PR, ticket and flag columns
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
// A Jira key of at most 32 characters, or #N or owner/repo#N within GitHub's name limits.
const KEY = [/^(?=.{1,32}$)[A-Z][A-Z0-9]*-[0-9]+$/, /^([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100})?#[0-9]{1,9}$/];
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

// The backtick runs on t[from, to), each [start, end, next]. An inline code span is a run of
// N backticks closed by the next run of exactly N on the line; next is that run's index.
function backtickRuns(t, from, to) {
  const runs = [...t.slice(from, to).matchAll(/`+/g)].map((m) => [from + m.index, from + m.index + m[0].length]);
  const seen = new Map(); // right to left, so this stays linear
  for (let a = runs.length - 1; a >= 0; a--) {
    const n = runs[a][1] - runs[a][0];
    runs[a][2] = seen.get(n);
    seen.set(n, a);
  }
  return runs;
}

// { text, unclosedAt, lines }: unclosedAt is the line of a `<!--` that never closes, which
// removes everything after it, as a renderer hides it; approve refuses such text.
function scan(text) {
  const t = String(text).replace(/\r\n/g, '\n');
  const strip = (s) => s.replace(INVISIBLE, '');
  let out = '';
  const code = []; // [start, end) of each fenced block in `out`
  let i = 0;
  let lineStart = true;
  let open = -1; // the next `<!--` at or after i, found once: searching per line is quadratic
  let runs = [], runsEnd = -1, r = 0; // this line's backtick runs, and the next that may open a span
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
    if (open < lineEnd && runsEnd !== lineEnd) [runs, runsEnd, r] = [backtickRuns(t, i, lineEnd), lineEnd, 0];
    // Spans open left to right from i, so a backtick inside a comment that closed opens none.
    while (open < lineEnd) {
      while (r < runs.length && runs[r][0] < i) r++;
      while (r < runs.length && runs[r][0] < open && (runs[r][2] === undefined || runs[runs[r][2]][1] <= open)) {
        r = runs[r][2] === undefined ? r + 1 : runs[r][2] + 1;
      }
      if (r === runs.length || runs[r][0] > open) break;
      open = t.indexOf('<!--', runs[runs[r][2]][1]); // inside the span run r opens: code
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
  // Drop the Links section: from the last Links heading outside a fence to the end. lines
  // keeps each line with whether it starts in a fence, so compliance reads fences the same way.
  const inCode = (o) => code.some(([s, e]) => o >= s && o < e);
  const lines = [];
  let cut = -1, cutLine = -1;
  for (let o = 0; o <= out.length; ) {
    const nl = out.indexOf('\n', o);
    const line = out.slice(o, nl < 0 ? out.length : nl);
    const inside = inCode(o);
    if (LINKS.test(line) && !inside) [cut, cutLine] = [o, lines.length];
    lines.push({ line: line.trimEnd(), code: inside });
    if (nl < 0) break;
    o = nl + 1;
  }
  if (cut >= 0) {
    out = out.slice(0, cut);
    lines.length = cutLine;
  }
  return { text: out.split('\n').map((l) => l.trimEnd()).join('\n').trimEnd(), unclosedAt, lines };
}
const normalizeInfo = (text) => {
  const { text: t, unclosedAt } = scan(text);
  return { text: t, unclosedAt };
};
const normalize = (text) => normalizeInfo(text).text;
const unclosed = (line) => `line ${line}: a <!-- is never closed, so it removes everything after it; close it with --> or put it in code`;

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const fingerprint = (text) => 'sha256:' + sha(normalize(text));

// ---------------------------------------------------------------- compliance
// The Compliance section of the spec as written, read from its normalized lines so it sits
// inside the fingerprint: the last Compliance heading outside a fence, to the next heading,
// holding four labelled bullets.
const COMPLIANCE = /^ {0,3}(?:#{1,6}[ \t]+Compliance|\*\*Compliance(?::\*\*|\*\*:?))[ \t]*$/;
const HEADING = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|\*\*[^*]+\*\*:?[ \t]*$)/;
const CONTROL = /^[a-z][a-z0-9]*(-[a-z0-9.]+)+$/;
const TRACE = /^REQ-[A-Z][A-Z0-9]*-[0-9]+$/;
const items = (v) => v.split(',').map((s) => s.trim());
const FIELDS = {
  Controls: [(v) => v === 'none' || items(v).every((x) => CONTROL.test(x)), 'a comma list of control IDs like soc2-cc8.1, or none'],
  Change: [(v) => /^(normal|standard|emergency)$/.test(v), 'normal, standard or emergency'],
  Class: [(v) => /^(A|B|C|n\/a)$/.test(v), 'A, B, C or n/a'],
  Traces: [(v) => items(v).every((x) => TRACE.test(x)), 'a comma list of IDs like REQ-AUTH-1'],
};

// { controls, change, cls, traces }, or { errors } naming each missing or bad field. Values
// are never echoed: they are ticket text.
function compliance(text) {
  const { lines } = scan(text);
  let at = -1;
  lines.forEach((l, i) => {
    if (!l.code && COMPLIANCE.test(l.line)) at = i;
  });
  if (at < 0) return { errors: ['no Compliance section'] };
  const got = {};
  const errors = [];
  for (const { line, code } of lines.slice(at + 1)) {
    if (code) continue;
    if (HEADING.test(line)) break;
    const m = /^[ \t]*[-*+][ \t]+(Controls|Change|Class|Traces):[ \t]*(.*)$/.exec(line);
    if (!m) continue;
    if (m[1] in got) errors.push(`${m[1]} is given twice`);
    got[m[1]] = m[2];
  }
  for (const [k, [ok, want]] of Object.entries(FIELDS)) {
    if (got[k] === undefined) {
      if (k !== 'Traces') errors.push(`${k} is missing`);
    } else if (!ok(got[k])) errors.push(`${k} must be ${want}`);
  }
  if (errors.length) return { errors };
  return {
    controls: got.Controls === 'none' ? [] : items(got.Controls),
    change: got.Change,
    cls: got.Class,
    traces: got.Traces === undefined ? [] : items(got.Traces),
  };
}

// The tracker labels for a valid section, each once: lowercase and hyphen-only, so never
// parsed back, and soc2-cc8.1 and soc2-cc8-1 give the same label.
const labels = (c) => [
  ...new Set([...c.controls.map((id) => 'ctl-' + id.replace(/\./g, '-')), 'change-' + c.change, 'class-' + c.cls.replace('n/a', 'na')].map((l) => l.toLowerCase())),
];

// 'on', 'off' or 'invalid', from .claude/fabflows.json at the top level as SessionStart reads it:
// a missing file is off, a file that is not JSON is invalid.
function complianceMode(cwd) {
  const top = tryGit(['rev-parse', '--show-toplevel'], cwd);
  if (!top) return 'off';
  let raw, cfg;
  try {
    raw = fs.readFileSync(path.join(top, '.claude', 'fabflows.json'), 'utf8');
  } catch {
    return 'off';
  }
  try {
    cfg = JSON.parse(raw);
  } catch {
    return 'invalid';
  }
  if (!cfg || cfg.compliance == null) return 'off';
  const f = cfg.compliance.frameworks;
  if (!Array.isArray(f) || !f.every((x) => str(x) && /^[a-z0-9-]{1,30}$/.test(x))) return 'invalid';
  return f.length ? 'on' : 'off';
}

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

// ---------------------------------------------------------------- trace
// The first-parent commits from..to, one row each, as an auditor samples merged changes.
// Subjects and names stay in the row's free-text fields, which --json never prints: commit
// text can hold instructions, and that output reaches Claude.
const traceGit = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const LOG_FORMAT = ['%H', '%P', '%cI', '%an <%ae>', '%s', '%B'].join('%x1f');
// A key on a key boundary, shaped as KEY is; `x/y#7` is not #7, and an owner never starts
// inside a word, so `a_b.c/d#1` holds no key.
const SUBJECT_KEY = /(?<![A-Za-z0-9_./#-])(?:[A-Z][A-Z0-9]*-[0-9]+|(?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100})?#[0-9]{1,9})(?![A-Za-z0-9-])/g;
const MERGE_PR = /^Merge pull request #([0-9]{1,9})\b/;
const TRAILING_PR = /\s*\(#([0-9]{1,9})\)\s*$/;
// An AI author or co-author: Claude's or Copilot's address, or exactly their name.
function isAI(v) {
  const s = v.trim();
  const lt = s.lastIndexOf('<');
  const [name, email] = lt >= 0 && s.endsWith('>') ? [s.slice(0, lt).trim(), s.slice(lt + 1, -1).trim().toLowerCase()] : [s, ''];
  return email === 'noreply@anthropic.com' || email.endsWith('+copilot@users.noreply.github.com') || /^(claude|copilot|copilot\[bot\])$/i.test(name);
}
const uniq = (a) => [...new Set(a)];
const HEX = /^[0-9a-f]{40,64}$/;

// One commit of LOG_FORMAT output. Every field is validated where it is used, so a unit
// separator inside commit text can shift fields but never put free text in a row. Refs, Spec
// and Co-Authored-By count at the start of any line of the message, in any case: a squash
// merge leaves them in the body, outside git's trailer block.
function parseCommit(rec) {
  const [sha, parents = '', date, author = '', subject = '', ...body] = rec.replace(/^\n/, '').split('\x1f');
  const found = { refs: [], spec: [], 'co-authored-by': [] };
  for (const line of body.join('\x1f').split('\n')) {
    const m = /^(Refs|Spec|Co-Authored-By):(.*)$/i.exec(line);
    if (m && m[2].trim()) found[m[1].toLowerCase()].push(m[2].trim());
  }
  return { sha, parents: parents.split(' ').filter(Boolean), date, author, subject, refs: found.refs, specs: found.spec, co: found['co-authored-by'] };
}

function traceRows(from, to, cwd) {
  const records = (out) => out.split('\0').filter((r) => r.trim()).map(parseCommit);
  // --no-show-signature: with log.showSignature set, git prints signature checks, a signer's
  // name among them, into stdout ahead of each record.
  return records(traceGit(['log', '--first-parent', '--no-show-signature', '-z', `--format=${LOG_FORMAT}`, `${from}..${to}`], cwd)).map((c) => {
    // Every commit a merge brought in, from each parent after the first.
    const merged =
      c.parents.length > 1 && HEX.test(c.sha)
        ? records(traceGit(['log', '--no-show-signature', '-z', `--format=${LOG_FORMAT}`, `${c.sha}^1..${c.sha}`], cwd)).filter((m) => m.sha !== c.sha)
        : [];
    const own = c.refs.filter(valid.key);
    const brought = merged.flatMap((m) => m.refs).filter(valid.key);
    // Cut before any regex runs, so a huge subject can't make one slow. Subject keys come only
    // from a squash merge's subject, `title (#N)`, and never from a reverted subject's quote.
    const cut = c.subject.slice(0, 1024);
    const squash = c.parents.length === 1 && TRAILING_PR.test(cut);
    const subject = squash ? (cut.replace(TRAILING_PR, '').replace(/^Revert ".*"/, '').match(SUBJECT_KEY) || []).filter(valid.key) : [];
    const pr = MERGE_PR.exec(cut) || TRAILING_PR.exec(cut);
    return {
      sha: HEX.test(c.sha) ? c.sha : null,
      date: /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}(Z|[+-][0-9]{2}:[0-9]{2})$/.test(c.date) ? c.date : null,
      pr: pr ? Number(pr[1]) : null,
      keys: uniq([...own, ...brought, ...subject]),
      keySource: own.length ? 'commit' : brought.length ? 'merged' : subject.length ? 'subject' : 'none',
      specs: uniq([c, ...merged].flatMap((m) => m.specs).filter(valid.specHash)),
      ai: [c, ...merged].some((m) => [m.author, ...m.co].some(isAI)),
      // Free text, for the report files only.
      subject: c.subject,
      authors: uniq([c, ...merged].flatMap((m) => [m.author, ...m.co])),
    };
  });
}

// ---------------------------------------------------------------- trace report
const COLUMNS = ['commit', 'date', 'author', 'AI', 'PR', 'PR author', 'approvers', 'tickets', 'key source', 'spec hashes', 'ticket fingerprints', 'controls', 'change', 'class', 'traces', 'expected labels', 'actual labels', 'flags'];
const FLAGS = ['no-ticket', 'no-spec', 'no-pr', 'pr-mismatch', 'spec-changed', 'no-compliance', 'label-missing', 'emergency', 'no-approval', 'self-approved', 'not-enriched'];
const short = (v) => str(v) && v.length <= 200;
const shortList = (v) => Array.isArray(v) && v.every(short);

// The text of a regular file of at most max bytes, else null.
function readSmall(file, max, flags = 0) {
  let fd;
  try {
    // O_NONBLOCK, so a FIFO fails the isFile check instead of blocking the open forever.
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0) | flags);
    const st = fs.fstatSync(fd);
    return st.isFile() && st.size <= max ? fs.readFileSync(fd, 'utf8') : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// The enrichment file Claude wrote from its MCP tools, re-validated entry by entry: an entry
// of the wrong shape is dropped, so its row reads as not enriched. Null when the file is unusable.
function enrichment(file) {
  let e;
  try {
    e = JSON.parse(readSmall(file, 1024 * 1024));
  } catch {
    return null;
  }
  if (!e || typeof e !== 'object') return null;
  const entries = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o) : []);
  const prs = new Map();
  for (const [n, v] of entries(e.prs)) {
    if (!(/^[0-9]+$/.test(n) && v && short(v.author) && shortList(v.approvers))) continue;
    if (v.mergeCommit !== undefined && !(str(v.mergeCommit) && HEX.test(v.mergeCommit))) continue;
    prs.set(Number(n), { author: v.author, approvers: v.approvers, mergeCommit: v.mergeCommit });
  }
  const tickets = new Map();
  for (const [key, v] of entries(e.tickets)) {
    if (!(valid.key(key) && v && shortList(v.labels) && short(v.bodyFile) && /^[^/\\]+$/.test(v.bodyFile) && !/^\.\.?$/.test(v.bodyFile))) continue;
    const bodyPath = path.join(path.dirname(file), v.bodyFile);
    // lstat as well as O_NOFOLLOW, which Windows lacks. A path lstat rejects is dropped too.
    try {
      if (fs.lstatSync(bodyPath, { throwIfNoEntry: false })?.isSymbolicLink()) continue;
    } catch {
      continue;
    }
    const body = readSmall(bodyPath, 256 * 1024, fs.constants.O_NOFOLLOW || 0);
    if (body === null) continue;
    const text = normalize(body);
    const c = compliance(body);
    tickets.set(key, { fingerprint: 'sha256:' + sha(text), c, expected: c.errors ? [] : labels(c), labels: v.labels });
  }
  return { prs, tickets };
}

// The report's cells for each row: git data, the enrichment for its PR and tickets, and flags.
function reportRows(rows, en, on) {
  return rows.map((row) => {
    const pr = en && row.pr !== null ? en.prs.get(row.pr) : undefined;
    const found = row.keys.map((k) => en && en.tickets.get(k));
    const known = found.filter(Boolean);
    const all = (f) => uniq(known.flatMap(f)).join('; ');
    const flags = new Set();
    if (!row.keys.length) flags.add('no-ticket');
    if (!row.specs.length) flags.add('no-spec');
    if (row.pr === null) flags.add('no-pr');
    if (pr && pr.mergeCommit !== undefined && pr.mergeCommit !== row.sha) flags.add('pr-mismatch');
    if (row.specs.length && known.some((t) => !row.specs.includes(t.fingerprint))) flags.add('spec-changed');
    if (on && known.some((t) => t.c.errors)) flags.add('no-compliance');
    if (known.some((t) => t.expected.some((l) => !t.labels.some((have) => have.toLowerCase() === l)))) flags.add('label-missing');
    if (known.some((t) => t.c.change === 'emergency')) flags.add('emergency');
    if (pr && !pr.approvers.length) flags.add('no-approval');
    if (pr && pr.approvers.some((a) => a.toLowerCase() === pr.author.toLowerCase())) flags.add('self-approved');
    if (!en || (row.pr !== null && !pr) || known.length < found.length) flags.add('not-enriched');
    return [
      `${row.sha} ${row.subject}`,
      row.date || '',
      row.authors.join('; '),
      row.ai ? 'yes' : 'no',
      row.pr === null ? '' : String(row.pr),
      pr ? pr.author : '',
      pr ? pr.approvers.join('; ') : '',
      row.keys.join('; '),
      row.keySource,
      row.specs.join('; '),
      known.map((t) => t.fingerprint).join('; '),
      all((t) => t.c.controls || []),
      all((t) => (t.c.change ? [t.c.change] : [])),
      all((t) => (t.c.cls ? [t.c.cls] : [])),
      all((t) => t.c.traces || []),
      all((t) => t.expected),
      all((t) => t.labels),
      FLAGS.filter((f) => flags.has(f)).join('; '),
    ];
  });
}

// RFC 4180, with a leading ' on a cell a spreadsheet would run as a formula.
const csvCell = (v) => {
  const s = /^[\s\p{Cf}]*[=+\-@＝＋－＠]/u.test(v) ? "'" + v : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const mdCell = (v) => v.replace(/[\\`*_[\]<>|]/g, '\\$&').replace(/[\r\n]/g, ' ');

// p with symlinks resolved through its nearest existing parent.
function realOut(p) {
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(p), ...rest);
    } catch {
      if (path.dirname(p) === p) throw new Error('--out has no existing parent directory');
      rest.unshift(path.basename(p));
      p = path.dirname(p);
    }
  }
}

// Writes <out>/trace.md and <out>/trace.csv, outside the repo and never over a file, and
// returns the summary line. The repo is this checkout, the main checkout when this is a
// linked worktree, and the common git dir.
function writeReport(out, from, to, cells, cwd) {
  const common = path.resolve(cwd, traceGit(['rev-parse', '--git-common-dir'], cwd).trim());
  const top = traceGit(['rev-parse', '--show-toplevel'], cwd).trim();
  const roots = [top, path.basename(common) === '.git' ? path.dirname(common) : null, common].filter(Boolean).map((r) => fs.realpathSync(r));
  const fold = process.platform === 'darwin' || process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
  const dir = realOut(out);
  const inside = (root) => {
    const rel = path.relative(fold(root), fold(dir));
    return !(rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel));
  };
  if (roots.some(inside)) throw new Error('--out must be outside the repository');
  fs.mkdirSync(dir, { recursive: true });
  const [mdFile, csvFile] = ['trace.md', 'trace.csv'].map((n) => path.join(dir, n));
  for (const f of [mdFile, csvFile]) {
    if (fs.lstatSync(f, { throwIfNoEntry: false })) throw new Error(`--out already holds ${path.basename(f)}; choose an empty directory`);
  }
  const md = [`# Trace ${from}..${to}`, '', `| ${COLUMNS.join(' | ')} |`, `|${' --- |'.repeat(COLUMNS.length)}`, ...cells.map((r) => `| ${r.map(mdCell).join(' | ')} |`)];
  fs.writeFileSync(mdFile, md.join('\n') + '\n', { flag: 'wx' });
  fs.writeFileSync(csvFile, [COLUMNS, ...cells].map((r) => r.map(csvCell).join(',') + '\r\n').join(''), { flag: 'wx' });
  const count = (f) => cells.filter((r) => r[r.length - 1].split('; ').includes(f)).length;
  return `trace: ${cells.length} commits; ${FLAGS.map((f) => `${f} ${count(f)}`).join(', ')}`;
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
  // With compliance on, refuse a spec (as written) without a valid Compliance section.
  const gate = (raw) => {
    const mode = complianceMode(cwd);
    if (mode === 'invalid') process.stderr.write('ticket.js: warning: compliance.frameworks in .claude/fabflows.json is invalid, so compliance is off\n');
    if (mode !== 'on') return;
    const { errors } = compliance(raw);
    if (errors) fail(`compliance is on, so the spec needs a valid Compliance section: ${errors.join('; ')}`);
  };

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
    const raw = stdin();
    const { text, unclosedAt } = normalizeInfo(raw);
    if (unclosedAt) fail(`${unclosed(unclosedAt)}, then ask the user to approve again`);
    gate(raw);
    fs.writeFileSync(approvedPath(statePath(cwd, l.branch)), text + '\n');
    writeState(cwd, { ...state(l), specHash: 'sha256:' + sha(text) });
  } else if (cmd === 'fingerprint') {
    const raw = stdin();
    const { text } = normalizeInfo(raw);
    gate(raw);
    process.stdout.write('sha256:' + sha(text) + '\n');
  } else if (cmd === 'labels') {
    const c = compliance(stdin());
    if (c.errors) fail(`no valid Compliance section: ${c.errors.join('; ')}`);
    const out = labels(c);
    if (out.some((l) => l.length > 50)) fail("a control ID makes a label longer than GitHub's 50 characters");
    process.stdout.write(out.join('\n') + '\n');
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
  } else if (cmd === 'trace') {
    const refs = [];
    const o = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--json') o.json = true;
      else if (args[i] === '--enrich' || args[i] === '--out') o[args[i].slice(2)] = args[++i];
      else refs.push(args[i]);
    }
    const usage = 'usage: trace <from> [<to>] --json, or trace <from> [<to>] [--enrich <file>] --out <dir>';
    if (refs.length < 1 || refs.length > 2 || !(o.json || o.out) || ('enrich' in o && !(o.enrich && o.out)) || ('out' in o && !o.out)) fail(usage);
    if (o.out && !path.isAbsolute(o.out)) fail('--out must be an absolute path; a quoted ~ is not expanded');
    // Before the refs, so a ref past the shallow cut fails after the warning that explains it.
    if (traceGit(['rev-parse', '--is-shallow-repository'], cwd).trim() === 'true') {
      process.stderr.write('ticket.js: warning: this is a shallow clone, so history may be missing\n');
    }
    // <to> defaults to the default branch, as SessionStart finds it.
    const def = refs[1] || ['refs/remotes/origin/HEAD', 'main', 'master', 'refs/remotes/origin/main', 'refs/remotes/origin/master'].find((b) => tryGit(['rev-parse', '--verify', '-q', b + '^{commit}'], cwd));
    if (!def) fail('no <to> given and no origin/HEAD, main, master, origin/main or origin/master to default to; pass <to>');
    const [from, to] = [refs[0], def].map((ref, n) => {
      const which = n ? 'to' : 'from';
      if (ref.startsWith('-')) fail(`the ${which} ref may not start with -`);
      try {
        return traceGit(['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], cwd).trim();
      } catch {
        return fail(`the ${which} ref is not a commit`);
      }
    });
    try {
      traceGit(['merge-base', '--is-ancestor', from, to], cwd);
    } catch {
      process.stderr.write('ticket.js: warning: from is not an ancestor of to, so the range may not be what you meant\n');
    }
    const rows = traceRows(from, to, cwd);
    if (o.out) {
      const en = o.enrich ? enrichment(path.resolve(o.enrich)) : null;
      if (o.enrich && !en) process.stderr.write('ticket.js: warning: the enrichment file is unreadable, over 1 MB or not a JSON object, so no row is enriched\n');
      process.stdout.write(writeReport(path.resolve(o.out), from, to, reportRows(rows, en, complianceMode(cwd) === 'on'), cwd) + '\n');
    } else {
      process.stdout.write(JSON.stringify(rows.map(({ sha, date, pr, keys, keySource, specs, ai }) => ({ sha, date, pr, keys, keySource, specs, ai }))) + '\n');
    }
  } else {
    fail(`unknown subcommand ${cmd}; use link, approve, check, normalize, fingerprint, labels, pr, status, clear or trace`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- shell
// The simple commands a shell line runs, split at unquoted && || ; | &, newlines and
// parentheses. Each is { text, words }: text is its source plus the body of any heredoc it
// opened, words its arguments with quotes removed. It knows quotes, \ escapes, $(...),
// backticks and heredocs at any depth, and the commands inside $(...) and backticks are
// listed too, and # comments are skipped; not aliases, eval, functions, here-strings or
// case patterns.
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
  // True when s[k] is escaped by an odd run of backslashes before it.
  const escaped = (k) => {
    let n = 0;
    while (k - n > 0 && s[k - n - 1] === '\\') n++;
    return n % 2 === 1;
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
    } else if (c === '#' && (i === 0 || (/[\s;&|(]/.test(s[i - 1]) && !escaped(i - 1)))) {
      // A word starts after unescaped blanks and ; & | ( only: `$(a)#b` and `a\ #b` are one word.
      const k = s.indexOf('\n', i); // a comment runs to the end of its line, and is no command's text
      if (top) end(i);
      i = k < 0 ? s.length : k;
      if (top) begin(i);
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

// git by name or path, then any global options (`-C d`, `-c k=v`, `--git-dir=x`, `-P`). A
// one-letter flag is never C or c, and a value is quoted and unquoted pieces where an
// unquoted piece runs to the next quote or blank, so each option reads one way and a failed
// match does not backtrack through every mix.
const ARG = String.raw`(?:"[^"]*"|'[^']*'|[^\s"']+(?=["'\s]|$))+`;
const GIT = String.raw`(?:^|[\s;&|(])(?:[^\s;&|()]*[/\\])?git(?:\.exe)?(?:\s+(?:-[Cc]\s+${ARG}|--[A-Za-z-]+(?:=${ARG})?|-[ABD-Zabd-z](?=\s)))*\s+`;
const COMMIT = new RegExp(GIT + String.raw`commit\b`);
const PUSH = new RegExp(GIT + String.raw`push\b`);
const INLINE_MSG = /\s(?:-[a-zA-Z]*m|--message)(?:[\s="']|$)|\s(?:-F\s*-|--file[=\s]-)(?:\s|$)/;
// The arguments after `gh pr <verb>` in a command's words, or null.
function ghArgs(words, verb) {
  const k = words.findIndex((w, j) => /(^|[/\\])gh(\.exe)?$/.test(w) && words[j + 1] === 'pr' && words[j + 2] === verb);
  return k < 0 ? null : words.slice(k + 3);
}
// The titles a `gh pr create` passes, in every form gh's flag parser takes: --title v,
// --title=v, -t v, -tv, -t=v, and -t after boolean shorthands (-dt v). Every one must carry
// the key, so which one gh keeps doesn't matter.
function prTitles(args) {
  const titles = [];
  for (let k = 0; k < args.length; k++) {
    const w = args[k];
    const short = /^-[defw]*t(.*)$/s.exec(w);
    if (w === '--title' || (short && short[1] === '')) titles.push(args[++k] ?? '');
    else if (w.startsWith('--title=')) titles.push(w.slice(8));
    else if (short) titles.push(short[1].replace(/^=/, ''));
  }
  return titles;
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
  const creates = cmds.map((c) => ghArgs(c.words, 'create')).filter(Boolean);
  if (!commits.length && !creates.length) return;
  const l = linked(cwd);
  if (!l || !l.key) return;
  const need = [['Refs', l.key]];
  if (l.specHash) need.push(['Spec', l.specHash]);
  const bad = commits.find((c) => !need.every(([p, v]) => hasTrailer(c.text, p, v)));
  if (bad) {
    let reason = `fabflows: this branch is linked to ticket ${l.key}. Put these lines in the commit message's last paragraph, next to any Co-Authored-By trailer:\n${need.map(([p, v]) => `${p}: ${v}`).join('\n')}`;
    if (commits.length > 1) reason += `\nEvery commit in the command needs them; this one does not: ${bad.text.split('\n')[0].slice(0, 80)}`;
    return deny(reason);
  }
  for (const args of creates) {
    const titles = prTitles(args); // none for --fill, --web or nothing: the key can't be checked
    if (!titles.length) return deny(`fabflows: this branch is linked to ticket ${l.key}; pass --title containing ${l.key}.`);
    if (!titles.every((t) => hasKey(t, '', l.key))) return deny(`fabflows: this branch is linked to ticket ${l.key}; put ${l.key} in the pull request title (--title).`);
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
  fs.rmSync(p, { force: true }); // first, so a failure below leaves no older note behind
  const branch = currentBranch(cwd);
  if (!branch || !readState(cwd, branch)) return;
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

module.exports = { normalize, normalizeInfo, fingerprint, valid, compliance };

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
