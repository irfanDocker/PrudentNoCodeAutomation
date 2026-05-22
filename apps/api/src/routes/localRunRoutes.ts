import { Router } from "express";
import { z } from "zod";
import { runOptionsSchema, testStepSchema } from "@prudent/shared";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { runLocalPlaywrightTest } from "../services/execution/localPlaywrightRunner.js";

const router = Router();

const localRunSchema = z.object({
  testCase: z.object({
    title: z.string().min(1),
    baseUrl: z.string().url().optional().or(z.literal("")),
    steps: z.array(testStepSchema).min(1)
  }),
  options: runOptionsSchema.partial().default({})
});

router.post(
  "/",
  asyncHandler(async (request, response) => {
    const body = localRunSchema.parse(request.body);
    const result = await runLocalPlaywrightTest(body.testCase, body.options);
    response.status(result.status === "PASSED" ? 200 : 422).json({ data: result });
  })
);

export { router as localRunRoutes };

