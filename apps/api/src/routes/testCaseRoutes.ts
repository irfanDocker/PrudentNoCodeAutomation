import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { normalizeTags, runOptionsSchema, testCaseSchema } from "@prudent/shared";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { runTestCaseById } from "../services/execution/runOrchestrator.js";

const router = Router();

const querySchema = z.object({
  projectId: z.string().optional(),
  search: z.string().optional(),
  groupType: z.string().optional()
});

function mapSteps(steps: z.infer<typeof testCaseSchema>["steps"]) {
  return steps.map((step) => ({
    stepNumber: step.stepNumber,
    actionType: step.actionType,
    locatorType: step.locatorType ?? null,
    locatorValue: step.locatorValue ?? null,
    inputValue: step.inputValue ?? null,
    expectedResult: step.expectedResult ?? null,
    waitMs: step.waitMs ?? null,
    timeoutMs: step.timeoutMs ?? null,
    metadata: step.metadata as Prisma.InputJsonValue | undefined
  }));
}

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const query = querySchema.parse(request.query);
    const tests = await prisma.testCase.findMany({
      where: {
        projectId: query.projectId,
        groupType: query.groupType as never,
        OR: query.search
          ? [
              { title: { contains: query.search } },
              { description: { contains: query.search } }
            ]
          : undefined
      },
      include: {
        project: true,
        steps: { orderBy: { stepNumber: "asc" } },
        suiteLinks: { include: { testSuite: true } },
        _count: { select: { runs: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
    response.json({ data: tests });
  })
);

router.post(
  "/",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const body = testCaseSchema.parse({
      ...request.body,
      tags: normalizeTags(request.body.tags)
    });

    const testCase = await prisma.testCase.create({
      data: {
        projectId: body.projectId,
        title: body.title,
        description: body.description,
        groupType: body.groupType,
        priority: body.priority,
        status: body.status,
        tags: body.tags,
        createdById: request.user?.id,
        updatedById: request.user?.id,
        steps: {
          create: mapSteps(body.steps)
        }
      },
      include: {
        steps: { orderBy: { stepNumber: "asc" } }
      }
    });

    response.status(201).json({ data: testCase });
  })
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const testCase = await prisma.testCase.findUnique({
      where: { id: request.params.id },
      include: {
        project: true,
        steps: { orderBy: { stepNumber: "asc" } },
        suiteLinks: { include: { testSuite: true } },
        runs: { orderBy: { createdAt: "desc" }, take: 10 }
      }
    });

    if (!testCase) {
      throw new ApiError(404, "Test case not found");
    }

    response.json({ data: testCase });
  })
);

router.put(
  "/:id",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const body = testCaseSchema.parse({
      ...request.body,
      tags: normalizeTags(request.body.tags)
    });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.testStep.deleteMany({ where: { testCaseId: request.params.id } });
      return tx.testCase.update({
        where: { id: request.params.id },
        data: {
          projectId: body.projectId,
          title: body.title,
          description: body.description,
          groupType: body.groupType,
          priority: body.priority,
          status: body.status,
          tags: body.tags,
          updatedById: request.user?.id,
          steps: { create: mapSteps(body.steps) }
        },
        include: {
          steps: { orderBy: { stepNumber: "asc" } }
        }
      });
    });

    response.json({ data: updated });
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN", "QA_MANAGER"),
  asyncHandler(async (request, response) => {
    await prisma.testCase.delete({ where: { id: request.params.id } });
    response.status(204).send();
  })
);

router.post(
  "/:id/duplicate",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const original = await prisma.testCase.findUnique({
      where: { id: request.params.id },
      include: { steps: { orderBy: { stepNumber: "asc" } } }
    });

    if (!original) {
      throw new ApiError(404, "Test case not found");
    }

    const duplicate = await prisma.testCase.create({
      data: {
        projectId: original.projectId,
        title: `${original.title} Copy`,
        description: original.description,
        groupType: original.groupType,
        priority: original.priority,
        status: "DRAFT",
        tags: original.tags ?? undefined,
        createdById: request.user?.id,
        updatedById: request.user?.id,
        steps: {
          create: original.steps.map((step) => ({
            stepNumber: step.stepNumber,
            actionType: step.actionType,
            locatorType: step.locatorType,
            locatorValue: step.locatorValue,
            inputValue: step.inputValue,
            expectedResult: step.expectedResult,
            waitMs: step.waitMs,
            timeoutMs: step.timeoutMs,
            metadata: step.metadata as Prisma.InputJsonValue | undefined
          }))
        }
      },
      include: { steps: true }
    });

    response.status(201).json({ data: duplicate });
  })
);

router.post(
  "/:id/run",
  requireRole("ADMIN", "QA_MANAGER", "TESTER"),
  asyncHandler(async (request, response) => {
    const options = runOptionsSchema.partial().parse(request.body);
    const result = await runTestCaseById(request.params.id, options, request.user?.id);
    response.status(result.status === "PASSED" ? 200 : 422).json({ data: result });
  })
);

export { router as testCaseRoutes };
