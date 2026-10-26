import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BookUser, CornerDownLeft, FileImage, GraduationCap, Languages, Layers, LayoutTemplate, ListChecks, Megaphone, Moon, Plus, Search, Trophy, UserRound } from 'lucide-react';
import { useRouter } from '../app/router/router';
import { useCreateContent } from '../features/content/CreateContent';
import { useWorkspace } from '../features/workspace/WorkspaceProvider';
import { visibleContent } from '../features/workspace/selectors';
import { useOverlay, useTheme } from '../hooks/ui';
import { useI18n } from '../i18n/I18nProvider';
import { contentStatusLabel, taskStatusLabel } from '../i18n/labels';
import { departmentById, ROLES } from '../domain/catalog';
import { NAV_ITEMS } from './nav';
import { useShell } from './ShellContext';

interface Result {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

/** Lowercase, strip Arabic diacritics and tatweel so "مراجعه" finds "مراجعة". */
const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٟـ̀-ͯ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

const LIMIT = 6;

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useShell();

  // Cmd/Ctrl+K anywhere; "/" when not typing.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen]);

  return createPortal(<AnimatePresence>{paletteOpen && <Palette key="palette" onClose={() => setPaletteOpen(false)} />}</AnimatePresence>, document.body);
}

function Palette({ onClose }: { onClose: () => void }) {
  const { t, tx, lang, setLang } = useI18n();
  const { state, me, can } = useWorkspace();
  const { navigate } = useRouter();
  const { toggle } = useTheme();
  const create = useCreateContent();
  const ref = useOverlay(true, onClose);
  const input = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const go = (to: string) => () => {
    onClose();
    navigate(to);
  };

  const results = useMemo<Result[]>(() => {
    const q = fold(query.trim());
    const match = (...values: (string | undefined | null)[]) => !q || values.some((value) => value && fold(value).includes(q));
    const out: Result[] = [];
    const add = (group: string, items: Result[]) => out.push(...items.slice(0, q ? LIMIT : 3).map((item) => ({ ...item, group })));

    const actions: Result[] = [];
    if (can('content.create'))
      actions.push({
        key: 'a-create',
        group: '',
        label: t('Create content', 'إنشاء محتوى'),
        icon: <Plus size={15} />,
        run: () => {
          onClose();
          create.open();
        },
      });
    actions.push(
      { key: 'a-lang', group: '', label: lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية', icon: <Languages size={15} />, run: () => setLang(lang === 'ar' ? 'en' : 'ar') },
      { key: 'a-theme', group: '', label: t('Toggle dark mode', 'تبديل الوضع الداكن'), icon: <Moon size={15} />, run: toggle },
    );
    add(
      t('Actions', 'إجراءات'),
      actions.filter((item) => match(item.label)),
    );

    add(
      t('Pages', 'الصفحات'),
      NAV_ITEMS.filter((item) => item.visible(me) && match(item.label.en, item.label.ar)).map((item) => {
        const Icon = item.icon;
        return { key: `p-${item.id}`, group: '', label: tx(item.label), icon: <Icon size={15} />, run: go(item.path) };
      }),
    );

    if (!q) return out;

    add(
      t('Content', 'المحتوى'),
      visibleContent(state, me)
        .filter((item) => match(item.title, item.caption))
        .map((item) => ({ key: `c-${item.id}`, group: '', label: item.title, hint: `${tx(contentStatusLabel[item.status])} · ${tx(departmentById(item.departmentId)!.name)}`, icon: <Layers size={15} />, run: go(`/content/${item.id}`) })),
    );
    add(
      t('Tasks', 'المهام'),
      state.tasks
        .filter((task) => match(task.title, task.description))
        .map((task) => ({ key: `t-${task.id}`, group: '', label: task.title, hint: tx(taskStatusLabel[task.status]), icon: <ListChecks size={15} />, run: go(`/tasks?task=${task.id}`) })),
    );
    add(
      t('Campaigns', 'الحملات'),
      state.campaigns.filter((campaign) => match(campaign.name)).map((campaign) => ({ key: `cp-${campaign.id}`, group: '', label: campaign.name, hint: tx(departmentById(campaign.departmentId)!.name), icon: <Megaphone size={15} />, run: go(`/content?campaign=${campaign.id}`) })),
    );
    add(
      t('Templates', 'القوالب'),
      state.templates.filter((template) => match(template.name.en, template.name.ar)).map((template) => ({ key: `tp-${template.id}`, group: '', label: tx(template.name), icon: <LayoutTemplate size={15} />, run: go(`/templates/${template.id}`) })),
    );
    add(
      t('Courses', 'الكورسات'),
      state.courses.filter((course) => match(course.code, course.title, course.cohort)).map((course) => ({ key: `co-${course.id}`, group: '', label: `${course.code} — ${course.cohort}`, hint: course.title, icon: <GraduationCap size={15} />, run: go(`/calendar?course=${course.id}`) })),
    );
    add(
      t('Students', 'الطلاب'),
      state.achievements.filter((entry) => match(entry.studentName, entry.certification)).map((entry) => ({ key: `s-${entry.id}`, group: '', label: entry.studentName, hint: entry.certification, icon: <Trophy size={15} />, run: go(`/achievements?student=${entry.id}`) })),
    );
    add(
      t('Media', 'الوسائط'),
      state.assets.filter((asset) => match(asset.name, ...asset.tags)).map((asset) => ({ key: `as-${asset.id}`, group: '', label: asset.name, icon: <FileImage size={15} />, run: go(`/media?asset=${asset.id}`) })),
    );
    add(
      t('People', 'الأشخاص'),
      state.users.filter((user) => match(user.name, user.email)).map((user) => ({
        key: `u-${user.id}`,
        group: '',
        label: user.name,
        hint: tx(ROLES[user.role].name),
        icon: user.role === 'lecturer' ? <BookUser size={15} /> : <UserRound size={15} />,
        run: go(can('users.manage') ? `/admin?user=${user.id}` : `/departments/${user.departmentId ?? 'marketing'}`),
      })),
    );
    return out;
    // `go` and `create` are stable enough for a palette that lives a few seconds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, state, me, lang]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    document.getElementById(`cp-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      results[active]?.run();
    }
  };

  let lastGroup = '';
  return (
    <div className="ui-overlay ui-overlay--palette">
      <motion.div className="ui-overlay__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} />
      <motion.div
        ref={ref}
        data-overlay
        role="dialog"
        aria-modal="true"
        aria-label={t('Search Social Pulse', 'ابحث في Social Pulse')}
        tabIndex={-1}
        className="palette"
        initial={{ opacity: 0, y: -8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="palette__input">
          <Search size={17} aria-hidden />
          <input
            ref={input}
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('Search content, tasks, people, templates, students…', 'ابحث في المحتوى والمهام والأشخاص والقوالب والطلاب…')}
            role="combobox"
            aria-expanded="true"
            aria-controls="cp-list"
            aria-activedescendant={results.length ? `cp-opt-${active}` : undefined}
            aria-label={t('Search', 'بحث')}
          />
          <kbd className="ui-kbd">Esc</kbd>
        </div>
        <div className="palette__list" id="cp-list" role="listbox" aria-label={t('Results', 'النتائج')}>
          {results.length === 0 && <p className="palette__empty">{t(`Nothing matches “${query}”.`, `لا نتائج لـ «${query}».`)}</p>}
          {results.map((result, index) => {
            const heading = result.group !== lastGroup ? result.group : '';
            lastGroup = result.group;
            return (
              <div key={result.key} role="presentation">
                {heading && (
                  <p className="palette__group" role="presentation">
                    {heading}
                  </p>
                )}
                <div
                  id={`cp-opt-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className="palette__item"
                  onPointerMove={() => setActive(index)}
                  onClick={() => result.run()}
                >
                  <span className="palette__icon">{result.icon}</span>
                  <span className="palette__label u-truncate" dir="auto">
                    {result.label}
                  </span>
                  {result.hint && <span className="palette__hint u-truncate">{result.hint}</span>}
                  {index === active && <CornerDownLeft size={14} className="palette__enter" aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
