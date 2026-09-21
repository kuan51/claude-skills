# lockstep: a flat dependency resolver

Build `lockstep`, a zero-dependency Node.js library and command-line tool that parses semantic
versions and version ranges, and resolves a package manifest against a registry snapshot into a
flat lockfile.

## Ground rules

- Node.js 20 or newer, CommonJS modules, built-in modules only. `package.json` must end up with
  no `dependencies` and no `devDependencies`. Nothing here needs the network.
- Public API exported from `src/index.js`; command-line tool at `bin/lockstep.js`.
- Your own tests live under `test/` as `*.test.js` files and run with `npm test`
  (`node --test "test/**/*.test.js"`, already in `package.json`). The suite must pass.
- Commit your work on the current branch. The working tree must be clean when you are done.

## 1. Versions

`parseVersion(input)` accepts a string in strict Semantic Versioning 2.0.0 form:
`MAJOR.MINOR.PATCH`, optionally followed by `-` and a prerelease (dot-separated identifiers, each
`[0-9A-Za-z-]+`; an all-numeric identifier must not have a leading zero), optionally followed by
`+` and build metadata (dot-separated identifiers, each `[0-9A-Za-z-]+`). No leading `v`, no
whitespace, no missing parts, no leading zeros in the numeric parts.

It returns a plain object with exactly the properties `{ major, minor, patch, prerelease, build }`,
numbers for the first three and arrays of strings for the last two (empty when absent). It throws a `TypeError` for anything
else, for example `1.2`, `v1.2.3`, `1.2.3.4`, `01.2.3`, `1.2.3-01`, `1.2.3-`, `1.2.3-a..b`, the
empty string, or a non-string. If `input` is already a parsed version object, return it as is.

`compareVersions(a, b)` accepts strings or parsed objects and returns `-1`, `0` or `1` by
Semantic Versioning precedence: numerically by major, then minor, then patch; a version with a
prerelease has lower precedence than the same core version without one; prerelease identifiers
are compared left to right, numeric identifiers numerically, alphanumeric identifiers by ASCII
order, and a numeric identifier is lower than an alphanumeric one; when every shared identifier
is equal, the version with fewer identifiers is lower. Build metadata is ignored, so
`1.0.0+a` and `1.0.0+b` compare equal.

## 2. Ranges

`parseRange(text)` returns a range value (any shape you like) and throws a `TypeError` when the
text is not a range. `satisfies(version, range)` returns a boolean; `version` may be a string or
a parsed version, `range` a string or a parsed range. `maxSatisfying(versions, range)` returns
the highest version string in the array that satisfies the range, or `null`; every element must
be a valid version string, otherwise `TypeError`.

### Grammar

```
range      := set ( "||" set )*             alternatives are ORed
set        := "" | "*" | hyphen | comparator ( " " comparator )*     comparators are ANDed
comparator := ( "=" | "<" | "<=" | ">" | ">=" | "~" | "^" )? partial
hyphen     := partial " - " partial
partial    := X | X "." X | X "." X "." X [ "-" prerelease ] [ "+" build ]
X          := non-negative integer without leading zeros | "x" | "X" | "*"
```

Whitespace around `||` and at either end of the text is ignored. Comparators inside a set are
separated by one or more spaces. There is no whitespace between an operator and its partial.
Once a component of a partial is a wildcard, every later component must also be a wildcard or
absent (`1.x.3` is invalid). A prerelease or build part is allowed only on a partial whose three
components are all numeric (`1.2.x-alpha` and `1.2.x+build` are invalid), and its identifiers
follow the same rules as in a version. A range that does not fit the grammar, such as `>>1.0.0`,
`^`, `abc` or `1.2.3.4`, is a `TypeError`.

### Meaning

Each rule below is exact. `X` stands for the wildcard forms.

- `""`, `*`, `x`, `X`: any version (`>=0.0.0`).
- Wildcard partials: `1`, `1.x`, `1.X`, `1.*` mean `>=1.0.0 <2.0.0`; `1.2`, `1.2.x`, `1.2.*`
  mean `>=1.2.0 <1.3.0`.
- `1.2.3` and `=1.2.3` mean exactly `1.2.3`.
- Operators on a full version compare as written: `>=1.2.3`, `<2.0.0`, and so on.
- Operators on a wildcard partial round the partial outward: `>1.2` is `>=1.3.0`; `<1.2` is
  `<1.2.0`; `>=1.2` is `>=1.2.0`; `<=1.2` is `<1.3.0`; `>1` is `>=2.0.0`; `<=1` is `<2.0.0`.
  An operator on a bare wildcard (`>*`, `<x`, `>=X`, `=*`) means any version.
- Tilde, patch-level changes within a minor: `~1.2.3` is `>=1.2.3 <1.3.0`; `~1.2` is
  `>=1.2.0 <1.3.0`; `~1` is `>=1.0.0 <2.0.0`; `~0.2.3` is `>=0.2.3 <0.3.0`;
  `~1.2.3-beta.2` is `>=1.2.3-beta.2 <1.3.0`.
- Caret, changes that do not modify the left-most non-zero component: `^1.2.3` is
  `>=1.2.3 <2.0.0`; `^0.2.3` is `>=0.2.3 <0.3.0`; `^0.0.3` is `>=0.0.3 <0.0.4`; `^1.2.x` is
  `>=1.2.0 <2.0.0`; `^0.0.x` is `>=0.0.0 <0.1.0`; `^0.2.x` is `>=0.2.0 <0.3.0`; `^1.x` and
  `^1` are `>=1.0.0 <2.0.0`; `^0.x` and `^0` are `>=0.0.0 <1.0.0`; `^1.2.3-beta.2` is
  `>=1.2.3-beta.2 <2.0.0`; `^0.0.3-beta` is `>=0.0.3-beta <0.0.4`.
