# Dashboard redesign plan

Status: agreed direction, 2026-10-26. Nothing here is built yet.

Decisions (product owner, 2026-10-26): sign-in by **email + password** managed by an admin; **6 tabs** with the Calendar kept separate; Studio starts with **editable text layers**, AI region edit second.

## What exists today (audited)

| Area | Reality |
| --- | --- |
| Navigation | 15 tabs: Create, Overview, My Work, Content, Calendar, Tasks & Approvals, Templates, AI Studio, Media, Hall of Fame, Departments, Analytics, Credits, Connections, Admin |
| Social tracking | **Real.** Server syncs Facebook (151 posts), Instagram (301), TikTok (1,360 videos) every 30 min into SQLite on Railway; per-post views, reach, interactions, engagement rate; plan ↔ published-post matching by link/ID; publish alerts. Must be kept. |
| Workspace (content, tasks, approvals, users, departments, credits, Hall of Fame, media) | **Demo only.** Built from `services/demo/seed.ts` in browser memory; every change is lost on reload; "users" is a *view as* switcher, not sign-in. |
| Creation | New full-AI pipeline (GPT Image full post + exact logo), loopback-only until sign-in exists. |
| Editing | Old SVG/Fabric editor for template layouts; generated posts cannot be edited. |

The core business-logic problem: departments can't really hand work to marketing, because the workspace is not stored anywhere and there are no real users.

## Target information architecture: 15 tabs → 6

| New tab | Replaces | Purpose |
| --- | --- | --- |
| **إنشاء — Create** | Create, AI Studio, Templates (AI) | Prompt → full AI posts → Studio editing → caption → send for approval |
| **المحتوى — Content** | Content, My Work, Tasks & Approvals, Hall of Fame | One pipeline board: Draft → In review → Changes requested → Approved → Scheduled → Published (proven by sync). Filters: mine, my department, platform |
| **التقويم — Calendar** | Calendar | Publishing calendar on the real plans, with best-time suggestions and publish alerts |
| **الأداء — Performance** | Overview, Analytics | Real per-post metrics per platform, best posts, department contribution, publish compliance |
| **المكتبة — Library** | Media, Templates | Approved creatives, brand assets, **AI templates** (saved recipes), Odoo courses |
| **الإعدادات — Settings** | Departments, Credits, Connections, Admin | Users & roles, departments, credit limits, platform connections |

## Content lifecycle across departments

```
Operations / HR / Training / Corporate user
  → creates a post in Create (AI) — status Draft, owner = user, department = user's department
  → "Send to marketing" — status In review, notifies social media managers
Social media manager (Marketing)
  → approve | request changes (comment, back to owner) | reject
  → schedule: platform + time (best-time suggestion from real history)
Publishing (manual today; the app does not auto-post)
  → published post is matched by sync (link or platform ID) → status Published + live metrics
Performance
  → each post's metrics roll up to its department and owner
```

Requirements: server-side storage (SQLite) for content, versions, approvals, comments, users; real sign-in; audit trail per transition. Existing workflow types in `src/domain/workflow.ts` (Approval rounds, Task, ContentTemplate) are reusable; the demo seed is not.

Sign-in: email + password. Admin creates users with department and role; passwords hashed (scrypt), HTTP-only session cookie, login rate limit, password reset by admin. AI endpoints open beyond localhost only behind a session.

## Studio: editing an AI-generated post

Generated posts are flat images, so "edit the text" and "change this element" need two mechanisms:

| Mode | How | Keeps generated style | Speed |
| --- | --- | --- | --- |
| **AI edit (region)** | User clicks a detected element (text, face, subject — boxes from the inspector) or brushes a region; we send a masked GPT Image edit with an exact instruction ("replace with «…» in the same style", "make it a laptop"). Copy check and logo resolver rerun; logo is re-composited from the exact file. | Yes | 30–120 s |
| **Editable layers** | "Make text editable": inpaint text regions out (masked edit) to get a clean background, then re-render each text as a live layer with the brand fonts (HarfBuzz outlines), color and size estimated from the original. Text then edits instantly and is always exact Arabic. | Typography becomes brand-standard, not the generated style | Instant after one conversion |

Canvas: Fabric.js (already a dependency) with layers panel (AI image, text layers, locked logo), zoom/pan, undo, version branches (every AI edit is a new version; nothing is overwritten), export per platform.

Order (decided): editable text layers first, then AI region edit.

## Captions and AI templates

- Caption per platform (Facebook long, Instagram short + hashtags, WhatsApp direct, LinkedIn professional) with the verified Odoo registration link; copy button; edited caption is versioned with the post.
- **AI template** = saved recipe: name, objective, prompt skeleton with fields (course, date, instructor), chosen direction style, approved reference images, platforms. Using it fills fields from Odoo and generates. Approved posts can be saved as a template's style reference.

## Visual system and motion

- Glass surfaces (`backdrop-filter` blur + translucent fills + hairline borders) on a deep brand-blue/neutral backdrop; keep text contrast ≥ 4.5:1; reduce blur on low-power devices.
- Motion (`motion` package, already installed): shared-layout transitions between tabs, staggered card entrance, spring hover; respect `prefers-reduced-motion`.
- Generation: streamed partial images from `gpt-image-2` (verified: `stream: true, partial_images`) revealed with a blur-to-sharp transition, stage labels underneath. `gpt-image-2.5-flare` returned no partials in the test.
- Screenshot-and-iterate on desktop and phone widths for every screen.

## Phases

1. Persistence + sign-in + roles (server): content, versions, approvals, users, departments.
2. Navigation 15 → 6 and glass/motion shell; keep Performance on the existing real sync.
3. Create + streamed generation animation + captions + send-to-marketing.
4. Studio editable text layers (clean plate + live brand-font text, version branches).
5. Studio AI region edit.
6. AI templates.
7. Production deploy to Railway with sign-in, then open AI endpoints beyond localhost.
