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

phase('Independent EDA')

const roster = [
  { key: 'data_quality', agentType: 'data-quality-reviewer', paths: args.fixedRolePaths.dataQuality, guidance: args.skillGuidanceExcerpts && args.skillGuidanceExcerpts.data_quality },
  { key: 'statistical', agentType: 'statistical-methodologist', paths: args.fixedRolePaths.statistical, guidance: args.skillGuidanceExcerpts && args.skillGuidanceExcerpts.statistical },
  { key: 'domain_alignment', agentType: 'domain-alignment-reviewer', paths: args.fixedRolePaths.domainAlignment, guidance: args.skillGuidanceExcerpts && args.skillGuidanceExcerpts.domain_alignment },
  { key: 'reproducibility', agentType: 'reproducibility-auditor', paths: args.fixedRolePaths.reproducibility, guidance: args.skillGuidanceExcerpts && args.skillGuidanceExcerpts.reproducibility },
  ...((args.extras || []).map((e) => ({ key: e.key, agentType: 'extra-reviewer', paths: e.paths, persona: e.persona, label: e.label }))),
].map((role) => ({ ...role, label: role.label || ROLE_LABELS[role.key] || role.key }))

const edaResults = await parallel(
  roster.map((role) => () =>
    agent(buildEdaPrompt(role, args.thesis), {
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
  agentType: 'findings-reconciler',
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
      `The project's own conclusion/report file(s), and ONLY these:\n${(args.conclusionPaths || []).map((p) => `- ${p}`).join('\n')}`,
      SCOPE_DISCIPLINE,
      "Read the project's own files and find the part (if any) relevant to this specific topic. Compare what it claims to the independent finding above. If the files don't address this topic at all, say so and use the verdict `Not Addressed`. Otherwise return the discrepancy (if any) and a verdict.",
    ].join('\n\n')
    return agent(prompt, {
      label: `cross-compare:${topic.topic}`,
      phase: 'Cross-Compare',
      agentType: 'thesis-auditor',
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
