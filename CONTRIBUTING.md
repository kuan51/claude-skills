# Contributing

Pull requests are welcome, whether for a new plugin, a fix to an existing one, or a
documentation correction.

## Before you open a pull request

- Open an issue first for anything larger than a fix, so the approach can be
  agreed before you write the code.
- Run `node --test "test/*.test.js"` (root-level marketplace/manifest
  consistency), plus the tests of whichever plugin your change touches. Each
  plugin's command is under Testing in [docs/CONVENTIONS.md](docs/CONVENTIONS.md).
- Update the docs in the same pull request. The template's checklist line leaves a blank for the reason if you did not.

## What gets a change merged

- Plugins are self-contained under their own `plugins/<name>/` directory.
  Unrelated plugins should not share files (see [CLAUDE.md](CLAUDE.md)).
- A plugin's `version` in `plugin.json` and its `marketplace.json` entry must
  agree; `test/marketplace-consistency.test.js` enforces this.
- Commit messages follow Conventional Commits: `type(scope): subject`.
- No secrets in the diff.

## Reporting a security problem

Do not open a public issue. See [docs/SECURITY.md](docs/SECURITY.md).
