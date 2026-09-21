'use strict';
// Turns one `claude -p --output-format stream-json --verbose` transcript into metrics.json.
//
// Where each number comes from, because the stream is not uniform about it:
//
// - Every `assistant` event carries message.model and message.usage, but that usage is the
//   message-start snapshot: input, cache_read and cache_creation are final (the prompt is
//   known up front), output_tokens is a placeholder of a few tokens. So input-side numbers
//   and context growth are summed per message here; output is never summed from events.
// - The final `result` event's `usage` is the lead's own total (the main thread only) and
//   its `modelUsage` is every agent's total by model. Both are authoritative.
// - A worker's events carry the parent_tool_use_id of the Agent call that spawned it, which
//   joins to that call's subagent_type. The Agent call's tool_result carries a
//   `<usage>subagent_tokens: N ...</usage>` block: that worker's total across every category.
//   Worker output is therefore derived: subagent_tokens minus the input-side sum of its
//   messages, and cross-checked against modelUsage minus the lead's usage per model.
//
// One message arrives as several events (one per content block) that repeat the same usage,
// so per-message sums dedupe on message.id and tool_use blocks on their own id.
//
// A Workflow run changes the shape. The lead launches it, ends its turn and is woken for a
// second one, so the stream carries one `result` per turn: usage, num_turns and duration_ms
// are per turn and add up, modelUsage and total_cost_usd are cumulative and the last stands.
// Workflow agents emit no `assistant` events at all. They surface as `system`/`task_progress`
// events with a `workflow_progress` list, and their per-message usage lives in the run's own
// transcript dir (`agent-<id>.jsonl`, named in the Workflow tool_result), where the last event
// per message.id carries the final output and earlier ones are snapshots.

const fs = require('node:fs');
const path = require('node:path');

function parseTranscript(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      // A truncated last line after a kill is not worth failing the whole run over.
    }
  }
  return events;
}

const zeroInput = () => ({ messages: 0, input: 0, cacheRead: 0, cacheWrite: 0 });

function addInput(acc, u) {
  acc.messages += 1;
  acc.input += u.input_tokens || 0;
  acc.cacheRead += u.cache_read_input_tokens || 0;
  acc.cacheWrite += u.cache_creation_input_tokens || 0;
}

function bump(map, key) {
  map[key] = (map[key] || 0) + 1;
}

// probeText: the FABFLOWS_PROBE file, one raw hook payload per line. Counts (event, tool, agent).
// Only payloads that carry a session_id came from Claude Code's hook runner. The fixture's own
// guard.test.js drives guard.js with synthetic payloads (no session_id) while the task's test
// command runs, and those land in the same file because the env var is inherited.
function summarizeProbe(probeText) {
  const counts = {};
  if (!probeText) return counts;
  for (const line of probeText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const p = JSON.parse(line);
      if (!p.session_id) {
        bump(counts, 'synthetic (fixture tests)');
        continue;
      }
      bump(counts, `${p.hook_event_name || '?'}:${p.tool_name || '-'}:${p.agent_type || 'lead'}`);
    } catch {
      bump(counts, 'unparseable');
    }
  }
  return counts;
}

// The `<usage>subagent_tokens: 11749\ntool_uses: 1\nduration_ms: 6945</usage>` block appended
// to an Agent call's tool_result.
function parseSubagentUsage(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content || '');
  const m = text.match(/subagent_tokens:\s*(\d+)/);
  if (!m) return null;
  const tools = text.match(/tool_uses:\s*(\d+)/);
  const dur = text.match(/duration_ms:\s*(\d+)/);
  return { tokens: Number(m[1]), toolUses: tools ? Number(tools[1]) : null, durationMs: dur ? Number(dur[1]) : null };
}

// Plain text of a tool_result, whether the stream sent a string or content blocks. Paths in a
// Workflow launch message carry backslashes, which a JSON.stringify fallback would double.
function textOf(content) {
  if (typeof content === 'string') return content;
  return (Array.isArray(content) ? content : []).map((b) => (b && b.text) || '').join('\n');
}

