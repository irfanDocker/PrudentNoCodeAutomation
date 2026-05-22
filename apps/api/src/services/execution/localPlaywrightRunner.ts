import path from "node:path";
import fs from "fs-extra";
import { chromium, firefox, webkit, type Browser, type Page } from "playwright";
import { nanoid } from "nanoid";
import type { BrowserType, RunOptions, RunStatus, TestStepInput } from "@prudent/shared";
import { runOptionsSchema } from "@prudent/shared";
import { env } from "../../config/env.js";
import { createExecutionState, executeStepAction } from "./actionUtilities.js";

interface LocalTestCase {
  title: string;
  baseUrl?: string | null;
  steps: TestStepInput[];
}

interface LocalStepResult {
  stepId?: string;
  stepNumber: number;
  actionType: string;
  locatorType?: string | null;
  locatorValue?: string | null;
  expectedResult?: string | null;
  status: RunStatus;
  durationMs: number;
  message: string;
  error?: string;
  screenshot?: string;
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

async function captureEvidence(page: Page, runId: string, runDir: string, stepNumber: number, status: "passed" | "failed") {
  const screenshotsDir = path.join(runDir, "screenshots");
  await fs.ensureDir(screenshotsDir);

  const fileName = `step-${String(stepNumber).padStart(3, "0")}-${status}.png`;
  const filePath = path.join(screenshotsDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });

  return `${env.PUBLIC_ARTIFACT_BASE_URL}/runs/${runId}/screenshots/${fileName}`;
}

export async function runLocalPlaywrightTest(testCase: LocalTestCase, optionsInput: Partial<RunOptions>) {
  const runId = `local-${nanoid(8)}`;
  const runStartedAt = Date.now();
  const runDir = path.resolve(env.ARTIFACT_DIR, "runs", runId);
  const options = runOptionsSchema.parse({
    ...optionsInput,
    baseUrl: optionsInput.baseUrl || testCase.baseUrl || ""
  });

  await fs.ensureDir(runDir);

  let browser: Browser | undefined;
  const stepResults: LocalStepResult[] = [];
  const videoUrls: string[] = [];
  let traceUrl: string | undefined;
  let status: RunStatus = "PASSED";

  try {
    browser = await launchBrowser(options.browser, options.headless);
    const context = await browser.newContext({
      acceptDownloads: true,
      recordVideo: options.video ? { dir: path.join(runDir, "videos") } : undefined
    });

    if (options.trace) {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    }

    const page = await context.newPage();
    const actionState = createExecutionState();
    const orderedSteps = [...testCase.steps].sort((a, b) => a.stepNumber - b.stepNumber);

    for (const step of orderedSteps) {
      const stepStartedAt = Date.now();

      try {
        const message = await executeStepAction(page, actionState, step, runDir, options);
        const screenshot = options.screenshots
          ? await captureEvidence(page, runId, runDir, step.stepNumber, "passed")
          : undefined;

        stepResults.push({
          stepId: step.id,
          stepNumber: step.stepNumber,
          actionType: step.actionType,
          locatorType: step.locatorType,
          locatorValue: step.locatorValue,
          expectedResult: step.expectedResult,
          status: "PASSED",
          durationMs: durationFrom(stepStartedAt),
          message,
          screenshot
        });
      } catch (error) {
        status = "FAILED";
        const message = error instanceof Error ? error.message : "Unknown Playwright error";
        const screenshot = options.screenshots
          ? await captureEvidence(page, runId, runDir, step.stepNumber, "failed").catch(() => undefined)
          : undefined;

        stepResults.push({
          stepId: step.id,
          stepNumber: step.stepNumber,
          actionType: step.actionType,
          locatorType: step.locatorType,
          locatorValue: step.locatorValue,
          expectedResult: step.expectedResult,
          status: "FAILED",
          durationMs: durationFrom(stepStartedAt),
          message: `Failed ${step.actionType}`,
          error: message,
          screenshot
        });

        for (const skippedStep of orderedSteps.filter((candidate) => candidate.stepNumber > step.stepNumber)) {
          stepResults.push({
            stepId: skippedStep.id,
            stepNumber: skippedStep.stepNumber,
            actionType: skippedStep.actionType,
            locatorType: skippedStep.locatorType,
            locatorValue: skippedStep.locatorValue,
            expectedResult: skippedStep.expectedResult,
            status: "SKIPPED",
            durationMs: 0,
            message: "Skipped because an earlier step failed"
          });
        }

        break;
      }
    }

    if (options.trace) {
      await context.tracing.stop({ path: path.join(runDir, "trace.zip") });
      traceUrl = `${env.PUBLIC_ARTIFACT_BASE_URL}/runs/${runId}/trace.zip`;
    }

    await context.close();

    if (options.video) {
      const videoDir = path.join(runDir, "videos");
      if (await fs.pathExists(videoDir)) {
        const videoFiles = (await fs.readdir(videoDir)).filter((fileName) => fileName.endsWith(".webm"));
        videoUrls.push(...videoFiles.map((fileName) => `${env.PUBLIC_ARTIFACT_BASE_URL}/runs/${runId}/videos/${fileName}`));
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
  }

  return {
    id: runId,
    status,
    durationMs: durationFrom(runStartedAt),
    browser: options.browser,
    environment: options.environment,
    startedAt: new Date(runStartedAt).toISOString(),
    artifactBaseUrl: `${env.PUBLIC_ARTIFACT_BASE_URL}/runs/${runId}`,
    video: videoUrls[0],
    videos: videoUrls,
    trace: traceUrl,
    stepResults
  };
}
