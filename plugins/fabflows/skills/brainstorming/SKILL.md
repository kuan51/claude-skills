---
name: brainstorming
description: Turn a rough idea or an unshaped request into a spec that fabflows:build can take unchanged. The lead sizes the request (bounded, designed in chat; or full, with a written spec), has fabflows:explorer and fabflows:researcher read the codebase and the web instead of asking the user, runs rounds of at most three numbered questions each with a recommended answer until nothing is open, states the maximal version and cuts it to the smallest shippable slice, sends the draft through fabflows:refuter for a lens pass and blocks on any security gap it finds, then writes the spec (behaviour, check, out of scope, decisions, deferred) and hands off only after the user has read it. Use it whenever a request arrives without a spec, a way to check it, or a named scope, even if nobody says "brainstorm". Triggers on "brainstorm", "let's design", "spec this", "think this through", "before we build", "plan this feature", "I have an idea", "help me scope", "requirements", "is this the right approach".
---

# Brainstorming

A design conversation fails in two ways. The lead asks the user things the repository
already answers, and the user stops reading. Or the lead agrees with everything, and the
spec is the user's first guess written down neatly. This skill fixes both: facts come from
workers, decisions come from the user, and the lead's job is to disagree well.

The output is a spec `fabflows:build` takes unchanged: what it does, how to check it,
what is out of scope.

## Boundaries

**This skill will:** size the request, send workers to gather facts, ask bounded rounds of
questions with a recommended answer on each, cut the design to the smallest slice that
ships, run it past a reviewer, and write the spec.

**This skill will not:** write or edit code, write a fixture whose body is a destructive
command, spawn `fabflows:editor` or `fabflows:test-runner`, or start the build loop before
the user has read the spec and said so. Brainstorming ends at the spec.

## Non-negotiables

1. **Never ask what the repository or the web can answer.** Stack, test command, existing
   patterns, library limits: those are worker questions, and asking the user for them is
   how the user stops reading.
2. **At most three questions per round, each with a recommended answer, and at most three
   rounds.** The user should
   be able to reply "1 yes, 2 no, rest defaults". A dozen questions at once is not
   thoroughness, it is a form.
3. **No spec without a Check line.** A behaviour nobody can check is not decided.
4. **No handoff before the user has read the spec.** Approval of a round is not approval
   of the document.

## 1. Size it

Say the tier out loud in the first reply, then hold to it.

| Tier | When | What happens |
| --- | --- | --- |
| **Bounded** | One behaviour, a few files, no data, interface, or auth change | Read, then print the spec block in chat at once; a question only where a choice is real. No file |
| **Full** | Anything touching data, interfaces, auth, more than a few files, or that the user calls a feature | Every section below; spec written to disk |
| **Not brainstorming** | A feasibility question ("can X do Y?") | Answer it, delegating the reading. No rounds |

When unsure, bounded, and upgrade the moment a round reveals a data or interface change.
A full pass on a bounded change is the main way this skill wastes tokens.

**Bounded goes straight to the spec.** When the reading confirms every assumption and the
premise is not in doubt, skip the rounds: print the spec block with each would-be question
written into Decisions as a default with its reason, so the user vetoes instead of answering.
Ask only a question whose answer would change the Check line. The spec block is the
checkpoint: nothing in it is decided until the user's reply, and "approve to build?" is that
reply's question. Full tier keeps the rounds; for bounded, the premise check is one
Decisions line.

Rationalizations that do not hold:

- "Too simple to need a spec." Then it is bounded, and the spec is five lines in chat.
- Calling it bounded to skip the document. Bounded measures the change, not the mood.
- Starting work while the user is still reading a round. The gate is their reply.

## 2. Facts first

Before the first question, know what the repository already says. `CLAUDE.md` and the
README are the lead's to read. Everything else is a worker's:

| Question | Worker |
| --- | --- |
| stack, test command, where a pattern lives, how a similar feature is built | `fabflows:explorer` |
| library behaviour, API limits, a standard's requirements | `fabflows:researcher` |

Brief them per the fabflows skill (objective, output format, tools and paths, boundaries)
and verify per its gate. Ask for `file:line` and a few hundred words, never contents: the
worker's reading is the point, and its raw output in the lead's context defeats it. Run
them in the background and ask the rest of the frontier meanwhile; only questions that
depend on a fact wait for it.

