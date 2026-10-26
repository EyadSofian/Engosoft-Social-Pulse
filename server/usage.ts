/**
 * AI spend ledger. Every OpenAI call records its tokens and cost against the signed-in person who started it
 * (carried through async work by AsyncLocalStorage), so admins see what each image, edit and template cost and
 * can cap each person's monthly budget.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type express from 'express';
import { z } from 'zod';
import { getUser, listUsers, requirePermission, requireUser, userCan } from './auth.js';
import { getSetting, setSetting } from './settings.js';
import { db } from './store.js';

db.exec(`
CREATE TABLE IF NOT EXISTS ai_usage (
 id TEXT PRIMARY KEY, user_id TEXT, purpose TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, model TEXT NOT NULL,
 text_in INTEGER NOT NULL DEFAULT 0, image_in INTEGER NOT NULL DEFAULT 0, out_tokens INTEGER NOT NULL DEFAULT 0,
 images INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, estimated INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_by_user ON ai_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_by_time ON ai_usage(created_at);
CREATE TABLE IF NOT EXISTS user_budgets (user_id TEXT PRIMARY KEY, monthly_usd REAL, updated_at TEXT NOT NULL);
`);

/** USD per 1M tokens. Text models price image input as input. Source: OpenAI API pricing page, standard tier. */
export interface ModelRate { textIn: number; imageIn: number; out: number }
export interface Pricing { usdToEgp: number; defaultMonthlyUsd: number | null; models: Record<string, ModelRate> }
export const DEFAULT_PRICING: Pricing = {
  usdToEgp: 50,
  defaultMonthlyUsd: null,
  models: {
    'gpt-image-2.5-flare': { textIn: 5, imageIn: 8, out: 30 },
    'gpt-image-2': { textIn: 5, imageIn: 8, out: 30 },
    'gpt-image-1.5': { textIn: 5, imageIn: 8, out: 32 },
    'gpt-image-1': { textIn: 5, imageIn: 10, out: 40 },
    'gpt-image-1-mini': { textIn: 2, imageIn: 2.5, out: 8 },
    'gpt-5': { textIn: 1.25, imageIn: 1.25, out: 10 },
    'gpt-5-mini': { textIn: 0.25, imageIn: 0.25, out: 2 },
    'gpt-4.1': { textIn: 2, imageIn: 2, out: 8 },
    'gpt-4.1-mini': { textIn: 0.4, imageIn: 0.4, out: 1.6 },
  },
};
export const getPricing = (): Pricing => {
  const saved = getSetting<Pricing>('ai.pricing', DEFAULT_PRICING);
  return { ...saved, models: { ...DEFAULT_PRICING.models, ...saved.models } };
};

function rateFor(model: string, pricing: Pricing): ModelRate {
  if (pricing.models[model]) return pricing.models[model];
  // Dated snapshots ("gpt-5-mini-2025-08-07") use their family's rate.
  const family = Object.keys(pricing.models).sort((a, b) => b.length - a.length).find((name) => model.startsWith(name));
  if (family) return pricing.models[family];
  return model.startsWith('gpt-image') ? pricing.models['gpt-image-2'] : pricing.models['gpt-4.1-mini'];
}

/** Output image tokens by quality and size when a response carries no usage block (published gpt-image token table). */
function estimatedImageTokens(size: string, quality: string): number {
  const [w, h] = size.split('x').map(Number);
  const area = (w || 1024) * (h || 1024);
  const perMegapixel: Record<string, number> = { low: 260, medium: 1010, high: 3970, auto: 3970 };
  return Math.round((perMegapixel[quality] ?? 3970) * (area / 1_048_576));
}

interface Scope { userId: string | null; purpose: string }
const scope = new AsyncLocalStorage<Scope>();
/** Attributes every AI call made inside `work` (including async continuations) to this person and purpose. */
export const withUsage = <T>(userId: string | null, purpose: string, work: () => T): T => scope.run({ userId, purpose }, work);
/** Names the purpose of the calls inside `work` while keeping the person from the surrounding scope. */
export const asPurpose = <T>(purpose: string, work: () => T): T => scope.run({ userId: scope.getStore()?.userId ?? null, purpose }, work);

