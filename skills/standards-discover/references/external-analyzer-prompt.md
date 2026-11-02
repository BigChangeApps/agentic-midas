# External Standards Analyzer — Subagent Prompt Template

Analyze CI pipelines and pre-commit hooks to discover the standards automation enforces. Pull request review comments are mined separately (`pr-batch-miner-prompt.md`).

## Inputs

- Area: `[area]` (paths, or "whole repo")
- Output file: `[output_file]`

## Sources

### 1. CI pipelines

- Azure Pipelines: `azure-pipelines*.yml` at any depth, `build/**/*.yml`, `.azuredevops/**`, and the template repos they reference (note the template name; don't fetch it)
- Others if present: `.github/workflows/*.yml`, `Jenkinsfile`

Extract the concrete gates: build configuration, which test projects or filters run, coverage thresholds, analyzers or `TreatWarningsAsErrors`, security scans (Trivy, dependency checks), required stages before release. With an area, prefer the pipelines that build it.

### 2. Pre-commit hooks

`.husky/`, `.pre-commit-config.yaml`, `lint-staged`, `.config/dotnet-tools.json` tools run as hooks (e.g. `dotnet format`, `husky.net`). Extract the mandatory checks and commit message rules.

## Confidence Ranges

| Source | Confidence | Why |
|--------|-----------|-----|
| CI-enforced | 85-95 | Automation enforces it |
| Pre-commit hooks | 80-90 | Enforced on each commit |

## Output Format

Write YAML to `[output_file]`:

```yaml
pipelines_read: ["azure-pipelines.yml", "build/stages/deploy-service.yml"]
findings:
  - category: "[category/subcategory]"
    standard_name: "[Short Name]"
    description: "[What the standard requires]"
    confidence: [80-95]
    evidence:
      - "azure-pipelines.yml: Build stage runs dotnet test on the whole .slnx"
    source: "[ci-config|pre-commit]"
    examples: []
```

## Rules

- Never fail on a missing source: record what was absent and continue.
- Be specific: "PR builds run `dotnet test` on the whole .slnx" — not "runs tests".
- Read only. Write nothing but `[output_file]`.
