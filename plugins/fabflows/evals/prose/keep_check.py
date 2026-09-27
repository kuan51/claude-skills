"""Prose-tightening guard, v3: literals survive, frozen text is kept, and every changed sentence
is laid out beside its base text for the reviewer.

usage: python keep_check.py <baseRef> <pathspec>... [--frozen-list F] [--table OUT]
       python keep_check.py --pair <old.md> <new.md> [--name REPO_PATH] [--frozen-list F] [--table OUT]

Paths are relative to the repository the command runs in (git's top level), so it runs from any
checkout. Self-test: python test_keep_check.py.

Per changed Markdown file it FAILS when:
  - the frontmatter block differs at all;
  - an inline code span, fenced block, link target or digit number is lost from, or new to, any
    section delimited by the base headings (so a literal moved to another section fails too);
  - the base headings are not all present, with the same text and level, in the same order
    (new headings may be added);
  - the order of code spans inside a paragraph changes;
  - a frozen quote for the file (from --frozen-list) is not present word for word;
  - a Vale comment is anything other than an own-line `<!-- vale Style.Rule = NO -->` ... `= YES`
    pair for a nonword or sequence rule (vocabulary entries cannot reach those),
    or sits between two table lines, or a line inside a pair is
    not unchanged base text;
  - a pair covers no finding of its rule, or a finding of a paired rule lies outside every pair
    for it (Vale is re-run on a copy with the directives blanked; only when a pair exists);
  - it had sentences over 30 words outside frozen text and their number did not fall, or its mean
    sentence length rose.
Across the run it FAILS when total characters (comments included) do not fall, or when a file
under plugins/*/agents or plugins/*/skills is added, deleted or renamed.

--table writes every changed sentence beside its base text, with the load-bearing words each
change adds or removes, so the reviewer can compare all of them. The table is the review; the
highlights only point at the rows most likely to change behaviour.
"""
import difflib, json, os, re, subprocess, sys, tempfile
from collections import Counter

def repo_root():
    """The top level of the repository the command runs in; outside one, this script's own."""
    r = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, encoding="utf-8")
    here = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
    return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else here


ROOT = repo_root()
FENCE = re.compile(r"^\s*(`{3,}|~{3,})")
VALE_ANY = re.compile(r"<!--\s*vale\b[^>]*-->")
VALE_LINE = re.compile(r"^\s*<!--\s*vale\s+([\w-]+)\.([\w-]+)\s*=\s*(NO|YES)\s*-->\s*$")
LONG = 30
FAMILIES = {
    "negation": r"never|not|no|nothing|none|nor|neither|without|cannot|\w+n't",
    "absolute": r"only|always|every|each|any|all|must|whole|both|either",
    "condition": r"unless|except|if|when|whenever|until|whether|otherwise|once",
    "order": r"before|after|first|then|again|later|next|last|while",
    "count": r"one|two|three|four|five|six|seven|eight|nine|ten|twice|third|second|single|dozen|few|most|least",
    "stop-ask": r"stop|stops|ask|asks|yes|approve|approves|approval|confirm|confirms|refuse|refuses|deny|denies|denied",
    "actor": r"lead|lead's|worker|workers|worker's|user|user's|reviewer|builder|Claude|yourself",
    "modal": r"may|should|can|might|could|need|needs|required|requires",
    "tier": r"Opus|Sonnet|Haiku|Fable",
}


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def split(text):
    """(frontmatter, prose lines with their 1-based line numbers, fenced blocks with the line they open on)"""
    fm, offset = "", 0
    m = re.match(r"\A---\r?\n.*?\r?\n---\r?\n", text, flags=re.S)
    if m:
        fm, offset = m.group(0), m.group(0).count("\n")
        text = text[m.end():]
    prose, blocks, cur, opener, start = [], [], None, None, 0
    for i, line in enumerate(text.splitlines(), start=offset + 1):
        f = FENCE.match(line)
        if cur is None and f:
            cur, opener, start = [], f.group(1), i
        elif cur is not None and f and f.group(1)[0] == opener[0] and len(f.group(1)) >= len(opener):
            lines = [l.rstrip() for l in cur]
            ind = min((len(l) - len(l.lstrip()) for l in lines if l.strip()), default=0)
            blocks.append((start, "\n".join(l[ind:] for l in lines).strip("\n")))
            cur = None
        elif cur is not None:
            cur.append(line)
        else:
            prose.append((i, line))
    return fm, prose, blocks


