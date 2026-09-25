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

## Main scripts

There are two main scripts. The first reconciles documentation with source code;
the second runs exploratory browser audits across every configured account.

### `run-categorize-docs`

Reads Markdown from `documentation.source_folder`, classifies each source into the
configured destination files (stage 1), deduplicates those destinations (stage 2),
and optionally reviews them against read-only code (stage 3). It writes nothing by
default; add `-Apply`/`--apply` to persist changes. After each completed stage in
apply mode the destination folder is snapshotted to `docs-stageN.tgz`.

Parameters:

| Parameter | Alias | Description |
| --- | --- | --- |
| `-Preview` | (bash/node default) | Run without writing and create no archives. |
| `-Apply` | `--apply` | Write changes to the destination folder. PowerShell defaults to this; bash/node require the flag. Cannot combine with `-Preview`. |
| `-Settings <path>` | `AUTOMATION_SETTINGS` env | Settings file to load (defaults to `automation_tests/automation-settings.yml`, falling back to the `.example`). |
| `-SourceFile "relative.md"` | `--source-file` | Process a single source file relative to `documentation.source_folder`. Cannot combine with `--stage2-only` or `--stage3-only`. |
| `-Stage3Only` | `--stage3-only` | Run only code review against existing destinations. Requires `code.code_review: true`; cannot combine with `-SourceFile`. |
| `-Stage2Only` | `--stage2-only` | Run only deduplication against existing configured destinations. Cannot combine with `-SourceFile` or `-Stage3Only`. |

Environment overrides for a process: `MODEL_STAGE1`, `MODEL_STAGE2`, `MODEL_STAGE3`,
`MODEL_NAME`, and `MODEL_URL`. Per-request timeouts come from `llm.timeout_seconds`
and `llm.timeout_stage2_seconds` in the settings file.

### `run-account-matrix`

Loads accounts from `credentials.yml`, runs a web audit, a mobile audit per configured
profile (or both), collects screenshots/HTML/console evidence, and writes an
interactive report plus `account-matrix.json`. Missing passwords are skipped; any
failure or skip sets a non-zero exit code.

Parameters:

| Parameter | Description |
| --- | --- |
| `--web` | Run web audits for every account with `runtest_web: true`. |
| `--mobile` | Run mobile audits (one per profile) for accounts with `runtest_mobile: true`, when `mobile.enabled` is true. |

Omit both flags to run web and mobile together. The runner loads the repository-root
`.env`; process variables take precedence. `AUTOMATION_SETTINGS` selects another
settings file. Each account receives one web run and one mobile run per configured
profile; `adb_serial`, `application_id`, and `density` do not affect these browser runs.

## Configuration

Full parameter reference for both configuration files is in [howto.md](howto.md).
The only settings edited directly here are the stage prompts, stored under
`prompts` in `automation_tests/automation-settings.yml`:

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
- Stage 2 uses `prompts.stage2` to return the complete deduplicated Markdown
  for each file. It can consolidate differently worded repetitions while preserving
  unique details, examples, code and source attribution. The returned content
  replaces the same file in apply mode; it is not an executive summary.
  Empty, JSON-plan, or explicitly truncated responses preserve the original file
  and are recorded as errors.
- Stage 3 uses `prompts.stage3` from the settings file: discover file IDs,
  read code, compare documentation claims, and return findings with line citations.
  Its examples distinguish literal searches from regular expressions and require
  discovered file IDs rather than numeric root IDs.

Run only deduplication against existing configured destination documents:
`./run-categorize-docs.ps1 -Stage2Only`. Add `-Preview` for no writes.
Node and Bash accept `--stage2-only` (plus `--apply` to save).
This skips stages 1 and 3 and cannot be combined with `-SourceFile` or `-Stage3Only`.
Per-request timeouts are configured under `llm` in `automation-settings.yml`; see
[howto.md](howto.md). Each file is read, deduplicated independently, and saved back
to the same path before the next file is processed. Missing destination files are skipped.

