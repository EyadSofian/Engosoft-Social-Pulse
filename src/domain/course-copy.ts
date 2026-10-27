/** Editorial copy comes from the saved course profile, with no dates, prices or credentials invented. */
export interface CourseCopySource {
  courseName: string;
  objectives: string[];
  outcomes: string[];
  audience: string;
  sourceUrl?: string;
}
export function courseCopy(p: CourseCopySource): Record<string, string> {
  return {
    title: p.courseName,
    subtitle: 'طوّر مهاراتك المهنية',
    body: p.objectives.slice(0, 3).join('\n'),
    objectives: p.objectives.join('\n'),
    audience: p.audience,
    outcomes: p.outcomes.join('\n'),
    cta: 'اكتشف تفاصيل الدورة',
    caption:
      `${p.courseName}\n${p.objectives.slice(0, 2).join('\n')}\n${p.sourceUrl || ''}`.trim(),
  };
}
/** Only known fields enter a template; each field retains its character limit. */
export function courseTemplateCopy(
  p: CourseCopySource,
  fields: { key: string; maxChars?: number }[],
) {
  const copy = courseCopy(p);
  return Object.fromEntries(
    fields
      .filter((f) => f.key in copy)
      .map((f) => [f.key, copy[f.key].slice(0, f.maxChars ?? 2000)]),
  );
}
