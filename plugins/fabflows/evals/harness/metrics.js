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

const fs = require('node:fs');

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

function computeMetrics(events, opts = {}) {
  const testCommand = opts.testCommand || null;
  const seenMessages = new Set();
  const seenToolUses = new Set();
  // postSpawnCalls: the lead's own tool calls once a worker has been spawned, by tool. That is
  // where the verification gate shows up (a Read at a cited line, a Grep, a test re-run).
  const lead = { model: null, ...zeroInput(), output: null, thinking: null, finalContext: 0, toolCalls: {}, verificationRuns: 0, postSpawnCalls: {} };
  const spawns = {}; // Agent tool_use id -> subagent_type
  const workers = {}; // subagent_type -> input-side sums, spawns, tool calls, reported totals
  const hooks = { started: {}, permissionDenied: 0, rateLimitEvents: 0 };
  let sawSpawn = false;
  let result = null;

  const workerFor = (parent) => {
    const type = spawns[parent] || 'unknown';
    if (!workers[type]) workers[type] = { model: null, ...zeroInput(), spawnIds: new Set(), toolCalls: {}, reportedTokens: 0, reportedSpawns: 0, output: null };
    return workers[type];
  };

  for (const e of events) {
    if (e.type === 'system') {
      if (e.subtype === 'hook_started') bump(hooks.started, e.hook_name || e.hook_event || '?');
      if (e.subtype === 'permission_denied') hooks.permissionDenied += 1;
      continue;
    }
    if (e.type === 'rate_limit_event') {
      hooks.rateLimitEvents += 1;
      continue;
    }
    if (e.type === 'result') {
      result = e;
      continue;
    }
    if (e.type === 'user' && !e.parent_tool_use_id) {
      for (const b of (e.message && e.message.content) || []) {
        if (!b || b.type !== 'tool_result' || !spawns[b.tool_use_id]) continue;
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
      if (sawSpawn && b.name !== 'Agent') bump(lead.postSpawnCalls, b.name);
      if (b.name === 'Agent') {
        spawns[b.id] = (b.input && b.input.subagent_type) || 'unknown';
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

  const r = result || {};
  const ru = r.usage || {};
  lead.output = typeof ru.output_tokens === 'number' ? ru.output_tokens : null;
  lead.thinking = (ru.output_tokens_details && ru.output_tokens_details.thinking_tokens) ?? null;

  for (const w of Object.values(workers)) {
    w.spawns = w.spawnIds.size;
    delete w.spawnIds;
    // reportedTokens is kept as reported. It is not the sum of the usage categories (observed
    // 33,957 against 67k of modelUsage for one explorer), so output is not derived from it.
    w.output = null;
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
    if (types.length === 1) types[0].output = residual.output;
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
    },
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
