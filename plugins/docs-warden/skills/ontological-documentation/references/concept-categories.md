# Concept categories

The extractor splits what it finds into **domain** concepts, which name something
the business has, and **technical** concepts, which name a role the code plays.
The split is a naming heuristic and nothing more: it reads the end of a name and
the kind of definition, never the meaning. It will put a badly named domain thing
in the technical table and a well named technical thing in the domain one. A human
curates the result, by renaming the thing in code or by listing it under
`ontology.overrides:` in `.docs-warden.yml`. Never by editing the generated
document.

## The rule

A concept is **technical** when either is true:

- It is a function, or a Terraform resource. A behaviour and an implementation
  detail are not things the business has.
- Its name ends with one of the suffixes below.

Otherwise it is **domain**.

A Terraform `module` is always domain: it is the only unit Terraform offers that
groups anything, so it stands for a piece of the system whatever it is called.

## The suffixes

`CATEGORY_SUFFIXES` in `scripts/extract_concepts.py` is this table and no other
list. A test fails when the two disagree, for the same reason `archetypes.md` and
`archetypes.py` are held together: a reference people read instead of the code has
to be the code.

| Suffix | What it usually means |
|--------|-----------------------|
| `Service` | business logic behind an interface |
| `Repository` | data access for one aggregate |
| `Repo` | the short spelling of Repository |
| `Controller` | an inbound request handler |
| `Handler` | a reaction to an event or message |
| `Manager` | lifecycle or coordination of other objects |
| `Factory` | construction of other objects |
| `Builder` | step-by-step construction |
| `Provider` | supplies a dependency |
| `Gateway` | the boundary to an external system |
| `Client` | calls an external system |
| `Adapter` | translates between two interfaces |
| `Dto` | a transport shape, not a thing in the business |
| `DTO` | the upper-case spelling of Dto |
| `Model` | a persistence or view shape of a concept |
| `Mapper` | converts between two shapes |
| `Helper` | assorted procedures with no owner |
| `Util` | the singular spelling of Utils |
| `Utils` | assorted procedures with no owner |
| `Utility` | the long spelling of Utils |
| `Config` | configuration values |
| `Settings` | the other spelling of Config |
| `Exception` | an error signal |
| `Error` | an error signal or value |
| `Test` | verification code |
| `Tests` | the plural spelling of Test |
| `Mock` | a test double |
| `Stub` | a test double |
| `Base` | a shared implementation parent |
| `Abstract` | an incomplete implementation parent |

## What this does not read

Comments, docstrings beyond the first line, database schemas, API specifications,
and runtime wiring. A concept that exists only in a config file or a message
schema is invisible here, and a `depends_on` edge that is made by a dependency
injection container rather than a constructor, an import, or a Terraform
reference will be missing.
