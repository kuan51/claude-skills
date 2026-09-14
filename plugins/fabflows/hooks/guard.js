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

// ---------------------------------------------------------------- decisions
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
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
  /^(pnpm|yarn|bun)\s+(i|install|add|a)\b/i,
  /^pip3?\s+install\b/i,
  /^uv\s+(pip\s+install|add)\b/i,
  /^dotnet\s+(add\s+package|tool\s+install)\b/i,
  /^(cargo|go|gem)\s+install\b/i,
  /^apt(-get)?\s+install\b/i,
  /^(brew|winget|choco|scoop)\s+install\b/i,
  /^install-(module|package|script)\b/i,
];

// Secret-bearing paths. Accepts either separator so a Windows path matches too.
const SECRET_PATH =
  /(^|[\s"'\\/])\.env($|[.\s"'\\/])|\.pem\b|\.key\b|\bid_rsa\b|\bid_ed25519\b|[\\/]\.aws[\\/]credentials|[\\/]\.ssh[\\/]|\.npmrc\b|\.pypirc\b/i;

// .env.example and friends are committed scaffolding that agents legitimately read and
// edit in most repos. Blocking them would be a false positive on nearly every project.
const SECRET_EXEMPT = /\.env\.(example|sample|template|dist)\b/i;

const isSecretPath = (p) => !!p && !SECRET_EXEMPT.test(p) && SECRET_PATH.test(p);

const SECRET_CONTENT =
  /AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[0-9A-Za-z-]{10,}|AIza[0-9A-Za-z_-]{35}/;

const READERS = /^(cat|less|more|head|tail|strings|xxd|od|bat|get-content|gc|type)\b/i;

const GIT_OP = /^git\s+(-c\s+\S+\s+)?(commit|push|merge|rebase)\b/i;
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

const DESTRUCTIVE = [
  [/^git\s+(-c\s+\S+\s+)?reset\s+--hard\b/i, 'git reset --hard discards uncommitted work'],
  [/^git\s+(-c\s+\S+\s+)?clean\s+-[a-z]*d/i, 'git clean -d deletes untracked files'],
  [/^chmod\s+[0-7]*7{2,3}\b/i, 'chmod 777 makes a path world-writable'],
  [/^dd\b[^|]*\bof=/i, 'dd with of= overwrites a device or file wholesale'],
  [/^mkfs(\.|\s)/i, 'mkfs formats a filesystem'],
  [/^format-volume\b/i, 'Format-Volume formats a volume'],
  [/^set-executionpolicy\b/i, 'Set-ExecutionPolicy changes a machine-wide security setting'],
  [/^sudo\b/i, 'sudo escalates privileges'],
  [/>\s*\/(etc|usr|bin|sbin|boot|sys)\//i, 'writing into a system path'],
];

// rm -rf / Remove-Item -Recurse -Force are only destructive at a dangerous target.
// `rm -rf ./build` is routine; `rm -rf ~` is not.
const RM_DANGER =
  /(^|\s)(\/|~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|[a-z]:[\\/]?)(\s|$)|(^|\s)(~|\$HOME|\$env:USERPROFILE)[\\/]|\s\.\.(\s|[\\/]|$)|\s\*(\s|$)|(^|\s|[\\/])\.git(\s|[\\/]|$)/i;

function isDangerousDelete(seg) {
  const posix = /^rm\b/i.test(seg);
  const ps = /^remove-item\b/i.test(seg) || /^(rd|rmdir)\b/i.test(seg);
  if (!posix && !ps) return false;
  const flags = seg.match(/(?:^|\s)-{1,2}[a-z]+/gi) || [];
  const joined = flags.join(' ');
  const recursive = posix ? /r/i.test(joined) : /recurse/i.test(joined);
  const forced = posix ? /f/i.test(joined) : /force/i.test(joined);
  if (!recursive || !forced) return false;
  return RM_DANGER.test(seg);
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
  const n = norm(p);
  if (/(^|\/)\.git\/hooks(\/|$)/.test(n)) return true;
  return PROTECTED_ROOTS.some((root) => under(n, root));
}

// Shell-side equivalent: text matching, since there is no path argument to resolve.
// Reading live config is fine; disarming the guard needs a write. Shell has too many
// ways to write to enumerate, so this is a short allowlist of read-only commands and
// everything else that names a protected path is denied. A redirect anywhere in the
// segment denies regardless, since `cat x > settings.json` starts with a reader.
const READ_ONLY =
  /^(cat|less|more|head|tail|grep|rg|fd|find|tree|jq|stat|file|wc|diff|ls|echo|printf|test|\[|cd|pushd|popd|realpath|readlink|sha\d*sum|md5sum|shasum|get-content|gc|type|select-string|get-childitem|gci|dir|test-path|get-item|gi|resolve-path|set-location|sl|push-location|pop-location|get-filehash)(\.exe)?(\s|$)/i;
const PROTECTED_SHELL =
  /(^|[\s"'>])(~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|[a-z]:[\\/]users[\\/][^\s\\/]+)[\\/]\.claude[\\/](settings\.json|settings\.local\.json|hooks[\\/]|plugins[\\/])|[\\/]\.git[\\/]hooks[\\/]/i;
// Running a script that ships in the plugin cache or a user hook is a read of it, not a
// write. Only a path directly after the interpreter (past its flags) qualifies, so
// `python fix.py ~/.claude/settings.json` stays denied. Redirects still deny below.
const RUNS_PROTECTED_SCRIPT =
  /^(node|deno|bun|npx|python3?|py|uv|bash|sh|pwsh|powershell|&)(\.exe)?\s+(run\s+)?(-\S+\s+)*["']?(~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|[a-z]:[\\/]users[\\/][^\s\\/]+)[\\/]\.claude[\\/](plugins|hooks)[\\/]/i;
// The marketplace clone is source, not live config: nothing under it runs until it is
// copied into the cache, and that copy stays denied. So git may fetch and check it out.
const MARKETPLACE_GIT =
  /^git\s+-C\s+["']?(~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|[a-z]:[\\/]users[\\/][^\s\\/]+)[\\/]\.claude[\\/]plugins[\\/]marketplaces[\\/]/i;

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
function checkShell(command, cwd) {
  for (const re of PIPE_TO_SHELL) {
    if (re.test(command)) {
      deny('fabflows: piping a download straight into a shell is blocked. Download it, read it, then run it.');
    }
  }

  // Split on shell separators, then anchor every pattern at segment start. That is what
  // makes `echo "npm install"` allowed and a bare `npm install` blocked, without having
  // to parse quoting.
  const segments = command
    .split(/&&|\|\||[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    for (const re of INSTALL) {
      if (re.test(seg)) {
        deny(
          `fabflows: package installs are blocked (${seg.slice(0, 60)}). Ask the user to install it themselves, or report the missing dependency as a blocker.`
        );
      }
    }

    if (isDangerousDelete(seg)) {
      deny(`fabflows: destructive recursive delete blocked (${seg.slice(0, 60)}).`);
    }

    for (const [re, why] of DESTRUCTIVE) {
      if (re.test(seg)) deny(`fabflows: blocked -- ${why}.`);
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

    if (
      PROTECTED_SHELL.test(seg) &&
      (seg.includes('>') || !(READ_ONLY.test(seg) || RUNS_PROTECTED_SCRIPT.test(seg) || MARKETPLACE_GIT.test(seg)))
    ) {
      deny('fabflows: modifying live Claude Code configuration or git hooks is blocked. That is what stops a worker from disarming this guard.');
    }

    if (GIT_OP.test(seg)) {
      const b = branches(cwd);
      if (!b) continue; // fail open
      const onDefault = b.defaults.includes(b.current);
      if (onDefault) {
        deny(
          `fabflows: ${seg.split(/\s+/).slice(0, 2).join(' ')} on the default branch '${b.current}' is blocked. Create a branch named for the change first.`
        );
      }
      // Force-push is narrowed to default branches. Rewriting history on a shared
      // branch is the actual rule; --force-with-lease on your own feature branch is
      // routine and a blanket block would fight the user weekly.
      if (GIT_FORCE.test(seg) && b.defaults.some((d) => new RegExp(`(^|[\\s:/])${d}(\\s|$)`).test(seg))) {
        deny(`fabflows: force-pushing to the default branch '${b.defaults.join("' or '")}' is blocked.`);
      }
    }
  }
}

// ---------------------------------------------------------------- event handlers
function preToolUse(input) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.cwd();

  if (tool === 'Bash' || tool === 'PowerShell') {
    if (typeof ti.command !== 'string') return;
    checkShell(ti.command, cwd);
    return;
  }

  if (tool === 'Read' || tool === 'Grep') {
    const target = ti.file_path || ti.path;
    if (isSecretPath(target)) {
      deny('fabflows: reading a credential-bearing file is blocked. If it is genuinely needed, read it yourself outside the session.');
    }
    return;
  }

  if (tool === 'Edit' || tool === 'Write') {
    const target = ti.file_path;
    if (isProtectedPath(target)) {
      deny('fabflows: writing to live Claude Code configuration or a git hook is blocked. That is what stops a worker from disarming this guard.');
    }
    if (isSecretPath(target)) {
      deny('fabflows: writing to a credential-bearing file is blocked.');
    }
    const content = ti.new_string || ti.content;
    if (typeof content === 'string' && SECRET_CONTENT.test(content)) {
      deny(`fabflows: this edit introduces a string matching a known secret format into ${target}. Use an environment variable or a secret store.`);
    }
  }
}

function subagentStop(input) {
  if (input.stop_hook_active) return; // loop guard -- never re-block our own block
  // A missing or unreadable transcript throws, and main() fails open.
  const tail = fs.readFileSync(input.agent_transcript_path, 'utf8').slice(-40000);

  const groups = [
    [/files?\s+(touched|changed)|modified files/i, 'files touched'],
    [/\bcommand\b|\boutput\b|exit code/i, 'commands and their real output'],
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
