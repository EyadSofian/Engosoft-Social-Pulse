import type { LucideIcon } from 'lucide-react';
import { CalendarDays, ChartColumn, Layers, Library, Settings, WandSparkles } from 'lucide-react';
import type { Text } from '../domain/shared';
import type { User } from '../domain/users';
import { hasPermission } from '../features/workspace/permissions';

export type NavId = 'home' | 'content' | 'calendar' | 'performance' | 'library' | 'settings';

export interface NavItem {
  id: NavId;
  path: string;
  label: Text;
  icon: LucideIcon;
  /** Who sees the item. Hidden items are not routes the user can work in. */
  visible: (user: User) => boolean;
}

export interface NavGroup {
  id: 'main' | 'system';
  label: Text;
  items: NavItem[];
}

const everyone = () => true;

/** Six destinations: make, move through review, plan, measure, reuse, configure. */
export const NAV: NavGroup[] = [
  {
    id: 'main',
    label: { en: 'Workspace', ar: 'مساحة العمل' },
    items: [
      { id: 'home', path: '/', label: { en: 'Create', ar: 'إنشاء' }, icon: WandSparkles, visible: (user) => hasPermission(user, 'content.create') },
      { id: 'content', path: '/content', label: { en: 'Content', ar: 'المحتوى' }, icon: Layers, visible: everyone },
      { id: 'calendar', path: '/calendar', label: { en: 'Calendar', ar: 'التقويم' }, icon: CalendarDays, visible: everyone },
      { id: 'performance', path: '/performance', label: { en: 'Performance', ar: 'الأداء' }, icon: ChartColumn, visible: (user) => hasPermission(user, 'analytics.view') },
      { id: 'library', path: '/library', label: { en: 'Library', ar: 'المكتبة' }, icon: Library, visible: everyone },
    ],
  },
  {
    id: 'system',
    label: { en: 'System', ar: 'النظام' },
    items: [{ id: 'settings', path: '/settings', label: { en: 'Settings', ar: 'الإعدادات' }, icon: Settings, visible: (user) => hasPermission(user, 'users.manage') || hasPermission(user, 'connections.manage') }],
  },
];

export const NAV_ITEMS = NAV.flatMap((group) => group.items);
export const navItem = (id: NavId) => NAV_ITEMS.find((item) => item.id === id)!;

/** The nav item that owns a path: "/content/ci-1" belongs to Content. */
export function activeNav(path: string): NavId | null {
  if (path === '/') return 'home';
  const hit = NAV_ITEMS.filter((item) => item.path !== '/' && (path === item.path || path.startsWith(`${item.path}/`)));
  return hit[0]?.id ?? null;
}
