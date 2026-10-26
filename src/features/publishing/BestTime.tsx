import { Clock3 } from 'lucide-react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { SourceLine } from '../../components/data-display/Metric';
import { Badge } from '../../components/ui/Badge';
import type { Channel } from '../../domain/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { sourceOf } from '../../services/adapters/live';
import { recommendSlot } from './recommend';

/** "Recommended: Tuesday 11:30 — based on 24 Instagram posts, +18%". Says plainly when history is too thin. */
export function BestTime({ channels, now, onUse, compact }: { channels: Channel[]; now: number; onUse?: (iso: string) => void; compact?: boolean }) {
  const { t, date, num, pct } = useI18n();
  const { store } = useLiveData();
  const rec = recommendSlot(store.data.posts, channels, now);
  const measurable = channels.filter((channel) => channel !== 'linkedin');

  if (store.phase === 'loading') return <p className="u-sm u-muted">{t('Loading publishing history…', 'جارٍ تحميل سجل النشر…')}</p>;
  if (!rec)
    return (
      <div className="best-time best-time--empty">
        <Clock3 size={16} aria-hidden />
        <p className="u-sm">
          {measurable.length
            ? t(
                `Not enough measured posts on ${measurable.map((channel) => channelName[channel]).join(', ')} to recommend a time. A slot needs at least two posts with engagement data.`,
                `لا توجد منشورات مقاسة كافية على ${measurable.map((channel) => channelName[channel]).join('، ')} لاقتراح وقت. الوقت يحتاج منشورين على الأقل ببيانات تفاعل.`,
              )
            : t('LinkedIn has no connector yet, so there is no history to learn from.', 'LinkedIn غير مربوط بعد، فلا يوجد سجل نتعلم منه.')}
        </p>
      </div>
    );

  const confidence = { low: t('Low confidence', 'ثقة منخفضة'), medium: t('Medium confidence', 'ثقة متوسطة'), high: t('High confidence', 'ثقة عالية') }[rec.confidence];
  return (
    <div className="best-time">
      <div className="u-row u-row--between u-row--top">
        <div>
          <p className="best-time__eyebrow">{t('Recommended', 'الوقت المقترح')}</p>
          <p className="best-time__slot">
            {rec.weekday ? date(rec.at, 'weekday') : t('Any day', 'أي يوم')} · <span className="u-tnum">{date(rec.at, 'time')}</span>
          </p>
        </div>
        <Badge tone={rec.confidence === 'high' ? 'success' : rec.confidence === 'medium' ? 'brand' : 'warning'}>{confidence}</Badge>
      </div>
      <p className="u-sm u-muted">
        {t(`Based on ${num(rec.samples)} previous posts in this slot`, `بناءً على ${num(rec.samples)} منشور سابق في هذا الوقت`)} ({rec.platforms.map((platform) => channelName[platform]).join(', ')})
        {rec.lift != null && (
          <>
            {' · '}
            {t('average engagement', 'متوسط التفاعل')}{' '}
            <b className="u-tnum" dir="ltr">
              {rec.lift >= 0 ? '+' : '−'}
              {pct(Math.abs(rec.lift))}
            </b>{' '}
            {t(`vs. all ${num(rec.basis)} measured posts`, `مقارنة بكل ${num(rec.basis)} منشور مقاس`)}
          </>
        )}
      </p>
      {!compact && <SourceLine source={rec.platforms.map((platform) => sourceOf(platform, store.data.connectors))} now={now} />}
      {onUse && (
        <button type="button" className="ui-link" onClick={() => onUse(rec.at)}>
          {t(`Use ${date(rec.at, 'dateTime')}`, `استخدم ${date(rec.at, 'dateTime')}`)}
        </button>
      )}
    </div>
  );
}
