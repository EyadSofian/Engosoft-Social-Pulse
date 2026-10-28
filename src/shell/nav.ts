import type { LucideIcon } from 'lucide-react';
import { CalendarDays, ChartSpline, GraduationCap, Layers, LayoutDashboard, Library, Send, Settings, Wallet, WandSparkles } from 'lucide-react';
import type { Text } from '../domain/shared';
import type { User } from '../domain/users';
import { hasPermission } from '../features/workspace/permissions';

export type NavId = 'overview' | 'home' | 'content' | 'calendar' | 'publish' | 'analytics' | 'courses' | 'library' | 'usage' | 'settings';

export interface NavItem {
  id: NavId;
  path: string;
  label: Text;
  icon: LucideIcon;
  /** Who sees the item. Hidden items are not routes the user can work in. */
  visible: (user: User) => boolean;
}

export interface NavGroup {
  id: 'main' | 'results' | 'resources' | 'system';
  label: Text;
  items: NavItem[];
}

const everyone = () => true;

/** The day's work in order: see where things stand, make, approve, plan, publish; then results, resources, setup. */
export const NAV: NavGroup[] = [
  {
    id: 'main',
    label: { en: 'Workspace', ar: 'مساحة العمل' },
    items: [
      { id: 'overview', path: '/overview', label: { en: 'Overview', ar: 'نظرة عامة' }, icon: LayoutDashboard, visible: everyone },
      { id: 'home', path: '/', label: { en: 'Create', ar: 'إنشاء' }, icon: WandSparkles, visible: (user) => hasPermission(user, 'content.create') },
      { id: 'content', path: '/content', label: { en: 'Content & approval', ar: 'المحتوى والاعتماد' }, icon: Layers, visible: everyone },
      { id: 'calendar', path: '/calendar', label: { en: 'Calendar', ar: 'التقويم' }, icon: CalendarDays, visible: everyone },
      { id: 'publish', path: '/publish', label: { en: 'Publishing', ar: 'النشر' }, icon: Send, visible: (user) => hasPermission(user, 'content.publish') || hasPermission(user, 'content.schedule') },
    ],
  },
  {
    id: 'results',
    label: { en: 'Results', ar: 'النتائج' },
    items: [
      { id: 'analytics', path: '/analytics', label: { en: 'Analytics', ar: 'التحليلات' }, icon: ChartSpline, visible: (user) => hasPermission(user, 'analytics.view') },
    ],
  },
  {
    id: 'resources',
    label: { en: 'Resources', ar: 'الموارد' },
    items: [
      { id: 'library', path: '/library', label: { en: 'Library', ar: 'المكتبة' }, icon: Library, visible: everyone },
      // Marketing reviews course content here; anyone who makes posts can read it.
      { id: 'courses', path: '/courses', label: { en: 'Courses', ar: 'الدورات' }, icon: GraduationCap, visible: (user) => hasPermission(user, 'templates.manage') || hasPermission(user, 'content.create') },
    ],
  },
  {
    id: 'system',
    label: { en: 'System', ar: 'النظام' },
    items: [
      { id: 'usage', path: '/usage', label: { en: 'AI usage', ar: 'الاستهلاك' }, icon: Wallet, visible: (user) => hasPermission(user, 'credits.view') || hasPermission(user, 'credits.view_all') },
      { id: 'settings', path: '/settings', label: { en: 'Settings', ar: 'الإعدادات' }, icon: Settings, visible: (user) => hasPermission(user, 'users.manage') || hasPermission(user, 'connections.manage') },
    ],
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
