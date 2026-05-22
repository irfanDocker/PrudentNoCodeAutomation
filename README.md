# Prudent No-Code Automation

Prudent No-Code Automation is an enterprise-oriented MVP for manual QA teams who need to design, organize, execute, debug, and report Playwright tests without writing code.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: Node.js, Express, TypeScript
- Automation engine: Playwright
- Database: MySQL or MariaDB through Prisma
- Admin DB UI: phpMyAdmin through Docker Compose
- CI/CD: CLI and REST API triggers for Jenkins, GitHub Actions, GitLab CI, and Azure DevOps

## Quick Start

```bash
cp .env.example .env
npm install
docker compose up -d mysql phpmyadmin
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

- Web UI: http://localhost:5173
- API health: http://localhost:4000/health
- phpMyAdmin: http://localhost:8080

Seed login:

- Email: `admin@prudentqa.local`
- Password: `PrudentQA!123`

## Common Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run test
npm run ci:smoke
npm --workspace apps/api run cli -- run-suite --suite "Regression Test" --browser firefox --headless true
npm --workspace apps/api run cli -- run-test --test-case-id TEST_CASE_ID --browser chromium --headless false
```

## Deliverables

- Full architecture: [docs/architecture.md](docs/architecture.md)
- Database schema: [docs/database-schema.sql](docs/database-schema.sql)
- API endpoints: [docs/api.md](docs/api.md)
- No-code action catalog: [docs/action-catalog.md](docs/action-catalog.md)
- CI/CD examples: [docs/ci-cd.md](docs/ci-cd.md)
- Implementation roadmap: [docs/roadmap.md](docs/roadmap.md)

## MVP Scope

The current implementation focuses on a production-shaped MVP:

- Test case CRUD with editable step tables
- Suite grouping for smoke, regression, release, sprint, and custom suites
- Dashboard and run history screens
- Debug view with failed step, locator, error, screenshot, trace, and rerun actions
- MySQL/MariaDB schema for users, projects, tests, steps, suites, runs, logs, and artifacts
- Playwright executor that translates UI steps into runtime Playwright commands
- CLI and API triggers that return CI-friendly process exit codes

Future enhancements are documented in the roadmap.
