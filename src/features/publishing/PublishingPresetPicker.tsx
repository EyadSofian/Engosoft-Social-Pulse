import {
  PUBLISHING_PRESETS,
  publishingPreset,
  type OutputFormat,
} from '../../domain/output-presets';
import {
  CREATIVE_PLATFORMS,
  PLATFORM_FORMATS,
} from '../creative-studio/platforms';
import { FORMAT_LABEL } from '../svg-templates/render';
import { useI18n } from '../../i18n/I18nProvider';

export function PublishingPresetPicker({
  value,
  format,
  onChange,
  onFormatChange,
}: {
  value: string;
  format: OutputFormat;
  onChange: (id: string) => void;
  onFormatChange: (format: OutputFormat) => void;
}) {
  const { t, tx } = useI18n();
  const preset = publishingPreset(value);
  return (
    <>
      <label className="tpl-fields__field">
        {t('Platform & placement', 'المنصة ونوع النشر')}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('General size', 'مقاس عام')}</option>
          {CREATIVE_PLATFORMS.map((channel) => (
            <optgroup key={channel} label={PLATFORM_FORMATS[channel].label}>
              {PUBLISHING_PRESETS.filter((p) => p.channel === channel).map(
                (p) => (
                  <option key={p.id} value={p.id}>
                    {tx(p.name)} · {p.width}×{p.height}
                  </option>
                ),
              )}
            </optgroup>
          ))}
        </select>
      </label>
      {!value && (
        <label className="tpl-fields__field">
          {t('Size', 'المقاس')}
          <select
            value={format}
            onChange={(e) => onFormatChange(e.target.value as OutputFormat)}
          >
            {(Object.keys(FORMAT_LABEL) as OutputFormat[]).map((f) => (
              <option key={f} value={f}>
                {tx(FORMAT_LABEL[f])} · {FORMAT_LABEL[f].size}
              </option>
            ))}
          </select>
        </label>
      )}
      {preset && (
        <p className="u-xs u-muted">
          <span dir="ltr">
            {preset.width}×{preset.height}
          </span>{' '}
          ·{' '}
          {t(
            'Image / cover artwork; video is separate.',
            'صورة أو غلاف؛ الفيديو منفصل.',
          )}
        </p>
      )}
    </>
  );
}
