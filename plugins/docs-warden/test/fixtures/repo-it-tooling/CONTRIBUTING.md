# Contributing

This repository takes internal contributions only. Open an issue before starting
anything larger than a fix, so the runbook and the module do not diverge.

## Before you open a pull request

- `Invoke-Pester ./tests` passes.
- `PSScriptAnalyzer` reports nothing new.
- The runbook is updated in the same pull request, or the template says why not.

## What gets a change merged

One maintainer review, a green pipeline, and a runbook that still describes what
the module actually does.

## Reporting a security problem

Do not open a public issue. See [SECURITY.md](docs/SECURITY.md).
