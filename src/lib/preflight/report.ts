import type { PreflightReport, PreflightStatus } from "@/lib/preflight/model";

const STATUS_LABEL: Record<PreflightStatus, string> = {
  pass: "PASS",
  warning: "WARNING",
  blocked: "BLOCKED",
};

export function renderPreflightMarkdown(report: PreflightReport): string {
  const lines = [
    "# Quantify Terminal Account Portal — Staging Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    "",
    `- Passed: ${report.counts.pass}`,
    `- Warnings: ${report.counts.warning}`,
    `- Blocked: ${report.counts.blocked}`,
    `- Source contract ready: ${report.sourceReady ? "yes" : "no"}`,
    `- Staging evidence complete: ${report.stagingReady ? "yes" : "no"}`,
    `- Production approved: ${report.productionReady ? "yes" : "no"}`,
    "",
    "> The report records variable names and status only. It never records environment values, tokens, keys, or connection strings.",
    "",
  ];

  const categories = [...new Set(report.checks.map(({ category }) => category))];
  for (const category of categories) {
    lines.push(`## ${category[0]?.toUpperCase()}${category.slice(1)}`, "");
    for (const item of report.checks.filter((candidate) => candidate.category === category)) {
      lines.push(`- **${STATUS_LABEL[item.status]} — ${item.id}:** ${item.summary}`);
      for (const evidence of item.evidence) lines.push(`  - ${evidence}`);
    }
    lines.push("");
  }

  lines.push(
    "## Safety gate",
    "",
    "Production mutations remain prohibited until staging evidence is complete and an explicit production go/no-go is recorded.",
    "",
  );

  return lines.join("\n");
}
