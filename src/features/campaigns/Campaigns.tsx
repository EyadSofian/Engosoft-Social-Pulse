import { useEffect, useRef, useState } from 'react';
import { Archive, ImagePlus, Megaphone, Plus, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { businessZone } from '../../lib/format';
import { DateTime } from 'luxon';

export type StampCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export interface Campaign {
  id: string; name: string; slogan: string; hashtag: string; corner: StampCorner; width: number;
  startsOn: string | null; endsOn: string | null; status: 'active' | 'archived';
  stampUrl: string | null; keyVisualUrl: string | null;
}

const CORNERS: { value: StampCorner; en: string; ar: string }[] = [
  { value: 'bottom-right', en: 'Bottom right', ar: 'أسفل اليمين' },
  { value: 'bottom-left', en: 'Bottom left', ar: 'أسفل اليسار' },
  { value: 'top-right', en: 'Top right', ar: 'أعلى اليمين' },
  { value: 'top-left', en: 'Top left', ar: 'أعلى اليسار' },
];

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState('');
  const reload = () => api<Campaign[]>('/api/campaigns').then((list) => { setCampaigns(list); setError(''); }).catch((reason) => setError(errorMessage(reason, '')));
  useEffect(() => { void reload(); }, []);
  return { campaigns, error, reload };
}

/** The campaign running today: the active one whose dates include today, or null. */
export function runningCampaign(campaigns: Campaign[]): Campaign | null {
  const today = DateTime.now().setZone(businessZone()).toISODate() ?? '';
  return campaigns.find((c) => c.status === 'active' && (!c.startsOn || c.startsOn <= today) && (!c.endsOn || c.endsOn >= today) && (c.startsOn || c.endsOn)) ?? null;
}

const asDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});

/** Where a stamp would sit on a 4:5 post, drawn to scale, so the size and corner are clear before saving. */
function StampPreview({ stamp, corner, width }: { stamp: string | null; corner: StampCorner; width: number }) {
  const { t } = useI18n();
  return <div className="campaign-preview" aria-label={t('Stamp position on a post', 'مكان الشعار على المنشور')}>
    <span className="campaign-preview__logo">ENGOSOFT</span>
    {stamp ? <img src={stamp} alt="" data-corner={corner} style={{ width: `${width * 100}%` }} /> : <span className="campaign-preview__empty" data-corner={corner} style={{ width: `${width * 100}%` }}>{t('Stamp', 'الشعار')}</span>}
  </div>;
}

