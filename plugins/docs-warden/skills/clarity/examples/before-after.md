# Before and after

Six worked examples across firmware, service and IT-tooling domains. All content
is synthetic.

Vale skips blockquote content in Markdown, so running the linter over this file
does not reproduce the findings below -- the "before" text sits inside quotes and
is never scanned. That is useful to know generally: quoting a bad example in a
blockquote will not trip the linter, and neither will it in your own documentation.
Verified with vale 3.9.1.

---

## 1. Runbook step — safety condition order

**Rule:** `SafetyConditionFirst`

**Before:**

> Abort the rotation if the hub reports a certificate error.

**After:**

> If the hub reports a certificate error, abort the rotation.

**Note:** The reader acts on the first clause. Leading with "abort" invites an
abort before the condition is read.

---

## 2. Runbook step — two actions in one step

**Rule:** `OneInstructionPerStep`

**Before:**

> Run the rotation in preview mode, then confirm the new expiry date.

**After:**

1. Run the rotation in preview mode.
2. Confirm the new expiry date.

**Note:** A reader interrupted between the two actions cannot tell from a single
step which half they finished.

---

## 3. BLE pairing procedure — passive voice and length

**Rules:** `Microsoft.Passive`, `Microsoft.SentenceLength` (delegated)

**Before:**

> Once the bonding process has been completed by the handle and the
> characteristics have been discovered, the connection interval may then be
> renegotiated by the central in order to reduce the power that is consumed.

**After:**

> After the handle completes bonding and discovers the characteristics,
> the central renegotiates the connection interval. This reduces power use.

**Note:** Same facts, named actors, two sentences. Nothing was dropped.

---

## 4. Architecture description — wordiness

**Rules:** `Microsoft.Wordiness`, `write-good.TooWordy` (delegated)

**Before:**

> It should be noted that, in the majority of cases, the service has
> the capability to process snapshots in a manner that is asynchronous.

**After:**

> The service usually processes snapshots asynchronously.

**Note:** Fourteen words carried no information. "Usually" keeps the hedge that
"in the majority of cases" was making.

---

## 5. Decision record consequence — vague attribution

**Rule:** `Microsoft.Passive` (delegated)

**Before:**

> It was decided that the sentinel return value would be removed, as
> it was felt that errors were being missed.

**After:**

> We removed the sentinel return value because callers were ignoring it
> and treating the sentinel as a valid reading.

**Note:** The rewrite says who decided and what actually went wrong. "It was felt"
hides both.

---

## 6. Requirement statement — flagged, not rewritten

**Rule:** `RequirementStatement`

**Text:**

> REQ-CORE-014 — The system shall report the mean gradient rounded to one
> decimal place, provided that at least three cardiac cycles have been captured.

**Rewrite:** none.

**Note:** This sentence is long and passive, and both observations are correct. It
is still not ours to change: the wording is traceable and may be under change
control. Raise it with the requirement's owner. Rewriting "provided that at least
three cardiac cycles have been captured" into something tidier risks changing what
was verified.
