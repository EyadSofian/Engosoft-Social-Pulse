import { Check } from 'lucide-react';
import { brandKit, kitFile, type BrandKitId } from '../../domain/brand-kits';
import { useI18n } from '../../i18n/I18nProvider';

const LOGO_CHOICES: { kit: BrandKitId; label: [string, string] }[] = [
  { kit: 'official', label: ['New logo', 'اللوجو الجديد'] },
  { kit: 'engo-soft-old', label: ['Old logo', 'اللوجو القديم'] },
];

/**
 * Which Engosoft logo goes on the design: placed from its own file on every size, never drawn by the AI. `own` marks
 * the logo the chosen design already carries, so the person sees which pick keeps the design as it is.
 */
export function LogoChoice({ value, onChange, own, disabled }: { value: BrandKitId; onChange: (kit: BrandKitId) => void; own?: BrandKitId; disabled?: boolean }) {
  const { t } = useI18n();
  return <div className="create-logo">
    <span className="u-xs u-muted">{t('Logo on the design (placed from its file on every size):', 'اللوجو على التصميم (بيتحط من الملف نفسه في كل المقاسات):')}</span>
    <div className="create-logo__options" role="radiogroup" aria-label={t('Logo', 'اللوجو')}>
      {LOGO_CHOICES.map((choice) => <button key={choice.kit} type="button" role="radio" aria-checked={value === choice.kit} disabled={disabled} onClick={() => onChange(choice.kit)}>
        <span className="create-logo__mark"><img src={kitFile(brandKit(choice.kit), { onDark: true }).src} alt="" /></span>
        <span>{t(...choice.label)}{own === choice.kit && <small className="create-logo__own">{t('as in the design', 'زي التصميم')}</small>}</span>
        {value === choice.kit && <Check size={14} strokeWidth={3} className="create-logo__check" />}
      </button>)}
    </div>
  </div>;
}
