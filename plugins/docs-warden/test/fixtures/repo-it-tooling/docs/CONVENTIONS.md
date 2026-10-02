---
owner: it-team
review_by: 2027-06-01
generated: false
---

# Conventions

How we work in this repository today.

## Stack

PowerShell 7.4. No compiled dependencies.

## Repository layout

`src/` holds the module. `docs/` holds everything a reader needs beyond the README.

## Branches and commits

Branch per ticket. Conventional Commits, imperative subject, 72 characters at most.

## Naming

Cmdlets use approved PowerShell verbs. Hub identifiers are `hub-<site>-<nn>`.

## Testing

`pwsh -c "Invoke-Pester ./tests"`. Every exported function has a test.

## Documentation

Every pull request updates the affected documents or says why not.
The reason for a rule sits next to the rule.

## Generated files

| Path | Regenerate with |
|------|-----------------|
| `docs/architecture/domain-model.md` | `domain_model.py . --write` |
