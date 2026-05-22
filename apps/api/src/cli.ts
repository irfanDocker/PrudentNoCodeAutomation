#!/usr/bin/env node
import { Command } from "commander";
import type { BrowserType } from "@prudent/shared";
import { prisma } from "./db/prisma.js";
import { runSuite, runTestCaseById } from "./services/execution/runOrchestrator.js";

function parseBoolean(value: string | boolean | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  return value !== "false";
}

const program = new Command();

program.name("prudent-qa").description("Run no-code Playwright tests from CI/CD").version("0.1.0");

program
  .command("run-suite")
  .requiredOption("--suite <name>", "suite name")
  .option("--project-key <key>", "project key")
  .option("--browser <browser>", "chromium, chrome, firefox, or webkit", "chromium")
  .option("--headless <value>", "true or false", "true")
  .option("--environment <name>", "environment name", "qa")
  .option("--base-url <url>", "override base URL")
  .option("--tags <csv>", "comma-separated tag filter")
  .action(async (options) => {
    try {
      const result = await runSuite({
        suite: options.suite,
        projectKey: options.projectKey,
        browser: options.browser as BrowserType,
        headless: parseBoolean(options.headless),
        environment: options.environment,
        baseUrl: options.baseUrl,
        tags: options.tags ? String(options.tags).split(",").map((tag) => tag.trim()) : undefined
      });

      console.log(JSON.stringify(result, null, 2));
      await prisma.$disconnect();
      process.exit(result.failed > 0 ? 1 : 0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      await prisma.$disconnect();
      process.exit(2);
    }
  });

program
  .command("run-test")
  .requiredOption("--test-case-id <id>", "test case id")
  .option("--browser <browser>", "chromium, chrome, firefox, or webkit", "chromium")
  .option("--headless <value>", "true or false", "true")
  .option("--environment <name>", "environment name", "qa")
  .option("--base-url <url>", "override base URL")
  .action(async (options) => {
    try {
      const result = await runTestCaseById(options.testCaseId, {
        browser: options.browser as BrowserType,
        headless: parseBoolean(options.headless),
        environment: options.environment,
        baseUrl: options.baseUrl
      });

      console.log(JSON.stringify(result, null, 2));
      await prisma.$disconnect();
      process.exit(result.status === "PASSED" ? 0 : 1);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      await prisma.$disconnect();
      process.exit(2);
    }
  });

program.parseAsync();

