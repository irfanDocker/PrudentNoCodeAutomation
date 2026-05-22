# Implementation Roadmap

## MVP

1. Project setup
   - React web app
   - Express API
   - MySQL/MariaDB Docker Compose
   - Prisma schema and seed data

2. Test management
   - create/edit/delete/duplicate tests
   - no-code step builder
   - suite grouping
   - search and filters

3. Execution
   - run individual tests
   - run suites
   - browser selection
   - headless/headed mode
   - screenshots, trace, video, and HTML summary

4. Results and debug
   - dashboard totals
   - run history
   - step logs
   - failed locator visibility
   - update locator workflow
   - rerun failures

5. CI/CD
   - CLI
   - REST triggers
   - CI examples
   - CI-friendly exit codes

## Future Enhancements

- visual recorder that captures manual clicks into no-code steps
- AI-assisted locator healing
- browser grid and parallel execution
- worker queue with Redis/BullMQ
- SSO with SAML/OIDC
- audit logs and approval workflows
- environment and secret management
- test data management
- scheduled runs
- flaky-test detection
- Jira/Xray/TestRail integrations
- Slack/Teams notifications
- PDF report generation
- full Playwright test-project generation for large suites

