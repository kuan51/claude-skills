'use strict';
// A Workflow run reshapes the stream: two turns, so two `result` events to sum, and agents
// that never appear as `assistant` events, only in task_progress and in their own transcript
// files. The fixture is a trimmed real probe with the names, models and numbers edited so
// that each assertion can tell where a value came from.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseTranscript, computeMetrics } = require('../evals/harness/metrics.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'transcript-workflow.jsonl');
const WORKFLOW_DIR = path.join(__dirname, 'fixtures', 'workflow-dir');
const events = () => parseTranscript(fs.readFileSync(FIXTURE, 'utf8'));

test('a workflow run sums the per-turn results and reads its agents from the copied transcript dir', () => {
  const m = computeMetrics(events(), { testCommand: 'npm test', workflowDir: WORKFLOW_DIR });

  assert.equal(m.result.resultEvents, 2);
  assert.equal(m.result.num_turns, 2 + 1, 'num_turns is per turn and adds up');
  assert.equal(m.result.duration_ms, 5000 + 2500);
  assert.equal(m.result.total_cost_usd, 0.5, 'cost is cumulative, so the last result stands');
  assert.equal(m.result.is_error, false);
  assert.equal(m.result.result_text, 'Build finished: implemented SPEC.md, npm test passes, committed.');
  assert.equal(m.lead.output, 400 + 300, 'lead output is the sum of both results');
  assert.equal(m.lead.thinking, 200 + 100);
  assert.deepEqual(m.lead.toolCalls, { Workflow: 1 });
  assert.equal(m.lead.messages, 3);

  assert.equal(m.workflows.length, 1);
  const wf = m.workflows[0];
  assert.equal(wf.name, 'fabflows:build');
  assert.equal(wf.completed, true);
  assert.equal(wf.transcriptDir, '/nonexistent/wf_fixture', 'parsed from the Workflow tool_result');
  assert.equal(wf.agents.length, 1);
  const a = wf.agents[0];
  assert.equal(a.label, 'build:1');
  assert.equal(a.state, 'done');
  assert.equal(a.tokens, 8386, 'the progress event total is kept as reported');
  // The progress entry says claude-opus-4-1; the agent file's message says the dated id.
  assert.equal(a.agentType, 'fabflows:editor');
  assert.equal(a.model, 'claude-opus-4-1-20250805', "the agent's model comes from its own transcript");
  assert.equal(a.messages, 1, 'two events for one message.id count once');
  assert.equal(a.output, 330, 'the last event per message.id carries the real output, not the snapshot');
  assert.equal(a.thinking, 210);
  assert.equal(a.cacheWrite, 8381);

  const w = m.workers['fabflows:editor'];
  assert.ok(w, 'a workflow agent folds into workers under its agentType');
  assert.equal(w.spawns, 1);
  assert.equal(w.model, 'claude-opus-4-1-20250805');
  assert.deepEqual(w.toolCalls, {});
  // modelUsage says 335 for Opus on purpose: the worker's output is the file's exact 330, and
  // the residual step must not overwrite it.
  assert.equal(w.output, 330);
  assert.equal(w.thinking, 210);
  assert.equal(m.byModel['claude-opus-4-1-20250805'].output, 335);
  assert.equal(m.workersByModel['claude-opus-4-1-20250805'].output, 335);
  assert.equal(m.byModel['claude-fable-5-1'].output, 700);
  assert.equal(m.workersByModel['claude-fable-5-1'], undefined, "the lead's summed usage cancels its own model");
});

test('a workflow whose transcript dir is gone keeps the agent with null file-derived fields', () => {
  const m = computeMetrics(events(), { testCommand: 'npm test' });
  const a = m.workflows[0].agents[0];
  assert.equal(a.agentType, 'fabflows:editor', 'the progress entry still names the agent type');
  assert.equal(a.model, 'claude-opus-4-1', 'without the file, the progress entry model stands');
  assert.equal(a.output, null);
  assert.equal(a.thinking, null);
  assert.equal(a.messages, null);
  const w = m.workers['fabflows:editor'];
  assert.equal(w.spawns, 1);
  assert.equal(w.output, null, 'no exact output and a model absent from modelUsage under that id, so nothing to derive');
});
