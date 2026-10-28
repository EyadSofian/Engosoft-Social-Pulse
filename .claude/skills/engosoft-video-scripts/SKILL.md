---
name: engosoft-video-scripts
description: Write short-form video scripts for Engosoft courses and events — Reels, TikTok, Snapchat Spotlight/Stories, YouTube Shorts — as timed scenes with visual, voiceover (in Saudi, MSA or Egyptian), on-screen text, B-roll and audio notes, built to hold watch time and drive shares. Use when generating or reviewing video scripts, the script-writer runtime skill, the Script tab of the content copilot, or requests like "اكتبلي سكربت ريل", "سكريبت تيك توك للكورس", "فيديو قصير للدورة".
---

# Engosoft short-video scripts

Scripts are copy, not footage: the team films or edits from them. The visual pipeline for video is a separate future layer (`engosoft-video-creative`).

## Structure (the kit's `script` object)

```
format: reel | tiktok | snapchat | short     duration: 15–60 s
scenes[]: { t: "0–2s", visual, voiceover, onScreen, broll }
cta, audio (mood + "trending sound or original voice"), caption line, cover text
```

Default beats for a 30 s course promo:

| Time | Beat | Purpose |
|---|---|---|
| 0–2 s | **Hook** — spoken and on screen at once, movement in frame | Stop the scroll |
| 2–8 s | **Problem / promise** — the pain or the outcome | Reason to keep watching |
| 8–22 s | **Proof / value** — 2–3 quick concrete things they will learn (from the facts) | Watch time |
| 22–27 s | **Facts** — date, time (KSA), format | Only verified facts |
| 27–30 s | **CTA** — one action + send/save prompt | Conversion and shares |

## Rules

1. **Hook in the first 2 seconds**, said and shown. Start mid-action (screen recording of the software, instructor pointing at a model) — never a logo intro.
2. **One idea per scene, ≤ 12 spoken words per 3 seconds.** Arabic voiceover is slower than English; keep sentences short.
3. **On-screen text ≤ 7 words**, inside the platform safe area (avoid the bottom 20% and right edge on TikTok/Reels).
4. **Spoken keywords**: say the course name and the problem in plain words — platforms transcribe speech for search.
5. **Dialect**: Saudi white dialect by default for Reels/TikTok/Snap aimed at KSA; MSA for YouTube/LinkedIn video; Egyptian for Egypt-targeted. Product names stay Latin.
6. **Facts are locked**: no invented dates, prices, seat counts or results.
7. **Loopable ending** for Reels/TikTok: last line connects back to the hook when natural.
8. **Audio**: suggest a mood ("upbeat corporate", "calm lo-fi"), not a specific copyrighted song. Business accounts must use the commercial sound library.
9. **Snapchat**: vertical selfie-style, faster cuts, 10–20 s, a poll/question sticker idea.
10. **YouTube Shorts**: up to 60 s here, title ≤ 100 characters with the keyword first.

## Formats to rotate (avoid repeating the same promo)

- *Course teaser* (the default above)
- *Mistake → fix* ("أكبر غلطة في …")
- *Before / after* (2D drawing → coordinated model)
- *Day-in-the-life* of the role the course leads to
- *Instructor tip* (one practical tip, then the course)
- *Myth vs fact* about the certification
- *Student question* answered in 20 s
