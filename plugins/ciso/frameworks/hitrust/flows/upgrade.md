# Upgrade (flow e)

Read this when `ciso:upgrade` dispatches here, that is, the plugin's bundled `frameworks/hitrust/<tier>.v*.structure.json` is a newer version than `state.json`'s `tiers.<tier>.controlSetVersion`. Every other verb checks for this first and stops, sending the user here, because interview and roadmap data may need reconciling against the new structure before those flows touch it.

1. Tell the user a newer HITRUST framework version is available for this tier and ask (`AskUserQuestion`) whether to reconcile now or defer.
2. If proceeding, run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/diff-structure-versions.js" <old-structure-file> <new-structure-file>
   ```

   where `<old-structure-file>` is `${CLAUDE_PLUGIN_ROOT}/frameworks/hitrust/previous/<tier>.<old controlSetVersion>.structure.json` (the version `state.json` records for the tier) and `<new-structure-file>` is the tier's current `${CLAUDE_PLUGIN_ROOT}/frameworks/hitrust/<tier>.v*.structure.json`, to get an added/removed/modified/unchanged report (heuristic, not authoritative for topic-level tiers: flag ambiguous cases for the user's judgment rather than trusting the classification blindly).
3. Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/reconcile-state-version.js" <docs/ciso-dir>/state.json hitrust <tier> <new-structure-file>
   ```

   This never deletes assessment/roadmap data: unchanged/modified ids carry their existing `assessment`/`roadmap` forward (modified ones flagged `needsReview: true`), new ids are seeded `not_assessed`, and ids no longer present move to that tier's `archivedControls` bucket rather than being dropped.
4. Call the dashboard regenerator, then present a summary (carried forward / needing review / new / archived counts).
