---
name: engosoft-trend-radar
description: Find and use trends safely for Engosoft content in Saudi Arabia and Egypt — the occasions calendar (Hijri and Gregorian), live trend scanning with OpenAI web search (Saudi location, cited sources), trend-fit scoring, and the rules for when NOT to ride a trend. Use when working on server/content-intelligence/trends.ts, the Trends tab of the content copilot, src/lib/occasions.ts, or requests like "إيه التريند في السعودية", "اربط البوست بالتريند", "مناسبات الشهر الجاي".
---

# Engosoft trend radar

Two sources, never mixed up:

1. **Calendar (free, offline)** — `src/lib/occasions.ts`: national days (Saudi Founding Day 22 Feb, Flag Day 11 Mar, National Day 23 Sep; Egyptian and UAE days), Hijri occasions by the Umm al-Qura calendar (Ramadan, Eid al-Fitr, Arafah, Eid al-Adha, Hijri New Year — ±1 day by moon sighting), global days that fit an engineering brand (World Engineering Day 4 Mar, Safety & Health at Work 28 Apr, World Standards Day 14 Oct, World Quality Day, Project Management Day), and commerce seasons (White Friday). The kit receives the next 45 days.
2. **Live scan (paid, on demand)** — `server/content-intelligence/trends.ts` calls the OpenAI Responses API with the `web_search` tool, `user_location` Saudi Arabia (Riyadh), and asks for what is trending *now* in Saudi engineering, construction, training and social formats that fits the post. Each trend returns: title, why it is relevant, how to use it on this post, fit score 0–100, risk note, platforms, and **cited sources** that the UI shows as clickable links. Results are cached on the kit with the scan time.

## Trend-fit rules

- Use a trend only when it **genuinely connects** to the course topic, the audience's job, or the occasion. Fit < 60 → show, but do not suggest.
- Formats travel better than topics: a trending *format* (POV, "things nobody tells you about…", before/after, mistake→fix) is usually a safer fit than a trending news topic.
- **Never** ride: tragedies, accidents, deaths, politics, royal family matters, religious debates, sectarian or tribal topics, rumours, competitors' crises.
- Religious occasions: greet with respect; commercial pushes are soft (e.g. "Ramadan learning schedule"), never "Eid discount" unless the discount is a real fact.
- National days: pride and contribution to Vision 2030 / national projects — no fabricated government endorsements, no misuse of the national emblem or flag (the flag carries the Shahada: never on merchandise, never at half-mast, never inverted).
- A trend expires: anything older than ~10 days is stale for short-form.
- Sounds: suggest the *type* of trending sound; brand accounts must use the commercial library.

## Saudi key dates 2026–2027

See [SAUDI_CALENDAR.md](SAUDI_CALENDAR.md).
