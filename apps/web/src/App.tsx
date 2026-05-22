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
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { actionTypes, initialRuns, initialSuites, initialTests, locatorTypes, suiteTypes } from "./lib/mockData";
import type { ActionType, LocatorType, RunRecord, SuiteType, TestCase, TestStep, TestSuite } from "./lib/types";

type Page = "dashboard" | "tests" | "builder" | "suites" | "runs" | "debug" | "reports";

const storageKeys = {
  tests: "prudent.tests",
  suites: "prudent.suites",
  runs: "prudent.runs"
};

const navItems: Array<{ id: Page; label: string; icon: typeof Activity }> = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "tests", label: "Tests", icon: ClipboardList },
  { id: "builder", label: "Builder", icon: Settings2 },
  { id: "suites", label: "Suites", icon: Layers3 },
  { id: "runs", label: "Runs", icon: Play },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "reports", label: "Reports", icon: FileText }
];

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

  function runTest(test: TestCase, forcedStatus?: RunRecord["status"]) {
    const status = forcedStatus ?? (test.title.toLowerCase().includes("invoice") ? "FAILED" : "PASSED");
    const failedStep = status === "FAILED" ? test.steps[test.steps.length - 1] : undefined;
    const run: RunRecord = {
      id: uid("run"),
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
              : `${step.actionType} completed`
        };
      }),
      failedStepId: failedStep?.id,
      error: status === "FAILED" ? `Timeout waiting for ${failedStep?.locatorType || "locator"}=${failedStep?.locatorValue || "value"}` : undefined,
      screenshot: status === "FAILED" ? `artifacts/runs/${uid("run")}/failed-step-${failedStep?.stepNumber}.png` : undefined,
      trace: status === "FAILED" ? "artifacts/runs/latest/trace.zip" : undefined,
      video: status === "FAILED" ? "artifacts/runs/latest/videos/page.webm" : undefined
    };
    setRuns((current) => [run, ...current]);
    setSelectedRunId(run.id);
    setPage(status === "FAILED" ? "debug" : "runs");
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
                  <button className="icon-button" title="Run" onClick={() => runTest(test)}><Play size={17} /></button>
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
            <label>Group<select value={selectedTest.groupType} onChange={(event) => updateSelectedTest({ groupType: event.target.value as SuiteType })}>{suiteTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Priority<select value={selectedTest.priority} onChange={(event) => updateSelectedTest({ priority: event.target.value as TestCase["priority"] })}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Status<select value={selectedTest.status} onChange={(event) => updateSelectedTest({ status: event.target.value as TestCase["status"] })}>{["DRAFT", "READY", "ARCHIVED"].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Tags<input value={selectedTest.tags.join(", ")} onChange={(event) => updateSelectedTest({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label>
          </div>
          <div className="run-options">
            <label>Browser<select value={browser} onChange={(event) => setBrowser(event.target.value as RunRecord["browser"])}>{["chromium", "chrome", "firefox", "webkit"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="check"><input type="checkbox" checked={headless} onChange={(event) => setHeadless(event.target.checked)} /> Headless</label>
            <button className="primary" onClick={() => runTest(selectedTest)}><Play size={18} /> Run now</button>
            <button className="secondary"><Save size={18} /> Save</button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>Steps</h2>
            <button className="secondary" onClick={addStep}><Plus size={18} /> Add step</button>
          </div>
          <div className="step-table">
            <div className="step-head">
              <span>#</span><span>Action</span><span>Locator type</span><span>Locator value</span><span>Input</span><span>Expected</span><span>Wait</span><span>Timeout</span><span></span>
            </div>
            {selectedTest.steps.map((step) => (
              <div className="step-row" key={step.id}>
                <strong>{step.stepNumber}</strong>
                <select value={step.actionType} onChange={(event) => updateStep(step.id, { actionType: event.target.value as ActionType })}>{actionTypes.map((type) => <option key={type}>{type}</option>)}</select>
                <select value={step.locatorType} onChange={(event) => updateStep(step.id, { locatorType: event.target.value as LocatorType | "" })}>
                  <option value="">none</option>
                  {locatorTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
                <input value={step.locatorValue} onChange={(event) => updateStep(step.id, { locatorValue: event.target.value })} />
                <input value={step.inputValue} onChange={(event) => updateStep(step.id, { inputValue: event.target.value })} />
                <input value={step.expectedResult} onChange={(event) => updateStep(step.id, { expectedResult: event.target.value })} />
                <input type="number" value={step.waitMs} onChange={(event) => updateStep(step.id, { waitMs: event.target.value ? Number(event.target.value) : "" })} />
                <input type="number" value={step.timeoutMs} onChange={(event) => updateStep(step.id, { timeoutMs: event.target.value ? Number(event.target.value) : "" })} />
                <button className="icon-button danger-icon" title="Remove step" onClick={() => deleteStep(step.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      </>
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
            <strong>{run.executionMode === "PLAYWRIGHT_API" ? "Playwright API" : "UI demo"}</strong>
          </div>
        </div>

        <div className="step-results">
          <div className="step-results-head">
            <span>#</span><span>Action</span><span>Locator</span><span>Expected</span><span>Status</span><span>Duration</span><span>Message</span>
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
                <td>{run.video ? <button className="text-button">Video</button> : "-"}</td>
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
