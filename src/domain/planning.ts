import type { ContentType } from './content';
import type { Id, Iso, Text } from './shared';
import type { DepartmentId } from './users';

export interface Campaign {
  id: Id;
  name: string;
  departmentId: DepartmentId;
  goal: Text;
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'completed';
}

export interface PlanTarget {
  id: Id;
  label: Text;
  templateId: Id | null;
  contentType: ContentType | null;
  target: number;
}

/** Each department submits one plan a month; Marketing sees all of them. */
export interface MonthlyPlan {
  id: Id;
  departmentId: DepartmentId;
  /** yyyy-MM */
  month: string;
  ownerId: Id;
  status: 'draft' | 'submitted' | 'approved';
  submittedAt: Iso | null;
  targets: PlanTarget[];
}

export type EventKind = 'national' | 'religious' | 'international' | 'engineering' | 'education' | 'company' | 'certification' | 'season';

export interface ContentEvent {
  id: Id;
  name: Text;
  /** yyyy-MM-dd */
  date: string;
  kind: EventKind;
  departments: DepartmentId[];
  suggestion: Text;
  suggestedType: ContentType;
  /** `catalog` = the curated occasions list shipped with Mobde3; `company` = entered by the team. */
  source: 'catalog' | 'company';
  approximate?: boolean;
}

export type CourseStatus = 'scheduled' | 'running' | 'completed';

export interface Course {
  id: Id;
  code: string;
  title: string;
  cohort: string;
  lecturerId: Id | null;
  /** yyyy-MM-dd */
  startDate: string;
  endDate: string;
  studentCount: number | null;
  registrationUrl: string;
  status: CourseStatus;
}

export type RewardOption = 'discount_50' | 'exam_booking_support';

export interface StudentAchievement {
  id: Id;
  studentName: string;
  kind: 'certificate' | 'international_exam';
  certification: string;
  courseTitle: string;
  /** yyyy-MM-dd */
  achievedAt: string;
  photo: boolean;
  linkedinUrl: string;
  responsibleId: Id;
  /** Added before the platform existed (e.g. historical CFM graduates); details may be missing. */
  historical: boolean;
  hallOfFame: boolean;
  reward: RewardOption | null;
  steps: {
    certificateUploaded: boolean;
    congratulated: boolean;
    linkedinPosted: boolean;
    engosoftMentioned: boolean;
    reviewCollected: boolean;
    employeeCommented: boolean;
    reposted: boolean;
    rewardIssued: boolean;
  };
  /** Support offered before an international exam. */
  preExam?: { technicalSupport: boolean; lecturerSupport: boolean; bookingSupport: boolean; mockExams: boolean };
}
