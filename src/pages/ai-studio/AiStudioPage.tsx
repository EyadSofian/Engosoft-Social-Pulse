import { useState } from 'react';
import { Clapperboard, ImageIcon, Languages, Layers3, Type } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { DataNotice, EmptyState, ProgressBar } from '../../components/feedback/States';
import { Field, Select, Textarea } from '../../components/forms/Field';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { departmentById } from '../../domain/catalog';
import type { ContentItem, PlatformVersion } from '../../domain/content';
import type { Channel } from '../../domain/shared';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useAct, useClock } from '../../features/workspace/hooks';
import { canEditContent } from '../../features/workspace/permissions';
import { creditUsage } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName, creditKindLabel } from '../../i18n/labels';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type Tab = 'text' | 'image' | 'video' | 'variations';
const LIMITS: Partial<Record<Channel, number>> = { instagram: 2200, tiktok: 2200, linkedin: 3000, facebook: 63206, snapchat: 250 };

/**
 * AI tools work on a content item, never on their own: results are saved into
 * the item and go through the same Marketing review. Generation endpoints are
 * not connected yet, so generate buttons are disabled and say why.
 */
export function AiStudioPage() {
  const { t } = useI18n();
  const { state, me } = useWorkspace();
  const [query, setQuery] = useQueryState();
  usePageMeta(t('AI Studio', 'استوديو الذكاء الاصطناعي'), [{ label: t('AI Studio', 'استوديو الذكاء الاصطناعي') }]);
  const tab = (['text', 'image', 'video', 'variations'].includes(query.get('tab') ?? '') ? query.get('tab') : 'text') as Tab;
  const editable = state.content.filter((item) => canEditContent(me, item) && !['published', 'archived', 'cancelled'].includes(item.status));
  const item = editable.find((entry) => entry.id === query.get('content')) ?? null;

  return (
    <div className="u-stack">
      <PageHeader title={t('AI Studio', 'استوديو الذكاء الاصطناعي')} description={t('Draft and adapt content for a content item. Results are saved into the item and still go through Marketing review; nothing is published automatically.', 'صياغة المحتوى وتكييفه لعنصر محتوى. النتائج تُحفظ في العنصر وتمر بمراجعة التسويق؛ لا شيء يُنشر تلقائيًا.')} />
      <Link to={item ? `/ai-studio/post-designer?content=${encodeURIComponent(item.id)}` : '/ai-studio/post-designer'} className="post-designer-entry">
        <span><strong>{t('Design a social post', 'صمّم بوست سوشيال')}</strong><small>{t('15 SVG layouts · platform sizes · GPT image backgrounds', '15 قالب SVG · مقاسات المنصات · صور GPT')}</small></span>
        <span aria-hidden>←</span>
      </Link>
      <DataNotice
        status="needs_setup"
        message={t('No AI generation endpoint is configured on the server yet, so the Generate buttons are disabled. The checks and platform versions below work without AI.', 'لم يُضبط بعد أي endpoint للتوليد بالذكاء الاصطناعي على السيرفر، لذلك أزرار التوليد معطلة. الفحوصات ونسخ المنصات بالأسفل تعمل دون ذكاء اصطناعي.')}
      />
      <div className="studio">
        <div className="u-stack">
          <Field label={t('Content item', 'عنصر المحتوى')} hint={t('Only items you can edit and that are not published.', 'العناصر التي تملك تعديلها وغير المنشورة فقط.')}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} value={item?.id ?? ''} onChange={(event) => setQuery({ content: event.target.value || null })}>
                <option value="">{t('Choose an item', 'اختر عنصرًا')}</option>
                {editable.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Tabs
            label={t('Studio tools', 'أدوات الاستوديو')}
            value={tab}
            onChange={(value) => setQuery({ tab: value === 'text' ? null : value })}
            items={[
              { value: 'text', label: t('Text', 'النص'), icon: <Type size={15} /> },
              { value: 'variations', label: t('Platform versions', 'نسخ المنصات'), icon: <Layers3 size={15} /> },
              { value: 'image', label: t('Image', 'الصور'), icon: <ImageIcon size={15} /> },
              { value: 'video', label: t('Video', 'الفيديو'), icon: <Clapperboard size={15} /> },
            ]}
          />
          {!item && (tab === 'text' || tab === 'variations') ? (
            <EmptyState title={t('Pick a content item to work on.', 'اختر عنصر محتوى للعمل عليه.')} text={t('AI Studio always works inside the workflow: choose the item first.', 'الاستوديو يعمل دائمًا داخل سير العمل: اختر العنصر أولًا.')} />
          ) : tab === 'text' ? (
            <TextTool key={item!.id} item={item!} />
          ) : tab === 'variations' ? (
            <VariationsTool key={item!.id} item={item!} />
          ) : (
            <MediaTool kind={tab} item={item} />
          )}
        </div>
        <CreditsPanel />
      </div>
    </div>
  );
}

