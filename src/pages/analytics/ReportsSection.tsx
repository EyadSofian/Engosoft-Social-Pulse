import { useState, type ReactNode } from 'react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import type { Post } from '../../types';
import { PostDialog, Thumb } from './PostsSection';
import {
  hourBlockLabel,
  MIX_KEYS,
  MIX_LABEL,
  RANK_BY,
  RANK_LABEL,
  typeLabel,
  WEEKDAY_LABEL,
  type PlatformRanking,
  type RankBy,
  type Ranked,
  type Reports,
  type TimeRow,
} from './reports';

export type ReportView = 'ranking' | 'types' | 'timing' | 'mix' | 'accounts';
export const REPORT_VIEWS: ReportView[] = ['ranking', 'types', 'timing', 'mix', 'accounts'];

/**
 * One card, one report at a time: best and worst posts on each platform, content types,
 * days and hours, what people did, and accounts when there is more than one.
 */
export function ReportsSection({ reports, view, onView, onRankBy }: { reports: Reports; view: ReportView; onView: (view: ReportView) => void; onRankBy: (by: RankBy) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Post | null>(null);
  const items = [
    { value: 'ranking' as const, label: t('Best & worst', 'الأفضل والأسوأ') },
    { value: 'types' as const, label: t('Content type', 'نوع المحتوى') },
    { value: 'timing' as const, label: t('Days & hours', 'الأيام والساعات') },
    { value: 'mix' as const, label: t('Interaction type', 'نوع التفاعل') },
    ...(reports.accounts.length ? [{ value: 'accounts' as const, label: t('Accounts', 'الحسابات') }] : []),
  ];
  const shown = items.some((item) => item.value === view) ? view : 'ranking';
  return (
    <Card className="an-reports">
      <CardHeader
        title={t('Reports', 'التقارير')}
        actions={
          <div className="an-report-tabs">
            <Segmented label={t('Report', 'التقرير')} value={shown} onChange={onView} items={items} />
          </div>
        }
      />
      <CardBody>
        {shown === 'ranking' && <Ranking reports={reports} onRankBy={onRankBy} onOpen={setOpen} />}
        {shown === 'types' && <Types reports={reports} />}
        {shown === 'timing' && <Timing reports={reports} />}
        {shown === 'mix' && <Mix reports={reports} />}
        {shown === 'accounts' && <Accounts reports={reports} />}
      </CardBody>
      <PostDialog post={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

/* ── Best and worst ─────────────────────────────────────────────────── */

function Ranking({ reports, onRankBy, onOpen }: { reports: Reports; onRankBy: (by: RankBy) => void; onOpen: (post: Post) => void }) {
  const { t, tx } = useI18n();
  return (
    <div className="u-stack">
      <div className="an-rank-bar">
        <Segmented label={t('Rank by', 'رتّب حسب')} value={reports.rankBy} onChange={onRankBy} items={RANK_BY.map((by) => ({ value: by, label: tx(RANK_LABEL[by]) }))} />
      </div>
      {reports.rankings.some((row) => row.best.length) ? (
        <div className="an-rank-grid">
          {reports.rankings.map((row) => (
            <PlatformBlock key={row.platform} row={row} rankBy={reports.rankBy} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <EmptyState compact title={t('Nothing to rank yet.', 'مفيش حاجة تترتب لسه.')} text={t('Posts are ranked once they are two days old and the platform has returned their numbers.', 'المنشور بيدخل الترتيب بعد يومين من نشره ولما المنصة ترجع أرقامه.')} />
      )}
    </div>
  );
}

function PlatformBlock({ row, rankBy, onOpen }: { row: PlatformRanking; rankBy: RankBy; onOpen: (post: Post) => void }) {
  const { t, num, pct, compact } = useI18n();
  const format = (value: number) => (rankBy === 'rate' ? pct(value, 2) : compact(value));
  return (
    <section className="an-rank">
      <header className="an-rank__head">
        <ChannelIcon channel={row.platform} size={16} />
        <h3>{channelName[row.platform]}</h3>
        {row.median != null && (
          <span className="an-rank__typical">
            {t('Typical post', 'المنشور المعتاد')} <b className="u-tnum">{format(row.median)}</b>
          </span>
        )}
      </header>
      {row.best.length ? (
        <div className="an-rank__lists">
          <RankList tone="best" title={t('Best', 'الأفضل')} entries={row.best} format={format} onOpen={onOpen} />
          {row.worst.length > 0 && <RankList tone="worst" title={t('Worst', 'الأسوأ')} entries={row.worst} format={format} onOpen={onOpen} />}
        </div>
      ) : (
        <p className="u-muted u-sm">{t(`None of its ${num(row.unranked)} posts can be ranked yet.`, `مفيش منشور من الـ${num(row.unranked)} يقدر يدخل الترتيب لسه.`)}</p>
      )}
    </section>
  );
}

function RankList({ tone, title, entries, format, onOpen }: { tone: 'best' | 'worst'; title: string; entries: Ranked[]; format: (value: number) => string; onOpen: (post: Post) => void }) {
  const { t, num } = useI18n();
  return (
    <div className={`an-rank__list an-rank__list--${tone}`}>
      <h4>{title}</h4>
      <ol>
        {entries.map((entry) => (
          <li key={entry.post.key}>
            <button type="button" className="an-rank__item" onClick={() => onOpen(entry.post)}>
              <Thumb post={entry.post} />
              <span className="an-rank__text">
                <span className="an-rank__caption">
                  <bdi>{entry.post.title || t('(no caption)', '(بدون نص)')}</bdi>
                </span>
                <small className="u-muted">{entry.post.accountName || channelName[entry.post.platform]}</small>
              </span>
              <span className="an-rank__value">
                <b className="u-tnum">{format(entry.value)}</b>
                {entry.vsMedian != null && (
                  <small className="u-tnum">
                    <bdi dir="ltr">{`${num(Math.round(entry.vsMedian * 10) / 10)}×`}</bdi> {t('typical', 'المعتاد')}
                  </small>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Tables ─────────────────────────────────────────────────────────── */

function Table({ caption, head, children }: { caption: string; head: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-table-scroll">
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const End = ({ children }: { children: ReactNode }) => (
  <th scope="col" className="ui-table__end">
    {children}
  </th>
);

function Types({ reports }: { reports: Reports }) {
  const { t, tx, num, compact, pct } = useI18n();
  return (
    <Table
      caption={t('Results by content type', 'النتائج حسب نوع المحتوى')}
      head={
        <>
          <th scope="col">{t('Platform', 'المنصة')}</th>
          <th scope="col">{t('Type', 'النوع')}</th>
          <End>{t('Posts', 'المنشورات')}</End>
          <End>{t('Reach', 'الوصول')}</End>
          <End>{t('Interactions per post', 'تفاعل لكل منشور')}</End>
          <End>{t('Typical post', 'المنشور المعتاد')}</End>
          <End>{t('Engagement rate', 'معدل التفاعل')}</End>
        </>
      }
    >
      {reports.types.map((row) => (
        <tr key={`${row.platform}-${row.type}`}>
          <td>
            <span className="an-cell">
              <ChannelIcon channel={row.platform} size={15} /> {channelName[row.platform]}
            </span>
          </td>
          <td>{tx(typeLabel(row.type))}</td>
          <td className="ui-table__end u-tnum">{num(row.count)}</td>
          <td className="ui-table__end u-tnum">{row.reachCount ? compact(row.reach) : '—'}</td>
          <td className="ui-table__end u-tnum">{row.average == null ? '—' : num(Math.round(row.average))}</td>
          <td className="ui-table__end u-tnum">{row.medianInteractions == null ? '—' : num(Math.round(row.medianInteractions))}</td>
          <td className="ui-table__end u-tnum">{pct(row.rate, 2)}</td>
        </tr>
      ))}
    </Table>
  );
}

function Timing({ reports }: { reports: Reports }) {
  const { t, tx } = useI18n();
  return (
    <div className="an-timing">
      <TimeList title={t('Day of the week', 'يوم الأسبوع')} rows={reports.weekdays} label={(row) => tx(WEEKDAY_LABEL[row.key])} />
      <TimeList title={t('Time of day', 'وقت النشر')} rows={reports.hours} label={(row) => hourBlockLabel(row.key)} ltr />
    </div>
  );
}

/** One row per day or time block: the bar is interactions per post, so a busy day does not win by volume alone. */
function TimeList({ title, rows, label, ltr }: { title: string; rows: TimeRow[]; label: (row: TimeRow) => string; ltr?: boolean }) {
  const { t, num, pct } = useI18n();
  const max = Math.max(1, ...rows.map((row) => row.average ?? 0));
  return (
    <section className="an-time">
      <h3>
        {title}
        <small>{t('Interactions per post', 'تفاعل لكل منشور')}</small>
      </h3>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className={row.best ? 'is-best' : undefined}>
            <span className="an-time__label" dir={ltr ? 'ltr' : undefined}>
              {label(row)}
            </span>
            <span className="an-time__bar" aria-hidden>
              <i style={{ inlineSize: `${((row.average ?? 0) / max) * 100}%` }} />
            </span>
            <b className="u-tnum">{row.average == null ? '—' : num(Math.round(row.average))}</b>
            <small className="u-tnum">
              {t(`${num(row.count)} posts`, `${num(row.count)} منشور`)} · {pct(row.rate, 1)}
            </small>
            {row.best && <span className="an-time__tag">{t('Best', 'الأفضل')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Mix({ reports }: { reports: Reports }) {
  const { t, tx, compact, num } = useI18n();
  return (
    <Table
      caption={t('What people did on each platform', 'الناس عملت إيه على كل منصة')}
      head={
        <>
          <th scope="col">{t('Platform', 'المنصة')}</th>
          {MIX_KEYS.map((key) => (
            <End key={key}>{tx(MIX_LABEL[key])}</End>
          ))}
        </>
      }
    >
      {reports.mix.map((row) => (
        <tr key={row.platform}>
          <td>
            <span className="an-cell">
              <ChannelIcon channel={row.platform} size={15} /> {channelName[row.platform]}
            </span>
          </td>
          {MIX_KEYS.map((key) => {
            const cell = row.cells[key];
            return (
              <td key={key} className="ui-table__end u-tnum">
                {cell.total == null ? (
                  '—'
                ) : (
                  <span className="an-mix">
                    <b>{compact(cell.total)}</b>
                    {cell.rate != null && <small>{t(`${num(Math.round(cell.rate * 100) / 100)} per 100`, `${num(Math.round(cell.rate * 100) / 100)} لكل 100`)}</small>}
                  </span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </Table>
  );
}

function Accounts({ reports }: { reports: Reports }) {
  const { t, num, compact, pct } = useI18n();
  return (
    <Table
      caption={t('By account', 'حسب الحساب')}
      head={
        <>
          <th scope="col">{t('Account', 'الحساب')}</th>
          <End>{t('Posts', 'المنشورات')}</End>
          <End>{t('Reach', 'الوصول')}</End>
          <End>{t('Interactions', 'التفاعلات')}</End>
          <End>{t('Interactions per post', 'تفاعل لكل منشور')}</End>
          <End>{t('Engagement rate', 'معدل التفاعل')}</End>
        </>
      }
    >
      {reports.accounts.map((row) => (
        <tr key={row.id}>
          <td>
            <span className="an-cell">
              <ChannelIcon channel={row.platform} size={15} /> {row.name} <small className="u-muted">· {channelName[row.platform]}</small>
            </span>
          </td>
          <td className="ui-table__end u-tnum">{num(row.count)}</td>
          <td className="ui-table__end u-tnum">{row.reachCount ? compact(row.reach) : '—'}</td>
          <td className="ui-table__end u-tnum">{row.measured ? compact(row.interactions) : '—'}</td>
          <td className="ui-table__end u-tnum">{row.average == null ? '—' : num(Math.round(row.average))}</td>
          <td className="ui-table__end u-tnum">{pct(row.rate, 2)}</td>
        </tr>
      ))}
    </Table>
  );
}