def strip_code(s):
    return re.sub(r"(`+)(.+?)\1", " ", s)


def units(body):
    """Sentences, list items split into sentences, and whole table rows, in order."""
    out = []
    for para in re.split(r"\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)|\n(?=\s*\|)", body):
        p = norm(para)
        if not p or re.match(r"^#{1,6}\s", p):
            continue
        if p.startswith("|"):
            out += [norm(r) for r in re.split(r"(?<=\|)\s(?=\|)", p) if norm(r) and not re.match(r"^\|[\s|:-]+\|$", norm(r))]
            continue
        out += [norm(x) for x in re.split(r"(?<=[.!?])\s+(?=[A-Z*`(\"])", p) if norm(x)]
    return out


def family_counts(s):
    s, out = strip_code(s), Counter()
    for fam, rx in FAMILIES.items():
        flags = 0 if fam == "tier" else re.I
        for m in re.finditer(rf"\b(?:{rx})\b", s, flags):
            out[f"{m.group(0) if fam == 'tier' else m.group(0).lower()}"] += 1
    return out


def prose_body(lines):
    body = "\n".join(l for _, l in lines if not VALE_ANY.fullmatch(l.strip()))
    return VALE_ANY.sub("", body)


LITERALS = ("code span", "fenced block", "link target", "number")


def literals(lines, blocks):
    flat = norm(prose_body(lines))
    return {
        "code span": {norm(m.group(2)) for m in re.finditer(r"(`+)(.+?)\1", flat)},
        "fenced block": {b for _, b in blocks},
        "link target": set(re.findall(r"\]\(([^)\s]+)\)", flat)),
        "number": set(re.findall(r"\d+(?:[.,]\d+)*", strip_code(flat))),
    }


def is_heading(line):
    return re.match(r"^#{1,6}\s", line.strip()) is not None


def section_literals(f, heads):
    """Literals per section, the sections cut at the base headings `heads` matched in order.
    A heading the base lacks does not cut, so its text stays in the enclosing base section."""
    bounds, k = [], 0
    for i, l in f["lines"]:
        if k < len(heads) and is_heading(l) and norm(l) == heads[k]:
            bounds.append((i, heads[k]))
            k += 1
    # Numbered, so two sections under the same heading text stay apart.
    names = ["(before the first heading)"] + [f"{n}: {h}" for n, (_, h) in enumerate(bounds, 1)]
    sec = lambda i: sum(1 for b, _ in bounds if b <= i)
    out = {}
    for n, name in enumerate(names):
        out[name] = literals([x for x in f["lines"] if sec(x[0]) == n], [x for x in f["blocks"] if sec(x[0]) == n])
    return out


def facts(text):
    fm, lines, blocks = split(text)
    raw = "\n".join(l for _, l in lines)
    body = prose_body(lines)
    flat = norm(body)
    paras = re.split(r"\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)", body)
    return {
        "frontmatter": fm, "lines": lines, "blocks": blocks, "raw": raw, "flat": flat, "units": units(body),
        "headings": [norm(l) for _, l in lines if is_heading(l)],
        "span order": [tuple(dict.fromkeys(norm(m.group(2)) for m in re.finditer(r"(`+)(.+?)\1", norm(p)))) for p in paras],
        "chars": len(text),
        "words": len(VALE_ANY.sub("", text).split()),
    }


def subseq(o, n):
    it = iter(n)
    return all(x in it for x in o)


def vocab_proof(style, rule):
    """True for rules a vocabulary entry cannot reach: `nonword: true` or `extends: sequence`.
    Reads the synced styles, so it needs `vale sync` first; a missing style file counts as False."""
    p = os.path.join(ROOT, "styles", style, rule + ".yml")
    try:
        y = open(p, encoding="utf-8").read()
    except OSError:
        return False
    return re.search(r"^nonword:\s*true", y, re.M) is not None or re.search(r"^extends:\s*sequence", y, re.M) is not None


