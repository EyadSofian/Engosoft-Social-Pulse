/** Compare text read from generated pixels with the canonical copy. Generated Arabic is never trusted blindly. */

export type CopyVerdict = 'exact' | 'acceptable' | 'incorrect' | 'missing';
export interface CanonicalCopy { headline: string; subheadline?: string; facts?: string[]; cta?: string }
export interface CopyCheck { field: string; expected: string; verdict: CopyVerdict; critical: boolean }

const strip = (value: string) => value
  .replace(/[ً-ٰٟـ]/g, '') // harakat, superscript alef, tatweel
  .replace(/[‎‏‪-‮⁦-⁩]/g, '')
  .replace(/[،,.:;!؟?«»"'()\-–—_/|]+/g, ' ')
  .replace(/\s+/g, ' ').trim().toLowerCase();
const fold = (value: string) => strip(value).replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * Compared word by word, so line breaks and reading order chosen by the design do not count as errors.
 * exact: every word present after removing diacritics/punctuation. acceptable: present after folding
 * alef/yaa/taa-marbuta and digit shapes. Facts (dates, times) are critical and must be exact.
 */
export function checkCopy(canonical: CanonicalCopy, readText: string[], audit: { expected: string; rendered: string; exact: boolean }[] = []): CopyCheck[] {
  // Only a difference in the words themselves counts; numbers drifting to the other end of a right-to-left line do not.
  const words = (value: string) => strip(value).split(' ').filter(Boolean).sort().join(' ');
  const auditedWrong = new Set(audit.filter((a) => !a.exact && words(a.rendered) !== words(a.expected)).map((a) => strip(a.expected)));
  const strictWords = new Set(strip(readText.join(' ')).split(' ')), foldedWords = new Set(fold(readText.join(' ')).split(' '));
  const rawSeen = readText.join(' ').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const verdict = (expected: string): CopyVerdict => {
    // A letter-level audit that found a misspelling overrides word matching on an auto-corrected transcription.
    if (auditedWrong.has(strip(expected))) return 'incorrect';
    // Dates and times must appear digit-for-digit in order; word matching alone would accept 11-24-2026 for 24-11-2026.
    const numbers = expected.match(/\d+(?:[-/.:]\d+)+/g) ?? [];
    if (numbers.some((group) => !rawSeen.includes(group))) return 'incorrect';
    const strictTokens = strip(expected).split(' ').filter(Boolean), foldedTokens = fold(expected).split(' ').filter(Boolean);
    if (strictTokens.every((word) => strictWords.has(word))) return 'exact';
    if (foldedTokens.every((word) => foldedWords.has(word))) return 'acceptable';
    return foldedTokens.some((word) => foldedWords.has(word)) ? 'incorrect' : 'missing';
  };
  const checks: CopyCheck[] = [{ field: 'headline', expected: canonical.headline, verdict: verdict(canonical.headline), critical: true }];
  if (canonical.subheadline) checks.push({ field: 'subheadline', expected: canonical.subheadline, verdict: verdict(canonical.subheadline), critical: false });
  canonical.facts?.forEach((fact, index) => checks.push({ field: `fact${index + 1}`, expected: fact, verdict: verdict(fact), critical: true }));
  if (canonical.cta) checks.push({ field: 'cta', expected: canonical.cta, verdict: verdict(canonical.cta), critical: true });
  return checks;
}

export const copyPasses = (checks: CopyCheck[]) => checks.every((check) => !check.critical || check.verdict === 'exact' || (check.verdict === 'acceptable' && !/fact/.test(check.field)));
