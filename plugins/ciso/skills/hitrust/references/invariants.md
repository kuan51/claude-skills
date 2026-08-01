# HITRUST CSF — invariants

**Every `ciso:` verb reads this file after resolving `certKey: hitrust`, before doing anything
else.** These hold no matter which verb is running. A verb's own reference file not being loaded is
never an excuse to skip one of them.

HITRUST CSF has three nested tiers (e1 ⊂ i1 ⊂ r2). Almost everything below is parameterized by
which one the user means. If `certifications.hitrust` doesn't exist yet, or the user hasn't said
which tier, ask (`AskUserQuestion`): e1 (recommended starting point), i1, or r2. Remind them of the
authority difference below when i1 or r2 is chosen.

## Tier authority — always communicate this to the user

- **e1 and i1** both ship `sourceAuthority: "public-topic-level"` content: topic-level structure
  compiled from public sources only (HITRUST advisories, public secondary write-ups,
  HITRUST-authorized-assessor write-ups) -- no licensed MyCSF export is used as an input to either
  shipped file. Explicitly non-authoritative; every entry citation-backed; a
  `relatedControlCode`/`legacyCategoryPrefix` is populated only on the minority of entries where a
  public citation actually verified that specific code, never invented for the rest. **Always tell
  the user this is non-authoritative and point them at MyCSF or an authorized assessor for exact
  scope, counts, and wording** before they rely on it for a real assessment. HITRUST's verbatim
  requirement-statement wording is licensed content and never lives in this plugin regardless.
- **r2** ships a small illustrative-only example set (not the real ~2000+-entry scope) pending its
  own dedicated compilation pass -- tell the user this explicitly if r2 comes up.
- If an org obtains its own licensed `<tier>` MyCSF export, importing it **replaces that tier's
  `controls` map wholesale** (this plugin's synthetic topic-level ids never line up with real
  per-statement MyCSF ids -- there's no field-level merge path). Whatever was previously registered
  is archived first, not deleted, tagged `archivedReason: "import-replaced"`, as a raw safety-net
  snapshot -- see `ciso:import`.

## Check for a pending version upgrade first

**Before any verb touches control data, unconditionally:** if
`certifications.hitrust.tiers.<tier>` already exists AND the plugin's bundled
`controls/<tier>.v*.structure.json` has a newer `controlSetVersion` than what's recorded in state,
**stop and send the user to `ciso:upgrade`** -- do not proceed with the verb they asked for.
Interview and roadmap data may need reconciling against the new structure before any flow should
touch it.

This was a routing step when HITRUST had a single entry point. It is an invariant now precisely
because there are many entry points: every one of them has to make the same check, or a user who
happens to start with `ciso:interview` silently assesses against a stale control set.

**Two carve-outs, or the rule eats itself:**

- **`ciso:upgrade` is exempt.** It is the verb this check sends people to, so applying the check to
  it would tell a user with a pending upgrade to stop and run the thing they are already running.
  When `ciso:upgrade` reads this file, note the pending upgrade as confirmation it has work to do
  and carry on.
- **A brand-new tier registration is exempt** -- there is nothing yet to upgrade.

## Core discipline

- **Never hand-edit `state.json` to record or change an assessment.** Every status write goes
  through `apply-assessment.js` -- it's the mechanical gate that enforces the two rules below;
  hand-editing silently bypasses it.
- **"Met" always needs a real justification; "in progress" needs both a current-state and an
  estimated-closeness.** A one-word or evasive answer isn't enough -- ask again rather than record a
  placeholder.
- **Never silently skip a control.** Every control gets asked, even if the answer is "defer."
- **An org's posture stays local.** Justifications and in-progress notes never enter vendor research
  -- only a control's public subject does.
