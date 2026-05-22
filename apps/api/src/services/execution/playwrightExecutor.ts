import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "fs-extra";
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from "playwright";
import type { BrowserType, RunOptions, RunStatus, TestStepInput } from "@prudent/shared";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { writeHtmlReport } from "../reporting/htmlReport.js";
import { createExecutionState, executeStepAction } from "./actionUtilities.js";

interface TestCaseForExecution {
  id: string;
  title: string;
  projectId: string;
  project?: {
    baseUrl?: string | null;
  } | null;
  steps: TestStepInput[];
}

interface ExecutionResult {
  runId: string;
  status: RunStatus;
  passed: number;
  failed: number;
  skipped: number;
  reportPath?: string;
}

function nowMs() {
  return Date.now();
}

function durationFrom(startedAt: number) {
  return Date.now() - startedAt;
}

async function launchBrowser(browserType: BrowserType, headless: boolean): Promise<Browser> {
  if (browserType === "firefox") {
    return firefox.launch({ headless });
  }

  if (browserType === "webkit") {
    return webkit.launch({ headless });
  }

  if (browserType === "chrome") {
    return chromium.launch({ channel: "chrome", headless });
  }

  return chromium.launch({ headless });
}

async function log(runId: string, message: string, level: "debug" | "info" | "warn" | "error" = "info", stepResultId?: string) {
  await prisma.log.create({
    data: {
      testRunId: runId,
      stepResultId,
      level,
      message
    }
  });
}

