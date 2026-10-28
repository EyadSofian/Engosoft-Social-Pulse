import { useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarClock, Check, CheckCircle2, Clock, MessageSquareWarning, RotateCcw, Send, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { ContentStatus } from '../../domain/content';
import { suggestedSlots } from '../../domain/content-voice';
import { useI18n } from '../../i18n/I18nProvider';
import { businessZone } from '../../lib/format';
import type { PipelineDetail } from './types';

type Stage = 'draft' | 'review' | 'approved' | 'scheduled' | 'published';
const STAGES: { id: Stage; en: string; ar: string }[] = [
  { id: 'draft', en: 'Draft', ar: 'مسودة' },
  { id: 'review', en: 'Marketing review', ar: 'مراجعة التسويق' },
  { id: 'approved', en: 'Approved', ar: 'معتمد' },
  { id: 'scheduled', en: 'Scheduled', ar: 'مجدول' },
  { id: 'published', en: 'Published', ar: 'منشور' },
];
const STAGE_OF: Record<ContentStatus, Stage> = {
  idea: 'draft', draft: 'draft', in_production: 'draft', changes_requested: 'draft', ready_for_review: 'review',
  approved: 'approved', scheduled: 'scheduled', published: 'published', archived: 'published', cancelled: 'draft',
};

export interface MoveInput { note?: string; scheduledAt?: string }

/** A publish time: suggested slots for the Saudi audience, or any future time. */
function WhenPicker({ value, onChange, channels }: { value: string; onChange: (next: string) => void; channels: PipelineDetail['channels'] }) {
  const { t, lang } = useI18n();
  const nowLocal = DateTime.now().setZone(businessZone()).toFormat("yyyy-LL-dd'T'HH:mm");
  return (
    <div className="flow-when">
      <div className="content-slots" aria-label={t('Suggested times', 'مواعيد مقترحة')}>
        <span><Clock size={13} /> {t('Best times', 'أفضل وقت')}</span>
        {suggestedSlots(channels, businessZone()).map((slot) => <button key={slot.at} type="button" aria-pressed={value === slot.at} onClick={() => onChange(slot.at)}>
          {DateTime.fromISO(slot.at, { zone: businessZone() }).setLocale(lang === 'ar' ? 'ar' : 'en').toFormat('ccc h:mm a')}
        </button>)}
      </div>
      <label>{t('Or pick a time', 'أو اختر موعدًا')} · <span className="u-tnum">{businessZone()}</span>
        <input type="datetime-local" min={nowLocal} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      {value && value < nowLocal && <small role="alert" className="creative-home__error">{t('This time has already passed. Choose a future time.', 'هذا الموعد مضى بالفعل. اختر موعدًا قادمًا.')}</small>}
    </div>
  );
}

/**
 * Where a post stands and the one thing to do next, for this person. Each stage shows only its own actions,
 * named for what they do: approve (optionally with a publish time), schedule, change the time, take it off the
 * calendar, or send it back with a note. With `onPublish`, choosing the time (and the accounts that publish
 * themselves) happens in the publish dialog instead of the inline picker.
 */
export function NextStep({ item, busy, onMove, onPublish }: { item: PipelineDetail; busy: boolean; onMove: (to: ContentStatus, input: MoveInput) => Promise<boolean>; onPublish?: () => void }) {
  const { t, date } = useI18n();
  const [mode, setMode] = useState<'' | 'changes' | 'cancel' | 'when'>('');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState('');
  const can = (to: ContentStatus) => item.moves.some((m) => m.to === to);
  const stage = STAGE_OF[item.status];
  const at = (s: Stage) => STAGES.findIndex((x) => x.id === s);
  const nowLocal = DateTime.now().setZone(businessZone()).toFormat("yyyy-LL-dd'T'HH:mm");
  const whenOk = Boolean(when) && when >= nowLocal;
  const iso = (local: string) => DateTime.fromISO(local, { zone: businessZone() }).toUTC().toISO() ?? undefined;
  const lastRequest = [...item.events].reverse().find((e) => e.kind === 'transition' && e.to === 'changes_requested' && e.body);
  const go = async (to: ContentStatus, input: MoveInput = {}) => { if (await onMove(to, input)) { setMode(''); setNote(''); setWhen(''); } };

  const status = (() => {
    switch (item.status) {
      case 'ready_for_review': return can('approved') ? t('Waiting for your approval. Check the design and the caption, then approve or ask for changes.', 'بانتظار اعتمادك. راجع التصميم والنص، ثم اعتمد أو اطلب تعديلًا.') : t('Sent to marketing. You will be notified when it is approved or returned.', 'اتبعت للتسويق. هيوصلك إشعار لما يتعتمد أو يرجع بتعديلات.');
      case 'changes_requested': return t('Marketing asked for changes. Fix them, then send it again.', 'التسويق طلب تعديلات. عدّلها وابعته تاني.');
      case 'approved': return can('scheduled') ? t('Approved. Pick when it goes out to put it on the calendar.', 'معتمد. حدد ميعاد النشر علشان يتحط في التقويم.') : t('Approved. Marketing will schedule it.', 'معتمد. التسويق هيحدد ميعاد النشر.');
      case 'scheduled': return t(`Scheduled for ${item.scheduledAt ? date(item.scheduledAt, 'dateTime') : '—'}. It is marked published by itself once the post is found live.`, `مجدول للنشر ${item.scheduledAt ? date(item.scheduledAt, 'dateTime') : '—'}. هيتعلّم «منشور» لوحده أول ما البوست يظهر على المنصة.`);
      case 'published': return t('Published. Results appear below.', 'اتنشر. النتائج بتظهر تحت.');
      case 'cancelled': return t('Cancelled.', 'ملغي.');
      case 'archived': return t('Archived.', 'مؤرشف.');
      default: return t('Still being made. Send it to marketing when the design and caption are ready.', 'لسه بيتعمل. ابعته للتسويق لما التصميم والنص يجهزوا.');
    }
  })();

  const noteBox = (to: 'changes_requested' | 'cancelled') => (
    <div className="flow-note">
      <textarea rows={3} autoFocus dir="auto" value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={to === 'cancelled' ? t('Why is it cancelled? (required)', 'ليه بيتلغي؟ (مطلوب)') : t('What should change? Be specific (required)', 'إيه اللي محتاج يتعدّل؟ اكتبه بوضوح (مطلوب)')} />
      <div className="flow-actions">
        <Button variant={to === 'cancelled' ? 'danger' : 'primary'} icon={to === 'cancelled' ? <X size={15} /> : <Send size={15} />} busy={busy} disabled={!note.trim()} onClick={() => void go(to, { note: note.trim() })}>
          {to === 'cancelled' ? t('Cancel the post', 'ألغِ المنشور') : t('Send the changes request', 'ابعت طلب التعديل')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setMode(''); setNote(''); }}>{t('Back', 'رجوع')}</Button>
      </div>
    </div>
  );

  return (
    <section className="content-drawer__section flow">
      <h3>{t('Next step', 'الخطوة التالية')}</h3>
      {item.status !== 'cancelled' && <ol className="flow-steps" aria-label={t('Progress', 'المراحل')}>
        {STAGES.map((s) => <li key={s.id} data-state={at(s.id) < at(stage) ? 'done' : s.id === stage ? (item.status === 'changes_requested' ? 'returned' : 'now') : 'next'}>
          <i>{at(s.id) < at(stage) ? <Check size={11} /> : null}</i><span>{t(s.en, s.ar)}</span>
        </li>)}
      </ol>}
      <p className="flow-status">{status}</p>
      {item.status === 'changes_requested' && lastRequest && <blockquote className="flow-request"><MessageSquareWarning size={15} /> <span dir="auto">{lastRequest.body}</span></blockquote>}

      {mode === 'changes' && noteBox('changes_requested')}
      {mode === 'cancel' && noteBox('cancelled')}

      {!mode.startsWith('c') && <>
        {/* Being made, or returned: send to marketing. */}
        {can('ready_for_review') && <div className="flow-actions">
          <Button variant="primary" icon={<Send size={15} />} busy={busy} onClick={() => void go('ready_for_review')}>{item.status === 'changes_requested' ? t('Send again to marketing', 'ابعته تاني للتسويق') : t('Send to marketing for approval', 'ابعته للتسويق للاعتماد')}</Button>
          {can('cancelled') && !item.moves.find((m) => m.to === 'cancelled')?.needsNote && <Button variant="ghost" disabled={busy} onClick={() => void go('cancelled')}>{t('Cancel post', 'ألغِ المنشور')}</Button>}
        </div>}

        {/* Review: approve, optionally with a time; or send back. */}
        {item.status === 'ready_for_review' && can('approved') && <>
          {mode === 'when' && <WhenPicker value={when} onChange={setWhen} channels={item.channels} />}
          <div className="flow-actions">
            <Button variant="primary" icon={<CheckCircle2 size={15} />} busy={busy} disabled={mode === 'when' && !whenOk}
              onClick={() => void go('approved', mode === 'when' && whenOk ? { scheduledAt: iso(when) } : {})}>
              {mode === 'when' ? t('Approve and schedule', 'اعتمد وجدوِل') : t('Approve', 'اعتمد')}
            </Button>
            {mode !== 'when' && item.canSchedule && <Button variant="secondary" icon={<CalendarClock size={15} />} disabled={busy} onClick={() => setMode('when')}>{t('Approve with a publish time', 'اعتمد مع ميعاد النشر')}</Button>}
            {mode === 'when' && <Button variant="ghost" disabled={busy} onClick={() => { setMode(''); setWhen(''); }}>{t('Without a time', 'بدون ميعاد')}</Button>}
            {can('changes_requested') && <Button variant="ghost" disabled={busy} onClick={() => setMode('changes')}>{t('Request changes', 'اطلب تعديلًا')}</Button>}
            {can('cancelled') && <Button variant="ghost" disabled={busy} onClick={() => setMode('cancel')}>{t('Cancel', 'ألغِ')}</Button>}
          </div>
        </>}

        {/* Approved: schedule. */}
        {item.status === 'approved' && <>
          {can('scheduled') && !onPublish && <WhenPicker value={when} onChange={setWhen} channels={item.channels} />}
          <div className="flow-actions">
            {onPublish && <Button variant="primary" icon={<Send size={15} />} disabled={busy} onClick={onPublish}>{t('Publish or schedule', 'انشر أو جدول')}</Button>}
            {can('scheduled') && !onPublish && <Button variant="primary" icon={<CalendarClock size={15} />} busy={busy} disabled={!whenOk} onClick={() => void go('scheduled', { scheduledAt: iso(when) })}>{t('Schedule', 'جدوِل النشر')}</Button>}
            {can('changes_requested') && <Button variant="ghost" disabled={busy} onClick={() => setMode('changes')}>{t('Return for changes', 'رجّعه للتعديل')}</Button>}
          </div>
        </>}

        {/* Scheduled: move the time, or take it off the calendar. */}
        {item.status === 'scheduled' && <>
          {mode === 'when' && <WhenPicker value={when} onChange={setWhen} channels={item.channels} />}
          <div className="flow-actions">
            {mode === 'when'
              ? <><Button variant="primary" icon={<CalendarClock size={15} />} busy={busy} disabled={!whenOk} onClick={() => void go('scheduled', { scheduledAt: iso(when) })}>{t('Save the new time', 'احفظ الموعد الجديد')}</Button>
                <Button variant="ghost" disabled={busy} onClick={() => { setMode(''); setWhen(''); }}>{t('Back', 'رجوع')}</Button></>
              : <>{can('scheduled') && <Button variant="secondary" icon={<CalendarClock size={15} />} disabled={busy} onClick={() => (onPublish ? onPublish() : setMode('when'))}>{onPublish ? t('Change the time or accounts', 'غيّر الموعد أو الحسابات') : t('Change the time', 'غيّر الموعد')}</Button>}
                {can('approved') && <Button variant="ghost" icon={<RotateCcw size={15} />} busy={busy} onClick={() => void go('approved')}>{t('Unschedule', 'ألغِ الجدولة')}</Button>}</>}
          </div>
        </>}

        {item.status === 'cancelled' && can('draft') && <div className="flow-actions"><Button variant="secondary" icon={<RotateCcw size={15} />} busy={busy} onClick={() => void go('draft')}>{t('Restore as draft', 'رجّعه مسودة')}</Button></div>}
      </>}
    </section>
  );
}
