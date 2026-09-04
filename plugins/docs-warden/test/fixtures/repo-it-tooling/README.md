# cert-rotate

Rotates the client certificates on edge hubs before they expire.

## What this is

A synthetic fixture repository. It exists so the docs-warden scripts are
exercised against something shaped like a real it-tooling repo. All data here is
invented.

## Quick start

```powershell
Import-Module ./src/CertRotate.psm1
Invoke-CertRotation -HubName hub-lab-01 -WhatIf
```

## Documentation

| Document | What it answers |
|----------|-----------------|
| [CONVENTIONS.md](docs/CONVENTIONS.md) | How we do things here today |
| [DECISIONS.md](docs/DECISIONS.md) | Why we do them that way |
| [GLOSSARY.md](docs/GLOSSARY.md) | What our words mean |
| [RUNLOG.md](docs/RUNLOG.md) | What was done outside git |
| [docs/runbook.md](docs/runbook.md) | How to run a rotation |
