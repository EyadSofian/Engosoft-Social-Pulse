import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { useWorkspace } from '../features/workspace/WorkspaceProvider';
import { useI18n } from '../i18n/I18nProvider';
import { navItem, type NavId } from './nav';

const TOUR_EVENT = 'mobde3:tour';
const VERSION = 'v1';
/** Opens the tour from anywhere (the account menu, a help link). */
export const startTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

interface Step {
  id: string;
  /** `data-tour` of the element to point at; none for the opening and closing cards. */
  target?: string;
  /** The page this step is about; skipped when the person cannot open it. */
  nav?: NavId;
  /** Needs this to be shown at all. */
  when?: (can: (permission: Parameters<ReturnType<typeof useAuth>['can']>[0]) => boolean) => boolean;
  title: [string, string];
  body: [string, string];
}

/** Where everything is, in the order of a working day. Each step is skipped when the person cannot use that place. */
const STEPS: Step[] = [
  { id: 'welcome', title: ['Welcome to Mobde3', 'أهلًا بيك في مبدع'], body: ['A one-minute tour of where everything is. Every post moves through five steps: being made → waiting for approval → ready to publish → scheduled → published.', 'جولة سريعة (دقيقة) تعرّفك كل حاجة مكانها فين. كل منشور بيمشي في خمس خطوات: بيتعمل ← بانتظار الاعتماد ← جاهز للنشر ← مجدول ← منشور.'] },
  { id: 'new-post', target: 'new-post', when: (can) => can('content.create'), title: ['New post', 'منشور جديد'], body: ['Every post starts here: describe it and AI designs it, fill a ready template, upload a finished design, or upload a Reel.', 'أي منشور بيبدأ من هنا: تكتب الفكرة والذكاء الاصطناعي يصمم، أو تملا قالب جاهز، أو ترفع تصميم جاهز، أو ترفع ريل.'] },
  { id: 'overview', target: 'nav-overview', nav: 'overview', title: ['Overview', 'نظرة عامة'], body: ['What needs you today, what is late, and how far the month’s plan has come.', 'الشغل اللي محتاجك النهارده، والمتأخر، وخطة الشهر وصلت لفين.'] },
  { id: 'content', target: 'nav-content', nav: 'content', title: ['Content & approval', 'المحتوى والاعتماد'], body: ['All posts, grouped by the five steps. Each card says who has the post and the one thing to do next. A “Your turn” badge means something is waiting for you.', 'كل المنشورات متقسمة على الخمس خطوات. كل كارت بيقولك المنشور عند مين والخطوة الجاية إيه. شارة «دورك» معناها إن فيه حاجة مستنياك.'] },
  { id: 'calendar', target: 'nav-calendar', nav: 'calendar', title: ['Calendar', 'التقويم'], body: ['The month’s plan, day by day. Upload the plan file (Excel), turn each planned row into a post, and give approved posts their time.', 'خطة الشهر يوم بيوم. ارفع ملف الخطة (Excel)، وحوّل كل سطر لمنشور، وحدد ميعاد المنشورات المعتمدة.'] },
  { id: 'publish', target: 'nav-publish', nav: 'publish', title: ['Publishing', 'النشر'], body: ['Approved posts ready to go out. Facebook and Instagram publish themselves at the time; TikTok, YouTube and Snapchat from the post page; the rest by hand.', 'المنشورات المعتمدة الجاهزة. فيسبوك وإنستجرام بينشروا لوحدهم في الميعاد، وتيك توك ويوتيوب وسناب من صفحة المنشور، والباقي يدوي.'] },
  { id: 'analytics', target: 'nav-analytics', nav: 'analytics', title: ['Analytics', 'التحليلات'], body: ['How each published post did, judged by its own goal: reach, engagement, sign-ups or website visits.', 'أداء كل منشور اتنشر، بيتقاس بهدفه: وصول أو تفاعل أو تسجيلات أو زيارات للموقع.'] },
  { id: 'library', target: 'nav-library', nav: 'library', title: ['Library', 'المكتبة'], body: ['Ready templates, approved design references and media to build posts from.', 'القوالب الجاهزة والمراجع المعتمدة والصور اللي بتبني منها المنشورات.'] },
  { id: 'courses', target: 'nav-courses', nav: 'courses', title: ['Courses', 'الدورات'], body: ['Course facts from Odoo. Captions and designs take their dates and links from here, so they are never invented.', 'بيانات الدورات من Odoo. النصوص والتصميمات بتاخد التواريخ واللينكات من هنا، علشان محدش يألفها.'] },
  { id: 'usage', target: 'nav-usage', nav: 'usage', title: ['AI usage', 'الاستهلاك'], body: ['What AI designs and captions have cost, per person.', 'تكلفة التصميم والكتابة بالذكاء الاصطناعي لكل شخص.'] },
  { id: 'settings', target: 'nav-settings', nav: 'settings', title: ['Settings', 'الإعدادات'], body: ['Connected accounts, the team, and permissions: switch each ability on or off for one person, such as uploading Reels or using AI.', 'ربط الحسابات، والفريق، والصلاحيات: تفتح أو تقفل أي صلاحية لشخص واحد، زي رفع الريلز أو استخدام الذكاء الاصطناعي.'] },
  { id: 'search', target: 'search', title: ['Search', 'البحث'], body: ['Find any post, course, template or person. Shortcut: Ctrl/⌘ + K.', 'دوّر على أي منشور أو دورة أو قالب أو شخص. اختصار: Ctrl/⌘ + K.'] },
  { id: 'bell', target: 'bell', title: ['Notifications', 'الإشعارات'], body: ['When a post is approved, sent back, scheduled or published, you hear about it here.', 'لما منشور يتعتمد أو يرجع بتعديل أو يتجدول أو يتنشر، بيوصلك هنا.'] },
  { id: 'user-menu', target: 'user-menu', title: ['Your account', 'حسابك'], body: ['Language, dark mode, and “Take the tour” to see this again any time.', 'اللغة والوضع الداكن، و«جولة تعريفية» علشان تشوف الجولة دي تاني في أي وقت.'] },
  { id: 'done', title: ['You are ready', 'كده إنت جاهز'], body: ['Start with “New post”, or open Content & approval to see what is waiting for you.', 'ابدأ من «منشور جديد»، أو افتح «المحتوى والاعتماد» تشوف إيه اللي مستنيك.'] },
];

