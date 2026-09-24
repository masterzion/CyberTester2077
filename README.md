# CyberTester2077

![CyberTester2077 logo](assets/cybertester2077-logo.png)

CyberTester2077 combines documentation categorization using a local language model
with exploratory Playwright audits of web and responsive mobile interfaces.

## Requirements and installation

Use Node.js compatible with the installed Playwright release, npm, and network access
to your application and configured model endpoint. Browser audits also require
Playwright Chromium. The documentation categorizer does not require a browser.

```powershell
./scripts/install-dependencies.ps1
```

```bash
bash scripts/install-dependencies.sh
```

Use `-SkipBrowser` (PowerShell) or `--skip-browser` (Bash) for documentation-only setup.

## Configuration

Edit `automation_tests/automation-settings.yml`. It contains:

- `web`: app URL, headless mode, page/action limits, action timeout.
- `llm`: endpoint, model name, and the environment-variable name containing the API key.
- `documentation`: source folder, destination folder, and destination file definitions.
- `mobile`: responsive screen profiles and an enabled flag.

`AUTOMATION_SETTINGS` can select another settings file. `MODEL_NAME` and
`MODEL_URL` override YAML for a process. The root PowerShell categorization command
also accepts `-Settings "path/to/settings.yml"`.
Paths in documentation settings resolve relative to the repository root.

Keep documentation settings in the settings file. For compatibility, the categorizer
merges a `documentation` block from local credentials over the settings block;
avoid maintaining two conflicting copies. The browser audit reads its documentation
folder from the settings file.

The configured source folder is read-only. Destination output must be outside it.
Setting `destination_read_write: false` blocks categorizer apply mode.

## Categorize documentation

From the repository root, apply all source documents:

```powershell
./run-categorize-docs.ps1
```

Process a single file relative to `documentation.source_folder`:

```powershell
./run-categorize-docs.ps1 -SourceFile "role-branding.md"
./run-categorize-docs.ps1 -SourceFile "subfolder/example.md" -Preview
```

Preview the whole source folder without writing:

```powershell
./run-categorize-docs.ps1 -Preview
```

PowerShell defaults to apply; `-Apply` remains accepted. Bash and direct Node
commands default to preview and require `--apply` to write:

```bash
bash scripts/run-categorize-docs.sh --source-file role-branding.md --apply
node temporary-categorize-main-docs.cjs --source-file role-branding.md --apply
```

Stage 1 reads selected source Markdown files one at a time and stages model
appendices in memory. Each request includes the allowed filenames, their full
content descriptions, existence status, and current destination content.
Stage 2 merges additions and deduplicates each configured destination in sequence.
Terminal progress bars show both stages. Interrupting stage 1 loses its in-memory
additions; destination files are written during stage 2.

The current ten destinations are:

| File | Scope |
| --- | --- |
| todo.md | Missing functionality, defects, acceptance criteria and dependencies |
| done.md | Documented implementation, architecture, behavior and limitations |
| api.md | Endpoint contracts, schemas, validation and integration behavior |
| implementation_plan.md | Engineering steps, prerequisites, tests and rollout |
| drp.md | Backup, recovery, restore verification and disaster procedures |
| deploy.md | Installation, environment setup, deployment and operations |
| security.md | Security, privacy, safety controls and outstanding requirements |
| role.md | Role responsibilities, permissions and approval workflows |
| model.md | Local-model configuration, reproducible benchmarks, prompt templates and measured prompt optimizations |
| database.md | Database architecture, schemas, relationships, migrations, queries, performance and maintenance |

Change `documentation.destination_files` to change this list. Each item uses
`id`, `file`, and `content`. Apply mode creates missing configured files only
when source-backed additions are returned. It does not require pre-created files.
Preview never creates destination files.

Deduplication currently removes repeated substantial paragraphs after normalizing
whitespace and capitalization. It is not semantic reconciliation: similar passages,
short repeated blocks, and conflicts may remain and require review. The model is
instructed to preserve detail, distinguish implemented work from proposals, and
report uncertainty. Review generated text against its sources before relying on it.

## Credentials and account testing

Create the local ignored credentials file if it does not exist:

```powershell
Copy-Item automation_tests/credentials.yml.example automation_tests/credentials.yml
```

Each account contains `name`, `role`, `description`, `email`, `password_env`,
`runtest_web`, and `runtest_mobile`. Add the named secret variables to the
repository-root `.env` or your process environment. For example:

```dotenv
KIDVERSE_ELZA_PASSWORD=your-test-account-password
LLM_API_KEY=your-endpoint-key
```

The account runner loads `.env`; existing process variables take precedence.
Standalone categorization and report commands currently read API keys from the
process environment, so export the variable named by `llm.api_key_env` for those
commands. Keep secrets out of tracked YAML and logs.

Run the selected accounts:

```powershell
./scripts/run-account-matrix.ps1
./scripts/run-account-matrix.ps1 -Web
./scripts/run-account-matrix.ps1 -Mobile
```

```bash
bash scripts/run-account-matrix.sh
bash scripts/run-account-matrix.sh --web
bash scripts/run-account-matrix.sh --mobile
```

Both flags may be true for an account. It receives one web run and one mobile run
per configured profile, provided `mobile.enabled` is true. Missing passwords
produce skips. The current mobile implementation uses responsive browser viewport
and touch emulation; native APK execution is not implemented. `adb_serial`,
`application_id`, and `density` do not affect these browser runs.

Each audit collects screenshots, page HTML, console events and controls and asks
the model for acceptance tests and exploration suggestions using the account
description. The executor currently uses built-in interactions ordered by model
suggestions; a successful interaction is not proof that every model acceptance
criterion passed. Coverage is bounded by configured limits and excluded actions.

## Results and checks

```text
automation_tests/[timestamp]-[role]/[sanitized-login]/web/
automation_tests/[timestamp]-[role]/[sanitized-login]/mobile-[profile]/
```

Run folders contain screenshots, HTML evidence, inventories, observations, results,
and a generated interactive HTML report when reporting succeeds. The matrix writes
a timestamped JSON manifest. Matrix PASS currently indicates the audit process
finished successfully; inspect individual interaction failures in its report.

Run unit tests with `npm test` or `./scripts/run-tests.ps1`. The lower-level
`audit:ui` and `audit:ui:report` commands use a single account supplied through
process variables; use the account-matrix commands for credentials.yml selection.

The optional `node scripts/smoke-smallest-doc.cjs` command makes a live model
request against a copy of the smallest configured source document. It uses an
isolated timestamped output folder and checks that the original source is unchanged.
It is separate from the unit-test suite.
