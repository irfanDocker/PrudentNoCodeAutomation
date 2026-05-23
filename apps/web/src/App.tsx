import {
  Activity,
  Bug,
  CheckCircle2,
  ClipboardList,
  Copy,
  Database,
  Download,
  FileText,
  GripVertical,
  Layers3,
  ListFilter,
  PlugZap,
  Radio,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  actionLabels,
  actionTypes,
  initialDataSets,
  initialEnvironments,
  initialJenkinsConfig,
  initialRuns,
  initialSchedules,
  initialScenarioData,
  initialSuites,
  initialTests,
  initialUtilities,
  locatorTypes,
  suiteTypes
} from "./lib/mockData";
import type {
  ActionType,
  DataSet,
  DataRow,
  EnvironmentConfig,
  JenkinsConfig,
  LocatorType,
  RunRecord,
  ScheduleConfig,
  ScenarioData,
  SuiteType,
  TestCase,
  TestStep,
  TestSuite,
  UtilityBlock
} from "./lib/types";

type Page = "dashboard" | "tests" | "builder" | "recorder" | "environments" | "testdata" | "utilities" | "suites" | "runs" | "debug" | "reports";
type ActionField = "locatorType" | "locatorValue" | "inputValue" | "expectedResult" | "waitMs";

interface ActionFieldConfig {
  fields: ActionField[];
  labels: Partial<Record<ActionField, string>>;
  placeholders?: Partial<Record<ActionField, string>>;
  multiline?: ActionField[];
  emptyText?: string;
}

const storageKeys = {
  tests: "prudent.tests",
  suites: "prudent.suites",
  runs: "prudent.runs",
  environments: "prudent.environments",
  dataSets: "prudent.dataSets",
  scenarioData: "prudent.scenarioData",
  utilities: "prudent.utilities",
  jenkinsConfig: "prudent.jenkinsConfig",
  schedules: "prudent.schedules"
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const navItems: Array<{ id: Page; label: string; icon: typeof Activity }> = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "tests", label: "Tests", icon: ClipboardList },
  { id: "builder", label: "Builder", icon: Settings2 },
  { id: "recorder", label: "Recorder", icon: Radio },
  { id: "environments", label: "Environments", icon: Database },
  { id: "testdata", label: "Test Data", icon: FileText },
  { id: "utilities", label: "Utilities", icon: PlugZap },
  { id: "suites", label: "Suites", icon: Layers3 },
  { id: "runs", label: "Runs", icon: Play },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "reports", label: "Reports", icon: FileText }
];

const defaultFieldLabels: Record<ActionField, string> = {
  locatorType: "Locator type",
  locatorValue: "Locator value",
  inputValue: "Input",
  expectedResult: "Expected result",
  waitMs: "Wait time"
};

const actionFieldConfigs: Record<ActionType, ActionFieldConfig> = {
  goto: {
    fields: ["inputValue"],
    labels: { inputValue: "URL or path" },
    placeholders: { inputValue: "https://example.com/login or /login" }
  },
  click: {
    fields: ["locatorType", "locatorValue"],
    labels: { locatorValue: "Element locator" },
    placeholders: { locatorValue: "button:Sign in, #submit, or Login" }
  },
  type: {
    fields: ["locatorType", "locatorValue", "inputValue"],
    labels: { locatorValue: "Input field locator", inputValue: "Text to type" }
  },
  select: {
    fields: ["locatorType", "locatorValue", "inputValue"],
    labels: { locatorValue: "Dropdown locator", inputValue: "Option label or value" }
  },
  select_by_value: {
    fields: ["locatorType", "locatorValue", "inputValue"],
    labels: { locatorValue: "Dropdown locator", inputValue: "Option value" }
  },
  verify_text: {
    fields: ["expectedResult"],
    labels: { expectedResult: "Expected visible text" }
  },
  wait: {
    fields: ["waitMs"],
    labels: { waitMs: "Wait time (ms)" },
    placeholders: { waitMs: "1000" }
  },
  upload_file: {
    fields: ["locatorType", "locatorValue", "inputValue"],
    labels: { locatorValue: "File input locator", inputValue: "File path" }
  },
  download_file: {
    fields: ["locatorType", "locatorValue"],
    labels: { locatorValue: "Download button/link locator" }
  },
  screenshot: {
    fields: [],
    labels: {},
    emptyText: "No additional input needed."
  },
  get_page_title: {
    fields: ["expectedResult"],
    labels: { expectedResult: "Expected page title contains" }
  },
  is_disabled: {
    fields: ["locatorType", "locatorValue"],
    labels: { locatorValue: "Disabled element locator" }
  },
  is_enabled: {
    fields: ["locatorType", "locatorValue"],
    labels: { locatorValue: "Enabled element locator" }
  },
  string_contains: {
    fields: ["inputValue", "expectedResult"],
    labels: { inputValue: "Source text", expectedResult: "Text to find" }
  },
  switch_to_frame: {
    fields: ["locatorType", "locatorValue"],
    labels: { locatorType: "Frame selector type", locatorValue: "Frame selector" },
    placeholders: { locatorValue: "iframe[name='checkout'] or main" }
  },
  database_connection: {
    fields: ["inputValue"],
    labels: { inputValue: "Database URL" },
    placeholders: { inputValue: "mysql://user:pass@host:3306/database" }
  },
  api_call: {
    fields: ["inputValue", "expectedResult"],
    labels: { inputValue: "API URL", expectedResult: "Expected status or response text" },
    placeholders: { inputValue: "https://api.example.com/health", expectedResult: "200 or healthy" }
  },
  schema_validation: {
    fields: ["inputValue", "expectedResult"],
    labels: { inputValue: "JSON response/body", expectedResult: "Schema JSON" },
    multiline: ["inputValue", "expectedResult"]
  },
  json_validation: {
    fields: ["inputValue", "expectedResult"],
    labels: { inputValue: "JSON response/body", expectedResult: "Expected JSON subset" },
    multiline: ["inputValue", "expectedResult"]
  }
};

function normalizeActionValues<T extends Omit<TestStep, "id" | "stepNumber"> | TestStep>(step: T): T {
  const fields = new Set(actionFieldConfigs[step.actionType].fields);

  return {
    ...step,
    locatorType: fields.has("locatorType") ? step.locatorType || "css" : "",
    locatorValue: fields.has("locatorValue") ? step.locatorValue : "",
    inputValue: fields.has("inputValue") ? step.inputValue : "",
    expectedResult: fields.has("expectedResult") ? step.expectedResult : "",
    waitMs: fields.has("waitMs") ? step.waitMs || 1000 : "",
    timeoutMs: step.timeoutMs || 10000
  };
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMs(value: number) {
  if (!value) return "0s";
  return `${(value / 1000).toFixed(1)}s`;
}

function variablesToText(variables: Record<string, string>) {
  return Object.entries(variables)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function textToVariables(value: string) {
  return value.split("\n").reduce<Record<string, string>>((variables, line) => {
    const trimmed = line.trim();
    if (!trimmed) return variables;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      variables[trimmed] = "";
      return variables;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key) {
      variables[key] = trimmed.slice(separatorIndex + 1).trim();
    }
    return variables;
  }, {});
}

function VariablesField({
  variables,
  onChange,
  label = "Variables (key=value)"
}: {
  variables: Record<string, string>;
  onChange: (variables: Record<string, string>) => void;
  label?: string;
}) {
  const [rawText, setRawText] = useState(() => variablesToText(variables));

  useEffect(() => {
    setRawText(variablesToText(variables));
  }, [variables]);

  return (
    <label className="wide-field">
      {label}
      <textarea
        rows={4}
        value={rawText}
        onChange={(event) => setRawText(event.target.value)}
        onBlur={() => onChange(textToVariables(rawText))}
      />
    </label>
  );
}

function resolveTokens(value: string, variables: Record<string, string>) {
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
}

function applyTokensToStep(step: TestStep, variables: Record<string, string>): TestStep {
  return {
    ...step,
    locatorValue: resolveTokens(step.locatorValue, variables),
    inputValue: resolveTokens(step.inputValue, variables),
    expectedResult: resolveTokens(step.expectedResult, variables)
  };
}

function renumberSteps(steps: TestStep[]) {
  return steps.map((step, index) => ({ ...step, stepNumber: index + 1 }));
}

function namespacedVariables(prefix: string, variables: Record<string, string>) {
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [`${prefix}.${key}`, value]));
}

function dataRowsForDataSet(dataSet: DataSet | undefined): DataRow[] {
  if (!dataSet) return [];
  if (dataSet.rows?.length) return dataSet.rows;
  if (dataSet.variables && Object.keys(dataSet.variables).length) {
    return [{ id: `${dataSet.id}-row`, name: dataSet.name, enabled: true, variables: dataSet.variables }];
  }
  return [];
}

