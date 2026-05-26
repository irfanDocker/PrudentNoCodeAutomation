import fs from "fs-extra";
import net from "node:net";
import path from "node:path";
import type { FrameLocator, Locator, Page } from "playwright";
import type { RunOptions, TestStepInput } from "@prudent/shared";

type LocatorRoot = Page | FrameLocator;

export interface ExecutionState {
  frameSelector?: string;
}

export function createExecutionState(): ExecutionState {
  return {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return undefined;
}

function normalizeBaseUrl(baseUrl: string | null | undefined) {
  if (!baseUrl) return "";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function resolveNavigationUrl(baseUrl: string | null | undefined, inputValue: string | null | undefined) {
  const target = inputValue?.trim();
  if (!target) {
    throw new Error("goto step requires input value with a URL or path");
  }

  if (/^https?:\/\//i.test(target)) {
    return target;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("Relative goto step requires a base URL");
  }

  return `${normalizedBaseUrl}${target.startsWith("/") ? target : `/${target}`}`;
}

function rootFor(page: Page, state: ExecutionState): LocatorRoot {
  return state.frameSelector ? page.frameLocator(state.frameSelector) : page;
}

function parseRole(value: string) {
  const [role, ...nameParts] = value.split(":");
  const name = nameParts.join(":").trim();

  return {
    role: role.trim() || "button",
    name: name || undefined
  };
}

function resolveFrameSelector(step: TestStepInput) {
  const rawValue = step.locatorValue || step.inputValue;
  if (!rawValue) {
    return undefined;
  }

  if (step.locatorType === "xpath") {
    return rawValue.startsWith("xpath=") ? rawValue : `xpath=${rawValue}`;
  }

  return rawValue;
}

function resolveStepLocator(page: Page, state: ExecutionState, step: TestStepInput): Locator | null {
  if (!step.locatorType || !step.locatorValue) {
    return null;
  }

  const root = rootFor(page, state);
  const value = step.locatorValue.trim();

  switch (step.locatorType) {
    case "css":
      return root.locator(value);
    case "xpath":
      return root.locator(value.startsWith("xpath=") ? value : `xpath=${value}`);
    case "text":
      return root.getByText(value, { exact: false });
    case "role": {
      const parsed = parseRole(value);
      return root.getByRole(parsed.role as never, parsed.name ? { name: parsed.name } : undefined);
    }
    case "label":
      return root.getByLabel(value, { exact: false });
    case "placeholder":
      return root.getByPlaceholder(value, { exact: false });
    default:
      throw new Error(`Unsupported locator type: ${step.locatorType}`);
  }
}

function requireLocator(page: Page, state: ExecutionState, step: TestStepInput) {
  const locator = resolveStepLocator(page, state, step);
  if (!locator) {
    throw new Error(`Step ${step.stepNumber} requires locator type and locator value`);
  }
  return locator;
}

async function verifyText(page: Page, state: ExecutionState, step: TestStepInput, timeoutMs: number) {
  const expected = step.expectedResult || step.inputValue || step.locatorValue;
  if (!expected) {
    throw new Error(`Step ${step.stepNumber} verify_text requires expected result or input value`);
  }

  const locator = resolveStepLocator(page, state, step);
  if (locator) {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    const text = (await locator.textContent({ timeout: timeoutMs })) ?? "";
    if (!text.includes(expected)) {
      throw new Error(`Expected locator text to include "${expected}", received "${text}"`);
    }
    return;
  }

  await rootFor(page, state).getByText(expected, { exact: false }).waitFor({ state: "visible", timeout: timeoutMs });
}

function requireExpected(step: TestStepInput, label = "Expected result") {
  const expected = step.expectedResult?.trim();
  if (!expected) {
    throw new Error(`${label} is required`);
  }
  return expected;
}

function compareNumbers(actual: number, comparator: string, expected: number) {
  switch (comparator.trim()) {
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    case "!=":
    case "!==":
    case "not equals":
      return actual !== expected;
    case "=":
    case "==":
    case "===":
    case "equals":
    default:
      return actual === expected;
  }
}

function parseJson(value: string | null | undefined, label: string) {
  if (!value) {
    throw new Error(`${label} is required`);
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : "Invalid JSON"}`);
  }
}

function isSubset(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((item, index) => isSubset(item, actual[index]));
  }

  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) => isSubset(value, (actual as Record<string, unknown>)[key]));
  }

  return Object.is(expected, actual);
}

function validateJsonSchema(schema: unknown, data: unknown, pathLabel = "$") {
  const schemaRecord = asRecord(schema);
  const type = asString(schemaRecord.type);

  if (type === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error(`${pathLabel} should be an object`);
    }

    const dataRecord = data as Record<string, unknown>;
    const required = Array.isArray(schemaRecord.required) ? schemaRecord.required : [];
    for (const key of required) {
      if (typeof key === "string" && !(key in dataRecord)) {
        throw new Error(`${pathLabel}.${key} is required`);
      }
    }

    const properties = asRecord(schemaRecord.properties);
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in dataRecord) {
        validateJsonSchema(childSchema, dataRecord[key], `${pathLabel}.${key}`);
      }
    }
    return;
  }

  if (type === "array") {
    if (!Array.isArray(data)) throw new Error(`${pathLabel} should be an array`);
    const itemSchema = schemaRecord.items;
    if (itemSchema) {
      data.forEach((item, index) => validateJsonSchema(itemSchema, item, `${pathLabel}[${index}]`));
    }
    return;
  }

  if (type === "string" && typeof data !== "string") throw new Error(`${pathLabel} should be a string`);
  if (type === "number" && typeof data !== "number") throw new Error(`${pathLabel} should be a number`);
  if (type === "boolean" && typeof data !== "boolean") throw new Error(`${pathLabel} should be a boolean`);
}

async function verifyDatabaseConnection(step: TestStepInput) {
  const connectionString = step.inputValue || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Database connection action requires input value or DATABASE_URL");
  }

  const url = new URL(connectionString);
  const port = Number(url.port || (url.protocol.startsWith("postgres") ? 5432 : 3306));

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: url.hostname, port, timeout: 5000 });
    socket.once("connect", () => {
      socket.end();
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${url.hostname}:${port}`));
    });
    socket.once("error", reject);
  });

  return `Database endpoint ${url.hostname}:${port} is reachable`;
}

