"""Fix what skill-creator's aggregate_benchmark.py gets wrong for this benchmark, add dollars,
and attach analyst notes.

usage: python annotate_benchmark.py <iteration-dir> <skill-creator-dir> [notes.json]

aggregate_benchmark.py writes runs_per_configuration=3 and placeholder model names whatever the
data says, sorts configurations by name and takes the first two as the delta (with three arms
that is superpowers minus with_skill), and carries no cost. This puts with_skill and
without_skill first and sets the delta to with_skill minus without_skill, adds cost stats per
configuration from each run's metrics.json and one dollar note per configuration (the viewer's
Benchmark tab shows the notes list, not these stats), counts each configuration's own runs,
adds notes (a JSON array of strings, or none), and regenerates benchmark.md with the script's
own renderer so the two files agree.

A dollar difference against without_skill covers only the evals both configurations ran, as
summarize.js does, so an arm that ran other tasks gets its mean alone. An agent task (one with
an `agent` field in tasks.json, found by the id in the eval directory's name) has no lead: its
session model is listed under agents, not lead.
"""
import json
import os
import re
import statistics
import sys
from pathlib import Path

iteration = Path(sys.argv[1])
sys.path.insert(0, sys.argv[2])
from scripts.aggregate_benchmark import generate_markdown  # noqa: E402

path = iteration / "benchmark.json"
b = json.loads(path.read_text(encoding="utf-8"))
# FABFLOWS_TASKS overrides the harness's tasks.json, so a test can supply its own.
tasks_path = Path(os.environ.get("FABFLOWS_TASKS") or Path(__file__).resolve().parent.parent / "tasks.json")
tasks = json.loads(tasks_path.read_text(encoding="utf-8"))["tasks"]
agent_ids = {t["id"] for t in tasks if t.get("agent")}

runs = {}
costs = {}  # arm -> eval id -> [cost]
lead_models = set()
agent_models = set()
for m in iteration.glob("eval-*/*/run-*/metrics.json"):
    arm = m.parent.parent.name
    found = re.match(r"eval-(\d+)-", m.parent.parent.parent.name)
    if not found:
        print(f"skipped {m}: no task id in the eval directory's name", file=sys.stderr)
        continue
    eval_id = int(found.group(1))
    runs[arm] = runs.get(arm, 0) + 1
    data = json.loads(m.read_text(encoding="utf-8"))
    cost = data.get("result", {}).get("total_cost_usd")
    if isinstance(cost, (int, float)):
        costs.setdefault(arm, {}).setdefault(eval_id, []).append(cost)
    model = data.get("lead", {}).get("model")
    if model:
        (agent_models if eval_id in agent_ids else lead_models).add(model)


def stats(xs):
    return {
        "mean": round(statistics.mean(xs), 4),
        "stddev": round(statistics.stdev(xs), 4) if len(xs) > 1 else 0.0,
        "min": round(min(xs), 4),
        "max": round(max(xs), 4),
    }


def all_costs(arm):
    return [c for xs in costs.get(arm, {}).values() for c in xs]


def shared_diff(arm):
    """(difference, percent or None) of arm's mean against without_skill over the evals both ran, or None."""
    if arm == "without_skill":
        return None
    shared = costs.get(arm, {}).keys() & costs.get("without_skill", {}).keys()
    if not shared:
        return None
    mine = statistics.mean(c for e in shared for c in costs[arm][e])
    base = statistics.mean(c for e in shared for c in costs["without_skill"][e])
    return mine - base, (mine - base) / base * 100 if base else None


def dollars(d):
    return f"{'+' if d >= 0 else '-'}${abs(d):.2f}"


# with_skill, without_skill, then the rest in the aggregator's order, then the delta.
summary = b["run_summary"]
configs = [k for k in summary if k != "delta"]
order = [c for c in ("with_skill", "without_skill") if c in configs] + [c for c in configs if c not in ("with_skill", "without_skill")]
for c in order:
    xs = all_costs(c)
    if xs:
        summary[c]["cost_usd"] = stats(xs)
diffs = {c: shared_diff(c) for c in order}  # one figure feeds both the delta and the notes
if "with_skill" in summary and "without_skill" in summary:
    ws, wo = summary["with_skill"], summary["without_skill"]
    mean = lambda s, k: s.get(k, {}).get("mean", 0)  # noqa: E731
    diff = diffs["with_skill"]
    summary["delta"] = {
        "pass_rate": f"{mean(ws, 'pass_rate') - mean(wo, 'pass_rate'):+.2f}",
        "time_seconds": f"{mean(ws, 'time_seconds') - mean(wo, 'time_seconds'):+.1f}",
        "tokens": f"{mean(ws, 'tokens') - mean(wo, 'tokens'):+.0f}",
        "cost_usd": f"{diff[0]:+.2f}" if diff else "n/a (no shared evals)",
    }
b["run_summary"] = {**{c: summary[c] for c in order}, **({"delta": summary["delta"]} if "delta" in summary else {})}

# Each configuration's own runs: task 7 runs 2 repeats where tasks 1-6 run 3, so one number
# for every configuration and eval would be wrong.
b["metadata"]["runs_per_configuration"] = ", ".join(f"{c} {runs.get(c, 0)}" for c in order)
parts = [f"lead {', '.join(sorted(lead_models))}" if lead_models else "no lead"]
if agent_models:
    parts.append(f"agents {', '.join(sorted(agent_models))}")
b["metadata"]["executor_model"] = "; ".join(parts + ["workers per agent pins"])
b["metadata"]["analyzer_model"] = "authoring session"
notes = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8")) if len(sys.argv) > 3 else [n for n in b.get("notes", []) if not n.startswith("Cost: ")]
for c in order:
    cm = summary[c].get("cost_usd", {}).get("mean")
    if cm is None:
        continue
    diff = diffs[c]
    pct = f"{diff[1]:+.0f}%" if diff and diff[1] is not None else "n/a"
    vs = f", {dollars(diff[0])} ({pct}) against without_skill" if diff else ""
    notes.append(f"Cost: {c} mean ${cm:.2f} per run{vs}")
b["notes"] = notes

path.write_text(json.dumps(b, indent=2) + "\n", encoding="utf-8")
(iteration / "benchmark.md").write_text(generate_markdown(b) + "\n", encoding="utf-8")
print(f"annotated {path} ({b['metadata']['runs_per_configuration']} runs, {len(b['notes'])} notes)")
