# Changelog

Notable changes to this repository, grouped by release. Each plugin also
versions independently in its own `plugin.json`; see `plugins/<name>/` for
per-plugin history until entries are recorded here going forward.

## [Unreleased]

### Fixed

- **docs-warden 0.1.1** -- the run log rotation rule required an entry to be both
  past the 500-line trigger and older than 90 days. Both had to hold, so a busy
  repository tripped the line count with nothing old enough to move: the rule
  selected nothing and the warning stood with advice nobody could follow. The age
  filter is gone; the oldest entries now move until the log is back under the limit.
