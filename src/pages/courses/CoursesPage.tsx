import { CourseProfilesPanel } from '../../features/course-profiles/CourseProfilesPanel';
import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

/** Course content: marketing reviews and approves each course's goals, audience and outcomes; creators read them. */
export function CoursesPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  usePageMeta(t('Courses', 'الدورات'), [{ label: t('Courses', 'الدورات') }]);
  return (
    <div className="u-stack u-stack--lg">
      <PageHeader
        title={t('Course content', 'محتوى الدورات')}
        description={can('templates.manage')
          ? t('Review each course’s overview, audience, goals and outcomes. Approved details fill course posts automatically.', 'راجع نبذة كل دورة وجمهورها وأهدافها ومخرجاتها. البيانات المعتمدة تملأ منشورات الدورات تلقائيًا.')
          : t('What each course covers, for whom, and what trainees achieve.', 'محتوى كل دورة، ولمن هي، وماذا يحقق المتدربون.')}
      />
      <CourseProfilesPanel />
    </div>
  );
}
