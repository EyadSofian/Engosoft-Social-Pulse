import { ArrowDownRight, ArrowUpRight, Users } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { dateFromKey } from '../../lib/format';
import { basisLabel, DEMOGRAPHIC_KEYS, DEMOGRAPHIC_LABEL, shares, sliceLabel, type AudienceAccount, type PlatformAudience } from './audience';

/** Followers on each platform and how they moved over the period, then who the audience is where the platform says. */
export function AudienceSection({ audience }: { audience: PlatformAudience[] }) {
  const { t } = useI18n();
  const withDemographics = audience.flatMap((row) => row.accounts.filter((account) => account.demographics));
  return (
    <Card>
      <CardHeader title={t('Audience', 'الجمهور')} description={t('Followers on each platform, and who they are where the platform shares it.', 'المتابعين على كل منصة، ومين هما لو المنصة بتقول.')} />
      <CardBody>
        {audience.length ? (
          <div className="u-stack">
            <ul className="an-aud-grid">
              {audience.map((row) => (
                <li key={row.platform}>
                  <PlatformTile row={row} />
                </li>
              ))}
            </ul>
            {withDemographics.length > 0 && (
              <div className="an-demo-list">
                {withDemographics.map((account) => (
                  <Demographics key={`${account.platform}:${account.accountId}`} account={account} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState compact icon={<Users size={22} />} title={t('No audience numbers yet.', 'لسه مفيش أرقام للجمهور.')} text={t('They are read with every sync and appear here after the next one.', 'بتتقري مع كل مزامنة وهتظهر هنا بعد المزامنة الجاية.')} />
        )}
      </CardBody>
    </Card>
  );
}

function PlatformTile({ row }: { row: PlatformAudience }) {
  const { t, num, compact, date } = useI18n();
  const up = (row.change ?? 0) >= 0;
  return (
    <article className="an-aud">
      <header className="an-aud__head">
        <ChannelIcon channel={row.platform} size={16} />
        <h3>{channelName[row.platform]}</h3>
      </header>
      <p className="an-aud__value u-tnum" title={row.followers == null ? undefined : num(row.followers)}>
        {row.followers == null ? '—' : compact(row.followers)}
      </p>
      <p className="an-aud__label">{row.platform === 'youtube' ? t('Subscribers', 'المشتركين') : t('Followers', 'المتابعين')}</p>
      {row.followers == null ? (
        <p className="an-change">{t('Not reported by the platform', 'المنصة مش بترجع الرقم ده')}</p>
      ) : row.change == null ? (
        <p className="an-change">{t('Change shows from the next day', 'التغيير هيظهر من اليوم اللي بعده')}</p>
      ) : (
        <p className={`an-change an-change--${row.change === 0 ? 'flat' : up ? 'up' : 'down'}`}>
          {row.change === 0 ? null : up ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
          <bdi dir="ltr">{`${row.change > 0 ? '+' : row.change < 0 ? '−' : ''}${num(Math.abs(row.change))}`}</bdi>
          <small>{t(`since ${date(dateFromKey(row.since!).toMillis(), 'dayShort')}`, `من ${date(dateFromKey(row.since!).toMillis(), 'dayShort')}`)}</small>
        </p>
      )}
      {row.accounts.length > 1 && (
        <ul className="an-aud__accounts">
          {row.accounts.map((account) => (
            <li key={account.accountId}>
              <span className="u-truncate">{account.accountName}</span>
              <b className="u-tnum">{account.followers == null ? '—' : compact(account.followers)}</b>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Demographics({ account }: { account: AudienceAccount }) {
  const { t, tx, lang, pct } = useI18n();
  const data = account.demographics!;
  const groups = DEMOGRAPHIC_KEYS.map((key) => ({ key, slices: shares(data[key], key) })).filter((group) => group.slices.length);
  return (
    <section className="an-demo">
      <header className="an-demo__head">
        <ChannelIcon channel={account.platform} size={15} />
        <h3>
          {channelName[account.platform]} · {account.accountName}
        </h3>
        <span className="an-demo__basis">{tx(basisLabel(data))}</span>
      </header>
      <div className="an-demo__groups">
        {groups.map((group) => (
          <div key={group.key} className="an-demo__group">
            <h4>{tx(DEMOGRAPHIC_LABEL[group.key])}</h4>
            <ul>
              {group.slices.map((slice) => (
                <li key={slice.key}>
                  <span className="an-demo__label" dir={group.key === 'age' || group.key === 'companySize' ? 'ltr' : undefined} title={sliceLabel(group.key, slice.key, lang)}>
                    {sliceLabel(group.key, slice.key, lang)}
                  </span>
                  <b className="u-tnum">{pct(slice.value, 0)}</b>
                  <span className="an-time__bar" aria-hidden>
                    <i style={{ inlineSize: `${slice.value}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {groups.length === 0 && <p className="u-muted u-sm">{t('No breakdown returned yet.', 'لسه مفيش تقسيم راجع.')}</p>}
    </section>
  );
}
