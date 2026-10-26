import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/* ── Theme ─────────────────────────────────────────────────────────── */

export type Theme = 'dark' | 'light';
const THEME_KEY = 'social-pulse-theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#0d1015', light: '#f6f8fb' };

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
  // Only an explicit choice is remembered; until then the page follows the system setting.
  const toggle = useCallback(
    () =>
      setTheme((current) => {
        const next = current === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          /* The choice simply won't persist. */
        }
        return next;
      }),
    [],
  );
  return { theme, toggle };
}

/* ── Clock ─────────────────────────────────────────────────────────── */

/** Re-renders on an interval so countdowns and "today" stay current. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/* ── Measurement ───────────────────────────────────────────────────── */

export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/* ── Overlays ──────────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let openOverlays = 0;

/** Escape to close, focus kept inside, page scroll locked, focus restored afterwards. */
export function useOverlay(active: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    openOverlays++;
    root.classList.add('is-locked');
    const frame = requestAnimationFrame(() => {
      const panel = ref.current;
      if (!panel || panel.contains(document.activeElement)) return;
      (panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel).focus({ preventScroll: true });
    });

    const onKey = (event: KeyboardEvent) => {
      const panel = ref.current;
      if (!panel) return;
      // Only the top-most overlay reacts.
      const overlays = document.querySelectorAll('[data-overlay]');
      if (overlays[overlays.length - 1] !== panel) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !panel.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !panel.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      openOverlays--;
      if (openOverlays === 0) root.classList.remove('is-locked');
      previous?.focus?.({ preventScroll: true });
    };
  }, [active]);

  return ref;
}
