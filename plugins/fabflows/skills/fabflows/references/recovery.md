# Recovery and long sessions

## Long sessions

- Follow up with a worker you already briefed by resuming it with `SendMessage`; it keeps
  its context.
- Run workers in the background and keep working while they run.
- Verify a small edit by reading its diff; hand a large or multi-file change to
  `fabflows:refuter` rather than reading all of it.
- Do not pair a long session with a Fable advisor: each consult re-reads the whole transcript
  uncached.

## When it goes wrong

| Symptom | Cause | Do |
| --- | --- | --- |
| A spawn runs on the lead's model, or as a general-purpose agent | A bare name (`explorer`) does not resolve; plugin agents are namespaced | Spawn `fabflows:explorer` and check the report names the tier it ran on |
| A report is missing a contract field | The worker skipped it | Send it back once with the field named; on a second miss, redo the step yourself |
| A report's first line is a permission denial | The guard or the session's permission mode refused a call | Surface it to the user with the exact call; never re-issue it yourself |
| `fabflows:build` throws instead of returning a result | A budget or token limit ended a round mid-flight | `references/build-loop.md`: resume with the same args and the run ID; never restart with a fresh `baseRef` |
| An install is denied | The guard stops package installs and package runners by design | Before any install, runner, or script you know will fetch a package, stop: name the package, the version and where it installs, and ask the user. If the guard asks or denies, look for no other route until the user says yes. A worker reports it as a blocker. The one exception is `pypdf` into a literal `scratchpad` `--target` with `--isolated`, for reading a PDF |
