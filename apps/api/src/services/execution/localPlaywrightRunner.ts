import path from "node:path";
import fs from "fs-extra";
import { chromium, firefox, webkit, type Browser, type Locator, type Page } from "playwright";
import { nanoid } from "nanoid";
import type { BrowserType, RunOptions, RunStatus, TestStepInput } from "@prudent/shared";
import { runOptionsSchema } from "@prudent/shared";
import { env } from "../../config/env.js";
import { resolveLocator } from "./locatorFactory.js";

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

function normalizeBaseUrl(baseUrl: string | null | undefined) {
  if (!baseUrl) {
    return "";
  }

  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function resolveNavigationUrl(baseUrl: string | null | undefined, inputValue: string | null | undefined) {
  const target = inputValue?.trim();
  if (!target) {
    throw new Error("goto step requires input value with a URL or path");
  }

  if (/^https?:\/\//i.test(target)) {
    return target;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("Relative goto step requires a base URL");
  }

  return `${normalizedBaseUrl}${target.startsWith("/") ? target : `/${target}`}`;
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

async function expectText(page: Page, step: TestStepInput, locator: Locator | null, timeoutMs: number) {
  const expected = step.expectedResult || step.inputValue || step.locatorValue;

  if (!expected) {
    throw new Error(`Step ${step.stepNumber} verify_text requires expected result or input value`);
  }

  if (locator) {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    const text = (await locator.textContent({ timeout: timeoutMs })) ?? "";
    if (!text.includes(expected)) {
      throw new Error(`Expected locator text to include "${expected}", received "${text}"`);
    }
    return;
  }

  await page.getByText(expected, { exact: false }).waitFor({ state: "visible", timeout: timeoutMs });
}

async function runLocalStep(page: Page, step: TestStepInput, locator: Locator | null, runDir: string, options: RunOptions) {
  const timeoutMs = step.timeoutMs ?? options.timeoutMs ?? 10000;

  switch (step.actionType) {
    case "goto":
      await page.goto(resolveNavigationUrl(options.baseUrl, step.inputValue ?? step.locatorValue), {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs
      });
      return "Navigation completed";
    case "click":
      await locator?.click({ timeout: timeoutMs });
      return "Clicked element";
    case "type":
      await locator?.fill(step.inputValue ?? "", { timeout: timeoutMs });
      return "Text entered";
    case "select":
      await locator?.selectOption(step.inputValue ?? "", { timeout: timeoutMs });
      return "Option selected";
    case "verify_text":
      await expectText(page, step, locator, timeoutMs);
      return "Text verified";
    case "wait":
      await page.waitForTimeout(step.waitMs ?? Number(step.inputValue ?? 1000));
      return "Wait completed";
    case "upload_file":
      if (!step.inputValue) {
        throw new Error("upload_file requires input value with a file path");
      }
      await locator?.setInputFiles(step.inputValue, { timeout: timeoutMs });
      return "File uploaded";
    case "download_file": {
      const downloadDir = path.join(runDir, "downloads");
      await fs.ensureDir(downloadDir);
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: timeoutMs }),
        locator?.click({ timeout: timeoutMs })
      ]);
      const fileName = download.suggestedFilename();
      await download.saveAs(path.join(downloadDir, fileName));
      return `Downloaded ${fileName}`;
    }
    case "screenshot":
      return "Screenshot requested";
    default:
      throw new Error(`Unsupported action type: ${step.actionType}`);
  }
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
    const orderedSteps = [...testCase.steps].sort((a, b) => a.stepNumber - b.stepNumber);

    for (const step of orderedSteps) {
      const stepStartedAt = Date.now();

      try {
        const locator = resolveLocator(page, step);
        const message = await runLocalStep(page, step, locator, runDir, options);
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
    }

    await context.close();
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
    stepResults
  };
}

