import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSheet } from 'read-excel-file/node';
import type { I18n, Lang } from '../src/i18n/I18nProvider';
import { buildTrend, byPlatform, normalize, summarize } from '../src/lib/analytics';
import { workbook } from '../src/lib/export/xlsx';
import { dayNumber } from '../src/lib/format';
import { buildSheets, exportPostList } from '../src/pages/analytics/export';
import { bestAndWorst, buildReports, byHourBlock, byWeekday, interactionMix, median } from '../src/pages/analytics/reports';
import { buildAudience, shares, sliceLabel } from '../src/pages/analytics/audience';
import { linkedInDemographics, linkedInFollowers } from '../server/social/linkedin';
import type { AudienceDay } from '../src/types';
import type { AnalyticsModel } from '../src/pages/analytics/model';
import { reportHtml } from '../src/pages/analytics/report';
import { buildReachSplit, inScope } from '../src/pages/analytics/reach';
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
    now, todayNum: dayNumber(now), scope: { period: 30, platform: 'all', account: 'all', reach: 'all', type: 'all' },
    posts: source, summary, trend: buildTrend(source, 30, dayNumber(now)), weekly: false,
    platforms: byPlatform(source).filter((row) => row.count), accountOptions: [], typeOptions: ['image'], split: buildReachSplit(source), audience: [], lastCheck: now,
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
    // …and the organic vs paid sheet right after the summary.
    assert.equal(sheets.length, 10);
    assert.equal(sheets[1].name, i18n.t('Organic vs paid', 'أورجانيك وممول'));
    assert.equal(sheets[1].rows[0][2], 8);
    assert.equal(sheets[0].rows[0][1], 8);
    assert.equal(sheets[0].rows[1][1], 8000);
    assert.equal(sheets[0].rows[3][1], 210);
    assert.equal(sheets[2].rows.reduce((sum, row) => sum + Number(row[1]), 0), 8);
    const rankingSheet = sheets[4];
    assert.equal(rankingSheet.rows.length, 7);
    assert.equal(rankingSheet.images?.length, 7);
    assert.ok(String(rankingSheet.rows[0][8]).length <= 161);
    const all = buildSheets(model, reports, i18n, 'all', pictures);
    assert.equal(all.length, 11);
    assert.equal(all[10].rows.length, 8);
    assert.equal(all[10].images?.length, 8);
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
  assert.equal(sheets[4].rows.length, 0);
  assert.equal(sheets[4].images?.length, 0);
  assert.match(reportHtml(unknown, reports, language('en'), 'ranked', pictures, now), /No post here has the numbers/);
  const empty = modelFor([]);
  assert.equal(buildSheets(empty, buildReports([], empty.todayNum, 'rate'), language('ar'), 'all')[4].rows.length, 0);
  const noImages = reportHtml(modelFor([posts[0]]), buildReports([posts[0]], dayNumber(settledNow), 'interactions'), language('ar'), 'all', new Map(), now);
  assert.match(noImages, /الصورة مش متاحة/);
  assert.ok(!noImages.includes('undefined'));
});

test('views ranking only uses posts that report views, and names platforms without them', () => {
  const today = dayNumber(settledNow);
  const withViews = posts.map((post, index) => (post.platform === 'facebook' ? { ...post, metrics: { ...post.metrics, views: null } } : { ...post, metrics: { ...post.metrics, views: 100 * index } }));
  const ranking = bestAndWorst(withViews, today, 'views');
  const facebook = ranking.find((row) => row.platform === 'facebook')!;
  assert.equal(facebook.reported, 0);
  assert.equal(facebook.best.length, 0);
  const instagram = ranking.find((row) => row.platform === 'instagram')!;
  assert.equal(instagram.best[0].post.externalId, '7');
  assert.equal(instagram.best[0].value, 700);
  const html = reportHtml({ ...modelFor(withViews), todayNum: today }, buildReports(withViews, today, 'views'), language('en'), 'ranked', pictures, now);
  assert.match(html, /Not reported here: Facebook/);
});

