export const meta = {
  name: 'data-analysis-review',
  description: "Independent empirical review of a data science project: blind EDA, cross-role reconciliation, then comparison against the project's own stated conclusions",
  phases: [
    { title: 'Independent EDA', detail: "fixed 4 roles + confirmed extras, run blind to the project's own conclusions" },
    { title: 'Reconcile', detail: 'single barrier agent checks for contradictions between roles' },
    { title: 'Cross-Compare', detail: "one agent per reconciled topic, checked against the project's own claims" },
  ],
}

const SCOPE_DISCIPLINE = "Scope discipline: Only read and use the exact file paths listed above. Do not use Glob or Grep to search for other files, directories, or paths beyond what was explicitly given to you. Do not invoke the Agent tool or spawn any subagents under any circumstance -- perform all analysis yourself. If you believe you need a file that wasn't provided, stop and report that gap in your findings instead of searching for it."

const FINDING_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
    claim: { type: 'string' },
    evidence: { type: 'string' },
    required_execution: { type: 'boolean' },
  },
  required: ['severity', 'claim', 'evidence', 'required_execution'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: FINDING_ITEM_SCHEMA },
  },
  required: ['findings'],
}

const RECONCILE_SCHEMA = {
  type: 'object',
  properties: {
    reconciled: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          finding: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['topic', 'finding', 'evidence'],
      },
    },
    disagreements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          description: { type: 'string' },
          roles_involved: { type: 'array', items: { type: 'string' } },
        },
        required: ['topic', 'description', 'roles_involved'],
      },
    },
  },
  required: ['reconciled', 'disagreements'],
}

const CROSS_COMPARE_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    project_claim: { type: 'string' },
    independent_finding: { type: 'string' },
    discrepancy: { type: 'string' },
    verdict: { type: 'string', enum: ['Supported', 'Partially Supported', 'Unsupported', 'Not Addressed'] },
  },
  required: ['topic', 'project_claim', 'independent_finding', 'discrepancy', 'verdict'],
}

const ROLE_LABELS = {
  data_quality: 'Data Quality & Integrity Reviewer',
  statistical: 'Statistical Methodologist',
  domain_alignment: 'Domain Alignment Reviewer',
  reproducibility: 'Reproducibility Auditor',
}

function buildEdaPrompt(role, thesis) {
  const parts = []
  parts.push(`Business thesis and goals (confirmed with the project owner):\n${thesis}`)
  if (role.persona) {
    parts.push(`Your specific review persona and checklist for this run:\n${role.persona}`)
  }
  parts.push(`Files you may use, and ONLY these:\n${(role.paths || []).map((p) => `- ${p}`).join('\n')}`)
  if (role.guidance) {
    parts.push(`Relevant guidance to apply:\n${role.guidance}`)
  }
  parts.push('Execute code/queries against the raw data where possible to independently recompute and verify claims empirically. If execution is not possible (e.g. data too large, missing runtime), fall back to static code/doc review and explicitly note the limitation in your findings rather than silently skipping it.')
  parts.push(SCOPE_DISCIPLINE)
  return parts.join('\n\n')
}

const A = typeof args === 'string' ? JSON.parse(args) : args

// Structural enforcement of the sandbox-by-copy guarantee (SKILL.md step 8): this mirrors the
// boundary check already tested in lib/sandbox-paths.js's rewritePath, inlined here because
// Workflow scripts have no filesystem/require access to import it directly. If SKILL.md failed
// to sandbox a path (or an operator pasted an original path by mistake), refuse before a single
// agent -- let alone one wielding Bash -- is ever dispatched.
function assertSandboxed(paths, sandboxRoot, label) {
  const root = String(sandboxRoot || '').replace(/\\/g, '/').replace(/\/+$/, '')
  if (!root) {
    throw new Error(`Refusing to run: sandboxRoot is missing or empty -- SKILL.md step 8 must produce a real sandbox directory and pass it as args.sandboxRoot before calling this workflow. (Checking ${label}.)`)
  }
  for (const p of paths || []) {
    const norm = String(p).replace(/\\/g, '/').replace(/\/+$/, '')
    if (norm !== root && !norm.startsWith(root + '/')) {
      throw new Error(`Refusing to run: ${label} path "${p}" is not inside the sandbox root "${sandboxRoot}" -- SKILL.md step 8 must rewrite every path into the sandbox copy before calling this workflow.`)
    }
  }
}

