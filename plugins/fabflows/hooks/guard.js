#!/usr/bin/env node
'use strict';

// fabflows guard -- a PreToolUse / SubagentStop hook.
//
// Two deliberate design choices, both load-bearing:
//
// 1. It blocks with JSON (`permissionDecision: "deny"`) and always exits 0. The docs
//    describe exit code 2 as the blocking path, but the only shipped PreToolUse blocker
//    in the plugin ecosystem (hookify) uses the JSON path, and community reports say
//    exit 2 does not reliably block calls made inside a subagent.
// 2. It FAILS OPEN. Malformed stdin, no git, a cwd that is not a repo, a timeout --
//    every one of those allows the tool call. A guard that fails closed would block
//    every shell call in every session of anyone who installs this plugin. Failing open
//    degrades to the prose rules in the skill, which cover the same ground.
//
// It is a tripwire, not a sandbox. Shell pattern matching is bypassable by base64,
// variable expansion, heredocs, `python -c`, and full binary paths. See the README.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// ---------------------------------------------------------------- path handling
// Windows and macOS default to case-insensitive filesystems, and Windows uses a
// different separator. Every path comparison goes through norm() so the same test
// table passes on all three platforms.
const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
const under = (p, base) => p === base || p.startsWith(base + '/');
// One home expansion and one unquote for every site that takes a path from a shell string.
const expandHome = (p) => p.replace(/^~(?=[\\/]|$)/, os.homedir());
const unquote = (s) => s.replace(/^(["'])(.*)\1$/, '$2');

// ---------------------------------------------------------------- decisions
function decide(decision, reason, context) {
  const out = { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason };
  if (context) out.additionalContext = context;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
  process.exit(0);
}
const deny = (reason) => decide('deny', reason);

// A package download the user may approve. `ask` hands the call to the native permission
// prompt, which only a human in the main thread can answer. A worker (agent_id present)
// cannot show one, and a mode that does not prompt, or an unknown or missing mode, gets
// a deny. A hook `ask` is not documented as enforced in plan mode, so plan is not listed.
const ASK_MODES = ['default', 'acceptEdits', 'auto'];
function install(segs, input) {
  const what = segs.map((s) => s.slice(0, 60)).join('; ');
  if (input.agent_id) {
    deny(
      `fabflows: package installs and package runners are blocked in a worker (${what}). Stop. Report the package, the version and where it lands to the lead as a blocker, and do not work around it.`
    );
  }
  if (ASK_MODES.includes(input.permission_mode)) {
    decide(
      'ask',
      `fabflows: this downloads from a package registry (${what}). Approve only if you want it installed.`,
      `fabflows asked the user to approve a package download (${what}). If the user declines, or the call is not approved, name the package and stop. Try no other runner, package manager, manual download or script.`
    );
  }
  deny(
    `fabflows: package installs and package runners need the user's yes (${what}), and this permission mode cannot show an approval prompt, so a yes cannot let the command through. Stop. Name the package, the version and where it lands, and ask the user to run it themselves, for example with the ! prefix, or to switch to a mode that prompts. Try no other runner, package manager, manual download or script.`
  );
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

// ---------------------------------------------------------------- patterns
//
// Both the POSIX and the PowerShell rule sets run against every shell segment,
// whichever tool produced it. Blocking `Install-Module` inside bash costs nothing --
// it would fail anyway -- and it means there is one rule set to keep correct instead
// of two that can silently drift apart.

const INSTALL = [
  /^npm\s+(i|install|ci|add)\b/i,
  /^(pnpm|yarn|bun)\s+(global\s+)?(i|install|add|a)\b/i,
  /^pip3?\s+install\b/i,
  /^python3?\s+-m\s+pip\s+install\b/i,
  /^uv\s+(pip\s+install|add|sync)\b/i,
  /^dotnet\s+(add\s+package|tool\s+install)\b/i,
  /^(cargo|go|gem)\s+(install|add|get)\b/i,
  /^apt(-get)?\s+install\b/i,
  /^(brew|winget|choco|scoop)\s+install\b/i,
  /^install-(module|package|script)\b/i,
  // Ephemeral package runners download just the same, into a cache outside the repo.
  /^(npx|pnpx|bunx|uvx)(\s|$)/i,
  /^npm\s+(exec|x)\b/i,
  /^bun\s+x\b/i,
  /^(pnpm|yarn)\s+dlx\b/i,
  /^uv\s+tool\s+(run|install)\b/i,
  // Only uv's own options may come before --with, never the command it runs.
  { test: (seg) => uvRunWith(seg) },
  /^pipx\s+(run|install)\b/i,
  /^(npm|yarn|pnpm|bun)\s+create\b/i,
  // `npm init <initializer>` runs `npm exec create-<initializer>`, whatever flags come first.
  { test: (seg) => npmInitializer(seg) },
];

// `uv run --with pkg cmd` fetches pkg; a `--with` after the command belongs to the command.
// Only flags known to take a separate value skip it; any other bare word is the command.
const UV_VALUE_FLAG = /^(-p|--python|--directory|--project|--package|--extra|--group|--only-group|--index|--index-url|--extra-index-url|--default-index|-f|--find-links|--env-file|--color|--cache-dir|--config-file|-m|--module)$/;
function uvRunWith(seg) {
  const m = /^uv\s+run(\s+.*)?$/i.exec(seg);
  if (!m) return false;
  const args = (m[1] || '').trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < args.length; i++) {
    if (/^--with(-requirements|-editable)?(=|$)/.test(args[i])) return true;
    if (UV_VALUE_FLAG.test(args[i])) i++;
    else if (!args[i].startsWith('-')) return false;
  }
  return false;
}

// Flags of `npm init` whose value is a separate word, so the value is not an initializer.
const NPM_INIT_VALUE_FLAG = /^(-w|--workspace|--scope|--init-[\w-]+)$/i;
function npmInitializer(seg) {
  const m = /^npm\s+init(\s+.*)?$/i.exec(seg);
  if (!m) return false;
  const args = (m[1] || '').match(/"[^"]*"|'[^']*'|\S+/g) || [];
  for (let i = 0; i < args.length; i++) {
    if (NPM_INIT_VALUE_FLAG.test(args[i])) i++;
    else if (!args[i].startsWith('-')) return true;
  }
  return false;
}

// The one install the guard lets through: pypdf, pure Python, into a `--target` with a
// `scratchpad` directory in its path. Nothing lands in site-packages, so nothing outlives
// the session, and the lead can read a PDF without asking the user to install. `--isolated`
// is required because it makes pip ignore PIP_* environment variables and user config, the
// two ways a `pypdf` install could be pointed at another index. The target must be a literal
// path (no `$`, backtick or `%`), and never live config, which the scratchpad name alone
// cannot rule out.
const PIP = /^(?:pip3?|python3?\s+-m\s+pip)\s+install\s+(.*)$/i;
function isScratchPypdf(seg, cwd) {
  const m = PIP.exec(seg);
  if (!m) return false;
  const args = m[1].match(/"[^"]*"|'[^']*'|\S+/g) || [];
  let target = null;
  let pkg = false;
  let isolated = false;
  for (let i = 0; i < args.length; i++) {
    const a = unquote(args[i]);
    if (a === '--target') target = unquote(args[++i] || '');
    else if (a === '--isolated') isolated = true;
    else if (/^pypdf(==[\d.]+)?$/i.test(a)) pkg = true;
    else if (!/^(-q|--quiet)$/i.test(a)) return false;
  }
  if (!pkg || !isolated || !target || /[$`%]/.test(target)) return false;
  const t = norm(path.resolve(cwd, expandHome(target)));
  return /(^|\/)scratchpad(\/|$)/.test(t) && !isProtectedPath(t);
}

// npm's own runner (npx, npm exec) runs a bin from the project's node_modules/.bin before it
// downloads anything, so a plain bin name already installed there is not an install. Only
// npm: pnpx is `pnpm dlx` and always fetches, and bunx and `bun x` are not trusted to.
// The bin must be the first word after the runner (or after a bare `--`): any runner flag
// before it could be -p, -c, or a flag whose value (`--cache x`) would pass for the bin
// name. Anything after the bin belongs to the bin, so `npx tsc -p x.json` is local.
const LOCAL_RUNNER = /^(?:npx|npm\s+(?:exec|x))(?:\s+--)?\s+(\S+)/i;
function isLocalRun(seg, cwd) {
  const m = LOCAL_RUNNER.exec(seg);
  if (!m) return false;
  const bin = m[1];
  // no @, / or :, so no version or package spec; `.` and `..` are directory specs, not bins
  if (!bin || !/^[\w.-]+$/.test(bin) || /^\.+$/.test(bin)) return false;
  const exists = (p) => fs.existsSync(p);
  const isFile = (p) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() === true;
  try {
    // npm's project root is the nearest directory with a package.json or node_modules;
    // it looks for the bin there and in every directory above, up to `/` (libnpmexec),
    // which is how a workspace package finds bins hoisted to the monorepo root.
    let root = false;
    for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
      root = root || exists(path.join(dir, 'package.json')) || exists(path.join(dir, 'node_modules'));
      const b = path.join(dir, 'node_modules', '.bin', bin);
      if (root && (isFile(b) || isFile(b + '.cmd'))) return true;
      if (path.dirname(dir) === dir) return false;
    }
  } catch {
    return false; // unsure, so it counts as an install
  }
}

// Secret-bearing paths. Accepts either separator so a Windows path matches too.
// A `.env` directory is a Python virtualenv, not a secret. `.pem` or `.key` followed by a
// source or prose extension is a file about keys; `json` is left out, since a `*.key.json`
// can be a real service-account key.
const SECRET_PATH =
  /(^|[\s"'\\/])\.env($|[.\s"'])|\.(pem|key)\b(?!\.(md|mdx|txt|html|js|jsx|mjs|cjs|ts|tsx|py|go|rs|java|cs|rb)\b)|\bid_rsa\b|\bid_ed25519\b|[\\/]\.aws[\\/]credentials|[\\/]\.ssh[\\/]|\.npmrc\b|\.pypirc\b/i;

// .env.example and friends are committed scaffolding that agents legitimately read and
// edit in most repos. Blocking them would be a false positive on nearly every project.
const SECRET_EXEMPT = /\.env\.(example|sample|template|dist)\b/i;

// A path is tested as written and as the shell hands it over (`"sso/"../x`), each form
// as written and normalized, since doubled separators, `./` and `..`
// segments (`.aws//credentials`, `.aws/sso/../credentials`) name the same file. Both forms
// are needed: normalizing a whole shell segment can let a later `..` swallow the secret.
// Exempt names are cut out rather than exempting the string, so `cat .env.example .env`
// still sees the `.env`.
const EXEMPT_ALL = new RegExp(SECRET_EXEMPT.source, 'gi');
const pathForms = (p) =>
  [p, shellWord(p)].flatMap((w) => {
    const slashed = w.replace(/\\/g, '/');
    return [slashed, path.posix.normalize(slashed)];
  });
const isSecretPath = (p) => !!p && pathForms(p).some((q) => SECRET_PATH.test(q.replace(EXEMPT_ALL, '')));

// A bare `.ssh` or `.aws` directory handed to Read or Grep, whatever trailing `/` or `/.`
// follows it. `(\/\.?)*` avoids the exponential backtracking of `(\/+\.?)*` on a long run
// of slashes. Not used by the shell rules.
const SECRET_DIR = /(^|\/)\.(ssh|aws)(\/\.?)*$/i;
const isSecretDir = (p) => !!p && pathForms(p).some((q) => SECRET_DIR.test(q));

// A glob converted to a regex. A run of `*` and `/` holding `**` is one `.*`: stacked `.*`
// terms backtrack exponentially, and a guard that times out fails open. `\x` is a literal
// x and `[!x]` a negated class, as in ripgrep.
function globRe(g) {
  let re = '';
  let depth = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '\\' && i + 1 < g.length) re += g[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    else if (c === '*') {
      const run = /^[*/]+/.exec(g.slice(i))[0];
      if (run.includes('**')) (re += '.*'), (i += run.length - 1);
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') (re += '(?:'), depth++;
    else if (c === '}' && depth) (re += ')'), depth--;
    else if (c === ',' && depth) re += '|';
    else if (c === '[' && g.indexOf(']', i + 1) > i) {
      const end = g.indexOf(']', i + 1);
      re += g.slice(i, end + 1).replace(/^\[!/, '[^');
      i = end;
    } else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`(^|/)${re}$`, 'i');
}

// A glob with its `{a,b}` groups expanded, innermost first, so a path inside braces
// (`{x/.env,y}`) is seen whole. Stacked groups multiply, so more than 64 results is null:
// too complex to check in time, and denied rather than left to time out.
function expandBraces(g) {
  let out = [g];
  for (;;) {
    let changed = false;
    out = out.flatMap((s) => {
      const m = /\{([^{}]*)\}/.exec(s);
      if (!m) return [s];
      changed = true;
      return m[1].split(',').map((alt) => s.slice(0, m.index) + alt + s.slice(m.index + m[0].length));
    });
    if (out.length > 64) return null;
    if (!changed) return out;
  }
}

// A Grep glob that can match a sample secret name.
// ponytail: this list is the ceiling; a glob that only matches a secret name missing from it
// (`prod.env`) passes. Add the name here to cover it.
const SECRET_SAMPLES = ['.env', '.env.local', '.env.production', 'x.pem', 'x.key', 'id_rsa', 'id_ed25519', '.ssh/id_rsa', '.aws/credentials', '.npmrc', '.pypirc'];
function isSecretGlob(glob) {
  if (typeof glob !== 'string') return false;
  // Split the way the Grep tool does (cli.js): on whitespace, then on commas unless the
  // piece holds both `{` and `}`.
  const pieces = glob.split(/\s+/).flatMap((g) => (g.includes('{') && g.includes('}') ? [g] : g.split(',')));
  return pieces.some((piece) => {
    if (!piece || piece.startsWith('!')) return false; // an exclusion
    const expanded = expandBraces(piece);
    if (!expanded) return true;
    return expanded.some((g) => {
      // Only the last one or two path components can name a sample, so a directory prefix
      // (`apps/*/.env`, `/**/.env`) cannot hide it. A tail with no wildcard is checked like
      // a path (`**/.env.staging`, `**/.ssh`). A tail of only `*`, `?` and `/` searches
      // what no glob would, a known gap.
      const parts = g.replace(/^\/+/, '').split('/');
      return [parts.slice(-1), parts.slice(-2)].some((tail) => {
        const t = tail.join('/');
        if (!/[*?[\\]/.test(t) && (isSecretPath(t) || isSecretDir(t))) return true;
        if (/^[*?/]*$/.test(t)) return false;
        try {
          const rx = globRe(t);
          return SECRET_SAMPLES.some((s) => rx.test(s));
        } catch {
          return true; // a glob the conversion cannot compile is denied
        }
      });
    });
  });
}

const SECRET_CONTENT =
  /AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[0-9A-Za-z-]{10,}|AIza[0-9A-Za-z_-]{35}/;

const READERS = /^(cat|less|more|head|tail|strings|xxd|od|bat|get-content|gc|type)\b/i;

// `(?=\s|$)`, not `\b`, so `merge-base` and `commit-graph` are not `merge` and `commit`.
const GIT_OP = /^git\s+(-c\s+\S+\s+)?(commit|push|merge|rebase)(?=\s|$)/i;
// Ending a merge or rebase in progress makes no new commit.
const GIT_ABORT = /^git\s+(-c\s+\S+\s+)?(merge|rebase)\s+--(abort|quit)\s*$/i;
const GIT_PUSH = /^git\s+(-c\s+\S+\s+)?push(?=\s|$)/i;
// A branch the same command creates or moves to. A bare `git checkout <x>` is skipped,
// since <x> can be a file, and so is a `switch` flag such as `--detach` or `-`.
const GIT_NEW_BRANCH = /^git\s+(-c\s+\S+\s+)?(checkout\s+-[bB]|switch\s+-[cC]|switch)\s+([^\s-]\S*)/i;
const GIT_ADD = /^git\s+(-c\s+\S+\s+)?add\b/i;
const GIT_FORCE = /^git\s+(-c\s+\S+\s+)?push\b.*(--force\b|--force-with-lease\b|\s-f(\s|$))/i;

// Deliberately NOT case-insensitive: `git branch -D` force-deletes an unmerged branch,
// while `git branch -d` refuses to delete anything unmerged and is routine cleanup.
// An /i flag here would block the safe one too.
const GIT_FORCE_DELETE = /^[Gg]it\s+(-C\s+\S+\s+)?branch\s+(-[a-zA-Z]*D|--delete\s+--force|--force\s+--delete)\b/;

// Pipelines are checked against the raw command, because splitting on "|" destroys them.
const PIPE_TO_SHELL = [
  /(curl|wget)\b[^|]*\|\s*(sh|bash|zsh|dash)\b/i,
  /(invoke-webrequest|invoke-restmethod|iwr|irm)\b[^|]*\|\s*(iex|invoke-expression)\b/i,
];

// The one unanchored rule below, so checkShell tests it on text with quotes blanked.
const SYSTEM_REDIRECT = />\s*\/(etc|usr|bin|sbin|boot|sys)\//i;

const DESTRUCTIVE = [
  [/^git\s+(-c\s+\S+\s+)?reset\s+--hard\b/i, 'git reset --hard discards uncommitted work'],
  // A dry run (-n or --dry-run) only lists what it would delete.
  [/^git\s+(-c\s+\S+\s+)?clean(?!.*\s(-[a-z]*n|--dry-run))\s+-[a-z]*d/i, 'git clean -d deletes untracked files'],
  [{ test: (seg) => worldWritable(seg) }, 'chmod makes a path world-writable'],
  [/^dd\b[^|]*\bof=/i, 'dd with of= overwrites a device or file wholesale'],
  [/^mkfs(\.|\s)/i, 'mkfs formats a filesystem'],
  [/^format-volume\b/i, 'Format-Volume formats a volume'],
  [/^set-executionpolicy\b/i, 'Set-ExecutionPolicy changes a machine-wide security setting'],
  [/^sudo\b/i, 'sudo escalates privileges'],
  [SYSTEM_REDIRECT, 'writing into a system path'],
];

// A word as the command receives it: bash removes quotes, `$'...'` and backslash escapes,
// so `\/*`, `/""*` and `o\+w` reach rm and chmod as `/*` and `o+w`.
const shellWord = (s) => s.replace(/\$'/g, "'").replace(/\\(.)/g, '$1').replace(/["']/g, '');

// chmod's options; the first word after chmod that is not one is its mode. A symbolic mode
// can start with `-` (`chmod -x,o+w f`), so a word is an option only if it is one of these.
const CHMOD_OPTION = /^(-[cfvRHLP]+|--[a-z-]*(=\S*)?)$/;

// A chmod mode that leaves a path world-writable: an octal mode whose last digit, the
// others digit, has the write bit (`777`, `666`, `0002`), bare or after `+` or `=`, or symbolic clauses that, applied in order, end with others able to
// write. A clause counts when its who-part names o or a; `+` or `=` with w or a copied
// u, g or o grants write, and `-w` or an `=` without it takes it away (`a+w,o-w` passes).
function worldWritable(seg) {
  if (!/^chmod\s/i.test(seg)) return false;
  const words = shellWord(seg).split(/\s+/).slice(1);
  const comment = words.findIndex((w) => w.startsWith('#'));
  const mode = (comment < 0 ? words : words.slice(0, comment)).find((w) => !CHMOD_OPTION.test(w));
  if (!mode) return false;
  if (/^[+=]?[0-7]*[2367]$/.test(mode)) return true;
  let othersWrite = false;
  for (const clause of mode.split(',')) {
    const m = /^([ugoa]*)((?:[-+=][rwxXstugo]*)+)$/.exec(clause);
    if (!m || !/[oa]/.test(m[1])) continue;
    for (const [, op, perms] of m[2].matchAll(/([-+=])([rwxXstugo]*)/g)) {
      const grants = /[wugo]/.test(perms);
      if (op === '=') othersWrite = grants;
      else if (op === '+' && grants) othersWrite = true;
      else if (op === '-' && perms.includes('w')) othersWrite = false;
    }
  }
  return othersWrite;
}

// Home in every spelling a shell string can carry it: the real home is spelled out too,
// plus the usual absolute homes on Windows, Linux and macOS.
const HOME_LITERAL = os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HOME_SPELLINGS = String.raw`(~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|[a-z]:[\\/]users[\\/][^\s\\/]+|/root|/home/[^\s/]+|/users/[^\s/]+|${HOME_LITERAL})`;

// rm -rf / Remove-Item -Recurse -Force are only destructive at a dangerous target.
// `rm -rf ./build` is routine; `rm -rf ~` is not. Under home, only home itself, a direct
// child (`~/projects`, `~/*`) and anything in a credential or config directory count, so
// `rm -rf ~/.cache/pip` passes. A target may be quoted. A `..` segment anywhere
// (`~/a/../..`) can climb back to home, so it counts as dangerous too. A root followed by a
// glob (`/*`, `'/'?*`, `/[a-z]*`, `/{*,.*}`, `C:\*`, and PowerShell's `\*` for the current
// drive) is the root;
// `C:*` is the current directory on drive C, so a drive root needs the separator there.
// isDangerousDelete also tests the segment as bash would hand it over (`\/*`, `/""*`).
const RM_HOME = String.raw`(^|\s)["']?${HOME_SPELLINGS}([\\/][^\s\\/"']*)?[\\/]?["']?(\s|$)|(^|\s)["']?${HOME_SPELLINGS}[\\/]\.(ssh|claude|aws|config|gnupg)([\\/"'\s]|$)`;
const RM_DANGER = new RegExp(
  String.raw`(^|\s)[a-z]:(\s|$)|(^|\s)["']?(\/|\\|[a-z]:[\\/])["']?(\[[^\]\s]*\]|\{[*?.,\\/]*\}|[*?.\\/])*["']?(\s|$)|${RM_HOME}|\s\.\.(\s|[\\/]|$)|[\\/]\.\.([\\/"'\s]|$)|\s\*(\s|$)|(^|\s|[\\/])\.git(\s|[\\/]|$)`,
  'i'
);

function isDangerousDelete(seg) {
  const posix = /^rm\b/i.test(seg);
  const ps = /^remove-item\b/i.test(seg) || /^(rd|rmdir)\b/i.test(seg);
  if (!posix && !ps) return false;
  const flags = seg.match(/(?:^|\s)-{1,2}[a-z]+/gi) || [];
  const joined = flags.join(' ');
  const recursive = posix ? /r/i.test(joined) : /recurse/i.test(joined);
  const forced = posix ? /f/i.test(joined) : /force/i.test(joined);
  if (!recursive || !forced) return false;
  return RM_DANGER.test(seg) || RM_DANGER.test(shellWord(seg));
}

// A destructive command written into a runner file (Makefile target, npm script, shell
// script) is invisible to the shell rules once it is invoked by name: `make nuke` is just
// a word. So the payload must not be written at all. Prose files are not checked, since a
// README or a test can legitimately quote `rm -rf ~`.
const RUNNER_EXT = 'mk|sh|bash|zsh|ps1|cmd|bat';
const RUNNER_FILE = new RegExp(String.raw`(^|[\\/])(makefile|justfile|package\.json|[^\\/]+\.(${RUNNER_EXT}))$`, 'i');
const RUNNER_REDIRECT = new RegExp(String.raw`(>>?|\|\s*tee(\s+-a)?)\s*["']?(\S*?(makefile|justfile|package\.json|\S+\.(${RUNNER_EXT})))["']?(\s|$)`, 'i');

// A comment, or an echo with no redirect and no `| tee` outside quotes, runs nothing.
const isMessageLine = (line) =>
  /^\s*#/.test(line) ||
  (/^\s*(echo|printf|write-host|write-output)(\s|$)/i.test(line) && !/>|\|\s*tee\b/i.test(unquoted(line)));

function destructiveLine(content) {
  const text = String(content).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  // A Makefile recipe line starts with a tab and maybe `@` or `-`; an npm script is a
  // quoted JSON value; a printf/echo payload is a quoted string that may span lines.
  // Check every line, and every line of every quoted string, except a string on a comment
  // line or on an echo line that goes to the terminal: that one is a message.
  const units = [text];
  for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)) {
    const end = text.indexOf('\n', m.index + m[0].length);
    if (isMessageLine(text.slice(text.lastIndexOf('\n', m.index) + 1, end < 0 ? text.length : end))) continue;
    units.push((m[1] ?? m[2]).replace(/\\(.)/g, '$1'));
  }
  for (const unit of units) {
    for (const raw of unit.split(/\r?\n/)) {
      const c = raw.replace(/^[\s@-]+/, '').trim();
      if (!c) continue;
      if (isDangerousDelete(c)) return c;
      for (const [re] of DESTRUCTIVE) if (re.test(c)) return c;
    }
  }
  return null;
}

function denyRunnerPayload(line, target) {
  deny(
    `fabflows: this puts a destructive command (${line.slice(0, 40)}) into a runner file (${target}). The guard cannot see inside a Makefile target or script once it is invoked by name, so the payload must not be written at all. Use an inert stand-in such as echo.`
  );
}

// ---------------------------------------------------------------- live config
// Narrow on purpose. Only genuinely live configuration is protected -- the hook
// registry, user-level hook scripts, the installed plugin cache, and git's own hooks.
// Everything else under ~/.claude stays writable: CLAUDE.md, plans/, projects/ (the
// memory directory), agents/. Denying the whole tree would break the memory system,
// plan mode's own writes, and any edit to CLAUDE.md.
const PROTECTED_ROOTS = ['settings.json', 'settings.local.json', 'hooks', 'plugins'].map((p) =>
  norm(path.join(os.homedir(), '.claude', p))
);

function isProtectedPath(p) {
  if (!p) return false;
  const n = norm(expandHome(p));
  if (/(^|\/)\.git\/hooks(\/|$)/.test(n)) return true;
  return PROTECTED_ROOTS.some((root) => under(n, root));
}

// Shell-side equivalent: text matching, since there is no path argument to resolve.
// Reading live config is fine; disarming the guard needs a write. Shell has too many
// ways to write to enumerate, so this is a short allowlist of read-only commands and
// everything else that names a protected path is denied. A redirect anywhere in the
// segment denies regardless, since `cat x > settings.json` starts with a reader.
const READ_ONLY =
  /^(cat|bat|sed(?!.*\s(-[a-z]*i|--in-place))|less|more|head|tail|grep|rg|fd|find|tree|jq|stat|file|wc|diff|cmp|comm|cut|tr|nl|tac|rev|column|basename|dirname|du|ls|echo|printf|test|\[|<|cd|pushd|popd|realpath|readlink|sha\d*sum|md5sum|shasum|get-content|gc|type|select-string|get-childitem|gci|dir|test-path|get-item|gi|resolve-path|set-location|sl|push-location|pop-location|get-filehash|compare-object|sort-object|measure-object|select-object|convertfrom-json)(\.exe)?(\s|$)/i;
// `for d in ...; do cat x; done` splits into a header and `do cat x`; both read as unknown
// commands. Repeated, because `else if cmd` stacks two keywords and stripping one would
// leave `if cmd` to slip past every rule anchored at segment start.
const SHELL_KEYWORD = /^((do|then|else|elif|fi|done|esac|while|until|if)\s+)+/i;
// What is left when a segment is only a keyword. Neither runs anything.
const INERT = /^(done|fi|esac)$/i;
// One or more `VAR=value` prefixes, including a segment that is nothing but assignments.
// `VAR=$(` is stripped as a unit, so the substituted command is judged as a command, and
// a redirect in the value is not swallowed: `X=1>file` truncates file, so the value stops
// at a redirect and the segment is judged whole.
const VAR_PREFIX = /^(\w+=(\$\(|[^\s<>]*(\s+|$)))+/;
// Prefixes that run the command after them: `time npx foo` is judged as `npx foo`. Their
// flags go too, including the value of a flag that takes one as a separate word
// (`xargs -n 1`, `xargs -I {}`, `env -u VAR`, `exec -a name`). `env` leaves its
// `VAR=value` pairs to VAR_PREFIX. `env -S 'cmd'` leaves a quoted command, whose quote
// goes next. `timeout`, `nice`, `stdbuf`, `watch` and `ionice` wrap a command the same way.
// `command -v`/`-V` (in any flag cluster) only looks a name up, so it is left alone. The flags are
// case-sensitive (`-P` and `-p` differ for xargs), so the prefix name is lower-cased
// first: `Env` and `TIME` run the same binary on a case-insensitive filesystem.
const TRANSPARENT =
  /^((time|nohup)(\s+-\S+)*\s+|command(?!(\s+-\w+)*\s+-\w*[vV]\b)(\s+-\S+)*\s+|timeout(\s+(-[sk]\s*\S+|--(signal|kill-after)\s+\S+|-\S+))*\s+\S+\s+|nice(\s+(-n\s*\S+|--adjustment\s+\S+|-\S+))*\s+|stdbuf(\s+(-[ioe]\s*\S+|-\S+))*\s+|watch(\s+(-[n]\s*\S+|--interval\s+\S+|-\S+))*\s+|ionice(\s+(-[cnp]\s*\S+|-\S+))*\s+|exec(\s+(-a\s+\S+|-\S+))*\s+|env(\s+(-[uC]\s*\S+|--(unset|chdir)\s+\S+|-\S+))*\s+|xargs(\s+(-[nILPsdEa]\s*\S+|--(max-args|max-lines|max-procs|max-chars|delimiter|arg-file|eof|replace)\s+\S+|-\S+))*\s+|!\s*|\{\s+)/;
const TRANSPARENT_NAME = /^(time|nohup|command|exec|env|xargs|timeout|nice|stdbuf|watch|ionice)(?=\s)/i;
const stripPrefixes = (s) => {
  for (let prev; prev !== s; ) {
    prev = s;
    s = s
      .replace(/^[\s(]+/, '')
      .replace(SHELL_KEYWORD, '')
      .replace(VAR_PREFIX, '')
      .replace(TRANSPARENT_NAME, (w) => w.toLowerCase())
      .replace(TRANSPARENT, '')
      .replace(/^(["'])([^"'\s]+)\1(?=\s|$)/, '$2')
      .replace(/^["'](?=\S)/, '');
  }
  return s.trim();
};
// A `>` inside quotes is text (`echo "a -> b"`), not a redirect.
// ponytail: no real quote parsing; an unbalanced quote is left in, which errs toward deny.
const unquoted = (s) => s.replace(/"[^"]*"|'[^']*'/g, '');
const redirects = (s) => unquoted(s).includes('>');

// Split on `&&`, `||`, `;`, `|`, `&`, CR and LF, but only outside quotes, so a commit
// message or a grep pattern is not read as a command. A backslash escapes the next
// character outside single quotes. A quote still open at the end falls back to the naive
// split, which errs toward deny.
const NAIVE_SPLIT = /&&|\|\||[;|&\r\n]/;
function splitSegments(command) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === '\\' && quote !== "'" && i + 1 < command.length) {
      cur += c + command[++i];
    } else if (quote) {
      if (c === quote) quote = null;
      cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (';|&\r\n'.includes(c)) {
      out.push(cur);
      cur = '';
      if ((c === '&' || c === '|') && command[i + 1] === c) i++;
    } else {
      cur += c;
    }
  }
  if (quote) return command.split(NAIVE_SPLIT);
  out.push(cur);
  return out;
}
// The header runs nothing unless it carries a substitution -- but it hides the path in a
// variable the rules below cannot follow, so it is read-only only when the body is too.
const FOR_HEADER = /^for\s+\w+\s+in\s+(?!.*(\$\(|`))/i;
// `~/.claude/` in every spelling a shell string can carry it.
const CLAUDE_HOME = String.raw`${HOME_SPELLINGS}[\\/]\.claude[\\/]`;
const PROTECTED_SHELL = new RegExp(String.raw`(^|[\s"'>=])${CLAUDE_HOME}(settings\.json|settings\.local\.json|hooks|plugins)([\\/"'\s;|&)]|$)|[\\/]\.git[\\/]hooks([\\/"'\s;|&)]|$)`, 'i');
// Discarding or merging a stream (`2>/dev/null`, `2>&1`) is not a write. Stripped from the
// raw command before the split, because `2>&1` would otherwise be cut on its `&`. A digit
// is required after `>&`, so `cat x >& file` still counts as a redirect.
const HARMLESS_REDIRECT = /\d*>&\d+|\d*>>?\s*(\/dev\/null|\$null)\b/gi;
// Running a script that ships in the plugin cache or a user hook is a read of it, not a
// write. Only a path directly after the interpreter (past its flags) qualifies, so
// `python fix.py ~/.claude/settings.json` stays denied. The interpreter may sit at a path
// (`./.venv/Scripts/python.exe`); only its basename is checked. Redirects still deny below.
// The interpreter is optional: `~/.claude/hooks/notify.sh` runs the script too, and so does
// PowerShell's `& "<script>"` once the split has removed the `&`. python's `-X` and `-W`
// take a separate value.
const RUNS_PROTECTED_SCRIPT = new RegExp(String.raw`^(["']?(\S*[\\/])?(node|deno|bun|python3?|py|uv|bash|sh|pwsh|powershell)(\.exe)?["']?\s+(run\s+)?(-[XW]\s+\S+\s+|-\S+\s+)*)?["']?${CLAUDE_HOME}(plugins|hooks)[\\/]`, 'i');
// A copy out of live config is a read of it. The destination (the `-Destination` value,
// else the last word) must not be live config, nor home, `~/.claude` itself or a `.git`
// directory, where a copy can overwrite a protected file by name. `cp -t` names its target
// first, and a flag after a path can make the last word a flag value, so neither is a read.
const COPY = /^(cp|copy-item)(\s|$)/i;
const COPY_INTO_DIR = new RegExp(String.raw`^${HOME_SPELLINGS}([\\/]\.claude)?[\\/]?$|(^|[\\/])\.git([\\/]|$)`, 'i');
function isReadCopy(seg, cwd) {
  if (!COPY.test(seg)) return false;
  // A word may join quoted and bare parts (`"$HOME"/.claude`), so match it whole.
  const args = (seg.replace(COPY, '').match(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g) || []).map((a) => a.replace(/["']/g, ''));
  if (/^cp/i.test(seg) && args.some((a) => /^(-[a-zA-Z]*t|--target-directory)/.test(a))) return false;
  const d = args.findIndex((a) => /^-destination$/i.test(a));
  let dest = args[d + 1];
  if (d < 0) {
    const first = args.findIndex((a) => !a.startsWith('-'));
    if (first < 0 || args.slice(first).some((a) => a.startsWith('-'))) return false;
    dest = args[args.length - 1];
  }
  if (!dest) return false;
  // Every home variable resolves to the real home, so `$HOME/.claude/.` is `~/.claude` below.
  const abs = norm(path.resolve(cwd, expandHome(dest.replace(/^(\$HOME|\$\{HOME\}|\$env:USERPROFILE)(?=[\\/]|$)/i, '~'))));
  const home = norm(os.homedir());
  return (
    !PROTECTED_SHELL.test(dest) && !COPY_INTO_DIR.test(dest) && !isProtectedPath(abs) &&
    abs !== home && abs !== home + '/.claude' && !/(^|\/)\.git(\/|$)/.test(abs)
  );
}
// The marketplace clone is source, not live config: nothing under it runs until it is
// copied into the cache, and that copy stays denied. So git may fetch and check it out.
// Only these subcommands, and checkout/switch take one bare branch: `worktree add`,
// `clone`, and `-c core.hooksPath=` can all write outside the clone.
const MARKETPLACE_GIT = new RegExp(String.raw`^git\s+-C\s+["']?${CLAUDE_HOME}plugins[\\/]marketplaces[\\/](?:(?!\.\.)[^\s"'])*["']?\s+(fetch|pull|status|log|show|diff|rev-parse|ls-remote|(checkout|switch)\s+[^\s-]\S*\s*$)`, 'i');
// Flags that make an otherwise read-only command execute or delete: find -exec/-delete,
// rg --pre, fd -x, git --upload-pack. A segment carrying one is never read-only.
const EXEC_FLAGS =
  /\s(-delete|-exec(dir)?|-ok(dir)?|-fprint\w*|--pre(-glob)?|--search-zip|--exec(-batch)?|--upload-pack|--receive-pack)(\s|=|$)|^fd(\.exe)?\s+(.*\s)?-[xX](\s|$)/;

// ---------------------------------------------------------------- git state
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 2000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function branches(cwd) {
  let current = null;
  try {
    current = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  } catch {
    return null; // not a repo, or no git -- fail open
  }
  if (!current || current === 'HEAD') return null; // detached HEAD is not a branch
  let def = null;
  try {
    def = git(['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], cwd).replace(
      /^origin\//,
      ''
    );
  } catch {
    /* no origin/HEAD configured */
  }
  const defaults = def ? [def] : ['main', 'master'];
  return { current, defaults };
}

// ---------------------------------------------------------------- shell rules
// Returns the first install segment, if any, so the caller can ask or deny only after
// every other rule has had its chance to deny.
// Commands that move the shell into a directory the guard cannot always follow.
const CHANGE_DIR = /^(cd|pushd|set-location|sl|push-location|chdir)(\s|$)/i;

// Where a `git push` segment pushes: every refspec's destination branch, with `HEAD` as
// the current branch. An empty list means no refspec, so the current branch is pushed.
// `--all` and `--mirror` return null, since they push every branch.
const PUSH_VALUE_FLAG = /^(--repo|-o|--push-option)$/;
function pushDestinations(seg, current) {
  const args = seg.replace(GIT_PUSH, '').trim().split(/\s+/).filter(Boolean).map(unquote);
  const words = [];
  for (let i = 0; i < args.length; i++) {
    if (/^--(all|mirror)$/.test(args[i])) return null;
    if (PUSH_VALUE_FLAG.test(args[i])) i++;
    else if (!args[i].startsWith('-')) words.push(args[i]);
  }
  // The first word is the remote.
  return words.slice(1).map((ref) => {
    const r = ref.replace(/^\+/, '');
    const dst = r.includes(':') ? r.slice(r.indexOf(':') + 1) : r;
    const name = dst.replace(/^refs\/heads\//, '');
    return name === 'HEAD' ? current : name;
  });
}
function checkShell(command, cwd) {
  const installs = [];
  for (const re of PIPE_TO_SHELL) {
    if (re.test(unquoted(command))) {
      deny('fabflows: piping a download straight into a shell is blocked. Download it, read it, then run it.');
    }
  }

  // `printf 'nuke:\\n\\trm -rf ~' > Makefile` starts its only segment with printf, so the
  // anchored rules below never see the payload. When any redirect targets a runner file,
  // scan the whole command: a later `>> Makefile` carries a payload too.
  const redirect = RUNNER_REDIRECT.exec(command);
  if (redirect) {
    const line = destructiveLine(command);
    if (line) denyRunnerPayload(line, redirect[3]);
  }

  // Split on shell separators outside quotes, then anchor every pattern at segment start.
  // That is what makes `echo "npm install"` allowed and a bare `npm install` blocked.
  // Newlines and `&` separate too, and a leading `(`, a shell keyword, a
  // `VAR=value` prefix (even when it is the whole segment) and a transparent prefix such
  // as `time` are stripped, so none of them hides a command from the anchor. The raw
  // segment is kept, because `NPM_CONFIG_PREFIX=<path> npm i` names its target there.
  const parts = splitSegments(command.replace(HARMLESS_REDIRECT, ''))
    .map((raw) => [raw.trim(), stripPrefixes(raw)])
    .filter(([, s]) => s);
  const segments = parts.map(([, s]) => s);

  // `for d in ~/.claude/plugins; do rm -rf "$d"; done` must not pass on its header alone.
  const loopReadOnly = segments.every(
    (s) => INERT.test(s) || FOR_HEADER.test(s) || (!redirects(s) &&!EXEC_FLAGS.test(s) && READ_ONLY.test(s))
  );

  // `cd x && git commit` is judged in x, not in the session cwd, so a command that
  // moves into a worktree is checked against that worktree's branch.
  let effCwd = cwd;
  let movedIntoConfig = false;
  // `git checkout -b fix && git commit` commits on fix, not on the branch checked out now.
  let newBranch = null;
  for (const [raw, seg] of parts) {
    if (CHANGE_DIR.test(seg)) {
      const dir = seg.replace(CHANGE_DIR, '').replace(/^-(literal)?path\s+/i, '').trim();
      if (dir) effCwd = path.resolve(effCwd, expandHome(unquote(dir)));
    }
    const nb = GIT_NEW_BRANCH.exec(seg);
    if (nb) newBranch = unquote(nb[3]);
    // `cd $HOME/...`, `pushd` and `Set-Location` into live config, which effCwd cannot follow.
    if (CHANGE_DIR.test(seg) && PROTECTED_SHELL.test(seg)) movedIntoConfig = true;

    const isInstall =
      INSTALL.some((re) => re.test(seg)) && !isLocalRun(seg, effCwd) && !isScratchPypdf(seg, effCwd);
    if (isInstall) {
      // Aimed at live config, by the directory it runs in, by a VAR= prefix or by a flag:
      // never askable. A mention of live config elsewhere in the command does not count.
      if (isProtectedPath(effCwd) || movedIntoConfig || PROTECTED_SHELL.test(raw)) {
        deny(`fabflows: this install lands in live Claude Code configuration (${seg.slice(0, 60)}), which is blocked. That is what stops a worker from disarming this guard. Stop and report it; do not work around it.`);
      }
      installs.push(seg);
    }

    if (isDangerousDelete(seg)) {
      deny(`fabflows: destructive recursive delete blocked (${seg.slice(0, 60)}).`);
    }

    for (const [re, why] of DESTRUCTIVE) {
      if (re.test(re === SYSTEM_REDIRECT ? unquoted(seg) : seg)) deny(`fabflows: blocked -- ${why}.`);
    }

    if (GIT_FORCE_DELETE.test(seg)) {
      deny('fabflows: blocked -- git branch -D force-deletes an unmerged branch. Use -d, which refuses if the work is not merged.');
    }

    if (READERS.test(seg) && isSecretPath(seg)) {
      deny('fabflows: reading a credential-bearing file is blocked. If it is genuinely needed, read it yourself outside the session.');
    }

    if (GIT_ADD.test(seg) && isSecretPath(seg)) {
      deny('fabflows: staging a credential-bearing file is blocked.');
    }

    // A package runner (`npx`, `uv run --with`) is an install, never a read of the path.
    const readOnly =
      (!isInstall && RUNS_PROTECTED_SCRIPT.test(seg)) ||
      // After a move into live config that effCwd cannot follow, a relative target may be in it.
      (!movedIntoConfig && isReadCopy(seg, effCwd)) ||
      (!EXEC_FLAGS.test(seg) &&
        (READ_ONLY.test(seg) || (FOR_HEADER.test(seg) && loopReadOnly) || MARKETPLACE_GIT.test(seg)));
    if (PROTECTED_SHELL.test(seg) && (redirects(seg) || !readOnly)) {
      deny('fabflows: modifying live Claude Code configuration or git hooks is blocked. That is what stops a worker from disarming this guard. Reads are allowed: use the Read, Glob or Grep tools, or a plain ls/cat with no redirect.');
    }

    if (GIT_OP.test(seg) && !GIT_ABORT.test(seg)) {
      // A `cd` the guard could not follow (a variable, `-`, a missing directory, a
      // subshell) leaves effCwd outside any repo; judge in the session cwd rather than
      // let the cd erase the branch check.
      const b = branches(effCwd) || (effCwd !== cwd ? branches(cwd) : null);
      if (!b) continue; // fail open
      const current = newBranch || b.current;
      if (GIT_PUSH.test(seg)) {
        // A push is judged by the branch it writes to, not the one checked out. Force-push
        // is narrowed the same way: --force-with-lease on your own branch is routine.
        const dests = pushDestinations(seg, current);
        const hit = dests === null || dests.some((d) => b.defaults.includes(d)) || (!dests.length && b.defaults.includes(current));
        if (hit && (GIT_FORCE.test(seg) || /\s\+\S/.test(seg))) {
          deny(`fabflows: force-pushing to the default branch '${b.defaults.join("' or '")}' is blocked.`);
        }
        if (hit) {
          deny(`fabflows: git push to the default branch '${b.defaults.join("' or '")}' is blocked. Push a branch named for the change instead.`);
        }
      } else if (b.defaults.includes(current)) {
        deny(
          `fabflows: ${seg.split(/\s+/).slice(0, 2).join(' ')} on the default branch '${current}' is blocked. Create a branch named for the change first.`
        );
      }
    }
  }
  return installs;
}

// ---------------------------------------------------------------- event handlers
function preToolUse(input) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.cwd();

  if (tool === 'Bash' || tool === 'PowerShell' || tool === 'Monitor') {
    if (typeof ti.command !== 'string') return;
    const installs = checkShell(ti.command, cwd);
    if (installs.length) install(installs, input);
    return;
  }

  if (tool === 'Read' || tool === 'Grep') {
    const target = ti.file_path || ti.path;
    if (isSecretPath(target) || isSecretDir(target) || (tool === 'Grep' && isSecretGlob(ti.glob))) {
      deny('fabflows: reading a credential-bearing file is blocked. If it is genuinely needed, read it yourself outside the session.');
    }
    return;
  }

  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
    const target = ti.file_path || ti.notebook_path;
    if (isProtectedPath(target)) {
      deny('fabflows: writing to live Claude Code configuration or a git hook is blocked. That is what stops a worker from disarming this guard.');
    }
    if (isSecretPath(target)) {
      deny('fabflows: writing to a credential-bearing file is blocked.');
    }
    const content = ti.new_string || ti.content;
    if (typeof content === 'string' && RUNNER_FILE.test(target)) {
      const line = destructiveLine(content);
      if (line) denyRunnerPayload(line, target);
    }
    if (typeof content === 'string' && SECRET_CONTENT.test(content)) {
      deny(`fabflows: this edit introduces a string matching a known secret format into ${target}. Use an environment variable or a secret store.`);
    }
  }
}

function subagentStop(input) {
  if (input.stop_hook_active) return; // loop guard -- never re-block our own block
  // A missing or unreadable transcript throws, and main() fails open.
  const tail = fs.readFileSync(input.agent_transcript_path, 'utf8').slice(-40000);

  // The tail is raw JSONL, where `"command"` and `"output"` appear as keys in every tool
  // call. A word followed by a quote is a key, not prose, and does not count. A researcher
  // reports searches and fetches rather than commands.
  const groups = [
    [/files?\s+(touched|changed)|modified files/i, 'files touched'],
    [/\b(command|output|(search|fetch)\w*)\b(?!")|exit (code|status)/i, 'commands and their real output'],
    [/\bconfirmed\b|\binferred\b|\bguessed\b/i, 'confidence labels'],
  ];
  const missing = groups.filter(([re]) => !re.test(tail)).map(([, label]) => label);

  // Lenient on purpose. This greps prose, so it will sometimes be wrong; a strict check
  // false-blocks, and every false block costs a whole extra worker turn.
  if (missing.length >= 2) {
    block(
      `Your report is missing required contract fields: ${missing.join('; ')}. Re-emit the final report with files touched as path:line, each command plus its real output, and a confidence label (confirmed / inferred / guessed) on every claim.`
    );
  }
}

// ---------------------------------------------------------------- entry point
function main() {
  const raw = fs.readFileSync(0, 'utf8');

  // Diagnostic only. It logs and then falls through to the normal rules -- it never
  // short-circuits enforcement, so it cannot be used to disarm the guard.
  if (process.env.FABFLOWS_PROBE) {
    try {
      fs.appendFileSync(process.env.FABFLOWS_PROBE, raw.replace(/\r?\n/g, ' ') + '\n');
    } catch {
      /* diagnostics never block */
    }
  }

  const input = JSON.parse(raw);
  if (input.hook_event_name === 'SubagentStop') subagentStop(input);
  else preToolUse(input);
}

try {
  main();
} catch {
  // Fail open. See the header.
}
process.exit(0);
