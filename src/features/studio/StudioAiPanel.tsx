import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Info, Layers, RotateCcw, Scan, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { Box } from '../../domain/studio';
import { useI18n } from '../../i18n/I18nProvider';

/** What the last AI edit did, as the server reported it. */
export interface AiOutcome {
  understood?: string;
  applied: string[];
  warnings: string[];
  notes: string[];
  refused?: string;
  /** Background files to choose from after a two-variant region edit. */
  candidates?: string[];
  /** The background before the edit, for the before/after peek. */
  before: string;
  /** Changed the picture (costs a generation), not only layers. */
  pixels: boolean;
}

/**
 * The Studio's AI assistant: one box for any request. Text and shape changes are applied exactly to the layers;
 * picture changes are painted into the drawn area (or the area the assistant finds). Results say what changed,
 * what to check, and can be undone, compared or retried.
 */
export function StudioAiPanel({ region, selectionCount, working, outcome, baseFile, onRun, onClearRegion, onClearSelection, onPick, onUndo, onRetry, onPeek }: {
  region: Box | null;
  selectionCount: number;
  working: boolean;
  outcome: AiOutcome | null;
  baseFile: string;
  onRun: (request: string, variants: 1 | 2) => void;
  onClearRegion: () => void;
  onClearSelection: () => void;
  onPick: (file: string) => void;
  onUndo: () => void;
  onRetry: () => void;
  onPeek: (peeking: boolean) => void;
}) {
  const { t } = useI18n();
  const [request, setRequest] = useState('');
  const [variants, setVariants] = useState<1 | 2>(1);
  const examples = region
    ? [t('Remove this object', 'احذف العنصر ده'), t('Make it sharper and clearer', 'خلّيه أوضح وأحدّ'), t('Replace it with a modern laptop', 'بدّله بلابتوب حديث'), t('Add soft warm light', 'زوّد إضاءة دافية ناعمة')]
    : [t('Make the headline bigger', 'كبّر العنوان الرئيسي'), t('Make the button green', 'خلّي لون الزرار أخضر'), t('Move the text up a little', 'حرّك النص لفوق شوية'), t('Make the background a modern engineering office', 'خلّي الخلفية مكتب هندسي حديث')];
  const run = () => { if (request.trim().length >= 3 && !working) onRun(request.trim(), region ? variants : 1); };
  const target = region ? t('The area you drew', 'المنطقة التي رسمتها') : selectionCount ? t(`${selectionCount} selected layer(s)`, `${selectionCount} طبقة محددة`) : t('The whole design', 'التصميم كله');
  return (
    <aside className="studio__panel glass studio-ai">
      <section className="studio__section">
        <h3><Wand2 size={16} /> {t('AI edit assistant', 'مساعد التعديل بالذكاء الاصطناعي')}</h3>
        <p className="u-sm u-muted">{t('Say what to change. Text and shapes change exactly and instantly; only changes to the picture itself use an image edit.', 'اكتب ما تريد تغييره. النصوص والأشكال تتعدل مباشرةً وبدقة، وتعديلات الصورة نفسها فقط تستخدم توليد صورة.')}</p>
        <div className="studio-ai__target">
          <span className="studio-ai__chip" data-kind={region ? 'region' : selectionCount ? 'layers' : 'all'}>
            {region ? <Scan size={13} /> : <Layers size={13} />} {target}
            {region && <button type="button" onClick={onClearRegion} aria-label={t('Clear the area', 'امسح المنطقة')}><X size={12} /></button>}
            {!region && selectionCount > 0 && <button type="button" onClick={onClearSelection} aria-label={t('Clear the selection', 'ألغِ التحديد')}><X size={12} /></button>}
          </span>
          {!region && <small className="u-muted">{t('Draw a box on the design to limit the change to one area.', 'ارسم مربعًا على التصميم لحصر التعديل في منطقة واحدة.')}</small>}
        </div>
        <textarea className="studio__text" rows={3} dir="auto" value={request} maxLength={600} onChange={(e) => setRequest(e.target.value)}
          placeholder={region ? t('e.g. replace the tablet with a laptop', 'مثلًا: بدّل التابلت بلابتوب') : t('e.g. make the headline bigger and the button green', 'مثلًا: كبّر العنوان وخلّي الزرار أخضر')}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } }} />
        <div className="studio-ai__examples" aria-label={t('Examples', 'أمثلة')}>
          {examples.map((example) => <button key={example} type="button" onClick={() => setRequest(example)}>{example}</button>)}
        </div>
        {region && <label className="studio-ai__variants"><input type="checkbox" checked={variants === 2} onChange={(e) => setVariants(e.target.checked ? 2 : 1)} /> {t('Make two versions to choose from (double cost)', 'اعمل نسختين أختار منهم (ضعف التكلفة)')}</label>}
        <Button variant="primary" icon={<Sparkles size={15} />} disabled={request.trim().length < 3 || working} busy={working} onClick={run}>{t('Apply', 'نفّذ')} <kbd className="studio-ai__kbd">⌘↵</kbd></Button>
      </section>

      {outcome && !working && (
        <section className="studio__section studio-ai__result" aria-live="polite">
          {outcome.understood && <p className="studio-ai__understood"><Sparkles size={14} /> {outcome.understood}</p>}
          {outcome.refused && <p className="studio-ai__line" data-tone="info"><Info size={14} /> {outcome.refused}</p>}
          {outcome.applied.length > 0
            ? <ul className="studio-ai__applied">{outcome.applied.map((line, i) => <li key={i}><CheckCircle2 size={13} /> <span dir="auto">{line}</span></li>)}</ul>
            : !outcome.refused && <p className="studio-ai__line" data-tone="info"><Info size={14} /> {t('Nothing was changed. Try naming the element (the headline, the button, the person…).', 'لم يتغير شيء. جرّب تسمية العنصر (العنوان، الزرار، الشخص…).')}</p>}
          {outcome.warnings.map((line, i) => <p key={`w${i}`} className="studio-ai__line" data-tone="warning"><AlertTriangle size={14} /> <span dir="auto">{line}</span></p>)}
          {outcome.notes.map((line, i) => <p key={`n${i}`} className="studio-ai__line" data-tone="info"><Info size={14} /> <span dir="auto">{line}</span></p>)}
          {outcome.candidates && outcome.candidates.length > 1 && <div className="studio-ai__candidates" role="radiogroup" aria-label={t('Choose a version', 'اختر نسخة')}>
            {outcome.candidates.map((file, i) => <button key={file} type="button" role="radio" aria-checked={baseFile === file} onClick={() => onPick(file)}><img src={`/api/studio/${file}`} alt={t(`Version ${i + 1}`, `النسخة ${i + 1}`)} /><small>{t(`Version ${i + 1}`, `النسخة ${i + 1}`)}</small></button>)}
          </div>}
          <div className="studio-ai__actions">
            {outcome.pixels && <button type="button" className="studio__hold" onPointerDown={() => onPeek(true)} onPointerUp={() => onPeek(false)} onPointerLeave={() => onPeek(false)} onKeyDown={(e) => { if (e.key === ' ') onPeek(true); }} onKeyUp={() => onPeek(false)}><Eye size={14} /> {t('Hold: before', 'اضغط مطولًا: قبل')}</button>}
            <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={onUndo}>{t('Undo', 'تراجع')}</Button>
            <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={onRetry}>{t('Try again', 'جرّب مرة أخرى')}</Button>
          </div>
        </section>
      )}
    </aside>
  );
}
