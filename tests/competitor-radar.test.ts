import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RadarPost } from '../server/competitor-radar/store.js';

// The brief imports the usage log, which opens the database: point it at a throwaway file before anything loads.
const directory = mkdtempSync(join(tmpdir(), 'social-pulse-radar-'));
process.env.DATA_FILE = join(directory, 'data.sqlite');
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
const { COMPETITORS, competitorOf } = await import('../server/competitor-radar/competitors.js');
const { followersFromText, interactionsOf, normalizeFacebook, normalizeInstagram, normalizeLinkedIn, normalizeTikTok } = await import('../server/competitor-radar/normalize.js');
const { buildMetrics, levelOf, median, scorePosts } = await import('../server/competitor-radar/metrics.js');
const { cleanBrief, codeAlerts } = await import('../server/competitor-radar/brief.js');

const tracks = COMPETITORS.find((c) => c.id === 'engtracks')!;
const NOW = Date.parse('2026-11-18T08:00:00.000Z');

test('competitor accounts are recognised from handles, page names and URLs', () => {
  assert.equal(competitorOf('engtracksksa')?.id, 'engtracks');
  assert.equal(competitorOf('https://www.linkedin.com/company/bakkahlearning/')?.id, 'bakkah');
  assert.equal(competitorOf('https://www.facebook.com/ILTC.Gulf')?.id, 'iltc');
  assert.equal(competitorOf('dr.eng.amrtalat'), undefined);
});

test('each platform maps to one post shape and missing counts stay null', () => {
  const li = normalizeLinkedIn([{ id: '1', author: { type: 'company', name: 'Engineering Tracks', info: '31,204 followers' }, postedAt: { date: '2026-11-10T08:00:00Z' }, content: 'نص', postImages: [{ url: 'https://x/a.jpg' }, { url: 'https://x/b.jpg' }], engagement: { likes: 20, comments: 4, shares: 1 }, linkedinUrl: 'https://l' }], tracks);
  assert.equal(li.posts[0].id, 'linkedin:1');
  assert.equal(li.posts[0].format, 'carousel');
  assert.deepEqual(li.followers, [{ competitorId: 'engtracks', platform: 'linkedin', followers: 31204 }]);
  const fb = normalizeFacebook([{ postId: '9', pageName: 'engtracksksa', time: '2026-11-04T07:50:38.000Z', text: 't', likes: 4, shares: 0, media: [{ __typename: 'Photo', thumbnail: 'https://x/t.jpg' }], url: 'https://f' }], tracks);
  assert.equal(fb.posts[0].comments, null, 'Facebook did not return comments; it is not zero');
  assert.equal(fb.posts[0].imageUrl, 'https://x/t.jpg');
  const ig = normalizeInstagram([{ shortCode: 'A', ownerUsername: 'dr.eng.amrtalat', timestamp: '2026-11-01T10:00:00Z', type: 'Sidecar', likesCount: 30, commentsCount: 2, displayUrl: 'https://x/i.jpg', url: 'https://i' }], tracks);
  assert.equal(ig.posts[0].authorType, 'person', 'a collab post from an instructor is not the page');
  assert.equal(ig.posts[0].format, 'carousel');
  const tt = normalizeTikTok([{ id: '7', text: 'v', createTimeISO: '2026-10-18T10:00:00Z', authorMeta: { name: 'engtracks', fans: 4306 }, diggCount: 451, commentCount: 26, shareCount: 8, playCount: 15816, webVideoUrl: 'https://t', videoMeta: { coverUrl: 'https://x/c.jpg' } }], tracks);
  assert.equal(tt.posts[0].views, 15816);
  assert.equal(interactionsOf(tt.posts[0]), 485);
  assert.equal(interactionsOf({ reactions: null, comments: null, shares: null }), null);
  assert.equal(followersFromText('12.6K followers'), 12600);
});

test('levels compare a post with its own account and do not judge young posts low', () => {
  assert.equal(median([1, 5, 3]), 3);
  assert.equal(median([]), null);
  assert.equal(levelOf(485, 36.5, 30), 'breakout');
  assert.equal(levelOf(60, 36.5, 30), 'high');
  assert.equal(levelOf(10, 36.5, 30), 'low');
  assert.equal(levelOf(10, 36.5, 1), 'normal', 'a day-old post is still collecting reactions');
  assert.equal(levelOf(null, 10, 10), null);
});

const post = (id: string, over: Partial<RadarPost>): RadarPost => ({
  id, platform: 'tiktok', competitorId: 'engtracks', author: 'engtracks', authorType: 'page', url: '', postedAt: '2026-11-10T08:00:00.000Z', text: '', format: 'video', imageUrl: '',
  reactions: 10, comments: 0, shares: 0, views: null, thumb: '', analysis: null, firstSeenAt: '', fetchedAt: '', ...over,
});

