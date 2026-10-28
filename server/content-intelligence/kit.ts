/**
 * The content kit of a post: angle, hooks, a native caption per platform, a short-video script, a carousel,
 * stories, hashtags and search keywords — written once by the content skills in the chosen register and kept
 * beside the post. A kit never changes the post's approved copy; people apply what they want from it.
 * Rules: .claude/skills/engosoft-content-strategist.
 */
import type express from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { requireUser, userCan, type AuthUser } from '../auth.js';
import { contentFacts } from '../captions.js';
import { contentSkills, voiceRules } from '../creative-intelligence/skills/content.js';
import { runStage, skillVersions } from '../creative-intelligence/skills/types.js';
import { db, defineSchema } from '../db.js';
import { requireAiBudget } from '../usage.js';
import { canEdit, canSee, getContent, type StoredContent } from '../workspace.js';
import { DIALECTS, KIT_PARTS, SCRIPT_FORMATS, SCRIPT_INFO, type ContentKit, type Dialect, type HookFormula, type KitPart, type KitScript, type ScriptFormat } from '../../src/domain/content-voice.js';
import { unverifiedNumbers } from '../../src/domain/platform-content.js';
import { upcomingOccasions } from '../../src/lib/occasions.js';
import { scanTrends } from './trends.js';

defineSchema(`CREATE TABLE IF NOT EXISTS content_kits (
  content_id TEXT PRIMARY KEY, kit_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`);

export async function getKit(contentId: string): Promise<ContentKit | null> {
  const row = await db.get<{ kit_json: string }>('SELECT kit_json FROM content_kits WHERE content_id=?', [contentId]);
  try { return row ? JSON.parse(row.kit_json) as ContentKit : null; } catch { return null; }
}
async function saveKit(contentId: string, kit: ContentKit, userId: string) {
  const now = new Date().toISOString();
  await db.run('DELETE FROM content_kits WHERE content_id=?', [contentId]);
  await db.run('INSERT INTO content_kits (content_id,kit_json,updated_by,updated_at) VALUES (?,?,?,?)', [contentId, JSON.stringify(kit), userId, now]);
}

const contentModel = (env: NodeJS.ProcessEnv) => env.OPENAI_CONTENT_MODEL?.trim() || env.OPENAI_CREATIVE_TEXT_MODEL?.trim() || 'gpt-5.5';
/** Occasions are planned in Saudi time: most of the audience lives there. */
const saudiToday = () => DateTime.now().setZone('Asia/Riyadh').toISODate() ?? new Date().toISOString().slice(0, 10);

interface StageOut {
  kitStrategist?: { idea: string; audience: string; insight: string; pillar: string; occasions: { day: string; name: string; idea: string }[] };
  hookWriterSocial?: { hooks: { text: string; formula: HookFormula; spoken: string }[] };
  scriptWriter?: KitScript;
  carouselWriter?: { slides: { title: string; body: string }[]; stories: { frame: string; sticker: string }[] };
  hashtagStrategist?: { core: string[]; niche: string[]; local: string[]; keywords: string[] };
}

const tag = (value: string) => { const t = value.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, ''); return t.length > 1 ? `#${t}` : ''; };
const tags = (values: string[], max: number) => [...new Set(values.map(tag).filter(Boolean))].slice(0, max);

/**
 * Writes one part of a post's kit and merges it into what is already there: `ideas` (angle, opening lines,
 * hashtags, occasion links — the suggestions for the caption), `script` (a short video) or `carousel`
 * (slides and stories). Digits nobody supplied become warnings.
 */
