# Contributing

Pull requests are welcome — for a new plugin, a fix to an existing one, or a
documentation correction.

## Before you open a pull request

- Open an issue first for anything larger than a fix, so the approach can be
  agreed before you write the code.
- Run `node --test "test/*.test.js"` (root-level marketplace/manifest
  consistency), plus the test suite under whichever `plugins/<name>/test/`
  your change touches.
- Update the docs in the same pull request. The template asks why if you did not.

## What gets a change merged

- Every plugin is self-contained under its own `plugins/<name>/` directory —
  unrelated plugins should not share files (see [CLAUDE.md](CLAUDE.md)).
- A plugin's `version` in `plugin.json` and its `marketplace.json` entry must
  agree; `test/marketplace-consistency.test.js` enforces this.
- Commit messages follow Conventional Commits: `type(scope): subject`.
- No secrets in the diff.

## Reporting a security problem

Do not open a public issue. See [docs/SECURITY.md](docs/SECURITY.md).
