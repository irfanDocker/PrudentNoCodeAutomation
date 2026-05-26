import type { Locator, Page } from "playwright";
import type { LocatorType, TestStepInput } from "@prudent/shared";

const actionsWithoutLocator = new Set([
  "goto",
  "wait",
  "screenshot",
  "get_page_title",
  "string_contains",
  "assert_url_equals",
  "assert_url_contains",
  "assert_number_compare",
  "switch_to_frame",
  "database_connection",
  "api_call",
  "schema_validation",
  "json_validation"
]);

function parseRole(value: string) {
  const [role, ...nameParts] = value.split(":");
  const name = nameParts.join(":").trim();

  return {
    role: role.trim() || "button",
    name: name || undefined
  };
}

export function resolveLocator(page: Page, step: TestStepInput): Locator | null {
  if (actionsWithoutLocator.has(step.actionType)) {
    return null;
  }

  if (!step.locatorType || !step.locatorValue) {
    throw new Error(`Step ${step.stepNumber} requires locator type and locator value`);
  }

  const value = step.locatorValue.trim();
  const locatorType = step.locatorType as LocatorType;

  switch (locatorType) {
    case "css":
      return page.locator(value);
    case "xpath":
      return page.locator(value.startsWith("xpath=") ? value : `xpath=${value}`);
    case "text":
      return page.getByText(value, { exact: false });
    case "role": {
      const parsed = parseRole(value);
      return page.getByRole(parsed.role as never, parsed.name ? { name: parsed.name } : undefined);
    }
    case "label":
      return page.getByLabel(value, { exact: false });
    case "placeholder":
      return page.getByPlaceholder(value, { exact: false });
    default:
      throw new Error(`Unsupported locator type: ${locatorType}`);
  }
}