/** One campaign's identity: name, slogan, hashtag, stamp, key visual, corner, size and dates. */
function CampaignForm({ initial, onSaved, onCancel }: { initial?: Campaign; onSaved: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [slogan, setSlogan] = useState(initial?.slogan ?? '');
  const [hashtag, setHashtag] = useState(initial?.hashtag ?? '');
  const [corner, setCorner] = useState<StampCorner>(initial?.corner ?? 'bottom-right');
  const [width, setWidth] = useState(initial?.width ?? 0.3);
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '');
  const [stamp, setStamp] = useState<string | null>(null);
  const [keyVisual, setKeyVisual] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stampInput = useRef<HTMLInputElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined, set: (value: string) => void) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8_000_000) { setError(t('Use a PNG, JPEG or WebP image up to 8 MB.', 'استخدم صورة PNG أو JPEG أو WebP حتى 8 ميجابايت.')); return; }
    setError(''); set(await asDataUrl(file));
  };
  const save = async () => {
    if (name.trim().length < 2) { setError(t('Give the campaign a name.', 'اكتب اسم الحملة.')); return; }
    setBusy(true); setError('');
    const body = { name, slogan, hashtag, corner, width, startsOn: startsOn || null, endsOn: endsOn || null, ...(stamp ? { stamp } : {}), ...(keyVisual ? { keyVisual } : {}) };
    try { await api(initial ? `/api/campaigns/${initial.id}` : '/api/campaigns', { method: initial ? 'PATCH' : 'POST', body }); onSaved(); }
    catch (reason) { setError(errorMessage(reason, t('Could not save.', 'تعذّر الحفظ.'))); }
    setBusy(false);
  };
  const shownStamp = stamp ?? initial?.stampUrl ?? null;
  return <div className="campaign-form glass">
    <div className="campaign-form__fields">
      <label className="ui-field"><span className="ui-field__label">{t('Campaign name', 'اسم الحملة')}</span><input className="ui-input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. White Friday', 'مثال: الجمعة البيضاء')} /></label>
      <label className="ui-field"><span className="ui-field__label">{t('Slogan', 'الشعار النصي (السلوجان)')}</span><input className="ui-input" dir="auto" value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder={t('e.g. A Friday that changes your path', 'مثال: جمعة تغير مسارك')} /><span className="ui-field__hint">{t('The AI writes the post around it, word for word.', 'الذكاء الاصطناعي يكتب المنشور حوله، بنفس كلماته.')}</span></label>
      <label className="ui-field"><span className="ui-field__label">{t('Hashtag', 'الهاشتاج')}</span><input className="ui-input" dir="auto" value={hashtag} onChange={(e) => setHashtag(e.target.value)} placeholder="#جمعة_تغير_مسارك" /><span className="ui-field__hint">{t('Added to every caption of the campaign.', 'يُضاف لكل نصوص منشورات الحملة.')}</span></label>
      <div className="campaign-form__row">
        <label className="ui-field"><span className="ui-field__label">{t('Starts', 'تبدأ')}</span><input className="ui-input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></label>
        <label className="ui-field"><span className="ui-field__label">{t('Ends', 'تنتهي')}</span><input className="ui-input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></label>
      </div>
      <div className="campaign-form__uploads">
        <input ref={stampInput} hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={(e) => void pick(e.target.files?.[0], setStamp)} />
        <input ref={keyInput} hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={(e) => void pick(e.target.files?.[0], setKeyVisual)} />
        <button type="button" className="campaign-drop" onClick={() => stampInput.current?.click()}>
          {shownStamp ? <img src={shownStamp} alt="" /> : <ImagePlus size={20} />}
          <b>{t('Slogan stamp', 'ملف الشعار (الستامب)')}</b>
          <small>{t('Transparent PNG of the lockup, e.g. the hashtag sticker. Placed exactly as uploaded on every AI design.', 'PNG شفاف للشعار، زي ستيكر الهاشتاج. يُوضع كما هو على كل تصميم بالذكاء الاصطناعي.')}</small>
        </button>
        <button type="button" className="campaign-drop" onClick={() => keyInput.current?.click()}>
          {keyVisual ?? initial?.keyVisualUrl ? <img src={(keyVisual ?? initial?.keyVisualUrl)!} alt="" /> : <ImagePlus size={20} />}
          <b>{t('Key visual (optional)', 'التصميم الرئيسي للحملة (اختياري)')}</b>
          <small>{t('The campaign look. The AI uses it as a style reference, not as a copy.', 'شكل الحملة. الذكاء الاصطناعي يستخدمه كمرجع للأسلوب، مش للنسخ.')}</small>
        </button>
      </div>
    </div>
    <div className="campaign-form__side">
      <StampPreview stamp={shownStamp} corner={corner} width={width} />
      <label className="ui-field"><span className="ui-field__label">{t('Preferred corner', 'الركن المفضل')}</span><select className="ui-input" value={corner} onChange={(e) => setCorner(e.target.value as StampCorner)}>{CORNERS.map((c) => <option key={c.value} value={c.value}>{t(c.en, c.ar)}</option>)}</select><span className="ui-field__hint">{t('If text or the logo is there, the stamp moves to a free corner.', 'لو فيه نص أو اللوجو، الشعار ينتقل لركن فاضي.')}</span></label>
      <label className="ui-field"><span className="ui-field__label">{t('Size', 'الحجم')} <b className="u-tnum">{Math.round(width * 100)}%</b></span><input type="range" min={0.12} max={0.5} step={0.01} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
    </div>
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    <div className="u-row"><Button variant="primary" busy={busy} onClick={() => void save()}>{t('Save campaign', 'احفظ الحملة')}</Button><Button variant="ghost" onClick={onCancel}>{t('Cancel', 'إلغاء')}</Button></div>
  </div>;
}

