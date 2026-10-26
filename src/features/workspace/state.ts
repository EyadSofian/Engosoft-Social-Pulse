import type { Asset } from '../../domain/assets';
import type { ActivityLog, Comment, ContentItem } from '../../domain/content';
import type { AppNotification, CreditTransaction, CreditWallet } from '../../domain/management';
import type { Campaign, ContentEvent, Course, MonthlyPlan, StudentAchievement } from '../../domain/planning';
import type { User } from '../../domain/users';
import type { Approval, ContentTemplate, Task } from '../../domain/workflow';

/**
 * Everything the workflow screens read that the API does not serve yet.
 * Shaped like the future tables so a server repository can replace the seed
 * without touching the screens.
 */
export interface WorkspaceState {
  users: User[];
  content: ContentItem[];
  tasks: Task[];
  approvals: Approval[];
  comments: Comment[];
  activity: ActivityLog[];
  templates: ContentTemplate[];
  campaigns: Campaign[];
  plans: MonthlyPlan[];
  events: ContentEvent[];
  courses: Course[];
  achievements: StudentAchievement[];
  assets: Asset[];
  wallets: CreditWallet[];
  transactions: CreditTransaction[];
  notifications: AppNotification[];
}
