import { Router } from "express";
import { z } from "zod";
import { suiteRunRequestSchema } from "@prudent/shared";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { runSuite } from "../services/execution/runOrchestrator.js";

const router = Router();

const suiteSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(2),
  suiteType: z.enum(["SMOKE", "REGRESSION", "RELEASE", "SPRINT", "CUSTOM"]).default("CUSTOM"),
  description: z.string().nullable().optional(),
  testCaseIds: z.array(z.string()).default([])
});

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const projectId = z.string().optional().parse(request.query.projectId);
    const suites = await prisma.testSuite.findMany({
      where: { projectId },
      include: {
        project: true,
        testCases: { include: { testCase: true }, orderBy: { sortOrder: "asc" } },
        _count: { select: { runs: true } }
      },
      orderBy: { name: "asc" }
    });
    response.json({ data: suites });
  })
);

router.post(
  "/",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const body = suiteSchema.parse(request.body);
    const suite = await prisma.testSuite.create({
      data: {
        projectId: body.projectId,
        name: body.name,
        suiteType: body.suiteType,
        description: body.description,
        createdById: request.user?.id,
        testCases: {
          create: body.testCaseIds.map((testCaseId, index) => ({
            testCaseId,
            sortOrder: index + 1
          }))
        }
      },
      include: {
        testCases: { include: { testCase: true } }
      }
    });
    response.status(201).json({ data: suite });
  })
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const suite = await prisma.testSuite.findUnique({
      where: { id: request.params.id },
      include: {
        project: true,
        testCases: {
          orderBy: { sortOrder: "asc" },
          include: {
            testCase: {
              include: { steps: { orderBy: { stepNumber: "asc" } } }
            }
          }
        },
        runs: { orderBy: { createdAt: "desc" }, take: 10 }
      }
    });

    if (!suite) {
      throw new ApiError(404, "Test suite not found");
    }

    response.json({ data: suite });
  })
);

router.put(
  "/:id",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const body = suiteSchema.parse(request.body);
    const suite = await prisma.$transaction(async (tx) => {
      await tx.testSuiteMapping.deleteMany({ where: { testSuiteId: request.params.id } });
      return tx.testSuite.update({
        where: { id: request.params.id },
        data: {
          projectId: body.projectId,
          name: body.name,
          suiteType: body.suiteType,
          description: body.description,
          testCases: {
            create: body.testCaseIds.map((testCaseId, index) => ({
              testCaseId,
              sortOrder: index + 1
            }))
          }
        },
        include: {
          testCases: { include: { testCase: true } }
        }
      });
    });
    response.json({ data: suite });
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN", "QA_MANAGER"),
  asyncHandler(async (request, response) => {
    await prisma.testSuite.delete({ where: { id: request.params.id } });
    response.status(204).send();
  })
);

router.post(
  "/:id/test-cases",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const body = z.object({ testCaseId: z.string(), sortOrder: z.number().int().optional() }).parse(request.body);
    const mapping = await prisma.testSuiteMapping.create({
      data: {
        testSuiteId: request.params.id,
        testCaseId: body.testCaseId,
        sortOrder: body.sortOrder ?? 0
      }
    });
    response.status(201).json({ data: mapping });
  })
);

router.delete(
  "/:id/test-cases/:testCaseId",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    await prisma.testSuiteMapping.delete({
      where: {
        testSuiteId_testCaseId: {
          testSuiteId: request.params.id,
          testCaseId: request.params.testCaseId
        }
      }
    });
    response.status(204).send();
  })
);

router.post(
  "/:id/run",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const body = suiteRunRequestSchema.partial().parse({ ...request.body, suiteId: request.params.id });
    const result = await runSuite(body, request.user?.id);
    response.status(result.failed > 0 ? 422 : 200).json({ data: result });
  })
);

export { router as suiteRoutes };

