import type { RunOptions, SuiteRunRequest, TestStepInput } from "@prudent/shared";
import { runOptionsSchema } from "@prudent/shared";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { executeTestCaseRun } from "./playwrightExecutor.js";

function mapStep(step: {
  id: string;
  stepNumber: number;
  actionType: string;
  locatorType: string | null;
  locatorValue: string | null;
  inputValue: string | null;
  expectedResult: string | null;
  waitMs: number | null;
  timeoutMs: number | null;
  metadata: unknown;
}): TestStepInput {
  return {
    id: step.id,
    stepNumber: step.stepNumber,
    actionType: step.actionType as TestStepInput["actionType"],
    locatorType: step.locatorType as TestStepInput["locatorType"],
    locatorValue: step.locatorValue,
    inputValue: step.inputValue,
    expectedResult: step.expectedResult,
    waitMs: step.waitMs,
    timeoutMs: step.timeoutMs,
    metadata: typeof step.metadata === "object" && step.metadata !== null ? (step.metadata as Record<string, unknown>) : undefined
  };
}

function hasAllTags(testTags: unknown, requestedTags?: string[]) {
  if (!requestedTags?.length) {
    return true;
  }

  if (!Array.isArray(testTags)) {
    return false;
  }

  return requestedTags.every((tag) => testTags.includes(tag));
}

export async function runTestCaseById(testCaseId: string, optionsInput: Partial<RunOptions>, triggeredById?: string) {
  const options = runOptionsSchema.parse(optionsInput);
  const testCase = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    include: {
      project: true,
      steps: { orderBy: { stepNumber: "asc" } }
    }
  });

  if (!testCase) {
    throw new ApiError(404, "Test case not found");
  }

  const run = await prisma.testRun.create({
    data: {
      projectId: testCase.projectId,
      testCaseId: testCase.id,
      status: "QUEUED",
      browser: options.browser,
      headless: options.headless,
      environment: options.environment,
      baseUrl: options.baseUrl || testCase.project.baseUrl,
      triggeredById
    }
  });

  return executeTestCaseRun(
    run.id,
    {
      id: testCase.id,
      title: testCase.title,
      projectId: testCase.projectId,
      project: { baseUrl: testCase.project.baseUrl },
      steps: testCase.steps.map(mapStep)
    },
    options
  );
}

export async function runTestCaseSteps(
  testCaseId: string,
  stepIds: string[],
  optionsInput: Partial<RunOptions>,
  triggeredById?: string
) {
  const options = runOptionsSchema.parse(optionsInput);
  const testCase = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    include: {
      project: true,
      steps: { orderBy: { stepNumber: "asc" } }
    }
  });

  if (!testCase) {
    throw new ApiError(404, "Test case not found");
  }

  const selectedSteps = testCase.steps.filter((step) => stepIds.includes(step.id));
  if (!selectedSteps.length) {
    throw new ApiError(400, "No failed steps found to rerun");
  }

  const run = await prisma.testRun.create({
    data: {
      projectId: testCase.projectId,
      testCaseId: testCase.id,
      status: "QUEUED",
      browser: options.browser,
      headless: options.headless,
      environment: options.environment,
      baseUrl: options.baseUrl || testCase.project.baseUrl,
      triggeredById,
      summary: { rerunScope: "failed_steps", sourceStepIds: stepIds }
    }
  });

  return executeTestCaseRun(
    run.id,
    {
      id: testCase.id,
      title: `${testCase.title} - failed steps rerun`,
      projectId: testCase.projectId,
      project: { baseUrl: testCase.project.baseUrl },
      steps: selectedSteps.map(mapStep)
    },
    options
  );
}

export async function runSuite(request: Partial<SuiteRunRequest>, triggeredById?: string) {
  if (!request.suiteId && !request.suite) {
    throw new ApiError(400, "suiteId or suite name is required");
  }

  const options = runOptionsSchema.parse(request);
  const suite = await prisma.testSuite.findFirst({
    where: {
      id: request.suiteId,
      name: request.suite,
      project: request.projectKey ? { projectKey: request.projectKey } : undefined
    },
    include: {
      project: true,
      testCases: {
        orderBy: { sortOrder: "asc" },
        include: {
          testCase: {
            include: {
              project: true,
              steps: { orderBy: { stepNumber: "asc" } }
            }
          }
        }
      }
    }
  });

  if (!suite) {
    throw new ApiError(404, "Test suite not found");
  }

  const selectedCases = suite.testCases
    .map((mapping) => mapping.testCase)
    .filter((testCase) => hasAllTags(testCase.tags, request.tags));

  const results = [];

  for (const testCase of selectedCases) {
    const run = await prisma.testRun.create({
      data: {
        projectId: testCase.projectId,
        testSuiteId: suite.id,
        testCaseId: testCase.id,
        status: "QUEUED",
        browser: options.browser,
        headless: options.headless,
        environment: options.environment,
        baseUrl: options.baseUrl || testCase.project.baseUrl,
        triggeredById
      }
    });

    const result = await executeTestCaseRun(
      run.id,
      {
        id: testCase.id,
        title: testCase.title,
        projectId: testCase.projectId,
        project: { baseUrl: testCase.project.baseUrl },
        steps: testCase.steps.map(mapStep)
      },
      options
    );
    results.push(result);
  }

  return {
    suiteId: suite.id,
    suiteName: suite.name,
    total: results.length,
    passed: results.filter((result) => result.status === "PASSED").length,
    failed: results.filter((result) => result.status === "FAILED").length,
    results
  };
}
