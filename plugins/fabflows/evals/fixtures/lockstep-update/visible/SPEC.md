# lockstep: add `lockstep update`

`lockstep` is a zero-dependency Node.js library and command-line tool that parses semantic
versions and ranges and resolves a manifest against a registry snapshot into a flat lockfile. The
library is `src/index.js`, the tool is `bin/lockstep.js`, and it already has `resolve` and
`check`. This change adds one subcommand, `update`.

## Ground rules

- Node.js 20 or newer, CommonJS modules, built-in modules only. `package.json` must end up with
  no `dependencies` and no `devDependencies`.
- Tests live under `test/` as `*.test.js` files and run with `npm test`. Add tests for the new
  command. The suite must pass. `resolve` and `check` keep working exactly as they do now.
- Commit your work on the current branch. The working tree must be clean when you are done.

## The command

```text
lockstep update <manifest.json> <lockstep.lock> <registry.json> [--out <file>]
```

It reads a manifest, an existing lockfile in the shape `resolve` writes, and a registry snapshot
in the shape `resolve` reads, and prints a new lockfile to stdout: the same shape and key-ordering
rules as `resolve`, two-space JSON, a trailing newline. With `--out <file>` it writes the file
and prints nothing. `src/index.js` also exports `update(manifest, lockfile, registry)`, which
returns the lockfile object; the command calls it.

The manifest may have changed since the lockfile was written: ranges bumped, dependencies added
or removed. The registry may have gained versions. Existing registry versions never change their
dependencies, and the old lockfile was valid against the registry when it was written. A locked
version that is no longer in the registry counts as changed whatever replaces it.

## Rules

The new lockfile selects one version per package name and must satisfy:

- **R1, edges hold.** Every dependency of the root, and of every selected package version, is
  satisfied by the selected version of that dependency.
- **R2, nothing extraneous.** Every selected package is reachable from the root.
- **R5, prereleases.** A prerelease version is a candidate only where the range rules admit it.
- **R6, cycles.** Packages may depend on each other in a cycle; `update` must still finish.
- **R8, determinism.** The same inputs produce a deep-equal lockfile.

`resolve`'s rule that no single package can be upgraded (R4) does **not** apply. In its place:

- **U1, minimal change.** A package *changes* when it appears in the new lockfile's `packages`
  at a version different from the old lockfile's, or appears in the new lockfile and not in the
  old. Packages that disappear do not count. Among all lockfiles satisfying R1, R2, R5 and R6,
  choose one with the fewest changed packages.
- **U2, tie-break.** Among those, prefer the lockfile whose changed set, as a list of names in
  `Object.keys` order, is lexicographically smallest, comparing name by name and then treating a
  shorter list as smaller. Among those, compare the changed packages' selected versions in the
  same name order and prefer the higher version at the first difference. Versions never carry
  build metadata, so "higher" is total. With equal changed versions the lockfiles are identical,
  so the answer is unique.
- **U3, failure.** `update` has no answer exactly when `resolve(manifest, registry)` has none.
  Throw `ResolutionError` with `name === 'ResolutionError'`, a non-empty `message` and a
  non-empty `conflicts` array, as `resolve` does.

Exit codes: `0` on success; `1` on a usage or input error, including a lockfile whose
`lockfileVersion` is not `1`, whose `root` or `packages` is not an object, or whose `packages`
entry lacks a string `version`; `2` on a `ResolutionError`, with an `error:` line on stderr.

Scale: registries of up to 20 packages with up to 6 versions each; each `update` call must
finish within 10 seconds.

## Examples

Every manifest is `{ "name": "app", "version": "1.0.0", "dependencies": ... }`; below, `deps`
is its `dependencies`, `lock` lists the old lockfile's `packages` versions, and `pkg(x)` is a
registry entry `{ "dependencies": x }`.

1. Nothing needs to change. deps `{ "a": "^1.0.0" }`; registry `a` 1.0.0 `pkg({ "b": "^1.0.0" })`,
   `b` 1.0.0 `pkg({})`; lock `b` 1.0.0, `a` 1.0.0, with `packages` keys written `b` before `a`.
   The output is the old lockfile re-emitted in canonical order:
   `{"lockfileVersion":1,"root":{"name":"app","version":"1.0.0","dependencies":{"a":"1.0.0"}},
   "packages":{"a":{"version":"1.0.0","dependencies":{"b":"1.0.0"}},"b":{"version":"1.0.0","dependencies":{}}}}`
2. A range bump moves a direct and a transitive dependency. deps were `{ "a": "^1.0.0", "b":
   "^1.0.0" }` and are now `{ "a": "^2.0.0", "b": "^1.0.0" }`; registry `a` 1.0.0
   `pkg({ "c": "^1.0.0" })` and 2.0.0 `pkg({ "c": "^2.0.0" })`, `b` 1.0.0 and 1.1.0 both
   `pkg({ "c": ">=1.0.0" })`, `c` 1.0.0, 2.0.0 and 2.1.0 `pkg({})`; lock `a` 1.0.0, `b` 1.0.0,
   `c` 1.0.0. New `packages`: `a` 2.0.0, `b` 1.0.0, `c` 2.1.0. Two changes, `a` and `c`; `b`
   stays although 1.1.0 exists, and `c` takes 2.1.0 by U2.
3. A removed dependency drops out. deps were `{ "a": "^1.0.0", "b": "^1.0.0" }` and are now
   `{ "a": "^1.0.0" }`; registry `a` 1.0.0 `pkg({})`, `b` 1.0.0 `pkg({ "d": "^1.0.0" })`, `d`
   1.0.0 `pkg({})`; lock `a`, `b` and `d` at 1.0.0. New `packages`: `a` 1.0.0 only. Zero changes.
