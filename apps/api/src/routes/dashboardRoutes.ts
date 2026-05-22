import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

router.get(
  "/summary",
  asyncHandler(async (request, response) => {
    const query = z.object({ projectId: z.string().optional() }).parse(request.query);
    const where = { projectId: query.projectId };

    const [totalTests, runs, latestRuns, suites] = await Promise.all([
      prisma.testCase.count({ where }),
      prisma.testRun.findMany({
        where,
        include: { testCase: true, testSuite: true },
        orderBy: { createdAt: "desc" },
        take: 500
      }),
      prisma.testRun.findMany({
        where,
        include: { testCase: true },
        orderBy: { createdAt: "desc" },
        take: 10
      }),
      prisma.testSuite.findMany({
        where,
        include: {
          runs: true
        }
      })
    ]);

    const passedTests = runs.filter((run) => run.status === "PASSED").length;
    const failedTests = runs.filter((run) => run.status === "FAILED").length;
    const skippedTests = runs.filter((run) => run.status === "SKIPPED").length;

    const trendMap = new Map<string, { date: string; passed: number; failed: number }>();
    for (const run of runs) {
      const key = toDateKey(run.createdAt);
      const bucket = trendMap.get(key) ?? { date: key, passed: 0, failed: 0 };
      if (run.status === "PASSED") bucket.passed += 1;
      if (run.status === "FAILED") bucket.failed += 1;
      trendMap.set(key, bucket);
    }

    const environmentMap = new Map<string, { environment: string; passed: number; failed: number; skipped: number }>();
    for (const run of runs) {
      const bucket = environmentMap.get(run.environment) ?? {
        environment: run.environment,
        passed: 0,
        failed: 0,
        skipped: 0
      };
      if (run.status === "PASSED") bucket.passed += 1;
      if (run.status === "FAILED") bucket.failed += 1;
      if (run.status === "SKIPPED") bucket.skipped += 1;
      environmentMap.set(run.environment, bucket);
    }

    response.json({
      data: {
        totalTests,
        passedTests,
        failedTests,
        skippedTests,
        latestRuns: latestRuns.map((run) => ({
          id: run.id,
          title: run.testCase?.title ?? "Suite run",
          status: run.status,
          browser: run.browser,
          environment: run.environment,
          startedAt: run.startedAt?.toISOString() ?? null,
          durationMs: run.durationMs
        })),
        failureTrend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
        suiteResults: suites.map((suite) => ({
          suite: suite.name,
          passed: suite.runs.filter((run) => run.status === "PASSED").length,
          failed: suite.runs.filter((run) => run.status === "FAILED").length,
          skipped: suite.runs.filter((run) => run.status === "SKIPPED").length
        })),
        environmentResults: Array.from(environmentMap.values())
      }
    });
  })
);

export { router as dashboardRoutes };

