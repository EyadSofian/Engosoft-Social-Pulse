import { SlidersHorizontal } from 'lucide-react';
import { THEME_IDS, THEME_META, type EngineSettings } from '../../domain/design-engine';
import { useI18n } from '../../i18n/I18nProvider';

type Choice<K extends keyof EngineSettings> = { value: EngineSettings[K]; en: string; ar: string };
const CREATIVITY: Choice<'creativity'>[] = [{ value: 'safe', en: 'Safe', ar: 'آمن' }, { value: 'balanced', en: 'Balanced', ar: 'متوازن' }, { value: 'experimental', en: 'Experimental', ar: 'تجريبي' }];
const IMAGE: Choice<'imageStyle'>[] = [{ value: 'auto', en: 'Auto', ar: 'تلقائي' }, { value: 'photo', en: 'Photo', ar: 'صورة' }, { value: 'graphic', en: 'Graphic', ar: 'جرافيك' }];
const DETAIL: Choice<'detail'>[] = [{ value: 'auto', en: 'Auto', ar: 'تلقائي' }, { value: 'minimal', en: 'Minimal', ar: 'بسيط' }, { value: 'detailed', en: 'Detailed', ar: 'مفصّل' }];
const REFERENCE: Choice<'referenceStrength'>[] = [{ value: 'loose', en: 'Loose', ar: 'خفيف' }, { value: 'balanced', en: 'Balanced', ar: 'متوازن' }, { value: 'strong', en: 'Strong', ar: 'قوي' }];

/** The few design controls advanced users get; leaving them on auto lets the design team decide. */
export function DesignSettings({ value, onChange }: { value: EngineSettings; onChange: (next: EngineSettings) => void }) {
  const { t } = useI18n();
  const set = <K extends keyof EngineSettings>(key: K, v: EngineSettings[K]) => onChange({ ...value, [key]: v });
  const row = <K extends keyof EngineSettings>(key: K, label: string, choices: Choice<K>[], hint: string) => (
    <div className="design-settings__row">
      <span>{label}<small>{hint}</small></span>
      <div className="design-settings__seg" role="radiogroup" aria-label={label}>
        {choices.map((c) => <button key={String(c.value)} type="button" role="radio" aria-checked={value[key] === c.value} onClick={() => set(key, c.value)}>{t(c.en, c.ar)}</button>)}
      </div>
    </div>
  );
  const changed = (Object.keys(value) as (keyof EngineSettings)[]).filter((k) => value[k] !== (k === 'creativity' || k === 'referenceStrength' ? 'balanced' : 'auto')).length;
  return (
    <details className="design-settings">
      <summary><SlidersHorizontal size={15} /> {t('Design options', 'خيارات التصميم')}{changed > 0 && <b className="u-tnum">{changed}</b>}<small>{t('optional — the design team decides by default', 'اختياري — فريق التصميم يقرر تلقائيًا')}</small></summary>
      <div className="design-settings__body">
        <label className="design-settings__row">
          <span>{t('Theme', 'الثيم')}<small>{t('for the first direction; the second stays different', 'للاتجاه الأول، والثاني يبقى مختلفًا')}</small></span>
          <select value={value.theme} onChange={(e) => set('theme', e.target.value as EngineSettings['theme'])}>
            <option value="auto">{t('Recommended by the creative director', 'يختاره المدير الإبداعي')}</option>
            <optgroup label={t('Professional', 'احترافي')}>{THEME_IDS.filter((id) => THEME_META[id].risk === 'safe').map((id) => <option key={id} value={id}>{t(THEME_META[id].en, THEME_META[id].ar)}</option>)}</optgroup>
            <optgroup label={t('Explore', 'استكشف')}>{THEME_IDS.filter((id) => THEME_META[id].risk !== 'safe').map((id) => <option key={id} value={id}>{t(THEME_META[id].en, THEME_META[id].ar)}</option>)}</optgroup>
          </select>
        </label>
        {row('creativity', t('Creativity', 'الإبداع'), CREATIVITY, t('safe follows proven Engosoft patterns', 'الآمن يلتزم بأنماط إنجوسوفت المجرَّبة'))}
        {row('imageStyle', t('Photo or graphic', 'صورة أم جرافيك'), IMAGE, '')}
        {row('detail', t('Minimal or detailed', 'بسيط أم مفصّل'), DETAIL, '')}
        {row('referenceStrength', t('Reference strength', 'قوة المراجع'), REFERENCE, t('loose = mood only, strong = closer structure', 'خفيف = الإحساس فقط، قوي = بنية أقرب'))}
      </div>
    </details>
  );
}
