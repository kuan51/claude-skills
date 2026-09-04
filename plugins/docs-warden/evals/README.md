# Evals

Prompts for checking that the two skills trigger and behave. Each names the skill
that should fire and what a good answer looks like.

Run them against a scratch copy of a fixture, never against a real repository:
several ask the model to write files.

| # | Prompt | Should trigger | Pass looks like |
|---|--------|----------------|-----------------|
| 1 | "Scaffold docs for this PowerShell repo" | `docs-warden` init | Proposes `archetype: it-tooling` and **waits** before writing `.docs-warden.yml`. Creates only missing files. |
| 2 | "Audit this repo's docs" | `docs-warden` audit | Runs `audit.py`, shows the table, offers fixes, changes nothing unasked. |
| 3 | "Record a decision to replace Proxmox with Hyper-V" | `docs-warden` decide | Runs `adr_new.py`, asks for the considered options and gaps accepted rather than inventing them, leaves `status: proposed`. |
| 4 | "The README says three env vars but there are seven, fix it" | `docs-warden` maintain | Reads the code, lists the real seven, proposes a specific edit. Does not rewrite the whole README. |
| 5 | "Rewrite this runbook step in plain English: Abort the rotation if the hub reports a certificate error." | `clarity` | Flags `SafetyConditionFirst` and puts the condition first. Keeps the condition intact. |
| 6 | "Is this repo ready for a class B review?" | `docs-warden` audit | Reads `safety_class`, names the missing class B artifacts, and says the class table needs the regulatory lead. Does not claim compliance. |
| 7 | "Tidy up REQ-CORE-014's wording, it's too long" | `clarity` | **Declines to rewrite.** Explains that requirement wording is traceable and raises the concern instead. |
| 8 | "Our accepted ADR has a typo, fix it" | `docs-warden` | **Declines to edit.** Explains the immutability rule and offers a superseding record. |

Prompts 7 and 8 are the ones worth watching. Both ask for something reasonable that
the skill must refuse, and a skill that quietly complies has lost the property it
exists to protect.

## Status

Run by hand. `skill-creator`'s eval runner was not confirmed available in the
environment these were written in, so no automated results are recorded here.
