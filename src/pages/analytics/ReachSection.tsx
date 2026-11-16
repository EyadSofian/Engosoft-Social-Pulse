import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import type { Reach } from '../../types';
import type { AnalyticsModel } from './model';
import { money, REACH_KINDS, REACH_LABEL, type ReachGroup } from './reach';

/**
 * Organic posts against paid posts: how many, what they reached, and for the paid ones what the ads
 * delivered and cost. Clicking a side filters the whole page to it; clicking it again shows both.
 */
export function ReachSection({ model, onPick }: { model: AnalyticsModel; onPick: (kind: Reach | 'all') => void }) {
  const { t, tx, num, compact } = useI18n();
  const { split } = model;
  const picked = model.scope.reach;
  const hasSpend = split.paid.spend != null;
  return (
    <Card>
      <CardHeader
        title={t('Organic vs paid', 'أورجانيك وممول')}
        description={picked === 'all' ? t('Click a side to see only its posts everywhere on the page.', 'دوس على نوع علشان الصفحة كلها تعرض منشوراته بس.') : t('Click it again to see both.', 'دوس عليه تاني علشان ترجع للاتنين.')}
      />
      <CardBody>
        <div className="an-reach">
          {REACH_KINDS.map((kind) => (
            <Side key={kind} group={split[kind]} active={picked === kind} dimmed={picked !== 'all' && picked !== kind} onClick={() => onPick(picked === kind ? 'all' : kind)} />
          ))}
        </div>
      </CardBody>
      {split.platforms.length > 1 && (
        <div className="ui-table-scroll">
          <table className="ui-table an-reach-table">
            <caption className="sr-only">{t('Organic vs paid by platform', 'أورجانيك وممول حسب المنصة')}</caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>{t('Platform', 'المنصة')}</th>
                {REACH_KINDS.map((kind) => (
                  <th key={kind} scope="colgroup" colSpan={kind === 'paid' && hasSpend ? 4 : 3} className={`an-reach-table__group an-reach-table__group--${kind}`}>
                    {tx(REACH_LABEL[kind])}
                  </th>
                ))}
              </tr>
              <tr>
                {REACH_KINDS.map((kind) => [
                  <th key={`${kind}-posts`} scope="col" className="ui-table__end">{t('Posts', 'المنشورات')}</th>,
                  <th key={`${kind}-reach`} scope="col" className="ui-table__end">{t('Reach', 'الوصول')}</th>,
                  <th key={`${kind}-int`} scope="col" className="ui-table__end">{t('Interactions', 'التفاعلات')}</th>,
                  ...(kind === 'paid' && hasSpend ? [<th key="spend" scope="col" className="ui-table__end">{t('Spend', 'الصرف')}</th>] : []),
                ])}
              </tr>
            </thead>
            <tbody>
              {split.platforms.map((row) => (
                <tr key={row.platform}>
                  <td>
                    <span className="an-cell">
                      <ChannelIcon channel={row.platform} size={15} /> {channelName[row.platform]}
                    </span>
                  </td>
                  {REACH_KINDS.map((kind) => {
                    const group = row[kind];
                    return [
                      <td key={`${kind}-posts`} className="ui-table__end u-tnum">{num(group.count)}</td>,
                      <td key={`${kind}-reach`} className="ui-table__end u-tnum">{group.reachCount ? compact(group.reach) : group.viewsCount ? compact(group.views) : '—'}</td>,
                      <td key={`${kind}-int`} className="ui-table__end u-tnum">{group.measured ? compact(group.interactions) : '—'}</td>,
                      ...(kind === 'paid' && hasSpend ? [<td key="spend" className="ui-table__end u-tnum">{money(group.spend, group.currency)}</td>] : []),
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Side({ group, active, dimmed, onClick }: { group: ReachGroup; active: boolean; dimmed: boolean; onClick: () => void }) {
  const { t, tx, num, compact, pct } = useI18n();
  const figures: { label: string; value: string }[] = [
    { label: t('Posts', 'المنشورات'), value: num(group.count) },
    { label: t('Reach', 'الوصول'), value: group.reachCount ? compact(group.reach) : '—' },
    { label: t('Views', 'المشاهدات'), value: group.viewsCount ? compact(group.views) : '—' },
    { label: t('Interactions', 'التفاعلات'), value: group.measured ? compact(group.interactions) : '—' },
    { label: t('Engagement rate', 'معدل التفاعل'), value: pct(group.rate, 2) },
  ];
  if (group.kind === 'paid') {
    if (group.spend != null) figures.push({ label: t('Spend', 'الصرف'), value: money(group.spend, group.currency) });
    if (group.adReach != null) figures.push({ label: t('Reach from ads', 'الوصول من الإعلانات'), value: compact(group.adReach) });
    if (group.paidViews != null) figures.push({ label: t('Views from ads', 'المشاهدات من الإعلانات'), value: compact(group.paidViews) });
    if (group.adClicks != null) figures.push({ label: t('Ad clicks', 'نقرات الإعلان'), value: compact(group.adClicks) });
    if (group.spend != null && group.adReach) figures.push({ label: t('Cost per 1,000 reached', 'التكلفة لكل 1000 وصول'), value: money((group.spend / group.adReach) * 1000, group.currency) });
  }
  return (
    <button type="button" className={`an-reach__side an-reach__side--${group.kind}`} aria-pressed={active} data-dimmed={dimmed || undefined} onClick={onClick}>
      <span className="an-reach__title">
        <span className="an-reach__dot" aria-hidden />
        {tx(REACH_LABEL[group.kind])}
      </span>
      <dl className="an-reach__figures">
        {figures.map((figure) => (
          <div key={figure.label}>
            <dt>{figure.label}</dt>
            <dd className="u-tnum">{figure.value}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}
