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

export type RoleId =
  | 'admin'
  | 'marketing_manager'
  | 'publisher'
  | 'department_manager'
  | 'employee'
  | 'designer'
  | 'media_editor'
  | 'lecturer'
  | 'freelancer'
  | 'operations';

export type Permission =
  | 'content.create'
  | 'content.edit_own'
  | 'content.edit_department'
  | 'content.edit_any'
  | 'content.approve'
  | 'content.schedule'
  | 'content.publish'
  /** AI design, the free Studio editor and template authoring. Without it a person builds posts from approved templates only. */
  | 'design.free'
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
    case 'marketing_manager':
      return 'marketing_manager';
    case 'publisher':
      return 'publisher';
    case 'designer':
    case 'media_editor':
    case 'freelancer':
      return 'production';
    case 'lecturer':
      return 'education';
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
