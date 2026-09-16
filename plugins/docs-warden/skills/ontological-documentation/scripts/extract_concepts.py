#!/usr/bin/env python3
"""Extract concepts and relationships from source code. JSON to stdout.

Usage: extract_concepts.py <path>

Reads Python, JavaScript/TypeScript, PowerShell and Terraform. Everything else
is invisible to it, and that is reported rather than silently treated as an
empty repository: no supported file exits 0 with empty concepts and says so on
stderr, so a caller can answer "skipped" instead of "nothing here".

Output is sorted everywhere, so two runs over an unchanged tree are
byte-identical and the generated document they feed produces an empty diff.
"""
import ast
import json
import re
import sys
from pathlib import Path

# The same set markdown_docs() skips, plus Terraform's provider cache: a
# .terraform/ directory holds vendored modules, which are somebody else's
# domain and would swamp the repository's own.
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "build", ".venv", ".terraform"}

LANGUAGE_BY_SUFFIX = {
    ".py": "python",
    ".js": "javascript", ".ts": "javascript",
    ".jsx": "javascript", ".tsx": "javascript",
    ".ps1": "powershell", ".psm1": "powershell",
    ".tf": "terraform",
}

LANGUAGES = ("python", "javascript", "powershell", "terraform")

RELATIONSHIPS = ("is_a", "part_of", "depends_on", "associates_with")

# A name ending in one of these describes a role in the code, not a thing in
# the business. Documented in references/concept-categories.md, which a test
# holds to this exact list -- a table that drifts from the code is worse than
# no table, because people read it instead of the code.
CATEGORY_SUFFIXES = (
    "Service", "Repository", "Repo", "Controller", "Handler", "Manager",
    "Factory", "Builder", "Provider", "Gateway", "Client", "Adapter",
    "Dto", "DTO", "Model", "Mapper", "Helper", "Util", "Utils", "Utility",
    "Config", "Settings", "Exception", "Error", "Test", "Tests", "Mock",
    "Stub", "Base", "Abstract",
)

# A constructor parameter names the collaborator's role as often as its type:
# payment_gateway is PaymentGateway, order_repo is Order behind a repository.
PARAM_ROLE_SUFFIXES = ("_repo", "_service", "_client")


def categorise(name: str, kind: str) -> str:
    # A function is a behaviour and a Terraform resource an implementation
    # detail: technical whatever they are called.
    if kind in ("function", "resource"):
        return "technical"
    if name.endswith(CATEGORY_SUFFIXES):
        return "technical"
    return "domain"


def _first_line(text) -> str:
    if not text:
        return ""
    return text.strip().splitlines()[0].strip()


def _snake_to_pascal(name: str) -> str:
    return "".join(word.capitalize() for word in name.split("_"))


def _param_candidates(param: str):
    """Concept names a constructor parameter might be naming."""
    names = {_snake_to_pascal(param)}
    for suffix in PARAM_ROLE_SUFFIXES:
        if param.endswith(suffix) and len(param) > len(suffix):
            names.add(_snake_to_pascal(param[: -len(suffix)]))
    return {n for n in names if n}


class Ontology:
    """Concepts and candidate edges. Edges are filtered at the end, not as they
    arrive: a file may reference a class defined in a file read later, and an
    edge dropped for that reason would depend on walk order."""

    def __init__(self):
        self.concepts = {}
        self._edges = {rel: set() for rel in RELATIONSHIPS}
        self.sources = {lang: 0 for lang in LANGUAGES}
        self.tf_blocks = []  # (name, body, rel); edges need every block first

    def add(self, name, kind, language, defined_in, summary="", category=None):
        if not name or name in self.concepts:
            return
        self.concepts[name] = {
            "kind": kind,
            "category": category or categorise(name, kind),
            "language": language,
            "defined_in": defined_in,
            "summary": _first_line(summary),
        }

    def edge(self, rel, subject, obj):
        if subject and obj and subject != obj:
            self._edges[rel].add((subject, obj))

    def result(self):
        known = set(self.concepts)
        relationships = {
            rel: [{"object": o, "subject": s}
                  for s, o in sorted(edges) if s in known and o in known]
            for rel, edges in self._edges.items()
        }
        return {
            "sources": dict(self.sources),
            "concepts": dict(sorted(self.concepts.items())),
            "relationships": relationships,
        }


