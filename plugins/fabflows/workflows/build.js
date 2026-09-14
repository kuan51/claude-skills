export const meta = {
  name: 'build',
  description: "Build one spec'd change on a feature branch: an Opus builder implements and commits, a fresh reviewer returns ACCEPT or REWORK, and rework is capped",
  whenToUse: "Run by the fabflows lead after the user approves a build loop for a spec'd, sizeable change. args: spec, branch, baseRef, testCommand, and optionally reviewerModel. The lead first checks that the working tree is clean and that branch is checked out. With no args, do not call it: ask the fabflows lead to prepare the spec and settings.",
  phases: [
    { title: 'Build', detail: 'fabflows:editor on Opus implements the spec and commits to the branch' },
    { title: 'Review', detail: 'a fresh fabflows:refuter reads the diff and re-runs the tests' },
  ],
}

// No filesystem or shell here: the lead gathers baseRef and checks the tree before starting.
// A copy, so trimming below never touches the caller's args.
const a = { ...args }

const REQUIRED = ['spec', 'branch', 'baseRef', 'testCommand']
const missing = REQUIRED.filter((k) => typeof a[k] !== 'string' || !a[k].trim())
if (missing.length) {
  log(`fabflows:build is missing ${missing.join(', ')} -- nothing to build`)
  return {
    status: 'not-started',
    reason: 'missing-args',
    missing,
    next: 'Ask the fabflows lead to prepare the build: it writes the spec, checks the working tree is clean and the feature branch is checked out, and passes spec, branch, baseRef and testCommand.',
  }
}
for (const k of REQUIRED) a[k] = a[k].trim()

// A backstop, not the main control: whether the guard hook fires inside workflow agents is
// unverified, and a builder handed the default branch would commit to it.
if (/^(main|master)$/i.test(a.branch)) {
  log(`refusing to build on ${a.branch}`)
  return {
    status: 'not-started',
    reason: 'default-branch',
    next: 'Create a feature branch named for the change, check it out, and run again. Merging to the default branch stays a human pull request.',
  }
}

const MAX_REWORK = 2
const reviewerModel = typeof a.reviewerModel === 'string' && a.reviewerModel.trim() ? a.reviewerModel.trim() : 'fable'

// Workers keep their prose report contract inside the structured result, so the lead can read
// it and the SubagentStop contract check still finds its markers.
const REPORT = {
  type: 'string',
  minLength: 1,
  description: 'The worker report contract in prose: any permission denial first, files touched as path:line, each command run and its real output, and confirmed / inferred / guessed on every claim.',
}
const BUILD = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    blocker: { type: 'string', description: 'when blocked: what stopped the work, a permission denial included; omit when done' },
    report: REPORT,
  },
  required: ['status', 'report'],
}
const FINDING = {
  type: 'object',
  properties: {
    location: { type: 'string', description: 'path:line' },
    problem: { type: 'string' },
    evidence: { type: 'string' },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['location', 'problem', 'evidence', 'severity'],
}
const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ACCEPT', 'REWORK', 'BLOCKED'] },
    blocker: { type: 'string', description: 'when BLOCKED: what stopped the review' },
    mustFix: { type: 'array', items: FINDING },
    report: REPORT,
  },
  required: ['verdict', 'mustFix', 'report'],
}

// Every brief carries the four labelled parts: fabflows workers stop on a brief missing one.
function buildBrief(round, mustFix) {
  const rework = mustFix
    ? `\n\nThis is rework round ${round - 1}. A reviewer rejected the previous round. Your earlier commits are already on the branch -- start by running \`git diff ${a.baseRef}..HEAD\` to see them. Fix every must-fix item below and nothing else:\n` +
      mustFix.map((f, i) => `${i + 1}. ${f.location} -- ${f.problem} (evidence: ${f.evidence})`).join('\n')
    : ''
  return [
    `**Objective:** Implement the spec below on the branch \`${a.branch}\`, then commit.${rework}`,
    '',
    '<spec>',
    a.spec,
    '</spec>',
    '',
    '**Output:** The structured result: status (done, or blocked with what stopped you in blocker -- a permission denial is a blocker, quoted there; leave blocker out when done) and report -- your usual report contract in prose, including the commits you made and any deviation from the spec.',
    '',
    `**Tools and paths:** Read, Edit, Write, Grep, Glob, and Bash in this repository. Run \`${a.testCommand}\` to prove the change.`,
    '',
    `**Boundaries:** First run \`git rev-parse --abbrev-ref HEAD\`; if it does not print \`${a.branch}\`, report blocked and change nothing. Commit to \`${a.branch}\` once \`${a.testCommand}\` passes -- this brief authorizes those commits and no others. Never push, merge, rebase, or reset. If the spec turns out to be wrong or impossible, report blocked instead of redesigning it. Change only what the spec${mustFix ? ' and the must-fix list' : ''} requires.`,
  ].join('\n')
}

