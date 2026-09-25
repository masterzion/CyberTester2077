# Configuration How-To

This file explains every parameter in the two configuration files that drive
CyberTester2077:

- `automation_tests/automation-settings.yml` — application behaviour, models,
  documentation targets, and mobile profiles.
- `automation_tests/credentials.yml` — test accounts, roles, and secrets.

Both files are copied from their tracked examples and ignored by Git:

```powershell
Copy-Item automation_tests/automation-settings.yml.example automation_tests/automation-settings.yml
Copy-Item automation_tests/credentials.yml.example automation_tests/credentials.yml
```

Never commit the local `credentials.yml` or a populated `automation-settings.yml`.
Secrets live in `.env` or the process environment, not in these files. See the
project README for what the application does and how to run it.

---

## automation-settings.yml

### `web`

Controls browser audits of the web app.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `app_url` | string | `http://127.0.0.1:3000` | Base URL of the application under audit. |
| `headless` | bool | `true` | Run Chromium without a visible window. |
| `max_pages` | int | `30` | Maximum number of pages/tabs the auditor may open. |
| `max_actions_per_page` | int | `50` | Maximum interactions per page before moving on. |
| `action_timeout_ms` | int | `5000` | Milliseconds to wait for a single actionable control. |

### `upload_images`

Random image-upload testing for file inputs.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `folder` | string | — | Local folder of approved test images. Relative paths resolve from the repository root; absolute paths are accepted. This folder is ignored by Git. |
| `count` | int | `3` | Distinct random images selected per multi-file input. Single-file inputs accept only one image and report that limitation. |

Supported extensions: JPG/JPEG, PNG, GIF, WebP, AVIF, BMP, SVG. Selection does not
recurse into subfolders or follow symlinks. For each file input the runner picks
distinct images compatible with its `accept` attribute; fewer compatible images
produce a warning. Restart the runner after changing this block.

### `mobile`

Responsive-browser mobile profiles for the account matrix. The current
implementation uses responsive viewport and touch emulation, not native APKs, so
`adb_serial`, `application_id`, and `density` do not affect these runs.

| Key | Type | Description |
| --- | --- | --- |
| `enabled` | bool | Master switch; mobile audits are skipped when this is not `true`. |
| `adb_serial` | string | Left blank to auto-detect one connected emulator (unused by browser runs). |
| `application_id` | string | Package id carried through the audit environment (unused by browser runs). |
| `screen_profiles[]` | list | Each profile defines a responsive target. See below. |

Each `screen_profiles[]` entry:

| Key | Type | Description |
| --- | --- | --- |
| `name` | string | Profile label shown in output paths and the manifest (for example `ios-se-2016`). |
| `width` | int | Viewport width in CSS pixels. |
| `height` | int | Viewport height in CSS pixels. |
| `density` | int | Device pixel density reported to the page. |

### `code`

Stage 3 code-review configuration for the categorizer.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `source_folder[]` | list of strings | — | Read-only source folders searched during Stage 3. Must be non-empty when `code_review` is true. Paths resolve from the repository root. |
| `code_review` | bool | `false` | Enable the third code-review stage. Required for `--stage3-only`. |
| `source_read_only` | bool | `true` (read-only) | Must be `true` (or omitted) to allow code access; `false` fails validation. |

Stage 3 uses host-controlled `find`, `grep`, and `read` operations only — no shell
commands or source changes are executed. Files larger than 1 MiB, symlinks,
dependency/build directories, and common secret filenames are excluded. Reviews are
bounded to 12 rounds per document, four requests per round, 100 filename matches per
page, 80 search matches, and 120 lines per read.

### `llm`

Model endpoint and per-stage model selection for the categorizer and browser audits.

| Key | Type | Description |
| --- | --- | --- |
| `endpoint` | string | LM Studio `/api/v1/chat` URL shared by all stages (for example `http://127.0.0.1:1234/api/v1/chat`). Overridden by the `MODEL_URL` environment variable. |
| `api_key_env` | string | Name of the environment variable / `.env` entry holding the API key (for example `LLM_API_KEY`). The secret is never stored here. |
| `model_stage1` | string | Model used for documentation classification. Overridden by `MODEL_STAGE1`. |
| `model_stage2` | string | Model used for deduplication. Overridden by `MODEL_STAGE2`. |
| `model_stage3` | string | Model used for code review. Overridden by `MODEL_STAGE3`. |
| `model` | string | Optional categorization fallback when any `model_stage*` is unset. |
| `playwright_model` | string | Model used by browser audits and the HTML reporter. Falls back to `MODEL_NAME`. |

