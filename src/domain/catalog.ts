import type { Department, Permission, Role, RoleId } from './users';
import { ALL_PERMISSIONS } from './users';

/** Roles and their permissions. Server-side enforcement arrives with authentication (see MIGRATION_PLAN.md). */
export const ROLES: Record<RoleId, Role> = {
  admin: {
    id: 'admin',
    name: { en: 'Admin', ar: 'مدير النظام' },
    description: { en: 'Users, roles, connections and system settings.', ar: 'المستخدمون والأدوار والربط وإعدادات النظام.' },
    permissions: ALL_PERMISSIONS,
  },
  marketing_manager: {
    id: 'marketing_manager',
    name: { en: 'Marketing Manager', ar: 'مدير التسويق' },
    description: { en: 'Final review, approval and publishing for every department.', ar: 'المراجعة النهائية والاعتماد والنشر لكل الأقسام.' },
    permissions: [
      'design.free',
      'content.create',
      'content.edit_own',
      'content.edit_department',
      'content.edit_any',
      'content.approve',
      'content.schedule',
      'content.publish',
      'task.assign',
      'templates.manage',
      'analytics.view',
      'analytics.view_all',
      'credits.view',
      'credits.view_all',
      'connections.manage',
      'plans.view_all',
    ],
  },
  publisher: {
    id: 'publisher',
    name: { en: 'Publisher', ar: 'مسؤول النشر' },
    description: { en: 'Schedules approved content and confirms publishing.', ar: 'يجدول المحتوى المعتمد ويؤكد النشر.' },
    permissions: [
      'design.free',
      'content.create',
      'content.edit_own',
      'content.edit_any',
      'content.schedule',
      'content.publish',
      'task.assign',
      'analytics.view',
      'analytics.view_all',
      'credits.view',
      'plans.view_all',
    ],
  },
  department_manager: {
    id: 'department_manager',
    name: { en: 'Department Manager', ar: 'مدير قسم' },
    description: { en: 'Plans and creates the department’s content, assigns its tasks.', ar: 'يخطط محتوى القسم وينشئه ويسند مهامه.' },
    permissions: ['design.free', 'content.create', 'content.edit_own', 'content.edit_department', 'task.assign', 'analytics.view', 'credits.view'],
  },
  employee: {
    id: 'employee',
    name: { en: 'Employee', ar: 'موظف' },
    description: { en: 'Creates content and completes assigned tasks.', ar: 'ينشئ المحتوى وينفذ المهام المسندة.' },
    permissions: ['design.free', 'content.create', 'content.edit_own', 'analytics.view'],
  },
  designer: {
    id: 'designer',
    name: { en: 'Designer', ar: 'مصمم' },
    description: { en: 'Delivers design tasks and revisions.', ar: 'ينفذ مهام التصميم والتعديلات.' },
    permissions: ['design.free', 'content.edit_own'],
  },
  media_editor: {
    id: 'media_editor',
    name: { en: 'Media Editor', ar: 'محرر فيديو' },
    description: { en: 'Edits video and captures for content items.', ar: 'يمنتج الفيديو واللقطات لعناصر المحتوى.' },
    permissions: ['design.free', 'content.edit_own'],
  },
  lecturer: {
    id: 'lecturer',
    name: { en: 'Lecturer', ar: 'محاضر' },
    description: { en: 'Contributes course and educational content.', ar: 'يساهم بمحتوى الدورات والمحتوى التعليمي.' },
    permissions: ['design.free', 'content.create', 'content.edit_own'],
  },
  freelancer: {
    id: 'freelancer',
    name: { en: 'Freelancer', ar: 'مستقل' },
    description: { en: 'Writes assigned content; sees only their own work.', ar: 'يكتب المحتوى المسند؛ يرى عمله فقط.' },
    permissions: ['design.free', 'content.create', 'content.edit_own'],
  },
  operations: {
    id: 'operations',
    name: { en: 'Operations Team', ar: 'فريق العمليات' },
    description: { en: 'Creates new posts from approved visual references and templates, then sends them for review.', ar: 'ينشئ منشورات جديدة من المراجع البصرية والقوالب المعتمدة، ثم يرسلها للمراجعة.' },
    permissions: ['content.create', 'content.edit_own'],
  },
};

export const ROLE_ORDER: RoleId[] = ['admin', 'marketing_manager', 'publisher', 'department_manager', 'employee', 'designer', 'media_editor', 'lecturer', 'freelancer', 'operations'];

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
