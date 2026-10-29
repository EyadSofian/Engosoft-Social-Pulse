import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { GoalBadge } from './PostPlan';
import { BarChart3, CalendarClock, Check, Clock3, Hourglass, Image as ImageIcon, PenLine, Send } from 'lucide-react';
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
  onSend,
  onPublish,
}: {
  item: PipelineItem;
  owner: string;
  department?: string;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
  onApprove: () => void;
  /** Sends a draft (or a returned post) to marketing. */
  onSend: () => void;
  /** Opens publish-or-schedule; absent for people who cannot publish. */
  onPublish?: () => void;
}) {
  const { t, tx, date } = useI18n();
  const canApprove =
    item.status === 'ready_for_review' &&
    item.moves.some((m) => m.to === 'approved');
  const canSend = item.moves.some((m) => m.to === 'ready_for_review');
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
              <i key={c} title={CHANNEL_LABEL[c]}><ChannelIcon channel={c} size={12} /> {CHANNEL_LABEL[c]}</i>
            ))}
          </span>
          <GoalBadge goal={item.goal} />
          {item.status === 'scheduled' && item.scheduledAt ? (
            <small className="board-card__when" data-scheduled title={t('Publishes', 'ينشر')}>
              <CalendarClock size={12} />
              {date(item.scheduledAt, 'dateTime')}
            </small>
          ) : item.plannedFor ? (
            <small className="board-card__when" title={t('Planned for', 'اليوم المستهدف')}>
              <CalendarClock size={12} />
              {t('Planned', 'مستهدف')} {date(item.plannedFor, 'dayShort')}
            </small>
          ) : (
            <small className="board-card__when" title={t('Created', 'أُنشئ')}>
              <Clock3 size={12} />
              {date(item.createdAt, 'dayShort')}
            </small>
          )}
        </span>
      </div>
      <div className="ca-card__next">
        <NextLine item={item} owner={owner} canApprove={canApprove} canSend={canSend} canPublish={Boolean(onPublish)} />
        {canApprove ? (
          <div className="ca-card__actions">
            <Button variant="primary" size="sm" busy={busy} disabled={disabled} onClick={onApprove}>
              <Check size={14} />
              {t('Approve', 'اعتمد')}
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpen}>
              {t('Request changes', 'اطلب تعديلًا')}
            </Button>
          </div>
        ) : canSend ? (
          <div className="ca-card__actions">
            <Button variant="primary" size="sm" busy={busy} disabled={disabled} onClick={onSend}>
              <Send size={14} />
              {item.status === 'changes_requested' ? t('Send again', 'ابعته تاني') : t('Send for approval', 'ابعته للاعتماد')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpen}>{t('Open', 'افتح')}</Button>
          </div>
        ) : onPublish && (item.status === 'approved' || item.status === 'scheduled') ? (
          <div className="ca-card__actions">
            <Button variant={item.status === 'approved' ? 'primary' : 'secondary'} size="sm" onClick={onPublish}>
              {item.status === 'approved' ? <Send size={14} /> : <CalendarClock size={14} />}
              {item.status === 'approved' ? t('Publish or schedule', 'انشر أو جدول') : t('Change time or accounts', 'غيّر الميعاد أو الحسابات')}
            </Button>
          </div>
        ) : item.status === 'published' ? (
          <div className="ca-card__actions">
            <Button variant="secondary" size="sm" onClick={onOpen}><BarChart3 size={14} />{t('See results', 'شوف النتائج')}</Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Who has the post now, in one line, so nobody has to ask what happens next. */
function NextLine({ item, owner, canApprove, canSend, canPublish }: { item: PipelineItem; owner: string; canApprove: boolean; canSend: boolean; canPublish: boolean }) {
  const { t, date } = useI18n();
  const line = (() => {
    switch (item.status) {
      case 'ready_for_review': return canApprove ? [<Hourglass key="i" size={13} />, t('Waiting for your decision', 'مستني قرارك')] : [<Hourglass key="i" size={13} />, t('With marketing for approval', 'عند التسويق للاعتماد')];
      case 'changes_requested': return [<PenLine key="i" size={13} />, canSend ? t('Marketing asked for changes: fix and send again', 'التسويق طلب تعديل: عدّل وابعته تاني') : <>{t('Returned to', 'راجع لـ')} <b>{owner}</b> {t('for changes', 'للتعديل')}</>];
      case 'approved': return [<Check key="i" size={13} />, canPublish ? t('Approved: give it a time or publish now', 'معتمد: حدد ميعاد أو انشره دلوقتي') : t('Approved: waiting for a publish time', 'معتمد: مستني ميعاد النشر')];
      case 'scheduled': return [<CalendarClock key="i" size={13} />, <>{t('Goes out', 'بيتنشر')} <b className="u-tnum">{item.scheduledAt ? date(item.scheduledAt, 'dateTime') : '—'}</b></>];
      case 'published': return [<Check key="i" size={13} />, t('Live on the platforms', 'اتنشر على المنصات')];
      case 'cancelled': return [<Clock3 key="i" size={13} />, t('Cancelled', 'ملغي')];
      case 'archived': return [<Clock3 key="i" size={13} />, t('Archived', 'مؤرشف')];
      default: return [<PenLine key="i" size={13} />, canSend ? t('Being made: send it when it is ready', 'بيتعمل: ابعته لما يجهز') : <>{t('Being made by', 'بيعمله')} <b>{owner}</b></>];
    }
  })();
  return <p className="ca-card__hint" data-status={item.status}>{line[0]}<span>{line[1]}</span></p>;
}
