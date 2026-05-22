import type { RunRecord, TestCase, TestSuite } from "./types";

export const actionTypes = [
  "goto",
  "click",
  "type",
  "select",
  "verify_text",
  "wait",
  "upload_file",
  "download_file",
  "screenshot",
  "get_page_title",
  "is_disabled",
  "is_enabled",
  "string_contains",
  "select_by_value",
  "switch_to_frame",
  "database_connection",
  "api_call",
  "schema_validation",
  "json_validation"
] as const;

export const actionLabels: Record<(typeof actionTypes)[number], string> = {
  goto: "Go to URL",
  click: "Click",
  type: "Type",
  select: "Select option",
  verify_text: "Verify text",
  wait: "Wait",
  upload_file: "Upload file",
  download_file: "Download file",
  screenshot: "Screenshot",
  get_page_title: "Get Page Title",
  is_disabled: "isDisabled",
  is_enabled: "isEnabled",
  string_contains: "String contains",
  select_by_value: "Select by value",
  switch_to_frame: "Switch to frame",
  database_connection: "Database connection",
  api_call: "API call",
  schema_validation: "Schema validation",
  json_validation: "JSON validation"
};

export const locatorTypes = ["css", "xpath", "text", "role", "label", "placeholder"] as const;
export const suiteTypes = ["SMOKE", "REGRESSION", "RELEASE", "SPRINT", "CUSTOM"] as const;

export const initialTests: TestCase[] = [
  {
    id: "tc-login-001",
    title: "Valid user can sign in",
    project: "Prudent Portal",
    baseUrl: "https://example.com",
    groupType: "SMOKE",
    priority: "CRITICAL",
    status: "READY",
    tags: ["login", "smoke"],
    updatedAt: "2026-05-21T13:15:00.000Z",
    steps: [
      {
        id: "st-1",
        stepNumber: 1,
        actionType: "goto",
        locatorType: "",
        locatorValue: "",
        inputValue: "/login",
        expectedResult: "Login page opens",
        waitMs: "",
        timeoutMs: 10000
      },
      {
        id: "st-2",
        stepNumber: 2,
        actionType: "type",
        locatorType: "label",
        locatorValue: "Email",
        inputValue: "qa@example.com",
        expectedResult: "Email entered",
        waitMs: "",
        timeoutMs: 10000
      },
      {
        id: "st-3",
        stepNumber: 3,
        actionType: "click",
        locatorType: "role",
        locatorValue: "button:Sign in",
        inputValue: "",
        expectedResult: "Dashboard opens",
        waitMs: "",
        timeoutMs: 10000
      }
    ]
  },
  {
    id: "tc-checkout-014",
    title: "Guest can download invoice",
    project: "Commerce",
    baseUrl: "https://example.com",
    groupType: "REGRESSION",
    priority: "HIGH",
    status: "READY",
    tags: ["checkout", "download"],
    updatedAt: "2026-05-20T18:35:00.000Z",
    steps: [
      {
        id: "st-4",
        stepNumber: 1,
        actionType: "goto",
        locatorType: "",
        locatorValue: "",
        inputValue: "/orders/latest",
        expectedResult: "Order page opens",
        waitMs: "",
        timeoutMs: 10000
      },
      {
        id: "st-5",
        stepNumber: 2,
        actionType: "download_file",
        locatorType: "role",
        locatorValue: "button:Download invoice",
        inputValue: "",
        expectedResult: "Invoice downloads",
        waitMs: "",
        timeoutMs: 15000
      }
    ]
  },
  {
    id: "tc-profile-009",
    title: "Profile phone number validation",
    project: "Prudent Portal",
    baseUrl: "https://example.com",
    groupType: "SPRINT",
    priority: "MEDIUM",
    status: "DRAFT",
    tags: ["profile", "validation"],
    updatedAt: "2026-05-19T09:22:00.000Z",
    steps: [
      {
        id: "st-6",
        stepNumber: 1,
        actionType: "goto",
        locatorType: "",
        locatorValue: "",
        inputValue: "/profile",
        expectedResult: "Profile opens",
        waitMs: "",
        timeoutMs: 10000
      },
      {
        id: "st-7",
        stepNumber: 2,
        actionType: "type",
        locatorType: "placeholder",
        locatorValue: "Phone number",
        inputValue: "123",
        expectedResult: "Validation appears",
        waitMs: "",
        timeoutMs: 10000
      }
    ]
  }
];

export const initialSuites: TestSuite[] = [
  { id: "suite-smoke", name: "Smoke Test", suiteType: "SMOKE", testCaseIds: ["tc-login-001"] },
  { id: "suite-regression", name: "Regression Test", suiteType: "REGRESSION", testCaseIds: ["tc-login-001", "tc-checkout-014"] },
  { id: "suite-sprint", name: "Sprint Test", suiteType: "SPRINT", testCaseIds: ["tc-profile-009"] }
];

export const initialRuns: RunRecord[] = [
  {
    id: "run-1048",
    testCaseId: "tc-login-001",
    testTitle: "Valid user can sign in",
    suiteName: "Smoke Test",
    status: "PASSED",
    browser: "chromium",
    environment: "qa",
    durationMs: 18420,
    startedAt: "2026-05-21T15:05:00.000Z"
  },
  {
    id: "run-1047",
    testCaseId: "tc-checkout-014",
    testTitle: "Guest can download invoice",
    suiteName: "Regression Test",
    status: "FAILED",
    browser: "firefox",
    environment: "staging",
    durationMs: 22340,
    startedAt: "2026-05-21T14:31:00.000Z",
    failedStepId: "st-5",
    error: "Timeout waiting for role=button name=Download invoice",
    screenshot: "artifacts/runs/run-1047/failed-step-2.png",
    trace: "artifacts/runs/run-1047/trace.zip",
    video: "artifacts/runs/run-1047/videos/page.webm"
  },
  {
    id: "run-1046",
    testCaseId: "tc-profile-009",
    testTitle: "Profile phone number validation",
    suiteName: "Sprint Test",
    status: "SKIPPED",
    browser: "webkit",
    environment: "qa",
    durationMs: 0,
    startedAt: "2026-05-20T16:47:00.000Z"
  }
];
