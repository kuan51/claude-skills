# lockstep

A flat dependency resolver for Node.js with no dependencies of its own. It resolves a manifest
against a registry snapshot into a lockfile (`lockstep resolve`) and checks a version against a
range (`lockstep check`). The next feature is specified in [SPEC.md](SPEC.md). Run the tests with
`npm test`.
