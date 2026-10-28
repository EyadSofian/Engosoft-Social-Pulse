---
name: engosoft-content-strategist
description: Plan and write the full content kit for one Engosoft post — angle, hooks, a native caption per platform, short-video script, carousel, stories, hashtags and keywords, posting windows — tuned to each platform's 2026 behaviour and to Saudi/Egyptian audiences. Use when working on the AI content layer (server/content-intelligence/, server/creative-intelligence/skills/content.ts, src/features/content/ContentCopilot.tsx), changing platform rules, writing hooks/CTAs, or answering "اعمل محتوى للبوست ده لكل المنصات", "اكتبلي كابشن انستا وتيك توك", "حسّن النص".
---

# Engosoft content strategist

One post → one **content kit**. The kit is written once from the post's verified facts and shown beside the post in the approval drawer (**مساعد المحتوى**). It never edits approved copy by itself: people apply what they like.

```
post facts (title, approved copy, template fields, existing captions)
  + dialect · tone · goal (chosen in the panel)
  + upcoming occasions (src/lib/occasions.ts) and, when scanned, live trends
  → CONTENT stage (runtime skills in server/creative-intelligence/skills/content.ts)
      kit-strategist · hook-writer-social · platform-copywriter · script-writer · carousel-writer · hashtag-strategist
  → local checks (platform-content.ts analyzeCaption, unverifiedNumbers) → saved in content_kits
```

| File | Owns |
|---|---|
| `src/domain/content-voice.ts` | Dialects, tones, goals, kit types, posting windows (shared with the UI) |
| `src/domain/platform-content.ts` | Platform limits, folds, hashtag ranges, link handling, caption checks |
| `server/creative-intelligence/skills/content.ts` | The content skills (rules + strict schema + version) |
| `server/content-intelligence/kit.ts` | Facts → stage → checks → storage; routes |
| `server/content-intelligence/trends.ts` | Live trend scan (OpenAI `web_search`, Saudi location) |

## The rules that make content professional

1. **One angle per post.** Career outcome, practical skill, authority, cohort urgency (real dates only), community, recognition. The angle drives every platform's version.
2. **Native per platform, never pasted.** Different hook, length, structure and CTA on each platform (see [PLATFORM_PLAYBOOKS.md](PLATFORM_PLAYBOOKS.md)).
3. **The hook carries the post.** First line before the fold; first 1–2 seconds of a video. Formulas in [HOOKS_AND_CTAS.md](HOOKS_AND_CTAS.md).
4. **Search is the new hashtag.** Instagram, TikTok and YouTube rank by keywords in the caption, on-screen text and speech. Put the course name and the problem it solves in plain words; hashtags are few and specific.
5. **Facts are locked.** Dates, times, prices, seats, instructors, certificates and accreditation come only from the post. Any digit the writer adds that is not in the facts is flagged in the UI (`unverifiedNumbers`).
6. **Voice by audience** — Saudi white dialect for Saudi-facing short-form, MSA for LinkedIn/website/B2B, Egyptian for Egypt-targeted posts. See the `engosoft-arabic-voice` skill.
7. **Respect the calendar.** Ramadan, Eid, Founding Day (22 Feb), Flag Day (11 Mar), National Day (23 Sep) change both tone and timing. Tie a post to an occasion only when the link is genuine. See the `engosoft-trend-radar` skill.
8. **Measure, then trust.** Posting windows are starting points for KSA (Asia/Riyadh); the account's own insights win.

## Changing it

- Edit the skill that owns the decision in `skills/content.ts` and bump its version (`script-writer:v2`); versions are saved with every kit.
- Platform numbers live only in `PLATFORM_SPECS`; prompts read them from there.
- Keep this skill, `content-voice.ts` and the runtime skills in step.
