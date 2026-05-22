import path from "node:path";
import fs from "fs-extra";
import type { RunStatus } from "@prudent/shared";

interface ReportStep {
  stepNumber: number;
  actionType: string;
  status: RunStatus;
  message?: string | null;
  error?: string | null;
  durationMs?: number | null;
  screenshotPath?: string | null;
}

interface HtmlReportInput {
  runId: string;
  title: string;
  status: RunStatus;
  browser: string;
  environment: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  steps: ReportStep[];
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export async function writeHtmlReport(reportDir: string, input: HtmlReportInput) {
  await fs.ensureDir(reportDir);

  const rows = input.steps
    .map(
      (step) => `
        <tr class="${step.status.toLowerCase()}">
          <td>${step.stepNumber}</td>
          <td>${escapeHtml(step.actionType)}</td>
          <td>${escapeHtml(step.status)}</td>
          <td>${escapeHtml(step.durationMs ?? "")}</td>
          <td>${escapeHtml(step.message ?? step.error ?? "")}</td>
          <td>${step.screenshotPath ? `<a href="${escapeHtml(step.screenshotPath)}">Screenshot</a>` : ""}</td>
        </tr>`
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Prudent Run ${escapeHtml(input.runId)}</title>
    <style>
      body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #17202a; background: #f7f8fa; }
      main { max-width: 1120px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
      dt { color: #64748b; font-size: 12px; text-transform: uppercase; }
      dd { margin: 4px 0 0; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
      th { font-size: 12px; color: #475569; text-transform: uppercase; }
      .passed td:nth-child(3) { color: #047857; font-weight: 700; }
      .failed td:nth-child(3) { color: #b91c1c; font-weight: 700; }
      .skipped td:nth-child(3) { color: #a16207; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(input.title)}</h1>
      <p>Run ${escapeHtml(input.runId)}</p>
      <dl>
        <div><dt>Status</dt><dd>${escapeHtml(input.status)}</dd></div>
        <div><dt>Browser</dt><dd>${escapeHtml(input.browser)}</dd></div>
        <div><dt>Environment</dt><dd>${escapeHtml(input.environment)}</dd></div>
        <div><dt>Finished</dt><dd>${escapeHtml(input.endedAt?.toISOString() ?? "")}</dd></div>
      </dl>
      <table>
        <thead>
          <tr><th>#</th><th>Action</th><th>Status</th><th>ms</th><th>Message</th><th>Screenshot</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </main>
  </body>
</html>`;

  const filePath = path.join(reportDir, "index.html");
  await fs.writeFile(filePath, html, "utf8");
  return filePath;
}
