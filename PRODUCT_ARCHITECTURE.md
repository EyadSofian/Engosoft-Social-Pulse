# Product architecture — Engosoft Content Operations Platform

Social Pulse is Engosoft's internal operating system for social media and content work. It covers the whole lifecycle of a piece of content:

```
Idea → Creation → Assignment → Production → Review → Changes → Approval
     → Scheduling → Publishing → Performance → KPIs → Learning
```

Every department plans and produces content in the same place. Marketing reviews, approves, schedules and publishes. The live connectors (Meta, TikTok, Snapchat, GA4) measure what was published.

## Principles

1. Operational first: each screen answers "what do I do next?"
2. Every user sees their own work and their own priorities. Home is different per role.
3. Marketing controls final publishing. Departments can create and submit, but they cannot approve or schedule.
4. Every content item has an owner.
5. Every important change is written to an activity log.
6. Every metric names its source, account and last update time.
7. Missing data is shown as `—`. It is never converted to zero, and numbers are never invented after an API failure.
8. AI helps inside the workflow. It never publishes, and the UI never claims it generated something when it did not.
9. Departments collaborate through the platform: comments, mentions and tasks instead of side chats.
10. The interface stays simple enough for non-technical staff.

## Where data comes from today

| Source | What it holds | Badge in the UI |
| --- | --- | --- |
| SQLite through `/api/dashboard` | Calendar plans, observed posts, alerts, connector status, GA4 days | **Live** / **Calendar** |
| Demo workspace (`src/services/demo/seed.ts`) | Users, content items, tasks, approvals, comments, templates, plans, courses, achievements, assets, credits, notifications | **Demo** |

The demo workspace is generated relative to the current date and kept in memory. Workflow actions (approve, request changes, create a task) work, but a page reload resets them. Server persistence for the new entities is listed in [MIGRATION_PLAN.md](MIGRATION_PLAN.md).

Live calendar plans also appear as content items in Content, Calendar and Home. They are read-only in the new workflow and keep being edited in the live publishing calendar.

## Navigation

The sidebar has three groups. Items are hidden when the current role cannot use them, and a direct link to a hidden page shows an access message instead of a broken page.

| Group | Page | Route | Who sees it |
| --- | --- | --- | --- |
| Main | Home | `/` | Everyone (the content changes by role) |
| | My Work | `/my-work` | Everyone |
| | Content | `/content`, `/content/:id` | Everyone (the list is filtered by visibility) |
| | Calendar | `/calendar` (`?view=live` for the publishing calendar) | Everyone |
| | Tasks & Approvals | `/tasks` | Everyone |
| | Templates | `/templates`, `/templates/:id` | Everyone |
| | AI Studio | `/ai-studio` | Roles that can create content |
| | Media Library | `/media` | Everyone |
| | Hall of Fame | `/achievements` | Operations, Marketing, Admin |
| Management | Departments | `/departments`, `/departments/:id` | Everyone except freelancers |
| | Analytics | `/analytics` | Roles with `analytics.view` |
| | Credits & Usage | `/credits` | Roles with `credits.view` |
| | Connections | `/connections` | Marketing roles and Admin |
| System | Admin | `/admin` | Admin |

Global tools: the header search opens the command palette (`Cmd/Ctrl + K`). It searches content, tasks, campaigns, templates, courses, students, media and people. The bell opens the notification center, where related events are grouped.

Old hash links (`/#/content`, `/#/connections?tiktok=…`) redirect to the new routes. The TikTok OAuth callback now returns to `/connections`.

## Roles and permissions

| Role | Key permissions |
| --- | --- |
| Admin | Everything, including users, connections and system settings |
| Marketing Manager | Create, edit any, approve, schedule, publish, assign, templates, all analytics, all credits, connections, all plans |
| Publisher | Create, edit any, schedule, publish, assign, all analytics, all plans |
| Department Manager | Create, edit own and department content, assign, department analytics and credits |
| Employee | Create and edit own content, analytics |
| Designer, Media Editor | Edit content assigned to them |
| Lecturer, Freelancer | Create and edit own content |

Permissions are enforced in the UI and in the pure workflow functions (`src/features/workspace/permissions.ts`). There is no sign-in yet: "View as" in the account menu switches the demo user. Server-side enforcement comes with authentication.

### Home by role

| Profile | Focus |
| --- | --- |
| Marketing Manager | Awaiting review, scheduled this week, overdue, monthly plan %, review queue, publishing this week, department progress, content opportunities, top posts, team workload |
| Publisher | Approved items that need a slot, publishing today, week schedule, unconfirmed live posts, best publishing time |
| Operations lead | Courses starting within 7 days and today, first-session posts, evaluation videos, missing course media, open operational tasks |
| Evaluation & certificates | Evaluation videos, certificate posts, LinkedIn reviews, exam achievements, Hall of Fame additions, missing student information |
| HR, Education, Corporate | Their monthly plan, their content and the occasions relevant to them |
| Designer / Media | Assigned design and video tasks, revision requests, deadlines |
| Admin | Active users, connections, AI credits, publishing errors, system activity |

