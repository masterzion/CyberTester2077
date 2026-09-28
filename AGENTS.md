# CyberTester development data operations

- Never print passwords, hashes, credentials YAML, bootstrap secrets or database URLs.
- Use the existing application schemas and isolated service databases. Never run schema reset/push or delete accounts to clean test content.
- `scripts/reset-development-demo.cjs` is a destructive, expressly opt-in **local development** demo reset. Default invocation is read-only dry-run:

  ```powershell
  node scripts/reset-development-demo.cjs
  node scripts/reset-development-demo.cjs --apply --confirm-development-reset
  ```

- Read the dry-run table inventory first. Stop the owned DEV application processes before apply; application/database writers cause apply to refuse. Keep PostgreSQL running. Restart using the application's established DEV launcher afterward.
- Configure `demo_reset` in ignored `automation_tests/automation-settings.yml`; see `automation_tests/demo-reset.example.yml`. `--settings` (or `AUTOMATION_SETTINGS`) selects another YAML file. `--app-root` and `--credentials` override configured paths. Relative configured paths resolve from the CyberTester root. `--help` does not connect to any database.
- Configure application root, credentials path, development port, container engine and PostgreSQL container name. Database names/users are discovered from the application's existing DEV settings and checked against its bootstrap. Only `127.0.0.1` is allowed. Before backup, verify the container's PostgreSQL cluster identifier matches the connected cluster. Mismatches require investigation, not weakening guards.
- This is reusable for the current application schema, not a universal database eraser. Reset tables are allowlisted by service/workspace, independent of database names. Unknown services or missing expected tables abort. A schema change requires review of the adapter, not automatic deletion of new tables.
- Repeat executions replace demo content rather than accumulating it, preserve current accounts, and reread credentials each time. Apply holds a PostgreSQL advisory lock, rejects other database clients, and creates a unique backup directory per run. It never stops/restarts services automatically.
- All databases receive custom-format `pg_dump` backups, validated with `pg_restore --list`, under ignored `automation_tests/output/demo-backups/<timestamp>`. Backups contain sensitive data; keep them private. Archive listing verifies format, not a full restoration drill.
- Preserve accounts, account IDs, family/guardian relations, policy, runtime configuration, school membership, encryption keys and operator permissions. Explicit table lists reset posts/comments/projects, media metadata, conversations/messages, progress, notifications and event/advertising content. Schema is unchanged; no TRUNCATE CASCADE.
- Exception: `demo_reset.full_time_accounts` lists exact child emails that receive all-day demo screen-time access (all-day exception, no bedtime/school block). Other safety policies stay unchanged. The reset reapplies this each time. `node scripts/demo-screen-time.cjs --apply` updates only these policies with a before-state JSON backup; without the flag it previews. Existing policy caches may briefly retain the old decision.
- Passwords reset only for exact email matches in `automation_tests/credentials.yml`; `password_env` takes precedence if present. Unlisted accounts retain passwords. Sessions/refresh tokens are invalidated. QA-corrupted display names are repaired only from matching credential names.
- Seed natural demo posts, learning activities and child goals. Do not insert plaintext into encrypted message tables or fabricate media approval records. Existing object-store blobs and Redis are not deleted by this script.
- Security audit history is retained, even if it mentions old QA content. Other remaining `QA TEST` records abort the reset. Confirm account IDs and roles unchanged and password hashes verify before committing.
- Each database has its own transaction, staged before commits; there is no distributed atomic commit. If a commit fails, retain backups and inspect every database before recovery. Do not blindly rerun.
- Restore only the exact affected development databases from their matching `.dump` files while services are stopped, using `pg_restore --clean --if-exists` against the validated target. Restore all related service snapshots together. This destructive recovery also requires explicit authorization.