// One result standing for a multi-turn session: per-turn fields summed, cumulative ones from
// the last turn. A single-result transcript never comes through here, so it keeps its shape.
function mergeResults(results) {
  const sum = (pick) => results.reduce((n, x) => n + (pick(x) || 0), 0);
  const usage = (x) => x.usage || {};
  return {
    ...results[results.length - 1],
    num_turns: sum((x) => x.num_turns),
    duration_ms: sum((x) => x.duration_ms),
    is_error: results.some((x) => x.is_error),
    permission_denials: results.flatMap((x) => x.permission_denials || []),
    usage: {
      input_tokens: sum((x) => usage(x).input_tokens),
      output_tokens: sum((x) => usage(x).output_tokens),
      cache_read_input_tokens: sum((x) => usage(x).cache_read_input_tokens),
      cache_creation_input_tokens: sum((x) => usage(x).cache_creation_input_tokens),
      output_tokens_details: { thinking_tokens: sum((x) => (usage(x).output_tokens_details || {}).thinking_tokens) },
    },
  };
}

// A workflow agent's exact usage from its own transcript. Returns null when the agent's file
// is gone, which the caller records as null fields rather than zeros.
function readWorkflowAgent(dir, agentId) {
  const base = path.join(dir, `agent-${agentId}`);
  let text;
  try {
    text = fs.readFileSync(`${base}.jsonl`, 'utf8');
  } catch {
    return null;
  }
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(`${base}.meta.json`, 'utf8'));
  } catch {
    // The meta file is a convenience; the jsonl alone still gives the numbers.
  }
  const byMessage = new Map();
  for (const e of parseTranscript(text)) {
    if (e.type === 'assistant' && e.message && e.message.id) byMessage.set(e.message.id, e.message);
  }
  const acc = { agentType: meta.agentType || null, model: null, ...zeroInput(), output: 0, thinking: 0 };
  for (const m of byMessage.values()) {
    const u = m.usage || {};
    acc.model = acc.model || m.model || null;
    addInput(acc, u);
    acc.output += u.output_tokens || 0;
    acc.thinking += (u.output_tokens_details && u.output_tokens_details.thinking_tokens) || 0;
  }
  // meta.model is an alias ("opus"); the message model is the real id, so it wins when present.
  acc.model = acc.model || meta.model || null;
  return acc;
}