assertSandboxed(A.fixedRolePaths.dataQuality, A.sandboxRoot, 'fixedRolePaths.dataQuality')
assertSandboxed(A.fixedRolePaths.statistical, A.sandboxRoot, 'fixedRolePaths.statistical')
assertSandboxed(A.fixedRolePaths.domainAlignment, A.sandboxRoot, 'fixedRolePaths.domainAlignment')
assertSandboxed(A.fixedRolePaths.reproducibility, A.sandboxRoot, 'fixedRolePaths.reproducibility')
;(A.extras || []).forEach((e) => assertSandboxed(e.paths, A.sandboxRoot, `extras.${e.key}`))
assertSandboxed(A.conclusionPaths, A.sandboxRoot, 'conclusionPaths')

phase('Independent EDA')

// Namespaced as 'data-analysis-review:<agent-name>' to match this plugin's own plugin.json
// "name" field, mirroring the pattern observed in 4 independently-installed plugins in this
// environment (each plugin's agents resolve as '<that plugin's own name>:<agent-name>'). Not
// yet confirmed against a real install of THIS plugin -- carry that into the post-install smoke
// test (see docs/superpowers/plans/2026-07-17-data-analysis-review-skill.md and
// .superpowers/sdd/progress.md). If this plugin's agents turn out to resolve bare instead, a
// wrong guess here fails loudly (every agent() call throws "agent type not found", zero agents
// dispatched) rather than silently misrouting -- this was evaluated and accepted as the better
// failure mode versus a bare reference risking a same-named agent from an unrelated plugin.
const roster = [
  { key: 'data_quality', agentType: 'data-analysis-review:data-quality-reviewer', paths: A.fixedRolePaths.dataQuality, guidance: A.skillGuidanceExcerpts && A.skillGuidanceExcerpts.data_quality },
  { key: 'statistical', agentType: 'data-analysis-review:statistical-methodologist', paths: A.fixedRolePaths.statistical, guidance: A.skillGuidanceExcerpts && A.skillGuidanceExcerpts.statistical },
  { key: 'domain_alignment', agentType: 'data-analysis-review:domain-alignment-reviewer', paths: A.fixedRolePaths.domainAlignment, guidance: A.skillGuidanceExcerpts && A.skillGuidanceExcerpts.domain_alignment },
  { key: 'reproducibility', agentType: 'data-analysis-review:reproducibility-auditor', paths: A.fixedRolePaths.reproducibility, guidance: A.skillGuidanceExcerpts && A.skillGuidanceExcerpts.reproducibility },
  ...((A.extras || []).map((e) => ({ key: e.key, agentType: 'data-analysis-review:extra-reviewer', paths: e.paths, persona: e.persona, label: e.label }))),
].map((role) => ({ ...role, label: role.label || ROLE_LABELS[role.key] || role.key }))

const edaResults = await parallel(
  roster.map((role) => () =>
    agent(buildEdaPrompt(role, A.thesis), {
      label: `eda:${role.key}`,
      phase: 'Independent EDA',
      agentType: role.agentType,
      schema: FINDINGS_SCHEMA,
    }).then((result) => ({ key: role.key, label: role.label, findings: result.findings }))
  )
)

phase('Reconcile')

const validEdaResults = edaResults.filter(Boolean)
const reconcilePrompt = [
  `You are reconciling independent findings from ${validEdaResults.length} reviewers on the same data science project. None of them saw each other's work or the project's own stated conclusions.`,
  ...validEdaResults.map((r) => `### ${r.label}\n${JSON.stringify(r.findings)}`),
].join('\n\n')

const reconciled = await agent(reconcilePrompt, {
  label: 'reconcile',
  phase: 'Reconcile',
  agentType: 'data-analysis-review:findings-reconciler',
  schema: RECONCILE_SCHEMA,
})

phase('Cross-Compare')

const crossCompareResults = await parallel(
  (reconciled.reconciled || []).map((topic) => () => {
    const prompt = [
      "You are auditing whether this project's own stated conclusions match an independent reviewer's finding.",
      `Topic: ${topic.topic}`,
      `Independent finding: ${topic.finding}`,
      `Evidence: ${topic.evidence}`,
      `The project's own conclusion/report file(s), and ONLY these:\n${(A.conclusionPaths || []).map((p) => `- ${p}`).join('\n')}`,
      SCOPE_DISCIPLINE,
      "Read the project's own files and find the part (if any) relevant to this specific topic. Compare what it claims to the independent finding above. If the files don't address this topic at all, say so and use the verdict `Not Addressed`. Otherwise return the discrepancy (if any) and a verdict.",
    ].join('\n\n')
    return agent(prompt, {
      label: `cross-compare:${topic.topic}`,
      phase: 'Cross-Compare',
      agentType: 'data-analysis-review:thesis-auditor',
      schema: CROSS_COMPARE_SCHEMA,
    })
  })
)

return {
  eda: validEdaResults,
  reconciled: reconciled.reconciled || [],
  disagreements: reconciled.disagreements || [],
  crossCompare: crossCompareResults.filter(Boolean),
}
