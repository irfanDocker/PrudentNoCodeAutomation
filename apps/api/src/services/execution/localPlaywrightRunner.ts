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

function resolveTokens(value: string | null | undefined, variables: Record<string, string>) {
  if (!value) return value;
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
}

function resolveStepTokens(step: TestStepInput, variables: Record<string, string>): TestStepInput {
  return {
    ...step,
    locatorValue: resolveTokens(step.locatorValue, variables),
    inputValue: resolveTokens(step.inputValue, variables),
    expectedResult: resolveTokens(step.expectedResult, variables)
  };
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function conditionPassed(step: TestStepInput) {
  const actual = normalizeText(step.inputValue);
  const expected = normalizeText(step.expectedResult);
  const condition = normalizeText(step.locatorValue || "equals").toLowerCase().replaceAll("_", " ");

  if (["equals", "=", "==", "is"].includes(condition)) return actual === expected;
  if (["not equals", "!=", "!==", "is not"].includes(condition)) return actual !== expected;
  if (["contains", "includes"].includes(condition)) return actual.includes(expected);
  if (["not contains", "does not contain"].includes(condition)) return !actual.includes(expected);
  if (["empty", "is empty"].includes(condition)) return actual.length === 0;
  if (["not empty", "is not empty"].includes(condition)) return actual.length > 0;
  if (["true", "is true"].includes(condition)) return ["true", "yes", "1", "passed"].includes(actual.toLowerCase());
  if (["false", "is false"].includes(condition)) return ["false", "no", "0", "failed"].includes(actual.toLowerCase());

  return actual === expected;
}

function findMatchingBlockEnd(steps: TestStepInput[], startIndex: number, startAction: string, endAction: string) {
  let depth = 0;

  for (let index = startIndex; index < steps.length; index += 1) {
    if (steps[index].actionType === startAction) depth += 1;
    if (steps[index].actionType === endAction) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function findMatchingElseOrEndIf(steps: TestStepInput[], ifIndex: number) {
  let depth = 0;

  for (let index = ifIndex; index < steps.length; index += 1) {
    const actionType = steps[index].actionType;
    if (actionType === "if") depth += 1;
    if (actionType === "end_if") {
      depth -= 1;
      if (depth === 0) return { elseIndex: -1, endIndex: index };
    }
    if (actionType === "else" && depth === 1) {
      const endIndex = findMatchingBlockEnd(steps, ifIndex, "if", "end_if");
      return { elseIndex: index, endIndex };
    }
  }

  return { elseIndex: -1, endIndex: -1 };
}

function findMatchingSwitchEnd(steps: TestStepInput[], switchIndex: number) {
  return findMatchingBlockEnd(steps, switchIndex, "switch", "end_switch");
}

function findNextBlockBoundary(steps: TestStepInput[], startIndex: number, nestedStartAction: string, endAction: string) {
  let depth = 0;

  for (let index = startIndex + 1; index < steps.length; index += 1) {
    const actionType = steps[index].actionType;
    if (actionType === nestedStartAction) depth += 1;
    if (actionType === endAction) {
      if (depth === 0) return index;
      depth -= 1;
    }
  }

  return -1;
}

function findSwitchTarget(steps: TestStepInput[], switchIndex: number) {
  const switchValue = normalizeText(steps[switchIndex].inputValue);
  const endIndex = findMatchingSwitchEnd(steps, switchIndex);
  let defaultIndex = -1;

  if (endIndex === -1) return { targetIndex: -1, endIndex: -1 };

  for (let index = switchIndex + 1; index < endIndex; index += 1) {
    const actionType = steps[index].actionType;
    if (actionType === "switch") {
      const nestedEnd = findMatchingSwitchEnd(steps, index);
      index = nestedEnd === -1 ? endIndex : nestedEnd;
      continue;
    }
    if (actionType === "case" && normalizeText(steps[index].inputValue) === switchValue) {
      return { targetIndex: index, endIndex };
    }
    if (actionType === "default" && defaultIndex === -1) {
      defaultIndex = index;
    }
  }

  return { targetIndex: defaultIndex, endIndex };
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
    const orderedSteps = testCase.steps
      .map((step) => resolveStepTokens(step, options.variables))
      .sort((a, b) => a.stepNumber - b.stepNumber);
    const loopStack: Array<{ loopStartIndex: number; remainingRuns: number }> = [];

    for (let stepIndex = 0; stepIndex < orderedSteps.length; stepIndex += 1) {
      const step = orderedSteps[stepIndex];
      const stepStartedAt = Date.now();

      try {
        let message: string;
        let shouldCaptureScreenshot = false;

        if (step.actionType === "loop_start") {
          const requestedRuns = Math.max(0, Number(step.inputValue || 0));
          const loopEndIndex = findMatchingBlockEnd(orderedSteps, stepIndex, "loop_start", "loop_end");
          if (loopEndIndex === -1) throw new Error("Loop start requires a matching Loop end");

          if (requestedRuns === 0) {
            message = "Loop skipped because repeat count is 0";
            stepIndex = loopEndIndex;
          } else {
            loopStack.push({ loopStartIndex: stepIndex, remainingRuns: requestedRuns });
            message = `Loop started for ${requestedRuns} run${requestedRuns === 1 ? "" : "s"}`;
          }
        } else if (step.actionType === "loop_end") {
          const activeLoop = loopStack.at(-1);
          if (!activeLoop) throw new Error("Loop end requires a matching Loop start");

          activeLoop.remainingRuns -= 1;
          if (activeLoop.remainingRuns > 0) {
            message = `Loop repeating, ${activeLoop.remainingRuns} run${activeLoop.remainingRuns === 1 ? "" : "s"} left`;
            stepIndex = activeLoop.loopStartIndex;
          } else {
            loopStack.pop();
            message = "Loop completed";
          }
        } else if (step.actionType === "if") {
          const { elseIndex, endIndex } = findMatchingElseOrEndIf(orderedSteps, stepIndex);
          if (endIndex === -1) throw new Error("If requires a matching End if");

          if (conditionPassed(step)) {
            message = "If condition passed";
          } else {
            message = "If condition failed";
            stepIndex = elseIndex === -1 ? endIndex : elseIndex;
          }
        } else if (step.actionType === "else") {
          const endIndex = findNextBlockBoundary(orderedSteps, stepIndex, "if", "end_if");
          if (endIndex === -1) throw new Error("Else requires a matching End if");
          message = "Else skipped because If branch already ran";
          stepIndex = endIndex;
        } else if (step.actionType === "end_if") {
          message = "If block completed";
        } else if (step.actionType === "switch") {
          const { targetIndex, endIndex } = findSwitchTarget(orderedSteps, stepIndex);
          if (endIndex === -1) throw new Error("Switch requires a matching End switch");

          if (targetIndex === -1) {
            message = "Switch skipped because no Case matched and no Default was provided";
            stepIndex = endIndex;
          } else {
            message = `Switch matched ${orderedSteps[targetIndex].actionType === "default" ? "Default" : `Case ${orderedSteps[targetIndex].inputValue}`}`;
            stepIndex = targetIndex;
          }
        } else if (step.actionType === "case" || step.actionType === "default") {
          const endIndex = findNextBlockBoundary(orderedSteps, stepIndex, "switch", "end_switch");
          if (endIndex === -1) throw new Error(`${step.actionType === "case" ? "Case" : "Default"} requires a matching End switch`);
          message = `${step.actionType === "case" ? "Case" : "Default"} block completed`;
          stepIndex = endIndex;
        } else if (step.actionType === "end_switch") {
          message = "Switch block completed";
        } else {
          message = await executeStepAction(page, actionState, step, runDir, options);
          shouldCaptureScreenshot = true;
        }

        const screenshot = shouldCaptureScreenshot && options.screenshots
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