test('audience: latest followers, change since the period start, demographics shares', () => {
  const todayNum = dayNumber(Date.parse('2026-11-15T12:00:00Z'));
  const day = (date: string, followers: number | null, extra: Partial<AudienceDay> = {}): AudienceDay => ({ platform: 'instagram', accountId: 'ig', accountName: 'engosoft', date, followers, demographics: null, ...extra });
  const rows: AudienceDay[] = [
    day('2026-10-10', 900),
    day('2026-10-16', 1000),
    day('2026-11-10', 1100, { demographics: { basis: 'followers', gender: [{ key: 'M', value: 300 }, { key: 'F', value: 100 }], age: [{ key: '25-34', value: 50 }, { key: '18-24', value: 50 }] } }),
    day('2026-11-15', 1150),
    { platform: 'facebook', accountId: 'fb', accountName: 'Engosoft', date: '2026-11-15', followers: null, demographics: null },
    { platform: 'youtube', accountId: 'yt', accountName: 'Engosoft', date: '2026-11-14', followers: 40, demographics: null },
    { platform: 'youtube', accountId: 'yt', accountName: 'Engosoft', date: '2026-11-15', followers: 42, demographics: null },
  ];
  const audience = buildAudience(rows, { platform: 'all', account: 'all' }, 30, todayNum);
  assert.deepEqual(audience.map((row) => row.platform), ['facebook', 'instagram', 'youtube']);
  const instagram = audience.find((row) => row.platform === 'instagram')!;
  // The period starts 2026-10-17; the last count before it is 1000 on 2026-10-16.
  assert.equal(instagram.followers, 1150);
  assert.equal(instagram.change, 150);
  assert.equal(instagram.since, '2026-10-16');
  assert.equal(instagram.accounts[0].demographicsDate, '2026-11-10');
  assert.equal(audience.find((row) => row.platform === 'facebook')!.followers, null);
  // Tracking began inside the period: the change counts from the first day counted.
  const youtube = audience.find((row) => row.platform === 'youtube')!;
  assert.equal(youtube.change, 2);
  assert.equal(youtube.since, '2026-11-14');
  // One day only: no change yet.
  assert.equal(buildAudience([rows[3]], { platform: 'all', account: 'all' }, 30, todayNum)[0].change, null);
  assert.deepEqual(buildAudience(rows, { platform: 'youtube', account: 'all' }, 30, todayNum).map((row) => row.platform), ['youtube']);
  const gender = shares(instagram.accounts[0].demographics!.gender, 'gender');
  assert.deepEqual(gender.map((slice) => [slice.key, slice.value]), [['M', 75], ['F', 25]]);
  assert.deepEqual(shares(instagram.accounts[0].demographics!.age, 'age').map((slice) => slice.key), ['18-24', '25-34']);
  assert.equal(sliceLabel('gender', 'M', 'en'), 'Men');
  assert.equal(sliceLabel('country', 'EG', 'en'), 'Egypt');

  const model = { ...modelFor(), audience };
  const sheets = buildSheets(model, buildReports(model.posts, todayNum, 'rate'), language('ar'), 'ranked');
  const audienceSheet = sheets.find((sheet) => sheet.name === 'الجمهور')!;
  assert.deepEqual(audienceSheet.rows.find((row) => row[0] === 'Instagram')!.slice(2, 5), [1150, 150, '2026-10-16']);
  assert.ok(sheets.some((sheet) => sheet.name === 'تركيبة الجمهور'));
  const html = reportHtml(model, buildReports(model.posts, todayNum, 'rate'), language('en'), 'ranked', pictures, now);
  assert.match(html, /<h2>Audience<\/h2>/);
  assert.match(html, /Men/);
});