Resolution order for each stage model: `MODEL_STAGE<n>` environment variable, then
the YAML `model_stage<n>` field, then `MODEL_NAME`, then `llm.model`. All stages send
`reasoning: "off"`; models that reject it fail the request rather than silently
thinking.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `timeout_seconds` | int | Stage 2: `1800`, other stages: `300` | Maximum seconds per model request. Set to `3600` for long-running requests. |
| `timeout_stage2_seconds` | int | `timeout_seconds` | Overrides the timeout for stage 2 only. |

Timeouts must be integers between 1 and 2,147,483 seconds; invalid values fail the run.

### `documentation`

Source/destination folders and the fixed destination taxonomy for the categorizer.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `source_folder` | string | — | Read-only Markdown source. This script never writes here; output must live outside it. Paths resolve from the repository root. |
| `destination_folder` | string | `./docs` | Existing Markdown files the categorizer may read and append to. Must be outside `source_folder`. |
| `source_read_only` | bool | `true` | When `false`, categorizer apply mode is blocked. |
| `destination_read_write` | bool | `true` | When `false`, apply mode cannot write. |
| `destination_files[]` | list | See below | The ten destination documents and their scope descriptions. Change this list to change the taxonomy. |

Each `destination_files[]` entry:

| Key | Type | Description |
| --- | --- | --- |
| `id` | string | Stable identifier for the destination (for example `todo`). Defaults to the filename without extension. |
| `file` | string | Destination filename inside `destination_folder` (must end in `.md`). |
| `content` | string | Complete scope description sent to the model; it defines required coverage and is validated at runtime. |

Apply mode creates missing configured files only when source-backed additions are
returned; it does not require pre-created files. Preview never creates destination
files. The current ten destinations are `todo.md`, `done.md`, `api.md`,
`implementation_plan.md`, `drp.md`, `deploy.md`, `security.md`, `role.md`,
`model.md`, and `database.md`.

For compatibility the categorizer merges a `documentation` block from local
`credentials.yml` over this settings block; keep them consistent. The browser audit
reads its documentation folder from the settings file only.

### `prompts`

Stage instructions sent to the model. Preserve the response schemas — the scripts
validate model output against them.

| Key | Description |
| --- | --- |
| `stage1` | Classification: route source-backed additions by destination filename and content description into one combined appendix per source, with attribution. |
| `stage2` | Deduplication: return the complete deduplicated Markdown for each file to replace it in apply mode. Empty, JSON-plan, or truncated responses preserve the original and are recorded as errors. |
| `stage3` | Code review: discover file IDs, read code, compare claims, and return evidence-cited findings with line citations. |

If a stage key is omitted, the script uses its versioned default in
`stage-prompts.yml`. Blank prompts are rejected. Restart a running script to load
edits. Destination descriptions, current documents, source content, code roots, and
tool results are attached automatically by the host script; the YAML prompt should
not contain placeholders for them.

---

## credentials.yml

Top-level `accounts` list. Each account is one test identity run through the
account matrix.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | — | Display name; used in output paths and the manifest. Required. |
| `role` | string | — | Role label (for example `parent`, `child`, `teacher`, `root`, `review`, `event_add`). Used to group output. Required. |
| `description` | string | — | Free-text behaviour contract sent to the auditor so it knows what the account may and may not do. |
| `email` | string | — | Login email for the account. Required. |
| `password` | string | — | Plaintext password. Supply either this or `password_env`. |
| `password_env` | string | — | Name of an environment variable / `.env` entry holding the password. When present, its value takes precedence over `password`. Add named secrets to the repository-root `.env`. |
| `login_timeout_seconds` | int | `20` | Maximum wait for the account's first access (page readiness = load event + visible body). Use a higher value, e.g. `120`, for accounts whose first access requires compilation. Also sets that account's interaction timeout. |
| `runtest_web` | bool | — | Run web audits for this account when true. |
| `runtest_mobile` | bool | — | Run mobile audits for this account when true (requires `mobile.enabled`). |

Missing passwords produce skips. The account runner loads `.env`; existing process
variables take precedence over `.env`. Standalone categorization and report commands
read API keys from the process environment, so export the variable named by
`llm.api_key_env` for those commands.

The categorizer also merges a top-level `documentation` block from this file over the
settings block (see above); keep it in sync or omit it.
