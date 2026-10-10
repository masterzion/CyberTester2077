# Dedicated admin reviewer provisioning

`provision-admin-reviewer.cjs` creates only the dedicated DEV report-review account
in the existing Auth, product-account and portal-operator stores. It is not a
replacement authentication system. Supply the configured Viafactor and Auth
checkout roots using `--app-root` and `--auth-root`; `--credentials` optionally
selects an existing private YAML store. With no `--apply` it is read-only.

An explicit `--apply` saves a random password privately, imports a moderator
identity through Auth's validated import contract, creates its matching product
identity and grants only `review`. Loopback, DEV environment, physically separate
databases, existing migration history and collision checks are mandatory. It
never resets existing passwords, modifies another permission or deletes data.

The requested credential store retains the password and `account_id`; no secret
is printed. Pre-change backups live in ignored automation output. Cross-service
creation is not a distributed transaction: on a partial failure preserve the
pending credential and backup, inspect the stored state and rerun this same
operation. The rerun validates the saved hash and identities instead of replacing
them. `provisioning_status: verified` indicates reread hash/grant verification,
not live browser login or encrypted-device enrollment.

`runtest_admin: true` marks the dedicated admin test purpose. Existing web/mobile
matrix runners do not yet implement this new flag; both old runner flags remain
false so they do not accidentally test the admin account against the user app.
