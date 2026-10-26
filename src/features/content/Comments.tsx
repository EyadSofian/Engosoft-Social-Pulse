import { useState, type ReactNode } from 'react';
import { Textarea } from '../../components/forms/Field';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { parseTimestamp } from '../../lib/format';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useAct } from '../workspace/hooks';
import { userById } from '../workspace/selectors';

/** Highlights "@Name" mentions inside a comment. */
function withMentions(body: string): ReactNode[] {
  return body.split(/(@[\p{L}.]+)/gu).map((part, index) => (part.startsWith('@') ? <b key={index} className="mention">{part}</b> : part));
}

/** Discussion on a content item or a task. "@Mariam" notifies Mariam. */
export function Comments({ entity, now }: { entity: { kind: 'content' | 'task'; id: string }; now: number }) {
  const { t, relative } = useI18n();
  const { state, addComment } = useWorkspace();
  const act = useAct();
  const [draft, setDraft] = useState('');
  const list = state.comments.filter((comment) => comment.entity.kind === entity.kind && comment.entity.id === entity.id).sort((a, b) => parseTimestamp(a.createdAt) - parseTimestamp(b.createdAt));

  const post = () => {
    if (act(addComment(entity, draft))) setDraft('');
  };

  return (
    <div className="u-stack">
      {list.length === 0 ? (
        <p className="u-sm u-muted">{t('No comments yet. Questions and decisions belong here, not in chat.', 'لا تعليقات بعد. الأسئلة والقرارات مكانها هنا، لا في المحادثات.')}</p>
      ) : (
        <ul className="comments">
          {list.map((comment) => {
            const author = userById(state, comment.authorId);
            return (
              <li key={comment.id} className="comment">
                <Avatar name={author?.name ?? '?'} size={28} />
                <div className="comment__body">
                  <p className="comment__meta">
                    <b>{author?.name ?? '—'}</b> <span className="u-subtle">· {relative(comment.createdAt, now)}</span>
                  </p>
                  <p dir="auto">{withMentions(comment.body)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          post();
        }}
      >
        <Textarea
          rows={2}
          value={draft}
          dir="auto"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) post();
          }}
          placeholder={t('Write a comment — type @ and a first name to mention someone', 'اكتب تعليقًا — اكتب @ واسمًا أول للإشارة إلى شخص')}
          aria-label={t('Comment', 'تعليق')}
        />
        <Button type="submit" size="sm" variant="primary" disabled={!draft.trim()}>
          {t('Comment', 'تعليق')}
        </Button>
      </form>
    </div>
  );
}
