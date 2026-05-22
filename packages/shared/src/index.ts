import { z } from "zod";

export const actionTypes = [
  "goto",
  "click",
  "type",
  "select",
  "verify_text",
  "wait",
  "upload_file",
  "download_file",
  "screenshot"
] as const;

export const locatorTypes = ["css", "xpath", "text", "role", "label", "placeholder"] as const;

export const suiteTypes = ["SMOKE", "REGRESSION", "RELEASE", "SPRINT", "CUSTOM"] as const;

export const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const testStatuses = ["DRAFT", "READY", "ARCHIVED"] as const;

export const browserTypes = ["chromium", "chrome", "firefox", "webkit"] as const;

export const runStatuses = ["QUEUED", "RUNNING", "PASSED", "FAILED", "SKIPPED", "CANCELLED"] as const;

export const roles = ["ADMIN", "QA_MANAGER", "TESTER", "VIEWER"] as const;

export type StepActionType = (typeof actionTypes)[number];
export type LocatorType = (typeof locatorTypes)[number];
export type SuiteType = (typeof suiteTypes)[number];
export type Priority = (typeof priorities)[number];
export type TestStatus = (typeof testStatuses)[number];
export type BrowserType = (typeof browserTypes)[number];
export type RunStatus = (typeof runStatuses)[number];
export type Role = (typeof roles)[number];

export const testStepSchema = z.object({
  id: z.string().optional(),
  stepNumber: z.coerce.number().int().positive(),
  actionType: z.enum(actionTypes),
  locatorType: z.enum(locatorTypes).nullable().optional(),
  locatorValue: z.string().trim().nullable().optional(),
  inputValue: z.string().nullable().optional(),
  expectedResult: z.string().nullable().optional(),
  waitMs: z.coerce.number().int().nonnegative().nullable().optional(),
  timeoutMs: z.coerce.number().int().positive().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional()
});

export const testCaseSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(2).max(255),
  description: z.string().nullable().optional(),
  groupType: z.enum(suiteTypes).default("CUSTOM"),
  priority: z.enum(priorities).default("MEDIUM"),
  status: z.enum(testStatuses).default("DRAFT"),
  tags: z.array(z.string().trim().min(1)).default([]),
  steps: z.array(testStepSchema).min(1)
});

export const runOptionsSchema = z.object({
  browser: z.enum(browserTypes).default("chromium"),
  headless: z.coerce.boolean().default(true),
  environment: z.string().trim().default("qa"),
  baseUrl: z.string().url().optional().or(z.literal("")),
  trace: z.coerce.boolean().default(true),
  video: z.coerce.boolean().default(true),
  screenshots: z.coerce.boolean().default(true),
  timeoutMs: z.coerce.number().int().positive().default(10000)
});

export const suiteRunRequestSchema = runOptionsSchema.extend({
  suite: z.string().min(1).optional(),
  suiteId: z.string().min(1).optional(),
  projectKey: z.string().min(1).optional(),
  tags: z.array(z.string()).optional()
});

export type TestStepInput = z.infer<typeof testStepSchema>;
export type TestCaseInput = z.infer<typeof testCaseSchema>;
export type RunOptions = z.infer<typeof runOptionsSchema>;
export type SuiteRunRequest = z.infer<typeof suiteRunRequestSchema>;

export interface DashboardSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  latestRuns: Array<{
    id: string;
    title: string;
    status: RunStatus;
    browser: BrowserType;
    environment: string;
    startedAt: string | null;
    durationMs: number | null;
  }>;
  failureTrend: Array<{ date: string; failed: number; passed: number }>;
  suiteResults: Array<{ suite: string; passed: number; failed: number; skipped: number }>;
  environmentResults: Array<{ environment: string; passed: number; failed: number; skipped: number }>;
}

export function normalizeTags(value: string | string[] | null | undefined): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