## Domain entities

Typed in `src/domain/`:

| File | Entities |
| --- | --- |
| `users.ts`, `catalog.ts` | User, Department, Role, Permission |
| `content.ts` | ContentItem, PlatformVersion, Comment, ActivityLog, status pipeline (`TRANSITIONS`) |
| `workflow.ts` | Task, Approval, ContentTemplate, TemplateField, WorkflowStep |
| `planning.ts` | Campaign, MonthlyPlan, PlanTarget, Event, Course, StudentAchievement |
| `publishing.ts` | PlatformAccount, ScheduledPublication, Publication, AnalyticsSnapshot, MetricSource |
| `management.ts` | CreditWallet, CreditTransaction, KPI, KPIResult, Notification |
| `assets.ts` | Asset |

The **Content Item** is the central work object. It carries its title, type, department, campaign, owner, assignee, platforms, status, priority, due and publish dates, template, caption, platform versions, media, AI usage, linked course, monthly-plan target, published URL and provenance. Tasks, approvals, comments and activity link to it by id.

Tasks and posts are separate entities. One content item can have several tasks: design, video edit, copy, capture, revision.

## Content lifecycle

```
idea → draft → in_production → ready_for_review ─┬→ approved → scheduled → published → archived
                                ↑                 ├→ changes_requested ─┐
                                └─────────────────┴─────────────────────┘
                                                  └→ cancelled (with a note)
```

| Move | Who | Needs |
| --- | --- | --- |
| idea → draft → in production → ready for review | Owner, assignee, or someone who can edit the department's content | — |
| ready for review → approved | `content.approve` (Marketing) | — |
| ready for review → changes requested | `content.approve` | A note. Optionally assign a revision task. |
| ready for review → cancelled | `content.approve` | A note (recorded as a rejection) |
| approved → scheduled | `content.schedule` | A publish time |
| scheduled → published | `content.publish` | The live post link (proof) |
| published → archived | `content.publish` | — |

Social Pulse does not post to platforms. Scheduling records the slot. The publisher posts on the platform, then records the link, and the next sync matches it to the observed post for performance.

## Approval lifecycle

1. Submitting for review opens an approval **round** and notifies the reviewers.
2. Marketing approves, requests changes, or rejects. Each decision stores who decided, when, and the note.
3. Requesting changes can open a **revision task** for a designer or editor. The item is reassigned to that person.
4. Resubmitting opens the next round. The content page shows every round in order.

## Task lifecycle

`To do → In progress → Waiting → Done` (or `Cancelled`). A task has an owner, an assignee, a due date, a priority, comments, attachments (media), activity and dependencies. It links to content, a campaign, a course or a monthly plan.

## Department responsibilities

| Department | Plans content | Responsibility |
| --- | --- | --- |
| Marketing | Yes | Reviews, approves and publishes all content; owns brand campaigns |
| Operations | Yes | Course lifecycle: schedules, first sessions, evaluations, certificates |
| Instructional Design | Yes | New programs, curriculum launches, educational content |
| HR | Yes | Employee recognition, new joiners, HR events |
| Corporate / B2B | Yes | Contracts, partnerships, corporate training, case studies |
| Design & Media | No | Design and video production for every department |
| Technical Support | No | Zoom recordings, evaluation cuts, exam technical support |

Each planning department submits a **monthly plan**: targets per template (for example "Course starts next week × 2"). Completion counts published items linked to those targets. Marketing sees all plans; other people see their own department's plan.

## Recurring workflows built as templates

The 15 templates in `src/services/demo/templates.ts` carry required fields, required assets, default caption structure, platforms, workflow steps, default assignees, CTA and triggers. Examples:

- **Course starts next week**: triggered 7 days before a course start. Operations → Marketing → Publish.
- **First session**: needs a Zoom screenshot, the student count, an approved caption and the registration link.
- **Course finished / Evaluation video**: Lecturer → Evaluation employee → Technical Support / Media → Marketing → Publish.
- **Customer certificate**: certificate upload, customer LinkedIn post with an Engosoft mention, employee comment, repost, reward (50% coupon or exam booking support).
- **International exam achievement**: pre-exam support checklist, then congratulations, reward, LinkedIn post and the Hall of Fame.

## KPIs

Operational KPIs (posts completed, tasks completed, on-time delivery, reviews completed, plan completion) are kept separate from content performance (reach, engagement, views, clicks, leads, shares). Reach alone never decides an employee's performance.

## Not built yet

- Authentication and server-side permissions
- Persistence and API endpoints for the new entities (content, tasks, approvals, comments, templates, plans, assets, credits)
- AI generation endpoints. AI Studio shows the interface with Generate disabled.
- File storage for the media library (records hold metadata only)
- A LinkedIn connector, and lead tracking

See [MIGRATION_PLAN.md](MIGRATION_PLAN.md) for the order.
