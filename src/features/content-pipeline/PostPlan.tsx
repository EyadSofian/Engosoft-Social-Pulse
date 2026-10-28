import { useState } from 'react';
import { CalendarDays, Eye, Heart, MousePointerClick, UserPlus, type LucideIcon } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import { GOAL_INFO, GOALS, type Goal } from '../../domain/goals';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { fromInputValue, toInputValue } from '../../lib/format';
import { CHANNELS } from '../../domain/shared';
import { platformOf } from '../publishing/PublishDialog';
import type { Channel, PipelineItem } from './types';

export const GOAL_ICON: Record<Goal, LucideIcon> = { reach: Eye, engagement: Heart, leads: UserPlus, traffic: MousePointerClick };

export function GoalBadge({ goal, empty }: { goal: Goal | null; empty?: boolean }) {
  const { t, tx } = useI18n();
  if (!goal) return empty ? <span className="goal-badge" data-goal="none">{t('No goal yet', 'بدون هدف')}</span> : null;
  const Icon = GOAL_ICON[goal];
  return <span className="goal-badge" data-goal={goal}><Icon size={12} aria-hidden /> {tx(GOAL_INFO[goal].label)}</span>;
}

/** Four goal choices with what each one is for; `value` null means none chosen. */
export function GoalPicker({ value, onChange, disabled }: { value: Goal | null; onChange: (goal: Goal) => void; disabled?: boolean }) {
  const { tx, t } = useI18n();
  return <div className="goal-picker" role="radiogroup" aria-label={t('Goal', 'الهدف')}>
    {GOALS.map((goal) => {
      const Icon = GOAL_ICON[goal];
      return <button key={goal} type="button" role="radio" aria-checked={value === goal} data-goal={goal} disabled={disabled} onClick={() => onChange(goal)} title={tx(GOAL_INFO[goal].hint)}>
        <Icon size={15} aria-hidden /><b>{tx(GOAL_INFO[goal].label)}</b><small>{tx(GOAL_INFO[goal].hint)}</small>
      </button>;
    })}
  </div>;
}

/**
 * The post's plan: its goal, the day it is planned for and its platforms. Planning stays editable for the owner
 * and planners until the post is scheduled; after that the publish time lives in the publish dialog.
 */
export function PostPlanCard({ item, onSaved }: { item: PipelineItem; onSaved: () => void }) {
  const { t, tx, date } = useI18n();
  const open = !['scheduled', 'published', 'archived', 'cancelled'].includes(item.status) && (item.editable || Boolean(item.canSchedule) || item.status === 'approved');
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState<Goal | null>(item.goal);
  const [day, setDay] = useState(item.plannedFor ? toInputValue(item.plannedFor) : '');
  const [channels, setChannels] = useState<Channel[]>(item.channels);
  const toggle = (channel: Channel) => setChannels((current) => current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    if (!channels.length) { setError(t('Choose at least one platform.', 'اختر منصة واحدة على الأقل.')); setBusy(false); return; }
    // Platforms are part of the post itself, so only someone who may edit it changes them.
    try { await api(`/api/content/${item.id}`, { method: 'PATCH', body: { goal, plannedFor: day ? fromInputValue(day) : null, ...(item.editable ? { channels } : {}) } }); setEditing(false); onSaved(); }
    catch (reason) { setError(errorMessage(reason, t('Could not save.', 'تعذّر الحفظ.'))); }
    setBusy(false);
  };
  const when = item.scheduledAt ?? item.plannedFor;
  return <section className="content-drawer__section post-plan">
    <header className="post-plan__head"><h3>{t('Post plan', 'خطة المنشور')}</h3>{open && !editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{t('Change', 'تعديل')}</Button>}</header>
    {editing ? <div className="u-stack">
      <GoalPicker value={goal} onChange={setGoal} />
      <label className="ui-field"><span className="ui-field__label">{t('Planned for', 'اليوم المستهدف')}</span><input className="ui-input" type="datetime-local" value={day} onChange={(event) => setDay(event.target.value)} /></label>
      {item.editable && <div className="ui-field"><span className="ui-field__label">{t('Platforms', 'المنصات')}</span>
        <div className="post-plan__picker" role="group" aria-label={t('Platforms', 'المنصات')}>{CHANNELS.map((channel) => <button key={channel} type="button" aria-pressed={channels.includes(channel)} onClick={() => toggle(channel)}><ChannelIcon channel={channel} size={15} />{platformOf(channel).name}</button>)}</div>
      </div>}
      {error && <p role="alert" className="creative-home__error">{error}</p>}
      <div className="u-row"><Button variant="primary" size="sm" busy={busy} onClick={() => void save()}>{t('Save', 'احفظ')}</Button><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setGoal(item.goal); setChannels(item.channels); }}>{t('Cancel', 'إلغاء')}</Button></div>
    </div> : <dl className="post-plan__facts">
      <div><dt>{t('Goal', 'الهدف')}</dt><dd>{item.goal ? <><GoalBadge goal={item.goal} /> <small>{t('judged by', 'بيتقاس بـ')} {tx(GOAL_INFO[item.goal].metric)}</small></> : <span className="u-muted">{t('Not set. Choose one so the post can be judged.', 'لم يُحدد. اختر هدفًا عشان المنشور يتقاس.')}</span>}</dd></div>
      <div><dt>{item.scheduledAt ? t('Publishes', 'ميعاد النشر') : t('Planned for', 'اليوم المستهدف')}</dt><dd>{when ? <span className="post-plan__when"><CalendarDays size={13} /> {date(when, 'weekdayDate')} · {date(when, 'time')}</span> : <span className="u-muted">{t('No day yet', 'بدون يوم')}</span>}</dd></div>
      <div><dt>{t('Platforms', 'المنصات')}</dt><dd className="post-plan__channels">{item.channels.map((channel) => <ChannelIcon key={channel} channel={channel} size={15} />)}</dd></div>
    </dl>}
  </section>;
}