function reviewBrief(round) {
  return [
    `**Objective:** Decide whether the change on \`${a.branch}\` since \`${a.baseRef}\` implements the spec below. Try to show that it does not. This is review round ${round}; you have not seen any earlier round.`,
    '',
    '<spec>',
    a.spec,
    '</spec>',
    '',
    '**Output:** The structured result: verdict (ACCEPT when there are no must-fix findings, REWORK when there is at least one, BLOCKED when you could not run the diff or the test command -- say what stopped you in blocker), mustFix as findings with path:line, problem, evidence and severity, and report -- your usual report contract in prose, including your notes and the test output.',
    '',
    `**Tools and paths:** Read, Grep, Glob, and Bash for exactly these commands: \`git diff ${a.baseRef}..HEAD\`, \`git log\`, \`git show\`, \`git status\`, and \`${a.testCommand}\`.`,
    '',
    '**Boundaries:** Read-only. Never edit, create, or delete a file; never commit, push, merge, rebase, or reset. Must-fix means the change contradicts the spec, a test fails, or it is a real bug; everything else is a note.',
  ].join('\n')
}

const rounds = []
let mustFix = null

// Every escalation carries the last review the loop saw, or null when none ran.
function escalate(reason) {
  const verdict = rounds.map((r) => r.review).filter(Boolean).pop() || null
  return { status: 'escalate', reason, baseRef: a.baseRef, rounds, verdict }
}

for (let round = 1; round <= MAX_REWORK + 1; round++) {
  const build = await agent(buildBrief(round, mustFix), {
    label: `build:${round}`,
    phase: 'Build',
    agentType: 'fabflows:editor',
    model: 'opus',
    effort: 'medium',
    schema: BUILD,
  })
  // A done reply that still names a blocker contradicts itself: escalate rather than review it.
  if (!build || build.status !== 'done' || (build.blocker && build.blocker.trim())) {
    rounds.push({ round, build, review: null })
    log(`round ${round}: the builder ${build ? 'reported blocked' : 'returned nothing'} -- escalating to the lead`)
    return escalate(build ? 'blocked' : 'builder-failed')
  }

  const review = await agent(reviewBrief(round), {
    label: `review:${round}`,
    phase: 'Review',
    agentType: 'fabflows:refuter',
    model: reviewerModel,
    effort: 'medium',
    schema: VERDICT,
  })
  rounds.push({ round, build, review })
  if (!review) {
    log(`round ${round}: the reviewer returned nothing -- escalating to the lead`)
    return escalate('reviewer-failed')
  }
  // The review never ran, so any must-fix items with it are not rework the builder can do.
  if (review.verdict === 'BLOCKED') {
    log(`round ${round}: the reviewer could not review -- escalating to the lead`)
    return escalate('reviewer-blocked')
  }
  if (review.verdict === 'ACCEPT' && review.mustFix.length) {
    log(`round ${round}: ACCEPT with ${review.mustFix.length} must-fix item(s) -- escalating rather than guessing`)
    return escalate('accept-with-must-fix')
  }
  if (review.verdict === 'ACCEPT') {
    log(`round ${round}: ACCEPT`)
    return { status: 'accepted', baseRef: a.baseRef, rounds, verdict: review }
  }
  if (!review.mustFix.length) {
    log(`round ${round}: REWORK with no must-fix items -- escalating rather than guessing`)
    return escalate('rework-without-must-fix')
  }
  mustFix = review.mustFix
  log(`round ${round}: REWORK with ${mustFix.length} must-fix item(s)`)
}

log(`rework cap of ${MAX_REWORK} reached -- escalating to the lead`)
return escalate('rework-cap')
