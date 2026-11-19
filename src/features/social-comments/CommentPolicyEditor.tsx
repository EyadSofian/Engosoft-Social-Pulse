import { useEffect, useState } from 'react';
import { Field, Input, Select, Textarea } from '../../components/forms/Field';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { commentModes, type CommentMode, type CommentPolicy, type CommentSettings } from '../../domain/social-comments';

export const commentAccountPath = (platform: string, accountId: string) => `/api/social/comments/${platform}/${encodeURIComponent(accountId)}`;
export const policyLabel = (mode: CommentMode, t: (en: string, ar: string) => string) => ({
  manual: t('Manual replies', 'رد يدوي'),
  assist: t('AI suggestions', 'اقتراحات بالذكاء الاصطناعي'),
  automatic: t('Automatic replies', 'رد تلقائي'),
})[mode];

export function CommentPolicyEditor({ path, settings, onSave, post = false }: {
  path: string; settings: CommentSettings; onSave: (value: CommentSettings) => void; post?: boolean;
}) {
  const { t } = useI18n();
  const initial = settings.policy ?? (post ? null : settings.accountPolicy);
  const [policy, setPolicy] = useState<CommentPolicy | null>(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const automaticUnavailable = !settings.authorized || !settings.aiReady || !settings.webhookConfigured;
  const invalid = policy?.mode === 'automatic' && (automaticUnavailable || !policy.faqs.length)
    || policy?.faqs.some(faq => !faq.question.trim() || !faq.answer.trim());
  const changed = JSON.stringify(policy) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const updated = await api<CommentSettings>(path, { method: 'PATCH', body: post ? { policy } : policy });
      setPolicy(updated.policy ?? (post ? null : updated.accountPolicy));
      onSave(updated);
      setNotice(t('Saved.', 'تم الحفظ.'));
    } catch (err) {
      setError(errorMessage(err, t('Could not save the reply settings.', 'تعذّر حفظ إعدادات الرد.')));
    } finally { setSaving(false); }
  };

  return <div className="u-stack u-stack--sm social-comments__settings">
    <Field label={post ? t('Reply mode for this post', 'وضع الرد لهذا المنشور') : t('Default reply mode for this account', 'وضع الرد الافتراضي للحساب')}>
      {id => <Select id={id} value={policy?.mode ?? 'inherit'} disabled={saving} onChange={event => {
        const mode = event.target.value as CommentMode | 'inherit';
        setNotice('');
        setPolicy(mode === 'inherit' ? null : { mode, faqs: policy?.faqs ?? settings.accountPolicy.faqs });
      }}>
        {post && <option value="inherit">{t('Use the account setting', 'استخدم إعداد الحساب')} · {policyLabel(settings.accountPolicy.mode, t)}</option>}
        {commentModes.map(mode => <option key={mode} value={mode}>{policyLabel(mode, t)}</option>)}
      </Select>}
    </Field>
    {policy && policy.mode !== 'manual' && <>
      {policy.mode === 'automatic' && <p className="u-sm">
        {t('AI matches new comments to your approved questions and posts the corresponding answer. Other comments are flagged for review.', 'الذكاء الاصطناعي يطابق التعليقات الجديدة مع الأسئلة المعتمدة وينشر الإجابة المقابلة. باقي التعليقات بتظهر للمراجعة.')}
      </p>}
      {policy.mode === 'automatic' && automaticUnavailable && <p className="u-sm" role="status">
        {t('Automatic sending requires comment authorization, OpenAI and the Meta webhook.', 'الرد التلقائي يحتاج تفويض التعليقات وإعداد OpenAI وWebhook من Meta.')}
      </p>}
      {policy.faqs.map((faq, index) => {
        const change = (field: 'question' | 'answer', value: string) => setPolicy({ ...policy, faqs: policy.faqs.map((item, i) => i === index ? { ...item, [field]: value } : item) });
        return <div className="social-comments__faq u-stack u-stack--xs" key={index}>
          <Field label={t('Frequently asked question', 'السؤال المتكرر')}>
            {id => <Input id={id} value={faq.question} dir="auto" maxLength={300} disabled={saving} onChange={e => change('question', e.target.value)} />}
          </Field>
          <Field label={t('Approved public answer', 'الإجابة المعتمدة للنشر')}>
            {id => <Textarea id={id} value={faq.answer} dir="auto" rows={2} maxLength={600} disabled={saving} onChange={e => change('answer', e.target.value)} />}
          </Field>
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => setPolicy({ ...policy, faqs: policy.faqs.filter((_, i) => i !== index) })}>
            {t('Remove question', 'احذف السؤال')}
          </Button>
        </div>;
      })}
      <div><Button size="sm" disabled={saving || policy.faqs.length >= 8} onClick={() => setPolicy({ ...policy, faqs: [...policy.faqs, { question: '', answer: '' }] })}>{t('Add an approved answer', 'أضف إجابة معتمدة')}</Button></div>
    </>}
    <div className="u-row u-row--wrap">
      <Button size="sm" variant="primary" busy={saving} disabled={!changed || Boolean(invalid)} onClick={() => void save()}>{t('Save reply settings', 'احفظ إعدادات الرد')}</Button>
      {notice && <small role="status">{notice}</small>}
    </div>
    {error && <p role="alert" className="u-sm">{error}</p>}
  </div>;
}

export function AccountCommentSettings({ platform, id }: { platform: string; id: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CommentSettings>();
  const [error, setError] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscriptionNotice, setSubscriptionNotice] = useState('');
  const accountPath = commentAccountPath(platform, id);
  const path = accountPath + '/settings';
  const subscribe = async () => {
    setSubscribing(true); setSubscriptionNotice('');
    try {
      await api(accountPath + '/subscription', { method: 'POST' });
      setSubscriptionNotice(t('Page subscribed to Meta updates.', 'تم اشتراك الصفحة في إشعارات Meta.'));
    } catch (err) { setSubscriptionNotice(errorMessage(err, t('Could not subscribe this account.', 'تعذّر تفعيل الإشعارات لهذا الحساب.'))); }
    finally { setSubscribing(false); }
  };
  useEffect(() => {
    if (!open) return;
    let active = true;
    void api<CommentSettings>(path).then(value => { if (active) setSettings(value); }, err => {
      if (active) setError(errorMessage(err, t('Could not load reply settings.', 'تعذّر تحميل إعدادات الرد.')));
    });
    return () => { active = false; };
  }, [open, path, t]);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('Comment reply settings', 'إعدادات الرد على التعليقات')}</summary>
    {open && (settings ? <>
      {!settings.authorized && <p className="u-sm">{t('Authorize comments for this account to read and send replies.', 'فوّض التعليقات لهذا الحساب عشان تقدر تقراها وترد عليها.')}</p>}
      {settings.authorized && settings.webhookConfigured && <div className="u-row u-row--wrap">
        <Button size="sm" busy={subscribing} onClick={() => void subscribe()}>{t('Subscribe to comment updates', 'فعّل استقبال التعليقات الجديدة')}</Button>
        {subscriptionNotice && <small role="status">{subscriptionNotice}</small>}
      </div>}
      <CommentPolicyEditor path={path} settings={settings} onSave={setSettings} />
    </> : <p role={error ? 'alert' : 'status'} className="u-sm">{error || t('Loading…', 'جاري التحميل…')}</p>)}
  </details>;
}
