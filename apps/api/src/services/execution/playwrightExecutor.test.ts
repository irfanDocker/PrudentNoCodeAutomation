import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { resolveLocator } from "./locatorFactory.js";

describe("resolveLocator", () => {
  it("resolves semantic text locators", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent("<button>Save test</button>");

    const locator = resolveLocator(page, {
      stepNumber: 1,
      actionType: "click",
      locatorType: "text",
      locatorValue: "Save test"
    });

    await expect(locator?.count()).resolves.toBe(1);
    await browser.close();
  });
});

