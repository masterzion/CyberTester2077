# roles

Role and permission reference covering every documented user type, including children, parents and guardians, teachers, root administrators, reviewers, and event editors. Preserve responsibilities, allowed and forbidden actions, relationship-based access, read-only variants, approval dependencies, and expected interface behavior. Include source-backed acceptance scenarios and links to security rules; flag undocumented permissions.


<!-- main-doc-reconciliation: role-branding.md -->

source-backed Markdown


## Code implementation review — 2026-09-24T17:53:59.624Z

Static review of: D:\Src\kidverse\edge-ai, D:\Src\kidverse\content-filter, D:\Src\kidverse\auth, D:\Src\kidverse\parental-controls, D:\Src\kidverse\services\social, D:\Src\kidverse\services\media, D:\Src\kidverse\services\messaging, D:\Src\kidverse\services\education, D:\Src\kidverse\services\school, D:\Src\kidverse\services\notification, D:\Src\kidverse\services\moderation, D:\Src\kidverse\services\partner-content, D:\Src\kidverse\web, D:\Src\kidverse\mobile. Runtime behavior was not executed.

### UNVERIFIED: The documentation describes a role named 'role-branding'.

Two files, `12/lib/__tests__/role-branding.test.ts` and `13/__tests__/role-branding.test.tsx`, exist that appear to be related to the 'role-branding' concept.

Evidence: No code citation; requires verification.


<!-- main-doc-reconciliation: ai-safety.md -->

## Role and Permission Reference: Moderation Roles

The source document details several roles implicitly or explicitly related to content moderation and safety review:

*   **Guardian/Parent**: Responsible for ultimate approval, can unblock permanently blocked content, and must be notified of high-severity alerts.
*   **Human Moderator**: Can review content flagged as `HUMAN_REVIEW`, and has the authority to APPROVE, REJECT, BLOCK, or request more evidence. Must document reasoning for all reviews.
*   **System/Policy Engine**: Enforces rules based on classification results (e.g., blocking content if it hits certain safety categories).

**Specific Roles Mentioned in Context:**

*   **Child**: The subject whose content is being moderated.
*   **Parent/Guardian**: Has oversight and approval rights over the child's content status (`PENDING_PARENT_APPROVAL`).

**Access Control & Actions (Source-backed):**

*   **Content Statuses:** `APPROVED`, `REJECTED`, `PENDING_PARENT_APPROVAL`, `BLOCKED`, `HUMAN_REVIEW` define the lifecycle and required actions/approvals.
*   **Alert Escalation Triggers:** Define when a parent must be notified (First HIGH/CRITICAL alert) or when an account is subject to review (Five HIGH/CRITICAL alerts in 30 days).

This information details roles beyond standard user types, focusing on moderation workflow permissions.


<!-- main-doc-reconciliation: android-demo.md -->

### Role Context in Android Demo

The application's native screens are selected based on the signed-in role and organization membership, supporting specific portals for:
*   School
*   Partner
*   Administration

Additionally, the demo flow involves roles related to content moderation/safety review (as detailed in other sections), where Parent/Guardian has oversight rights over a child's content status (`PENDING_PARENT_APPROVAL`).
