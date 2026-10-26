import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CalendarDays,
  ChartColumn,
  Coins,
  House,
  Images,
  Inbox,
  Layers,
  LayoutTemplate,
  ListChecks,
  Plug,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { Text } from '../domain/shared';
import type { User } from '../domain/users';
import { hasPermission } from '../features/workspace/permissions';

export type NavId =
  | 'home'
  | 'my-work'
  | 'content'
  | 'calendar'
  | 'tasks'
  | 'templates'
  | 'ai-studio'
  | 'media'
  | 'achievements'
  | 'departments'
  | 'analytics'
  | 'credits'
  | 'connections'
  | 'admin';

export interface NavItem {
  id: NavId;
  path: string;
  label: Text;
  icon: LucideIcon;
  /** Who sees the item. Hidden items are not routes the user can work in. */
  visible: (user: User) => boolean;
}

export interface NavGroup {
  id: 'main' | 'management' | 'system';
  label: Text;
  items: NavItem[];
}

const everyone = () => true;

export const NAV: NavGroup[] = [
  {
    id: 'main',
    label: { en: 'Main', ar: 'الرئيسية' },
    items: [
      { id: 'home', path: '/', label: { en: 'Home', ar: 'الرئيسية' }, icon: House, visible: everyone },
      { id: 'my-work', path: '/my-work', label: { en: 'My Work', ar: 'عملي' }, icon: Inbox, visible: everyone },
      { id: 'content', path: '/content', label: { en: 'Content', ar: 'المحتوى' }, icon: Layers, visible: everyone },
      { id: 'calendar', path: '/calendar', label: { en: 'Calendar', ar: 'التقويم' }, icon: CalendarDays, visible: everyone },
      { id: 'tasks', path: '/tasks', label: { en: 'Tasks & Approvals', ar: 'المهام والاعتمادات' }, icon: ListChecks, visible: everyone },
      { id: 'templates', path: '/templates', label: { en: 'Templates', ar: 'القوالب' }, icon: LayoutTemplate, visible: everyone },
      { id: 'ai-studio', path: '/ai-studio', label: { en: 'AI Studio', ar: 'استوديو الذكاء الاصطناعي' }, icon: Sparkles, visible: (user) => hasPermission(user, 'content.create') },
      { id: 'media', path: '/media', label: { en: 'Media Library', ar: 'مكتبة الوسائط' }, icon: Images, visible: everyone },
      {
        id: 'achievements',
        path: '/achievements',
        label: { en: 'Hall of Fame', ar: 'لوحة الشرف' },
        icon: Trophy,
        visible: (user) => user.departmentId === 'operations' || user.departmentId === 'marketing' || user.role === 'admin',
      },
    ],
  },
  {
    id: 'management',
    label: { en: 'Management', ar: 'الإدارة' },
    items: [
      { id: 'departments', path: '/departments', label: { en: 'Departments', ar: 'الأقسام' }, icon: Building2, visible: (user) => user.role !== 'freelancer' },
      { id: 'analytics', path: '/analytics', label: { en: 'Analytics', ar: 'التحليلات' }, icon: ChartColumn, visible: (user) => hasPermission(user, 'analytics.view') },
      { id: 'credits', path: '/credits', label: { en: 'Credits & Usage', ar: 'الرصيد والاستخدام' }, icon: Coins, visible: (user) => hasPermission(user, 'credits.view') },
      { id: 'connections', path: '/connections', label: { en: 'Connections', ar: 'الربط والمنصات' }, icon: Plug, visible: (user) => hasPermission(user, 'connections.manage') || hasPermission(user, 'analytics.view_all') },
    ],
  },
  {
    id: 'system',
    label: { en: 'System', ar: 'النظام' },
    items: [{ id: 'admin', path: '/admin', label: { en: 'Admin', ar: 'إدارة النظام' }, icon: ShieldCheck, visible: (user) => hasPermission(user, 'admin.access') }],
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
