# API Endpoints

Base URL: `http://localhost:4000/api`

All protected routes use `Authorization: Bearer <token>`.

## Auth

- `POST /auth/login` - login with email and password
- `GET /auth/me` - current user

## Projects

- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`

## Test Cases

- `GET /test-cases?projectId=&search=&groupType=`
- `POST /test-cases`
- `GET /test-cases/:id`
- `PUT /test-cases/:id`
- `DELETE /test-cases/:id`
- `POST /test-cases/:id/duplicate`
- `POST /test-cases/:id/run`

## Test Suites

- `GET /test-suites?projectId=`
- `POST /test-suites`
- `GET /test-suites/:id`
- `PUT /test-suites/:id`
- `DELETE /test-suites/:id`
- `POST /test-suites/:id/test-cases`
- `DELETE /test-suites/:id/test-cases/:testCaseId`
- `POST /test-suites/:id/run`

## Runs and Debugging

- `GET /runs?projectId=&status=&environment=`
- `GET /runs/:id`
- `POST /runs/:id/rerun-failures`
- `GET /runs/:id/export.csv`

## Dashboard

- `GET /dashboard/summary?projectId=`

## CI/CD

- `POST /ci/run-suite`
- `POST /ci/run-test`

Example suite trigger:

```json
{
  "suite": "Smoke Test",
  "projectKey": "PRUDENT",
  "environment": "qa",
  "browser": "chromium",
  "headless": true,
  "tags": ["smoke"]
}
```

