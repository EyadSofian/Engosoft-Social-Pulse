import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { CalendarClock, Check, Link2, PencilLine, Trash2, Undo2 } from 'lucide-react';
import { StatePill, Thumb } from '../../components/ui/Bits';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Controls';
import { Drawer } from '../../components/ui/Overlay';
import { PlatformIcon } from '../../components/ui/Platform';
import { useToast } from '../../components/ui/Toast';
import { useApp, type PlanTarget } from '../../context';
import { accountsOf } from '../../lib/analytics';
import { errorMessage } from '../../lib/api';
import { dateFromKey, fmtDateTime, fromInputValue, parseTimestamp, toInputValue, zoneNow } from '../../lib/format';
import { contentTypes, PLATFORMS, platformColor, platformName, statusLabel } from '../../lib/platforms';
import type { PlanStatus, Platform, Post } from '../../types';

const FORM_ID = 'plan-form';
const MATCH_WINDOW_MS = 48 * 3_600_000;
const STATUSES: PlanStatus[] = ['draft', 'approved', 'scheduled', 'published', 'cancelled'];

interface FormState {
  platforms: Platform[];
  accountId: string;
  title: string;
  caption: string;
  scheduledAt: string;
  status: PlanStatus;
  permalink: string;
  externalId: string;
  owner: string;
  contentType: string;
  campaign: string;
  notes: string;
}

function initialState(target: PlanTarget, now: number): FormState {
  if (target.mode === 'edit') {
    const { plan } = target;
    return {
      platforms: [plan.platform],
      accountId: plan.accountId,
      title: plan.title,
      caption: plan.caption,
      scheduledAt: toInputValue(plan.scheduledAt),
      status: plan.status,
      permalink: plan.permalink,
      externalId: plan.externalId,
      owner: plan.owner,
      contentType: plan.contentType || 'post',
      campaign: plan.campaign,
      notes: plan.notes,
    };
  }
  const nextHour = zoneNow(now).plus({ hours: 1 }).startOf('hour');
  const base = target.day && target.day !== nextHour.toISODate() ? dateFromKey(target.day).set({ hour: 12 }) : nextHour;
  return {
    platforms: ['facebook'],
    accountId: '',
    title: '',
    caption: '',
    scheduledAt: base.toFormat("yyyy-LL-dd'T'HH:mm"),
    status: 'scheduled',
    permalink: '',
    externalId: '',
    owner: '',
    contentType: 'post',
    campaign: '',
    notes: '',
  };
}

/** `openId` changes on every open, so each one starts from a fresh form. */
export function PlanDrawer({ target, openId, onClose }: { target: PlanTarget | null; openId: number; onClose: () => void }) {
  // Keep the last target mounted while the sheet animates out.
  const last = useRef(target);
  if (target) last.current = target;
  const shown = target ?? last.current;
  return shown ? <PlanSheet key={openId} target={shown} open={target != null} onClose={onClose} /> : null;
}

