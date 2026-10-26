import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { businessZone, MISSING, parseTimestamp } from '../lib/format';
import type { Text } from '../domain/shared';

export type Lang = 'ar' | 'en';
const LANG_KEY = 'social-pulse-lang';

/** Latin digits in both languages: dates, metrics and English product names share one numeral system. */
const LOCALE: Record<Lang, string> = { ar: 'ar-EG-u-nu-latn', en: 'en-GB' };

export type DateStyle = 'day' | 'dayShort' | 'date' | 'dateTime' | 'time' | 'weekday' | 'weekdayNarrow' | 'weekdayDate' | 'month';
const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric', month: 'long' },
  dayShort: { day: 'numeric', month: 'short' },
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  dateTime: { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
  time: { hour: 'numeric', minute: '2-digit' },
  weekday: { weekday: 'long' },
  weekdayNarrow: { weekday: 'narrow' },
  weekdayDate: { weekday: 'long', day: 'numeric', month: 'long' },
  month: { month: 'long', year: 'numeric' },
};

export interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  /** Inline bilingual copy: English first, Arabic second. */
  t: (en: string, ar: string) => string;
  /** A seeded or catalog name that carries both languages. */
  tx: (text: Text) => string;
  setLang: (lang: Lang) => void;
  num: (value: number | null | undefined) => string;
  compact: (value: number | null | undefined) => string;
  /** "a / b" kept left-to-right inside Arabic text, so 10 / 12 never reads as 12 / 10. */
  ratio: (a: number | null | undefined, b: number | null | undefined) => string;
  pct: (value: number | null | undefined, digits?: number) => string;
  date: (value: string | number | null | undefined, style?: DateStyle) => string;
  relative: (value: string | number | null | undefined, now?: number) => string;
  bytes: (value: number) => string;
}

function readLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* Private mode: fall back to the default. */
  }
  return document.documentElement.lang === 'en' ? 'en' : 'ar';
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* The choice lasts for this visit only. */
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const locale = LOCALE[lang];
    const integer = new Intl.NumberFormat(locale);
    const compactFmt = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
    const formats = new Map<string, Intl.DateTimeFormat>();
    const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { numeric: 'auto' });
    const toMs = (input: string | number) => (typeof input === 'number' ? input : parseTimestamp(input));

    return {
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t: (en, ar) => (lang === 'ar' ? ar : en),
      tx: (text) => text[lang],
      setLang,
      num: (value) => (value == null || Number.isNaN(value) ? MISSING : integer.format(value)),
      ratio: (a, b) => `\u2066${a == null ? MISSING : integer.format(a)} / ${b == null ? MISSING : integer.format(b)}\u2069`,
      compact: (value) => (value == null ? MISSING : Math.abs(value) < 10_000 ? integer.format(value) : compactFmt.format(value)),
      pct: (value, digits = 0) =>
        value == null || Number.isNaN(value) ? MISSING : `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)}%`,
      date: (input, style = 'date') => {
        if (input == null || input === '') return MISSING;
        const ms = toMs(input);
        if (!Number.isFinite(ms)) return MISSING;
        let format = formats.get(style);
        if (!format) {
          format = new Intl.DateTimeFormat(locale, { timeZone: businessZone(), ...DATE_OPTIONS[style] });
          formats.set(style, format);
        }
        return format.format(ms);
      },
      relative: (input, now = Date.now()) => {
        if (input == null || input === '') return MISSING;
        const ms = toMs(input);
        if (!Number.isFinite(ms)) return MISSING;
        const diff = ms - now;
        const abs = Math.abs(diff);
        if (abs < 45_000) return lang === 'ar' ? 'الآن' : 'just now';
        if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
        if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
        // Calendar days in the business timezone, so "tomorrow" means the next working date, not +24h.
        const days = Math.round(
          DateTime.fromMillis(ms, { zone: businessZone() }).startOf('day').diff(DateTime.fromMillis(now, { zone: businessZone() }).startOf('day'), 'days').days,
        );
        if (Math.abs(days) < 30) return rtf.format(days, 'day');
        if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month');
        return rtf.format(Math.round(days / 365), 'year');
      },
      bytes: (value) => {
        const units = lang === 'ar' ? ['بايت', 'ك.ب', 'م.ب', 'ج.ب'] : ['B', 'KB', 'MB', 'GB'];
        let size = value;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
          size /= 1024;
          unit++;
        }
        return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`;
      },
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider.');
  return value;
}
