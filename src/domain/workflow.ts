import type { Id, Iso, Priority, Text } from './shared';
import type { DepartmentId } from './users';
import type { ContentType } from './content';
import type { Channel } from './shared';
import type { AssetKind } from './assets';

export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done' | 'cancelled';
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'done', 'cancelled'];

export type TaskKind = 'design' | 'video_edit' | 'copy' | 'capture' | 'revision' | 'review' | 'coordination';

/** A task is its own object: it can serve a content item, a campaign, a course or a monthly plan. */
export interface Task {
  id: Id;
  title: string;
  description: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: Priority;
  ownerId: Id;
  assigneeId: Id;
  departmentId: DepartmentId;
  dueAt: Iso | null;
  link: { kind: 'content' | 'campaign' | 'course' | 'plan'; id: Id } | null;
  dependsOn: Id[];
  attachmentIds: Id[];
  createdAt: Iso;
  completedAt: Iso | null;
}

export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected';

/** One review round. A resubmission opens a new round; the history keeps every decision. */
export interface Approval {
  id: Id;
  contentId: Id;
  round: number;
  requestedById: Id;
  requestedAt: Iso;
  reviewerId: Id | null;
  status: ApprovalStatus;
  decidedById: Id | null;
  decidedAt: Iso | null;
  note: string;
}

export interface TemplateField {
  key: string;
  label: Text;
  kind: 'text' | 'longtext' | 'date' | 'number' | 'url' | 'course' | 'person';
  required: boolean;
}

export interface WorkflowStep {
  /** Who acts, e.g. "Lecturer" or "Technical Support / Media". */
  actor: Text;
  departmentId: DepartmentId | null;
  action: Text;
}

/** Templates are reusable workflows, not just layouts: fields, assets, steps, reviewers and triggers. */
export interface ContentTemplate {
  id: Id;
  name: Text;
  description: Text;
  departmentId: DepartmentId;
  contentType: ContentType;
  channels: Channel[];
  fields: TemplateField[];
  captionStructure: Text;
  requiredAssets: { kind: AssetKind; label: Text }[];
  workflow: WorkflowStep[];
  approvalFlow: Text[];
  defaultAssigneeIds: Id[];
  design: { format: '1:1' | '4:5' | '9:16' | '16:9'; note: Text };
  cta: Text;
  /** When the platform should suggest this template. Automation is described, not yet executed. */
  trigger: Text | null;
  usageCount: number;
}