function PlanSheet({ target, open, onClose }: { target: PlanTarget; open: boolean; onClose: () => void }) {
  const { data, now, store } = useApp();
  const toast = useToast();
  const editing = target.mode === 'edit' ? target.plan : null;
  const [form, setForm] = useState<FormState>(() => initialState(target, now));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((state) => ({ ...state, [key]: value }));
  const platform = form.platforms[0];
  const single = form.platforms.length === 1;
  const scheduledMs = useMemo(() => parseTimestamp(fromInputValue(form.scheduledAt) ?? ''), [form.scheduledAt]);

  const accounts = useMemo(() => {
    const known = accountsOf(data.posts, platform ?? 'all');
    if (form.accountId && !known.some((item) => item.id === form.accountId))
      known.push({ id: form.accountId, name: form.accountId, platform: platform ?? 'facebook', count: 0 });
    return known;
  }, [data.posts, platform, form.accountId]);

  const linked = useMemo<Post | undefined>(
    () => (form.externalId ? data.posts.find((post) => post.platform === platform && post.externalId === form.externalId) : undefined),
    [data.posts, platform, form.externalId],
  );

  const candidates = useMemo(() => {
    if (!single || !Number.isFinite(scheduledMs)) return [];
    return data.posts
      .filter(
        (post) =>
          post.platform === platform &&
          (!form.accountId || !post.accountId || post.accountId === form.accountId) &&
          Math.abs(post.ts - scheduledMs) <= MATCH_WINDOW_MS,
      )
      .sort((a, b) => Math.abs(a.ts - scheduledMs) - Math.abs(b.ts - scheduledMs))
      .slice(0, 4);
  }, [data.posts, platform, single, form.accountId, scheduledMs]);

  const errors = {
    title: form.title.trim() ? '' : 'اكتب عنوانًا للبوست.',
    platforms: form.platforms.length ? '' : 'اختر منصة واحدة على الأقل.',
    scheduledAt: Number.isFinite(scheduledMs) ? '' : 'حدّد موعد النشر.',
    proof: form.status === 'published' && !form.permalink.trim() && !form.externalId.trim() ? 'أضف رابط المنشور أو معرّفه لتأكيد النشر.' : '',
  };
  const invalid = Object.values(errors).some(Boolean);

  const togglePlatform = (item: Platform) => {
    if (editing) return set('platforms', [item]);
    const next = form.platforms.includes(item) ? form.platforms.filter((value) => value !== item) : [...form.platforms, item];
    setForm((state) => ({ ...state, platforms: PLATFORMS.filter((value) => next.includes(value)), accountId: '' }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const scheduledAt = fromInputValue(form.scheduledAt);
    if (invalid || !scheduledAt) return;
    setSaving(true);
    try {
      for (const item of form.platforms)
        await store.savePlan({
          ...(editing ? { id: editing.id } : {}),
          platform: item,
          accountId: single ? form.accountId.trim() : '',
          title: form.title.trim(),
          caption: form.caption,
          scheduledAt,
          status: form.status,
          permalink: form.permalink.trim(),
          externalId: form.externalId.trim(),
          owner: form.owner.trim(),
          contentType: form.contentType,
          campaign: form.campaign.trim(),
          notes: form.notes,
        });
      await store.reload();
      toast.success(
        editing ? 'تم حفظ التعديلات' : form.platforms.length > 1 ? `أُضيف البوست على ${form.platforms.length} منصات` : 'أُضيف البوست إلى الكاليندر',
        fmtDateTime(scheduledAt),
      );
      onClose();
    } catch (error) {
      void store.reload();
      toast.error('تعذّر حفظ البوست', errorMessage(error, 'حاول مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await store.deletePlan(editing.id);
      await store.reload();
      toast.success('تم حذف البوست من الكاليندر');
      onClose();
    } catch (error) {
      toast.error('تعذّر حذف البوست', errorMessage(error, 'حاول مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const linkCandidate = (post: Post) =>
    setForm((state) => ({ ...state, permalink: post.permalink, externalId: post.externalId, status: 'published' }));
  const unlink = () => setForm((state) => ({ ...state, permalink: '', externalId: '', status: state.status === 'published' ? 'scheduled' : state.status }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? 'تعديل البوست' : 'بوست جديد'}
      subtitle={editing ? <StatePill state={editing.computedState} /> : 'يُضاف إلى الخطة للمتابعة والتنبيه — لا يُنشر تلقائيًا.'}
      icon={<span className="drawer__icon">{editing ? <PencilLine size={19} /> : <CalendarClock size={19} />}</span>}
      width={580}
      footer={
        confirmDelete ? (
          <>
            <span className="drawer__confirm">حذف هذا البوست نهائيًا من الكاليندر؟</span>
            <Button variant="ghost" icon={<Undo2 size={15} />} onClick={() => setConfirmDelete(false)}>
              تراجع
            </Button>
            <Button variant="danger" icon={<Trash2 size={15} />} busy={saving} onClick={() => void remove()}>
              نعم، احذف
            </Button>
          </>
        ) : (
          <>
            {editing && (
              <Button variant="ghost" className="drawer__delete" icon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
                حذف
              </Button>
            )}
            <Button variant="glass" onClick={onClose}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit" form={FORM_ID} icon={<Check size={16} />} busy={saving}>
              {saving ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'أضف إلى الخطة'}
            </Button>
          </>
        )
      }
    >
      <form id={FORM_ID} className="form" onSubmit={(event) => void submit(event)} noValidate>
        <Field label="عنوان البوست" wide error={touched ? errors.title : ''}>
          <input
            className="input"
            data-autofocus
            value={form.title}
            maxLength={300}
            placeholder="مثلًا: إعلان دفعة أكتوبر"
            onChange={(event) => set('title', event.target.value)}
          />
        </Field>

        <div className="field field--wide" data-invalid={touched && errors.platforms ? true : undefined}>
          <span className="field__label">
            {editing ? 'المنصة' : 'المنصات'}
            {!editing && <small>اختر أكثر من منصة لإضافة بوست مستقل لكل واحدة</small>}
          </span>
          <div className="picker" role="group" aria-label="المنصات">
            {PLATFORMS.map((item) => (
              <button
                key={item}
                type="button"
                className="picker__item"
                data-active={form.platforms.includes(item)}
                aria-pressed={form.platforms.includes(item)}
                style={{ '--p': platformColor(item) } as CSSProperties}
                onClick={() => togglePlatform(item)}
              >
                <PlatformIcon platform={item} size={17} />
                <span>{platformName[item]}</span>
              </button>
            ))}
          </div>
          {touched && errors.platforms && <span className="field__error">{errors.platforms}</span>}
        </div>

        <Field label="موعد النشر" hint="بتوقيت القاهرة" error={touched ? errors.scheduledAt : ''}>
          <input className="input" type="datetime-local" dir="ltr" value={form.scheduledAt} onChange={(event) => set('scheduledAt', event.target.value)} />
        </Field>
        <Field label="الحالة">
          <Select value={form.status} onChange={(event) => set('status', event.target.value as PlanStatus)}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="نوع المحتوى">
          <Select value={form.contentType} onChange={(event) => set('contentType', event.target.value)}>
            {!contentTypes.some((type) => type.value === form.contentType) && <option value={form.contentType}>{form.contentType}</option>}
            {contentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>
        {single ? (
          <Field label="الحساب / الصفحة" hint="اختياري">
            <Select value={form.accountId} onChange={(event) => set('accountId', event.target.value)}>
              <option value="">غير محدد</option>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="الحساب / الصفحة" hint="يُحدَّد لاحقًا لكل منصة">
            <input className="input" disabled value="" placeholder="غير محدد" readOnly />
          </Field>
        )}

        <Field label="نص البوست" wide hint="اختياري">
          <textarea className="input" rows={3} value={form.caption} maxLength={5000} placeholder="النص أو وصف التصميم…" onChange={(event) => set('caption', event.target.value)} />
        </Field>

        <Field label="الحملة" hint="اختياري">
          <input className="input" value={form.campaign} maxLength={120} onChange={(event) => set('campaign', event.target.value)} />
        </Field>
        <Field label="المسؤول" hint="اختياري">
          <input className="input" value={form.owner} maxLength={120} onChange={(event) => set('owner', event.target.value)} />
        </Field>

        <fieldset className="proof" data-invalid={touched && errors.proof ? true : undefined}>
          <legend>
            <Link2 size={15} /> تأكيد النشر
          </legend>
          <p>
            يُعتبر البوست منشورًا عند مطابقة معرّف المنشور أو رابطه بدقة مع ما رُصد على المنصة — تشابه النص وحده لا يكفي.
          </p>

          {linked && (
            <div className="proof__linked">
              <Thumb src={linked.thumbnail} platform={linked.platform} />
              <span>
                <b>{linked.title}</b>
                <small>مرتبط بمنشور مرصود · {fmtDateTime(linked.ts)}</small>
              </span>
              <Button size="sm" variant="ghost" onClick={unlink}>
                فك الربط
              </Button>
            </div>
          )}

          {!linked && candidates.length > 0 && (
            <div className="proof__candidates">
              <b>منشورات مرصودة قريبة من الموعد</b>
              {candidates.map((post) => (
                <div key={post.key} className="candidate">
                  <Thumb src={post.thumbnail} platform={post.platform} />
                  <span>
                    <b>{post.title}</b>
                    <small>
                      {post.accountName} · {fmtDateTime(post.ts)}
                    </small>
                  </span>
                  <Button size="sm" onClick={() => linkCandidate(post)}>
                    هذا هو
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="form form--inner">
            <Field label="رابط المنشور الفعلي">
              <input className="input" dir="ltr" value={form.permalink} maxLength={1000} placeholder="https://" onChange={(event) => set('permalink', event.target.value)} />
            </Field>
            <Field label="معرّف المنشور">
              <input className="input" dir="ltr" value={form.externalId} maxLength={200} onChange={(event) => set('externalId', event.target.value)} />
            </Field>
          </div>
          {touched && errors.proof && <span className="field__error">{errors.proof}</span>}
        </fieldset>

        <Field label="ملاحظات" wide hint="اختياري">
          <textarea className="input" rows={2} value={form.notes} maxLength={1000} onChange={(event) => set('notes', event.target.value)} />
        </Field>
      </form>
    </Drawer>
  );
}