function dataColumnNames(dataSet: DataSet | undefined) {
  return Array.from(new Set(dataRowsForDataSet(dataSet).flatMap((row) => Object.keys(row.variables))));
}

function csvValue(value: string | boolean) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

function emptyStep(stepNumber: number): TestStep {
  return {
    id: uid("step"),
    stepNumber,
    actionType: "click",
    locatorType: "css",
    locatorValue: "",
    inputValue: "",
    expectedResult: "",
    waitMs: "",
    timeoutMs: 10000
  };
}

function emptyRecorderDraft(): Omit<TestStep, "id" | "stepNumber"> {
  return {
    actionType: "click",
    locatorType: "css",
    locatorValue: "",
    inputValue: "",
    expectedResult: "",
    waitMs: "",
    timeoutMs: 10000
  };
}

function exportRun(run: RunRecord) {
  const header = ["run_id", "test_title", "suite", "status", "browser", "environment", "duration_ms", "error"];
  const row = [run.id, run.testTitle, run.suiteName, run.status, run.browser, run.environment, run.durationMs, run.error ?? ""];
  const csv = [header, row].map((items) => items.map((item) => `"${String(item).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${run.id}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportDataSet(dataSet: DataSet) {
  const rows = dataRowsForDataSet(dataSet);
  const columns = dataColumnNames(dataSet);
  const header = ["enabled", "row_name", ...columns];
  const csv = [
    header.map(csvValue).join(","),
    ...rows.map((row) => [row.enabled, row.name, ...columns.map((column) => row.variables[column] ?? "")].map(csvValue).join(","))
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${dataSet.name.replaceAll(/\s+/g, "-").toLowerCase()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: RunRecord["status"] | TestCase["status"] }) {
  return <span className={`badge ${status.toLowerCase()}`}>{status}</span>;
}

function executionLabel(mode: RunRecord["executionMode"]) {
  if (mode === "PLAYWRIGHT_API") return "Playwright API";
  if (mode === "LOCAL_PLAYWRIGHT") return "Local Playwright";
  return "UI demo";
}

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [tests, setTests] = useState<TestCase[]>(() => readStored(storageKeys.tests, initialTests));
  const [suites, setSuites] = useState<TestSuite[]>(() => readStored(storageKeys.suites, initialSuites));
  const [runs, setRuns] = useState<RunRecord[]>(() => readStored(storageKeys.runs, initialRuns));
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>(() => readStored(storageKeys.environments, initialEnvironments));
  const [dataSets, setDataSets] = useState<DataSet[]>(() => readStored(storageKeys.dataSets, initialDataSets));
  const [scenarioData, setScenarioData] = useState<ScenarioData[]>(() => readStored(storageKeys.scenarioData, initialScenarioData));
  const [utilities, setUtilities] = useState<UtilityBlock[]>(() => readStored(storageKeys.utilities, initialUtilities));
  const [jenkinsConfig, setJenkinsConfig] = useState<JenkinsConfig>(() => readStored(storageKeys.jenkinsConfig, initialJenkinsConfig));
  const [schedules, setSchedules] = useState<ScheduleConfig[]>(() => readStored(storageKeys.schedules, initialSchedules));
  const [selectedTestId, setSelectedTestId] = useState(() => readStored(storageKeys.tests, initialTests)[0]?.id ?? "");
  const [selectedRunId, setSelectedRunId] = useState(() => readStored(storageKeys.runs, initialRuns)[0]?.id ?? "");
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(() => readStored(storageKeys.environments, initialEnvironments)[0]?.id ?? "");
  const [selectedDataSetId, setSelectedDataSetId] = useState(() => readStored(storageKeys.dataSets, initialDataSets)[0]?.id ?? "");
  const [selectedDataRowId, setSelectedDataRowId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState(() => readStored(storageKeys.scenarioData, initialScenarioData)[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<SuiteType | "ALL">("ALL");
  const [dataRunMode, setDataRunMode] = useState<"single" | "all">("single");
  const [browser, setBrowser] = useState<RunRecord["browser"]>("chromium");
  const [headless, setHeadless] = useState(true);
  const [runningTestId, setRunningTestId] = useState("");
  const [draggedStepId, setDraggedStepId] = useState("");
  const [recorderDraft, setRecorderDraft] = useState<Omit<TestStep, "id" | "stepNumber">>(() => emptyRecorderDraft());

  const selectedTest = tests.find((test) => test.id === selectedTestId) ?? tests[0];
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  const selectedEnvironment = environments.find((environment) => environment.id === selectedEnvironmentId) ?? environments[0];
  const selectedDataSet = dataSets.find((dataSet) => dataSet.id === selectedDataSetId) ?? dataSets[0];
  const selectedScenario = scenarioData.find((scenario) => scenario.id === selectedScenarioId) ?? scenarioData[0];
  const selectedDataRows = dataRowsForDataSet(selectedDataSet);
  const selectedDataRow = selectedDataRows.find((row) => row.id === selectedDataRowId) ?? selectedDataRows[0];
  const selectedDataColumns = dataColumnNames(selectedDataSet);
  const availableDataTokens = Array.from(new Set([
    ...Object.keys(selectedDataSet?.variables ?? {}).map((key) => `data.${key}`),
    ...selectedDataColumns.map((key) => `data.${key}`),
    ...Object.keys(selectedScenario?.variables ?? {}).map((key) => `scenario.${key}`),
    ...Object.keys(selectedEnvironment?.variables ?? {}).map((key) => `env.${key}`),
    ...Object.keys(selectedEnvironment?.variables ?? {}),
    "baseUrl",
    "apiUrl",
    "dbUrl",
    "environment",
    ...selectedDataColumns,
    ...Object.keys(selectedDataRow?.variables ?? {}),
    ...Object.keys(selectedScenario?.variables ?? {})
  ])).filter(Boolean).map((column) => `{{${column}}}`);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.tests, JSON.stringify(tests));
  }, [tests]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.suites, JSON.stringify(suites));
  }, [suites]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.runs, JSON.stringify(runs));
  }, [runs]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.environments, JSON.stringify(environments));
  }, [environments]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.dataSets, JSON.stringify(dataSets));
  }, [dataSets]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.scenarioData, JSON.stringify(scenarioData));
  }, [scenarioData]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.utilities, JSON.stringify(utilities));
  }, [utilities]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.jenkinsConfig, JSON.stringify(jenkinsConfig));
  }, [jenkinsConfig]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.schedules, JSON.stringify(schedules));
  }, [schedules]);

  useEffect(() => {
    if (selectedDataRows.length && !selectedDataRows.some((row) => row.id === selectedDataRowId)) {
      setSelectedDataRowId(selectedDataRows[0].id);
    }
  }, [selectedDataRowId, selectedDataRows]);

  const filteredTests = useMemo(() => {
    return tests.filter((test) => {
      const matchesSearch =
        test.title.toLowerCase().includes(search.toLowerCase()) ||
        test.tags.join(" ").toLowerCase().includes(search.toLowerCase()) ||
        test.project.toLowerCase().includes(search.toLowerCase());
      const matchesGroup = groupFilter === "ALL" || test.groupType === groupFilter;
      return matchesSearch && matchesGroup;
    });
  }, [groupFilter, search, tests]);

  const latestFailedRun = runs.find((run) => run.status === "FAILED");
  const passedRuns = runs.filter((run) => run.status === "PASSED").length;
  const failedRuns = runs.filter((run) => run.status === "FAILED").length;
  const skippedRuns = runs.filter((run) => run.status === "SKIPPED").length;

  function activeRunVariables(dataRow = selectedDataRow) {
    const environmentVariables = selectedEnvironment?.variables ?? {};
    const testDataVariables = {
      ...(selectedDataSet?.variables ?? {}),
      ...(dataRow?.variables ?? {})
    };
    const scenarioVariables = selectedScenario?.variables ?? {};

    return {
      ...testDataVariables,
      ...scenarioVariables,
      ...environmentVariables,
      baseUrl: selectedEnvironment?.baseUrl ?? "",
      apiUrl: selectedEnvironment?.apiUrl ?? "",
      dbUrl: selectedEnvironment?.dbUrl ?? "",
      environment: selectedEnvironment?.name ?? "",
      ...namespacedVariables("data", testDataVariables),
      ...namespacedVariables("scenario", scenarioVariables),
      ...namespacedVariables("env", environmentVariables)
    };
  }

  function executableTest(test: TestCase, dataRow = selectedDataRow) {
    const variables = activeRunVariables(dataRow);
    const baseUrl = selectedEnvironment?.baseUrl || test.baseUrl || "";

    return {
      ...test,
      baseUrl: resolveTokens(baseUrl, variables),
      steps: test.steps.map((step) => applyTokensToStep(step, variables))
    };
  }

  function createTest() {
    const test: TestCase = {
      id: uid("tc"),
      title: "New no-code test",
      project: "Prudent Portal",
      baseUrl: "https://example.com",
      groupType: "CUSTOM",
      priority: "MEDIUM",
      status: "DRAFT",
      tags: ["new"],
      updatedAt: new Date().toISOString(),
      steps: [emptyStep(1)]
    };
    setTests((current) => [test, ...current]);
    setSelectedTestId(test.id);
    setPage("builder");
  }

  function updateSelectedTest(patch: Partial<TestCase>) {
    if (!selectedTest) return;
    setTests((current) =>
      current.map((test) =>
        test.id === selectedTest.id ? { ...test, ...patch, updatedAt: new Date().toISOString() } : test
      )
    );
  }

  function updateStep(stepId: string, patch: Partial<TestStep>) {
    if (!selectedTest) return;
    updateSelectedTest({
      steps: selectedTest.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
    });
  }

  function updateStepAction(step: TestStep, actionType: ActionType) {
    updateStep(step.id, normalizeActionValues({ ...step, actionType }));
  }

  function updateRecorderAction(actionType: ActionType) {
    setRecorderDraft((current) => normalizeActionValues({ ...current, actionType }));
  }

  function addStep() {
    if (!selectedTest) return;
    updateSelectedTest({
      steps: [...selectedTest.steps, emptyStep(selectedTest.steps.length + 1)]
    });
  }

  function insertStepAfter(stepId: string) {
    if (!selectedTest) return;
    const insertIndex = selectedTest.steps.findIndex((step) => step.id === stepId);
    if (insertIndex === -1) return;

    const nextSteps = [...selectedTest.steps];
    nextSteps.splice(insertIndex + 1, 0, emptyStep(insertIndex + 2));
    updateSelectedTest({ steps: renumberSteps(nextSteps) });
  }

  function reorderStep(sourceStepId: string, targetStepId: string) {
    if (!selectedTest || sourceStepId === targetStepId) return;
    const sourceIndex = selectedTest.steps.findIndex((step) => step.id === sourceStepId);
    const targetIndex = selectedTest.steps.findIndex((step) => step.id === targetStepId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const nextSteps = [...selectedTest.steps];
    const [movedStep] = nextSteps.splice(sourceIndex, 1);
    nextSteps.splice(targetIndex, 0, movedStep);
    updateSelectedTest({ steps: renumberSteps(nextSteps) });
  }

  function deleteStep(stepId: string) {
    if (!selectedTest) return;
    updateSelectedTest({
      steps: renumberSteps(selectedTest.steps.filter((step) => step.id !== stepId))
    });
  }

  function duplicateTest(test: TestCase) {
    const copy = {
      ...test,
      id: uid("tc"),
      title: `${test.title} Copy`,
      status: "DRAFT" as const,
      updatedAt: new Date().toISOString(),
      steps: test.steps.map((step, index) => ({ ...step, id: uid("step"), stepNumber: index + 1 }))
    };
    setTests((current) => [copy, ...current]);
    setSelectedTestId(copy.id);
    setPage("builder");
  }

  function deleteTest(testId: string) {
    setTests((current) => current.filter((test) => test.id !== testId));
    setSuites((current) =>
      current.map((suite) => ({ ...suite, testCaseIds: suite.testCaseIds.filter((id) => id !== testId) }))
    );
    if (selectedTestId === testId) {
      setSelectedTestId(tests.find((test) => test.id !== testId)?.id ?? "");
    }
  }

  function cloneStepsForInsert(steps: TestStep[], startAt: number) {
    return steps.map((step, index) => ({
      ...step,
      id: uid("step"),
      stepNumber: startAt + index
    }));
  }

  function insertUtility(utility: UtilityBlock) {
    if (!selectedTest) return;
    updateSelectedTest({
      steps: [
        ...selectedTest.steps,
        ...cloneStepsForInsert(utility.steps, selectedTest.steps.length + 1)
      ]
    });
    setPage("builder");
  }

  function createUtilityFromSelectedTest() {
    if (!selectedTest) return;
    const utility: UtilityBlock = {
      id: uid("util"),
      name: `${selectedTest.title} utility`,
      description: selectedTest.project,
      updatedAt: new Date().toISOString(),
      steps: cloneStepsForInsert(selectedTest.steps, 1)
    };
    setUtilities((current) => [utility, ...current]);
    setPage("utilities");
  }

  function updateUtilityFromSelectedTest(utilityId: string) {
    if (!selectedTest) return;
    setUtilities((current) =>
      current.map((utility) =>
        utility.id === utilityId
          ? { ...utility, steps: cloneStepsForInsert(selectedTest.steps, 1), updatedAt: new Date().toISOString() }
          : utility
      )
    );
  }

  function addEnvironment() {
    const environment: EnvironmentConfig = {
      id: uid("env"),
      name: "New environment",
      baseUrl: selectedTest?.baseUrl ?? "",
      apiUrl: apiBaseUrl,
      dbUrl: "",
      variables: {}
    };
    setEnvironments((current) => [environment, ...current]);
    setSelectedEnvironmentId(environment.id);
  }

  function addDataSet() {
    const dataSet: DataSet = {
      id: uid("data"),
      name: "New data set",
      rows: [{ id: uid("row"), name: "Row 1", enabled: true, variables: {} }]
    };
    setDataSets((current) => [dataSet, ...current]);
    setSelectedDataSetId(dataSet.id);
    setSelectedDataRowId(dataSet.rows[0].id);
  }

  function addDataRow(dataSetId: string) {
    const row: DataRow = { id: uid("row"), name: "New row", enabled: true, variables: {} };
    setDataSets((current) =>
      current.map((dataSet) => dataSet.id === dataSetId ? { ...dataSet, rows: [...dataRowsForDataSet(dataSet), row] } : dataSet)
    );
    setSelectedDataRowId(row.id);
  }

  function updateDataRow(dataSetId: string, rowId: string, patch: Partial<DataRow>) {
    setDataSets((current) =>
      current.map((dataSet) =>
        dataSet.id === dataSetId
          ? { ...dataSet, rows: dataRowsForDataSet(dataSet).map((row) => row.id === rowId ? { ...row, ...patch } : row), variables: undefined }
          : dataSet
      )
    );
  }

  function updateDataCell(dataSetId: string, rowId: string, column: string, value: string) {
    setDataSets((current) =>
      current.map((dataSet) =>
        dataSet.id === dataSetId
          ? {
              ...dataSet,
              rows: dataRowsForDataSet(dataSet).map((row) =>
                row.id === rowId ? { ...row, variables: { ...row.variables, [column]: value } } : row
              ),
              variables: undefined
            }
          : dataSet
      )
    );
  }

  function addDataColumn(dataSetId: string) {
    const name = window.prompt("Column name, for example email or password");
    const column = name?.trim();
    if (!column) return;

    setDataSets((current) =>
      current.map((dataSet) =>
        dataSet.id === dataSetId
          ? {
              ...dataSet,
              rows: dataRowsForDataSet(dataSet).map((row) => ({
                ...row,
                variables: { ...row.variables, [column]: row.variables[column] ?? "" }
              })),
              variables: undefined
            }
          : dataSet
      )
    );
  }

  function deleteDataColumn(dataSetId: string, column: string) {
    setDataSets((current) =>
      current.map((dataSet) => {
        if (dataSet.id !== dataSetId) return dataSet;

        return {
          ...dataSet,
          rows: dataRowsForDataSet(dataSet).map((row) => {
            const { [column]: _removed, ...variables } = row.variables;
            return { ...row, variables };
          }),
          variables: undefined
        };
      })
    );
  }

  function deleteDataRow(dataSetId: string, rowId: string) {
    setDataSets((current) =>
      current.map((dataSet) =>
        dataSet.id === dataSetId
          ? { ...dataSet, rows: dataRowsForDataSet(dataSet).filter((row) => row.id !== rowId), variables: undefined }
          : dataSet
      )
    );
  }

  function addScenarioData() {
    const scenario: ScenarioData = { id: uid("scenario"), name: "New scenario", variables: {} };
    setScenarioData((current) => [scenario, ...current]);
    setSelectedScenarioId(scenario.id);
  }

  function deleteEnvironment(environmentId: string) {
    setEnvironments((current) => current.filter((environment) => environment.id !== environmentId));
    if (selectedEnvironmentId === environmentId) {
      setSelectedEnvironmentId(environments.find((environment) => environment.id !== environmentId)?.id ?? "");
    }
  }

  function deleteDataSet(dataSetId: string) {
    setDataSets((current) => current.filter((dataSet) => dataSet.id !== dataSetId));
    if (selectedDataSetId === dataSetId) {
      setSelectedDataSetId(dataSets.find((dataSet) => dataSet.id !== dataSetId)?.id ?? "");
    }
  }

  function deleteScenarioData(scenarioId: string) {
    setScenarioData((current) => current.filter((scenario) => scenario.id !== scenarioId));
    if (selectedScenarioId === scenarioId) {
      setSelectedScenarioId(scenarioData.find((scenario) => scenario.id !== scenarioId)?.id ?? "");
    }
  }

  function recordDraftStep() {
    if (!selectedTest) return;

    const step: TestStep = {
      id: uid("step"),
      stepNumber: selectedTest.steps.length + 1,
      ...normalizeActionValues(recorderDraft)
    };

    updateSelectedTest({ steps: [...selectedTest.steps, step] });
    setRecorderDraft((current) =>
      normalizeActionValues({
        ...current,
        locatorValue: "",
        inputValue: "",
        expectedResult: "",
        waitMs: ""
      })
    );
  }

  function renderActionField(
    actionType: ActionType,
    field: ActionField,
    value: string | number,
    onChange: (field: ActionField, value: string | number) => void
  ) {
    const config = actionFieldConfigs[actionType];
    const label = config.labels[field] ?? defaultFieldLabels[field];
    const placeholder = config.placeholders?.[field] ?? "";

    if (field === "locatorType") {
      return (
        <label key={field}>
          {label}
          <select value={value} onChange={(event) => onChange(field, event.target.value as LocatorType | "")}>
            {locatorTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
      );
    }

    function renderTokenPicker() {
      if (!availableDataTokens.length || field === "locatorType" || field === "waitMs") return null;

      return (
        <select className="token-picker" value="" onChange={(event) => {
          const token = event.target.value;
          if (!token) return;
          onChange(field, `${value}${value ? " " : ""}${token}`);
        }}>
          <option value="">Insert variable</option>
          {availableDataTokens.map((token) => <option key={token} value={token}>{token}</option>)}
        </select>
      );
    }

    if (field === "waitMs") {
      return (
        <label key={field}>
          {label}
          <input
            type="number"
            min="0"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(field, event.target.value ? Number(event.target.value) : "")}
          />
        </label>
      );
    }

    if (config.multiline?.includes(field)) {
      return (
        <label key={field} className="wide-field">
          {label}
          <textarea
            placeholder={placeholder}
            value={value}
            rows={3}
            onChange={(event) => onChange(field, event.target.value)}
          />
          {renderTokenPicker()}
        </label>
      );
    }

    return (
      <label key={field}>
        {label}
        <input placeholder={placeholder} value={value} onChange={(event) => onChange(field, event.target.value)} />
        {renderTokenPicker()}
      </label>
    );
  }

  function renderStepActionFields(step: TestStep) {
    const config = actionFieldConfigs[step.actionType];

    if (!config.fields.length) {
      return <span className="no-action-fields">{config.emptyText ?? "No additional input needed."}</span>;
    }

    return config.fields.map((field) =>
      renderActionField(step.actionType, field, step[field], (fieldName, value) => updateStep(step.id, { [fieldName]: value }))
    );
  }

  function renderRecorderActionFields() {
    const config = actionFieldConfigs[recorderDraft.actionType];

    if (!config.fields.length) {
      return <span className="no-action-fields wide-field">{config.emptyText ?? "No additional input needed."}</span>;
    }

    return config.fields.map((field) =>
      renderActionField(recorderDraft.actionType, field, recorderDraft[field], (fieldName, value) =>
        setRecorderDraft((current) => ({ ...current, [fieldName]: value }))
      )
    );
  }

  function stepDetailText(step: TestStep) {
    const config = actionFieldConfigs[step.actionType];
    const details = config.fields
      .map((field) => {
        const value = step[field];
        if (value === "") return "";
        return `${config.labels[field] ?? defaultFieldLabels[field]}: ${value}`;
      })
      .filter(Boolean);

    return details.join(" · ") || config.emptyText || "-";
  }

  function createDemoRun(test: TestCase, forcedStatus?: RunRecord["status"], fallbackError?: string): RunRecord {
    const status = forcedStatus ?? (test.title.toLowerCase().includes("invoice") ? "FAILED" : "PASSED");
    const failedStep = status === "FAILED" ? test.steps[test.steps.length - 1] : undefined;
    const runId = uid("run");

    return {
      id: runId,
      testCaseId: test.id,
      testTitle: test.title,
      suiteName: test.groupType === "CUSTOM" ? "Custom Test Suite" : `${test.groupType[0]}${test.groupType.slice(1).toLowerCase()} Test`,
      status,
      executionMode: "UI_DEMO",
      browser,
      environment: "qa",
      durationMs: status === "FAILED" ? 22400 : 14250,
      startedAt: new Date().toISOString(),
      stepResults: test.steps.map((step, index) => {
        const stepStatus =
          status === "FAILED" && step.id === failedStep?.id
            ? "FAILED"
            : status === "FAILED" && failedStep && step.stepNumber > failedStep.stepNumber
              ? "SKIPPED"
              : "PASSED";

        return {
          stepId: step.id,
          stepNumber: step.stepNumber,
          actionType: step.actionType,
          locatorType: step.locatorType,
          locatorValue: step.locatorValue,
          expectedResult: step.expectedResult,
          status: stepStatus,
          durationMs: 600 + index * 320,
          message:
            stepStatus === "FAILED"
              ? `Could not complete ${step.actionType} using ${step.locatorType || "locator"}=${step.locatorValue || "value"}`
              : `${step.actionType} completed`,
          screenshot: `artifacts/runs/${runId}/screenshots/step-${String(step.stepNumber).padStart(3, "0")}-${stepStatus.toLowerCase()}.png`
        };
      }),
      failedStepId: failedStep?.id,
      screenshot: status === "FAILED" ? `artifacts/runs/${runId}/screenshots/step-${String(failedStep?.stepNumber ?? 0).padStart(3, "0")}-failed.png` : undefined,
      trace: status === "FAILED" ? "artifacts/runs/latest/trace.zip" : undefined,
      video: status === "FAILED" ? "artifacts/runs/latest/videos/page.webm" : undefined,
      error: fallbackError ?? (status === "FAILED" ? `Timeout waiting for ${failedStep?.locatorType || "locator"}=${failedStep?.locatorValue || "value"}` : undefined)
    };
  }

  async function executeSingleRun(test: TestCase, dataRow: DataRow | undefined, triggerSource: RunRecord["triggerSource"]) {
    const configuredTest = executableTest(test, dataRow);
    const testTitle = triggerSource === "DATA_DRIVEN" && dataRow ? `${configuredTest.title} [${dataRow.name}]` : configuredTest.title;

    try {
      const response = await fetch(`${apiBaseUrl}/api/local-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCase: {
            title: testTitle,
            baseUrl: configuredTest.baseUrl || "",
            steps: configuredTest.steps.map((step) => ({
              id: step.id,
              stepNumber: step.stepNumber,
              actionType: step.actionType,
              locatorType: step.locatorType || undefined,
              locatorValue: step.locatorValue || undefined,
              inputValue: step.inputValue || undefined,
              expectedResult: step.expectedResult || undefined,
              waitMs: step.waitMs === "" ? undefined : step.waitMs,
              timeoutMs: step.timeoutMs === "" ? undefined : step.timeoutMs
            }))
          },
          options: {
            browser,
            headless,
            environment: selectedEnvironment?.name ?? "qa",
            screenshots: true,
            trace: true,
            video: true,
            variables: activeRunVariables(dataRow)
          }
        })
      });

      const payload = await response.json();
      if (!payload.data) {
        throw new Error(payload.error?.message ?? "Local Playwright run did not return a result");
      }

      const result = payload.data;
      const failedStep = result.stepResults?.find((step: { status: string }) => step.status === "FAILED");
      const run: RunRecord = {
        id: result.id,
        testCaseId: configuredTest.id,
        testTitle,
        suiteName: configuredTest.groupType === "CUSTOM" ? "Custom Test Suite" : `${configuredTest.groupType[0]}${configuredTest.groupType.slice(1).toLowerCase()} Test`,
        status: result.status,
        executionMode: "LOCAL_PLAYWRIGHT",
        browser: result.browser,
        environment: selectedEnvironment?.name ?? result.environment,
        durationMs: result.durationMs,
        startedAt: result.startedAt,
        triggerSource,
        dataSetName: selectedDataSet?.name,
        dataRowName: dataRow?.name,
        stepResults: result.stepResults.map(
          (step: {
            stepId?: string;
            stepNumber: number;
            actionType: ActionType;
            locatorType?: LocatorType | "";
            locatorValue?: string;
            expectedResult?: string;
            status: RunRecord["status"];
            durationMs: number;
            message: string;
            error?: string;
            screenshot?: string;
          }) => ({
            stepId: step.stepId ?? `${result.id}-${step.stepNumber}`,
            stepNumber: step.stepNumber,
            actionType: step.actionType,
            locatorType: step.locatorType ?? "",
            locatorValue: step.locatorValue ?? "",
            expectedResult: step.expectedResult ?? "",
            status: step.status,
            durationMs: step.durationMs,
            message: step.error ? `${step.message}: ${step.error}` : step.message,
            screenshot: step.screenshot
          })
        ),
        failedStepId: failedStep?.stepId,
        error: failedStep?.error,
        screenshot: failedStep?.screenshot,
        trace: result.trace ?? `${result.artifactBaseUrl}/trace.zip`,
        video: result.video
      };

      return run;
    } catch (error) {
      const fallbackRun = createDemoRun(
        { ...configuredTest, title: testTitle },
        "FAILED",
        `Local Playwright could not run. ${error instanceof Error ? error.message : ""}`
      );
      return {
        ...fallbackRun,
        environment: selectedEnvironment?.name ?? fallbackRun.environment,
        triggerSource,
        dataSetName: selectedDataSet?.name,
        dataRowName: dataRow?.name
      };
    }
  }

  async function runTest(test: TestCase, forcedStatus?: RunRecord["status"]) {
    if (runningTestId) return;

    const enabledRows = selectedDataRows.filter((row) => row.enabled);
    const rows =
      dataRunMode === "all" && !forcedStatus
        ? enabledRows.length ? enabledRows : selectedDataRows
        : selectedDataRow ? [selectedDataRow] : [];
    const runRows = rows.length ? rows : [undefined];

    if (forcedStatus) {
      const configuredTest = executableTest(test, runRows[0]);
      const demoRun = {
        ...createDemoRun(configuredTest, forcedStatus),
        environment: selectedEnvironment?.name ?? "qa",
        triggerSource: "UI" as const,
        dataSetName: selectedDataSet?.name,
        dataRowName: runRows[0]?.name
      };
      setRuns((current) => [demoRun, ...current]);
      setSelectedRunId(demoRun.id);
      setPage(demoRun.status === "FAILED" ? "debug" : "runs");
      return;
    }

    setRunningTestId(test.id);

    try {
      const completedRuns: RunRecord[] = [];
      const triggerSource = dataRunMode === "all" ? "DATA_DRIVEN" : "UI";

      for (const row of runRows) {
        completedRuns.push(await executeSingleRun(test, row, triggerSource));
      }

      setRuns((current) => [...completedRuns, ...current]);
      setSelectedRunId(completedRuns[0]?.id ?? selectedRunId);
      setPage(completedRuns.some((run) => run.status === "FAILED") ? "debug" : "runs");
    } finally {
      setRunningTestId("");
    }
  }

  function toggleSuiteTest(suiteId: string, testId: string) {
    setSuites((current) =>
      current.map((suite) => {
        if (suite.id !== suiteId) return suite;
        const exists = suite.testCaseIds.includes(testId);
        return {
          ...suite,
          testCaseIds: exists ? suite.testCaseIds.filter((id) => id !== testId) : [...suite.testCaseIds, testId]
        };
      })
    );
  }

  function queueRun(triggerSource: RunRecord["triggerSource"], label: string, jenkinsBuild?: string) {
    if (!selectedTest) return;

    const run: RunRecord = {
      id: uid("run"),
      testCaseId: selectedTest.id,
      testTitle: `${selectedTest.title} · ${label}`,
      suiteName: selectedTest.groupType === "CUSTOM" ? "Custom Test Suite" : `${selectedTest.groupType[0]}${selectedTest.groupType.slice(1).toLowerCase()} Test`,
      status: "QUEUED",
      executionMode: "PLAYWRIGHT_API",
      browser,
      environment: selectedEnvironment?.name ?? "qa",
      durationMs: 0,
      startedAt: new Date().toISOString(),
      triggerSource,
      dataSetName: selectedDataSet?.name,
      dataRowName: dataRunMode === "all" ? "All enabled rows" : selectedDataRow?.name,
      jenkinsBuild
    };

    setRuns((current) => [run, ...current]);
    setSelectedRunId(run.id);
  }

  function triggerJenkinsBuild() {
    const buildUrl = `${jenkinsConfig.url.replace(/\/$/, "")}/job/${encodeURIComponent(jenkinsConfig.jobName)}/buildWithParameters?BRANCH=${encodeURIComponent(jenkinsConfig.branch)}&TEST_CASE_ID=${encodeURIComponent(selectedTest?.id ?? "")}&ENVIRONMENT=${encodeURIComponent(selectedEnvironment?.name ?? "")}`;
    queueRun("JENKINS", "Jenkins build queued", buildUrl);
  }

  function addSchedule() {
    if (!selectedTest || !selectedEnvironment || !selectedDataSet) return;
    const schedule: ScheduleConfig = {
      id: uid("schedule"),
      name: `${selectedTest.title} schedule`,
      testCaseId: selectedTest.id,
      environmentId: selectedEnvironment.id,
      dataSetId: selectedDataSet.id,
      cadence: "Daily",
      time: "08:00",
      enabled: true,
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    setSchedules((current) => [schedule, ...current]);
  }

  function updateSchedule(scheduleId: string, patch: Partial<ScheduleConfig>) {
    setSchedules((current) => current.map((schedule) => schedule.id === scheduleId ? { ...schedule, ...patch } : schedule));
  }

  function queueSchedule(schedule: ScheduleConfig) {
    const test = tests.find((item) => item.id === schedule.testCaseId);
    const environment = environments.find((item) => item.id === schedule.environmentId);
    const dataSet = dataSets.find((item) => item.id === schedule.dataSetId);
    if (!test) return;

    const run: RunRecord = {
      id: uid("run"),
      testCaseId: test.id,
      testTitle: `${test.title} · ${schedule.name}`,
      suiteName: test.groupType === "CUSTOM" ? "Custom Test Suite" : `${test.groupType[0]}${test.groupType.slice(1).toLowerCase()} Test`,
      status: "QUEUED",
      executionMode: "PLAYWRIGHT_API",
      browser,
      environment: environment?.name ?? "qa",
      durationMs: 0,
      startedAt: new Date().toISOString(),
      triggerSource: "SCHEDULED",
      dataSetName: dataSet?.name,
      dataRowName: "Scheduled run"
    };

    setRuns((current) => [run, ...current]);
    setSelectedRunId(run.id);
  }

  function renderDashboard() {
    const suiteRows = suites.map((suite) => {
      const suiteRuns = runs.filter((run) => run.suiteName.toLowerCase().includes(suite.suiteType.toLowerCase()));
      return {
        name: suite.name,
        passed: suiteRuns.filter((run) => run.status === "PASSED").length,
        failed: suiteRuns.filter((run) => run.status === "FAILED").length,
        skipped: suiteRuns.filter((run) => run.status === "SKIPPED").length
      };
    });

    return (
      <>
        <div className="metric-grid">
          <div className="metric"><span>Total tests</span><strong>{tests.length}</strong></div>
          <div className="metric success"><span>Passed</span><strong>{passedRuns}</strong></div>
          <div className="metric danger"><span>Failed</span><strong>{failedRuns}</strong></div>
          <div className="metric warn"><span>Skipped</span><strong>{skippedRuns}</strong></div>
        </div>

        <section className="panel">
          <div className="panel-title">
            <h2>Latest runs</h2>
            <button className="icon-button" title="Run smoke suite"><Play size={18} /></button>
          </div>
          <RunTable runs={runs.slice(0, 5)} selectedRunId={selectedRunId} onSelect={(run) => setSelectedRunId(run.id)} />
        </section>

        {selectedRun && renderRunDetail(selectedRun)}

        <div className="split">
          <section className="panel">
            <h2>Failure trend</h2>
            <div className="trend">
              {runs.slice(0, 8).reverse().map((run) => (
                <div key={run.id} className="trend-bar">
                  <span className={run.status === "FAILED" ? "failed-bar" : "passed-bar"} style={{ height: run.status === "FAILED" ? 72 : 42 }} />
                  <small>{formatDate(run.startedAt).split(",")[0]}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>Suite results</h2>
            <table>
              <thead><tr><th>Suite</th><th>Pass</th><th>Fail</th><th>Skip</th></tr></thead>
              <tbody>
                {suiteRows.map((suite) => (
                  <tr key={suite.name}><td>{suite.name}</td><td>{suite.passed}</td><td>{suite.failed}</td><td>{suite.skipped}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </>
    );
  }

  function renderTestLibrary() {
    return (
      <section className="panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tests, tags, project" />
          </label>
          <label className="select-label">
            <ListFilter size={18} />
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as SuiteType | "ALL")}>
              <option value="ALL">All groups</option>
              {suiteTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <button className="primary" onClick={createTest}><Plus size={18} /> New test</button>
        </div>

        <table>
          <thead>
            <tr><th>Test</th><th>Group</th><th>Priority</th><th>Status</th><th>Steps</th><th>Updated</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filteredTests.map((test) => (
              <tr key={test.id}>
                <td>
                  <button className="text-button" onClick={() => { setSelectedTestId(test.id); setPage("builder"); }}>{test.title}</button>
                  <div className="tags">{test.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </td>
                <td>{test.groupType}</td>
                <td>{test.priority}</td>
                <td><StatusBadge status={test.status} /></td>
                <td>{test.steps.length}</td>
                <td>{formatDate(test.updatedAt)}</td>
                <td className="actions">
                  <button className="icon-button" title="Run" disabled={Boolean(runningTestId)} onClick={() => runTest(test)}><Play size={17} /></button>
                  <button className="icon-button" title="Duplicate" onClick={() => duplicateTest(test)}><Copy size={17} /></button>
                  <button className="icon-button danger-icon" title="Delete" onClick={() => deleteTest(test.id)}><Trash2 size={17} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  function renderBuilder() {
    if (!selectedTest) {
      return <section className="panel"><button className="primary" onClick={createTest}><Plus size={18} /> New test</button></section>;
    }

    return (
      <>
        <section className="panel">
          <div className="form-grid">
            <label>Test name<input value={selectedTest.title} onChange={(event) => updateSelectedTest({ title: event.target.value })} /></label>
            <label>Project<input value={selectedTest.project} onChange={(event) => updateSelectedTest({ project: event.target.value })} /></label>
            <label>Base URL<input value={selectedTest.baseUrl ?? ""} onChange={(event) => updateSelectedTest({ baseUrl: event.target.value })} /></label>
            <label>Group<select value={selectedTest.groupType} onChange={(event) => updateSelectedTest({ groupType: event.target.value as SuiteType })}>{suiteTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Priority<select value={selectedTest.priority} onChange={(event) => updateSelectedTest({ priority: event.target.value as TestCase["priority"] })}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Status<select value={selectedTest.status} onChange={(event) => updateSelectedTest({ status: event.target.value as TestCase["status"] })}>{["DRAFT", "READY", "ARCHIVED"].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Tags<input value={selectedTest.tags.join(", ")} onChange={(event) => updateSelectedTest({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label>
          </div>
          <div className="run-options">
            <label>Environment<select value={selectedEnvironmentId} onChange={(event) => setSelectedEnvironmentId(event.target.value)}>
              {environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
            </select></label>
            <label>Test data<select value={selectedDataSetId} onChange={(event) => setSelectedDataSetId(event.target.value)}>
              {dataSets.map((dataSet) => <option key={dataSet.id} value={dataSet.id}>{dataSet.name}</option>)}
            </select></label>
            <label>Data row<select value={selectedDataRow?.id ?? ""} onChange={(event) => setSelectedDataRowId(event.target.value)} disabled={dataRunMode === "all"}>
              {selectedDataRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select></label>
            <label>Loop<select value={dataRunMode} onChange={(event) => setDataRunMode(event.target.value as "single" | "all")}>
              <option value="single">Single data row</option>
              <option value="all">All enabled rows</option>
            </select></label>
            <label>Scenario<select value={selectedScenarioId} onChange={(event) => setSelectedScenarioId(event.target.value)}>
              {scenarioData.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
            </select></label>
            <label>Browser<select value={browser} onChange={(event) => setBrowser(event.target.value as RunRecord["browser"])}>{["chromium", "chrome", "firefox", "webkit"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="check"><input type="checkbox" checked={headless} onChange={(event) => setHeadless(event.target.checked)} /> Headless</label>
            <button className="primary" disabled={runningTestId === selectedTest.id} onClick={() => runTest(selectedTest)}><Play size={18} /> {runningTestId === selectedTest.id ? "Running" : "Run now"}</button>
            <button className="secondary"><Save size={18} /> Save</button>
          </div>
        </section>

        {!!availableDataTokens.length && (
          <section className="panel token-panel">
            <div className="panel-title">
              <h2>Variables available to steps</h2>
              <span className="badge neutral">{selectedEnvironment?.name} + {selectedDataSet?.name}</span>
            </div>
            <div className="token-list">
              {availableDataTokens.map((token) => <code key={token}>{token}</code>)}
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-title">
            <h2>Steps</h2>
            <div className="panel-actions">
              <select value="" onChange={(event) => {
                const utility = utilities.find((item) => item.id === event.target.value);
                if (utility) insertUtility(utility);
              }}>
                <option value="">Insert utility</option>
                {utilities.map((utility) => <option key={utility.id} value={utility.id}>{utility.name}</option>)}
              </select>
              <button className="secondary" onClick={createUtilityFromSelectedTest}><Save size={18} /> Save as utility</button>
              <button className="secondary" onClick={addStep}><Plus size={18} /> Add step</button>
            </div>
          </div>
          <div className="step-table">
            {selectedTest.steps.map((step) => (
              <div
                className={`step-row${draggedStepId === step.id ? " dragging" : ""}`}
                key={step.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceStepId = event.dataTransfer.getData("text/plain") || draggedStepId;
                  reorderStep(sourceStepId, step.id);
                  setDraggedStepId("");
                }}
              >
                <span
                  className="drag-handle"
                  draggable
                  role="button"
                  aria-label={`Drag step ${step.stepNumber}`}
                  title="Drag to reorder"
                  onDragStart={(event) => {
                    setDraggedStepId(step.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", step.id);
                  }}
                  onDragEnd={() => setDraggedStepId("")}
                >
                  <GripVertical size={18} />
                </span>
                <div className="step-meta">
                  <strong>{step.stepNumber}</strong>
                  <label>
                    Action
                    <select value={step.actionType} onChange={(event) => updateStepAction(step, event.target.value as ActionType)}>
                      {actionTypes.map((type) => <option key={type} value={type}>{actionLabels[type]}</option>)}
                    </select>
                  </label>
                </div>
                <div className="step-fields">
                  {renderStepActionFields(step)}
                </div>
                <div className="step-actions">
                  <button className="icon-button" title="Insert step below" onClick={() => insertStepAfter(step.id)}><Plus size={16} /></button>
                  <button className="icon-button danger-icon" title="Remove step" onClick={() => deleteStep(step.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  }

  function renderRecorder() {
    if (!selectedTest) {
      return <section className="panel"><button className="primary" onClick={createTest}><Plus size={18} /> New test</button></section>;
    }

    return (
      <div className="recorder-layout">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Record steps</h2>
            </div>
            <button className="primary" disabled={runningTestId === selectedTest.id} onClick={() => runTest(selectedTest)}>
              <Play size={18} /> {runningTestId === selectedTest.id ? "Playing" : "Playback"}
            </button>
          </div>

          <div className="form-grid">
            <label>Test<input value={selectedTest.title} onChange={(event) => updateSelectedTest({ title: event.target.value })} /></label>
            <label>Base URL<input value={selectedTest.baseUrl ?? ""} onChange={(event) => updateSelectedTest({ baseUrl: event.target.value })} /></label>
            <label>Action<select value={recorderDraft.actionType} onChange={(event) => updateRecorderAction(event.target.value as ActionType)}>{actionTypes.map((type) => <option key={type} value={type}>{actionLabels[type]}</option>)}</select></label>
            {renderRecorderActionFields()}
          </div>

          <div className="recorder-actions">
            <button className="primary" onClick={recordDraftStep}><Plus size={18} /> Record step</button>
            <button className="secondary" onClick={() => setRecorderDraft(emptyRecorderDraft())}>Clear</button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>Recorded playback script</h2>
            <span className="badge neutral">{selectedTest.steps.length} steps</span>
          </div>
          <div className="recorded-steps">
            {selectedTest.steps.map((step) => (
              <div className="recorded-step" key={step.id}>
                <strong>{step.stepNumber}</strong>
                <span>{actionLabels[step.actionType]}</span>
                <small>{stepDetailText(step)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderVariablesField(
    variables: Record<string, string>,
    onChange: (variables: Record<string, string>) => void,
    label = "Variables (key=value)"
  ) {
    return <VariablesField variables={variables} onChange={onChange} label={label} />;
  }

  function renderEnvironments() {
    return (
      <div className="config-layout">
        <section className="panel config-panel">
          <div className="panel-title">
            <h2>Environment config</h2>
            <button className="secondary" onClick={addEnvironment}><Plus size={18} /> Add environment</button>
          </div>
          <div className="config-list">
            {environments.map((environment) => (
              <div className="config-card" key={environment.id}>
                <div className="form-grid">
                  <label>Name<input value={environment.name} onChange={(event) => setEnvironments((current) => current.map((item) => item.id === environment.id ? { ...item, name: event.target.value } : item))} /></label>
                  <label>Base URL<input value={environment.baseUrl} onChange={(event) => setEnvironments((current) => current.map((item) => item.id === environment.id ? { ...item, baseUrl: event.target.value } : item))} /></label>
                  <label>API URL<input value={environment.apiUrl} onChange={(event) => setEnvironments((current) => current.map((item) => item.id === environment.id ? { ...item, apiUrl: event.target.value } : item))} /></label>
                  <label className="wide-field">Database URL<input value={environment.dbUrl} onChange={(event) => setEnvironments((current) => current.map((item) => item.id === environment.id ? { ...item, dbUrl: event.target.value } : item))} /></label>
                  {renderVariablesField(environment.variables, (variables) => setEnvironments((current) => current.map((item) => item.id === environment.id ? { ...item, variables } : item)))}
                </div>
                <div className="config-actions">
                  <button className="secondary" onClick={() => setSelectedEnvironmentId(environment.id)}>Use</button>
                  <button className="icon-button danger-icon" title="Delete environment" onClick={() => deleteEnvironment(environment.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderTestData() {
    return (
      <div className="config-layout">
        <section className="panel config-panel">
          <div className="panel-title">
            <h2>Test data</h2>
            <button className="secondary" onClick={addDataSet}><Plus size={18} /> Add data</button>
          </div>
          <div className="config-list">
            {dataSets.map((dataSet) => (
              <div className="config-card" key={dataSet.id}>
                <div className="form-grid">
                  <label>Name<input value={dataSet.name} onChange={(event) => setDataSets((current) => current.map((item) => item.id === dataSet.id ? { ...item, name: event.target.value } : item))} /></label>
                </div>
                <div className="excel-table-wrap">
                  <table className="excel-table">
                    <thead>
                      <tr>
                        <th>Run</th>
                        <th>Row name</th>
                        {dataColumnNames(dataSet).map((column) => (
                          <th key={column}>
                            <span>{column}</span>
                            <button className="icon-button danger-icon" title={`Delete ${column}`} onClick={() => deleteDataColumn(dataSet.id, column)}><Trash2 size={14} /></button>
                          </th>
                        ))}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataRowsForDataSet(dataSet).map((row) => (
                        <tr key={row.id}>
                          <td><input type="checkbox" checked={row.enabled} onChange={(event) => updateDataRow(dataSet.id, row.id, { enabled: event.target.checked })} /></td>
                          <td><input value={row.name} onChange={(event) => updateDataRow(dataSet.id, row.id, { name: event.target.value })} /></td>
                          {dataColumnNames(dataSet).map((column) => (
                            <td key={column}>
                              <input value={row.variables[column] ?? ""} onChange={(event) => updateDataCell(dataSet.id, row.id, column, event.target.value)} />
                            </td>
                          ))}
                          <td><button className="icon-button danger-icon" title="Delete data row" onClick={() => deleteDataRow(dataSet.id, row.id)}><Trash2 size={16} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="config-actions">
                  <button className="secondary" onClick={() => setSelectedDataSetId(dataSet.id)}>Use</button>
                  <button className="secondary" onClick={() => addDataRow(dataSet.id)}><Plus size={18} /> Add row</button>
                  <button className="secondary" onClick={() => addDataColumn(dataSet.id)}><Plus size={18} /> Add column</button>
                  <button className="secondary" onClick={() => exportDataSet(dataSet)}><Download size={18} /> Export CSV</button>
                  <button className="icon-button danger-icon" title="Delete data set" onClick={() => deleteDataSet(dataSet.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel config-panel">
          <div className="panel-title">
            <h2>Scenario data</h2>
            <button className="secondary" onClick={addScenarioData}><Plus size={18} /> Add scenario</button>
          </div>
          <div className="config-list">
            {scenarioData.map((scenario) => (
              <div className="config-card" key={scenario.id}>
                <div className="form-grid">
                  <label>Name<input value={scenario.name} onChange={(event) => setScenarioData((current) => current.map((item) => item.id === scenario.id ? { ...item, name: event.target.value } : item))} /></label>
                  {renderVariablesField(scenario.variables, (variables) => setScenarioData((current) => current.map((item) => item.id === scenario.id ? { ...item, variables } : item)))}
                </div>
                <div className="config-actions">
                  <button className="secondary" onClick={() => setSelectedScenarioId(scenario.id)}>Use</button>
                  <button className="icon-button danger-icon" title="Delete scenario data" onClick={() => deleteScenarioData(scenario.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderUtilities() {
    return (
      <div className="config-layout">
        <section className="panel config-panel">
          <div className="panel-title">
            <h2>Reusable utilities</h2>
            <button className="secondary" onClick={createUtilityFromSelectedTest}><Save size={18} /> Save selected test</button>
          </div>
          <div className="config-list">
            {utilities.map((utility) => (
              <div className="config-card utility-card" key={utility.id}>
                <div className="form-grid">
                  <label>Name<input value={utility.name} onChange={(event) => setUtilities((current) => current.map((item) => item.id === utility.id ? { ...item, name: event.target.value, updatedAt: new Date().toISOString() } : item))} /></label>
                  <label>Description<input value={utility.description} onChange={(event) => setUtilities((current) => current.map((item) => item.id === utility.id ? { ...item, description: event.target.value, updatedAt: new Date().toISOString() } : item))} /></label>
                </div>
                <div className="utility-steps">
                  {utility.steps.map((step) => (
                    <div className="utility-step" key={step.id}>
                      <strong>{step.stepNumber}</strong>
                      <span>{actionLabels[step.actionType]}</span>
                      <small>{stepDetailText(step)}</small>
                    </div>
                  ))}
                </div>
                <div className="config-actions">
                  <button className="secondary" onClick={() => insertUtility(utility)}>Insert</button>
                  <button className="secondary" onClick={() => updateUtilityFromSelectedTest(utility.id)}>Replace from selected test</button>
                  <button className="icon-button danger-icon" title="Delete utility" onClick={() => setUtilities((current) => current.filter((item) => item.id !== utility.id))}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderSuites() {
    return (
      <div className="suite-grid">
        {suites.map((suite) => (
          <section className="panel suite-panel" key={suite.id}>
            <div className="panel-title">
              <h2>{suite.name}</h2>
              <span className="badge neutral">{suite.suiteType}</span>
            </div>
            <div className="suite-tests">
              {tests.map((test) => (
                <label key={test.id} className="suite-check">
                  <input type="checkbox" checked={suite.testCaseIds.includes(test.id)} onChange={() => toggleSuiteTest(suite.id, test.id)} />
                  <span>{test.title}</span>
                </label>
              ))}
            </div>
            <button className="primary" onClick={() => suite.testCaseIds.forEach((id) => {
              const test = tests.find((item) => item.id === id);
              if (test) runTest(test, "PASSED");
            })}><Play size={18} /> Run suite</button>
          </section>
        ))}
      </div>
    );
  }

  function renderRuns() {
    return (
      <>
        {selectedRun && renderRunDetail(selectedRun)}
        <div className="run-control-grid">
          <section className="panel">
            <div className="panel-title">
              <h2>Jenkins build</h2>
              <button className="primary" onClick={triggerJenkinsBuild}><Play size={18} /> Queue build</button>
            </div>
            <div className="form-grid">
              <label>Jenkins URL<input value={jenkinsConfig.url} onChange={(event) => setJenkinsConfig((current) => ({ ...current, url: event.target.value }))} /></label>
              <label>Job name<input value={jenkinsConfig.jobName} onChange={(event) => setJenkinsConfig((current) => ({ ...current, jobName: event.target.value }))} /></label>
              <label>Branch<input value={jenkinsConfig.branch} onChange={(event) => setJenkinsConfig((current) => ({ ...current, branch: event.target.value }))} /></label>
              <label className="wide-field">Token<input value={jenkinsConfig.token} onChange={(event) => setJenkinsConfig((current) => ({ ...current, token: event.target.value }))} /></label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <h2>Schedules</h2>
              <button className="secondary" onClick={addSchedule}><Plus size={18} /> Add schedule</button>
            </div>
            <div className="schedule-list">
              {schedules.map((schedule) => (
                <div className="schedule-row" key={schedule.id}>
                  <label>Name<input value={schedule.name} onChange={(event) => updateSchedule(schedule.id, { name: event.target.value })} /></label>
                  <label>Test<select value={schedule.testCaseId} onChange={(event) => updateSchedule(schedule.id, { testCaseId: event.target.value })}>
                    {tests.map((test) => <option key={test.id} value={test.id}>{test.title}</option>)}
                  </select></label>
                  <label>Cadence<select value={schedule.cadence} onChange={(event) => updateSchedule(schedule.id, { cadence: event.target.value as ScheduleConfig["cadence"] })}>
                    {["Hourly", "Daily", "Weekly"].map((cadence) => <option key={cadence}>{cadence}</option>)}
                  </select></label>
                  <label>Time<input type="time" value={schedule.time} onChange={(event) => updateSchedule(schedule.id, { time: event.target.value })} /></label>
                  <label className="check"><input type="checkbox" checked={schedule.enabled} onChange={(event) => updateSchedule(schedule.id, { enabled: event.target.checked })} /> Enabled</label>
                  <button className="secondary" onClick={() => queueSchedule(schedule)}>Run now</button>
                  <button className="icon-button danger-icon" title="Delete schedule" onClick={() => setSchedules((current) => current.filter((item) => item.id !== schedule.id))}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="panel">
          <div className="panel-title">
            <h2>Run history</h2>
            <button className="secondary" onClick={() => runs[0] && exportRun(runs[0])}><Download size={18} /> Export latest</button>
          </div>
          <RunTable runs={runs} selectedRunId={selectedRunId} onSelect={(run) => setSelectedRunId(run.id)} onExport={exportRun} />
        </section>
      </>
    );
  }

  function renderRunDetail(run: RunRecord) {
    const stepResults = run.stepResults ?? [];
    const passedSteps = stepResults.filter((step) => step.status === "PASSED").length;
    const failedSteps = stepResults.filter((step) => step.status === "FAILED").length;
    const skippedSteps = stepResults.filter((step) => step.status === "SKIPPED").length;

    return (
      <section className={`run-detail ${run.status.toLowerCase()}`}>
        <div className="run-detail-header">
          <div>
            <StatusBadge status={run.status} />
            <h2>{run.testTitle}</h2>
            <p>{run.id} · {run.browser} · {run.environment} · {formatMs(run.durationMs)}</p>
            <p>{run.triggerSource ?? "UI"}{run.dataSetName ? ` · ${run.dataSetName}` : ""}{run.dataRowName ? ` · ${run.dataRowName}` : ""}</p>
          </div>
          <div className="run-mode">
            <span>Execution</span>
            <strong>{executionLabel(run.executionMode)}</strong>
          </div>
        </div>

        <div className="step-summary-grid">
          <div className="metric success"><span>Passed steps</span><strong>{passedSteps}</strong></div>
          <div className="metric danger"><span>Failed steps</span><strong>{failedSteps}</strong></div>
          <div className="metric warn"><span>Skipped steps</span><strong>{skippedSteps}</strong></div>
          <div className="metric"><span>Total steps</span><strong>{stepResults.length}</strong></div>
        </div>

        {run.jenkinsBuild && (
          <div className="trace-result">
            <span>Jenkins</span>
            <a className="text-button" href={run.jenkinsBuild} target="_blank" rel="noreferrer">Open queued build</a>
          </div>
        )}

        {(run.video || run.trace) && (
          <div className="run-media">
            {run.video && (
              <div className="video-result">
                <div className="media-title">
                  <h3>Video result</h3>
                  <a className="text-button" href={run.video} target="_blank" rel="noreferrer">Open video</a>
                </div>
                <video controls src={run.video} />
              </div>
            )}
            {run.trace && (
              <div className="trace-result">
                <span>Trace</span>
                <a className="text-button" href={run.trace} target="_blank" rel="noreferrer">Open trace file</a>
              </div>
            )}
          </div>
        )}

        <div className="step-results">
          <div className="step-results-head">
            <span>#</span><span>Action</span><span>Locator</span><span>Expected</span><span>Status</span><span>Duration</span><span>Screenshot</span><span>Message</span>
          </div>
          {stepResults.length ? (
            stepResults.map((step) => (
              <div className={`step-result-row ${step.status.toLowerCase()}`} key={`${run.id}-${step.stepId}`}>
                <strong>{step.stepNumber}</strong>
                <span>{actionLabels[step.actionType]}</span>
                <span>{step.locatorType ? `${step.locatorType}: ${step.locatorValue}` : "-"}</span>
                <span>{step.expectedResult || "-"}</span>
                <span><StatusBadge status={step.status} /></span>
                <span>{formatMs(step.durationMs)}</span>
                <span>
                  {step.screenshot ? (
                    <a className="text-button" href={step.screenshot} target="_blank" rel="noreferrer" title={step.screenshot}>
                      View evidence
                    </a>
                  ) : "-"}
                </span>
                <span>{step.message}</span>
              </div>
            ))
          ) : (
            <div className="step-result-empty">
              <XCircle size={18} />
              <span>No step detail was captured for this sample run.</span>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderDebug() {
    if (!latestFailedRun) {
      return (
        <section className="empty-state">
          <CheckCircle2 size={42} />
          <h2>No failed runs</h2>
        </section>
      );
    }

    const test = tests.find((item) => item.id === latestFailedRun.testCaseId);
    const failedStep = test?.steps.find((step) => step.id === latestFailedRun.failedStepId);

    return (
      <>
        <section className="debug-hero">
          <div>
            <StatusBadge status={latestFailedRun.status} />
            <h2>{latestFailedRun.testTitle}</h2>
            <p>{latestFailedRun.error}</p>
          </div>
          <div className="debug-actions">
            {test && <button className="primary" onClick={() => runTest(test, "PASSED")}><Play size={18} /> Rerun test</button>}
            {test && <button className="secondary" onClick={() => runTest(test, "PASSED")}><Play size={18} /> Rerun step</button>}
          </div>
        </section>

        <section className="panel">
          <div className="debug-grid">
            <label>Failed step<input value={failedStep ? `${failedStep.stepNumber}. ${failedStep.actionType}` : ""} readOnly /></label>
            <label>Locator type<input value={failedStep?.locatorType ?? ""} readOnly /></label>
            <label className="wide">Locator value<input value={failedStep?.locatorValue ?? ""} onChange={(event) => failedStep && updateStep(failedStep.id, { locatorValue: event.target.value })} /></label>
            <label className="wide">Error<input value={latestFailedRun.error ?? ""} readOnly /></label>
            <label>Screenshot<input value={latestFailedRun.screenshot ?? ""} readOnly /></label>
            <label>Trace<input value={latestFailedRun.trace ?? ""} readOnly /></label>
            <label>Video<input value={latestFailedRun.video ?? ""} readOnly /></label>
          </div>
        </section>
      </>
    );
  }

  function renderReports() {
    return (
      <section className="panel">
        <div className="panel-title">
          <h2>Reports</h2>
          <button className="secondary" onClick={() => runs.forEach(exportRun)}><Download size={18} /> Export CSV</button>
        </div>
        <table>
          <thead><tr><th>Run</th><th>Test</th><th>Status</th><th>HTML</th><th>Trace</th><th>Video</th><th>CSV</th></tr></thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.id}</td>
                <td>{run.testTitle}</td>
                <td><StatusBadge status={run.status} /></td>
                <td><button className="text-button">Open</button></td>
                <td>{run.trace ? <button className="text-button">Trace</button> : "-"}</td>
                <td>{run.video ? <a className="text-button" href={run.video} target="_blank" rel="noreferrer">Video</a> : "-"}</td>
                <td><button className="icon-button" title="Export CSV" onClick={() => exportRun(run)}><Download size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  function renderPage() {
    if (page === "dashboard") return renderDashboard();
    if (page === "tests") return renderTestLibrary();
    if (page === "builder") return renderBuilder();
    if (page === "recorder") return renderRecorder();
    if (page === "environments") return renderEnvironments();
    if (page === "testdata") return renderTestData();
    if (page === "utilities") return renderUtilities();
    if (page === "suites") return renderSuites();
    if (page === "runs") return renderRuns();
    if (page === "debug") return renderDebug();
    return renderReports();
  }

  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <span>PN</span>
          <strong>Prudent QA</strong>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}>
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <main>
        <header>
          <div>
            <h1>{navItems.find((item) => item.id === page)?.label}</h1>
            <span className="subline">{tests.length} tests · {suites.length} suites · {runs.length} runs</span>
          </div>
          <button className="primary" onClick={createTest}><Plus size={18} /> New test</button>
        </header>
        {renderPage()}
      </main>
    </div>
  );
}

function RunTable({
  runs,
  selectedRunId,
  onSelect,
  onExport
}: {
  runs: RunRecord[];
  selectedRunId?: string;
  onSelect?: (run: RunRecord) => void;
  onExport?: (run: RunRecord) => void;
}) {
  return (
    <table>
      <thead>
        <tr><th>Run</th><th>Test</th><th>Suite</th><th>Status</th><th>Source</th><th>Data</th><th>Browser</th><th>Environment</th><th>Duration</th><th>Started</th><th></th></tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id} className={run.id === selectedRunId ? "selected-row" : ""}>
            <td>
              {onSelect ? <button className="text-button" onClick={() => onSelect(run)}>{run.id}</button> : run.id}
            </td>
            <td>{run.testTitle}</td>
            <td>{run.suiteName}</td>
            <td><StatusBadge status={run.status} /></td>
            <td>{run.triggerSource ?? "UI"}</td>
            <td>{run.dataRowName ?? run.dataSetName ?? "-"}</td>
            <td>{run.browser}</td>
            <td>{run.environment}</td>
            <td>{formatMs(run.durationMs)}</td>
            <td>{formatDate(run.startedAt)}</td>
            <td>{onExport && <button className="icon-button" title="Export CSV" onClick={() => onExport(run)}><Download size={16} /></button>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default App;
