# Roles and per-user permissions

Settings → Roles & access contains ten existing role presets and eighteen capabilities grouped into content, design/courses, workflow, reports and administration. Account creation and role assignment remain in Settings → Team.

Each capability can inherit the assigned role, be explicitly allowed or explicitly denied. Reset removes all overrides. The server reads overrides from the current session's user on every request; a grant or denial takes effect without issuing a new session. The browser refreshes its capability list when it regains focus. Permissions are also passed into the workspace's navigation and demo workflow checks.

The API validates capability names, protects administrator overrides and self changes, and records each successful override update in `permission_changes`. Operations starts with create and edit-own only; free design, template editing, approval and scheduling require separate capabilities. Course editing uses `templates.manage`. Own and team usage reports use `credits.view` and `credits.view_all` independently of account management.

The persisted content pipeline, course catalog, reference generation, Studio, account administration, usage and connector mutations enforce their route/workflow checks on the server. Task assignment and some department reporting screens are still the existing in-memory demo workspace, as marked in the app; these checks do not turn those screens into a persisted backend.

Regression coverage uses real HTTP sessions and checks grants, denials, reset, self/admin protection, rejected input, audit records and approval transitions. Frontend tests render the role matrix, course editor, placement picker and approval cards in Arabic and English. They do not replace visual browser or device testing.

## Sign-in reliability (2026-11-01)

Production logs showed new accounts failing to sign in (five 401s in a row, a password reset, more failures). The server logic was correct; the typed values did not match what was saved. Now:

- Emails are trimmed, lower-cased and stripped of invisible marks on create and sign-in. Passwords are compared with Arabic-Indic digits converted to 0-9 and surrounding spaces removed; accounts hashed before this still match their exact old password.
- New passwords with Arabic letters are refused with a reason. A wrong password typed on an Arabic keyboard gets a hint to switch.
- Settings → Team generates a readable temporary password in a visible field (browsers no longer autofill the admin's own password there) and shows a copyable sign-in message after creating or resetting. A "Last sign-in" column shows who never got in.
- A password reset or reactivation lifts the 15-minute lockout at once. A suspended account is told it is suspended (only when the password is right).
- Failed sign-ins are logged as `[auth] login failed for ab***@domain: unknown_email | wrong_password | suspended`, so Railway logs show why.