def pairs(lines):
    """Own-line Vale pairs: list of (rule, start_line, end_line); plus errors."""
    open_, found, bad = {}, [], []
    by = dict(lines)
    for i, l in lines:
        if VALE_ANY.search(l) and by.get(i - 1, "").lstrip().startswith("|") and by.get(i + 1, "").lstrip().startswith("|"):
            bad.append(f"line {i}: a Vale comment between two table lines splits the table")
        if not VALE_ANY.search(l):
            continue
        m = VALE_LINE.match(l)
        if not m:
            bad.append(f"line {i}: Vale comment is not an own-line Style.Rule = NO/YES directive: {l.strip()[:90]!r}")
            continue
        rule, state = f"{m.group(1)}.{m.group(2)}", m.group(3)
        if not vocab_proof(m.group(1), m.group(2)):
            bad.append(f"line {i}: {rule} is neither nonword nor sequence; use a vocabulary entry instead of a pair")
        if state == "NO":
            if rule in open_:
                bad.append(f"line {i}: {rule} opened twice")
            open_[rule] = i
        elif rule not in open_:
            bad.append(f"line {i}: {rule} closed without an opening")
        else:
            found.append((rule, open_.pop(rule), i))
    bad += [f"line {s}: {r} never closed" for r, s in open_.items()]
    return found, bad


def readability(units_, frozen_quotes):
    lens = [len(u.split()) for u in units_ if not u.startswith("|")]
    long_ = [u for u in units_ if not u.startswith("|") and len(u.split()) > LONG and not any(u in q or q in u for q in frozen_quotes)]
    return (sum(lens) / len(lens) if lens else 0.0), len(long_)


