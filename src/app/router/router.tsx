import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

/**
 * A small history router. The app has a dozen routes with one or two params;
 * the server already falls back to index.html, so clean URLs work in production.
 */
export interface Location {
  path: string;
  query: URLSearchParams;
}

interface RouterApi extends Location {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterApi | null>(null);

/** Old hash routes (#/content, #/connections?tiktok=…) keep working from bookmarks and the TikTok OAuth return. */
const LEGACY_HASH: Record<string, string> = {
  overview: '/overview',
  calendar: '/calendar',
  content: '/tracking',
  insights: '/analytics',
  connections: '/connections',
};

function upgradeLegacyHash() {
  const match = window.location.hash.match(/^#\/?([a-z]+)(\?.*)?$/);
  if (!match) return;
  const target = LEGACY_HASH[match[1]];
  if (!target) return;
  const query = match[2] ? match[2].slice(1) : '';
  const joined = query ? `${target}${target.includes('?') ? '&' : '?'}${query}` : target;
  window.history.replaceState(null, '', joined);
}

const read = (): Location => ({ path: window.location.pathname.replace(/\/+$/, '') || '/', query: new URLSearchParams(window.location.search) });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Location>(() => {
    upgradeLegacyHash();
    return read();
  });

  useEffect(() => {
    const onPop = () => setLocation(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const current = `${window.location.pathname}${window.location.search}`;
    if (to === current) return;
    if (options?.replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    const pathChanged = new URL(to, window.location.origin).pathname !== new URL(current, window.location.origin).pathname;
    setLocation(read());
    if (pathChanged) document.getElementById('app-main')?.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<RouterApi>(() => ({ ...location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterApi {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRouter must be used inside RouterProvider.');
  return value;
}

/** "/content/:id" against "/content/ci-1" → { id: "ci-1" }; null when it does not match. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < a.length; index++) {
    if (a[index].startsWith(':')) params[a[index].slice(1)] = decodeURIComponent(b[index]);
    else if (a[index] !== b[index]) return null;
  }
  return params;
}

/** Sets or clears query parameters on the current path. */
export function useQueryState() {
  const { path, query, navigate } = useRouter();
  const set = useCallback(
    (patch: Record<string, string | null>, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(query);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      navigate(`${path}${search ? `?${search}` : ''}`, { replace: options?.replace ?? true });
    },
    [path, query, navigate],
  );
  return [query, set] as const;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

export function Link({ to, onClick, target, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || target === '_blank' || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} target={target} {...rest} />;
}
