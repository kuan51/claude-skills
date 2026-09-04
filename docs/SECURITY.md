---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Security

## Reporting a vulnerability

Open a private [GitHub Security Advisory](https://github.com/kuan51/claude-skills/security/advisories/new)
on this repository. Do not open a public issue.

This is a solo/small-maintainer open-source project: expect an acknowledgement
on a best-effort basis, not a committed SLA. <!-- CONSULT: owner to confirm or
replace with a real response-time commitment. -->

## Supported versions

Each plugin under `plugins/` is versioned independently in its own
`plugin.json`. Only the latest published version of each plugin is supported;
there is no backport policy for older versions.

## Posture

This repository ships prompt/skill content and local scripts (Python, Node.js)
that execute with the invoking user's own privileges when a plugin is
installed and run. It does not run a hosted service, does not store user data,
and holds no credentials of its own. Never commit secrets — see `.gitignore`.
