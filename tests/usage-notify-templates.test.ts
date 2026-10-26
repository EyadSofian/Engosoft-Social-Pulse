import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// A throwaway database; store.ts reads DATA_FILE when first imported.
process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'sp-usage-')), 'test.sqlite');
const auth = await import('../server/auth');
const usage = await import('../server/usage');
const notify = await import('../server/notify');
const templates = await import('../server/svg-templates');
const store = await import('../server/store');
const ws = await import('../server/workspace');
const settings = await import('../server/settings');

const ops = auth.createUser({ email: 'ops2@engosoft.test', name: 'Ops Author', role: 'employee', departmentId: 'operations', password: 'ops-password-12' });
const manager = auth.createUser({ email: 'mm2@engosoft.test', name: 'Marketing Lead', role: 'marketing_manager', departmentId: 'marketing', password: 'mm-password-12' });
const watcher = auth.createUser({ email: 'watch@engosoft.test', name: 'Watcher', role: 'employee', departmentId: 'hr', password: 'watch-password-1' });

const notificationsFor = (userId: string) => store.db.prepare('SELECT * FROM notifications WHERE user_id=?').all(userId) as { kind: string; title: string; link: string }[];

test('image cost comes from the token usage OpenAI reports, priced per model', () => {
  usage.withUsage(ops.id, 'generate', () =>
    usage.recordUsage({ kind: 'image', model: 'gpt-image-2', images: 1, usage: { input_tokens: 1000, output_tokens: 5000, input_tokens_details: { text_tokens: 1000, image_tokens: 0 } } }),
  );
  const row = store.db.prepare('SELECT * FROM ai_usage WHERE user_id=?').get(ops.id) as { cost_usd: number; purpose: string; estimated: number };
  // 1000 text tokens at $5/M + 5000 output tokens at $30/M
  assert.equal(Number(row.cost_usd.toFixed(6)), 0.155);
  assert.equal(row.purpose, 'generate');
  assert.equal(row.estimated, 0);
});

test('dated model snapshots use their family rate; missing usage is estimated from size and quality', () => {
  usage.withUsage(watcher.id, 'captions', () => usage.recordUsage({ kind: 'text', model: 'gpt-4.1-mini-2025-04-14', usage: { input_tokens: 1_000_000, output_tokens: 0 } }));
  usage.withUsage(watcher.id, 'adapt', () => usage.recordUsage({ kind: 'image_edit', model: 'gpt-image-2', images: 1, size: '1024x1024', quality: 'high' }));
  const rows = store.db.prepare('SELECT * FROM ai_usage WHERE user_id=? ORDER BY created_at').all(watcher.id) as { cost_usd: number; estimated: number }[];
  assert.equal(Number(rows[0].cost_usd.toFixed(4)), 0.4);
  assert.equal(rows[1].estimated, 1);
  assert.ok(rows[1].cost_usd > 0.1 && rows[1].cost_usd < 0.2);
});

test('a person over their monthly budget is stopped before new AI work', () => {
  store.db.prepare('INSERT INTO user_budgets (user_id,monthly_usd,updated_at) VALUES (?,?,?)').run(ops.id, 0.1, new Date().toISOString());
  let status = 0;
  let body: { code?: string } = {};
  const res = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value as { code?: string }; return this; } };
  let passed = false;
  usage.requireAiBudget({ user: ops, originalUrl: '/api/ai/full-creative' } as never, res as never, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(status, 402);
  assert.equal(body.code, 'budget_exceeded');
  store.db.prepare('UPDATE user_budgets SET monthly_usd=NULL WHERE user_id=?').run(ops.id);
  usage.requireAiBudget({ user: ops, originalUrl: '/api/ai/full-creative' } as never, res as never, () => { passed = true; });
  assert.equal(passed, true);
});

test('a new post from any team notifies the chosen people; review results go back to the author', () => {
  // Nobody chosen: approvers hear about it, the author does not notify themselves.
  const item = ws.createContent(ops, { title: 'Ops post', channels: ['facebook'], captions: {}, creative: { requestId: 'svg-template', directionId: 'svg', imageUrl: '/api/uploads/00000000-0000-0000-0000-000000000000.png' } });
  notify.notifyContent(ops, item, 'created');
  assert.equal(notificationsFor(manager.id).length, 1);
  assert.equal(notificationsFor(ops.id).length, 0);
  assert.equal(notificationsFor(manager.id)[0].link, `/content/${item.id}`);

  // A specific person chosen: only they hear about new posts.
  settings.setSetting('notify', { userIds: [watcher.id], emails: [], onCreate: true, onReview: true, ownerUpdates: true });
  notify.notifyContent(ops, item, 'ready_for_review');
  assert.equal(notificationsFor(watcher.id).length, 1);
  assert.equal(notificationsFor(manager.id).length, 1);

  notify.notifyContent(manager, item, 'approved');
  const own = notificationsFor(ops.id);
  assert.equal(own.length, 1);
  assert.equal(own[0].kind, 'content_approved');
});

test('template SVGs are made inert and sized to the platform', () => {
  const dirty = `\`\`\`svg
<svg width="10" height="10" onload="alert(1)"><script>alert(1)</script><foreignObject><div>x</div></foreignObject>
<image href="https://evil.example/x.png"/><image data-role="logo" href="/brand/logos/engosoft-lockup-reversed.svg"/>
<rect fill="url(#ok)"/><rect fill="url('https://evil.example/a')"/><text direction="rtl" text-anchor="end" x="1000">مرحبا</text></svg>
\`\`\``;
  const clean = templates.sanitizeSvg(dirty, 1080, 1350);
  assert.ok(clean.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"'));
  assert.ok(!/script|onload|foreignObject|evil\.example/.test(clean));
  assert.ok(clean.includes('href="/brand/logos/engosoft-lockup-reversed.svg"'));
  assert.ok(clean.includes('url(#ok)'));
  // rtl + end would push Arabic off the canvas; stored as rtl + start (right-aligned).
  assert.ok(clean.includes('text-anchor="start"') && !clean.includes('text-anchor="end"'));
  assert.throws(() => templates.sanitizeSvg('no svg here', 1080, 1350));
});
