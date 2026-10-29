import type { Department, Permission, Role, RoleId } from './users';
import { ALL_PERMISSIONS } from './users';

const CREATOR: Permission[] = ['content.create', 'design.free', 'design.templates', 'design.upload', 'design.video', 'content.edit_own', 'credits.view'];
const SUPERVISOR: Permission[] = [...CREATOR, 'content.edit_department', 'content.schedule', 'content.publish', 'task.assign', 'analytics.view', 'plans.view_all'];
const MARKETING_MANAGER: Permission[] = [...SUPERVISOR, 'content.edit_any', 'content.approve', 'templates.manage', 'analytics.view_all', 'credits.view_all', 'connections.manage'];
const MANAGER: Permission[] = [...MARKETING_MANAGER, 'users.manage'];

/**
 * Five roles, each one step above the last. A person's own overrides (Settings → Permissions) narrow or widen
 * their role, e.g. an Operations creator limited to template posts. The server enforces the same table.
 */
export const ROLES: Record<RoleId, Role> = {
  creator: {
    id: 'creator',
    name: { en: 'Content Creator', ar: 'منشئ محتوى' },
    description: { en: 'Creates posts and sends them for approval.', ar: 'ينشئ المنشورات ويرسلها للاعتماد.' },
    permissions: CREATOR,
  },
  supervisor: {
    id: 'supervisor',
    name: { en: 'Content Supervisor', ar: 'مسؤول المحتوى' },
    description: { en: 'Follows the team’s work, schedules and publishes approved posts.', ar: 'يتابع شغل الفريق، ويجدول المنشورات المعتمدة وينشرها.' },
    permissions: SUPERVISOR,
  },
  marketing_manager: {
    id: 'marketing_manager',
    name: { en: 'Marketing Manager', ar: 'مدير التسويق' },
    description: { en: 'Approves every post, manages templates and connected accounts.', ar: 'يعتمد كل المنشورات ويدير القوالب والحسابات المربوطة.' },
    permissions: MARKETING_MANAGER,
  },
  manager: {
    id: 'manager',
    name: { en: 'Manager', ar: 'مدير' },
    description: { en: 'Everything Marketing can do, plus the team’s accounts and permissions.', ar: 'كل صلاحيات التسويق، ومعها حسابات الفريق وصلاحياته.' },
    permissions: MANAGER,
  },
  admin: {
    id: 'admin',
    name: { en: 'Administrator', ar: 'مسؤول النظام' },
    description: { en: 'Full access, including system settings.', ar: 'وصول كامل، ومعه إعدادات النظام.' },
    permissions: ALL_PERMISSIONS,
  },
};

export const ROLE_ORDER: RoleId[] = ['creator', 'supervisor', 'marketing_manager', 'manager', 'admin'];

export const can = (role: RoleId, permission: Permission) => ROLES[role].permissions.includes(permission);

export const DEPARTMENTS: Department[] = [
  {
    id: 'marketing',
    name: { en: 'Marketing', ar: 'التسويق' },
    responsibility: { en: 'Reviews, approves and publishes all content; owns brand campaigns.', ar: 'يراجع ويعتمد وينشر كل المحتوى؛ مسؤول عن حملات العلامة.' },
    managerId: 'u-mariam',
    plansContent: true,
  },
  {
    id: 'operations',
    name: { en: 'Operations', ar: 'التشغيل' },
    responsibility: { en: 'Course lifecycle content: schedules, first sessions, evaluations, certificates.', ar: 'محتوى دورة حياة الدورة: الجداول، أول محاضرة، التقييمات، الشهادات.' },
    managerId: 'u-ahmed',
    plansContent: true,
  },
  {
    id: 'education',
    name: { en: 'Instructional Design', ar: 'التصميم التعليمي' },
    responsibility: { en: 'New programs, curriculum launches and educational content.', ar: 'البرامج الجديدة وإطلاق المناهج والمحتوى التعليمي.' },
    managerId: 'u-hany',
    plansContent: true,
  },
  {
    id: 'hr',
    name: { en: 'HR', ar: 'الموارد البشرية' },
    responsibility: { en: 'Employee recognition, new joiners and HR events.', ar: 'تكريم الموظفين والموظفون الجدد وفعاليات الموارد البشرية.' },
    managerId: 'u-salma',
    plansContent: true,
  },
  {
    id: 'corporate',
    name: { en: 'Corporate / B2B', ar: 'الشركات' },
    responsibility: { en: 'Company contracts, partnerships, corporate training and case studies.', ar: 'عقود الشركات والشراكات وتدريب الشركات ودراسات الحالة.' },
    managerId: 'u-karim',
    plansContent: true,
  },
  {
    id: 'design_media',
    name: { en: 'Design & Media', ar: 'التصميم والميديا' },
    responsibility: { en: 'Design and video production for every department.', ar: 'إنتاج التصميم والفيديو لكل الأقسام.' },
    managerId: 'u-youssef',
    plansContent: false,
  },
  {
    id: 'technical_support',
    name: { en: 'Technical Support', ar: 'الدعم الفني' },
    responsibility: { en: 'Zoom recordings, evaluation cuts and exam technical support.', ar: 'تسجيلات Zoom ومقاطع التقييم والدعم الفني للامتحانات.' },
    managerId: 'u-ramy',
    plansContent: false,
  },
];

export const departmentById = (id: string | null) => DEPARTMENTS.find((department) => department.id === id) ?? null;