/** The first element with this tag that is actually on screen (the sidebar is hidden on phones, the bottom bar on desktop). */
function findTarget(tag: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${tag}"]`)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden') return element;
  }
  return null;
}

const storageKey = (userId: string) => `mobde3-tour:${VERSION}:${userId}`;
function seen(userId: string): boolean | null {
  try { return localStorage.getItem(storageKey(userId)) === 'done'; } catch { return null; }
}
function markSeen(userId: string) {
  try { localStorage.setItem(storageKey(userId), 'done'); } catch { /* Private storage: the tour simply shows again next time. */ }
}

/**
 * A guided tour of the dashboard for people who are new to it: a spotlight on each place in turn with what it is for.
 * It opens by itself on someone's first visit, can be replayed from the account menu, and only shows the places the
 * person's permissions let them open.
 */
export function ProductTour() {
  const { t, dir } = useI18n();
  const { user, can } = useAuth();
  const { me } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viaMenu, setViaMenu] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 340, height: 200 });

  const steps = useMemo(() => STEPS.filter((step) => (!step.nav || navItem(step.nav).visible(me)) && (!step.when || step.when(can))), [me, can]);
  const step = steps[Math.min(index, steps.length - 1)];

  const close = useCallback(() => { setOpen(false); markSeen(user.id); }, [user.id]);
  useEffect(() => {
    let timer: number | undefined;
    // An open post or dialog covers the places the tour points at, so it starts once nothing is open.
    const begin = () => {
      window.clearTimeout(timer);
      if (document.querySelector('.ui-overlay')) { timer = window.setTimeout(begin, 1500); return; }
      setIndex(0); setOpen(true);
    };
    window.addEventListener(TOUR_EVENT, begin);
    // First visit only. Without browser storage it would reopen on every visit, so it waits for the menu instead.
    if (seen(user.id) === false) timer = window.setTimeout(begin, 1200);
    return () => { window.removeEventListener(TOUR_EVENT, begin); window.clearTimeout(timer); };
  }, [user.id]);

  // Follow the target while the page scrolls or resizes; a page in another place falls back to the menu button on phones.
  useLayoutEffect(() => {
    if (!open || !step?.target) { setRect(null); setViaMenu(false); return; }
    let frame = 0;
    let element = findTarget(step.target);
    const fallback = !element && step.nav ? findTarget('menu') : null;
    setViaMenu(Boolean(fallback));
    element = element ?? fallback;
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const measure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setRect(element ? element.getBoundingClientRect() : null)); };
    // The first position is taken at once, so the spotlight never shows the previous step's target.
    setRect(element ? element.getBoundingClientRect() : null);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open || !card.current) return;
    setCardSize({ width: card.current.offsetWidth, height: card.current.offsetHeight });
    card.current.focus();
  }, [open, index, rect]);

  const next = useCallback(() => (index >= steps.length - 1 ? close() : setIndex(index + 1)), [index, steps.length, close]);
  const back = useCallback(() => setIndex(Math.max(0, index - 1)), [index]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === (dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight') || event.key === 'Enter') { event.preventDefault(); next(); }
      else if (event.key === (dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft')) { event.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dir, next, back, close]);

  if (!open || !step) return null;
  const pad = 6, gap = 14, margin = 12;
  const vw = window.innerWidth, vh = window.innerHeight;
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  // Beside a target in a side bar, below or above anything else; centred when there is nothing to point at.
  let position: { left: number; top: number };
  if (!hole) position = { left: (vw - cardSize.width) / 2, top: (vh - cardSize.height) / 2 };
  else if (vw >= 640 && (hole.left + hole.width / 2 > vw * 0.66 || hole.left + hole.width / 2 < vw * 0.34)) {
    const onRight = hole.left + hole.width / 2 > vw / 2;
    position = { left: onRight ? hole.left - gap - cardSize.width : hole.left + hole.width + gap, top: hole.top + hole.height / 2 - cardSize.height / 2 };
  } else {
    const below = hole.top + hole.height + gap + cardSize.height <= vh - margin;
    position = { left: hole.left + hole.width / 2 - cardSize.width / 2, top: below ? hole.top + hole.height + gap : hole.top - gap - cardSize.height };
  }
  position = { left: Math.min(Math.max(margin, position.left), vw - cardSize.width - margin), top: Math.min(Math.max(margin, position.top), vh - cardSize.height - margin) };
  const last = index >= steps.length - 1;

  return (
    <div className="tour" role="presentation">
      {hole ? <div className="tour__hole" style={hole} aria-hidden /> : <div className="tour__dim" aria-hidden />}
      <div ref={card} className="tour__card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1} style={position}>
        <div className="tour__top">
          <span className="tour__badge"><Compass size={14} /> {t(`${index + 1} of ${steps.length}`, `${index + 1} من ${steps.length}`)}</span>
          <button type="button" className="tour__close" onClick={close} aria-label={t('Close the tour', 'اقفل الجولة')}><X size={16} /></button>
        </div>
        <h2 id="tour-title">{t(...step.title)}</h2>
        <p id="tour-body">{t(...step.body)}</p>
        {viaMenu && <p className="tour__hint">{t('On this screen it is in the menu ☰ at the top.', 'على الشاشة دي هتلاقيها في القايمة ☰ فوق.')}</p>}
        <div className="tour__dots" aria-hidden>{steps.map((s, i) => <i key={s.id} data-on={i === index || undefined} />)}</div>
        <div className="tour__actions">
          {!last && <button type="button" className="tour__skip" onClick={close}>{t('Skip the tour', 'تخطّى الجولة')}</button>}
          <span className="u-grow" />
          {index > 0 && <button type="button" className="tour__back" onClick={back}><ArrowLeft size={15} className="u-flip" /> {t('Back', 'رجوع')}</button>}
          <button type="button" className="tour__next" onClick={next}>{last ? t('Start working', 'يلا نبدأ') : index === 0 ? t('Show me around', 'ورّيني') : t('Next', 'التالي')} {!last && <ArrowRight size={15} className="u-flip" />}</button>
        </div>
      </div>
    </div>
  );
}
