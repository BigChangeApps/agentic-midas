# Config Standards Analyzer — Subagent Prompt Template

Analyze project configuration files to discover coding standards and conventions.

## Task

Find and analyze configuration files, extract standards, return structured findings as YAML.

## Configuration Files to Analyze

1. **.NET build configs**: `Directory.Build.props`, `Directory.Packages.props`, `global.json`, `*.csproj`/`*.vbproj` (`Nullable`, `TreatWarningsAsErrors`, `AnalysisLevel`, analyzer packages), `.globalconfig`, `stylecop.json` (note whether the StyleCop package is actually referenced), `nuget.config`, `.config/dotnet-tools.json`
2. **Linter configs**: `.eslintrc.*`, `.prettierrc*`, `pylintrc`, `.pylintrc`, `.rubocop.yml`, `biome.json`
3. **Compiler configs**: `tsconfig.json`, `jsconfig.json`
4. **Package managers**: `package.json` (scripts, conventions), `requirements.txt`, `Gemfile`, `pom.xml`, `go.mod`
5. **Editor configs**: `.editorconfig` — indentation, line endings, charset, and the C# rules (`csharp_style_*`, `dotnet_diagnostic.*.severity`, naming rules); the severity tells whether the build enforces it
6. **Container configs**: `Dockerfile`, `docker-compose.yml`

## What to Extract

For each config file found, extract rules/settings that indicate coding standards:

- **ESLint**: Naming conventions, code style (quotes, semicolons, indentation), framework patterns, import rules
- **Prettier**: Formatting rules (semi, singleQuote, trailingComma, tabWidth, printWidth)
- **TypeScript**: Compiler strictness (strict, noImplicitAny), module resolution, path aliases
- **Package.json**: Script patterns, testing conventions, pre-commit hooks (husky/lint-staged)
- **EditorConfig**: Indentation style/size, charset, line endings, trailing whitespace, C# style and naming rules with their severity
- **MSBuild props**: target framework, nullable, implicit usings, warnings as errors, enforced code style, analyzers
- **Biome**: Combined lint + format rules

Area: `[area]`. In a large repo, read the repo-wide files (root `.editorconfig`, `Directory.Build.props`) and the configs inside the area; skip project files outside it.

## Categorization

Discover existing categories from `.midas/docs/standards/*/`. Baseline categories:
- `global/` — Language-agnostic (indentation, line endings, general error handling)
- `frontend/` — UI-specific (React rules, CSS conventions, component patterns)
- `backend/` — Server-specific (API rules, database conventions)
- `testing/` — Test-related (test frameworks, coverage requirements)

Propose new categories if findings don't fit existing ones.

## Confidence Range

Config-based findings: **70-85%** confidence (explicit configuration = strong evidence).

## Output Format

Return YAML:

```yaml
findings:
  - category: "[category/subcategory]"
    standard_name: "[Short Name]"
    description: "[What the standard requires]"
    confidence: [70-85]
    evidence:
      - "[config-file]: [specific rule or setting]"
    source: "config"
    examples:
      - "[Brief correct example if applicable]"
```

## Rules

- Only include findings with clear evidence from actual config files
- Be specific in descriptions (not "follow ESLint rules" but "use single quotes for strings")
- Include exact file paths in evidence
- Return empty findings list if no config files found
- Focus on actionable, verifiable standards
- Do NOT write any files to the project directory. Write your YAML results to: `[output_file]` (the orchestrator replaces this placeholder with an actual temp file path when invoking you).
