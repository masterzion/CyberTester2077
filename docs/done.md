# done

Inventory of functionality explicitly documented as implemented, including user workflows, architecture and data flows, integrations, business rules, configuration behavior, and verification evidence. Preserve limitations, version/environment constraints, and source references. Record contradictory completion claims explicitly rather than guessing status.


<!-- main-doc-reconciliation: ai-safety.md -->

source-backed Markdown


<!-- main-doc-reconciliation: android-demo.md -->

### Android Demo Functionality

The following functionality is documented as part of the Android demo build process and its associated features:

*   **APK Build & Installation**: The process involves using `powershell -ExecutionPolicy Bypass -File scripts/build-android-demo.ps1` on a Windows workspace to prebuild Expo SDK 51, apply compatibility fixes, and assemble the APK.
*   **Build Artifacts**: The resulting artifact is located at `artifacts/android/learnvia-demo.apk`, with package name `com.learnvia.demo`. This is described as a demo-signed release bundle, not store-ready.
*   **Dependencies & Environment**: Requires Java 17, Android SDK 34/build tools 34, NDK 26.1.10909125, and CMake 3.22.1. Installed paths are stored in the `android-build` database configuration.
*   **Backend Connectivity**: The initial backend address is configured in `config/application.json`. The current tunnel requires the `/api/gateway` prefix because its root serves the web app.
*   **Distribution Endpoint**: The APK download is served via `/api/downloads/android` on the origin specified in `config/application.json`, which streams `artifacts/android/learnvia-demo.apk`. A companion file, `build-info.json`, must be kept beside the APK; `/api/downloads/android/version` reads its version for display (e.g., **Build 0.4.2**).
*   **Login & Biometrics**: On the phone, users sign in with a password and accept the biometric offer. Subsequent logins can use fingerprint/face sign-in. Explicit logout clears biometric sign-in.
*   **Smoke Testing**: The script `node scripts/android-demo-smoke.cjs` exercises the installed emulator app to test actual login, Latvian selection, family-event navigation, and session/language persistence after force-stop. This process clears only this demo app's local data and creates a synthetic test account.
*   **Role Context**: The application supports native screens for School, partner, and administration portals selected by the signed-in role and organization membership. Gift cards are noted as fictional demonstration grants without payment processing.

**Verification Status & Limitations:**
*   The 2026-09-21 build was verified with automated mobile tests, an Android release build, APK signature verification, and a hash comparison of the public download.
*   A fresh emulator/hardware smoke test is pending because the agent's emulator launch was rejected with "blocked by policy" before Android started. Historical native/posting smoke results do not validate this new APK.
*   The local demo permits HTTP to reach the development backend; HTTPS and production signing are required for distribution.
