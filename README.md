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

Edit the stage prompts directly in `automation_tests/automation-settings.yml`:

```yaml
prompts:
  stage1: |-
    Instructions for detailed documentation classification...
  stage2: |-
    Instructions for identifying duplicated information...
  stage3: |-
    Instructions for comparing documentation with source code...
```

The actual configuration contains the complete prompts, including response schemas.
Preserve those schemas when editing because the scripts validate the responses.
Destination descriptions, current documents, source content, code roots, and tool
results are attached automatically by the host script; the YAML prompt should not
contain placeholders for them. If a stage key is omitted, the script uses its
versioned default in `stage-prompts.yml`. Blank prompts are rejected. Restart a
running script to load edits.

The categorizer supports separate models for each stage under `llm`:

All three categorization stages send `reasoning: "off"` to the LM Studio
`/api/v1/chat` endpoint. Models that do not support this setting may reject the
request; the script reports the error rather than silently enabling thinking.

```yaml
llm:
  endpoint: "http://192.168.2.110:1234/api/v1/chat"
  api_key_env: "LLM_API_KEY"
  model_stage1: "google/gemma-3-4b" # Classification
  model_stage2: "google/gemma-3-4b" # Deduplication
  model_stage3: "google/gemma-3-4b" # Code review
  model: "google/gemma-3-4b" # Optional fallback and browser-audit model
```

Set each stage field to the model identifier served by your endpoint. Resolution is
`MODEL_STAGE1/2/3` environment override, then the corresponding YAML stage field,
then `MODEL_NAME`, then `llm.model`. The shared endpoint and API key apply to all
stages. Request logs and the report show the effective stage models. The fallback
`llm.model` is optional for categorization when every `model_stage*` value is set,
but the Playwright audit scripts and HTML reporter still use `MODEL_NAME` or
`llm.model`; keep it configured when running browser audits.

Edit `automation_tests/automation-settings.yml`. It contains:

- `web`: app URL, headless mode, page/action limits, action timeout.
- `llm`: endpoint, model name, and the environment-variable name containing the API key.
- `documentation`: source folder, destination folder, and destination file definitions.
- `mobile`: responsive screen profiles and an enabled flag.

`AUTOMATION_SETTINGS` can select another settings file. `MODEL_STAGE1`,
`MODEL_STAGE2`, `MODEL_STAGE3`, `MODEL_NAME`, and `MODEL_URL` override YAML for a
process. The root PowerShell categorization command also accepts
`-Settings "path/to/settings.yml"`.
Paths in documentation settings resolve relative to the repository root.

Keep documentation settings in the settings file. For compatibility, the categorizer
merges a `documentation` block from local credentials over the settings block;
avoid maintaining two conflicting copies. The browser audit reads its documentation
folder from the settings file.

The configured source folder is read-only. Destination output must be outside it.
Setting `destination_read_write: false` blocks categorizer apply mode.

## Categorize documentation

Stages use separate responsibilities and instructions:

- Stage 1 uses `prompts.stage1` from the settings file:
  route source-backed additions by destination filename and content description.
  It requests detailed consolidation, preserving commands, examples, tables,
  schemas, constraints, exceptions, implementation status and verification evidence.
  Each target receives one combined appendix per source, with source attribution.
  Every destination `content` description is sent in full and defines required
  coverage: all related source explanations, rationale, workflows, examples and
  qualifications must be preserved. A broad existing summary is not sufficient
  reason to skip more detailed source content. This is a model instruction, not
  an automatic proof of completeness; generated output still requires review.
- Stage 2 uses `prompts.stage2` from the settings file to identify duplicate
  blocks. The host removes only proposed blocks equal after whitespace normalization,
  preserving case, numbers, commands, headings and provenance. Similar passages
  with differing details remain and are reported as recommendations. Documents
  containing fenced code are conservatively retained. Invalid responses preserve
  the document and are recorded as errors.
- Stage 3 uses `prompts.stage3` from the settings file: discover file IDs,
  read code, compare documentation claims, and return findings with line citations.
  Its examples distinguish literal searches from regular expressions and require
  discovered file IDs rather than numeric root IDs.

Run only the code-review stage against existing configured destination documents:
`./run-categorize-docs.ps1 -Stage3Only`. Add `-Preview` for no writes.
Node and Bash accept `--stage3-only` (plus `--apply` to save).
This requires `code.code_review: true` and cannot be combined with `-SourceFile`.
Stages 1 and 2 are skipped; existing documents receive code-review findings.

When `code.code_review: true`, a third stage reviews each populated configured
destination against the folders in `code.source_folder`. `source_read_only: true`
is required for code access (omission also defaults to read-only).
The model requests recursive filename searches (`find`), literal text searches
(`grep`), and numbered line ranges (`read`). These are host-controlled operations;
no shell commands or source changes are executed. File IDs use the configured
root index, for example `0/src/example.ts:12`.

Stage 3 appends a dated review to each document with implemented, partial, todo,
recommended, divergent, or unverified findings and code citations. Unsupported
status claims are downgraded to unverified. Static review does not prove runtime
success. Existing documentation remains available alongside review findings.
Preview includes findings in the printed report without writing destination files.

Reviews are bounded to 12 tool rounds per document, four requests per round,
100 filename matches per page, 80 search matches, and 120 lines per read.
Files larger than 1 MiB, symbolic links, dependency/build directories, and common
secret filenames are excluded. Search results expose truncation and skipped files;
limited coverage must be treated as uncertainty, not proof that a feature is absent.
Missing configured code folders fail validation before documentation processing.

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

Stage 1 reads selected source Markdown files one at a time. After each source is
classified, its accepted appendices are written immediately to the configured
destination files, so completed source work remains available if a later request
fails or the process is interrupted. Each request includes the configured Stage 1
prompt, allowed filenames, their full content descriptions, existence status, and
current destination content.

Stage 2 reads every configured destination in sequence and sends the configured
Stage 2 prompt plus numbered content blocks to the model. The host removes only
verified exact duplicate blocks and preserves unique content. Stage 3 sends the
configured Stage 3 prompt plus a read-only code-tool protocol; the model can ask
for host-controlled `find`, `grep`, and `read` operations before returning
evidence-cited findings. Terminal progress output shows all enabled stages.

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

Deduplication asks the model to identify repetitions and verifies equality after
whitespace normalization before removal. Case and numbers remain significant.
Similar passages and conflicts may remain and require review. The model is
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
