export type ActionType =
  | "goto"
  | "click"
  | "type"
  | "select"
  | "verify_text"
  | "wait"
  | "upload_file"
  | "download_file"
  | "screenshot";

export type LocatorType = "css" | "xpath" | "text" | "role" | "label" | "placeholder";
export type SuiteType = "SMOKE" | "REGRESSION" | "RELEASE" | "SPRINT" | "CUSTOM";
export type RunStatus = "QUEUED" | "RUNNING" | "PASSED" | "FAILED" | "SKIPPED" | "CANCELLED";

export interface TestStep {
  id: string;
  stepNumber: number;
  actionType: ActionType;
  locatorType: LocatorType | "";
  locatorValue: string;
  inputValue: string;
  expectedResult: string;
  waitMs: number | "";
  timeoutMs: number | "";
}

export interface TestCase {
  id: string;
  title: string;
  project: string;
  groupType: SuiteType;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "DRAFT" | "READY" | "ARCHIVED";
  tags: string[];
  updatedAt: string;
  steps: TestStep[];
}

export interface TestSuite {
  id: string;
  name: string;
  suiteType: SuiteType;
  testCaseIds: string[];
}

export interface RunRecord {
  id: string;
  testCaseId: string;
  testTitle: string;
  suiteName: string;
  status: RunStatus;
  browser: "chromium" | "chrome" | "firefox" | "webkit";
  environment: string;
  durationMs: number;
  startedAt: string;
  failedStepId?: string;
  error?: string;
  screenshot?: string;
  trace?: string;
  video?: string;
}

