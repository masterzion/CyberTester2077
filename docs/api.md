# api

API reference: methods and paths, authentication and role requirements, request and response schemas, validation, error codes, pagination, rate limits, events, webhooks, and integration contracts. Preserve source examples with secrets redacted. Label missing specifications; do not invent endpoints, payload fields, or response behavior.


<!-- main-doc-reconciliation: ai-safety.md -->

source-backed Markdown


<!-- main-doc-reconciliation: deployment.md -->

deployment.md


<!-- main-doc-reconciliation: android-demo.md -->

### Android Download Endpoint

The web login page includes an Android download card accessible at `/api/downloads/android`.

*   **Functionality**: This endpoint streams the APK file located at `artifacts/android/learnvia-demo.apk`, or uses the path supplied in the environment variable `ANDROID_APK_PATH`.
*   **Companion File**: The version information is read from a companion file, `build-info.json`, which must be placed alongside the APK; `/api/downloads/android/version` reads this version for display.
*   **Error Handling**: If the APK is absent, the endpoint returns 503 instead of a broken binary.
