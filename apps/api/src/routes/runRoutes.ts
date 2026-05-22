import { Router } from "express";
import { z } from "zod";
import { runOptionsSchema } from "@prudent/shared";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { runTestCaseById, runTestCaseSteps } from "../services/execution/runOrchestrator.js";

const router = Router();

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const query = z
      .object({
        projectId: z.string().optional(),
        status: z.string().optional(),
        environment: z.string().optional()
      })
      .parse(request.query);

    const runs = await prisma.testRun.findMany({
      where: {
        projectId: query.projectId,
        status: query.status as never,
        environment: query.environment
      },
      include: {
        testCase: true,
        testSuite: true,
        _count: { select: { stepResults: true, logs: true, attachments: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    response.json({ data: runs });
  })
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const run = await prisma.testRun.findUnique({
      where: { id: request.params.id },
      include: {
        project: true,
        testCase: true,
        testSuite: true,
        stepResults: { orderBy: { stepNumber: "asc" } },
        logs: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!run) {
      throw new ApiError(404, "Run not found");
    }

    response.json({ data: run });
  })
);

router.post(
  "/:id/rerun-failures",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        scope: z.enum(["test", "failed_steps"]).default("test"),
        options: runOptionsSchema.partial().default({})
      })
      .parse(request.body);

    const run = await prisma.testRun.findUnique({
      where: { id: request.params.id },
      include: {
        stepResults: { where: { status: "FAILED" } }
      }
    });

    if (!run?.testCaseId) {
      throw new ApiError(404, "Failed test run not found");
    }

    const result =
      body.scope === "failed_steps"
        ? await runTestCaseSteps(
            run.testCaseId,
            run.stepResults.flatMap((stepResult) => (stepResult.testStepId ? [stepResult.testStepId] : [])),
            body.options,
            request.user?.id
          )
        : await runTestCaseById(run.testCaseId, body.options, request.user?.id);

    response.status(result.status === "PASSED" ? 200 : 422).json({ data: result });
  })
);

router.get(
  "/:id/export.csv",
  asyncHandler(async (request, response) => {
    const run = await prisma.testRun.findUnique({
      where: { id: request.params.id },
      include: {
        testCase: true,
        stepResults: { orderBy: { stepNumber: "asc" } }
      }
    });

    if (!run) {
      throw new ApiError(404, "Run not found");
    }

    const header = ["run_id", "test_case", "step", "action", "status", "message", "error", "duration_ms", "screenshot_path"];
    const rows = run.stepResults.map((step) => [
      run.id,
      run.testCase?.title,
      step.stepNumber,
      step.actionType,
      step.status,
      step.message,
      step.error,
      step.durationMs,
      step.screenshotPath
    ]);

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    response.setHeader("Content-Type", "text/csv");
    response.setHeader("Content-Disposition", `attachment; filename="run-${run.id}.csv"`);
    response.send(csv);
  })
);

export { router as runRoutes };