export interface OpenAIUsage { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } }

/** Records one OpenAI call. Never throws: a ledger failure must not fail the creative work that already happened. */
export function recordUsage(input: { kind: 'image' | 'image_edit' | 'text'; model: string; usage?: OpenAIUsage; images?: number; size?: string; quality?: string }) {
  try {
    const pricing = getPricing();
    const rate = rateFor(input.model, pricing);
    const details = input.usage?.input_tokens_details;
    let textIn = 0, imageIn = 0, out = 0, estimated = 0;
    if (input.usage) {
      imageIn = details?.image_tokens ?? 0;
      textIn = details?.text_tokens ?? Math.max(0, (input.usage.input_tokens ?? 0) - imageIn);
      out = input.usage.output_tokens ?? 0;
    } else if (input.kind !== 'text') {
      out = estimatedImageTokens(input.size ?? '1024x1024', input.quality ?? 'high') * (input.images ?? 1);
      textIn = 600;
      estimated = 1;
    }
    const cost = (textIn * rate.textIn + imageIn * rate.imageIn + out * rate.out) / 1_000_000;
    const current = scope.getStore();
    db.prepare('INSERT INTO ai_usage (id,user_id,purpose,kind,model,text_in,image_in,out_tokens,images,cost_usd,estimated,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), current?.userId ?? null, current?.purpose ?? '', input.kind, input.model, textIn, imageIn, out, input.images ?? 0, cost, estimated, new Date().toISOString());
  } catch (error) {
    console.error('AI usage not recorded:', error instanceof Error ? error.message : error);
  }
}

const monthStart = (month?: string) => `${month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`;
const nextMonth = (start: string) => {
  const date = new Date(start);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
};

export function spentThisMonth(userId: string): number {
  const start = monthStart();
  const row = db.prepare('SELECT COALESCE(SUM(cost_usd),0) AS total FROM ai_usage WHERE user_id=? AND created_at>=?').get(userId, start) as { total: number };
  return row.total;
}
export function budgetOf(userId: string): number | null {
  const row = db.prepare('SELECT monthly_usd FROM user_budgets WHERE user_id=?').get(userId) as { monthly_usd: number | null } | undefined;
  return row ? row.monthly_usd : getPricing().defaultMonthlyUsd;
}

/** Blocks a new AI job when the person has used up this month's budget. Admins set budgets on the Usage page. */
export const requireAiBudget: express.RequestHandler = (req, res, next) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'سجّل الدخول أولًا.' });
  const budget = budgetOf(user.id);
  if (budget != null) {
    const spent = spentThisMonth(user.id);
    if (spent >= budget) {
      return res.status(402).json({ error: `نفد رصيدك الشهري للذكاء الاصطناعي (استخدمت $${spent.toFixed(2)} من $${budget.toFixed(2)}). تواصل مع مسؤول النظام لزيادته.`, code: 'budget_exceeded' });
    }
  }
  withUsage(user.id, purposeOf(req.originalUrl.split('?')[0]), next);
};

