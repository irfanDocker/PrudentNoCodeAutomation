import { Router } from "express";
import { z } from "zod";
import { runOptionsSchema, suiteRunRequestSchema } from "@prudent/shared";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { runSuite, runTestCaseById } from "../services/execution/runOrchestrator.js";

const router = Router();

router.post(
  "/run-suite",
  asyncHandler(async (request, response) => {
    const body = suiteRunRequestSchema.parse(request.body);
    const result = await runSuite(body);
    response.status(result.failed > 0 ? 422 : 200).json({
      data: result,
      exitCode: result.failed > 0 ? 1 : 0
    });
  })
);

router.post(
  "/run-test",
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        testCaseId: z.string(),
        options: runOptionsSchema.partial().default({})
      })
      .parse(request.body);

    const result = await runTestCaseById(body.testCaseId, body.options);
    response.status(result.status === "PASSED" ? 200 : 422).json({
      data: result,
      exitCode: result.status === "PASSED" ? 0 : 1
    });
  })
);

export { router as ciRoutes };

