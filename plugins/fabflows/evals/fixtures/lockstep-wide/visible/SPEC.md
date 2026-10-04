# lockstep: Add `lockstep upgrades`

`lockstep` is a zero-dependency Node.js library and command-line tool that parses semantic
versions and version ranges and resolves a package manifest against a registry snapshot into a
flat lockfile. The library is `src/index.js`, the command-line tool is `bin/lockstep.js`, and it
already has `resolve` and `check` subcommands. This change adds one subcommand, `upgrades`.

## Ground rules

- Node.js 20 or newer, CommonJS modules, built-in modules only. `package.json` must end up with
  no `dependencies` and no `devDependencies`.
- Tests live under `test/` as `*.test.js` files and run with `npm test`
  (`node --test "test/**/*.test.js"`). Add tests for the new command. The suite must pass.
- `resolve` and `check` keep working exactly as they do now.
- Commit your work on the current branch. The working tree must be clean when you are done.

## The command

```text
lockstep upgrades <manifest.json> <lockstep.lock> <registry.json>
```

- `<manifest.json>` is a manifest, `{ name, version, dependencies?: { [name]: range } }`: the
  declared ranges.
- `<lockstep.lock>` is a lockfile in the shape `lockstep resolve` writes: its
  `root.dependencies` maps each direct dependency to its selected (locked) version. Every
  dependency the manifest declares appears there.
- `<registry.json>` is a registry snapshot in the shape `lockstep resolve` reads,
  `{ [name]: { [version]: { dependencies?: { [name]: range } } } }`.

For every **direct** dependency, meaning every key of the manifest's `dependencies`, in
ascending name order:

1. Parse its declared range with `parseRange` and its locked version with `parseVersion`.
2. Find the highest registry version of that package that satisfies the declared range, with
   `maxSatisfying` over the package's registry versions. A package the registry does not list
   has no versions.
3. If there is one and `compareVersions` ranks it above the locked version, print one line to
   stdout:

```text
<name> <locked-version> <highest-satisfying-version>
```

each followed by a newline. Versions are printed exactly as the lockfile and the registry spell
them. Transitive dependencies, the other entries under the lockfile's `packages`, are out of
scope: they are never reported.

The command uses the four library functions named above. It adds no exports.

Exit codes:

- `0` on success, whether or not any line is printed.
- `1` with a message on stderr (and nothing on stdout) on a usage or input error: missing
  arguments, an unreadable file, invalid JSON, or an invalid version or range in any of the
  three files.

## Acceptance example

`manifest.json`:

```json
{ "name": "app", "version": "1.0.0", "dependencies": { "left-pad": "^1.2.0", "right-pad": "~2.0.0" } }
```

`lockstep.lock`:

```json
{
  "lockfileVersion": 1,
  "root": { "name": "app", "version": "1.0.0", "dependencies": { "left-pad": "1.2.0", "right-pad": "2.0.1" } },
  "packages": {
    "left-pad": { "version": "1.2.0", "dependencies": {} },
    "right-pad": { "version": "2.0.1", "dependencies": {} }
  }
}
```

`registry.json`:

```json
{
  "left-pad": { "1.2.0": {}, "1.3.0": {}, "2.0.0": {} },
  "right-pad": { "2.0.1": {}, "2.1.0": {} }
}
```

`lockstep upgrades manifest.json lockstep.lock registry.json` must print

```text
left-pad 1.2.0 1.3.0
```

and exit `0`: `1.3.0` is the highest `left-pad` inside `>=1.2.0 <2.0.0` and is newer than the
locked `1.2.0`, while the highest `right-pad` inside `>=2.0.0 <2.1.0` is the locked `2.0.1`
itself.
