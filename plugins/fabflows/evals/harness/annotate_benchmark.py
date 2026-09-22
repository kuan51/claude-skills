"""Fix the metadata skill-creator's aggregate_benchmark.py hardcodes and attach analyst notes.

usage: python annotate_benchmark.py <iteration-dir> <skill-creator-dir> [notes.json]

aggregate_benchmark.py writes runs_per_configuration=3 and placeholder model names whatever the
data says. This rewrites them from the run directories, adds notes (a JSON array of strings, or
none), and regenerates benchmark.md with the script's own renderer so the two files agree.
"""
import json
import sys
from pathlib import Path

iteration = Path(sys.argv[1])
sys.path.insert(0, sys.argv[2])
from scripts.aggregate_benchmark import generate_markdown  # noqa: E402

path = iteration / "benchmark.json"
b = json.loads(path.read_text(encoding="utf-8"))

runs = {}
models = set()
for m in iteration.glob("eval-*/*/run-*/metrics.json"):
    arm = m.parent.parent.name
    runs[arm] = runs.get(arm, 0) + 1
    lead = json.loads(m.read_text(encoding="utf-8")).get("lead", {}).get("model")
    if lead:
        models.add(lead)
per_arm = max(runs.values()) // max(1, len(list(iteration.glob("eval-*")))) if runs else 0
b["metadata"]["runs_per_configuration"] = per_arm
b["metadata"]["executor_model"] = f"lead {', '.join(sorted(models)) or '?'}; workers per agent pins"
b["metadata"]["analyzer_model"] = "authoring session"
if len(sys.argv) > 3:
    b["notes"] = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))

path.write_text(json.dumps(b, indent=2) + "\n", encoding="utf-8")
(iteration / "benchmark.md").write_text(generate_markdown(b) + "\n", encoding="utf-8")
print(f"annotated {path} ({per_arm} runs per configuration, {len(b.get('notes', []))} notes)")