**Open with an assumptions round.** From the worker reports, list what you now believe,
numbered, each with its evidence and a **confirmed** / **inferred** / **guessed** label,
and ask the user to confirm or correct. Most questions die here: a corrected assumption is
cheaper than a question, and a confirmed one never needs asking.

**Read-only spikes are allowed; destructive payloads never are.** A premise is confirmed
by reading. When only running something would settle it and the command cannot change
state (piping a fixture into a script, a dry run, a query), run it, keep any fixture under
the session scratchpad, and say so in the reply with the command and the path. Anything
that writes to the repo, installs, or touches git is a question, not a first-reply habit.
Never create a file, target, script, or fixture whose body is a destructive command, even
to prove a guard ignores it: use an inert stand-in such as `echo would-delete` and say what
it stands for. A proof that leaves `rm -rf ~` on disk is worse than no proof.

**Greenfield.** No code means the explorer is skipped and round one is stack, hosting and
storage, with a recommended answer for each.

## 3. Rounds

Model the design as a tree: every decision branches into the decisions that hang off it.
The **frontier** is every question whose prerequisites are decided. A round asks from the
frontier only; a question that depends on another question still open belongs to a later
round, not this one.

Format:

```
**Q1. <title>**: <question, with choices where they exist>
→ Recommended: <answer>. <one line of why>

**Q2. ...**
```

Round one always carries the premise check: should this exist at all, who is it for, and
what is the simplest thing that gets them there (bounded: one Decisions line, see Size it).
A "no" ends the skill with one paragraph saying why, and that is a good outcome.

End every round with the only state the lead keeps:

```
Decided: <item> (<reason>) ...
Open: <item> ...
Deferred: <item> ...
```

This is the coverage map. The user sees what is left; the lead does not re-derive it.

**Disagree.** If two answers contradict, say so and ask which wins. If an answer builds
more than the premise needs, name the smaller version and ask. Three rounds of "agreed"
in a row is the failure mode, not the goal: a spec the user only nodded at is the user's
first guess with a heading.

**Some questions cannot be answered by asking.** "How should it feel", "which layout",
"is this fast enough" need something to react to. Stop asking, propose the smallest
sketch, stub, or measured spike that would answer it, and return to the frontier with the
result.

Done when Open is empty. Nothing is silently assumed: a question you chose not to ask
becomes a Decided line with its default named, so the user can veto it.

**Budget: three rounds.** If Open is not empty after round three, stop asking: write every
remaining item into Decided with its recommended answer as the default, mark the block
`defaults taken`, and go to the cut. The user vetoes in the spec, not in a fourth round.

## 4. Expand, then cut

Once Open is empty, state the maximal version in five lines: everything the design could
be. Then cut to the smallest slice that ships and can be checked, sized so the build fits
in about half a fresh context. Larger than that is two specs, in order.

Everything cut goes to Deferred with one line each. Deferred is a section of the spec,
not a promise.

## 5. Lens pass

Before writing the spec, brief `fabflows:refuter` in spec mode with the draft (the cut
version, in a scratch file or the chat block) and the code paths it names. The seven lenses
it works are listed in its own definition.

Verify its report per the fabflows gate: open one cited `path:line`. Surviving findings
become the next round's questions. "None" is a valid finding on any lens.

**Hard block.** A must-fix security gap in the refuter's report (its definition names
them). The spec is not written until the design removes it, and the user is told which one
and why.

## 6. Spec and handoff

```
# <title>

## Behaviour
<what it does, in the user's terms>

## Check
<the command, or the observable result>

## Out of scope
<what this deliberately does not do>

## Decisions
- <decision> (<reason>)

## Deferred
- <cut item>
```

Full tier writes it to `docs/specs/<YYYY-MM-DD>-<slug>.md`. Never share a filename with a
plan or a task file: the spec is the design record, and a later file overwriting it
loses the reasons. Bounded tier prints the same template in chat.

The user reads it. Handoff is explicit: ask "approve to build?", and only on a yes launch
`fabflows:build` with the spec text as `spec`, per the fabflows skill's build-loop section.
Once the spec is on disk, reference the path; do not paste it back into chat.