async function attachScreenshot(runId: string, stepResultId: string, page: Page, runDir: string, stepNumber: number, status: "passed" | "failed") {
  const screenshotsDir = path.join(runDir, "screenshots");
  await fs.ensureDir(screenshotsDir);

  const screenshotPath = path.join(screenshotsDir, `step-${String(stepNumber).padStart(3, "0")}-${status}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await prisma.attachment.create({
    data: {
      testRunId: runId,
      stepResultId,
      type: "SCREENSHOT",
      fileName: path.basename(screenshotPath),
      filePath: screenshotPath,
      mimeType: "image/png"
    }
  });

  return screenshotPath;
}

export async function executeTestCaseRun(
  runId: string,
  testCase: TestCaseForExecution,
  options: RunOptions
): Promise<ExecutionResult> {
  const runStartedAt = nowMs();
  const runDir = path.resolve(env.ARTIFACT_DIR, "runs", runId);
  await fs.ensureDir(runDir);

  const baseUrl = options.baseUrl || testCase.project?.baseUrl || "";
  const resolvedOptions = { ...options, baseUrl };

  await prisma.testRun.update({
    where: { id: runId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      browser: resolvedOptions.browser,
      headless: resolvedOptions.headless,
      environment: resolvedOptions.environment,
      baseUrl
    }
  });
  await log(runId, `Starting ${testCase.title} on ${resolvedOptions.browser}`);

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let finalStatus: RunStatus = "PASSED";
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  try {
    browser = await launchBrowser(resolvedOptions.browser, resolvedOptions.headless);
    context = await browser.newContext({
      recordVideo: resolvedOptions.video ? { dir: path.join(runDir, "videos") } : undefined,
      acceptDownloads: true
    });

    if (resolvedOptions.trace) {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    }

    const page = await context.newPage();
    const actionState = createExecutionState();

    for (const step of testCase.steps.sort((a, b) => a.stepNumber - b.stepNumber)) {
      const stepStartedAt = nowMs();
      const stepResult = await prisma.testStepResult.create({
        data: {
          testRunId: runId,
          testStepId: step.id,
          stepNumber: step.stepNumber,
          status: "RUNNING",
          actionType: step.actionType,
          locatorType: step.locatorType,
          locatorValue: step.locatorValue,
          startedAt: new Date()
        }
      });

      try {
        await log(runId, `Step ${step.stepNumber}: ${step.actionType}`, "info", stepResult.id);
        const message = await executeStepAction(page, actionState, step, runDir, resolvedOptions);
        const screenshotPath = resolvedOptions.screenshots
          ? await attachScreenshot(runId, stepResult.id, page, runDir, step.stepNumber, "passed").catch(async (error) => {
              await log(
                runId,
                `Step ${step.stepNumber} passed but screenshot capture failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                "warn",
                stepResult.id
              );
              return undefined;
            })
          : undefined;

        await prisma.testStepResult.update({
          where: { id: stepResult.id },
          data: {
            status: "PASSED",
            message,
            screenshotPath,
            durationMs: durationFrom(stepStartedAt),
            endedAt: new Date()
          }
        });
        passed += 1;
      } catch (error) {
        failed += 1;
        finalStatus = "FAILED";
        const message = error instanceof Error ? error.message : "Unknown Playwright error";
        const screenshotPath = resolvedOptions.screenshots
          ? await attachScreenshot(runId, stepResult.id, page, runDir, step.stepNumber, "failed").catch(async (screenshotError) => {
              await log(
                runId,
                `Step ${step.stepNumber} failed and screenshot capture also failed: ${
                  screenshotError instanceof Error ? screenshotError.message : "Unknown error"
                }`,
                "warn",
                stepResult.id
              );
              return undefined;
            })
          : undefined;

        await prisma.testStepResult.update({
          where: { id: stepResult.id },
          data: {
            status: "FAILED",
            error: message,
            screenshotPath,
            durationMs: durationFrom(stepStartedAt),
            endedAt: new Date()
          }
        });

        await log(runId, message, "error", stepResult.id);
        skipped = testCase.steps.length - passed - failed;
        break;
      }
    }

    if (resolvedOptions.trace && context) {
      const tracePath = path.join(runDir, "trace.zip");
      await context.tracing.stop({ path: tracePath });
      await prisma.attachment.create({
        data: {
          testRunId: runId,
          type: "TRACE",
          fileName: "trace.zip",
          filePath: tracePath,
          mimeType: "application/zip"
        }
      });
    }

    await context.close();

    if (resolvedOptions.video) {
      const videoDir = path.join(runDir, "videos");
      if (await fs.pathExists(videoDir)) {
        const videoFiles = (await fs.readdir(videoDir)).filter((fileName) => fileName.endsWith(".webm"));
        for (const fileName of videoFiles) {
          await prisma.attachment.create({
            data: {
              testRunId: runId,
              type: "VIDEO",
              fileName,
              filePath: path.join(videoDir, fileName),
              mimeType: "video/webm"
            }
          });
        }
      }
    }

    const stepResults = await prisma.testStepResult.findMany({
      where: { testRunId: runId },
      orderBy: { stepNumber: "asc" }
    });
    const endedAt = new Date();
    const reportPath = await writeHtmlReport(runDir, {
      runId,
      title: testCase.title,
      status: finalStatus,
      browser: resolvedOptions.browser,
      environment: resolvedOptions.environment,
      startedAt: new Date(runStartedAt),
      endedAt,
      steps: stepResults.map((step) => ({
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        status: step.status,
        message: step.message,
        error: step.error,
        durationMs: step.durationMs,
        screenshotPath: step.screenshotPath
      }))
    });

    await prisma.attachment.create({
      data: {
        testRunId: runId,
        type: "HTML_REPORT",
        fileName: "index.html",
        filePath: reportPath,
        mimeType: "text/html"
      }
    });

    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        endedAt,
        durationMs: durationFrom(runStartedAt),
        summary: { passed, failed, skipped, reportUrl: pathToFileURL(reportPath).toString() }
      }
    });

    return { runId, status: finalStatus, passed, failed, skipped, reportPath };
  } catch (error) {
    finalStatus = "FAILED";
    const message = error instanceof Error ? error.message : "Unexpected runner error";
    await log(runId, message, "error");
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        endedAt: new Date(),
        durationMs: durationFrom(runStartedAt),
        summary: { passed, failed, skipped, error: message }
      }
    });
    return { runId, status: finalStatus, passed, failed, skipped };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