function computeMetrics(events, opts = {}) {
  const testCommand = opts.testCommand || null;
  const seenMessages = new Set();
  const seenToolUses = new Set();
  // postSpawnCalls: the lead's own tool calls once a worker has been spawned, by tool. That is
  // where the verification gate shows up (a Read at a cited line, a Grep, a test re-run).
  const lead = { model: null, ...zeroInput(), output: null, thinking: null, finalContext: 0, toolCalls: {}, verificationRuns: 0, postSpawnCalls: {} };
  const spawns = {}; // Agent tool_use id -> subagent_type
  const workers = {}; // subagent_type -> input-side sums, spawns, tool calls, reported totals
  const workflows = {}; // Workflow tool_use id -> { name, transcriptDir, completed, agents by agentId }
  const hooks = { started: {}, permissionDenied: 0, rateLimitEvents: 0 };
  let sawSpawn = false;
  const results = [];

  const workerByType = (type) => {
    if (!workers[type]) workers[type] = { model: null, ...zeroInput(), spawnIds: new Set(), toolCalls: {}, reportedTokens: 0, reportedSpawns: 0, output: null, thinking: null };
    return workers[type];
  };
  const workerFor = (parent) => workerByType(spawns[parent] || 'unknown');

  for (const e of events) {
    if (e.type === 'system') {
      if (e.subtype === 'hook_started') bump(hooks.started, e.hook_name || e.hook_event || '?');
      if (e.subtype === 'permission_denied') hooks.permissionDenied += 1;
      const wf = workflows[e.tool_use_id];
      if (wf && e.subtype === 'task_progress') {
        // Progress lists phases too; only entries with an agentId are agents. A "done" entry
        // carries what "start" lacked, so later events fill in rather than replace.
        for (const p of e.workflow_progress || []) {
          if (!p.agentId) continue;
          const a = wf.agents[p.agentId] || (wf.agents[p.agentId] = { label: null, agentId: p.agentId, agentType: null, model: null, state: null, tokens: null, toolCalls: null, durationMs: null });
          for (const k of ['label', 'agentType', 'model', 'state', 'tokens', 'toolCalls', 'durationMs']) if (p[k] !== undefined) a[k] = p[k];
        }
      }
      if (wf && e.subtype === 'task_notification' && e.status === 'completed') wf.completed = true;
      continue;
    }
    if (e.type === 'rate_limit_event') {
      hooks.rateLimitEvents += 1;
      continue;
    }
    if (e.type === 'result') {
      results.push(e);
      continue;
    }
    if (e.type === 'user' && !e.parent_tool_use_id) {
      for (const b of (e.message && e.message.content) || []) {
        if (!b || b.type !== 'tool_result') continue;
        if (workflows[b.tool_use_id]) {
          const dir = textOf(b.content).match(/^Transcript dir:\s*(.+)$/m);
          if (dir) workflows[b.tool_use_id].transcriptDir = dir[1].trim();
          continue;
        }
        if (!spawns[b.tool_use_id]) continue;
        const u = parseSubagentUsage(b.content);
        if (!u) continue;
        const w = workerFor(b.tool_use_id);
        w.reportedTokens += u.tokens;
        w.reportedSpawns += 1;
      }
      continue;
    }
    if (e.type !== 'assistant') continue;

    const m = e.message || {};
    const parent = e.parent_tool_use_id || null;

    for (const b of m.content || []) {
      if (b.type !== 'tool_use' || seenToolUses.has(b.id)) continue;
      seenToolUses.add(b.id);
      if (parent) {
        bump(workerFor(parent).toolCalls, b.name);
        continue;
      }
      bump(lead.toolCalls, b.name);
      if (sawSpawn && b.name !== 'Agent' && b.name !== 'Workflow') bump(lead.postSpawnCalls, b.name);
      if (b.name === 'Agent') {
        spawns[b.id] = (b.input && b.input.subagent_type) || 'unknown';
        sawSpawn = true;
      }
      if (b.name === 'Workflow') {
        // A named workflow passes `name`; an inline one only has its script's meta block.
        const input = b.input || {};
        const meta = String(input.script || '').match(/name:\s*['"]([^'"]+)/);
        workflows[b.id] = { id: b.id, name: input.name || (meta && meta[1]) || 'inline', transcriptDir: null, completed: false, agents: {} };
        sawSpawn = true;
      }
      // The verification gate: the lead re-running the task's test command once a worker
      // has been spawned. The simplest approximation of "after a worker returned".
      if (b.name === 'Bash' && sawSpawn && testCommand) {
        const cmd = String((b.input && b.input.command) || '');
        if (cmd.includes(testCommand)) lead.verificationRuns += 1;
      }
    }

    if (!m.id || seenMessages.has(m.id)) continue;
    seenMessages.add(m.id);
    const u = m.usage || {};
    if (parent) {
      const w = workerFor(parent);
      w.model = w.model || m.model;
      w.spawnIds.add(parent);
      addInput(w, u);
    } else {
      lead.model = lead.model || m.model;
      addInput(lead, u);
      lead.finalContext = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    }
  }

  const r = results.length > 1 ? mergeResults(results) : results[0] || {};
  const ru = r.usage || {};
  lead.output = typeof ru.output_tokens === 'number' ? ru.output_tokens : null;
  lead.thinking = (ru.output_tokens_details && ru.output_tokens_details.thinking_tokens) ?? null;

  // opts.workflowDir is where the runner keeps its copy of each run's transcript dir. The copy
  // is preferred; the path the session named (under ~/.claude/projects) is the fallback.
  const locateDir = (transcriptDir) => {
    if (!transcriptDir) return null;
    const copy = opts.workflowDir ? path.join(opts.workflowDir, transcriptDir.split(/[\\/]/).pop()) : null;
    if (copy && fs.existsSync(copy)) return copy;
    return fs.existsSync(transcriptDir) ? transcriptDir : null;
  };
  // Workers whose output is exact (read from an agent file), which the residual step must not overwrite.
  const exact = new Set();
  const workflowList = Object.values(workflows).map((wf) => ({ ...wf, agents: Object.values(wf.agents).sort((a, b) => String(a.label).localeCompare(String(b.label))) }));
  for (const wf of workflowList) {
    const dir = locateDir(wf.transcriptDir);
    for (const a of wf.agents) {
      const f = dir ? readWorkflowAgent(dir, a.agentId) : null;
      a.agentType = (f && f.agentType) || a.agentType || null;
      a.model = (f && f.model) || a.model || null;
      for (const k of ['messages', 'input', 'cacheRead', 'cacheWrite', 'output', 'thinking']) a[k] = f ? f[k] : null;
      const w = workerByType(a.agentType || `workflow:${a.label}`);
      w.spawnIds.add(a.agentId);
      w.model = w.model || a.model;
      if (!f) continue;
      for (const k of ['messages', 'input', 'cacheRead', 'cacheWrite']) w[k] += f[k];
      w.output = (w.output || 0) + f.output;
      w.thinking = (w.thinking || 0) + f.thinking;
      exact.add(w);
    }
  }

  for (const w of Object.values(workers)) {
    w.spawns = w.spawnIds.size;
    delete w.spawnIds;
    // reportedTokens is kept as reported. It is not the sum of the usage categories (observed
    // 33,957 against 67k of modelUsage for one explorer), so output is never derived from it.
  }

  const byModel = {};
  for (const [model, mu] of Object.entries(r.modelUsage || {})) {
    byModel[model] = {
      input: mu.inputTokens || 0,
      output: mu.outputTokens || 0,
      cacheRead: mu.cacheReadInputTokens || 0,
      cacheWrite: mu.cacheCreationInputTokens || 0,
      thinking: mu.thinkingTokens || 0,
      costUSD: mu.costUSD ?? null,
    };
  }
  // Everything the workers spent, by model: the model total less the lead's own share.
  const workersByModel = {};
  for (const [model, mu] of Object.entries(byModel)) {
    const isLead = model === lead.model;
    const w = {
      input: mu.input - (isLead ? ru.input_tokens || 0 : 0),
      output: mu.output - (isLead ? ru.output_tokens || 0 : 0),
      cacheRead: mu.cacheRead - (isLead ? ru.cache_read_input_tokens || 0 : 0),
      cacheWrite: mu.cacheWrite - (isLead ? ru.cache_creation_input_tokens || 0 : 0),
    };
    if (w.input || w.output || w.cacheRead || w.cacheWrite) workersByModel[model] = w;
  }
  // When exactly one worker type ran on a model, that model's residual output is its output.
  // Two types on one model (editor and test-runner on Sonnet, say) stay null: ambiguous.
  for (const [model, residual] of Object.entries(workersByModel)) {
    const types = Object.values(workers).filter((w) => w.model === model);
    if (types.length === 1 && !exact.has(types[0])) types[0].output = residual.output;
  }

  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, thinking: 0 };
  for (const mu of Object.values(byModel)) {
    totals.input += mu.input;
    totals.output += mu.output;
    totals.cacheRead += mu.cacheRead;
    totals.cacheWrite += mu.cacheWrite;
    totals.thinking += mu.thinking;
  }
  totals.tokens = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;

  return {
    lead,
    workers,
    workersByModel,
    byModel,
    totals,
    result: {
      is_error: r.is_error,
      subtype: r.subtype,
      stop_reason: r.stop_reason,
      terminal_reason: r.terminal_reason,
      num_turns: r.num_turns,
      duration_ms: r.duration_ms,
      duration_api_ms: r.duration_api_ms,
      total_cost_usd: r.total_cost_usd,
      usage: { input: ru.input_tokens, output: ru.output_tokens, cacheRead: ru.cache_read_input_tokens, cacheWrite: ru.cache_creation_input_tokens },
      subagent_stats: r.subagent_stats || null,
      permission_denials: (r.permission_denials || []).map((d) => d.tool_name),
      result_text: typeof r.result === 'string' ? r.result : '',
      resultEvents: results.length,
    },
    workflows: workflowList,
    hooks,
  };
}

function metricsFromFiles(transcriptPath, opts = {}) {
  const events = parseTranscript(fs.readFileSync(transcriptPath, 'utf8'));
  const metrics = computeMetrics(events, opts);
  if (opts.probePath && fs.existsSync(opts.probePath)) {
    metrics.hooks.probe = summarizeProbe(fs.readFileSync(opts.probePath, 'utf8'));
  }
  return metrics;
}

module.exports = { parseTranscript, computeMetrics, summarizeProbe, parseSubagentUsage, metricsFromFiles };

if (require.main === module) {
  const [transcript, probe, testCommand] = process.argv.slice(2);
  if (!transcript) {
    console.error('usage: node metrics.js <transcript.jsonl> [probe.jsonl] [testCommand]');
    process.exit(1);
  }
  const m = metricsFromFiles(transcript, { probePath: probe, testCommand });
  delete m.result.result_text;
  console.log(JSON.stringify(m, null, 2));
}
