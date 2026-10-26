import type { Id, Iso, Text } from './shared';
import type { DepartmentId } from './users';

export type CreditKind = 'text' | 'image' | 'video';

export interface CreditWallet {
  departmentId: DepartmentId;
  /** yyyy-MM */
  month: string;
  budget: number;
}

export interface CreditTransaction {
  id: Id;
  departmentId: DepartmentId;
  userId: Id;
  contentId: Id | null;
  kind: CreditKind;
  amount: number;
  description: string;
  at: Iso;
}

/**
 * Operational KPIs measure delivery (on time, completed, reviewed); performance
 * KPIs measure audience response. Employee performance is judged on the first
 * group: reach depends on the platform, the topic and the budget, not only on the person.
 */
export type KpiKind = 'operational' | 'performance';

export interface Kpi {
  id: Id;
  kind: KpiKind;
  name: Text;
  description: Text;
  unit: 'count' | 'percent';
}

export interface KpiResult {
  kpiId: Id;
  scope: { kind: 'user' | 'department'; id: Id };
  /** yyyy-MM */
  period: string;
  value: number | null;
  target: number | null;
  /** How the number was derived, shown next to it. */
  basis: Text;
}

export type NotificationCategory =
  | 'task_assigned'
  | 'review_required'
  | 'changes_requested'
  | 'approved'
  | 'publishing_reminder'
  | 'publishing_failure'
  | 'deadline'
  | 'mention'
  | 'credit_warning'
  | 'integration_problem';

export interface AppNotification {
  id: Id;
  userId: Id | 'all';
  category: NotificationCategory;
  title: Text;
  body: string;
  at: Iso;
  read: boolean;
  /** Notifications about the same thing collapse into one row. */
  groupKey: string;
  href: string;
  provenance: 'live' | 'demo';
}
