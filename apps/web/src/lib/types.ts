export type ActionType =
  | "goto"
  | "click"
  | "type"
  | "select"
  | "verify_text"
  | "wait"
  | "upload_file"
  | "download_file"
  | "screenshot"
  | "get_page_title"
  | "is_disabled"
  | "is_enabled"
  | "string_contains"
  | "select_by_value"
  | "switch_to_frame"
  | "database_connection"
  | "api_call"
  | "schema_validation"
  | "json_validation"
  | "assert_text_equals"
  | "assert_text_contains"
  | "assert_value_equals"
  | "assert_visible"
  | "assert_hidden"
  | "assert_url_equals"
  | "assert_url_contains"
  | "assert_number_compare"
  | "loop_start"
  | "loop_end"
  | "if"
  | "else"
  | "end_if"
  | "switch"
  | "case"
  | "default"
  | "end_switch";

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
  baseUrl?: string;
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

export interface EnvironmentConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiUrl: string;
  dbUrl: string;
  variables: Record<string, string>;
}

export interface DataSet {
  id: string;
  name: string;
  variables?: Record<string, string>;
  rows: DataRow[];
}

export interface DataRow {
  id: string;
  name: string;
  enabled: boolean;
  variables: Record<string, string>;
}

export interface ScenarioData {
  id: string;
  name: string;
  variables: Record<string, string>;
}

export interface UtilityBlock {
  id: string;
  name: string;
  description: string;
  steps: TestStep[];
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  testCaseId: string;
  testTitle: string;
  suiteName: string;
  status: RunStatus;
  executionMode?: "UI_DEMO" | "LOCAL_PLAYWRIGHT" | "PLAYWRIGHT_API";
  browser: "chromium" | "chrome" | "firefox" | "webkit";
  environment: string;
  durationMs: number;
  startedAt: string;
  triggerSource?: "UI" | "DATA_DRIVEN" | "JENKINS" | "SCHEDULED";
  dataSetName?: string;
  dataRowName?: string;
  jenkinsBuild?: string;
  stepResults?: RunStepResult[];
  failedStepId?: string;
  error?: string;
  screenshot?: string;
  trace?: string;
  video?: string;
}

export interface JenkinsConfig {
  url: string;
  jobName: string;
  token: string;
  branch: string;
}

export interface ScheduleConfig {
  id: string;
  name: string;
  testCaseId: string;
  environmentId: string;
  dataSetId: string;
  cadence: "Hourly" | "Daily" | "Weekly";
  time: string;
  enabled: boolean;
  nextRun: string;
}

export interface RunStepResult {
  stepId: string;
  stepNumber: number;
  actionType: ActionType;
  locatorType: LocatorType | "";
  locatorValue: string;
  expectedResult: string;
  status: RunStatus;
  durationMs: number;
  message: string;
  screenshot?: string;
}