def _python(rel, text, out):
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        return
    local_classes = []
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            out.add(node.name, "class", "python", f"{rel}:{node.lineno}",
                    ast.get_docstring(node))
            local_classes.append(node.name)
            for base in node.bases:
                if isinstance(base, ast.Name):
                    out.edge("is_a", node.name, base.id)
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == "__init__":
                    for arg in item.args.args[1:]:
                        for candidate in _param_candidates(arg.arg):
                            out.edge("depends_on", node.name, candidate)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            out.add(node.name, "function", "python", f"{rel}:{node.lineno}",
                    ast.get_docstring(node))
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                for cls in local_classes:
                    out.edge("depends_on", cls, alias.name)


JS_CLASS_RE = re.compile(
    r"\bclass\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w,\s]+?))?\s*\{")
JS_INTERFACE_RE = re.compile(r"\binterface\s+(\w+)(?:\s+extends\s+([\w,\s]+?))?\s*\{")
JS_TYPE_RE = re.compile(r"\btype\s+(\w+)\s*=")
JS_ENUM_RE = re.compile(r"\benum\s+(\w+)\s*\{")
JS_CTOR_RE = re.compile(r"\bconstructor\s*\(([^)]*)\)")
JS_PARAM_TYPE_RE = re.compile(r":\s*([A-Za-z_]\w*)")


def _line_of(text, index):
    return text.count("\n", 0, index) + 1


def _js(rel, text, out):
    classes = []  # (start_offset, name)
    for match in JS_CLASS_RE.finditer(text):
        name = match.group(1)
        out.add(name, "class", "javascript", f"{rel}:{_line_of(text, match.start())}")
        classes.append((match.start(), name))
        for parent in _names(match.group(2)) + _names(match.group(3)):
            out.edge("is_a", name, parent)
    for match in JS_INTERFACE_RE.finditer(text):
        name = match.group(1)
        out.add(name, "interface", "javascript",
                f"{rel}:{_line_of(text, match.start())}")
        for parent in _names(match.group(2)):
            out.edge("is_a", name, parent)
    for match in JS_TYPE_RE.finditer(text):
        out.add(match.group(1), "type", "javascript",
                f"{rel}:{_line_of(text, match.start())}")
    for match in JS_ENUM_RE.finditer(text):
        out.add(match.group(1), "enum", "javascript",
                f"{rel}:{_line_of(text, match.start())}")
    for match in JS_CTOR_RE.finditer(text):
        owner = [name for start, name in classes if start < match.start()]
        if not owner:
            continue
        for type_name in JS_PARAM_TYPE_RE.findall(match.group(1)):
            out.edge("depends_on", owner[-1], type_name)


def _names(group):
    if not group:
        return []
    return [part.strip().split(".")[-1] for part in group.split(",") if part.strip()]


PS_CLASS_RE = re.compile(r"^\s*class\s+(\w+)\s*(?::\s*(\w+))?", re.MULTILINE)
PS_FUNCTION_RE = re.compile(r"^\s*function\s+([A-Za-z]\w*)-([A-Za-z]\w*)",
                            re.MULTILINE | re.IGNORECASE)
PS_IMPORT_RE = re.compile(r"^\s*(?:Import-Module|using\s+module)\s+['\"]?([\w.\-]+)",
                          re.MULTILINE | re.IGNORECASE)
PS_SYNOPSIS_RE = re.compile(r"\.SYNOPSIS\s*\r?\n\s*(.+)")


def _ps_synopsis(text, index):
    """A .SYNOPSIS in the comment-based help within a few lines of the
    definition. Comment help may sit above or inside the function body, so a
    window either side is read rather than one fixed position."""
    window = text[max(0, index - 800): index + 800]
    match = PS_SYNOPSIS_RE.search(window)
    return match.group(1).strip() if match else ""


