import { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing, Check, ChevronDown, PlusSquare, Share, Smartphone } from 'lucide-react';
import { Checkbox } from '../../components/forms/Field';
import { useToast } from '../../components/feedback/Toast';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../../lib/api';
import { getPushStatus, isIos, pushState, savePushPrefs, sendTestPush, turnOffPush, turnOnPush, type PushPrefs, type PushState, type PushTopic } from '../../lib/push';

const TOPICS: { id: PushTopic; label: string; hint: string; analytics?: boolean }[] = [
  { id: 'daily', label: 'ملخص امبارح', hint: 'كل يوم الصبح: البوستات والتفاعل والوصول', analytics: true },
  { id: 'best', label: 'أفضل بوست', hint: 'أفضل بوست امبارح وأفضل بوست في الأسبوع', analytics: true },
  { id: 'alerts', label: 'تنبيهات مهمة', hint: 'زيادة أو نقص التفاعل، أيام من غير نشر، منصات ضعيفة', analytics: true },
  { id: 'tips', label: 'نصايح', hint: 'أوقات نشر أفضل لكل منصة', analytics: true },
  { id: 'ideas', label: 'أفكار', hint: 'أفكار من متابعة المنافسين وتنويع المحتوى', analytics: true },
  { id: 'work', label: 'الشغل', hint: 'منشورات جديدة، طلبات مراجعة، واعتماد منشوراتك' },
];

/**
 * Turns phone notifications on for this device and chooses what arrives. On an iPhone in Safari it first shows how
 * to add the app to the home screen, because iOS only allows notifications from there.
 */
export function PushCard({ compact = false }: { compact?: boolean }) {
  const toast = useToast();
  const { can } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(!compact);

  const refresh = useCallback(async () => {
    setState(await pushState());
    getPushStatus().then((s) => setPrefs(s.prefs)).catch(() => {});
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    try { await work(); } catch (error) { toast.error('تعذّر تنفيذ الطلب', errorMessage(error, '')); } finally { setBusy(''); }
  };
  const turnOn = () => act('on', async () => {
    const next = await turnOnPush();
    setState(next);
    if (next === 'on') toast.success('الإشعارات اتفعّلت على الجهاز ده');
    if (next === 'denied') toast.error('الإشعارات مقفولة', 'افتحها من إعدادات الموبايل.');
  });
  const turnOff = () => act('off', async () => { setState(await turnOffPush()); });
  const test = () => act('test', async () => { await sendTestPush(); toast.success('اتبعت إشعار تجريبي', 'هيوصلك خلال ثواني.'); });
  const toggle = (topic: PushTopic, value: boolean) => act(topic, async () => {
    if (!prefs) return;
    const next = { ...prefs, [topic]: value };
    setPrefs(next);
    setPrefs((await savePushPrefs(next)).prefs);
  });

  if (!state) return null;
  const topics = TOPICS.filter((topic) => !topic.analytics || can('analytics.view'));

  if (state === 'install-first') return (
    <div className="push-card push-card--install">
      <div className="push-card__head">
        <span className="push-card__icon"><Smartphone size={18} /></span>
        <div>
          <b>نزّل «مبدع» على الموبايل عشان توصلك الإشعارات</b>
          <p>الآيفون بيسمح بالإشعارات للتطبيق اللي على الشاشة الرئيسية بس (iOS 16.4 أو أحدث).</p>
        </div>
      </div>
      <ol className="push-card__steps">
        <li><span className="push-card__num">1</span>في Safari دوس على زر المشاركة <Share size={15} aria-label="مشاركة" /> تحت</li>
        <li><span className="push-card__num">2</span>اختار «إضافة إلى الشاشة الرئيسية» <PlusSquare size={15} aria-hidden /></li>
        <li><span className="push-card__num">3</span>افتح «مبدع» من الشاشة الرئيسية، وفعّل الإشعارات من هنا</li>
      </ol>
    </div>
  );

  if (state === 'unsupported') return compact ? null : (
    <div className="push-card"><div className="push-card__head"><span className="push-card__icon"><BellOff size={18} /></span><div><b>المتصفح ده مش بيدعم الإشعارات</b><p>{isIos() ? 'حدّث الآيفون لـ iOS 16.4 أو أحدث.' : 'جرّب Chrome أو Safari بإصدار حديث.'}</p></div></div></div>
  );

  if (state === 'denied') return (
    <div className="push-card">
      <div className="push-card__head">
        <span className="push-card__icon"><BellOff size={18} /></span>
        <div>
          <b>الإشعارات مقفولة على الجهاز ده</b>
          <p>{isIos() ? 'افتح الإعدادات ← الإشعارات ← مبدع، وشغّل «السماح بالإشعارات».' : 'اسمح بالإشعارات للموقع من إعدادات المتصفح، وبعدها ارجع هنا.'}</p>
        </div>
      </div>
    </div>
  );

  if (state === 'off') return (
    <div className="push-card push-card--cta">
      <div className="push-card__head">
        <span className="push-card__icon"><BellRing size={18} /></span>
        <div>
          <b>فعّل الإشعارات على الجهاز ده</b>
          <p>ملخص كل يوم، أفضل بوست، وتنبيه لو التفاعل زاد أو قلّ أو فيه أيام من غير نشر.</p>
        </div>
      </div>
      <Button variant="primary" busy={busy === 'on'} onClick={() => void turnOn()} icon={<BellRing size={15} />}>فعّل الإشعارات</Button>
    </div>
  );

  return (
    <div className="push-card push-card--on">
      <div className="push-card__head">
        <span className="push-card__icon push-card__icon--on"><Check size={18} /></span>
        <div>
          <b>الإشعارات شغالة على الجهاز ده</b>
          <p>اختار إيه اللي يوصلك على الموبايل. كله بيفضل موجود في الجرس جوه التطبيق.</p>
        </div>
        {compact && (
          <button type="button" className="push-card__more" aria-expanded={open} onClick={() => setOpen(!open)}>
            اختار <ChevronDown size={14} />
          </button>
        )}
      </div>
      {open && (
        <>
          {prefs && (
            <ul className="push-card__topics">
              {topics.map((topic) => (
                <li key={topic.id}>
                  <Checkbox checked={prefs[topic.id]} disabled={busy === topic.id} onChange={(value) => void toggle(topic.id, value)} label={<span className="push-card__topic"><b>{topic.label}</b><small>{topic.hint}</small></span>} />
                </li>
              ))}
            </ul>
          )}
          <div className="push-card__actions">
            <Button size="sm" busy={busy === 'test'} onClick={() => void test()}>ابعت إشعار تجريبي</Button>
            <Button size="sm" variant="ghost" busy={busy === 'off'} onClick={() => void turnOff()}>اقفلها على الجهاز ده</Button>
          </div>
        </>
      )}
    </div>
  );
}
