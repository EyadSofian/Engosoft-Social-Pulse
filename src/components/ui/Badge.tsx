import type { ReactNode } from 'react';
import type { ContentStatus } from '../../domain/content';
import type { Priority } from '../../domain/shared';
import { useI18n } from '../../i18n/I18nProvider';
import {
  contentStatusLabel,
  contentStatusTone,
  priorityLabel,
  priorityTone,
  type Tone,
} from '../../i18n/labels';

export function Badge({ tone = 'neutral', dot, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`ui-badge ui-badge--${tone}`} title={title}>
      {dot && <span className="ui-badge__dot" aria-hidden />}
      {children}
    </span>
  );
}

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const { tx } = useI18n();
  return (
    <Badge tone={contentStatusTone[status]} dot>
      {tx(contentStatusLabel[status])}
    </Badge>
  );
}

/** Normal and low priority stay silent; only high and urgent earn a badge. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const { tx } = useI18n();
  if (priority === 'normal' || priority === 'low') return null;
  return <Badge tone={priorityTone[priority]}>{tx(priorityLabel[priority])}</Badge>;
}

/** Marks records from the seeded workspace so they are never mistaken for live data. */
export function DemoBadge() {
  const { t } = useI18n();
  return (
    <span className="ui-demo-badge" title={t('Seeded demo record — not stored on the server yet', 'سجل تجريبي — غير محفوظ على الخادم بعد')}>
      {t('Demo', 'تجريبي')}
    </span>
  );
}
