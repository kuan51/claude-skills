---
owner: kuan51
review_by: 2027-03-24
generated: false
---

# Close the fabflows guard's delete, chmod and Grep misses

Ticket: fabflows guard misses. The guard review behind
`docs/specs/2026-09-24-fabflows-guard-overbroad.md` also found commands the guard lets through
although its README says it blocks them. That spec deferred them (its line 15 and its Deferred
list). The review's full list was never written down, so this spec covers the three misses it
named, `rm -rf /*`, `chmod -R 777` and a `Grep` with `glob: .env`, plus the close variants
probed on `8c37ebd` by piping PreToolUse JSON into `guard.js`. Every case listed as allowed
today below was observed allowed.

## Behaviour

All in `plugins/fabflows/hooks/guard.js` unless another file is named. Each rule below was
prototyped as a `node -e` script during design; every Denied example was denied and every
Still allowed example allowed.

### 1. A root followed by a glob is the root (`RM_DANGER`)

`RM_DANGER` (line 258) matches `/` or a drive root only as a whole word, so a glob after it
hides it.

- Keep the existing root alternative, and add one more: an optional quote, then `/` or a drive
  root **with** a separator (`C:\`, `C:/`), then an optional quote, then zero or more of `*`,
  `?`, `.`, `/` or `\`, then an optional quote, then a space or the end. Prototype:
  `(^|\s)["']?(\/|[a-z]:[\\/])["']?[*?.\\/]*["']?(\s|$)`.
- Denied (new): `rm -rf /*`, `/.*`, `"/"*`, `/**`, `/*/`, `//*`, `/.`, `/?*`, `/*?`,
  `'/'?*`, `'/'`, `"/"`, `C:\*`, `C:/*`, and `Remove-Item -Recurse -Force C:\*`. Already
  denied, unchanged: `/`, `C:\`, `C:`.
- Still allowed: `./*`, `build/*`, `/tmp/x/*`, `./build`, `*.log`, `/tmp`, `'/tmp'`, and
  `C:*` and `C:.*`, which mean the current directory on drive C.
- Home is unchanged: `~/*` and `~/.*` are already denied as direct children of home.
- `destructiveLine` reuses `isDangerousDelete`, so a `package.json` script `rm -rf /*` is
  denied too.

### 2. Any chmod mode word that grants world write

The rule `^chmod\s+[0-7]*7{2,3}\b` (line 239) needs the mode right after `chmod`, so any
flag hides it, and it knows only numeric modes.

- Replace it with a function `worldWritable(seg)`. For a segment starting with `chmod`, check
  **every** word after `chmod`, not only the first non-flag word, because a symbolic mode can
  start with `-` (`chmod -x,o+w f` is a mode: GNU chmod ran on a scratch file gave
  `-rw-----w-`). A word matches when either:
  - it is numeric and matches the existing `^[0-7]*7{2,3}$`, or
  - one of its comma-separated clauses matches `^([ugoa]*)((?:[-+=][rwxXstugo]*)+)$`, its
    who-part contains `o` or `a`, and one of its `+` or `=` operators is followed by `w` or
    by a copy letter (`u`, `g`, `o`).
- Denied: `chmod -R 777 .`, `--recursive 777 x`, `0777`, `1777`, `a+rwx`, `o+w`, `-R a+w /`,
  `ugo+w`, `go+w`, `a=rwx`, `u+x,o+w`, `-x,o+w`, `-r,a+w`, `o-r+w`, `o+rw-x`, `o=u`, `a=g`.
- Still allowed: `chmod +x`, `+w` (umask applies with no who-part), `u+w`, `g+w`, `o-w`,
  `a-w`, `755`, `-R 755 x`, `644`, `-v 644 f`, `-R u+rwX,go+rX x`.
- Accepted false block: a file literally named `777` (`chmod 644 777`) is read as a mode.
- Wire it into both `checkShell` and `destructiveLine`, so a runner file that writes
  `chmod -R 777 .` is denied too. The reason text becomes "chmod makes a path
  world-writable".

### 3. Grep checks its glob, and a secret directory without a slash

`preToolUse` (line 657) checks only `file_path` or `path` for `Read` and `Grep`.

- **Glob.** For `Grep`, also check `ti.glob` with `isSecretGlob`:
  - Split the glob on whitespace and check each piece, in case the tool splits it (not
    known either way).
  - A piece starting with `!` (an exclusion), or made only of `*`, `?` and `/`, is not
    checked: `*` and `**/*` search what no glob would, which is a known gap.
  - Otherwise convert it to a regex anchored as `(^|/)<glob>$`: `**` or `**/` becomes `.*`,
    `*` becomes `[^/]*`, `?` becomes `[^/]`, `{a,b}` becomes `(?:a|b)`, `[...]` passes
    through as-is, and every other regex metacharacter is escaped. If the regex still fails
    to compile, deny. Test it case-insensitively against a fixed list of sample secret
    names: `.env`, `.env.local`, `.env.production`, `x.pem`, `x.key`, `id_rsa`,
    `id_ed25519`, `.ssh/id_rsa`, `.aws/credentials`, `.npmrc`, `.pypirc`. Deny on any
    match. The list holds no `config`, so everyday `config` globs pass, matching the path
    rule, which allows `~/.aws/config`.
  - Denied: `.env`, `*.env`, `**/.env*`, `.env*`, `.env.*`, `*.pem`, `*.key`, `id_rsa`,
    `*.{env,pem}`, `**/.ssh/**`, `.en*`, `*env`, `id_*`, `*.pe?`, `.ssh/*`, `**/.aws/**`,
    `.e[n]v`, `.*`, `*.*`, `**/.*`, `*.env.production`, `**/.env.prod*`, `*.md .env`.
  - Still allowed: `.env.example`, `*.env.example`, `*.md`, `*.ts`, `*.{ts,tsx}`, `src/**`,
    `package.json`, `*`, `**/*`, `?*`, `!.env`, `*config*`, `**/config`, `config`, `*.yml`.
  - Accepted false blocks: rare broad globs that can match a secret name, such as `*.local`,
    `*rc`, `*.k*` and `*.p*`.
- **Directory.** For `Read` and `Grep`, a `file_path` or `path` matching
  `(^|[\\/])\.(ssh|aws)([\\/]+\.?)*$` is a secret, so trailing `/`, `//`, `/.` and `/./`
  do not hide it. Denied: `~/.ssh`, `/root/.aws/`, `.ssh`, `C:\Users\a\.ssh`,
  `/root/.aws/.`, `/root/.aws//`, `/root/.aws/./`. Still allowed: `deploy.ssh`, `~/.sshd`,
  `x.aws`, `/a/.aws/cli`, `/a/.aws/config`.
  The shell rules are unchanged.
- Both use the existing credential-read deny message.

### 4. Docs and version

- `plugins/fabflows/README.md`: the destructive-commands bullet names a root glob (`/*`)
  and symbolic world-write; the credential-files bullet says a `Grep` glob and a bare
  `~/.ssh` or `~/.aws` path are checked. Known gaps gain every Out of scope item a reader
  could mistake for covered.
- fabflows 0.7.1 → 0.7.2 in `plugins/fabflows/.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`, and an entry in the root `CHANGELOG.md`. Descriptions
  unchanged.

## Check

- `node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"` pass.
- `plugins/fabflows/test/guard.test.js` gains a `denies` for every Denied example and an
  `allows` for every Still allowed example in sections 1 to 3, plus one runner-file `denies`
  each for `rm -rf /*` and `chmod -R 777 .` written into `package.json`. Every new `denies`
  that is not marked "already denied" fails on the base commit `8c37ebd` before the fix.
- No existing test changes its expected result.

## Out of scope

- New delete targets such as `/usr`, `/etc` or `/var` (a new rule, not a miss).
- Octal modes with the world-write bit that are not `77`-shaped (`chmod 666`, `chmod 002`).
- `chmod --reference`, and brace or bracket forms that hide the root (`rm -rf /{*,.*}`,
  `rm -rf /[a-z]*`).
- A `Grep` glob that only matches a secret name not on the sample list.
- A `Grep` over `.` or `~` with no glob, which can still read `.env` or `~/.ssh`: the guard
  cannot see which files a search opens.
- The `Glob` tool, which lists names but not contents.
- Any shell-rule change for secrets.

## Decisions

- **Root plus glob only** (user, Q1a). The README already promises a root block; system
  directories are a new rule. Rejected: adding `/usr`, `/etc` now.
- **Symbolic world-write is blocked** (user, Q2b). The block's own reason is
  world-writability, and `o+w` is exactly that. `+w` with no who-part is left alone because
  umask removes other-write by default.
- **Glob matched against sample secret names** (user, Q3; reworked after the lens pass).
  The first draft deleted `*` and `?` and ran `isSecretPath` on what was left. The refuter
  showed `.en*`, `*env`, `id_*`, `.ssh/*` and `**/.aws/**` getting through, so that was
  rejected. A glob-to-regex tested against a fixed list of names covers them. Accepted gap:
  a secret name missing from the list (for example `prod.env`) is not caught. The code
  carries a `ponytail:` comment naming the list as the ceiling.
- **`.*` and `*.*` are denied** (default, veto here). Both match `.env`. The rare legitimate
  use can pass an explicit `path` instead.
- **chmod checks every word** (lens pass). Skipping `-`-words hid `chmod -x,o+w`. Cost: a
  file named `777` is read as a mode.
- **Two lens passes.** The second found the bare quoted root (`'/'`, allowed on `8c37ebd`),
  `/?*`, and `.aws/.` path forms; all three are closed above. Every rule's final form was
  re-run as a `node -e` prototype against its full Denied and Still allowed lists.
- **Amendment after the build: the directory regex is `([\\/]\.?)*`, case-insensitive.**
  The `([\\/]+\.?)*` form above backtracks exponentially on a run of slashes (26 slashes
  took 492 ms), and a guard that times out fails open. The shorter form matches the same
  strings in 0 ms. The `i` flag matches `SECRET_PATH`, so `~/.SSH` is denied too.
- **Amendment after review: two one-token gaps closed.** `worldWritable` drops quotes
  before reading modes, so `chmod 'o+w' f` is denied. `isSecretPath` collapses doubled
  separators and `./` segments first, so `Read`, `Write` and `cat` of `~/.aws//credentials`
  are denied; the fix sits in the shared function, so every caller gets it.
- **Amendment after the code review: the rules now read words and paths the way the
  shell and the Grep tool do.** A review of the PR found bypasses in every section, all
  confirmed by probing the hook. `shellWord` removes quotes and backslash escapes before
  the rm and chmod rules (`\/*`, `/""*`, `o\+w`). chmod now judges only its mode word,
  the first non-option word, applies clauses in order (`a+w,o-w` passes) and accepts
  `=777`; this replaces "chmod checks every word" above, so a file named `777` is no
  longer misread. A PowerShell `\*` is a root. Paths are also tested after
  `path.posix.normalize`, so `..` segments do not hide a secret, and an exempt name is cut
  out instead of exempting the whole string. A Grep glob is split on commas as the tool
  does, a piece with no wildcard is checked like a path, only its last one or two path
  parts are tried against the samples, `\x` and `[!x]` mean what they mean to rg, runs
  of `**` collapse to one `.*`, and a piece with more than four brace groups is denied
  because stacked alternations backtrack exponentially (ten groups took 16 s). Not fixed:
  shell readers such as `rg`, `grep`, `sed` and `awk` are not checked for credential
  files; the README now lists that as a known gap.
- **Amendment after a refuter pass on the review fixes.** The Grep tool's own split
  (read in the installed `cli.js`) keeps a piece whole only when it holds both `{` and
  `}`, and the guard now matches it exactly. Braces are expanded before the tail check,
  so a path inside braces is seen, and more than 64 expansions is denied; this replaces
  the four-group cap. A wildcard-free tail is checked like a path (`**/.env.staging`,
  `**/.ssh`). Paths are also tested in their shell-unquoted form. A root behind a
  bracket or wildcard-only brace glob counts as the root, and `$'...'` is unquoted. The
  octal chmod test now reads the others digit (`666`, `776`, `0002`), which drops the
  `77`-shaped limit from Out of scope.
- **Directory rule local to Read and Grep** (user, Q3b). Changing `SECRET_PATH` would also
  change the shell rules, for example `ls ~/.ssh`, which is not in this spec.
- **Patch bump** to 0.7.2: each item closes a gap against a rule the README already states.
- **No decision record.** Each change reverses in one PR.

## Deferred

- System directories as delete targets.
- Octal world-write beyond `77`.
- Bracket and brace globs in delete targets and Grep globs.
- A `Grep` that sweeps `.env` through a broad path.