function DisabledGenerate({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <Button variant="primary" disabled title={t('No generation endpoint configured (Admin › System › AI configuration)', 'لا يوجد endpoint للتوليد (الإدارة › النظام › إعداد الذكاء الاصطناعي)')}>
      {label}
    </Button>
  );
}

function TextTool({ item }: { item: ContentItem }) {
  const { t, tx, num, ratio } = useI18n();
  const { state, editContent } = useWorkspace();
  const act = useAct();
  const [text, setText] = useState(item.caption);
  const [operation, setOperation] = useState('rewrite');
  const template = state.templates.find((entry) => entry.id === item.templateId);
  const length = [...text].length;
  const OPS: [string, string, string][] = [
    ['generate', 'Generate a caption', 'توليد نص'],
    ['rewrite', 'Rewrite', 'إعادة صياغة'],
    ['tone', 'Adjust tone', 'تعديل النبرة'],
    ['translate', 'Arabic ⇄ English', 'عربي ⇄ إنجليزي'],
    ['cta', 'Suggest a call to action', 'اقتراح دعوة لإجراء'],
    ['adapt', 'Adapt to a platform', 'تكييف لمنصة'],
  ];
  return (
    <Card>
      <CardHeader title={t('Caption', 'النص')} description={item.title} />
      <CardBody>
        <div className="u-stack">
          <Textarea rows={9} value={text} onChange={(event) => setText(event.target.value)} dir="auto" aria-label={t('Caption', 'النص')} />
          <p className="caption-limits u-xs">
            {item.channels
              .filter((channel) => LIMITS[channel])
              .map((channel) => (
                <span key={channel} data-over={length > LIMITS[channel]! || undefined}>
                  <ChannelIcon channel={channel} size={11} /> <span className="u-tnum">{ratio(length, LIMITS[channel]!)}</span>
                </span>
              ))}
          </p>
          <div className="u-row u-row--wrap">
            <Select value={operation} onChange={(event) => setOperation(event.target.value)} aria-label={t('AI operation', 'عملية الذكاء الاصطناعي')}>
              {OPS.map(([value, en, ar]) => (
                <option key={value} value={value}>
                  {t(en, ar)}
                </option>
              ))}
            </Select>
            <DisabledGenerate label={t('Run', 'تشغيل')} />
            {template && (
              <Button variant="secondary" onClick={() => setText((value) => `${value.trimEnd()}\n\n${tx(template.cta)}`)}>
                {t('Insert template CTA', 'أدرج دعوة القالب')}
              </Button>
            )}
            <span className="u-grow" />
            <Button variant="primary" disabled={text === item.caption} onClick={() => act(editContent(item.id, { caption: text }), t('Saved to the content item', 'تم الحفظ في عنصر المحتوى'))}>
              {t('Save to item', 'احفظ في العنصر')}
            </Button>
          </div>
          {template && (
            <p className="u-xs u-muted">
              {t('Template structure', 'بنية القالب')}: {tx(template.captionStructure)}
            </p>
          )}
          <p className="u-xs u-muted">
            <Languages size={12} aria-hidden style={{ display: 'inline' }} /> {t('Arabic and English can share one caption; platform names stay in English.', 'يمكن للنص أن يجمع العربية والإنجليزية؛ أسماء المنصات تبقى بالإنجليزية.')}{' '}
            <Link to={`/content/${item.id}`} className="ui-link">
              {t('Open the item', 'افتح العنصر')}
            </Link>
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

/** Rule-based platform versions: a starting point per platform, flagged when over the platform limit. */
function VariationsTool({ item }: { item: ContentItem }) {
  const { t, num, ratio } = useI18n();
  const { editContent } = useWorkspace();
  const act = useAct();
  const existing = new Map(item.versions.map((version) => [version.channel, version]));
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(item.channels.map((channel) => [channel, existing.get(channel)?.caption ?? item.caption])));
  const save = () => {
    const versions: PlatformVersion[] = item.channels.map((channel) => ({ channel, caption: drafts[channel] ?? '', note: LIMITS[channel] && [...(drafts[channel] ?? '')].length > LIMITS[channel]! ? 'over limit' : '' }));
    act(editContent(item.id, { versions }), t('Platform versions saved', 'تم حفظ نسخ المنصات'));
  };
  return (
    <Card>
      <CardHeader title={t('Platform versions', 'نسخ المنصات')} description={t('Start from the main caption, then shorten or adjust per platform. AI variants arrive with the generation endpoint.', 'ابدأ من النص الأساسي ثم اختصر أو عدّل لكل منصة. النسخ بالذكاء الاصطناعي تأتي مع endpoint التوليد.')} actions={<DisabledGenerate label={t('Generate variants', 'توليد نسخ')} />} />
      <CardBody>
        <div className="u-stack">
          {item.channels.map((channel) => {
            const length = [...(drafts[channel] ?? '')].length;
            const limit = LIMITS[channel];
            return (
              <Field key={channel} label={<span className="u-row"><ChannelIcon channel={channel} /> {channelName[channel]}</span>} hint={limit ? ratio(length, limit) : t('No length limit', 'بدون حد للطول')} error={limit && length > limit ? t('Over the platform limit', 'أطول من حد المنصة') : undefined}>
                {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} rows={4} dir="auto" value={drafts[channel] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [channel]: event.target.value }))} />}
              </Field>
            );
          })}
          <div className="u-row">
            <Button variant="primary" onClick={save}>
              {t('Save versions to item', 'احفظ النسخ في العنصر')}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function MediaTool({ kind, item }: { kind: 'image' | 'video'; item: ContentItem | null }) {
  const { t, tx } = useI18n();
  const { state } = useWorkspace();
  const template = item ? state.templates.find((entry) => entry.id === item.templateId) : null;
  const [prompt, setPrompt] = useState('');
  const modes =
    kind === 'image'
      ? [
          ['image', 'Image', 'صورة'],
          ['poster', 'Poster', 'بوستر'],
          ['background', 'Background', 'خلفية'],
          ['template', 'Fill a saved template design', 'ملء تصميم قالب محفوظ'],
        ]
      : [
          ['educational', 'Educational video', 'فيديو تعليمي'],
          ['short', 'Social short', 'فيديو قصير'],
          ['animated', 'Animated explainer', 'فيديو موشن معلوماتي'],
          ['scenes', 'Scene generation', 'توليد مشاهد'],
          ['motion', 'Simple motion from an image', 'حركة بسيطة من صورة'],
        ];
  const [mode, setMode] = useState(modes[0][0]);
  return (
    <Card>
      <CardHeader title={kind === 'image' ? t('Image generation', 'توليد الصور') : t('Video generation', 'توليد الفيديو')} description={item ? item.title : t('Choose a content item to save results into it.', 'اختر عنصر محتوى لحفظ النتائج فيه.')} />
      <CardBody>
        <div className="u-stack">
          <div className="u-grid u-grid--2">
            <Field label={t('Type', 'النوع')}>
              {(id) => (
                <Select id={id} value={mode} onChange={(event) => setMode(event.target.value)}>
                  {modes.map(([value, en, ar]) => (
                    <option key={value} value={value}>
                      {t(en, ar)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('Format', 'المقاس')}>
              {(id) => (
                <Select id={id} defaultValue={template?.design.format ?? (kind === 'video' ? '9:16' : '1:1')}>
                  {['1:1', '4:5', '9:16', '16:9'].map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label={t('Describe what you need', 'صف ما تحتاجه')} hint={template ? `${t('Template design', 'تصميم القالب')}: ${tx(template.design.note)}` : undefined}>
            {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} rows={4} dir="auto" value={prompt} onChange={(event) => setPrompt(event.target.value)} />}
          </Field>
          <div className="u-row u-row--between">
            <span className="u-xs u-muted">{t('Uses the Engosoft palette (#0046FF, #FF6600) and the template layout when one is set.', 'يستخدم ألوان Engosoft (#0046FF و#FF6600) وتخطيط القالب إن وُجد.')}</span>
            <DisabledGenerate label={t('Generate', 'توليد')} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function CreditsPanel() {
  const { t, tx, num, pct } = useI18n();
  const { state, me, can } = useWorkspace();
  const now = useClock();
  const usage = creditUsage(state, now);
  const mine = usage.find((row) => row.departmentId === (me.departmentId ?? 'marketing'));
  return (
    <aside className="u-stack">
      <Card>
        <CardHeader title={t('AI credits', 'رصيد الذكاء الاصطناعي')} description={mine ? tx(departmentById(mine.departmentId)!.name) : undefined} />
        <CardBody>
          {mine ? (
            <div className="u-stack u-stack--sm">
              <p className="credit-big u-tnum">
                <span dir="ltr">
                  {num(mine.used)} <span className="u-muted">/ {num(mine.budget)}</span>
                </span>
              </p>
              <ProgressBar value={mine.share} tone={mine.share >= 90 ? 'danger' : mine.share >= 75 ? 'warning' : 'brand'} label={t('Credits used', 'الرصيد المستخدم')} />
              <p className="u-sm u-muted">{t(`${pct(mine.share)} used · ${num(mine.available)} available`, `${pct(mine.share)} مستخدم · ${num(mine.available)} متاح`)}</p>
              <ul className="field-list">
                {(['image', 'video', 'text'] as const).map((kind) => (
                  <li key={kind}>
                    <span>{tx(creditKindLabel[kind])}</span>
                    <span className="u-tnum">{num(mine.byKind[kind])}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="u-sm u-muted">{t('Your department has no credit wallet this month.', 'لا توجد محفظة رصيد لقسمك هذا الشهر.')}</p>
          )}
        </CardBody>
      </Card>
      {can('credits.view') && (
        <Link to="/credits" className="ui-link">
          {t('All credit usage', 'كل استخدام الرصيد')}
        </Link>
      )}
      <Badge tone="neutral">{t('Demo wallet', 'محفظة تجريبية')}</Badge>
    </aside>
  );
}
