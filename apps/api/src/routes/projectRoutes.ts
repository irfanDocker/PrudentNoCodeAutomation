import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";

const router = Router();

const projectSchema = z.object({
  name: z.string().trim().min(2),
  projectKey: z.string().trim().min(2).max(50).toUpperCase(),
  baseUrl: z.string().url().optional().or(z.literal("")),
  environments: z.record(z.string()).optional()
});

router.get(
  "/",
  asyncHandler(async (_request, response) => {
    const projects = await prisma.project.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { testCases: true, suites: true, runs: true }
        }
      }
    });
    response.json({ data: projects });
  })
);

router.post(
  "/",
  requireRole("ADMIN", "QA_MANAGER"),
  asyncHandler(async (request, response) => {
    const body = projectSchema.parse(request.body);
    const project = await prisma.project.create({
      data: {
        name: body.name,
        projectKey: body.projectKey,
        baseUrl: body.baseUrl || null,
        environments: body.environments ?? { qa: body.baseUrl || "", staging: "", production: "" }
      }
    });
    response.status(201).json({ data: project });
  })
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const project = await prisma.project.findUnique({
      where: { id: request.params.id },
      include: {
        testCases: true,
        suites: true
      }
    });

    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    response.json({ data: project });
  })
);

router.patch(
  "/:id",
  requireRole("ADMIN", "QA_MANAGER"),
  asyncHandler(async (request, response) => {
    const body = projectSchema.partial().parse(request.body);
    const project = await prisma.project.update({
      where: { id: request.params.id },
      data: {
        ...body,
        baseUrl: body.baseUrl === "" ? null : body.baseUrl
      }
    });
    response.json({ data: project });
  })
);

export { router as projectRoutes };