export async function generateKit(input: { item: StoredContent; user: AuthUser; part: KitPart; dialect: Dialect; format: ScriptFormat; previous: ContentKit | null }, env: NodeJS.ProcessEnv = process.env): Promise<ContentKit> {
  const { item, part, dialect, format } = input;
  const base = input.previous ?? emptyKit(input.user.id);
  const seconds = SCRIPT_INFO[format].seconds;
  const facts = contentFacts(item);
  const occasions = upcomingOccasions(saudiToday(), 45, 6);
  const skills = contentSkills(part, format, seconds);
  const model = contentModel(env);
  const angle = base.angle.idea ? `The angle already chosen for this post (keep to it): ${base.angle.idea}` : '';

  const out = await runStage<StageOut>({
    name: `content_${part}`, env, model, reasoning: 'low', skills,
    intro: [
      'You are the content team of Engosoft, a professional engineering and business training company serving Saudi Arabia and Egypt. You write for ONE post, in one voice.',
      'Voice for every piece of text:',
      ...voiceRules(dialect, 'expert', 'register').map((rule) => `- ${rule}`),
    ].join('\n'),
    content: [{
      type: 'input_text',
      text: [
        `Platforms the post is for: ${item.channels.join(', ')}`,
        part === 'script' ? `Video format: ${format}, ${seconds} seconds` : '',
        `Today (Saudi time): ${saudiToday()}`,
        part === 'ideas' ? `Upcoming occasions (data):\n${occasions.map((o) => `- ${o.day}: ${o.name}${o.region ? ` (${o.region})` : ''}${o.approximate ? ' — Hijri, ±1 day' : ''}`).join('\n') || '- none'}` : angle,
        base.trends?.items.length ? `Current trends that may fit (data, use only when the link is genuine):\n${base.trends.items.filter((t) => t.fit >= 60).map((t) => `- ${t.title}: ${t.howToUse}`).join('\n')}` : '',
        `Facts about the post (data only):\n${facts}`,
      ].filter(Boolean).join('\n\n'),
    }],
  });

  const kit: ContentKit = { ...base, dialect, skills: { ...base.skills, ...skillVersions(skills) }, model, generatedBy: input.user.id, parts: { ...base.parts, [part]: new Date().toISOString() } };
  const written: string[] = [];
  if (out.kitStrategist && out.hookWriterSocial && out.hashtagStrategist) {
    const known = new Set(occasions.map((o) => o.day));
    kit.angle = { idea: out.kitStrategist.idea, audience: out.kitStrategist.audience, insight: out.kitStrategist.insight, pillar: out.kitStrategist.pillar };
    // Only occasions we actually gave the writer: a model cannot add a date of its own.
    kit.occasions = out.kitStrategist.occasions.filter((o) => known.has(o.day) && o.idea.trim());
    kit.hooks = out.hookWriterSocial.hooks.filter((h) => h.text.trim()).slice(0, 6);
    kit.hashtags = { core: tags(out.hashtagStrategist.core, 3), niche: tags(out.hashtagStrategist.niche, 5), local: tags(out.hashtagStrategist.local, 3) };
    kit.keywords = [...new Set(out.hashtagStrategist.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 8);
    kit.generatedAt = kit.parts!.ideas!;
    written.push(...kit.hooks.map((h) => h.text));
  }
  if (out.scriptWriter) {
    kit.script = { ...out.scriptWriter, format, seconds };
    written.push(...kit.script.scenes.flatMap((s) => [s.voiceover, s.onScreen]), kit.script.cta, kit.script.cover);
  }
  if (out.carouselWriter) {
    kit.carousel = out.carouselWriter.slides.slice(0, 10);
    kit.stories = out.carouselWriter.stories.slice(0, 6);
    written.push(...kit.carousel.flatMap((s) => [s.title, s.body]), ...kit.stories.map((s) => s.frame));
  }
  const unknown = unverifiedNumbers(written.join('\n'), [facts]);
  kit.warnings = unknown.length ? [`أرقام غير موجودة في بيانات المنشور، راجعها قبل النشر: ${unknown.join('، ')}`] : [];
  return kit;
}

export function registerContentKitRoutes(app: express.Express) {
  const unavailable = (res: express.Response) => { if (process.env.OPENAI_API_KEY?.trim()) return false; res.status(503).json({ error: 'أضف OPENAI_API_KEY على الخادم.' }); return true; };
  const failure = (res: express.Response, error: unknown, fallback: string) => res.status(502).json({ error: error instanceof Error ? error.message : fallback });
  /** Writing a kit leaves the post untouched, so approvers may ask for one on approved work too. */
  const mayWrite = (user: AuthUser, item: StoredContent) => canSee(user, item) && (canEdit(user, item) || userCan(user, 'content.approve') || userCan(user, 'content.create'));
  const load = async (req: express.Request, res: express.Response, write: boolean) => {
    const item = await getContent(String(req.params.id));
    if (!item || !canSee(req.user!, item)) { res.status(404).json({ error: 'المحتوى غير موجود.' }); return null; }
    if (write && !mayWrite(req.user!, item)) { res.status(403).json({ error: 'لا تملك صلاحية كتابة محتوى لهذا المنشور.', code: 'forbidden' }); return null; }
    return item;
  };

  app.get('/api/content/:id/kit', requireUser, async (req, res) => {
    const item = await load(req, res, false);
    if (item) res.json({ kit: await getKit(item.id) });
  });

  app.post('/api/content/:id/kit', requireUser, requireAiBudget, async (req, res) => {
    const parsed = z.object({ part: z.enum(KIT_PARTS).default('ideas'), dialect: z.enum(DIALECTS).default('saudi'), format: z.enum(SCRIPT_FORMATS).default('reel') }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'اختيارات غير صالحة.' });
    const item = await load(req, res, true);
    if (!item || unavailable(res)) return;
    try {
      const kit = await generateKit({ item, user: req.user!, ...parsed.data, previous: await getKit(item.id) });
      await saveKit(item.id, kit, req.user!.id);
      res.json({ kit });
    } catch (error) { failure(res, error, 'تعذّرت كتابة حزمة المحتوى.'); }
  });

  app.post('/api/content/:id/kit/trends', requireUser, requireAiBudget, async (req, res) => {
    const parsed = z.object({ focus: z.string().trim().max(200).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'اكتب موضوعًا أقصر.' });
    const item = await load(req, res, true);
    if (!item || unavailable(res)) return;
    try {
      const current = await getKit(item.id);
      const trends = await scanTrends({ facts: contentFacts(item), focus: parsed.data.focus, today: saudiToday() });
      // A scan before any kit is kept on an empty kit shell so the next kit can use it.
      const kit: ContentKit = current ? { ...current, trends } : { ...emptyKit(req.user!.id), trends };
      await saveKit(item.id, kit, req.user!.id);
      res.json({ kit });
    } catch (error) { failure(res, error, 'تعذّر البحث عن التريندات الآن.'); }
  });
}

function emptyKit(userId: string): ContentKit {
  return {
    dialect: 'saudi', tone: 'expert', goal: 'register', angle: { idea: '', audience: '', insight: '', pillar: '' }, hooks: [], captions: {},
    script: { format: 'reel', seconds: 0, title: '', cover: '', scenes: [], cta: '', audio: '' }, carousel: [], stories: [],
    hashtags: { core: [], niche: [], local: [] }, keywords: [], warnings: [], occasions: [], skills: {}, model: '', generatedAt: '', generatedBy: userId,
  };
}
