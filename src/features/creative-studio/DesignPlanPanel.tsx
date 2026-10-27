import { useState, type ReactNode } from 'react';
import { Bug } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useI18n } from '../../i18n/I18nProvider';

interface DesignView {
  versions: Record<string, string>;
  engine: { version: string; skills: Record<string, string>; settings: Record<string, string>; strategy: Record<string, unknown>; references: { id: string; image: string; title: string }[] } | null;
  directions: { id: string; name: string; theme: string | null; logo: { mark: string | null; corner: string | null }; plan: { strategy: Record<string, unknown>; design: Record<string, unknown> } | null }[];
  results: { directionId: string; prompt: string; critique: Record<string, unknown> | null; repairs: unknown[]; refinements: string[]; scores: Record<string, number>; verdict: string; problems: string[] }[];
}

const Block = ({ title, value }: { title: string; value: unknown }) => (
  <details className="design-plan__block"><summary>{title}</summary><pre dir="ltr">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></details>
);

/** Developer view of how a creative was designed: idea, theme, references, every design decision, the prompt, the critic and the repairs. */
export function DesignPlanPanel({ requestId, directionId }: { requestId: string; directionId: string }) {
  const { t } = useI18n();
  const [view, setView] = useState<DesignView | null>(null);
  const [error, setError] = useState('');
  const load = () => { if (!view) void api<DesignView>(`/api/ai/runs/${requestId}/design`).then(setView).catch((e) => setError(errorMessage(e, ''))); };
  const direction = view?.directions.find((d) => d.id === directionId);
  const result = view?.results.find((r) => r.directionId === directionId);
  const design = (direction?.plan?.design ?? {}) as Record<string, unknown>;
  const s = (view?.engine?.strategy ?? {}) as Record<string, unknown>;
  let body: ReactNode = <p className="u-xs u-muted">{t('Loading…', 'جارٍ التحميل…')}</p>;
  if (error) body = <p className="u-xs creative-job__problem">{error}</p>;
  else if (view && !view.engine) body = <p className="u-xs u-muted">{t('This run used the previous engine; it has no design plan.', 'هذا التصميم من المحرك السابق ولا يحتوي خطة تصميم.')}</p>;
  else if (view) body = <>
    <Block title={t('Creative idea', 'الفكرة الإبداعية')} value={{ idea: direction?.plan?.strategy, director: s.creativeDirector, content: s.contentStrategist, hooks: s.hookWriter, copy: s.copywriter }} />
    <Block title={t('Theme', 'الثيم')} value={{ theme: direction?.theme, settings: view.engine?.settings }} />
    <Block title={t('References', 'المراجع')} value={{ retrieved: view.engine?.references, analysis: s.referenceDirector }} />
    <Block title={t('Layout', 'التخطيط')} value={{ layout: design.layoutDesigner, spacing: design.spacingDesigner }} />
    <Block title={t('Visual weight', 'الثقل البصري')} value={design.visualWeightDesigner} />
    <Block title={t('Typography', 'الطباعة')} value={design.typographyDirector} />
    <Block title={t('Image and lighting', 'الصورة والإضاءة')} value={{ image: design.imageArtDirector, lighting: design.lightingDirector, compositing: design.photoshopCompositor }} />
    <Block title={t('Colour and brand', 'اللون والهوية')} value={{ color: design.colorDirector, brand: design.brandDirector, logo: design.logoDirector }} />
    <Block title={t('Image prompt', 'أمر توليد الصورة')} value={result?.prompt ?? ''} />
    <Block title={t('Critic', 'الناقد')} value={{ verdict: result?.verdict, scores: result?.scores, critique: result?.critique, problems: result?.problems }} />
    <Block title={t('Repairs', 'الإصلاحات')} value={{ proposed: result?.repairs, applied: result?.refinements }} />
    <Block title={t('Skill versions', 'إصدارات المهارات')} value={{ ...view.versions, ...view.engine?.skills }} />
  </>;
  return (
    <details className="design-plan" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) load(); }}>
      <summary><Bug size={14} /> {t('Design plan (developers)', 'خطة التصميم (للمطورين)')}</summary>
      <div className="design-plan__body">{body}</div>
    </details>
  );
}
