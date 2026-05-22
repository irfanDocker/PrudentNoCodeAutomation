import {
  Activity,
  Bug,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Layers3,
  ListFilter,
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
import { actionLabels, actionTypes, initialRuns, initialSuites, initialTests, locatorTypes, suiteTypes } from "./lib/mockData";
import type { ActionType, LocatorType, RunRecord, SuiteType, TestCase, TestStep, TestSuite } from "./lib/types";

type Page = "dashboard" | "tests" | "builder" | "recorder" | "suites" | "runs" | "debug" | "reports";
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
  runs: "prudent.runs"
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const navItems: Array<{ id: Page; label: string; icon: typeof Activity }> = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "tests", label: "Tests", icon: ClipboardList },
  { id: "builder", label: "Builder", icon: Settings2 },
  { id: "recorder", label: "Recorder", icon: Radio },
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
  const [selectedTestId, setSelectedTestId] = useState(() => readStored(storageKeys.tests, initialTests)[0]?.id ?? "");
  const [selectedRunId, setSelectedRunId] = useState(() => readStored(storageKeys.runs, initialRuns)[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<SuiteType | "ALL">("ALL");
  const [browser, setBrowser] = useState<RunRecord["browser"]>("chromium");
  const [headless, setHeadless] = useState(true);
  const [runningTestId, setRunningTestId] = useState("");
  const [recorderDraft, setRecorderDraft] = useState<Omit<TestStep, "id" | "stepNumber">>(() => emptyRecorderDraft());

  const selectedTest = tests.find((test) => test.id === selectedTestId) ?? tests[0];
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];

  useEffect(() => {
    window.localStorage.setItem(storageKeys.tests, JSON.stringify(tests));
  }, [tests]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.suites, JSON.stringify(suites));
  }, [suites]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.runs, JSON.stringify(runs));
  }, [runs]);

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

  function deleteStep(stepId: string) {
    if (!selectedTest) return;
    updateSelectedTest({
      steps: selectedTest.steps
        .filter((step) => step.id !== stepId)
        .map((step, index) => ({ ...step, stepNumber: index + 1 }))
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
        </label>
      );
    }

    return (
      <label key={field}>
        {label}
        <input placeholder={placeholder} value={value} onChange={(event) => onChange(field, event.target.value)} />
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

  async function runTest(test: TestCase, forcedStatus?: RunRecord["status"]) {
    if (runningTestId) return;

    if (forcedStatus) {
      const demoRun = createDemoRun(test, forcedStatus);
      setRuns((current) => [demoRun, ...current]);
      setSelectedRunId(demoRun.id);
      setPage(demoRun.status === "FAILED" ? "debug" : "runs");
      return;
    }

    setRunningTestId(test.id);

    try {
      const response = await fetch(`${apiBaseUrl}/api/local-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCase: {
            title: test.title,
            baseUrl: test.baseUrl || "",
            steps: test.steps.map((step) => ({
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
            environment: "qa",
            screenshots: true,
            trace: true,
            video: true
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
        testCaseId: test.id,
        testTitle: test.title,
        suiteName: test.groupType === "CUSTOM" ? "Custom Test Suite" : `${test.groupType[0]}${test.groupType.slice(1).toLowerCase()} Test`,
        status: result.status,
        executionMode: "LOCAL_PLAYWRIGHT",
        browser: result.browser,
        environment: result.environment,
        durationMs: result.durationMs,
        startedAt: result.startedAt,
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

      setRuns((current) => [run, ...current]);
      setSelectedRunId(run.id);
      setPage(run.status === "FAILED" ? "debug" : "runs");
    } catch (error) {
      const fallbackRun = createDemoRun(
        test,
        "FAILED",
        `Local Playwright could not run. ${error instanceof Error ? error.message : ""}`
      );
      setRuns((current) => [fallbackRun, ...current]);
      setSelectedRunId(fallbackRun.id);
      setPage(fallbackRun.status === "FAILED" ? "debug" : "runs");
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
            <label>Browser<select value={browser} onChange={(event) => setBrowser(event.target.value as RunRecord["browser"])}>{["chromium", "chrome", "firefox", "webkit"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="check"><input type="checkbox" checked={headless} onChange={(event) => setHeadless(event.target.checked)} /> Headless</label>
            <button className="primary" disabled={runningTestId === selectedTest.id} onClick={() => runTest(selectedTest)}><Play size={18} /> {runningTestId === selectedTest.id ? "Running" : "Run now"}</button>
            <button className="secondary"><Save size={18} /> Save</button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>Steps</h2>
            <button className="secondary" onClick={addStep}><Plus size={18} /> Add step</button>
          </div>
          <div className="step-table">
            {selectedTest.steps.map((step) => (
              <div className="step-row" key={step.id}>
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
                <button className="icon-button danger-icon" title="Remove step" onClick={() => deleteStep(step.id)}><Trash2 size={16} /></button>
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
    return (
      <section className={`run-detail ${run.status.toLowerCase()}`}>
        <div className="run-detail-header">
          <div>
            <StatusBadge status={run.status} />
            <h2>{run.testTitle}</h2>
            <p>{run.id} · {run.browser} · {run.environment} · {formatMs(run.durationMs)}</p>
          </div>
          <div className="run-mode">
            <span>Execution</span>
            <strong>{executionLabel(run.executionMode)}</strong>
          </div>
        </div>

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
          {run.stepResults?.length ? (
            run.stepResults.map((step) => (
              <div className="step-result-row" key={`${run.id}-${step.stepId}`}>
                <strong>{step.stepNumber}</strong>
                <span>{step.actionType}</span>
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
        <tr><th>Run</th><th>Test</th><th>Suite</th><th>Status</th><th>Browser</th><th>Environment</th><th>Duration</th><th>Started</th><th></th></tr>
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
