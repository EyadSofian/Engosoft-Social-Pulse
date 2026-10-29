import type { Id, Text } from './shared';

export type DepartmentId = 'marketing' | 'operations' | 'education' | 'hr' | 'corporate' | 'design_media' | 'technical_support';

export interface Department {
  id: DepartmentId;
  name: Text;
  /** Short duty statement shown on the department page. */
  responsibility: Text;
  managerId: Id | null;
  /** Departments that submit a monthly content plan. Production teams deliver work but plan none. */
  plansContent: boolean;
}

/** Five roles, from the person who makes posts up to the person who runs the system. Per-person overrides refine them. */
export type RoleId = 'creator' | 'supervisor' | 'marketing_manager' | 'manager' | 'admin';

export type Permission =
  | 'content.create'
  | 'content.edit_own'
  | 'content.edit_department'
  | 'content.edit_any'
  | 'content.approve'
  | 'content.schedule'
  | 'content.publish'
  /** AI design, the free Studio editor and template authoring. */
  | 'design.free'
  /** Making posts from the approved ready templates. */
  | 'design.templates'
  /** Uploading a design finished outside the app. */
  | 'design.upload'
  /** Uploading Reels and videos, and designing their covers. */
  | 'design.video'
  | 'task.assign'
  | 'users.manage'
  | 'templates.manage'
  | 'analytics.view'
  | 'analytics.view_all'
  | 'credits.view'
  | 'credits.view_all'
  | 'connections.manage'
  | 'plans.view_all'
  | 'admin.access';

export interface Role {
  id: RoleId;
  name: Text;
  description: Text;
  permissions: Permission[];
}

/** Which operational focus a person's Home is built around. */
export type HomeProfile =
  | 'marketing_manager'
  | 'publisher'
  | 'ops_lead'
  | 'evaluation'
  | 'hr'
  | 'education'
  | 'corporate'
  | 'production'
  | 'admin';

export interface User {
  permissions?: Permission[];
  id: Id;
  name: string;
  email: string;
  title: Text;
  role: RoleId;
  departmentId: DepartmentId | null;
  /** Narrows the Home profile inside a department, e.g. the evaluation & certificates desk in Operations. */
  focus?: 'evaluation';
  status: 'active' | 'invited' | 'suspended';
  lastActiveAt: string | null;
}

export const ALL_PERMISSIONS: Permission[] = [
  'content.create',
  'content.edit_own',
  'content.edit_department',
  'content.edit_any',
  'content.approve',
  'content.schedule',
  'content.publish',
  'design.free',
  'design.templates',
  'design.upload',
  'design.video',
  'task.assign',
  'users.manage',
  'templates.manage',
  'analytics.view',
  'analytics.view_all',
  'credits.view',
  'credits.view_all',
  'connections.manage',
  'plans.view_all',
  'admin.access',
];

export function homeProfileOf(user: User): HomeProfile {
  switch (user.role) {
    case 'admin':
      return 'admin';
    case 'manager':
    case 'marketing_manager':
      return 'marketing_manager';
    case 'supervisor':
      return 'publisher';
    default:
      break;
  }
  if (user.departmentId === 'operations') return user.focus === 'evaluation' ? 'evaluation' : 'ops_lead';
  if (user.departmentId === 'hr') return 'hr';
  if (user.departmentId === 'education') return 'education';
  if (user.departmentId === 'corporate') return 'corporate';
  if (user.departmentId === 'marketing') return 'publisher';
  return 'production';
}
