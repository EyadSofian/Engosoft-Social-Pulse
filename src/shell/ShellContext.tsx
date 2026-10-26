import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

interface ShellState {
  collapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  crumbs: Crumb[];
  setCrumbs: (crumbs: Crumb[]) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
}

const SIDEBAR_KEY = 'social-pulse-sidebar';
const ShellContext = createContext<ShellState | null>(null);

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const toggleSidebar = useCallback(
    () =>
      setCollapsed((value) => {
        try {
          localStorage.setItem(SIDEBAR_KEY, value ? 'expanded' : 'collapsed');
        } catch {
          /* Remembered for this visit only. */
        }
        return !value;
      }),
    [],
  );

  const value = useMemo<ShellState>(
    () => ({ collapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen, crumbs, setCrumbs, paletteOpen, setPaletteOpen, notificationsOpen, setNotificationsOpen }),
    [collapsed, toggleSidebar, mobileNavOpen, crumbs, paletteOpen, notificationsOpen],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const value = useContext(ShellContext);
  if (!value) throw new Error('useShell must be used inside ShellProvider.');
  return value;
}

/** Pages declare their breadcrumb trail and document title. */
export function usePageMeta(title: string, crumbs: Crumb[]) {
  const { setCrumbs } = useShell();
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    setCrumbs(crumbs);
    document.title = `${title} · ${document.documentElement.lang === 'en' ? 'Mobde3' : 'مبدع'}`;
    // `key` captures the crumb contents; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, key, setCrumbs]);
}
