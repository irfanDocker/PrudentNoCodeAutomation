# CI/CD Integration

The platform supports CI through both REST API calls and the `prudent-qa` CLI.

## CLI

```bash
npm --workspace apps/api run cli -- run-suite --suite "Smoke Test" --browser chromium --headless true
npm --workspace apps/api run cli -- run-test --test-case-id TC_ID --browser firefox --headless true
```

The CLI exits with:

- `0` when all tests pass
- `1` when one or more tests fail
- `2` for configuration or API errors

## Jenkins

See [../ci/Jenkinsfile](../ci/Jenkinsfile).

## GitHub Actions

See [../.github/workflows/prudent-tests.yml](../.github/workflows/prudent-tests.yml).

## GitLab CI

See [../ci/gitlab-ci.yml](../ci/gitlab-ci.yml).

## Azure DevOps

See [../ci/azure-pipelines.yml](../ci/azure-pipelines.yml).

