---
owner: platform-team
review_by: 2026-01-15
generated: false
qms_record: pending
---

# Architecture

Synthetic arc42 subset for the fixture.

<!-- review_by is deliberately in the past, so the fixture proves freshness.py
     and the front-matter audit check catch an overdue document. Do not update
     this date. -->

## Introduction and goals

Compute derived pressure values from hub snapshots, accurately and reproducibly.

## System scope and context

Consumes snapshots from device hubs. Publishes derived values to the
downstream record service.

## Building block view

A single stateless service. `src/pressure.py` holds the calculation.

## Runtime view

A snapshot arrives, is validated, is reduced to a gradient, and is published.

## Deployment view

One container per validation environment.

## Cross-cutting concepts

All rejections raise, none return a sentinel. A wrong number is worse than an
error.

## Architecture decisions

See [DECISIONS.md](../DECISIONS.md).
