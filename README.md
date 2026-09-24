# CyberTester2077

![CyberTester2077 logo](assets/cybertester2077-logo.png)

CyberTester2077 is a configurable exploratory QA toolkit. It uses Playwright to inspect a web interface, an OpenAI-compatible local model to choose safe role-aware exploration, and a filesystem-only documentation reconciler to condense source documentation into a curated destination folder.

## Requirements

- Node.js 18+ and npm.
- Network access to the application under test and the configured OpenAI-compatible LLM endpoint.
- Chromium installed through Playwright.
- For native/mobile work: Android SDK platform tools, a running emulator, and the tested APK. The web audit does not require Android tooling.
- A destination documentation folder containing the approved target Markdown files. The categorizer appends only to existing target files.

## Installation

PowerShell:

```powershell
./scripts/install-dependencies.ps1
```

Bash:

```bash
chmod +x scripts/*.sh
./scripts/install-dependencies.sh
```

Pass `-SkipBrowser` or `--skip-browser` when Playwright Chromium is already installed.

## Machine configuration and secrets

Copy the templates locally, then adapt paths and values for the machine:

```powershell
Copy-Item automation_tests/automation-settings.yml.example automation_tests/automation-settings.yml
Copy-Item automation_tests/credentials.yml.example automation_tests/credentials.yml
```

`automation-settings.yml` is the shared machine configuration. Its `documentation.source_folder` is read-only. Its `documentation.destination_folder` is read/write for categorization and read-only for the Playwright audit. Keep source and destination distinct when reconciling another repository’s documentation.

`credentials.yml` is a local account matrix. Populate each `password_env` variable in `.env`, a CI secret manager, or the current shell. Do not put passwords or API keys in tracked YAML.

Example `.env` values:

```dotenv
LLM_API_KEY=optional-secret-for-a-protected-endpoint
CHILD_EMAIL=test-account@example.test
CHILD_PASSWORD=replace-with-a-secret
```

Set any values that differ from `automation-settings.yml` as environment variables: `APP_URL`, `MODEL_URL`, `MODEL_NAME`, `AUDIT_ACCOUNT_NAME`, `AUDIT_ACCOUNT_ROLE`, and `AUDIT_ACCOUNT_DESCRIPTION`.

### Configuration coverage

The web audit actively consumes `web.app_url`, `web.headless`, `web.max_pages`, `web.max_actions_per_page`, and `web.action_timeout_ms`. Both the audit and the HTML reporter consume `llm.endpoint`, `llm.model`, and `llm.api_key_env`; an environment value such as `MODEL_NAME` intentionally takes precedence for a one-off run. The categorizer consumes the same LLM settings plus `documentation.source_folder` and `documentation.destination_folder`; the audit consumes `documentation.destination_folder` and `documentation.max_documents_per_page` as read-only model context.

`credentials.yml` is currently a secure account inventory, not yet an account-matrix runner: a direct audit still receives its selected account through environment variables. Likewise, `mobile.enabled`, `mobile.adb_serial`, `mobile.application_id`, and `mobile.screen_profiles` are reserved for the native Android runner, which has not been implemented. They are not silently ignored during a mobile run because there is no mobile run command yet.

## Documentation categorization

The categorizer reads every Markdown file in `documentation.source_folder` one at a time. The model proposes detailed, evidence-based appendices for the existing fixed taxonomy in the destination folder. It never creates destination documents. In apply mode it removes only exact duplicate paragraphs; it does not silently delete semantically similar text.

Preview first:

```powershell
./scripts/run-categorize-docs.ps1
```

```bash
./scripts/run-categorize-docs.sh
```

Apply only after reviewing the preview JSON:

```powershell
./scripts/run-categorize-docs.ps1 -Apply
```

```bash
./scripts/run-categorize-docs.sh --apply
```

## Tests and exploratory audit

Run unit tests only:

```powershell
./scripts/run-tests.ps1
```

```bash
./scripts/run-tests.sh
```

Run unit tests followed by the Playwright exploratory audit after exporting credentials:

```powershell
$env:CHILD_EMAIL = "test-account@example.test"
$env:CHILD_PASSWORD = "replace-with-a-secret"
$env:AUDIT_ACCOUNT_NAME = "Test account"
$env:AUDIT_ACCOUNT_ROLE = "child"
./scripts/run-tests.ps1 -Audit
```

```bash
export CHILD_EMAIL="test-account@example.test"
export CHILD_PASSWORD="replace-with-a-secret"
export AUDIT_ACCOUNT_NAME="Test account"
export AUDIT_ACCOUNT_ROLE="child"
./scripts/run-tests.sh --audit
```

Each audit stores reports and screenshots under `automation_tests/<timestamp>-<role>/<login>/`. The login directory replaces special characters with `_`. It contains `interactive-report.html`, page and interaction screenshots, console evidence, model observations, the control inventory, and machine-readable results. These generated artifacts are ignored by Git.

## Safety boundaries

The LLM receives screenshots, DOM/HTML evidence, console output, discovered controls, role description, and read-only destination documentation. The audit excludes destructive actions, logout, payments, credential changes, and external navigation. Treat every audit run as a test-environment operation and keep it pointed at a non-production application.
