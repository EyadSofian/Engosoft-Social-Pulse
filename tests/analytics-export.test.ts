import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSheet } from 'read-excel-file/node';
import type { I18n, Lang } from '../src/i18n/I18nProvider';
import { buildTrend, byPlatform, normalize, summarize } from '../src/lib/analytics';
import { workbook } from '../src/lib/export/xlsx';
import { dayNumber } from '../src/lib/format';
import { buildSheets, exportPostList } from '../src/pages/analytics/export';
import { bestAndWorst, buildReports, byHourBlock, byWeekday, interactionMix, median } from '../src/pages/analytics/reports';
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

const settledNow = Date.parse('2026-11-20T12:00:00Z');

test('best and worst are ranked within each platform, never overlap, and skip unmeasured or fresh posts', () => {
  const today = dayNumber(settledNow);
  const ranking = bestAndWorst(posts, today, 'interactions');
  assert.deepEqual(ranking.map((row) => row.platform), ['facebook', 'instagram']);
  const facebook = ranking[0];
  // Facebook has posts 0, 2, 4, 6 (interactions 0, 20, 40, 60).
  assert.deepEqual(facebook.best.map((entry) => entry.post.externalId), ['6', '4']);
  assert.deepEqual(facebook.worst.map((entry) => entry.post.externalId), ['0', '2']);
  assert.equal(facebook.median, 30);
  assert.equal(facebook.best[0].vsMedian, 2);
  // Instagram's post 7 has no interaction data: it is counted as unranked, not as a zero.
  const instagram = ranking[1];
  assert.equal(instagram.unranked, 1);
  assert.ok(![...instagram.best, ...instagram.worst].some((entry) => entry.post.externalId === '7'));
  // Posts younger than two days wait.
  const fresh = bestAndWorst(posts, dayNumber(Date.parse('2026-11-08T12:00:00Z')), 'interactions');
  assert.ok(fresh.flatMap((row) => [...row.best, ...row.worst]).every((entry) => entry.post.dayNum <= dayNumber(Date.parse('2026-11-06T12:00:00Z'))));
  // A single rankable post is a best, never also a worst.
  const one = bestAndWorst([posts[2]], today, 'interactions')[0];
  assert.equal(one.best.length, 1);
  assert.equal(one.worst.length, 0);
});

test('the rate ranking ignores posts seen by too few people', () => {
  const today = dayNumber(settledNow);
  const tiny = { ...posts[1], key: 'instagram:tiny', externalId: 'tiny', metrics: { ...posts[1].metrics, reach: 10, likes: 9 }, interactions: 9 };
  const ranking = bestAndWorst([...posts, tiny], today, 'rate');
  const instagram = ranking.find((row) => row.platform === 'instagram')!;
  assert.ok(![...instagram.best, ...instagram.worst].some((entry) => entry.post.externalId === 'tiny'));
  assert.equal(instagram.best[0].post.externalId, '5');
});

test('timing, mix and median reports add up', () => {
  const days = byWeekday(posts);
  assert.equal(days.reduce((sum, row) => sum + row.count, 0), 8);
  assert.ok(days.filter((row) => row.best).length <= 1);
  const hours = byHourBlock(posts);
  assert.equal(hours.length, 6);
  assert.equal(hours.reduce((sum, row) => sum + row.count, 0), 8);
  const mix = interactionMix(posts);
  const facebook = mix.find((row) => row.platform === 'facebook')!;
  assert.equal(facebook.cells.likes.total, 120);
  assert.equal(facebook.cells.likes.rate, 3);
  assert.equal(facebook.cells.comments.total, null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('exports carry every report, the ranked posts with pictures, and every post only when asked', async () => {
  const model = { ...modelFor(), todayNum: dayNumber(settledNow) };
  const reports = buildReports(model.posts, model.todayNum, 'interactions');
  const ranked = exportPostList(model, reports, 'ranked');
  assert.equal(ranked.length, 7);
  assert.equal(exportPostList(model, reports, 'all').length, 8);
  for (const lang of ['ar', 'en'] as const) {
    const i18n = language(lang);
    const sheets = buildSheets(model, reports, i18n, 'ranked', pictures);
    // Two accounts (one per platform) publish here, so the accounts sheet is included.
    assert.equal(sheets.length, 9);
    assert.equal(sheets[0].rows[0][1], 8);
    assert.equal(sheets[0].rows[1][1], 8000);
    assert.equal(sheets[0].rows[3][1], 210);
    assert.equal(sheets[1].rows.reduce((sum, row) => sum + Number(row[1]), 0), 8);
    const rankingSheet = sheets[3];
    assert.equal(rankingSheet.rows.length, 7);
    assert.equal(rankingSheet.images?.length, 7);
    assert.ok(String(rankingSheet.rows[0][7]).length <= 161);
    const all = buildSheets(model, reports, i18n, 'all', pictures);
    assert.equal(all.length, 10);
    assert.equal(all[9].rows.length, 8);
    assert.equal(all[9].images?.length, 8);
    const file = Buffer.from(await workbook(all).arrayBuffer());
    const parsed = await readSheet(file, rankingSheet.name);
    assert.equal(parsed[4][3], 1);

    const html = reportHtml(model, reports, i18n, 'ranked', pictures, now);
    assert.equal((html.match(/<article class="post/g) ?? []).length, 7);
    assert.ok(html.includes('Post-6'));
    assert.ok(!html.includes('Post-7'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(!html.includes('caption '.repeat(60)));
    assert.ok(html.includes(`dir="${i18n.dir}"`));
    assert.ok(html.includes(i18n.t('Overview', 'نظرة عامة')));
    assert.ok(html.includes(i18n.t('Results by content type', 'النتائج حسب نوع المحتوى')));
    assert.ok(html.includes(i18n.t('When posts did best', 'المنشورات نجحت إمتى')));
    const everything = reportHtml(model, reports, i18n, 'all', pictures, now);
    assert.equal((everything.match(/<article class="post/g) ?? []).length, 15);
    assert.ok(everything.includes('Post-7'));
  }
});

test('nothing to rank still gives a valid export', () => {
  const unknown = { ...modelFor(posts.filter((post) => !post.measured)), todayNum: dayNumber(settledNow) };
  const reports = buildReports(unknown.posts, unknown.todayNum, 'rate');
  assert.deepEqual(exportPostList(unknown, reports, 'ranked'), []);
  const sheets = buildSheets(unknown, reports, language('en'), 'ranked', pictures);
  assert.equal(sheets[3].rows.length, 0);
  assert.equal(sheets[3].images?.length, 0);
  assert.match(reportHtml(unknown, reports, language('en'), 'ranked', pictures, now), /No post here has the numbers/);
  const empty = modelFor([]);
  assert.equal(buildSheets(empty, buildReports([], empty.todayNum, 'rate'), language('ar'), 'all')[3].rows.length, 0);
  const noImages = reportHtml(modelFor([posts[0]]), buildReports([posts[0]], dayNumber(settledNow), 'interactions'), language('ar'), 'all', new Map(), now);
  assert.match(noImages, /الصورة مش متاحة/);
  assert.ok(!noImages.includes('undefined'));
});
