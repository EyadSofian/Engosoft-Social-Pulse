# Roles and per-user permissions

Settings → Roles & access contains ten existing role presets and eighteen capabilities grouped into content, design/courses, workflow, reports and administration. Account creation and role assignment remain in Settings → Team.

Each capability can inherit the assigned role, be explicitly allowed or explicitly denied. Reset removes all overrides. The server reads overrides from the current session's user on every request; a grant or denial takes effect without issuing a new session. The browser refreshes its capability list when it regains focus. Permissions are also passed into the workspace's navigation and demo workflow checks.

The API validates capability names, protects administrator overrides and self changes, and records each successful override update in `permission_changes`. Operations starts with create and edit-own only; free design, template editing, approval and scheduling require separate capabilities. Course editing uses `templates.manage`. Own and team usage reports use `credits.view` and `credits.view_all` independently of account management.

The persisted content pipeline, course catalog, reference generation, Studio, account administration, usage and connector mutations enforce their route/workflow checks on the server. Task assignment and some department reporting screens are still the existing in-memory demo workspace, as marked in the app; these checks do not turn those screens into a persisted backend.

Regression coverage uses real HTTP sessions and checks grants, denials, reset, self/admin protection, rejected input, audit records and approval transitions. Frontend tests render the role matrix, course editor, placement picker and approval cards in Arabic and English. They do not replace visual browser or device testing.
