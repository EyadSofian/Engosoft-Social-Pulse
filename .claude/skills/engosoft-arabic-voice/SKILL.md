---
name: engosoft-arabic-voice
description: Write Engosoft social copy in the right Arabic register — Saudi "white" dialect (اللهجة السعودية البيضاء), Modern Standard Arabic (فصحى معاصرة), Egyptian, or English — with the brand voice, word choices, numerals, hashtags and the hard no-go list. Use whenever writing or reviewing captions, hooks, scripts or on-screen copy in Arabic, choosing a dialect for an audience, changing the voice prompts in server/content-intelligence/, or answering requests like "خليها سعودي", "اكتبها فصحى", "حوّلها لهجة خليجية".
---

# Engosoft Arabic voice

Engosoft trains engineers and professionals in Egypt and Saudi Arabia. The voice is **an experienced engineer who teaches well**: sure of the facts, generous with the benefit, never loud.

The same rules live in code: `src/domain/content-voice.ts` (dialect and tone data shown in the UI) and `server/content-intelligence/playbook.ts` (the prompt). Change both with this file.

## Pick the register by audience, not by habit

| Register | Use for | Sounds like |
|---|---|---|
| `saudi` — Saudi white dialect | Instagram, TikTok, Snapchat, Reels/Shorts scripts, stories, WhatsApp to Saudi audiences | "ودّك تتقن Revit MEP من الصفر؟ الدورة تبدأ الأربعاء، والمقاعد محدودة." |
| `msa` — Modern Standard Arabic | LinkedIn, website, YouTube descriptions, announcements, B2B/corporate, accreditation news, mixed Egypt+Gulf audience | "أتقِن Revit MEP عبر برنامج تطبيقي يبدأ يوم الأربعاء." |
| `egyptian` — Egyptian (light) | Egypt-targeted Facebook/Instagram/TikTok | "عايز تبدأ في Revit MEP صح؟ الكورس بيبدأ الأربع." |
| `english` | International or English-first audiences | Clear, benefit-first professional English |

Rules that hold in every register:

1. **One register per caption.** Never mix Saudi and Egyptian forms in one text (no "ودّك" with "عايز"). MSA connectors inside a dialect caption are fine.
2. **Technical names stay Latin**: Revit MEP, AutoCAD, Primavera P6, PMP, CFM, BIM, ETABS. Never transliterate them (لا "ريفيت").
3. **Numbers**: Latin digits (18-11-2026, 8:00). Time zone explicit for KSA ("8:00 مساءً بتوقيت السعودية").
4. **Facts are fixed**: dialect changes the wording, never the date, price, hours, certificate or instructor.
5. **Respect**: no slang that mocks, no religious phrases used as sales hooks, no gendered assumptions (write to both: "سجّل/سجّلي" only when natural; otherwise neutral "سجّل الآن").

## Saudi white dialect — what makes it sound native

"White" = understood across Najd, Hijaz and the East, not tied to one city. Use it lightly: a Saudi reader should feel *spoken to*, not imitated.

Use (natural, safe):
- ودّك / تبي / تبغى (want) — prefer **ودّك** and **تبي** in hooks.
- وش (what), ليش (why), كيف (how), متى، وين
- مرّة (very) — "مرّة مفيدة"، كثير
- الحين (now), بعدين، على طول
- يعني، بس، خلاص، أكيد
- تقدر (you can), نبدأ، نعلّمك، بنشرح
- زين / حلو (good), ممتاز
- "لا تفوّتها"، "سجّل مقعدك"، "الرابط في البايو"
- Calls to action: "سجّل الحين"، "احجز مقعدك"، "ابدأ معنا"

Avoid in Saudi copy:
- Egyptian forms: عايز، إزاي، دلوقتي، كده، أوي، بتاع، هنا "بـ" المضارعة المصرية (بيبدأ).
- Heavy local slang that is city-specific or youth-meme slang (e.g. "يا عيال"، "مرّة كذا" overuse).
- Over-religious phrasing in commercial lines. "إن شاء الله" only for genuine future intent, not as decoration.
- Translated-sounding MSA ("قم بالتسجيل الآن") — say "سجّل الحين".

## Modern Standard Arabic — modern, not stiff

- Short active sentences. "أتقِن"، "ابدأ"، "طوّر" — not "قم بـ".
- No archaic or literary flourishes (لا "هلمّ"، "ألا وإنّ").
- Fine to drop full tashkeel; add a shadda/kasra only where it removes ambiguity (أتقِن).
- LinkedIn MSA opens with an insight or outcome, not with "يسعدنا أن نعلن".

## Egyptian (when the audience is Egypt)

- عايز/عاوز، إزاي، دلوقتي، هتتعلّم، "الكورس بيبدأ".
- Keep it professional: no "يا معلم"، no sarcasm.

## Tone presets

| Tone | Feel | Emojis |
|---|---|---|
| `expert` (default) | Confident engineer, insight-led | 0–1 |
| `friendly` | Warm, encouraging, "إحنا معك" | 1–2 |
| `energetic` | Short punchy lines, urgency from real facts only (real seat limits, real dates) | 1–3 |
| `formal` | Corporate/announcement, MSA strongly preferred | 0 |

## Hard no-go list (all registers)

- Invented facts: prices, discounts, seats left, "الأول في السعودية", accreditation, guaranteed jobs, salaries, statistics, testimonials.
- Fake urgency ("آخر فرصة!!") without a real deadline in the facts.
- Disparaging competitors, politics, sectarian or religious controversy.
- Influencer-style paid claims: Engosoft posts from its own commercial account; if a post is a paid partnership with a creator, the creator needs a GAMR **Mawthooq (موثوق)** licence and the post must be disclosed as an ad.
- More than one exclamation mark. ALL CAPS in English.

Examples: [EXAMPLES.md](EXAMPLES.md)
