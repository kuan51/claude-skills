# pressure-service

Computes derived pressure values from device hub waveform snapshots.

## What this is

A synthetic fixture repository for the docs-warden regulated overlay. It is
shaped like a class B service repo. Nothing here runs against a real device and all
values are invented.

It deliberately contains three defects the audit must catch:

- `DEC-0002` was edited after its status changed to `accepted` (`adr-immutability` fails).
- `REQ-FIX-002` has no test (`regulated` fails).
- `docs/architecture/arc42.md` is past its `review_by` date (`front-matter` warns).

## Quick start

```bash
python3 -m src.pressure --snapshot sample.json
```

## Documentation

| Document | What it answers |
|----------|-----------------|
| [CONVENTIONS.md](docs/CONVENTIONS.md) | How we do things here today |
| [DECISIONS.md](docs/DECISIONS.md) | Why we do them that way |
| [GLOSSARY.md](docs/GLOSSARY.md) | What our words mean |
| [docs/regulatory/](docs/regulatory/) | Regulated artifacts |
