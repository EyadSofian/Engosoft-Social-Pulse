import { useMemo, useRef } from 'react';
import { CalendarCheck2, ExternalLink, FileText } from 'lucide-react';
import { PlanRow } from '../../components/Shared';
import { Thumb } from '../../components/ui/Bits';
import { LinkButton } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Overlay';
import { PlatformBadge } from '../../components/ui/Platform';
import { useApp } from '../../context';
import { fmtDateTime, num, pct, relative } from '../../lib/format';
import { contentTypeLabel, platformName } from '../../lib/platforms';
import type { Metrics, Post } from '../../types';

export const METRIC_LABELS: { key: keyof Metrics; label: string }[] = [
  { key: 'views', label: 'مشاهدات' },
  { key: 'reach', label: 'وصول' },
  { key: 'impressions', label: 'مرات الظهور' },
  { key: 'likes', label: 'إعجابات' },
  { key: 'comments', label: 'تعليقات' },
  { key: 'shares', label: 'مشاركات' },
  { key: 'saves', label: 'حفظ' },
  { key: 'clicks', label: 'نقرات' },
];

export function PostDrawer({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const { data, now, openPlan } = useApp();
  const last = useRef(post);
  if (post) last.current = post;
  const shown = post ?? last.current;

  const plan = useMemo(
    () => (shown ? data.plans.find((item) => item.platform === shown.platform && item.externalId && item.externalId === shown.externalId) : undefined),
    [data.plans, shown],
  );
  if (!shown) return null;
  const available = METRIC_LABELS.filter((item) => shown.metrics[item.key] != null).length;

  return (
    <Drawer
      open={post != null}
      onClose={onClose}
      title="تفاصيل المنشور"
      subtitle={`${platformName[shown.platform]} · ${shown.accountName || '—'}`}
      icon={<PlatformBadge platform={shown.platform} size="md" />}
      width={520}
      footer={
        shown.permalink ? (
          <LinkButton variant="primary" href={shown.permalink} target="_blank" rel="noreferrer noopener" icon={<ExternalLink size={16} />}>
            افتح على {platformName[shown.platform]}
          </LinkButton>
        ) : (
          <span className="alerts__perm alerts__perm--off">المنصة لم تُرجع رابطًا لهذا المنشور.</span>
        )
      }
    >
      <div className="post">
        <Thumb src={shown.thumbnail} platform={shown.platform} className="post__media" />
        <p className="post__title">{shown.title}</p>
        <dl className="post__meta">
          <div>
            <dt>تاريخ النشر</dt>
            <dd>
              {shown.ts ? fmtDateTime(shown.ts) : '—'}
              {shown.ts > 0 && <small> · {relative(shown.ts, now)}</small>}
            </dd>
          </div>
          <div>
            <dt>نوع المحتوى</dt>
            <dd>{contentTypeLabel(shown.contentType || 'post')}</dd>
          </div>
        </dl>

        <h3 className="side__label">الأرقام · {available} من {METRIC_LABELS.length} متاحة</h3>
        <div className="post__metrics">
          {METRIC_LABELS.map((item) => (
            <div key={item.key} className="metric" data-missing={shown.metrics[item.key] == null || undefined}>
              <b>{num(shown.metrics[item.key])}</b>
              <span>{item.label}</span>
            </div>
          ))}
          <div className="metric metric--rate" data-missing={shown.engagementRate == null || undefined}>
            <b>{pct(shown.engagementRate)}</b>
            <span>معدل التفاعل</span>
          </div>
        </div>
        <p className="post__note">
          <FileText size={13} /> «—» تعني أن المنصة أو صلاحية الحساب لم تُرجع هذا الرقم. معدل التفاعل = التفاعلات ÷ الوصول، ثم المشاهدات، ثم مرات الظهور حسب
          المتاح.
        </p>

        {plan && (
          <>
            <h3 className="side__label">
              <CalendarCheck2 size={13} /> مرتبط بالخطة
            </h3>
            <div className="rows">
              <PlanRow
                plan={plan}
                showDay
                onOpen={(item) => {
                  onClose();
                  openPlan({ mode: 'edit', plan: item });
                }}
              />
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
