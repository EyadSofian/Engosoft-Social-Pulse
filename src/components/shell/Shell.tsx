import type { ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  ChartNoAxesColumn,
  LayoutGrid,
  Moon,
  Plug,
  Plus,
  RefreshCw,
  Sun,
  TrendingUp,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context';
import type { Route, Theme } from '../../hooks/ui';
import { relative } from '../../lib/format';
import { Button, IconButton } from '../ui/Button';
import { Logo, Skeleton } from '../ui/Bits';
import { useSlidingIndicator } from '../ui/Controls';

export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span className="aurora__orb aurora__orb--coral" />
      <span className="aurora__orb aurora__orb--indigo" />
      <span className="aurora__orb aurora__orb--amber" />
      <span className="aurora__grain" />
    </div>
  );
}

export const NAV: { id: Route; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'نظرة عامة', short: 'الرئيسية', icon: LayoutGrid },
  { id: 'calendar', label: 'الكاليندر', short: 'الكاليندر', icon: CalendarDays },
  { id: 'content', label: 'أداء المحتوى', short: 'المحتوى', icon: ChartNoAxesColumn },
  { id: 'insights', label: 'التحليلات', short: 'التحليلات', icon: TrendingUp },
  { id: 'connections', label: 'الربط والمنصات', short: 'الربط', icon: Plug },
];

interface NavState {
  attention: number;
  connectorIssue: boolean;
  alerts: number;
  lastSync: number;
  theme: Theme;
  onToggleTheme: () => void;
}

function NavLinks({ variant, attention, connectorIssue }: { variant: 'bar' | 'dock' } & Pick<NavState, 'attention' | 'connectorIssue'>) {
  const { route } = useApp();
  const { ref, style, ready } = useSlidingIndicator<HTMLElement>(route);
  return (
    <nav className={variant === 'bar' ? 'tabs' : 'dock glass glass--float'} aria-label="أقسام اللوحة" ref={ref}>
      <span className="tabs__pill" style={style} data-ready={ready} aria-hidden />
      {NAV.map(({ id, label, short, icon: Icon }) => (
        <a key={id} href={`#/${id}`} className="tab" data-active={route === id} aria-current={route === id ? 'page' : undefined}>
          <span className="tab__icon">
            <Icon size={variant === 'bar' ? 17 : 20} strokeWidth={1.9} />
            {id === 'calendar' && attention > 0 && <b className="tab__badge">{attention > 9 ? '9+' : attention}</b>}
            {id === 'connections' && connectorIssue && <b className="tab__badge tab__badge--dot" aria-label="يوجد ربط يحتاج مراجعة" />}
          </span>
          <span className="tab__label">{variant === 'bar' ? label : short}</span>
        </a>
      ))}
    </nav>
  );
}

export function TopNav({ attention, connectorIssue, alerts, lastSync, theme, onToggleTheme }: NavState) {
  const { store, now, openPlan, openAlerts, runSync } = useApp();
  return (
    <>
    <div className="topfade" aria-hidden />
    <header className="nav glass glass--float">
      <a className="brand" href="#/overview" aria-label="Social Pulse — الرئيسية">
        <Logo size={38} />
        <span className="brand__text">
          <b>Social Pulse</b>
          <small>Engosoft</small>
        </span>
      </a>

      <NavLinks variant="bar" attention={attention} connectorIssue={connectorIssue} />

      <div className="nav__actions">
        <button type="button" className="sync" onClick={() => void runSync()} disabled={store.syncing} data-busy={store.syncing || undefined}>
          <RefreshCw size={15} />
          <span>{store.syncing ? 'جارٍ المزامنة…' : lastSync ? `آخر مزامنة ${relative(lastSync, now)}` : 'مزامنة الآن'}</span>
        </button>
        <IconButton label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'} onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
        <IconButton label="التنبيهات" onClick={openAlerts} className="bell">
          <Bell size={18} />
          {alerts > 0 && <b className="bell__count">{alerts > 9 ? '9+' : alerts}</b>}
        </IconButton>
        <Button variant="primary" icon={<Plus size={17} />} className="nav__new" onClick={() => openPlan({ mode: 'new' })}>
          بوست جديد
        </Button>
      </div>
    </header>
    </>
  );
}

export function Dock(props: Pick<NavState, 'attention' | 'connectorIssue'>) {
  return (
    <div className="dock-wrap">
      <NavLinks variant="dock" {...props} />
    </div>
  );
}

export function OfflineScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="gate">
      <div className="gate__card glass glass--float">
        <span className="gate__badge">
          <WifiOff size={26} />
        </span>
        <h1>تعذّر تحميل البيانات</h1>
        <p>{message}</p>
        <Button variant="primary" icon={<RefreshCw size={16} />} onClick={onRetry} className="gate__submit">
          إعادة المحاولة
        </Button>
      </div>
    </main>
  );
}

export function LoadingScreen() {
  return (
    <main className="page" aria-busy="true" aria-label="جارٍ تحميل البيانات">
      <div className="boot">
        <Logo size={46} />
        <span>جارٍ تحميل البيانات…</span>
      </div>
      <div className="grid">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="glass panel col-3">
            <Skeleton style={{ width: '46%', height: 13 }} />
            <Skeleton style={{ width: '62%', height: 34, marginTop: 18 }} />
            <Skeleton style={{ width: '100%', height: 30, marginTop: 20 }} />
          </div>
        ))}
        <div className="glass panel col-8">
          <Skeleton style={{ width: '30%', height: 16 }} />
          <Skeleton style={{ width: '100%', height: 250, marginTop: 22 }} />
        </div>
        <div className="glass panel col-4">
          <Skeleton style={{ width: '44%', height: 16 }} />
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} style={{ width: '100%', height: 48, marginTop: 14 }} />
          ))}
        </div>
      </div>
    </main>
  );
}

export function StaleBanner({ message, action }: { message: string; action: ReactNode }) {
  return (
    <div className="stale glass" role="status">
      <WifiOff size={16} />
      <span>{message} البيانات المعروضة من آخر تحديث ناجح.</span>
      {action}
    </div>
  );
}
