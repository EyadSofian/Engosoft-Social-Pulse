import { useCallback } from 'react';
import { useToast } from '../../components/feedback/Toast';
import { useI18n } from '../../i18n/I18nProvider';
import { useNow } from '../../hooks/ui';
import type { ActionError, Result } from './actions';

/** "Now" for workflow screens: due buckets and countdowns refresh every minute. */
export const useClock = () => useNow(60_000);

const ERRORS: Record<ActionError, [string, string]> = {
  not_found: ['That record no longer exists.', 'هذا السجل لم يعد موجودًا.'],
  permission: ['Your role does not allow this action.', 'دورك لا يسمح بهذا الإجراء.'],
  ownership: ['Only the owner, the assignee or Marketing can change this item.', 'يغيّر هذا العنصر مالكه أو المسند إليه أو التسويق فقط.'],
  invalid: ['That change is not possible from the current state.', 'هذا التغيير غير ممكن من الحالة الحالية.'],
  live: ['Calendar plans are edited in the Calendar.', 'خطط التقويم تُعدّل من صفحة التقويم.'],
  note_required: ['Add a note explaining the decision.', 'أضف ملاحظة توضح القرار.'],
  time_required: ['Choose a publishing date and time.', 'اختر تاريخ ووقت النشر.'],
  proof_required: ['Paste the published post link as proof.', 'الصق رابط البوست المنشور كدليل.'],
  title_required: ['Give it a title.', 'أضف عنوانًا.'],
};

/** Runs a workspace operation and reports the outcome; returns whether it applied. */
export function useAct() {
  const toast = useToast();
  const { t } = useI18n();
  return useCallback(
    (result: Result, success?: string, detail?: string) => {
      if (!result.ok) {
        const [en, ar] = ERRORS[result.error];
        toast.error(t('Not applied', 'لم يتم التنفيذ'), t(en, ar));
        return false;
      }
      if (success) toast.success(success, detail);
      return true;
    },
    [toast, t],
  );
}

export const actionErrorText = (error: ActionError, t: (en: string, ar: string) => string) => t(...ERRORS[error]);
