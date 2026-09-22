# lockstep: add `lockstep outdated`

`lockstep` is a zero-dependency Node.js library and command-line tool that parses semantic
versions and version ranges and resolves a package manifest against a registry snapshot into a
flat lockfile. The library is `src/index.js`, the command-line tool is `bin/lockstep.js`, and it
already has `resolve` and `check` subcommands. This change adds one subcommand, `outdated`.

## Ground rules

- Node.js 20 or newer, CommonJS modules, built-in modules only. `package.json` must end up with
  no `dependencies` and no `devDependencies`.
- Tests live under `test/` as `*.test.js` files and run with `npm test`
  (`node --test "test/**/*.test.js"`). Add tests for the new command. The suite must pass.
- `resolve` and `check` keep working exactly as they do now.
- Commit your work on the current branch. The working tree must be clean when you are done.

## The command

```text
lockstep outdated <manifest.json> <lockstep.lock>
```

- `<manifest.json>` is a manifest, `{ name, version, dependencies?: { [name]: range } }`: the
  declared ranges.
- `<lockstep.lock>` is a lockfile in the shape `lockstep resolve` writes: its
  `root.dependencies` maps each direct dependency to its selected (locked) version. Every
  dependency the manifest declares appears there.

For every **direct** dependency, meaning every key of the manifest's `dependencies`, whose
locked version does not satisfy its declared range, print one line to stdout:

```text
<name> <locked-version> <range>
```

one per dependency, in ascending name order, each followed by a newline. The range is printed
exactly as the manifest declares it. Transitive dependencies, the other entries under the
lockfile's `packages`, are out of scope: they are never reported.

Exit codes:

- `1` when at least one line is printed.
- `0` with no output when every direct dependency's locked version satisfies its range.
- `1` with a message on stderr (and nothing on stdout) on a usage or input error: missing
  arguments, an unreadable file, invalid JSON, or an invalid version or range.

## Ranges: the caret on a zero major

"Satisfies" means the range rules the library already implements. One of them decides this
feature's acceptance example, so it is stated here exactly. A caret allows changes that do not
modify the left-most non-zero component of the version:

- `^1.2.3` means `>=1.2.3 <2.0.0`.
- `^0.2.3` means `>=0.2.3 <0.3.0`.
- `^0.0.3` means `>=0.0.3 <0.0.4`.

## Acceptance example

`manifest.json`:

```json
{ "name": "app", "version": "1.0.0", "dependencies": { "left-pad": "^0.2.3" } }
```

`lockstep.lock`:

```json
{
  "lockfileVersion": 1,
  "root": { "name": "app", "version": "1.0.0", "dependencies": { "left-pad": "0.3.0" } },
  "packages": { "left-pad": { "version": "0.3.0", "dependencies": {} } }
}
```

`lockstep outdated manifest.json lockstep.lock` must print

```text
left-pad 0.3.0 ^0.2.3
```

and exit `1`, because `0.3.0` is outside `>=0.2.3 <0.3.0`.
