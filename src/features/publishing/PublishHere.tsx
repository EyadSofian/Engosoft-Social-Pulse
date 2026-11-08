import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Link } from '../../app/router/router';
import { api, errorMessage } from '../../lib/api';
import { useI18n } from '../../i18n/I18nProvider';
import type { PipelineItem } from '../content-pipeline/types';
import { PublishComposer } from './PublishComposer';

/**
 * Publishing without leaving the page the post was made on: once a create flow has saved the post, this opens
 * the publish window (caption, accounts, now or a time) over that same page. Closing it keeps the person where
 * they were, with a link to the post if they want its full page.
 */
export function PublishHere({ contentId, onClose }: { contentId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const [item, setItem] = useState<PipelineItem | null>(null);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    setItem(null); setError(''); setFinished(false);
    if (!contentId) return;
    let live = true;
    void api<PipelineItem>(`/api/content/${contentId}`).then((loaded) => { if (live) setItem(loaded); })
      .catch((reason) => { if (live) setError(errorMessage(reason, t('Could not open the post.', 'تعذّر فتح المنشور.'))); });
    return () => { live = false; };
  }, [contentId]);
  if (!contentId) return null;
  return <>
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    {item && <PublishComposer item={item} open onClose={onClose} onDone={() => setFinished(true)} />}
    {finished && <p role="status" className="settings-notice"><CheckCircle2 size={15} /> {t('Sent. The results are in the publish window and on the post page.', 'اتبعت. النتيجة في شاشة النشر وفي صفحة المنشور.')} <Link to={`/content/${contentId}`}><ExternalLink size={13} /> {t('Open the post', 'افتح المنشور')}</Link></p>}
  </>;
}

/** A small "saved" line for flows that stay on the page: the post exists and can be opened. */
export function SavedHere({ contentId, sent }: { contentId: string | null; sent?: boolean }) {
  const { t } = useI18n();
  if (!contentId) return null;
  return <p role="status" className="settings-notice"><CheckCircle2 size={15} /> {sent ? t('Sent to the person responsible for publishing.', 'اتبعت للمسؤول عن النشر.') : t('Saved as a draft.', 'اتحفظ مسودة.')} <Link to={`/content/${contentId}`}><ExternalLink size={13} /> {t('Open the post', 'افتح المنشور')}</Link></p>;
}