def compare(name, old, new, frozen, table):
    a, b, bad = facts(old), facts(new), []
    if a["frontmatter"] != b["frontmatter"]:
        bad.append("frontmatter changed")
    sa, sb = section_literals(a, a["headings"]), section_literals(b, a["headings"])
    empty = {kind: set() for kind in LITERALS}
    for sec in list(sa) + [s for s in sb if s not in sa]:
        la_, lb_ = sa.get(sec, empty), sb.get(sec, empty)
        for kind in LITERALS:
            bad += [f"{kind} lost from section {sec[:60]!r}: {x[:140]!r}" for x in sorted(la_[kind] - lb_[kind])]
            bad += [f"{kind} new to section {sec[:60]!r}: {x[:140]!r}" for x in sorted(lb_[kind] - la_[kind])]
    if not subseq(a["headings"], b["headings"]):
        bad.append(f"base headings not kept in order: {[h for h in a['headings'] if h not in b['headings']] or 'order changed'}")
    for o in a["span order"]:
        if len(o) > 1 and any(set(o) <= set(n) for n in b["span order"]) and not any(subseq(o, n) for n in b["span order"]):
            bad.append(f"code-span order changed in a paragraph: {o}")
    quotes = [norm(x) for q in frozen if q["file"] == name for x in (q.get("quotes") or [q["quote"]])]
    for q in quotes:
        if q not in a["flat"]:
            bad.append(f"frozen quote not found in the BASE text (fix the list): {q[:100]!r}")
        elif q not in b["flat"]:
            bad.append(f"frozen text not kept word for word: {q[:120]!r}")
    found, perr = pairs(b["lines"])
    bad += perr
    by_line = dict(b["lines"])
    for rule, s, e in found:
        for i in range(s + 1, e):
            t = norm(VALE_ANY.sub("", by_line.get(i, "")))
            t = re.sub(r"^(?:[-*]|\d+\.)\s+", "", t)
            if t and t not in a["flat"]:
                bad.append(f"line {i} inside the {rule} pair is not unchanged base text: {t[:90]!r}")
    ma, la = readability(a["units"], quotes)
    mb, lb = readability(b["units"], quotes)
    if la > 0 and lb >= la:
        bad.append(f"sentences over {LONG} words outside frozen text did not fall: {la} -> {lb}")
    if mb > ma:
        bad.append(f"mean sentence length rose: {ma:.1f} -> {mb:.1f} words")

    rows = []
    sm = difflib.SequenceMatcher(None, a["units"], b["units"], autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        o, n = " ".join(a["units"][i1:i2]), " ".join(b["units"][j1:j2])
        fo, fn = family_counts(o), family_counts(n)
        rows.append({"file": name, "op": op, "old": o, "new": n,
                     "lost": dict(fo - fn), "added": dict(fn - fo)})
    table.extend(rows)
    print(f"{a['chars']:>7} -> {b['chars']:>7} chars  {a['words']:>5} -> {b['words']:>5} words  "
          f"mean {ma:4.1f} -> {mb:4.1f}  long {la:>2} -> {lb:>2}  rows {len(rows):>3}  {'FAIL' if bad else 'ok  '}  {name}")
    for line in bad[:40]:
        print(f"         {line}")
    if len(bad) > 40:
        print(f"         ... {len(bad) - 40} more")
    return not bad, a["chars"], b["chars"], found


def vale_audit(path, text, found):
    """Blank the Vale directives in a copy, re-run Vale, and match findings of paired rules to pairs."""
    bad = []
    lines = text.splitlines(keepends=True)
    blank = [re.sub(r"<!--\s*vale\b[^>]*-->", "<!-- -->", l) if VALE_LINE.match(l.rstrip("\r\n")) else l for l in lines]
    rules = {r for r, _, _ in found}
    if not rules:
        return bad
    d = tempfile.mkdtemp()
    cp = os.path.join(d, os.path.basename(path))
    open(cp, "w", encoding="utf-8").write("".join(blank))
    r = subprocess.run(["vale", "--config", os.path.join(ROOT, ".vale.ini"), "--minAlertLevel=warning", "--output=JSON", cp],
                       capture_output=True, text=True, encoding="utf-8")
    alerts = [x for v in json.loads(r.stdout or "{}").values() for x in v]
    for rule, s, e in found:
        if not any(x["Check"] == rule and s < x["Line"] < e for x in alerts):
            bad.append(f"{rule} pair at lines {s}-{e} covers no finding of that rule")
    for x in alerts:
        if x["Check"] in rules and not any(x["Check"] == rule and s < x["Line"] < e for rule, s, e in found):
            bad.append(f"line {x['Line']}: {x['Check']} finding outside every pair for it (a pair elsewhere may be hiding it)")
    return bad


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8", check=True, cwd=ROOT).stdout


def write_table(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Changed sentences: {len(rows)} rows\n\nCompare every row: same trigger, action, actor, scope, count, timing and object?\n")
        for k, r in enumerate(rows, 1):
            hl = ""
            if r["lost"] or r["added"]:
                hl = f"  LOAD-BEARING lost {r['lost']} added {r['added']}"
            f.write(f"\n## {k}. {r['file']} ({r['op']}){hl}\n\nOLD: {r['old'] or '(none)'}\n\nNEW: {r['new'] or '(none)'}\n")


def main(argv):
    def opt(flag, default=None, has_value=True):
        nonlocal argv
        if flag not in argv:
            return default
        i = argv.index(flag)
        val = argv[i + 1] if has_value else True
        argv = argv[:i] + argv[i + (2 if has_value else 1):]
        return val
    frozen_path, table_path = opt("--frozen-list"), opt("--table")
    name = opt("--name")
    frozen = json.load(open(frozen_path, encoding="utf-8")) if frozen_path else []
    table, ok, ca, cb = [], True, 0, 0
    if argv[:1] == ["--pair"]:
        old, new = (open(p, encoding="utf-8").read() for p in argv[1:3])
        good, ca, cb, found = compare(name or argv[2], old, new, frozen, table)
        errs = vale_audit(argv[2], new, found)
        for e in errs:
            print(f"         {e}")
        ok = good and not errs
        if ca and cb >= ca:
            print(f"  FAIL  total characters did not fall: {ca} -> {cb}")
            ok = False
    else:
        base, spec = argv[0], argv[1:] or ["plugins"]
        for row in git("diff", "--name-status", "-M", base, "--", *spec).splitlines():
            status, path = row.split("\t")[0], row.split("\t")[-1]
            if status[0] in "ADR" and any(re.match(r"plugins/[^/]+/(agents|skills)/", p) for p in row.split("\t")[1:]):
                print(f"  FAIL  {status} {path}: prompt files may only be modified, not added, deleted or renamed")
                ok = False
                continue
            if not path.endswith(".md") or status[0] in "ADR":
                continue
            new = open(os.path.join(ROOT, path), encoding="utf-8").read()
            good, a_, b_, found = compare(path, git("show", f"{base}:{path}"), new, frozen, table)
            errs = vale_audit(path, new, found)
            for e in errs:
                print(f"         {e}")
            good &= not errs
            ok &= good; ca += a_; cb += b_
        if ca and cb >= ca:
            print(f"  FAIL  total characters did not fall: {ca} -> {cb}")
            ok = False
    if table_path:
        write_table(table_path, table)
        print(f"table: {len(table)} changed rows written to {table_path}")
    print(f"total: {ca} -> {cb} characters")
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