async function performApiCall(step: TestStepInput) {
  const metadata = asRecord(step.metadata);
  const url = step.inputValue || asString(metadata.url);
  if (!url) {
    throw new Error("API call action requires input value with a URL");
  }

  const method = asString(metadata.method) ?? "GET";
  const headers = asRecord(metadata.headers) as Record<string, string>;
  const body = typeof metadata.body === "string" ? metadata.body : metadata.body ? JSON.stringify(metadata.body) : undefined;
  const response = await fetch(url, { method, headers, body });
  const responseText = await response.text();
  const expectedStatus = asNumber(metadata.expectedStatus) ?? asNumber(step.expectedResult);

  if (expectedStatus && response.status !== expectedStatus) {
    throw new Error(`Expected API status ${expectedStatus}, received ${response.status}`);
  }

  const expectedContains = asString(metadata.expectedContains) ?? (!expectedStatus ? step.expectedResult ?? undefined : undefined);
  if (expectedContains && !responseText.includes(expectedContains)) {
    throw new Error(`Expected API response to contain "${expectedContains}"`);
  }

  return `API ${method} ${url} returned ${response.status}`;
}

export async function executeStepAction(page: Page, state: ExecutionState, step: TestStepInput, runDir: string, options: RunOptions) {
  const timeoutMs = step.timeoutMs ?? options.timeoutMs ?? 10000;

  switch (step.actionType) {
    case "loop_start":
    case "loop_end":
    case "if":
    case "else":
    case "end_if":
    case "switch":
    case "case":
    case "default":
    case "end_switch":
      return "Control flow handled";
    case "goto":
      await page.goto(resolveNavigationUrl(options.baseUrl, step.inputValue ?? step.locatorValue), {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs
      });
      return "Navigation completed";
    case "click":
      await requireLocator(page, state, step).click({ timeout: timeoutMs });
      return "Clicked element";
    case "type":
      await requireLocator(page, state, step).fill(step.inputValue ?? "", { timeout: timeoutMs });
      return "Text entered";
    case "select":
      await requireLocator(page, state, step).selectOption(step.inputValue ?? "", { timeout: timeoutMs });
      return "Option selected";
    case "select_by_value":
      await requireLocator(page, state, step).selectOption({ value: step.inputValue ?? "" }, { timeout: timeoutMs });
      return `Selected value ${step.inputValue ?? ""}`;
    case "verify_text":
      await verifyText(page, state, step, timeoutMs);
      return "Text verified";
    case "get_page_title": {
      const title = await page.title();
      if (step.expectedResult && !title.includes(step.expectedResult)) {
        throw new Error(`Expected page title to contain "${step.expectedResult}", received "${title}"`);
      }
      return `Page title: ${title}`;
    }
    case "is_disabled": {
      const disabled = await requireLocator(page, state, step).isDisabled({ timeout: timeoutMs });
      if (!disabled) throw new Error("Expected element to be disabled");
      return "Element is disabled";
    }
    case "is_enabled": {
      const enabled = await requireLocator(page, state, step).isEnabled({ timeout: timeoutMs });
      if (!enabled) throw new Error("Expected element to be enabled");
      return "Element is enabled";
    }
    case "string_contains": {
      const locator = resolveStepLocator(page, state, step);
      const source = locator ? (await locator.textContent({ timeout: timeoutMs })) ?? "" : step.inputValue ?? "";
      const expected = step.expectedResult || step.locatorValue;
      if (!expected) throw new Error("string_contains requires expected result or locator value");
      if (!source.includes(expected)) throw new Error(`Expected "${source}" to contain "${expected}"`);
      return "String contains expected text";
    }
    case "assert_text_equals": {
      const expected = requireExpected(step);
      const text = ((await requireLocator(page, state, step).textContent({ timeout: timeoutMs })) ?? "").trim();
      if (text !== expected) throw new Error(`Expected text to equal "${expected}", received "${text}"`);
      return "Text equals assertion passed";
    }
    case "assert_text_contains": {
      const expected = requireExpected(step);
      const text = (await requireLocator(page, state, step).textContent({ timeout: timeoutMs })) ?? "";
      if (!text.includes(expected)) throw new Error(`Expected text to contain "${expected}", received "${text}"`);
      return "Text contains assertion passed";
    }
    case "assert_value_equals": {
      const expected = requireExpected(step);
      const value = await requireLocator(page, state, step).inputValue({ timeout: timeoutMs });
      if (value !== expected) throw new Error(`Expected value to equal "${expected}", received "${value}"`);
      return "Value equals assertion passed";
    }
    case "assert_visible":
      await requireLocator(page, state, step).waitFor({ state: "visible", timeout: timeoutMs });
      return "Visible assertion passed";
    case "assert_hidden":
      await requireLocator(page, state, step).waitFor({ state: "hidden", timeout: timeoutMs });
      return "Hidden assertion passed";
    case "assert_url_equals": {
      const expected = requireExpected(step, "Expected URL");
      const actual = page.url();
      if (actual !== expected) throw new Error(`Expected URL to equal "${expected}", received "${actual}"`);
      return "URL equals assertion passed";
    }
    case "assert_url_contains": {
      const expected = requireExpected(step, "Expected URL fragment");
      const actual = page.url();
      if (!actual.includes(expected)) throw new Error(`Expected URL to contain "${expected}", received "${actual}"`);
      return "URL contains assertion passed";
    }
    case "assert_number_compare": {
      const actual = Number(step.inputValue);
      const expected = Number(requireExpected(step, "Expected number"));
      const comparator = step.locatorValue || "==";
      if (!Number.isFinite(actual)) throw new Error(`Actual number must be numeric, received "${step.inputValue ?? ""}"`);
      if (!Number.isFinite(expected)) throw new Error(`Expected number must be numeric, received "${step.expectedResult ?? ""}"`);
      if (!compareNumbers(actual, comparator, expected)) {
        throw new Error(`Expected ${actual} ${comparator} ${expected}`);
      }
      return "Number assertion passed";
    }
    case "switch_to_frame": {
      const selector = resolveFrameSelector(step);
      if (!selector || ["main", "default", "page"].includes(selector.toLowerCase())) {
        state.frameSelector = undefined;
        return "Switched to main page";
      }
      state.frameSelector = selector;
      return `Switched to frame ${selector}`;
    }
    case "api_call":
      return performApiCall(step);
    case "json_validation": {
      const actual = parseJson(step.inputValue, "Input value");
      if (step.expectedResult) {
        const expected = parseJson(step.expectedResult, "Expected result");
        if (!isSubset(expected, actual)) {
          throw new Error("JSON did not contain the expected structure/value");
        }
      }
      return "JSON is valid";
    }
    case "schema_validation": {
      const data = parseJson(step.inputValue, "Input value");
      const schema = parseJson(step.expectedResult, "Expected result schema");
      validateJsonSchema(schema, data);
      return "Schema validation passed";
    }
    case "database_connection":
      return verifyDatabaseConnection(step);
    case "wait":
      await page.waitForTimeout(step.waitMs ?? Number(step.inputValue ?? 1000));
      return "Wait completed";
    case "upload_file":
      if (!step.inputValue) {
        throw new Error("upload_file requires input value with a file path");
      }
      await requireLocator(page, state, step).setInputFiles(step.inputValue, { timeout: timeoutMs });
      return "File uploaded";
    case "download_file": {
      const downloadDir = path.join(runDir, "downloads");
      await fs.ensureDir(downloadDir);
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: timeoutMs }),
        requireLocator(page, state, step).click({ timeout: timeoutMs })
      ]);
      const fileName = download.suggestedFilename();
      await download.saveAs(path.join(downloadDir, fileName));
      return `Downloaded ${fileName}`;
    }
    case "screenshot":
      return "Screenshot requested";
    default:
      throw new Error(`Unsupported action type: ${step.actionType}`);
  }
}
