'use strict';
const fs = require('fs');
const path = require('path');

const PLUGIN_JSON = path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json');

function pluginVersion() {
  try {
    return JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Two-state tag for entries that carry only `verified`; no tag when the flag is absent.
function verifiedTag(verified) {
  if (verified === true) return ' (verified)';
  if (verified === false) return ' (unverified)';
  return '';
}

function impactLine(value) {
  return `- **Decision affected / materiality:** ${value || 'none identified'}`;
}

// An array field renders as bullets instead of a comma-joined line.
function bullets(value) {
  return Array.isArray(value) ? value.map((v) => `- ${v}`).join('\n') : value;
}

function renderExecutiveSummary(value) {
  const summary = typeof value === 'string' ? value.split('\n').map((s) => s.trim()).filter(Boolean) : value;
  if (!Array.isArray(summary) || !summary.length) return '_No executive summary provided._';
  return summary.map((s) => `- ${s}`).join('\n');
}

function renderFindings(eda) {
  if (!eda || !eda.length) return '_No independent findings recorded._';
  return eda
    .map((role) => {
      const lines = (role.findings || [])
        .map((f) => {
          const tag = f.verified
            ? ' (verified — recomputed)'
            : f.required_execution
              ? ' ⚠ unverified — inferred, not executed'
              : ' (static review)';
          const impact = f.business_impact ? `\n  ${impactLine(f.business_impact)}` : '';
          return `- **[${f.severity}]** ${f.claim}\n  - Evidence: ${f.evidence}${tag}${impact}`;
        })
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

function renderOverCap(overCap) {
  if (!overCap || !overCap.length) return '';
  const lines = overCap.map((o) => {
    const sev = o.severity ? `**[${o.severity}]** ` : '';
    const evidence = o.evidence ? `\n  - Evidence: ${o.evidence}` : '';
    return `- ${sev}**${o.topic}**: ${o.finding}${verifiedTag(o.verified)}${evidence}`;
  });
  return `\n\n**Over the topic cap, not taken further:**\n\n${lines.join('\n')}`;
}

// Discover's so-what results, in the order given (the workflow sorts them by materiality).
function renderCandidates(candidates) {
  if (!candidates || !candidates.length) return '_No candidate patterns found._';
  return candidates
    .map((c, i) => {
      const lines = [
        `- **Finding:** ${c.finding}`,
        `- **Evidence:** ${c.evidence}`,
        impactLine(c.business_impact),
        `- **Why this rating:** ${c.rationale}`,
        `- **To settle:** ${c.to_settle}`,
      ];
      return `### ${i + 1}. ${c.candidate_topic} — materiality ${c.materiality}, ${c.claim_level}${verifiedTag(c.verified)}\n\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

// The project addresses a topic unless the auditor returned `Not Addressed`; those render in
// their own section so each topic appears once.
function renderCrossCompare(crossCompare) {
  const addressed = (crossCompare || []).filter((c) => c.verdict !== 'Not Addressed');
  if (!addressed.length) return '_No topic the project addresses was cross-compared._';
  return addressed
    .map((c) => {
      const lines = [
        `- **Project's claim:** ${c.project_claim}`,
        `- **Independent finding:** ${c.independent_finding}`,
        `- **Discrepancy:** ${c.discrepancy}`,
        impactLine(c.business_impact),
      ];
      if (c.to_settle) lines.push(`- **To settle:** ${c.to_settle}`);
      return `### ${c.reconciled_topic || c.topic} — ${c.verdict || '(no verdict)'}\n\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

function renderUnaddressed(crossCompare) {
  const unaddressed = (crossCompare || []).filter((c) => c.verdict === 'Not Addressed');
  if (!unaddressed.length) return '_No independent finding went unaddressed by the project._';
  return unaddressed
    .map((c) => {
      const lines = [`- **Independent finding:** ${c.independent_finding}`];
      if (c.evidence) lines.push(`- **Evidence:** ${c.evidence}`);
      lines.push(impactLine(c.business_impact));
      return `### ${c.reconciled_topic || c.topic}${verifiedTag(c.verified)}\n\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

function buildReport(templateText, data) {
  const replacements = {
    '{{PROJECT_NAME}}': data.projectName || 'Unnamed project',
    '{{REVIEW_DATE}}': data.reviewDate || '',
    '{{PLUGIN_VERSION}}': pluginVersion(),
    '{{EXECUTIVE_SUMMARY}}': renderExecutiveSummary(data.executiveSummary),
    '{{THESIS}}': data.thesis || '',
    '{{SCOPE}}': bullets(data.scope) || '',
    '{{FINDINGS}}': renderFindings(data.eda),
    '{{DISAGREEMENTS}}': renderDisagreements(data.disagreements) + renderOverCap(data.overCap),
    '{{CROSS_COMPARE}}': renderCrossCompare(data.crossCompare),
    '{{UNADDRESSED}}': renderUnaddressed(data.crossCompare),
    '{{CANDIDATES}}': renderCandidates(data.candidates),
    '{{VERDICT_ACCURACY}}': data.verdictAccuracy || '',
    '{{VERDICT_COHESIVENESS}}': data.verdictCohesiveness || '',
    '{{VERDICT_RATIONALE}}': data.verdictRationale || '',
    '{{RECOMMENDATIONS}}': bullets(data.recommendations) || '_None._',
  };
  // One pass: substituted values are never rescanned, so a token inside reviewed text stays literal.
  return templateText.replace(/\{\{[^{}]+\}\}/g, (token) => replacements[token] ?? token);
}

module.exports = { buildReport, renderFindings, renderDisagreements, renderCrossCompare, renderUnaddressed, renderOverCap, renderCandidates };

if (require.main === module) {
  const [, , templatePath, dataPath] = process.argv;
  if (!templatePath || !dataPath) {
    console.error('Usage: node report-builder.js <template.md> <data.json>');
    process.exit(1);
  }
  const templateText = fs.readFileSync(templatePath, 'utf8');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  process.stdout.write(buildReport(templateText, data));
}
