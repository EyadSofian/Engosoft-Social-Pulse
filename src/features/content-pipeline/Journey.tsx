import { ArrowRight, CalendarClock, CheckCircle2, Clock3, PenLine, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '../../app/router/router';
import type { ContentStatus } from '../../domain/content';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import type { PipelineItem } from './types';

/**
 * The five stops every post makes, the same on Content, Calendar and Publishing: being made, waiting for
 * approval, ready to publish, scheduled, published. Each stop says who moves it on and links to the page
 * where that happens, so the three pages read as one path instead of three separate tools.
 */
export type JourneyStage = 'making' | 'review' | 'ready' | 'scheduled' | 'published';

export const JOURNEY: { id: JourneyStage; statuses: ContentStatus[]; en: string; ar: string; whoEn: string; whoAr: string; href: string; icon: ReactNode }[] = [
  { id: 'making', statuses: ['idea', 'draft', 'in_production', 'changes_requested'], en: 'Being made', ar: 'بيتعمل', whoEn: 'Creator sends it for approval', whoAr: 'منشئ المحتوى يبعته للاعتماد', href: '/content?tab=making', icon: <PenLine size={15} /> },
  { id: 'review', statuses: ['ready_for_review'], en: 'Waiting for approval', ar: 'بانتظار الاعتماد', whoEn: 'Marketing approves or returns it', whoAr: 'التسويق يعتمد أو يرجّعه', href: '/content?tab=review', icon: <Clock3 size={15} /> },
  { id: 'ready', statuses: ['approved'], en: 'Ready to publish', ar: 'جاهز للنشر', whoEn: 'Publish now or pick a time', whoAr: 'انشره دلوقتي أو حدد ميعاد', href: '/publish?view=ready', icon: <Send size={15} /> },
  { id: 'scheduled', statuses: ['scheduled'], en: 'Scheduled', ar: 'مجدول', whoEn: 'Goes out at its time', whoAr: 'بيتنشر في ميعاده', href: '/publish?view=scheduled', icon: <CalendarClock size={15} /> },
  { id: 'published', statuses: ['published'], en: 'Published', ar: 'منشور', whoEn: 'Results in Analytics', whoAr: 'النتائج في التحليلات', href: '/analytics?section=posts', icon: <CheckCircle2 size={15} /> },
];

export const stageOf = (status: ContentStatus): JourneyStage | null => JOURNEY.find((stage) => stage.statuses.includes(status))?.id ?? null;

/** The stages this person moves posts out of: their own drafts, approval, publishing. */
function useTurns(items: PipelineItem[]) {
  const { user, can } = useAuth();
  const mine = (stage: JourneyStage) => items.filter((item) => stageOf(item.status) === stage
    && (stage !== 'making' || (item.ownerId === user.id && item.moves.some((move) => move.to === 'ready_for_review')))).length;
  const turns: Partial<Record<JourneyStage, number>> = {};
  if (can('content.create')) turns.making = mine('making');
  if (can('content.approve')) turns.review = mine('review');
  if (can('content.publish') || can('content.schedule')) turns.ready = mine('ready');
  return turns;
}

/**
 * The path as a row of stops with counts. With `onSelect` it works as the filter of the page it sits on
 * (Content); otherwise each stop links to its page and `here` marks the stops this page handles.
 */
export function Journey({ items, active, onSelect, here = [] }: { items: PipelineItem[]; active?: JourneyStage | null; onSelect?: (stage: JourneyStage) => void; here?: JourneyStage[] }) {
  const { t, num } = useI18n();
  const turns = useTurns(items);
  const count = (stage: JourneyStage) => items.filter((item) => stageOf(item.status) === stage).length;
  const returned = items.filter((item) => item.status === 'changes_requested').length;
  return (
    <ol className="journey" role={onSelect ? 'tablist' : undefined} aria-label={t('Where posts stand', 'المنشورات وصلت لفين')}>
      {JOURNEY.map((stage, index) => {
        const body = <>
          <span className="journey__top">
            <span className="journey__icon">{stage.icon}</span>
            <b className="u-tnum">{num(count(stage.id))}</b>
            {(turns[stage.id] ?? 0) > 0 && <span className="journey__turn">{t('Your turn', 'دورك')} · <span className="u-tnum">{num(turns[stage.id]!)}</span></span>}
          </span>
          <span className="journey__label">{t(stage.en, stage.ar)}</span>
          <small className="journey__who">{stage.id === 'making' && returned ? t(`${returned} returned for changes`, `${num(returned)} راجع بتعديلات`) : t(stage.whoEn, stage.whoAr)}</small>
        </>;
        const state = { 'data-active': active === stage.id || undefined, 'data-here': here.includes(stage.id) || undefined, 'data-stage': stage.id };
        return <li key={stage.id} className="journey__stop">
          {onSelect
            ? <button type="button" role="tab" aria-selected={active === stage.id} className="journey__btn" {...state} onClick={() => onSelect(stage.id)}>{body}</button>
            : <Link to={stage.href} className="journey__btn" {...state}>{body}</Link>}
          {index < JOURNEY.length - 1 && <ArrowRight size={14} className="journey__arrow u-flip" aria-hidden />}
        </li>;
      })}
    </ol>
  );
}

/** The one thing waiting on this person right now, with the button that does it. Nothing when nothing waits. */
export function NextForYou({ items, onGo }: { items: PipelineItem[]; onGo?: (stage: JourneyStage) => void }) {
  const { t, num } = useI18n();
  const turns = useTurns(items);
  const first = (['review', 'ready', 'making'] as JourneyStage[]).find((stage) => (turns[stage] ?? 0) > 0);
  if (!first) return null;
  const n = turns[first]!;
  const copy: Record<string, [string, string, string, string]> = {
    review: [`${n} posts are waiting for your approval.`, `${num(n)} منشور مستني اعتمادك.`, 'Review them', 'راجعهم'],
    ready: [`${n} approved posts are ready. Publish them now or pick a time.`, `${num(n)} منشور معتمد وجاهز. انشره دلوقتي أو حدد ميعاد.`, 'Publish', 'انشر'],
    making: [`${n} of your posts are not sent for approval yet.`, `${num(n)} من منشوراتك لسه ما اتبعتتش للاعتماد.`, 'Open them', 'افتحهم'],
  };
  const [en, ar, actionEn, actionAr] = copy[first];
  const href = JOURNEY.find((stage) => stage.id === first)!.href;
  return (
    <div className="journey-next" data-stage={first} role="status">
      <span className="journey-next__dot" aria-hidden />
      <span className="journey-next__text">{t(en, ar)}</span>
      {onGo
        ? <button type="button" className="journey-next__go" onClick={() => onGo(first)}>{t(actionEn, actionAr)} <ArrowRight size={14} className="u-flip" /></button>
        : <Link to={href} className="journey-next__go">{t(actionEn, actionAr)} <ArrowRight size={14} className="u-flip" /></Link>}
    </div>
  );
}
