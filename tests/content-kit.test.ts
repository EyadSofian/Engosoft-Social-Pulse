import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeInstructions } from '../server/captions';
import { contentSkills, platformCopywriter, voiceRules } from '../server/creative-intelligence/skills/content';
import { stageInstructions, stageSchema } from '../server/creative-intelligence/skills/types';
import { DIALECTS, POSTING_WINDOWS, SCRIPT_FORMATS, suggestedDialect, suggestedSlots } from '../src/domain/content-voice';
import { CHANNELS } from '../src/domain/shared';
import { PLATFORM_SPECS, analyzeCaption } from '../src/domain/platform-content';
import { upcomingOccasions } from '../src/lib/occasions';

test('the content team is versioned and its stage schema is strict', () => {
  // Each part of the kit is written on its own, only when asked for.
  assert.deepEqual(contentSkills('ideas', 'reel', 30).map((s) => s.id), ['kit-strategist', 'hook-writer-social', 'hashtag-strategist']);
  assert.deepEqual(contentSkills('script', 'tiktok', 30).map((s) => s.id), ['script-writer']);
  assert.deepEqual(contentSkills('carousel', 'reel', 30).map((s) => s.id), ['carousel-writer']);
  const skills = [...contentSkills('ideas', 'reel', 30), ...contentSkills('script', 'reel', 30), ...contentSkills('carousel', 'reel', 30)];
  for (const s of skills) assert.match(s.version, new RegExp(`^${s.id}:v\\d+$`));
  const check = (node: Record<string, unknown>, path: string) => {
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, path);
      assert.deepEqual([...(node.required as string[])].sort(), Object.keys(node.properties as object).sort(), path);
      for (const [k, v] of Object.entries(node.properties as Record<string, Record<string, unknown>>)) check(v, `${path}.${k}`);
    } else if (node.type === 'array') check(node.items as Record<string, unknown>, `${path}[]`);
    else assert.ok(['string', 'number', 'boolean'].includes(node.type as string), `${path}: ${String(node.type)}`);
  };
  check(stageSchema(skills) as Record<string, unknown>, 'content');
  const instructions = stageInstructions('Team brief.', skills);
  for (const s of skills) assert.ok(instructions.includes(`## ${s.id} (${s.version})`));
  // Platform rules come from PLATFORM_SPECS, so the prompts and the on-screen checks never disagree.
  assert.ok(stageInstructions('', [platformCopywriter(['instagram'])]).includes(PLATFORM_SPECS.instagram.prompt));
});

test('each register has its own voice and the shared fact rules', () => {
  for (const d of DIALECTS) assert.ok(voiceRules(d, 'expert', 'register').some((r) => r.includes('Use ONLY the given facts')), d);
  assert.match(voiceRules('saudi', 'friendly', 'engagement').join(' '), /ودّك.*Never use Egyptian/s);
  assert.match(voiceRules('egyptian', 'expert', 'register').join(' '), /Never mix in Saudi/);
  assert.match(writeInstructions(['instagram'], 'saudi'), /Saudi "white" dialect/);
  assert.match(writeInstructions(['instagram']), /Modern Standard Arabic/);
});

test('platform defaults follow 2026 rules', () => {
  assert.equal(PLATFORM_SPECS.instagram.hashtags.max, 5);
  assert.ok(analyzeCaption('instagram', 'سطر\n#a1 #b2 #c3 #d4 #e5 #f6').issues.some((i) => i.id === 'hashtags-many'));
  assert.equal(suggestedDialect('linkedin'), 'msa');
  assert.equal(suggestedDialect('snapchat'), 'saudi');
  for (const c of CHANNELS) assert.ok(POSTING_WINDOWS[c].primary[0] < POSTING_WINDOWS[c].primary[1], c);
  assert.equal(SCRIPT_FORMATS.length, 4);
});

test('the calendar knows Saudi national days and engineering days', () => {
  const names = (from: string, days: number) => upcomingOccasions(from, days, 20).map((o) => o.name);
  assert.ok(names('2027-03-10', 3).includes('يوم العلم'));
  assert.ok(names('2027-02-21', 2).includes('يوم التأسيس'));
  assert.ok(names('2026-11-01', 14).includes('اليوم العالمي للجودة'));
  assert.ok(names('2026-04-27', 2).includes('اليوم العالمي للسلامة والصحة المهنية'));
});

test('citations a model leaves inside trend text move to the sources', async () => {
  const { plainText } = await import('../server/content-intelligence/trends');
  const found: { title: string; url: string }[] = [];
  assert.equal(plainText('Cityscape draws engineers ([saudicon.app](https://saudicon.app/x?utm_source=openai)). See [SPA](https://spa.gov.sa/a).', found), 'Cityscape draws engineers. See SPA.');
  assert.deepEqual(found.map((f) => f.url), ['https://saudicon.app/x?utm_source=openai', 'https://spa.gov.sa/a']);
});

test('captions are fitted to the platform, extra hashtags dropped', async () => {
  const { fitCaption } = await import('../server/captions');
  const out = fitCaption('instagram', 'افهم أهداف CFM\nتعرّف أكثر\n#Engosoft #CFM #a_b #c_d #e_f #g_h #i_j #k_l');
  assert.equal(out.match(/#/g)?.length, 5);
  assert.ok(out.startsWith('افهم أهداف CFM'));
  assert.equal(fitCaption('whatsapp', 'سجّل الآن #CFM').includes('#'), false);
});

test('suggested publishing times follow the lead platform in Saudi time', async () => {
  const { DateTime } = await import('luxon');
  // Wednesday 4 Nov 2026, 15:00 in Riyadh (Egypt's summer time has ended).
  const now = DateTime.fromISO('2026-11-04T15:00', { zone: 'Asia/Riyadh' });
  assert.deepEqual(suggestedSlots(['facebook', 'instagram'], 'Asia/Riyadh', now).map((s) => s.at), ['2026-11-04T21:00', '2026-11-05T12:00', '2026-11-05T21:00']);
  // Cairo is an hour behind Riyadh in winter: the same slot reads 20:00 there.
  assert.equal(suggestedSlots(['instagram'], 'Africa/Cairo', now)[0].at, '2026-11-04T20:00');
  // LinkedIn skips Thursday to Saturday: the next Sunday morning comes after Wednesday's lunch window is gone.
  assert.equal(suggestedSlots(['linkedin'], 'Asia/Riyadh', now)[0].at, '2026-11-08T08:00');
});