test('LinkedIn follower count is found wherever Zernio puts it', () => {
  assert.equal(linkedInFollowers({ accounts: [{ _id: 'z1', currentFollowers: 512 }] }, 'z1'), 512);
  assert.equal(linkedInFollowers({ accounts: [{ _id: 'z1', stats: { followersCount: 7 } }] }, 'z1'), 7);
  assert.equal(linkedInFollowers({ accounts: [{ _id: 'z1' }], stats: { z1: [{ date: '2026-11-01', followers: 10 }, { date: '2026-11-02', followers: 12 }] } }, 'z1'), 12);
  assert.equal(linkedInFollowers({ accounts: [{ _id: 'other', followers: 3 }, { _id: 'x', followers: 4 }] }, 'z1'), null);
  assert.equal(linkedInFollowers({}, 'z1'), null);
});

test('LinkedIn demographics are read from lists or maps, and labelled', () => {
  const listed = linkedInDemographics({
    demographics: {
      seniority: [{ id: 'urn:li:seniority:4', label: 'Senior', followerCounts: { organicFollowerCount: 900, paidFollowerCount: 100 } }, { id: 'urn:li:seniority:5', label: 'Manager', count: 400 }],
      industry: [{ label: 'Civil Engineering', followers: 1200 }, { label: 'Construction', value: 800 }],
      company_size: [{ label: '10001+', count: 50 }, { label: '2-10', count: 70 }],
      country: [{ id: 'urn:li:geo:106155005', label: 'Egypt', count: 3000 }],
    },
  })!;
  assert.deepEqual(listed.seniority, [{ key: 'Senior', value: 1000 }, { key: 'Manager', value: 400 }]);
  assert.equal(listed.industry?.[0].key, 'Civil Engineering');
  assert.deepEqual(shares(listed.companySize, 'companySize').map((slice) => slice.key), ['2-10', '10001+']);
  assert.equal(listed.country?.[0].key, 'Egypt');
  assert.equal(sliceLabel('seniority', 'Senior', 'ar'), 'خبير');
  assert.equal(sliceLabel('industry', 'Civil Engineering', 'ar'), 'Civil Engineering');
  assert.equal(sliceLabel('country', 'Egypt', 'en'), 'Egypt');
  const mapped = linkedInDemographics({ demographics: { function: { Engineering: 500, Sales: 20 } } })!;
  assert.deepEqual(mapped.function, [{ key: 'Engineering', value: 500 }, { key: 'Sales', value: 20 }]);
  assert.equal(linkedInDemographics({ demographics: {} }), null);
  assert.equal(linkedInDemographics({}), null);
});

