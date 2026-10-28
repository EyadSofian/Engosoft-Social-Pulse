import { CalendarClock, Check, Clock3, Image as ImageIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { CHANNEL_LABEL, STATUS_LABEL, type PipelineItem } from './types';

/** Natural grid flow avoids overlapping exit/layout animations when the status filter changes. */
export function ApprovalCard({
  item,
  owner,
  department,
  busy,
  disabled,
  onOpen,
  onApprove,
}: {
  item: PipelineItem;
  owner: string;
  department?: string;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
  onApprove: () => void;
}) {
  const { t, tx, date } = useI18n();
  const canApprove =
    item.status === 'ready_for_review' &&
    item.moves.some((m) => m.to === 'approved');
  // An approved post's next step is its publish time, picked in the preview.
  const canSchedule = item.status === 'approved' && item.moves.some((m) => m.to === 'scheduled');
  return (
    <article className="ca-card glass" data-status={item.status}>
      <button
        type="button"
        className="ca-card__media"
        onClick={onOpen}
        aria-label={item.title}
      >
        {item.creative?.imageUrl ? (
          <img src={item.creative.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="board-card__placeholder">
            <ImageIcon size={26} />
          </span>
        )}
        <span
          className="content-status ca-card__status"
          data-status={item.status}
        >
          {tx(STATUS_LABEL[item.status])}
        </span>
      </button>
      <div className="ca-card__body">
        <button
          type="button"
          className="ca-card__title"
          dir="auto"
          onClick={onOpen}
        >
          {item.title}
        </button>
        <small>
          {owner}
          {department ? ` · ${department}` : ''}
        </small>
        <span className="ca-card__meta">
          <span className="board-card__chips">
            {item.channels.map((c) => (
              <i key={c}>{CHANNEL_LABEL[c]}</i>
            ))}
          </span>
          {item.status === 'scheduled' && item.scheduledAt ? (
            <small className="board-card__when" data-scheduled title={t('Publishes', 'ينشر')}>
              <CalendarClock size={12} />
              {date(item.scheduledAt, 'dateTime')}
            </small>
          ) : (
            <small className="board-card__when" title={t('Created', 'أُنشئ')}>
              <Clock3 size={12} />
              {date(item.createdAt, 'dayShort')}
            </small>
          )}
        </span>
      </div>
      {canSchedule && (
        <div className="ca-card__actions">
          <Button variant="secondary" size="sm" onClick={onOpen}>
            <CalendarClock size={14} />
            {t('Pick a publish time', 'حدد ميعاد النشر')}
          </Button>
        </div>
      )}
      {canApprove && (
        <div className="ca-card__actions">
          <Button
            variant="primary"
            size="sm"
            busy={busy}
            disabled={disabled}
            onClick={onApprove}
          >
            <Check size={14} />
            {t('Approve', 'اعتمد')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpen}>
            {t('Request changes', 'اطلب تعديلًا')}
          </Button>
        </div>
      )}
    </article>
  );
}
