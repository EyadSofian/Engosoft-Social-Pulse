/**
 * Demo workspace, generated relative to "now" so due dates stay meaningful.
 *
 * Nothing here is live data: these records stand in for the tables listed in
 * MIGRATION_PLAN.md until the backend serves them. Screens label them "Demo".
 * Social metrics never come from this file; analytics reads the live API only.
 */
import { DateTime } from 'luxon';
import type { Asset, AssetKind } from '../../domain/assets';
import type { ActivityLog, Comment, ContentItem, ContentStatus, ContentType } from '../../domain/content';
import type { AppNotification, CreditKind, CreditTransaction, CreditWallet } from '../../domain/management';
import type { Campaign, ContentEvent, Course, MonthlyPlan, StudentAchievement } from '../../domain/planning';
import type { Channel, Priority } from '../../domain/shared';
import type { DepartmentId, User } from '../../domain/users';
import type { Approval, Task, TaskKind, TaskStatus } from '../../domain/workflow';
import type { WorkspaceState } from '../../features/workspace/state';
import { businessZone } from '../../lib/format';
import { TEMPLATES } from './templates';

const L = (en: string, ar: string) => ({ en, ar });

export function createSeed(nowMs: number = Date.now()): WorkspaceState {
  const zone = businessZone();
  const now = DateTime.fromMillis(nowMs, { zone });
  const today = now.startOf('day');
  /** Day offset from today, at a local wall-clock time, as UTC ISO. */
  const at = (days: number, hour = 10, minute = 0) => today.plus({ days }).set({ hour, minute }).toUTC().toISO() ?? '';
  const dayKey = (days: number) => today.plus({ days }).toISODate() ?? '';
  const month = today.toFormat('yyyy-LL');
  const monthStart = today.startOf('month');
  /** Day `d` of the current month, clamped so seeded "past" records never land in the future. */
  const inMonth = (d: number, hour = 12) => {
    const date = monthStart.plus({ days: d - 1 });
    if (date < today) return date.set({ hour }).toUTC().toISO() ?? '';
    // On the 1st there is no earlier day this month: use the first minutes of today.
    const safe = today > monthStart ? today.minus({ days: 1 }).set({ hour }) : today;
    return safe.toUTC().toISO() ?? '';
  };

  /* ── People ─────────────────────────────────────────────────────── */

  const users: User[] = [
    u('u-hossam', 'Hossam Ibrahim', 'admin', null, L('Platform administrator', 'مسؤول المنصة'), 0.2),
    u('u-mariam', 'Mariam Adel', 'marketing_manager', 'marketing', L('Marketing Manager', 'مديرة التسويق'), 0.05),
    u('u-omar', 'Omar Khaled', 'supervisor', 'marketing', L('Content publisher', 'مسؤول النشر'), 0.4),
    u('u-dina', 'Dina Samy', 'creator', 'marketing', L('Content specialist', 'أخصائية محتوى'), 1),
    u('u-laila', 'Laila Mahmoud', 'creator', 'marketing', L('Freelance content writer', 'كاتبة محتوى مستقلة'), 26),
    u('u-ahmed', 'Ahmed Samir', 'supervisor', 'operations', L('Operations team leader', 'قائد فريق التشغيل'), 0.6),
    u('u-nour', 'Nour Hassan', 'creator', 'operations', L('Evaluation & certificates', 'التقييم والشهادات'), 2, 'evaluation'),
    u('u-hany', 'Dr. Hany Mostafa', 'supervisor', 'education', L('Instructional design lead', 'قائد التصميم التعليمي'), 5),
    u('u-tamer', 'Eng. Tamer Lotfy', 'creator', 'education', L('Lecturer — MEP', 'محاضر — MEP'), 48),
    u('u-salma', 'Salma Farouk', 'supervisor', 'hr', L('HR lead', 'مسؤولة الموارد البشرية'), 3),
    u('u-karim', 'Karim Fathy', 'supervisor', 'corporate', L('Corporate & B2B', 'مسؤول الشركات'), 7),
    u('u-youssef', 'Youssef Nabil', 'creator', 'design_media', L('Senior designer', 'مصمم أول'), 0.3),
    u('u-ramy', 'Ramy Tarek', 'creator', 'technical_support', L('Technical support · video', 'الدعم الفني · فيديو'), 0.8),
    { ...u('u-sara', 'Sara Wael', 'creator', 'hr', L('HR coordinator', 'منسقة موارد بشرية'), 0), status: 'invited', lastActiveAt: null },
  ];
  function u(id: string, name: string, role: User['role'], departmentId: DepartmentId | null, title: User['title'], hoursAgo: number, focus?: 'evaluation'): User {
    const handle = name.toLowerCase().replace(/^(dr|eng)\.\s*/, '').split(' ')[0];
    return { id, name, email: `${handle}@engosoft.example`, title, role, departmentId, focus, status: 'active', lastActiveAt: now.minus({ hours: hoursAgo }).toUTC().toISO() };
  }

  /* ── Courses ────────────────────────────────────────────────────── */

  const course = (id: string, code: string, title: string, cohort: string, start: number, end: number, students: number | null, lecturerId: string | null): Course => ({
    id,
    code,
    title,
    cohort,
    lecturerId,
    startDate: dayKey(start),
    endDate: dayKey(end),
    studentCount: students,
    registrationUrl: '',
    status: start > 0 ? 'scheduled' : end < 0 ? 'completed' : 'running',
  });
  const courses: Course[] = [
    course('c-cfm-oct', 'CFM', 'Certified Facility Manager', 'October Cohort', 7, 49, 18, 'u-tamer'),
    course('c-pmp-oct', 'PMP', 'PMP Exam Preparation', 'October Cohort', 0, 35, 24, null),
    course('c-revit', 'RVT-MEP', 'Revit MEP', 'Evening Cohort', 3, 31, null, 'u-tamer'),
    course('c-p6', 'P6', 'Primavera P6', 'September Cohort', -30, 0, 21, null),
    course('c-cfm-sep', 'CFM', 'Certified Facility Manager', 'September Cohort', -45, -2, 16, 'u-tamer'),
    course('c-etabs', 'ETABS', 'ETABS Structural Analysis', 'November Cohort', 14, 42, null, null),
    course('c-fidic', 'FIDIC', 'FIDIC Contracts (corporate)', 'Client cohort', -10, 18, 30, null),
    course('c-leed', 'LEED GA', 'LEED Green Associate', 'November Cohort', 21, 49, null, null),
  ];

  /* ── Campaigns & monthly plans ──────────────────────────────────── */

  const campaigns: Campaign[] = [
    { id: 'cp-launches', name: 'October Course Launches', departmentId: 'marketing', goal: L('Fill October and November cohorts.', 'ملء دفعات أكتوبر ونوفمبر.'), startDate: monthStart.toISODate() ?? '', endDate: dayKey(20), status: 'active' },
    { id: 'cp-success', name: 'Certification Success Stories', departmentId: 'operations', goal: L('Turn certified students into proof.', 'تحويل الطلاب الحاصلين على الشهادات إلى قصص نجاح.'), startDate: dayKey(-60), endDate: dayKey(60), status: 'active' },
    { id: 'cp-corporate', name: 'Corporate Training 2026', departmentId: 'corporate', goal: L('Show corporate delivery capability.', 'إظهار قدرة تدريب الشركات.'), startDate: dayKey(-120), endDate: dayKey(65), status: 'active' },
    { id: 'cp-employer', name: 'Employer Brand Q4', departmentId: 'hr', goal: L('Show the team behind Engosoft.', 'إظهار الفريق وراء Engosoft.'), startDate: dayKey(-25), endDate: dayKey(65), status: 'active' },
  ];

  const target = (id: string, en: string, ar: string, count: number, templateId: string | null = null, contentType: ContentType | null = null) => ({ id, label: L(en, ar), templateId, contentType, target: count });
  const plans: MonthlyPlan[] = [
    plan('marketing', 'u-mariam', [target('m-tips', 'Educational tips', 'معلومات تعليمية', 4, 't-educational-tip'), target('m-promo', 'Course promotion', 'ترويج الدورات', 5), target('m-events', 'Occasions & events', 'المناسبات', 3, 't-event')]),
    plan('operations', 'u-ahmed', [target('op-schedule', 'Weekly course schedule', 'جدول الدورات الأسبوعي', 4, 't-weekly-schedule'), target('op-starts', 'Course starts next week', 'الدورة يبدأ الأسبوع القادم', 2, 't-starts-next-week'), target('op-finished', 'Course finished', 'انتهاء الدورة', 2, 't-course-finished')]),
    plan('education', 'u-hany', [target('ed-course', 'New courses', 'دورات جديدة', 2, 't-new-course'), target('ed-tips', 'Educational content', 'محتوى تعليمي', 2, 't-educational-tip')]),
    plan('hr', 'u-salma', [target('hr-recognition', 'Employee recognition', 'تكريم الموظفين', 1, 't-employee-recognition'), target('hr-newjoiner', 'New employees', 'موظفون جدد', 1, 't-new-employee')]),
    plan('corporate', 'u-karim', [target('co-contract', 'Corporate contracts', 'عقود الشركات', 1, 't-corporate-contract'), target('co-case', 'Case studies', 'دراسات حالة', 1)]),
  ];
  function plan(departmentId: DepartmentId, ownerId: string, targets: MonthlyPlan['targets']): MonthlyPlan {
    return { id: `plan-${departmentId}-${month}`, departmentId, month, ownerId, status: 'approved', submittedAt: monthStart.minus({ days: 3 }).toUTC().toISO(), targets };
  }

  /* ── Content ────────────────────────────────────────────────────── */

  interface Draft {
    id: string;
    title: string;
    type?: ContentType;
    dept: DepartmentId;
    owner: string;
    assignee?: string | null;
    channels?: Channel[];
    status: ContentStatus;
    priority?: Priority;
    due?: string | null;
    publish?: string | null;
    template?: string | null;
    course?: string | null;
    target?: string | null;
    campaign?: string | null;
    caption?: string;
    ai?: number;
    assets?: string[];
    achievement?: string | null;
    created?: number;
  }
  const content: ContentItem[] = [];
  const item = (d: Draft): ContentItem => {
    const created = at(d.created ?? -6, 9, 30);
    const record: ContentItem = {
      id: d.id,
      title: d.title,
      type: d.type ?? 'post',
      departmentId: d.dept,
      campaignId: d.campaign ?? null,
      ownerId: d.owner,
      assigneeId: d.assignee ?? null,
      channels: d.channels ?? ['facebook', 'instagram', 'linkedin'],
      status: d.status,
      priority: d.priority ?? 'normal',
      dueAt: d.due ?? null,
      publishAt: d.publish ?? null,
      templateId: d.template ?? null,
      caption: d.caption ?? '',
      versions: [],
      assetIds: d.assets ?? [],
      ai: { used: Boolean(d.ai), credits: d.ai ?? 0, tools: d.ai ? ['caption'] : [] },
      publishedUrl: '',
      courseId: d.course ?? null,
      achievementId: d.achievement ?? null,
      planTargetId: d.target ?? null,
      origin: d.template ? 'template' : d.ai ? 'ai_assisted' : 'manual',
      provenance: 'demo',
      createdAt: created,
      updatedAt: created,
    };
    content.push(record);
    return record;
  };

  // Awaiting Marketing review (12).
  item({ id: 'ci-cfm-starts', title: 'Course Starts Next Week — CFM October Cohort', dept: 'operations', owner: 'u-ahmed', status: 'ready_for_review', priority: 'high', due: at(0, 23), template: 't-starts-next-week', course: 'c-cfm-oct', target: 'op-starts', campaign: 'cp-launches', assets: ['as-cfm-cover'], caption: 'CFM — Certified Facility Manager starts next week. Seven weeks of live sessions with Eng. Tamer Lotfy. Register through the direct link below.\n\nدورة CFM يبدأ الأسبوع القادم. سجّل الآن.', created: -2 });
  item({ id: 'ci-pmp-first', title: 'First Session — PMP October Cohort', dept: 'operations', owner: 'u-ahmed', status: 'ready_for_review', priority: 'high', due: at(0, 23), template: 't-first-session', course: 'c-pmp-oct', assets: ['as-zoom-pmp'], caption: 'أول محاضرة في دفعة PMP أكتوبر بحضور 24 مهندس ومهندسة.', created: 0 });
  item({ id: 'ci-revit-starts', title: 'Revit MEP starts this week', dept: 'operations', owner: 'u-ahmed', status: 'ready_for_review', due: at(1, 18), template: 't-starts-next-week', course: 'c-revit', target: 'op-starts', created: -3 });
  item({ id: 'ci-cert-ahmed', title: 'Certificate — Ahmed Ali (CFM)', dept: 'operations', owner: 'u-nour', status: 'ready_for_review', channels: ['linkedin', 'facebook'], due: at(1, 18), template: 't-certificate', achievement: 'sa-ahmed-ali', assets: ['as-cert-ahmed'], campaign: 'cp-success', created: -2 });
  item({ id: 'ci-hof-oct', title: 'Hall of Fame — October achievers', type: 'carousel', dept: 'operations', owner: 'u-nour', assignee: 'u-youssef', status: 'ready_for_review', due: at(3, 18), template: 't-hall-of-fame', campaign: 'cp-success', created: -4 });
  item({ id: 'ci-tip-hvac', title: 'Educational tip: HVAC load basics', type: 'carousel', dept: 'education', owner: 'u-hany', status: 'ready_for_review', due: at(2, 18), template: 't-educational-tip', ai: 40, created: -3 });
  item({ id: 'ci-bim-diploma', title: 'New program: BIM Coordination Diploma', type: 'carousel', dept: 'education', owner: 'u-hany', status: 'ready_for_review', due: at(4, 18), template: 't-new-course', created: -5 });
  item({ id: 'ci-hr-care', title: 'تكريم فريق خدمة العملاء', dept: 'hr', owner: 'u-salma', status: 'ready_for_review', channels: ['linkedin', 'facebook'], due: at(1, 18), template: 't-employee-recognition', campaign: 'cp-employer', created: -2 });
  item({ id: 'ci-corp-partner', title: 'New corporate contract — training partnership', dept: 'corporate', owner: 'u-karim', status: 'ready_for_review', channels: ['linkedin'], due: at(2, 18), template: 't-corporate-contract', campaign: 'cp-corporate', created: -4 });
  item({ id: 'ci-pmp-offer', title: 'PMP early-bird offer', dept: 'marketing', owner: 'u-dina', status: 'ready_for_review', priority: 'high', due: at(1, 12), campaign: 'cp-launches', ai: 25, created: -6 });
  item({ id: 'ci-lecturer-reel', title: 'Lecturer spotlight reel — Eng. Tamer', type: 'reel', dept: 'marketing', owner: 'u-laila', assignee: 'u-ramy', status: 'ready_for_review', channels: ['instagram', 'tiktok', 'facebook'], due: at(3, 18), created: -5 });
  item({ id: 'ci-exam-mona', title: 'International exam success — PMP (Mona Saeed)', dept: 'operations', owner: 'u-nour', status: 'ready_for_review', due: at(2, 18), template: 't-intl-exam', achievement: 'sa-mona', campaign: 'cp-success', created: -1 });

  // Changes requested (3).
  item({ id: 'ci-cfm-video', title: 'Course Launch Video — CFM', type: 'video', dept: 'marketing', owner: 'u-dina', assignee: 'u-youssef', status: 'changes_requested', priority: 'high', due: at(-1, 18), course: 'c-cfm-oct', campaign: 'cp-launches', channels: ['facebook', 'instagram', 'tiktok'], created: -8 });
  item({ id: 'ci-etabs-poster', title: 'ETABS cohort poster', type: 'poster', dept: 'operations', owner: 'u-ahmed', assignee: 'u-youssef', status: 'changes_requested', due: at(2, 18), course: 'c-etabs', created: -5 });
  item({ id: 'ci-hr-newjoiner', title: 'Welcome: our new instructional designer', dept: 'hr', owner: 'u-salma', status: 'changes_requested', channels: ['linkedin', 'facebook'], due: at(1, 18), template: 't-new-employee', target: 'hr-newjoiner', campaign: 'cp-employer', created: -6 });

  // In production (5).
  item({ id: 'ci-cfm-sep-eval', title: 'CFM September Cohort — Evaluation video', type: 'video', dept: 'operations', owner: 'u-nour', assignee: 'u-ramy', status: 'in_production', priority: 'high', due: at(-2, 18), template: 't-evaluation-video', course: 'c-cfm-sep', channels: ['facebook', 'instagram', 'tiktok'], assets: ['as-zoom-cfm-eval'], created: -4 });
  item({ id: 'ci-p6-finished', title: 'Course Finished — Primavera P6', type: 'video', dept: 'operations', owner: 'u-ahmed', assignee: 'u-nour', status: 'in_production', due: at(1, 18), template: 't-course-finished', course: 'c-p6', created: -1 });
  item({ id: 'ci-fidic-case', title: 'Case study: FIDIC training for a contractor', type: 'carousel', dept: 'corporate', owner: 'u-karim', assignee: 'u-youssef', status: 'in_production', channels: ['linkedin'], due: at(5, 18), course: 'c-fidic', campaign: 'cp-corporate', created: -3 });
  item({ id: 'ci-safety-reel', title: 'Lecturer content: Site safety in 60 seconds', type: 'reel', dept: 'education', owner: 'u-tamer', assignee: 'u-ramy', status: 'in_production', channels: ['instagram', 'tiktok'], due: at(6, 18), template: 't-lecturer-content', created: -2 });
  item({ id: 'ci-mep-skills', title: 'Top 5 skills for MEP engineers', type: 'carousel', dept: 'marketing', owner: 'u-laila', assignee: 'u-youssef', status: 'in_production', due: at(4, 18), target: 'm-tips', ai: 30, created: -3 });

  // Drafts (4).
  item({ id: 'ci-schedule-next', title: 'Weekly Course Schedule — next week', type: 'carousel', dept: 'operations', owner: 'u-ahmed', status: 'draft', due: at(3, 12), template: 't-weekly-schedule', created: 0 });
  item({ id: 'ci-leed-launch', title: 'LEED Green Associate launch', dept: 'marketing', owner: 'u-dina', status: 'draft', due: at(-1, 18), course: 'c-leed', target: 'm-promo', campaign: 'cp-launches', created: -7 });
  item({ id: 'ci-corp-webinar', title: 'Corporate webinar invitation', dept: 'corporate', owner: 'u-karim', status: 'draft', channels: ['linkedin'], due: at(7, 18), created: -1 });
  item({ id: 'ci-hr-yearend', title: 'احتفال نهاية العام للفريق', dept: 'hr', owner: 'u-salma', status: 'draft', due: at(20, 18), created: -1 });

  // Ideas (4).
  item({ id: 'ci-idea-quality', title: 'World Quality Day carousel', type: 'carousel', dept: 'marketing', owner: 'u-mariam', status: 'idea', template: 't-event', created: -1 });
  item({ id: 'ci-idea-testimonials', title: 'Student testimonial series', type: 'video', dept: 'operations', owner: 'u-nour', status: 'idea', created: -9 });
  item({ id: 'ci-idea-arabic', title: 'اليوم العالمي للغة العربية — مصطلحات هندسية', dept: 'education', owner: 'u-hany', status: 'idea', created: -4 });
  item({ id: 'ci-idea-logos', title: 'Corporate client logo wall', type: 'poster', dept: 'corporate', owner: 'u-karim', status: 'idea', created: -12 });

  // Approved, waiting for a slot (3).
  item({ id: 'ci-pmp-recap', title: 'PMP first-session recap reel', type: 'reel', dept: 'marketing', owner: 'u-omar', status: 'approved', due: at(2, 18), course: 'c-pmp-oct', target: 'm-promo', created: -2 });
  item({ id: 'ci-cert-mahmoud', title: 'Certificate — Mahmoud Fawzy (PMP)', dept: 'operations', owner: 'u-nour', status: 'approved', channels: ['linkedin', 'facebook'], due: at(1, 18), template: 't-certificate', achievement: 'sa-mahmoud', created: -3 });
  item({ id: 'ci-tip-drawings', title: 'Educational tip: Reading MEP drawings', type: 'carousel', dept: 'education', owner: 'u-hany', status: 'approved', due: at(3, 18), template: 't-educational-tip', created: -4 });

  // Scheduled: seven this week, two next week.
  item({ id: 'ci-schedule-now', title: 'Weekly Course Schedule — this week', type: 'carousel', dept: 'operations', owner: 'u-ahmed', status: 'scheduled', publish: at(0, 18), due: at(0, 12), template: 't-weekly-schedule', target: 'op-schedule', created: -3 });
  item({ id: 'ci-cfm-countdown', title: 'CFM — 7 days to go', dept: 'marketing', owner: 'u-omar', status: 'scheduled', publish: at(1, 11, 30), due: at(0, 18), course: 'c-cfm-oct', target: 'm-promo', campaign: 'cp-launches', created: -4 });
  item({ id: 'ci-revit-qa', title: 'Instructor Q&A live — Revit MEP', dept: 'marketing', owner: 'u-omar', status: 'scheduled', publish: at(2, 19), due: at(1, 18), course: 'c-revit', target: 'm-events', created: -5 });
  item({ id: 'ci-tip-earthing', title: 'Educational tip: Earthing systems', type: 'carousel', dept: 'education', owner: 'u-hany', status: 'scheduled', publish: at(2, 12), due: at(1, 12), template: 't-educational-tip', created: -6 });
  item({ id: 'ci-hr-eom', title: 'موظف الشهر — أكتوبر', dept: 'hr', owner: 'u-salma', status: 'scheduled', channels: ['linkedin', 'facebook'], publish: at(3, 13), due: at(2, 12), template: 't-employee-recognition', campaign: 'cp-employer', created: -5 });
  item({ id: 'ci-corp-highlights', title: 'Corporate training highlights', type: 'video', dept: 'corporate', owner: 'u-karim', status: 'scheduled', channels: ['linkedin'], publish: at(3, 15), due: at(2, 12), campaign: 'cp-corporate', created: -7 });
  item({ id: 'ci-hof-pmp', title: 'Hall of Fame — PMP achievers', type: 'carousel', dept: 'operations', owner: 'u-nour', status: 'scheduled', publish: at(4, 20), due: at(3, 12), template: 't-hall-of-fame', campaign: 'cp-success', created: -6 });
  item({ id: 'ci-etabs-open', title: 'ETABS cohort — registration open', dept: 'marketing', owner: 'u-omar', status: 'scheduled', publish: at(6, 12), due: at(5, 12), course: 'c-etabs', created: -2 });
  item({ id: 'ci-bim-info', title: 'BIM diploma — info session', dept: 'marketing', owner: 'u-omar', status: 'scheduled', publish: at(8, 19), due: at(7, 12), created: -2 });

  // Published earlier this month: these complete the monthly plans. No live post is linked to them.
  const published: [string, string, DepartmentId, string, string, ContentType][] = [
    ['5 mistakes in HVAC duct sizing', 'u-laila', 'marketing', 'm-tips', 't-educational-tip', 'carousel'],
    ['Why PMP matters for site engineers', 'u-dina', 'marketing', 'm-tips', 't-educational-tip', 'carousel'],
    ['Reading electrical single-line diagrams', 'u-laila', 'marketing', 'm-tips', 't-educational-tip', 'carousel'],
    ['BIM vs CAD: what changes on site', 'u-dina', 'marketing', 'm-tips', 't-educational-tip', 'carousel'],
    ['October intake — PMP', 'u-omar', 'marketing', 'm-promo', '', 'post'],
    ['Revit MEP — seats available', 'u-omar', 'marketing', 'm-promo', '', 'post'],
    ['CFM — early registration', 'u-dina', 'marketing', 'm-promo', '', 'post'],
    ['Primavera P6 weekend cohort', 'u-omar', 'marketing', 'm-promo', '', 'post'],
    ['اليوم العالمي للمعلم', 'u-dina', 'marketing', 'm-events', 't-event', 'post'],
    ['ذكرى انتصارات أكتوبر', 'u-omar', 'marketing', 'm-events', 't-event', 'post'],
    ['Weekly Course Schedule — week 1', 'u-ahmed', 'operations', 'op-schedule', 't-weekly-schedule', 'carousel'],
    ['Weekly Course Schedule — week 2', 'u-ahmed', 'operations', 'op-schedule', 't-weekly-schedule', 'carousel'],
    ['Weekly Course Schedule — week 3', 'u-ahmed', 'operations', 'op-schedule', 't-weekly-schedule', 'carousel'],
    ['Course Starts Next Week — PMP October Cohort', 'u-ahmed', 'operations', 'op-starts', 't-starts-next-week', 'post'],
    ['Course Finished — AutoCAD Civil 3D', 'u-ahmed', 'operations', 'op-finished', 't-course-finished', 'video'],
    ['Course Finished — Revit Architecture', 'u-nour', 'operations', 'op-finished', 't-course-finished', 'video'],
    ['New course: Fire Fighting Systems Design', 'u-hany', 'education', 'ed-course', 't-new-course', 'carousel'],
    ['New course: Solar PV Design', 'u-hany', 'education', 'ed-course', 't-new-course', 'carousel'],
    ['Educational tip: Pump selection basics', 'u-hany', 'education', 'ed-tips', 't-educational-tip', 'carousel'],
    ['Educational tip: Concrete curing', 'u-tamer', 'education', 'ed-tips', 't-educational-tip', 'carousel'],
    ['تكريم فريق التشغيل — سبتمبر', 'u-salma', 'hr', 'hr-recognition', 't-employee-recognition', 'post'],
    ['New contract: training program for an industrial client', 'u-karim', 'corporate', 'co-contract', 't-corporate-contract', 'post'],
    ['Case study: MEP upskilling for a facility operator', 'u-karim', 'corporate', 'co-case', '', 'carousel'],
  ];
  published.forEach(([title, owner, dept, targetId, templateId, type], index) => {
    const day = 2 + Math.floor((index * 23) / published.length);
    item({ id: `ci-pub-${index + 1}`, title, type, dept, owner, status: 'published', due: inMonth(day, 9), publish: inMonth(day, 12 + (index % 6)), template: templateId || null, target: targetId, created: -40 + index });
  });
  // The 24th published item: the schedule for the current week counts once it goes live; week 4 already did.
  item({ id: 'ci-pub-24', title: 'Weekly Course Schedule — week 4', type: 'carousel', dept: 'operations', owner: 'u-ahmed', status: 'published', due: inMonth(22, 9), publish: inMonth(22, 18), template: 't-weekly-schedule', target: 'op-schedule', created: -10 });
  item({ id: 'ci-arch-1', title: 'September course calendar', type: 'carousel', dept: 'operations', owner: 'u-ahmed', status: 'archived', publish: at(-40, 12), template: 't-weekly-schedule', created: -50 });
  item({ id: 'ci-cancel-1', title: 'Summer webinar (postponed)', dept: 'marketing', owner: 'u-dina', status: 'cancelled', created: -30 });

  /* ── Approvals, tasks, comments, activity ───────────────────────── */

  const approvals: Approval[] = [];
  const activity: ActivityLog[] = [];
  const log = (kind: ActivityLog['entity']['kind'], id: string, actorId: string, action: ActivityLog['action'], detail: string, when: string) =>
    activity.push({ id: `act-${activity.length + 1}`, entity: { kind, id }, actorId, action, detail, at: when });

  for (const record of content) {
    log('content', record.id, record.ownerId, 'created', record.templateId ? record.templateId : '', record.createdAt);
    const submitted = DateTime.fromISO(record.createdAt).plus({ hours: 20 }).toUTC().toISO() ?? record.createdAt;
    if (record.status === 'ready_for_review') {
      const round = record.id === 'ci-pmp-offer' ? 2 : 1;
      if (round === 2) {
        approvals.push({ id: `ap-${record.id}-1`, contentId: record.id, round: 1, requestedById: record.ownerId, requestedAt: submitted, reviewerId: 'u-mariam', status: 'changes_requested', decidedById: 'u-mariam', decidedAt: at(-3, 14), note: 'Price must match the approved offer sheet; remove the countdown sticker.' });
        log('content', record.id, 'u-mariam', 'changes_requested', 'Price must match the approved offer sheet; remove the countdown sticker.', at(-3, 14));
      }
      const requestedAt = round === 2 ? at(-1, 11) : record.id === 'ci-cfm-starts' ? now.minus({ hours: 2 }).toUTC().toISO() ?? '' : submitted;
      approvals.push({ id: `ap-${record.id}-${round}`, contentId: record.id, round, requestedById: record.ownerId, requestedAt, reviewerId: null, status: 'pending', decidedById: null, decidedAt: null, note: '' });
      log('content', record.id, record.ownerId, 'submitted_for_review', '', requestedAt);
    } else if (record.status === 'changes_requested') {
      const notes: Record<string, string> = {
        'ci-cfm-video': 'Use the new CFM brand frame and shorten the intro to 3 seconds.',
        'ci-etabs-poster': 'Start date is wrong and the lecturer photo is low resolution.',
        'ci-hr-newjoiner': 'Photo missing — please attach the approved portrait.',
      };
      approvals.push({ id: `ap-${record.id}-1`, contentId: record.id, round: 1, requestedById: record.ownerId, requestedAt: submitted, reviewerId: 'u-mariam', status: 'changes_requested', decidedById: 'u-mariam', decidedAt: at(-1, 15), note: notes[record.id] ?? '' });
      log('content', record.id, record.ownerId, 'submitted_for_review', '', submitted);
      log('content', record.id, 'u-mariam', 'changes_requested', notes[record.id] ?? '', at(-1, 15));
    } else if (['approved', 'scheduled', 'published', 'archived'].includes(record.status)) {
      const decided = DateTime.fromISO(submitted).plus({ hours: 5 }).toUTC().toISO() ?? submitted;
      approvals.push({ id: `ap-${record.id}-1`, contentId: record.id, round: 1, requestedById: record.ownerId, requestedAt: submitted, reviewerId: 'u-mariam', status: 'approved', decidedById: 'u-mariam', decidedAt: decided, note: '' });
      log('content', record.id, 'u-mariam', 'approved', '', decided);
      if (record.publishAt && record.status !== 'approved') log('content', record.id, 'u-omar', 'scheduled', record.publishAt, decided);
      if (record.status === 'published' && record.publishAt) log('content', record.id, 'u-omar', 'published_recorded', '', record.publishAt);
    }
  }

  const tasks: Task[] = [];
  const task = (
    id: string,
    title: string,
    kind: TaskKind,
    assigneeId: string,
    departmentId: DepartmentId,
    status: TaskStatus,
    due: string | null,
    link: Task['link'],
    extra: Partial<Task> = {},
  ) => {
    const record: Task = {
      id,
      title,
      description: '',
      kind,
      status,
      priority: 'normal',
      ownerId: 'u-mariam',
      assigneeId,
      departmentId,
      dueAt: due,
      link,
      dependsOn: [],
      attachmentIds: [],
      createdAt: at(-3, 10),
      completedAt: null,
      ...extra,
    };
    tasks.push(record);
    log('task', id, record.ownerId, 'task_created', '', record.createdAt);
    if (link?.kind === 'content') log('content', link.id, record.ownerId, 'task_created', title, record.createdAt);
    return record;
  };
  const toContent = (id: string): Task['link'] => ({ kind: 'content', id });

  task('tk-eval-edit', 'Edit evaluation video', 'video_edit', 'u-ramy', 'technical_support', 'in_progress', at(0, 16), toContent('ci-cfm-sep-eval'), { ownerId: 'u-nour', priority: 'high', description: 'Edit the student evaluation segment from the final Zoom session (timestamp 01:12:40–01:16:05).', attachmentIds: ['as-zoom-cfm-eval'] });
  task('tk-eval-cut', 'Cut evaluation segment for TikTok', 'video_edit', 'u-ramy', 'technical_support', 'todo', at(2, 16), toContent('ci-cfm-sep-eval'), { ownerId: 'u-nour', dependsOn: ['tk-eval-edit'] });
  task('tk-cfm-frame', 'Apply new CFM brand frame to launch video', 'revision', 'u-youssef', 'design_media', 'in_progress', at(0, 15), toContent('ci-cfm-video'), { priority: 'high', description: 'Requested by Marketing: new CFM frame, 3-second intro.' });
  task('tk-etabs-fix', 'Fix start date and lecturer photo on ETABS poster', 'revision', 'u-youssef', 'design_media', 'todo', at(1, 15), toContent('ci-etabs-poster'));
  task('tk-hof-design', 'Design Hall of Fame carousel', 'design', 'u-youssef', 'design_media', 'done', at(-1, 18), toContent('ci-hof-oct'), { ownerId: 'u-nour', completedAt: at(-1, 14) });
  task('tk-fidic-slides', 'Case study slides — FIDIC client', 'design', 'u-youssef', 'design_media', 'in_progress', at(4, 18), toContent('ci-fidic-case'), { ownerId: 'u-karim' });
  task('tk-mep-carousel', 'Carousel layout — Top 5 MEP skills', 'design', 'u-youssef', 'design_media', 'todo', at(3, 18), toContent('ci-mep-skills'), { ownerId: 'u-laila' });
  task('tk-p6-timestamp', 'Mark evaluation timestamp — Primavera P6', 'capture', 'u-nour', 'operations', 'todo', at(0, 20), toContent('ci-p6-finished'), { ownerId: 'u-ahmed', priority: 'high' });
  task('tk-revit-count', 'Confirm student count for Revit MEP', 'capture', 'u-nour', 'operations', 'waiting', at(1, 12), { kind: 'course', id: 'c-revit' }, { ownerId: 'u-ahmed', description: 'Registration still open; waiting for the sales list.' });
  task('tk-pmp-zoom', 'Zoom screenshot — PMP first session', 'capture', 'u-ramy', 'technical_support', 'done', at(0, 11), toContent('ci-pmp-first'), { ownerId: 'u-ahmed', completedAt: at(0, 10), attachmentIds: ['as-zoom-pmp'] });
  task('tk-safety-edit', 'Edit site-safety reel', 'video_edit', 'u-ramy', 'technical_support', 'todo', at(5, 18), toContent('ci-safety-reel'), { ownerId: 'u-tamer' });
  task('tk-leed-caption', 'Write LEED launch caption (AR/EN)', 'copy', 'u-laila', 'marketing', 'todo', at(-1, 18), toContent('ci-leed-launch'), { ownerId: 'u-dina', priority: 'high' });
  task('tk-hr-photo', 'Collect approved portrait for new-joiner post', 'coordination', 'u-salma', 'hr', 'in_progress', at(0, 17), toContent('ci-hr-newjoiner'), { ownerId: 'u-mariam' });
  task('tk-etabs-lecturer', 'Confirm lecturer for ETABS cohort', 'coordination', 'u-ahmed', 'operations', 'todo', at(4, 12), { kind: 'course', id: 'c-etabs' }, { ownerId: 'u-ahmed' });
  task('tk-plan-hr', 'Submit November HR content plan', 'coordination', 'u-salma', 'hr', 'todo', at(5, 17), { kind: 'plan', id: `plan-hr-${month}` });
  task('tk-repost-ahmed', 'Repost Ahmed Ali’s LinkedIn certificate post', 'coordination', 'u-nour', 'operations', 'waiting', at(2, 12), toContent('ci-cert-ahmed'), { ownerId: 'u-nour', description: 'Waiting for the student to publish on LinkedIn.' });
  task('tk-offer-review', 'Review PMP offer resubmission', 'review', 'u-mariam', 'marketing', 'todo', at(1, 12), toContent('ci-pmp-offer'), { ownerId: 'u-dina' });
  // Completed earlier this month: feeds the operational KPIs.
  const doneSeed: [string, DepartmentId, number, number][] = [
    ['u-youssef', 'design_media', 3, 2], ['u-youssef', 'design_media', 6, 6], ['u-youssef', 'design_media', 9, 10], ['u-youssef', 'design_media', 14, 14], ['u-youssef', 'design_media', 18, 17],
    ['u-ramy', 'technical_support', 5, 5], ['u-ramy', 'technical_support', 11, 13], ['u-ramy', 'technical_support', 16, 16],
    ['u-nour', 'operations', 4, 4], ['u-nour', 'operations', 12, 12], ['u-nour', 'operations', 19, 21],
    ['u-laila', 'marketing', 7, 7], ['u-laila', 'marketing', 15, 17], ['u-dina', 'marketing', 8, 8], ['u-salma', 'hr', 10, 10],
  ];
  doneSeed.forEach(([assigneeId, departmentId, dueDay, doneDay], index) =>
    task(`tk-done-${index + 1}`, ['Design cover', 'Edit clip', 'Collect certificate', 'Write caption', 'Coordinate photo'][index % 5], 'design', assigneeId, departmentId, 'done', inMonth(dueDay, 18), null, { completedAt: inMonth(doneDay, 16), createdAt: inMonth(Math.max(1, dueDay - 3), 10) }),
  );
  for (const record of tasks) if (record.status === 'done' && record.completedAt) log('task', record.id, record.assigneeId, 'task_completed', '', record.completedAt);

  const comments: Comment[] = [
    { id: 'cm-1', entity: { kind: 'content', id: 'ci-cfm-starts' }, authorId: 'u-ahmed', body: 'Registration link is the direct CFM page, not the homepage. @Mariam please check the start date badge.', mentions: ['u-mariam'], createdAt: now.minus({ hours: 2 }).toUTC().toISO() ?? '' },
    { id: 'cm-2', entity: { kind: 'content', id: 'ci-cfm-video' }, authorId: 'u-mariam', body: 'Use the new CFM frame from the Media Library and cut the intro to 3s.', mentions: ['u-youssef'], createdAt: at(-1, 15) },
    { id: 'cm-3', entity: { kind: 'content', id: 'ci-cfm-video' }, authorId: 'u-youssef', body: 'On it — new version this afternoon.', mentions: [], createdAt: at(-1, 16) },
    { id: 'cm-4', entity: { kind: 'content', id: 'ci-cfm-sep-eval' }, authorId: 'u-nour', body: 'Evaluation starts at 01:12:40 in the recording. Two students agreed to be shown.', mentions: ['u-ramy'], createdAt: at(-2, 13) },
    { id: 'cm-5', entity: { kind: 'task', id: 'tk-eval-edit' }, authorId: 'u-ramy', body: 'Audio cleanup done, adding captions now.', mentions: [], createdAt: now.minus({ hours: 1 }).toUTC().toISO() ?? '' },
    { id: 'cm-6', entity: { kind: 'content', id: 'ci-pmp-offer' }, authorId: 'u-dina', body: 'Updated the price from the offer sheet and removed the sticker.', mentions: ['u-mariam'], createdAt: at(-1, 11) },
  ];
  for (const comment of comments) log(comment.entity.kind, comment.entity.id, comment.authorId, 'commented', comment.body, comment.createdAt);

  /* ── Students & achievements ────────────────────────────────────── */

  const steps = (n: number): StudentAchievement['steps'] => {
    const keys: (keyof StudentAchievement['steps'])[] = ['certificateUploaded', 'congratulated', 'linkedinPosted', 'engosoftMentioned', 'reviewCollected', 'employeeCommented', 'reposted', 'rewardIssued'];
    return Object.fromEntries(keys.map((key, index) => [key, index < n])) as StudentAchievement['steps'];
  };
  const achievement = (id: string, studentName: string, kind: StudentAchievement['kind'], certification: string, courseTitle: string, achieved: number | string, done: number, extra: Partial<StudentAchievement> = {}): StudentAchievement => ({
    id,
    studentName,
    kind,
    certification,
    courseTitle,
    achievedAt: typeof achieved === 'string' ? achieved : dayKey(achieved),
    photo: false,
    linkedinUrl: '',
    responsibleId: 'u-nour',
    historical: false,
    hallOfFame: done >= 4,
    reward: null,
    steps: steps(done),
    ...extra,
  });
  const achievements: StudentAchievement[] = [
    achievement('sa-ahmed-ali', 'Ahmed Ali', 'certificate', 'CFM', 'Certified Facility Manager', -3, 2, { photo: true }),
    achievement('sa-mona', 'Mona Saeed', 'international_exam', 'PMP®', 'PMP Exam Preparation', -2, 2, { reward: 'exam_booking_support', preExam: { technicalSupport: true, lecturerSupport: true, bookingSupport: true, mockExams: true } }),
    achievement('sa-mahmoud', 'Mahmoud Fawzy', 'international_exam', 'PMP®', 'PMP Exam Preparation', -6, 5, { photo: true, reward: 'discount_50', hallOfFame: true }),
    achievement('sa-yara', 'Yara Adel', 'certificate', 'Revit MEP', 'Revit MEP', -12, 8, { photo: true, reward: 'discount_50', hallOfFame: true, linkedinUrl: 'https://www.linkedin.com/' }),
    achievement('sa-khaled', 'Khaled Emad', 'international_exam', 'LEED GA', 'LEED Green Associate', -20, 8, { reward: 'exam_booking_support', hallOfFame: true }),
    achievement('sa-omnia', 'Omnia Gamal', 'certificate', 'Primavera P6', 'Primavera P6', -9, 4, { photo: true }),
    achievement('sa-hist-1', 'Mostafa Abdelaziz', 'certificate', 'CFM', 'Certified Facility Manager', '2024-06-18', 8, { historical: true, hallOfFame: true, responsibleId: 'u-ahmed' }),
    achievement('sa-hist-2', 'Rana Hamdy', 'certificate', 'CFM', 'Certified Facility Manager', '2024-11-02', 8, { historical: true, hallOfFame: true, responsibleId: 'u-ahmed' }),
    achievement('sa-hist-3', 'Islam Fekry', 'certificate', 'CFM', 'Certified Facility Manager', '2025-03-27', 8, { historical: true, hallOfFame: true, responsibleId: 'u-ahmed' }),
    achievement('sa-pending', 'Hagar Mohsen', 'international_exam', 'PMP®', 'PMP Exam Preparation', 9, 0, { preExam: { technicalSupport: true, lecturerSupport: false, bookingSupport: true, mockExams: false } }),
  ];

  /* ── Assets ─────────────────────────────────────────────────────── */

  const asset = (id: string, name: string, kind: AssetKind, departmentId: DepartmentId, uploadedById: string, days: number, contentIds: string[], extra: Partial<Asset> = {}): Asset => ({
    id,
    name,
    kind,
    mime: { image: 'image/png', video: 'video/mp4', audio: 'audio/mpeg', certificate: 'application/pdf', document: 'application/pdf', zoom_capture: 'image/png', logo: 'image/svg+xml', template_asset: 'image/png' }[kind],
    sizeBytes: { image: 1_850_000, video: 48_200_000, audio: 3_100_000, certificate: 420_000, document: 950_000, zoom_capture: 1_240_000, logo: 18_000, template_asset: 2_300_000 }[kind],
    departmentId,
    uploadedById,
    uploadedAt: at(days, 11),
    contentIds,
    tags: [],
    hasFile: false,
    ...extra,
  });
  const assets: Asset[] = [
    asset('as-cfm-cover', 'cfm-october-cover.png', 'image', 'design_media', 'u-youssef', -3, ['ci-cfm-starts', 'ci-cfm-countdown'], { width: 1080, height: 1080, tags: ['CFM', 'cover'] }),
    asset('as-zoom-pmp', 'pmp-oct-session1-zoom.png', 'zoom_capture', 'technical_support', 'u-ramy', 0, ['ci-pmp-first'], { width: 1920, height: 1080, tags: ['PMP', 'Zoom'] }),
    asset('as-zoom-cfm-eval', 'cfm-sep-final-session.mp4', 'video', 'technical_support', 'u-ramy', -2, ['ci-cfm-sep-eval'], { durationSec: 5940, tags: ['CFM', 'evaluation'] }),
    asset('as-cert-ahmed', 'certificate-ahmed-ali-cfm.pdf', 'certificate', 'operations', 'u-nour', -3, ['ci-cert-ahmed'], { tags: ['CFM', 'certificate'] }),
    asset('as-cert-mahmoud', 'certificate-mahmoud-fawzy-pmp.pdf', 'certificate', 'operations', 'u-nour', -5, ['ci-cert-mahmoud'], { tags: ['PMP', 'certificate'] }),
    asset('as-logo-primary', 'engosoft-logo-primary.svg', 'logo', 'marketing', 'u-mariam', -200, [], { tags: ['brand'] }),
    asset('as-logo-white', 'engosoft-logo-white.svg', 'logo', 'marketing', 'u-mariam', -200, [], { tags: ['brand'] }),
    asset('as-frame-cfm', 'cfm-brand-frame-2026.png', 'template_asset', 'design_media', 'u-youssef', -9, ['ci-cfm-video'], { width: 1080, height: 1920, tags: ['CFM', 'frame'] }),
    asset('as-frame-hof', 'hall-of-fame-frame.png', 'template_asset', 'design_media', 'u-youssef', -60, ['ci-hof-oct', 'ci-hof-pmp'], { width: 1080, height: 1350, tags: ['Hall of Fame'] }),
    asset('as-schedule-layout', 'weekly-schedule-layout.png', 'template_asset', 'design_media', 'u-youssef', -90, ['ci-schedule-now', 'ci-schedule-next'], { width: 1080, height: 1350, tags: ['schedule'] }),
    asset('as-tamer-photo', 'eng-tamer-lotfy-portrait.png', 'image', 'education', 'u-hany', -30, ['ci-lecturer-reel'], { width: 2000, height: 2000, tags: ['lecturer'] }),
    asset('as-safety-raw', 'site-safety-raw-take.mp4', 'video', 'education', 'u-tamer', -2, ['ci-safety-reel'], { durationSec: 312, tags: ['lecturer', 'raw'] }),
    asset('as-voiceover', 'pmp-offer-voiceover.mp3', 'audio', 'marketing', 'u-dina', -4, ['ci-pmp-offer'], { durationSec: 34 }),
    asset('as-offer-sheet', 'pmp-offer-sheet-oct.pdf', 'document', 'marketing', 'u-mariam', -8, ['ci-pmp-offer'], { tags: ['offer'] }),
    asset('as-corp-deck', 'corporate-training-capabilities.pdf', 'document', 'corporate', 'u-karim', -40, ['ci-fidic-case'], { tags: ['corporate'] }),
    asset('as-p6-zoom', 'p6-final-session.mp4', 'video', 'technical_support', 'u-ramy', 0, ['ci-p6-finished'], { durationSec: 6120, tags: ['P6', 'evaluation'] }),
  ];

  /* ── Company events (entered by the team) ───────────────────────── */

  const events: ContentEvent[] = [
    { id: 'ev-graduation', name: L('Quarterly graduates celebration', 'احتفال خريجي الربع'), date: dayKey(18), kind: 'company', departments: ['marketing', 'operations'], suggestion: L('Photo carousel with graduates’ quotes', 'كاروسيل صور مع آراء الخريجين'), suggestedType: 'carousel', source: 'company' },
    { id: 'ev-open-day', name: L('Corporate training open day', 'يوم مفتوح لتدريب الشركات'), date: dayKey(11), kind: 'company', departments: ['corporate', 'marketing'], suggestion: L('Invitation post for HR and training managers', 'منشور دعوة لمديري التدريب والموارد البشرية'), suggestedType: 'post', source: 'company' },
  ];

  /* ── Credits ────────────────────────────────────────────────────── */

  const budgets: [DepartmentId, number, [CreditKind, number][]][] = [
    ['marketing', 10_000, [['image', 2_500], ['video', 3_200], ['text', 720]]],
    ['operations', 4_000, [['image', 900], ['video', 650], ['text', 260]]],
    ['education', 3_000, [['image', 1_100], ['video', 1_500], ['text', 310]]],
    ['hr', 1_500, [['image', 220], ['text', 90]]],
    ['corporate', 2_000, [['image', 380], ['text', 270]]],
    ['design_media', 6_000, [['image', 2_900], ['video', 1_200]]],
    ['technical_support', 2_000, [['video', 1_050], ['text', 140]]],
  ];
  const wallets: CreditWallet[] = budgets.map(([departmentId, budget]) => ({ departmentId, month, budget }));
  const transactions: CreditTransaction[] = [];
  const spenders: Record<DepartmentId, string[]> = {
    marketing: ['u-dina', 'u-laila', 'u-omar'],
    operations: ['u-nour', 'u-ahmed'],
    education: ['u-hany', 'u-tamer'],
    hr: ['u-salma'],
    corporate: ['u-karim'],
    design_media: ['u-youssef'],
    technical_support: ['u-ramy'],
  };
  const contentByDept = (departmentId: DepartmentId) => content.filter((record) => record.departmentId === departmentId).map((record) => record.id);
  const descriptions: Record<CreditKind, string> = { text: 'Caption generation', image: 'Image generation', video: 'Video generation' };
  for (const [departmentId, , split] of budgets) {
    const owned = contentByDept(departmentId);
    for (const [kind, total] of split) {
      // Spread each total over a few transactions that sum to it exactly.
      const parts = kind === 'text' ? 4 : 3;
      let left = total;
      for (let index = 0; index < parts; index++) {
        const amount = index === parts - 1 ? left : Math.round((total / parts) * (0.8 + 0.1 * index));
        left -= amount;
        transactions.push({
          id: `tx-${departmentId}-${kind}-${index}`,
          departmentId,
          userId: spenders[departmentId][index % spenders[departmentId].length],
          contentId: owned.length ? owned[index % owned.length] : null,
          kind,
          amount,
          description: descriptions[kind],
          at: inMonth(3 + index * 6, 11 + index),
        });
      }
    }
  }

  /* ── Notifications (demo; live alerts and connector problems are added at runtime) ── */

  const notifications: AppNotification[] = [];
  const notify = (userId: string, category: AppNotification['category'], title: AppNotification['title'], body: string, hoursAgo: number, href: string, groupKey: string, read = false) =>
    notifications.push({ id: `nt-${notifications.length + 1}`, userId, category, title, body, at: now.minus({ hours: hoursAgo }).toUTC().toISO() ?? '', read, groupKey, href, provenance: 'demo' });
  for (const approval of approvals.filter((entry) => entry.status === 'pending')) {
    const record = content.find((entry) => entry.id === approval.contentId);
    if (!record) continue;
    for (const reviewer of ['u-mariam']) notify(reviewer, 'review_required', L('Review required', 'مطلوب مراجعة'), record.title, Math.max(0.5, DateTime.fromMillis(nowMs).diff(DateTime.fromISO(approval.requestedAt), 'hours').hours), `/content/${record.id}`, 'review-queue');
  }
  notify('u-mariam', 'mention', L('Ahmed mentioned you', 'أحمد أشار إليك'), 'Course Starts Next Week — CFM October Cohort', 2, '/content/ci-cfm-starts', 'mention-cm-1');
  notify('u-mariam', 'credit_warning', L('Instructional Design is at 97% of its AI credits', 'التصميم التعليمي استخدم 97% من رصيد الذكاء الاصطناعي'), 'Education · 2,910 / 3,000', 20, '/credits', 'credits-education');
  notify('u-youssef', 'changes_requested', L('Changes requested', 'مطلوب تعديلات'), 'Course Launch Video — CFM', 20, '/content/ci-cfm-video', 'changes-ci-cfm-video');
  notify('u-youssef', 'task_assigned', L('New task assigned', 'مهمة جديدة'), 'Fix start date and lecturer photo on ETABS poster', 6, '/tasks?task=tk-etabs-fix', 'task-tk-etabs-fix');
  notify('u-youssef', 'deadline', L('Due today', 'مطلوب اليوم'), 'Apply new CFM brand frame to launch video', 1, '/tasks?task=tk-cfm-frame', 'deadline-tk-cfm-frame');
  notify('u-ramy', 'task_assigned', L('New task assigned', 'مهمة جديدة'), 'Edit evaluation video', 30, '/tasks?task=tk-eval-edit', 'task-tk-eval-edit', true);
  notify('u-ramy', 'deadline', L('Due today 4:00 PM', 'مطلوب اليوم 4:00 م'), 'Edit evaluation video', 1, '/tasks?task=tk-eval-edit', 'deadline-tk-eval-edit');
  notify('u-nour', 'mention', L('Ramy replied on a task', 'رامي ردّ على مهمة'), 'Edit evaluation video', 1, '/tasks?task=tk-eval-edit', 'mention-cm-5');
  notify('u-nour', 'approved', L('Approved by Marketing', 'اعتمدها التسويق'), 'Certificate — Mahmoud Fawzy (PMP)', 26, '/content/ci-cert-mahmoud', 'approved-ci-cert-mahmoud', true);
  notify('u-dina', 'changes_requested', L('Changes requested', 'مطلوب تعديلات'), 'Course Launch Video — CFM', 20, '/content/ci-cfm-video', 'changes-ci-cfm-video');
  notify('u-salma', 'changes_requested', L('Changes requested', 'مطلوب تعديلات'), 'Welcome: our new instructional designer', 20, '/content/ci-hr-newjoiner', 'changes-ci-hr-newjoiner');
  notify('u-ahmed', 'deadline', L('Course starts in 7 days', 'الدورة يبدأ بعد 7 أيام'), 'CFM — October Cohort', 4, '/content/ci-cfm-starts', 'course-c-cfm-oct');
  notify('u-hany', 'credit_warning', L('Your department is at 97% of its AI credits', 'قسمك استخدم 97% من رصيد الذكاء الاصطناعي'), 'Education · 2,910 / 3,000', 20, '/credits', 'credits-education');
  notify('u-omar', 'publishing_reminder', L('Publishing today', 'نشر اليوم'), 'Weekly Course Schedule — this week · 6:00 PM', 1, '/content/ci-schedule-now', 'publish-ci-schedule-now');

  return { users, content, tasks, approvals, comments, activity, templates: TEMPLATES, campaigns, plans, events, courses, achievements, assets, wallets, transactions, notifications };
}