test('organic and paid posts are split, filtered and exported apart', async () => {
  const mixed = normalize({
    timeZone: 'Africa/Cairo', generatedAt: '', plans: [], alerts: [], connectors: [], website: [], websitePages: [],
    posts: [
      { platform: 'facebook', accountId: 'a', accountName: 'Page', externalId: 'p1', title: 'boosted', publishedAt: '2026-11-05T10:00:00Z', contentType: 'post', thumbnail: '', permalink: '', engagementRate: 2,
        metrics: { reach: 5000, views: 9000, impressions: null, likes: 100, comments: 0, shares: 0, saves: null, clicks: null, engagement: null },
        promotion: { paid: true, source: 'ads', organicViews: 3000, paidViews: 6000, adReach: 4000, adImpressions: 7000, adClicks: 50, adEngagement: 80, spend: 120.5, currency: 'SAR', ads: 1 } },
      { platform: 'facebook', accountId: 'a', accountName: 'Page', externalId: 'p2', title: 'plain', publishedAt: '2026-11-06T10:00:00Z', contentType: 'post', thumbnail: '', permalink: '', engagementRate: 1,
        metrics: { reach: 800, views: 1000, impressions: null, likes: 8, comments: 0, shares: 0, saves: null, clicks: null, engagement: null },
        promotion: { paid: false, source: 'insights', organicViews: 1000, paidViews: 0, adReach: null, adImpressions: null, adClicks: null, adEngagement: null, spend: null, currency: '', ads: 0 } },
      { platform: 'tiktok', accountId: 't', accountName: 'TT', externalId: 'v1', title: 'video', publishedAt: '2026-11-07T10:00:00Z', contentType: 'video', thumbnail: '', permalink: '', engagementRate: 1,
        metrics: { reach: null, views: 300, impressions: null, likes: 3, comments: 0, shares: 0, saves: null, clicks: null, engagement: null } },
      { platform: 'tiktok', accountId: 't', accountName: 'TT', externalId: 'v2', title: 'spark ad', publishedAt: '2026-11-08T10:00:00Z', contentType: 'video', thumbnail: '', permalink: '', engagementRate: 1,
        metrics: { reach: null, views: 7000, impressions: null, likes: 70, comments: 0, shares: 0, saves: null, clicks: null, engagement: null },
        promotion: { paid: true, source: 'manual', organicViews: null, paidViews: null, adReach: null, adImpressions: null, adClicks: null, adEngagement: null, spend: null, currency: '', ads: 0 } },
    ],
  }).posts;
  assert.deepEqual(mixed.map((post) => [post.reachKind, post.reachKindBy]), [['paid', 'platform'], ['organic', 'platform'], ['organic', 'unknown'], ['paid', 'manual']]);

  const split = buildReachSplit(mixed);
  assert.equal(split.paid.count, 2);
  assert.equal(split.organic.count, 2);
  assert.equal(split.paid.reach, 5000);
  assert.equal(split.organic.reach, 800);
  assert.equal(split.paid.adReach, 4000);
  assert.equal(split.paid.paidViews, 6000);
  assert.equal(split.paid.spend, 120.5);
  assert.equal(split.paid.currency, 'SAR');
  assert.equal(split.unknown, 1);
  assert.deepEqual(split.platforms.map((row) => [row.platform, row.organic.count, row.paid.count]), [['facebook', 1, 1], ['tiktok', 1, 1]]);

  assert.deepEqual(mixed.filter((post) => inScope(post, { reach: 'paid', type: 'all' })).map((post) => post.externalId), ['p1', 'v2']);
  assert.deepEqual(mixed.filter((post) => inScope(post, { reach: 'organic', type: 'video' })).map((post) => post.externalId), ['v1']);

  const model = { ...modelFor(mixed), scope: { period: 30 as const, platform: 'all' as const, account: 'all', reach: 'paid' as const, type: 'all' } };
  const sheets = buildSheets(model, buildReports(mixed, dayNumber(settledNow), 'rate'), language('en'), 'all');
  const reach = sheets.find((sheet) => sheet.name === 'Organic vs paid');
  assert.ok(reach, 'the export has an organic vs paid sheet');
  assert.deepEqual(reach.rows.slice(0, 2).map((row) => [row[1], row[2], row[3]]), [['Organic', 2, 800], ['Paid', 2, 5000]]);
  assert.match(reach.subtitle ?? '', /Paid/);
  const all = sheets.find((sheet) => sheet.name === 'All posts')!;
  const kindColumn = all.columns.findIndex((column) => column.header === 'Organic / paid');
  const spendColumn = all.columns.findIndex((column) => column.header === 'Spend');
  assert.ok(kindColumn >= 0 && spendColumn >= 0);
  const boosted = all.rows.find((row) => row.includes('boosted'))!;
  assert.equal(boosted[kindColumn], 'Paid');
  assert.equal(boosted[spendColumn], 120.5);
  assert.equal(all.rows.find((row) => row.includes('spark ad'))![kindColumn], 'Paid (by hand)');
  assert.equal(all.rows.find((row) => row.includes('video'))![kindColumn], 'Organic (not reported)');
  // The workbook still writes.
  assert.ok(workbook(sheets).size > 0);
  // The PDF shows the split.
  assert.match(reportHtml(model, buildReports(mixed, dayNumber(settledNow), 'rate'), language('ar'), 'all', new Map(), now), /أورجانيك وممول/);
});
