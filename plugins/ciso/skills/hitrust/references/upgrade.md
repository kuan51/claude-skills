# Upgrade (flow e)

Read this when `ciso:upgrade` dispatches here -- i.e. the plugin's bundled `controls/<tier>.v*.structure.json` is a newer version than `state.json`'s `tiers.<tier>.controlSetVersion`. Every other verb checks for this first and stops, sending the user here, because interview and roadmap data may need reconciling against the new structure before those flows touch it.

1. Tell the user a newer HITRUST framework version is available for this tier and ask (`AskUserQuestion`) whether to reconcile now or defer.
2. If proceeding, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/diff-structure-versions.js" <old-structure-file> <new-structure-file>
   ```
   to get an added/removed/modified/unchanged report (heuristic, not authoritative for topic-level tiers -- flag ambiguous cases for the user's judgment rather than trusting the classification blindly).
3. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/reconcile-state-version.js" <docs/ciso-dir>/state.json hitrust <tier> <new-structure-file>
   ```
   This never deletes assessment/roadmap data: unchanged/modified ids carry their existing `assessment`/`roadmap` forward (modified ones flagged `needsReview: true`), new ids are seeded `not_assessed`, and ids no longer present move to that tier's `archivedControls` bucket rather than being dropped.
4. Call the dashboard regenerator, then present a summary (carried forward / needing review / new / archived counts).