const PURPOSES: [RegExp, string][] = [
  [/full-creative\/.+\/adapt/, 'adapt'],
  [/full-creative/, 'generate'],
  [/ai-edit/, 'studio_ai_edit'],
  [/decompose/, 'studio_layers'],
  [/svg-templates\/generate/, 'template_generate'],
  [/svg-templates\/.+\/revise/, 'template_revise'],
  [/captions/, 'captions'],
];
const purposeOf = (path: string) => PURPOSES.find(([pattern]) => pattern.test(path))?.[1] ?? path.replace(/^\/api\//, '');

export function registerUsageRoutes(app: express.Express) {
  app.get('/api/usage', requireUser, (req, res) => {
    const me = req.user!;
    const all = userCan(me, 'users.manage');
    const start = monthStart(typeof req.query.month === 'string' ? req.query.month : undefined);
    const end = nextMonth(start);
    const where = all ? 'created_at>=? AND created_at<?' : 'created_at>=? AND created_at<? AND user_id=?';
    const args = all ? [start, end] : [start, end, me.id];
    const rows = db.prepare(`SELECT * FROM ai_usage WHERE ${where} ORDER BY created_at DESC`).all(...args) as Record<string, unknown>[];
    const pricing = getPricing();
    const people = all ? listUsers() : [getUser(me.id)!];
    const byUser = people.map((user) => {
      const mine = rows.filter((row) => row.user_id === user.id);
      return {
        userId: user.id, name: user.name, email: user.email, departmentId: user.departmentId, status: user.status,
        spentUsd: mine.reduce((sum, row) => sum + Number(row.cost_usd), 0),
        images: mine.reduce((sum, row) => sum + Number(row.images), 0),
        calls: mine.length,
        budgetUsd: budgetOf(user.id),
        monthToDateUsd: spentThisMonth(user.id),
      };
    });
    const group = (key: string) => Object.entries(rows.reduce<Record<string, { usd: number; calls: number; images: number }>>((acc, row) => {
      const name = String(row[key] || 'other');
      acc[name] ??= { usd: 0, calls: 0, images: 0 };
      acc[name].usd += Number(row.cost_usd);
      acc[name].calls += 1;
      acc[name].images += Number(row.images);
      return acc;
    }, {})).map(([name, value]) => ({ name, ...value })).sort((a, b) => b.usd - a.usd);
    const days = rows.reduce<Record<string, number>>((acc, row) => {
      const day = String(row.created_at).slice(0, 10);
      acc[day] = (acc[day] ?? 0) + Number(row.cost_usd);
      return acc;
    }, {});
    const imageRows = rows.filter((row) => Number(row.images) > 0);
    const imageCount = imageRows.reduce((sum, row) => sum + Number(row.images), 0);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      month: start.slice(0, 7), scope: all ? 'all' : 'mine', pricing,
      totalUsd: rows.reduce((sum, row) => sum + Number(row.cost_usd), 0),
      calls: rows.length, images: imageCount,
      averageImageUsd: imageCount ? imageRows.reduce((sum, row) => sum + Number(row.cost_usd), 0) / imageCount : null,
      byUser: byUser.sort((a, b) => b.spentUsd - a.spentUsd),
      byPurpose: group('purpose').map((entry) => ({ ...entry, name: purposeOf(entry.name) })),
      byModel: group('model'),
      daily: Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([day, usd]) => ({ day, usd })),
      recent: rows.slice(0, 60).map((row) => ({
        id: row.id, userId: row.user_id, purpose: purposeOf(String(row.purpose)), kind: row.kind, model: row.model, images: row.images,
        tokens: Number(row.text_in) + Number(row.image_in) + Number(row.out_tokens), costUsd: row.cost_usd, estimated: Boolean(row.estimated), createdAt: row.created_at,
      })),
    });
  });

  app.put('/api/usage/budgets/:userId', requireUser, requirePermission('users.manage'), (req, res) => {
    const parsed = z.object({ monthlyUsd: z.number().min(0).max(100_000).nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'أدخل رصيدًا صحيحًا بالدولار، أو اتركه فارغًا لإلغاء الحد.' });
    const userId = String(req.params.userId);
    if (!getUser(userId)) return res.status(404).json({ error: 'المستخدم غير موجود.' });
    db.prepare('INSERT INTO user_budgets (user_id,monthly_usd,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET monthly_usd=excluded.monthly_usd, updated_at=excluded.updated_at')
      .run(userId, parsed.data.monthlyUsd, new Date().toISOString());
    res.json({ userId, budgetUsd: parsed.data.monthlyUsd });
  });

  app.put('/api/usage/pricing', requireUser, requirePermission('users.manage'), (req, res) => {
    const rate = z.object({ textIn: z.number().min(0).max(1000), imageIn: z.number().min(0).max(1000), out: z.number().min(0).max(1000) });
    const parsed = z.object({ usdToEgp: z.number().min(0.01).max(10_000), defaultMonthlyUsd: z.number().min(0).max(100_000).nullable(), models: z.record(z.string().max(80), rate).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'قيم التسعير غير صالحة.' });
    const current = getPricing();
    res.json(setSetting<Pricing>('ai.pricing', { ...current, ...parsed.data, models: { ...current.models, ...(parsed.data.models ?? {}) } }));
  });
}
