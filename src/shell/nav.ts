import type { LucideIcon } from 'lucide-react';
import { BellRing, CalendarDays, ChartSpline, GraduationCap, Layers, LayoutDashboard, Library, MessageCircle, Radar, Send, Settings, Wallet, WandSparkles } from 'lucide-react';
import type { Text } from '../domain/shared';
import type { User } from '../domain/users';
import { hasPermission } from '../features/workspace/permissions';

export type NavId = 'overview' | 'home' | 'content' | 'calendar' | 'publish' | 'insights' | 'analytics' | 'comments' | 'radar' | 'courses' | 'library' | 'usage' | 'settings';

export interface NavItem {
  id: NavId;
  path: string;
  label: Text;
  icon: LucideIcon;
  /** Who sees the item. Hidden items are not routes the user can work in. */
  visible: (user: User) => boolean;
}

export interface NavGroup {
  id: 'overview' | 'content' | 'results' | 'resources' | 'system';
  label: Text;
  icon: LucideIcon;
  items: NavItem[];
}

const everyone = () => true;

/**
 * Five sections in the order of the day's work. The sidebar shows each section once; the open section lists its
 * pages, and the same pages show as tabs at the top of the page. Every page that existed before is still here.
 */
export const NAV: NavGroup[] = [
  {
    id: 'overview',
    label: { en: 'Overview', ar: 'نظرة عامة' },
    icon: LayoutDashboard,
    items: [
      { id: 'overview', path: '/overview', label: { en: 'Overview', ar: 'نظرة عامة' }, icon: LayoutDashboard, visible: everyone },
    ],
  },
  {
    id: 'content',
    label: { en: 'Content', ar: 'المحتوى' },
    icon: Layers,
    items: [
      { id: 'home', path: '/', label: { en: 'Create', ar: 'إنشاء' }, icon: WandSparkles, visible: (user) => hasPermission(user, 'content.create') },
      { id: 'content', path: '/content', label: { en: 'Approval', ar: 'الاعتماد' }, icon: Layers, visible: everyone },
      { id: 'calendar', path: '/calendar', label: { en: 'Calendar', ar: 'التقويم' }, icon: CalendarDays, visible: everyone },
      { id: 'publish', path: '/publish', label: { en: 'Publishing', ar: 'النشر' }, icon: Send, visible: (user) => hasPermission(user, 'content.publish') || hasPermission(user, 'content.schedule') },
    ],
  },
  {
    id: 'results',
    label: { en: 'Results', ar: 'النتائج' },
    icon: ChartSpline,
    items: [
      { id: 'insights', path: '/insights', label: { en: 'Performance', ar: 'ملخص الأداء' }, icon: BellRing, visible: (user) => hasPermission(user, 'analytics.view') },
      { id: 'analytics', path: '/analytics', label: { en: 'Analytics', ar: 'التحليلات' }, icon: ChartSpline, visible: (user) => hasPermission(user, 'analytics.view') },
      { id: 'comments', path: '/comments', label: { en: 'Comments', ar: 'التعليقات' }, icon: MessageCircle, visible: (user) => hasPermission(user, 'analytics.view') },
      { id: 'radar', path: '/competitors', label: { en: 'Competitors', ar: 'المنافسين' }, icon: Radar, visible: (user) => hasPermission(user, 'analytics.view') },
    ],
  },
  {
    id: 'resources',
    label: { en: 'Library', ar: 'المكتبة' },
    icon: Library,
    items: [
      { id: 'library', path: '/library', label: { en: 'Templates & designs', ar: 'القوالب والتصاميم' }, icon: Library, visible: everyone },
      // Marketing reviews course content here; anyone who makes posts can read it.
      { id: 'courses', path: '/courses', label: { en: 'Courses', ar: 'الدورات' }, icon: GraduationCap, visible: (user) => hasPermission(user, 'templates.manage') || hasPermission(user, 'content.create') },
    ],
  },
  {
    id: 'system',
    label: { en: 'Admin', ar: 'الإدارة' },
    icon: Settings,
    items: [
      { id: 'settings', path: '/settings', label: { en: 'Settings', ar: 'الإعدادات' }, icon: Settings, visible: (user) => hasPermission(user, 'users.manage') || hasPermission(user, 'connections.manage') },
      { id: 'usage', path: '/usage', label: { en: 'AI usage', ar: 'الاستهلاك' }, icon: Wallet, visible: (user) => hasPermission(user, 'credits.view') || hasPermission(user, 'credits.view_all') },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((group) => group.items);
export const navItem = (id: NavId) => NAV_ITEMS.find((item) => item.id === id)!;

/** The nav item that owns a path: "/content/ci-1" belongs to Content. */
export function activeNav(path: string): NavId | null {
  if (path === '/') return 'home';
  const alias: [string, NavId][] = [['/studio/', 'content'], ['/connections', 'settings'], ['/tracking', 'analytics'], ['/performance', 'analytics'], ['/radar', 'radar'], ['/library/', 'library']];
  const aliased = alias.find(([prefix]) => path === prefix || path.startsWith(prefix));
  if (aliased) return aliased[1];
  const hit = NAV_ITEMS.filter((item) => item.path !== '/' && (path === item.path || path.startsWith(`${item.path}/`)));
  return hit[0]?.id ?? null;
}

/** The section a page belongs to, with only the pages this person can open. */
export function sectionOf(id: NavId | null, user: User): (NavGroup & { visibleItems: NavItem[] }) | null {
  const group = id ? NAV.find((g) => g.items.some((item) => item.id === id)) : null;
  return group ? { ...group, visibleItems: group.items.filter((item) => item.visible(user)) } : null;
}
