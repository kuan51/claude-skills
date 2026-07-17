'use strict';

function renderFindings(eda) {
  if (!eda || !eda.length) return '_No independent findings recorded._';
  return eda
    .map((role) => {
      const lines = (role.findings || [])
        .map(
          (f) =>
            `- **[${f.severity}]** ${f.claim}\n  - Evidence: ${f.evidence}${
              f.required_execution ? ' (recomputed)' : ' (static review)'
            }`
        )
        .join('\n');
      return `### ${role.label || role.key}\n\n${lines || '_No findings._'}`;
    })
    .join('\n\n');
}

function renderDisagreements(disagreements) {
  if (!disagreements || !disagreements.length) return '_No cross-role disagreements found._';
  return disagreements
    .map((d) => `- **${d.topic}**: ${d.description} (roles: ${(d.roles_involved || []).join(', ')})`)
    .join('\n');
}

function renderCrossCompare(crossCompare) {
  if (!crossCompare || !crossCompare.length) return '_No cross-comparison performed._';
  return crossCompare
    .map(
      (c) =>
        `### ${c.topic} — ${c.verdict}\n\n- **Project's claim:** ${c.project_claim}\n- **Independent finding:** ${c.independent_finding}\n- **Discrepancy:** ${c.discrepancy}`
    )
    .join('\n\n');
}

function buildReport(templateText, data) {
  const replacements = {
    '{{PROJECT_NAME}}': data.projectName || 'Unnamed project',
    '{{REVIEW_DATE}}': data.reviewDate || '',
    '{{THESIS}}': data.thesis || '',
    '{{SCOPE}}': data.scope || '',
    '{{FINDINGS}}': renderFindings(data.eda),
    '{{DISAGREEMENTS}}': renderDisagreements(data.disagreements),
    '{{CROSS_COMPARE}}': renderCrossCompare(data.crossCompare),
    '{{VERDICT_ACCURACY}}': data.verdictAccuracy || '',
    '{{VERDICT_COHESIVENESS}}': data.verdictCohesiveness || '',
    '{{VERDICT_RATIONALE}}': data.verdictRationale || '',
    '{{RECOMMENDATIONS}}': data.recommendations || '_None._',
  };
  let out = templateText;
  for (const [token, value] of Object.entries(replacements)) {
    out = out.split(token).join(value);
  }
  return out;
}

module.exports = { buildReport, renderFindings, renderDisagreements, renderCrossCompare };

if (require.main === module) {
  const fs = require('fs');
  const [, , templatePath, dataPath] = process.argv;
  if (!templatePath || !dataPath) {
    console.error('Usage: node report-builder.js <template.md> <data.json>');
    process.exit(1);
  }
  const templateText = fs.readFileSync(templatePath, 'utf8');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  process.stdout.write(buildReport(templateText, data));
}