- Hyphen, an inclusive range whose upper bound rounds outward when partial: `1.2.3 - 2.3.4` is
  `>=1.2.3 <=2.3.4`; `1.2 - 2.3.4` is `>=1.2.0 <=2.3.4`; `1.2.3 - 2.3` is `>=1.2.3 <2.4.0`;
  `1.2.3 - 2` is `>=1.2.3 <3.0.0`.

### The prerelease rule

A version with a prerelease satisfies a set only if, besides meeting every comparator in it, at
least one comparator in that set has a prerelease on the same major.minor.patch. So `1.2.3-alpha`
satisfies neither `^1.2.0` nor `>=1.0.0` nor `*`, but does satisfy `^1.2.3-0`, `>=1.2.3-alpha`,
`>=1.2.3-alpha <2.0.0` and `1.2.3-alpha`; `1.2.4-alpha` does not satisfy `>=1.2.3-alpha`. Versions
without a prerelease are unaffected. Each `||` alternative is judged on its own.

## 3. Resolution

`resolve(manifest, registry)` takes

```
manifest := { name: string, version: string, dependencies?: { [name]: range } }
registry := { [name]: { [version]: { dependencies?: { [name]: range } } } }
```

where `registry` is a plain object snapshot (every key of `registry[name]` is a valid version) and
returns a lockfile object. The root manifest is not in the registry and nothing depends on it. An
invalid version or range anywhere in the inputs is a `TypeError`.

A resolution selects exactly one version for every package it includes (flat: one version per
name for the whole graph). The result must satisfy:

- **R1, edges hold.** Every dependency of the root, and of every selected package version, is
  satisfied by the selected version of that dependency.
- **R2, nothing extraneous.** Every selected package is reachable from the root by following
  selected dependencies.
- **R3, completeness.** If any selection satisfying R1 and R2 exists, return one. The highest
  versions may conflict with each other; when they do, try lower ones. The search must terminate.
- **R4, no single-package upgrade left.** For every selected package `p` at version `v`, there
  is no version `v'` of `p` higher than `v` such that `v'` satisfies every range placed on `p` by
  the root and by the other selected packages, and every dependency of `v'` is satisfied by the
  currently selected version of that dependency. In other words, no one package can be upgraded
  without changing anything else.
- **R5, prereleases.** A prerelease version is a candidate only where the prerelease rule of
  section 2 admits it.
- **R6, cycles.** Packages may depend on each other in a cycle; the resolver must still finish.
- **R7, failure.** When no selection exists, throw a `ResolutionError` (exported, an `Error`
  subclass with `name === 'ResolutionError'`, a non-empty `message`) whose `conflicts` property is
  a non-empty array of `{ name, requirements }`, each naming a package that, at some point in
  the search, either had no version meeting the requirements then placed on it, or whose
  already-selected version failed a requirement a newly tried candidate placed on it, with
  `requirements` a non-empty array of `{ from, range }` holding every requirement placed on that
  package at that point, where `from` is `"root"` or `"<package>@<version>"` and `range` is the
  range text exactly as it appeared in the manifest or registry. When every version of `p` that meets
  the ranges placed on `p` is rejected only because one of its own dependencies `q` cannot be met,
  the conflict is `q`, reported with the requirements placed on `q` at that point, not `p`. A
  dependency on a package missing from the registry, or present with no versions, is
  unsatisfiable in the same way and produces the same error, unless a different version choice
  avoids that dependency.
- **R8, determinism.** The same inputs produce a deep-equal lockfile.

The lockfile has exactly this shape:

```
{
  "lockfileVersion": 1,
  "root": { "name": <manifest.name>, "version": <manifest.version>,
            "dependencies": { <name>: <selected version>, ... } },
  "packages": {
    <name>: { "version": <selected version>,
              "dependencies": { <dependency name>: <selected version>, ... } },
    ...
  }
}
```

`packages` holds every selected package and only those. Properties appear in the order shown.
The keys of `packages`, and the keys of every `dependencies` object, are in ascending string
order (`Object.keys` order). A package or root
with no dependencies has `"dependencies": {}`. Each `dependencies` entry maps a dependency the
selected version declares to the version selected for it; version strings are copied exactly as
they appear in the registry.

## 4. Command line

`bin/lockstep.js` takes a subcommand:

- `lockstep resolve <manifest.json> <registry.json>` prints the lockfile as JSON with two-space
  indentation and a trailing newline to stdout. With `--out <file>` it writes that JSON to the
  file instead and prints nothing.
- `lockstep check <version> <range>` prints `true` or `false` followed by a newline.

Exit codes, the same for every subcommand:

- `0`: success, meaning a lockfile was produced, or `check` printed `true`.
- `1`: usage or input error: missing or unknown subcommand, missing arguments, an unreadable
  file, invalid JSON, or an invalid version or range. A message goes to stderr.
- `2`: valid input with a negative outcome: `resolve` hit a `ResolutionError`, or `check` printed
  `false`. For `resolve`, stderr carries a line starting with `error: ` followed by the message.

## 5. Tests

Write tests under `test/` with `node:test` and `node:assert`. Cover version parsing and
comparison, each desugaring rule in section 2, the prerelease rule, a resolution that needs
backtracking, a conflict error, a dependency cycle, and the command-line exit codes.

## Out of scope

No network, no npm registry format, no nested `node_modules` layouts, no `v` prefix, no tags such
as `latest`, no `peerDependencies` or `optionalDependencies`, no `>=1.2.3 <1.2.3`-style
normalisation of unsatisfiable ranges.