/** Library section where marketing keeps each campaign's identity. */
export function CampaignsPanel() {
  const { t, date } = useI18n();
  const { campaigns, error, reload } = useCampaigns();
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const setStatus = async (campaign: Campaign, status: Campaign['status']) => { await api(`/api/campaigns/${campaign.id}`, { method: 'PATCH', body: { status } }).catch(() => {}); void reload(); };
  const running = campaigns ? runningCampaign(campaigns) : null;
  return <section className="library-section">
    <div className="library-section__head">
      <h2><Megaphone size={18} /> {t('Campaign identities', 'هوية الحملات')}</h2>
      {!editing && <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setEditing('new')}>{t('New campaign', 'حملة جديدة')}</Button>}
    </div>
    <p className="u-sm u-muted">{t('Each campaign keeps its slogan, hashtag and stamp. Pick the campaign when designing with AI: the copy follows the slogan and the exact stamp is placed on the design.', 'كل حملة ليها سلوجان وهاشتاج وشعار. اختار الحملة وإنت بتصمم بالذكاء الاصطناعي: النص يتكتب حوالين السلوجان، والشعار يتحط على التصميم كما هو بالظبط.')}</p>
    {editing && <CampaignForm initial={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    {campaigns && !campaigns.length && !editing && <div className="library-empty glass"><Megaphone size={20} /><p>{t('No campaigns yet. Add the first one with its slogan stamp.', 'لا توجد حملات بعد. أضف أول حملة بشعارها.')}</p></div>}
    {campaigns && campaigns.length > 0 && <div className="campaign-grid">{campaigns.map((c) => <article key={c.id} className="campaign-card glass" data-archived={c.status === 'archived' || undefined}>
      <div className="campaign-card__stamp">{c.stampUrl ? <img src={c.stampUrl} alt="" /> : <small className="u-muted">{t('No stamp yet', 'بدون شعار')}</small>}</div>
      <div className="campaign-card__body">
        <b dir="auto">{c.name}</b>
        {c.slogan && <span dir="auto">«{c.slogan}»</span>}
        {c.hashtag && <small dir="auto">{c.hashtag}</small>}
        <small className="u-muted">{c.startsOn || c.endsOn ? `${c.startsOn ? date(c.startsOn, 'dayShort') : '…'} – ${c.endsOn ? date(c.endsOn, 'dayShort') : '…'}` : t('No dates', 'بدون تواريخ')}{running?.id === c.id ? ` · ${t('Running now', 'شغالة الآن')}` : ''}{c.status === 'archived' ? ` · ${t('Archived', 'مؤرشفة')}` : ''}</small>
      </div>
      <div className="campaign-card__actions">
        <Button size="sm" onClick={() => setEditing(c)}>{t('Edit', 'تعديل')}</Button>
        {c.status === 'active' ? <Button size="sm" variant="ghost" icon={<Archive size={14} />} onClick={() => void setStatus(c, 'archived')}>{t('Archive', 'أرشفة')}</Button> : <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => void setStatus(c, 'active')}>{t('Restore', 'استرجاع')}</Button>}
      </div>
    </article>)}</div>}
  </section>;
}

/** Picks the campaign for an AI design; defaults to the one running today. `value` '' means no campaign. */
export function CampaignPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const { t } = useI18n();
  const { campaigns } = useCampaigns();
  const active = (campaigns ?? []).filter((c) => c.status === 'active');
  useEffect(() => {
    if (value !== null || !campaigns) return;
    onChange(runningCampaign(campaigns)?.id ?? '');
  }, [campaigns, value, onChange]);
  if (!active.length) return null;
  const chosen = active.find((c) => c.id === value);
  return <div className="campaign-picker">
    <label className="ui-field"><span className="ui-field__label"><Megaphone size={14} /> {t('Campaign', 'الحملة')}</span>
      <select className="ui-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('No campaign', 'بدون حملة')}</option>
        {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
    {chosen && <div className="campaign-picker__chosen">{chosen.stampUrl && <img src={chosen.stampUrl} alt="" />}<small>{[chosen.slogan && `«${chosen.slogan}»`, chosen.hashtag].filter(Boolean).join(' · ')}{chosen.stampUrl ? ` · ${t('the stamp is placed on the design', 'الشعار يتحط على التصميم')}` : ''}</small></div>}
  </div>;
}
