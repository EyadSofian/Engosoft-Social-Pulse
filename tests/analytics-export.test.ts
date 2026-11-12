import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSheet } from 'read-excel-file/node';
import type { I18n, Lang } from '../src/i18n/I18nProvider';
import { buildTrend, byPlatform, normalize, summarize } from '../src/lib/analytics';
import { workbook } from '../src/lib/export/xlsx';
import { dayNumber } from '../src/lib/format';
import { buildSheets, reportTopPosts } from '../src/pages/analytics/export';
import type { AnalyticsModel } from '../src/pages/analytics/model';
import { reportHtml } from '../src/pages/analytics/report';
import type { PostPicture } from '../src/pages/analytics/thumbs';
import type { Post } from '../src/types';

const now = Date.parse('2026-11-12T12:00:00Z');
const posts = normalize({
  timeZone: 'Africa/Cairo', generatedAt: '', plans: [], alerts: [], connectors: [], website: [], websitePages: [],
  posts: Array.from({ length: 8 }, (_, index) => ({
    platform: index % 2 ? 'instagram' : 'facebook', accountId: 'account', accountName: 'Engosoft',
    externalId: String(index), title: `Post-${index} <script>unsafe</script> ${'caption '.repeat(60)}`,
    publishedAt: `2026-11-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
    contentType: 'image', thumbnail: `https://example.com/${index}.jpg`,
    permalink: index === 6 ? 'javascript:alert(1)' : `https://example.com/post/${index}`,
    metrics: { reach: 1000, views: 2000, impressions: null, likes: index === 7 ? null : index * 10, comments: null, shares: null, saves: null, clicks: null, engagement: null },
    engagementRate: index === 7 ? null : index,
  })),
}).posts;

function modelFor(source: Post[] = posts): AnalyticsModel {
  const summary = summarize(source);
  return {
    now, todayNum: dayNumber(now), scope: { period: 30, platform: 'all', account: 'all' },
    posts: source, summary, trend: buildTrend(source, 30, dayNumber(now)), weekly: false,
    platforms: byPlatform(source).filter((row) => row.count), accountOptions: [], lastCheck: now,
    kpis: [
      { key: 'posts', value: source.length, previous: 4, change: 100 },
      { key: 'reach', value: summary.reach, previous: 4000, change: 100 },
      { key: 'views', value: summary.views, previous: 8000, change: 100 },
      { key: 'interactions', value: summary.interactions, previous: 100, change: 110 },
      { key: 'rate', value: summary.rate, previous: 1, change: 2 },
    ],
  };
}

function language(lang: Lang): I18n {
  const num: I18n['num'] = (value) => value == null ? '—' : String(value);
  return {
    lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t: (en, ar) => lang === 'ar' ? ar : en, tx: (text) => text[lang],
    num, compact: num, pct: (value) => value == null ? '—' : `${value}%`,
    date: (value) => String(value), ratio: (a, b) => `${a}/${b}`, relative: () => '', bytes: String, setLang: () => {},
  };
}

const picture: PostPicture = { dataUrl: 'data:image/jpeg;base64,/9j/2Q==', small: { data: new Uint8Array([255, 216, 255, 217]), width: 1, height: 1 }, width: 1, height: 1 };
const pictures = new Map(posts.map((post) => [post.key, picture]));

test('both reports summarize all scoped posts but include only the five highest interaction posts', async () => {
  const model = modelFor();
  const originalOrder = [...posts];
  assert.deepEqual(reportTopPosts(model).map((post) => post.externalId), ['6', '5', '4', '3', '2']);
  assert.deepEqual(posts, originalOrder);
  for (const lang of ['ar', 'en'] as const) {
    const i18n = language(lang);
    const sheets = buildSheets(model, i18n, pictures);
    assert.equal(sheets.length, 4);
    assert.equal(sheets[0].rows[0][1], 8);
    assert.equal(sheets[0].rows[1][1], 8000);
    assert.equal(sheets[0].rows[3][1], 210);
    assert.equal(sheets[1].rows.reduce((sum, row) => sum + Number(row[1]), 0), 8);
    assert.equal(sheets[2].rows.reduce((sum, row) => sum + Number(row[1]), 0), 8);
    const top = sheets[3];
    assert.equal(top.rows.length, 5);
    assert.equal(top.images?.length, 5);
    assert.ok(!top.rows.flat().some((value) => String(value).includes('Post-0')));
    assert.ok(String(top.rows[0][5]).length <= 161);
    const file = Buffer.from(await workbook(sheets).arrayBuffer());
    const parsed = await readSheet(file, top.name);
    assert.equal(parsed[4][1], 1);
    assert.equal(parsed[8][1], 5);
    const html = reportHtml(model, i18n, pictures, now);
    assert.equal((html.match(/<article class="post">/g) ?? []).length, 5);
    assert.equal((html.match(/<img /g) ?? []).length, 5);
    assert.ok(html.includes('Post-6'));
    assert.ok(!html.includes('Post-0'));
    assert.ok(!html.includes('Post-7'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(!html.includes('caption '.repeat(60)));
    assert.ok(html.includes(`dir="${i18n.dir}"`));
    assert.ok(html.includes(i18n.t('Overview', 'نظرة عامة')));
    assert.ok(html.includes(i18n.t('By platform', 'حسب المنصة')));
    assert.ok(html.includes('8,000') || html.includes('8000'));
  }
});

test('missing interaction data stays unranked; measured zero counts and ties prefer the newer post', () => {
  const unknown = modelFor(posts.filter((post) => !post.measured));
  assert.deepEqual(reportTopPosts(unknown), []);
  const sheets = buildSheets(unknown, language('en'), pictures);
  assert.equal(sheets[0].rows[0][1], 1);
  assert.equal(sheets[3].rows.length, 0);
  assert.equal(sheets[3].images?.length, 0);
  assert.match(reportHtml(unknown, language('en'), pictures, now), /No interaction data/);
  assert.equal(buildSheets(modelFor([]), language('ar'))[3].rows.length, 0);
  assert.deepEqual(reportTopPosts(modelFor([posts[0]])).map((post) => post.externalId), ['0']);
  const tied = posts.slice(0, 3).map((post) => ({ ...post, interactions: 10 }));
  assert.deepEqual(reportTopPosts(modelFor(tied)).map((post) => post.externalId), ['2', '1', '0']);
  const noImages = reportHtml(modelFor([posts[0]]), language('ar'), new Map(), now);
  assert.match(noImages, /الصورة مش متاحة/);
  assert.ok(!noImages.includes('undefined'));
});