def _powershell(rel, text, out):
    local = []
    for match in PS_CLASS_RE.finditer(text):
        name = match.group(1)
        out.add(name, "class", "powershell", f"{rel}:{_line_of(text, match.start())}")
        local.append(name)
        if match.group(2):
            out.edge("is_a", name, match.group(2))
    for match in PS_FUNCTION_RE.finditer(text):
        verb, noun = match.group(1), match.group(2)
        line = _line_of(text, match.start())
        summary = _ps_synopsis(text, match.start())
        full = f"{verb}-{noun}"
        out.add(full, "function", "powershell", f"{rel}:{line}", summary)
        out.add(noun, "noun", "powershell", f"{rel}:{line}", summary)
        out.edge("associates_with", full, noun)
        local += [full, noun]
    for match in PS_IMPORT_RE.finditer(text):
        module = match.group(1).split(".")[0]
        for name in local:
            out.edge("depends_on", name, module)


TF_MODULE_RE = re.compile(r'^\s*module\s+"([^"]+)"\s*\{', re.MULTILINE)
TF_RESOURCE_RE = re.compile(r'^\s*resource\s+"([^"]+)"\s+"([^"]+)"\s*\{', re.MULTILINE)
TF_DESCRIPTION_RE = re.compile(r'description\s*=\s*"([^"]*)"')
TF_MODULE_REF_RE = re.compile(r"\bmodule\.([A-Za-z_][\w-]*)")
TF_RESOURCE_REF_RE = re.compile(r"\b([a-z][a-z0-9_]*)\.([A-Za-z_][\w-]*)")


def _tf_body(text, brace_index):
    """The text between the block's braces, by counting them. Terraform has no
    stdlib parser, and a non-greedy regex to the next '}' stops at the first
    nested block instead of the end of this one."""
    depth = 0
    for i in range(brace_index, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[brace_index + 1: i]
    return text[brace_index + 1:]


def _terraform(rel, text, out):
    blocks = out.tf_blocks
    for match in TF_MODULE_RE.finditer(text):
        name = match.group(1)
        body = _tf_body(text, match.end() - 1)
        description = TF_DESCRIPTION_RE.search(body)
        # Category is fixed by kind here: a module is the domain unit Terraform
        # offers, whatever it happens to be named.
        out.add(name, "module", "terraform", f"{rel}:{_line_of(text, match.start())}",
                description.group(1) if description else "", category="domain")
        blocks.append((name, body, rel))
    for match in TF_RESOURCE_RE.finditer(text):
        name = f"{match.group(1)}.{match.group(2)}"
        body = _tf_body(text, match.end() - 1)
        description = TF_DESCRIPTION_RE.search(body)
        out.add(name, "resource", "terraform", f"{rel}:{_line_of(text, match.start())}",
                description.group(1) if description else "")
        blocks.append((name, body, rel))


def _terraform_edges(out):
    for name, body, rel in out.tf_blocks:
        for referenced in TF_MODULE_REF_RE.findall(body):
            out.edge("depends_on", name, referenced)
        for kind, local in TF_RESOURCE_REF_RE.findall(body):
            if kind != "module":
                out.edge("depends_on", name, f"{kind}.{local}")
        parts = Path(rel).parts
        if "modules" in parts:
            index = parts.index("modules")
            if index + 1 < len(parts):
                out.edge("part_of", name, parts[index + 1])


HANDLERS = {"python": _python, "javascript": _js,
            "powershell": _powershell, "terraform": _terraform}


def source_files(root: Path):
    """(language, path, repo-relative posix path) for every readable source."""
    found = []
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        language = LANGUAGE_BY_SUFFIX.get(path.suffix.lower())
        if language and path.is_file() and not any(p in SKIP_DIRS for p in rel.parts):
            found.append((language, path, rel.as_posix()))
    return sorted(found, key=lambda item: item[2])


def extract(root: Path):
    """The whole ontology for a tree, as the JSON shape this script prints."""
    out = Ontology()
    for language, path, rel in source_files(root):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        out.sources[language] += 1
        HANDLERS[language](rel, text, out)
    _terraform_edges(out)
    return out.result()


def main(argv):
    if len(argv) != 2:
        print("Usage: extract_concepts.py <path>", file=sys.stderr)
        return 2
    root = Path(argv[1]).resolve()
    result = extract(root)
    if not sum(result["sources"].values()):
        print(f"no supported source files under {argv[1]}", file=sys.stderr)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