test('metrics are computed by code per account, and our own posts sit next to them', () => {
  const posts = scorePosts([
    post('a', { reactions: 10 }), post('b', { reactions: 12 }), post('c', { reactions: 200, postedAt: '2026-11-15T08:00:00.000Z' }),
    post('d', { platform: 'linkedin', competitorId: 'iltc', reactions: 0, postedAt: '2026-09-01T08:00:00.000Z' }),
  ], NOW);
  assert.equal(posts.find((p) => p.id === 'c')!.level, 'breakout');
  const metrics = buildMetrics({ posts, followers: [{ competitorId: 'engtracks', platform: 'tiktok', followers: 4000, before: 3900 }], ours: [{ platform: 'tiktok', publishedAt: '2026-11-12T00:00:00Z', likes: 3, comments: 1, shares: null }], windowDays: 30, now: NOW });
  const tt = metrics.accounts.find((a) => a.competitorId === 'engtracks' && a.platform === 'tiktok')!;
  assert.equal(tt.posts, 3);
  assert.equal(tt.medianInteractions, 12);
  assert.equal(tt.followersChange, 100);
  assert.equal(tt.best?.id, 'c');
  const iltc = metrics.accounts.find((a) => a.competitorId === 'iltc' && a.platform === 'linkedin')!;
  assert.equal(iltc.posts, 0, 'a post older than the window is not counted');
  assert.equal(metrics.ours.find((o) => o.platform === 'tiktok')!.medianInteractions, 4);
  const alerts = codeAlerts(posts, metrics, { status: 'connected', events: [] }, NOW);
  assert.ok(alerts.some((a) => a.kind === 'breakout' && a.postId === 'c'));
  assert.ok(alerts.some((a) => a.kind === 'webinar'), 'no webinar booked in Odoo is an alert');
  const booked = codeAlerts(posts, metrics, { status: 'connected', events: [{ id: 'e', title: 'CFM - Webinar - Free Lecture', startsAt: '2026-11-25T10:00:00Z', endsAt: '2026-11-25T12:00:00Z', source: 'event.event', type: 'Webinar', webinar: true }] }, NOW);
  assert.ok(!booked.some((a) => a.kind === 'webinar'), 'a booked webinar clears the alert');
  assert.ok(alerts.some((a) => a.kind === 'silent' && a.text.includes('التعليم المتكامل')));
});

test('the brief keeps only evidence that names real posts and courses that Odoo has', () => {
  const clean = cleanBrief({
    headline: ' عنوان ',
    insights: [{ text: 'ملاحظة', evidence: ['a', 'zzz'] }, { text: 'بدون دليل', evidence: ['nope'] }],
    ideas: [
      { title: 'فكرة', idea: 'قصة نجاح', platform: 'tiktok', format: 'reel', why: 'لأن', evidence: ['a'], course: 'PMP Course Online - 5874', suggestedDate: '2026-12-01' },
      { title: 'مخترعة', idea: 'x', platform: 'tiktok', format: 'reel', why: 'y', evidence: ['made-up'], course: '', suggestedDate: '' },
      { title: 'كورس غلط', idea: 'x', platform: 'linkedin', format: 'image', why: 'y', evidence: ['a'], course: 'Invented course', suggestedDate: 'next week' },
      { title: 'تاريخ فات', idea: 'x', platform: 'facebook', format: 'image', why: 'y', evidence: ['a'], course: '', suggestedDate: '2026-11-17' },
    ],
  }, new Set(['a']), new Set(['PMP Course Online - 5874']), '2026-11-18');
  assert.equal(clean.headline, 'عنوان');
  assert.deepEqual(clean.insights, [{ text: 'ملاحظة', evidence: ['a'] }]);
  assert.equal(clean.ideas.length, 3);
  assert.equal(clean.ideas[2].suggestedDate, '', 'a date already past is dropped');
  assert.equal(clean.ideas[0].course, 'PMP Course Online - 5874');
  assert.equal(clean.ideas[1].course, '');
  assert.equal(clean.ideas[1].suggestedDate, '');
});

test('saved posts keep earlier counts when a later pull misses one', async () => {
  {
    const store = await import('../server/competitor-radar/store.js');
    await (await import('../server/db.js')).initDb();
    const base = { id: 'facebook:1', platform: 'facebook' as const, competitorId: 'bakkah', author: 'BakkahInc', authorType: 'page' as const, url: 'u', postedAt: '2026-11-10T08:00:00.000Z', text: 't', format: 'image' as const, imageUrl: 'https://x/i.jpg', reactions: 5, comments: 2, shares: 1, views: null };
    assert.deepEqual((await store.savePosts([base])).added, ['facebook:1']);
    const again = await store.savePosts([{ ...base, reactions: 9, comments: null, imageUrl: '' }]);
    assert.equal(again.updated, 1);
    const saved = await store.getPost('facebook:1');
    assert.equal(saved?.reactions, 9);
    assert.equal(saved?.comments, 2, 'a count missing from the new pull keeps the earlier value');
    assert.equal(saved?.imageUrl, 'https://x/i.jpg');
    await store.saveFollowers([{ competitorId: 'bakkah', platform: 'facebook', followers: 12000 }], '2026-10-01');
    await store.saveFollowers([{ competitorId: 'bakkah', platform: 'facebook', followers: 12998 }], '2026-11-18');
    const f = (await store.latestFollowers()).find((x) => x.competitorId === 'bakkah');
    assert.equal(f?.followers, 12998);
    assert.equal(f?.before, 12000);
  }
});

test('clear dialect words win over the model label', async () => {
  const { detectDialect } = await import('../server/competitor-radar/analyze.js');
  assert.equal(detectDialect('عندنا ليك سؤال: لو قدامك فرصة تختار 3 كورسات هتختار إيه؟'), 'egyptian');
  assert.equal(detectDialect('وش تنتظر؟ الحين وقتك، ابغى أشوفك معنا'), 'saudi');
  assert.equal(detectDialect('احجز مقعدك في دورة إدارة المشاريع الاحترافية'), null);
});

test('Odoo lecture rows: material rows are skipped and course names are cleaned', async () => {
  const { isLecture, agendaCourseName } = await import('../server/odoo.js');
  assert.equal(isLecture('Material'), false);
  assert.equal(isLecture('Management - PMP - Event / Session 2'), true);
  assert.equal(agendaCourseName('(E05743) PMP Course Online - 5743'), 'PMP Course Online');
  assert.equal(agendaCourseName('(E05776) Revit family creation 5776\n'), 'Revit family creation 5776');
});