After each completed stage in apply mode, the entire destination folder is
compressed into `docs-stage1.tgz`, `docs-stage2.tgz`, or `docs-stage3.tgz`
beside that folder. Each archive replaces the previous snapshot for that stage
only after compression succeeds. `tar` must be available on PATH.
Snapshots include partial results when individual document errors occur;
archive failures stop the run. Preview creates no archives.
Stage 2 errors include the raw model text in the final report for diagnosis.

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
Stage 2 prompt plus the full file content to the model. The returned deduplicated
Markdown is saved before processing the next file. Stage 3 sends the
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

Change `documentation.destination_files` to change this list; each item uses
`id`, `file`, and `content`. See [howto.md](howto.md) for the full schema. Apply
mode creates missing configured files only when source-backed additions are returned,
and never requires pre-created files. Preview never creates destination files.

Deduplication now relies on the model to preserve unique information rather than
verifying exact block equality. Review the resulting Markdown against the original;
the host cannot prove that a complete-looking response preserves every detail.
The prompt requires preserving conflicting claims, numbers, commands and caveats.

## Credentials and account testing

Create the local ignored credentials file if it does not exist:

```powershell
Copy-Item automation_tests/credentials.yml.example automation_tests/credentials.yml
```

Every account field is documented in [howto.md](howto.md). Supply either a `password`
or a `password_env` (whose environment value takes precedence) for each account. Add
named secret variables to the repository-root `.env` or your process environment:

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

### Form, social, and chat interactions

The executor prioritizes input controls before Save, Send, Post, Publish, Share,
and other submission buttons. It supports text and rich-text entry, dates,
checkboxes, radio buttons, selects, and image inputs. Where eligible empty forms
are found, it first tries an empty submission or records a disabled submit button,
then fills test values and tries submission again. Existing populated drafts are
not cleared to manufacture empty-form scenarios. Input interactions use marked
QA text; run only against accounts and environments where test writes are allowed.

Language/session controls and destructive actions are excluded in code, not just
in the model prompt. The runner attempts to dismiss blocking menus with Escape,
scrolls targets into view, and performs up to three additional scroll/discovery
passes when no untried controls remain. Model-requested observe actions are skipped.

Submission checks look for browser validation and visible application feedback.
Expected empty-input validation passes the negative test; an unconfirmed
submission produces a warning rather than a success claim. These are heuristic
checks, not proof of persistence or complete end-to-end coverage. Application
layouts, custom widgets, permissions, and configured action limits can prevent
completion. Review the report before treating posts or messages as delivered.

### Random image uploads

Enable this by adding an `upload_images` block to the ignored
`automation_tests/automation-settings.yml`; see [howto.md](howto.md) for every field.
Put approved test images in the configured folder, which is ignored by Git. For each
file input the runner randomly selects distinct images compatible with its
`accept` attribute. Multi-file inputs receive three images together by default;
single-file inputs receive one and report the limitation, as do runs with fewer
compatible images available. Selection does not recurse into subfolders or follow
symlinks. Supported extensions are JPG/JPEG, PNG, GIF, WebP, AVIF, BMP, and SVG.
Attachment does not itself confirm server upload or publication. Selected filenames
appear in the interaction evidence. Restart the runner after changing configuration.

## Results and checks

```text
automation_tests/output/[local-timestamp]/[role]/[sanitized-account-name]/web/
automation_tests/output/[local-timestamp]/[role]/[sanitized-account-name]/mobile-[profile]/
```

Run folders contain screenshots, HTML evidence, inventories, observations, results,
and an `interactive-report.html` created at startup and updated during execution.
Refresh the HTML to follow progress. Timing includes start, finish, and elapsed
duration using the local machine's timezone for display; error evidence includes
timestamps and URLs when available. Report writes are serialized within the process,
use unique temporary files, and retry transient Windows file locks. If replacement
still fails, the previous readable report remains intact and an error is logged.
The matrix writes `automation_tests/output/[local-timestamp]/account-matrix.json`.
Matrix PASS currently indicates the audit process
finished successfully; inspect individual interaction failures in its report.

Run unit tests with `npm test` or `./scripts/run-tests.ps1`. The lower-level
`audit:ui` and `audit:ui:report` commands use a single account supplied through
process variables; use the account-matrix commands for credentials.yml selection.

The optional `node scripts/smoke-smallest-doc.cjs` command makes a live model
request against a copy of the smallest configured source document. It uses an
isolated timestamped output folder and checks that the original source is unchanged.
It is separate from the unit-test suite.
