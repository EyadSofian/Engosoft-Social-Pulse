import { SocialConnectionDetails, type ProviderConnection } from '../../features/publishing/SocialConnections';
import { PublishingServices } from '../../features/publishing/PublishingServices';
import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, RefreshCw } from 'lucide-react';
import { useQueryState } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { DataNotice, SkeletonRows } from '../../components/feedback/States';
import { useToast } from '../../components/feedback/Toast';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, DefinitionList } from '../../components/ui/Card';
import { PROVIDER } from '../../domain/publishing';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { accountsOf } from '../../lib/analytics';
import type { Connector, Metrics, Platform } from '../../types';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

const GUIDE: Record<Platform, { reads: [string, string]; env: string[] }> = {
  facebook: { reads: ['Page posts with text, links and dates; likes, comments, shares and reach when the token allows.', 'منشورات الصفحات ونصها وروابطها وتواريخها؛ والإعجابات والتعليقات والمشاركات والوصول حسب صلاحية التوكن.'], env: ['META_ACCESS_TOKEN', 'META_PAGE_IDS', 'META_API_VERSION'] },
  instagram: { reads: ['Professional account media with likes, comments, reach, saves and views.', 'منشورات الحساب الاحترافي مع الإعجابات والتعليقات والوصول والحفظ والمشاهدات.'], env: ['META_ACCESS_TOKEN'] },
  tiktok: { reads: ['Account videos with views, likes, comments and shares (Display API, OAuth).', 'فيديوهات الحساب مع المشاهدات والإعجابات والتعليقات والمشاركات (Display API عبر OAuth).'], env: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY'] },
  snapchat: { reads: ['Public Profile stories and Spotlight with views, reach, favourites and shares.', 'القصص والـSpotlight للملف العام مع المشاهدات والوصول والمفضلة والمشاركات.'], env: ['SNAP_PROFILE_ID', 'SNAP_PROFILE_ACCESS_TOKEN', 'SNAP_PROFILE_REFRESH_TOKEN', 'SNAP_CLIENT_ID', 'SNAP_CLIENT_SECRET'] },
  youtube: { reads: ['Channel videos, statistics and authorized Analytics reports.', 'فيديوهات القناة وإحصاءاتها وتقارير التحليلات المصرح بها.'], env: ['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REDIRECT_URI'] },
  website: { reads: ['Daily website views and per-page performance for the last 90 days (GA4).', 'مشاهدات الموقع اليومية وأداء كل صفحة لآخر 90 يومًا (GA4).'], env: ['GA4_PROPERTY_ID', 'GOOGLE_ANALYTICS_CLIENT_ID', 'GOOGLE_ANALYTICS_CLIENT_SECRET', 'GOOGLE_ANALYTICS_REFRESH_TOKEN'] },
};

const METRIC_NAMES: { key: keyof Metrics; en: string; ar: string }[] = [
  { key: 'views', en: 'Views', ar: 'المشاهدات' },
  { key: 'reach', en: 'Reach', ar: 'الوصول' },
  { key: 'impressions', en: 'Impressions', ar: 'مرات الظهور' },
  { key: 'likes', en: 'Likes', ar: 'الإعجابات' },
  { key: 'comments', en: 'Comments', ar: 'التعليقات' },
  { key: 'shares', en: 'Shares', ar: 'المشاركات' },
  { key: 'saves', en: 'Saves', ar: 'الحفظ' },
  { key: 'clicks', en: 'Clicks', ar: 'النقرات' },
];

const TIKTOK_RESULT: Record<string, ['success' | 'error', string, string]> = {
  connected: ['success', 'TikTok connected and synced.', 'تم ربط TikTok ومزامنته.'],
  sync_failed: ['error', 'TikTok connected, but the first sync failed.', 'تم ربط TikTok لكن فشلت المزامنة الأولى.'],
  denied: ['error', 'TikTok access was not granted.', 'لم يُمنح إذن الوصول إلى TikTok.'],
  failed: ['error', 'Could not complete the TikTok connection.', 'تعذّر إكمال ربط TikTok.'],
};

export function ConnectionsPage() {
  const { t } = useI18n();
  const { store, runSync } = useLiveData();
  const [social,setSocial]=useState<ProviderConnection[]>([]);
  const reloadSocial=()=>{void fetch('/api/social/connections').then(r=>r.ok?r.json():Promise.reject()).then(d=>setSocial(d.providers)).catch(()=>{});};
  useEffect(reloadSocial,[store.data.generatedAt]);
  const { can } = useWorkspace();
  const toast = useToast();
  const [query, setQuery] = useQueryState();
  const [odoo, setOdoo] = useState<{ status: string; events: unknown[]; message?: string }>({ status: 'loading', events: [] });
  useEffect(() => { void fetch('/api/odoo/schedule').then((response) => response.json()).then(setOdoo).catch(() => setOdoo({ status: 'error', events: [], message: 'تعذّر الوصول إلى Odoo API.' })); }, []);
  usePageMeta(t('Connections', 'الربط والمنصات'), [{ label: t('Connections', 'الربط والمنصات') }]);

  // The TikTok OAuth callback returns here with ?tiktok=<result>.
  const tiktok = query.get('tiktok');
  useEffect(() => {
    if (!tiktok) return;
    const result = TIKTOK_RESULT[tiktok];
    if (result) toast[result[0]](t(result[1], result[2]));
    setQuery({ tiktok: null });
  }, [tiktok, toast, t, setQuery]);

  const manage = can('connections.manage');
  return (
    <div className="u-stack u-stack--lg">
      <PageHeader
        title={t('Connections', 'الربط والمنصات')}
        description={t('Where performance data comes from. Tokens stay on the server and are never shown here.', 'من أين تأتي بيانات الأداء. التوكنات تبقى على الخادم ولا تظهر هنا أبدًا.')}
        actions={
          manage ? (
            <Button variant="primary" icon={<RefreshCw size={15} />} busy={store.syncing} disabled={store.phase !== 'ready'} onClick={() => void runSync()}>
              {store.syncing ? t('Syncing…', 'جارٍ المزامنة…') : t('Sync now', 'زامن الآن')}
            </Button>
          ) : undefined
        }
      />
      {store.phase === 'loading' ? (
        <SkeletonRows rows={5} />
      ) : store.phase === 'offline' ? (
        <DataNotice status="error" message={store.staleError} onRetry={() => void store.reload()} />
      ) : (
        <>
          {store.staleError && <DataNotice status="stale" message={store.staleError} onRetry={() => void store.reload()} />}
          <div className="connector-grid">
            {store.data.connectors.map((connector) => (
              <ConnectorCard key={connector.platform} connector={connector} manage={manage} connection={social.find(p=>p.provider===connector.platform)} onReload={()=>{reloadSocial();void store.reload();}} />
            ))}
            <FutureCard />
            <Card className="connector"><CardHeader title="Odoo" description={t('Courses and events schedule', 'مواعيد الدورات والإيفنتات')} actions={<Badge tone={odoo.status === 'connected' ? 'success' : odoo.status === 'error' ? 'danger' : 'neutral'}>{odoo.status === 'connected' ? t('Connected', 'متصل') : odoo.status === 'loading' ? t('Checking', 'جارٍ الفحص') : t('Needs setup', 'يحتاج إعداد')}</Badge>} /><CardBody><p className="u-sm">{odoo.status === 'connected' ? t(`${odoo.events.length} upcoming dates are available in the Calendar and Post Designer.`, `${odoo.events.length} موعد قادم متاح في التقويم ومصمم المنشورات.`) : odoo.message}</p><p className="u-xs u-muted" dir="ltr">ODOO_URL · ODOO_API_KEY · ODOO_DATABASE</p></CardBody></Card>
          </div>
          {manage&&<PublishingServices connections={social} onReload={reloadSocial} />}
          <p className="u-xs u-muted">{t('Automatic sync runs on the server every 30 minutes. Values a platform does not return are shown as —, never as zero.', 'المزامنة التلقائية تعمل على الخادم كل 30 دقيقة. القيم التي لا ترجعها المنصة تظهر —، وليس صفرًا.')}</p>
        </>
      )}
    </div>
  );
}

function ConnectorCard({ connector, manage, connection, onReload }: { connector: Connector; manage: boolean; connection?:ProviderConnection;onReload:()=>void }) {
  const { t, num, date, relative } = useI18n();
  const { store } = useLiveData();
  const now = useClock();
  const posts = useMemo(() => store.data.posts.filter((post) => post.platform === connector.platform), [store.data.posts, connector.platform]);
  const accounts = accountsOf(store.data.posts, connector.platform);
  const available = METRIC_NAMES.filter((metric) => posts.some((post) => post.metrics[metric.key] != null));
  const missing = METRIC_NAMES.filter((metric) => !available.includes(metric));
  const guide = GUIDE[connector.platform];
  const website = connector.platform === 'website';
  const displayStatus=connection?.accounts.length&&connection.accounts.every(a=>a.status==='disconnected')?'needs_setup':connection?.accounts.length&&!connection.accounts.some(a=>a.status==='connected')?'error':connector.status;
  const tone = displayStatus === 'connected' ? 'success' : displayStatus === 'error' ? 'danger' : 'neutral';
  const Icon = displayStatus === 'connected' ? CircleCheck : displayStatus === 'error' ? CircleAlert : CircleDashed;

  return (
    <Card className="connector">
      <CardHeader
        title={
          <span className="u-row">
            <ChannelIcon channel={connector.platform} size={18} /> {website ? t('Website (GA4)', 'الموقع (GA4)') : channelName[connector.platform]}
          </span>
        }
        description={PROVIDER[connector.platform]}
        actions={
          <Badge tone={tone} dot>
            <Icon size={12} aria-hidden /> {displayStatus === 'connected' ? connector.partial ? t('Partially connected', 'متصل جزئيًا') : t('Connected', 'متصل') : displayStatus === 'error' ? t('Error', 'خطأ') : t('Needs setup', 'يحتاج إعداد')}
          </Badge>
        }
      />
      <CardBody>
        <div className="u-stack">
          {connector.message && (
            <p className="u-sm connector__message" dir="auto" data-tone={tone}>
              {connector.message}
            </p>
          )}
          <DefinitionList
            items={[
              { label: t('Last check', 'آخر فحص'), value: connector.checkedAt ? <span title={date(connector.checkedAt, 'dateTime')}>{relative(connector.checkedAt, now)}</span> : '—' },
              { label: t('Last successful sync', 'آخر مزامنة ناجحة'), value: connector.lastSuccessAt ? relative(connector.lastSuccessAt, now) : t('— (not recorded separately yet)', '— (لا يُسجل منفصلًا بعد)') },
              ...(website
                ? [{ label: t('Days stored', 'أيام محفوظة'), value: num(store.data.website.length) }]
                : [
                    { label: t('Posts stored', 'منشورات محفوظة'), value: num(posts.length) },
                    { label: t('Accounts', 'الحسابات'), value: accounts.length ? accounts.map((account) => account.name).join(' · ') : '—' },
                  ]),
            ]}
          />
          {!website && posts.length > 0 && (
            <div className="u-stack u-stack--xs">
              <p className="u-xs u-strong">{t('Data available', 'البيانات المتاحة')}</p>
              <span className="u-row u-row--wrap">
                {available.map((metric) => (
                  <Badge key={metric.key} tone="success">
                    {t(metric.en, metric.ar)}
                  </Badge>
                ))}
              </span>
              {missing.length > 0 && (
                <>
                  <p className="u-xs u-strong">{t('Not returned by the platform', 'لا ترجعها المنصة')}</p>
                  <span className="u-row u-row--wrap">
                    {missing.map((metric) => (
                      <Badge key={metric.key}>{t(metric.en, metric.ar)}</Badge>
                    ))}
                  </span>
                </>
              )}
            </div>
          )}
          <details className="connector__guide">
            <summary>{t('What it reads and how it is set up', 'ماذا يقرأ وكيف يُعد')}</summary>
            <p className="u-sm">{t(...guide.reads)}</p>
            <p className="u-xs u-muted">{t('Server environment variables (values are never shown):', 'متغيرات بيئة الخادم (القيم لا تُعرض أبدًا):')}</p>
            <ul className="env-list">
              {guide.env.map((name) => (
                <li key={name}>
                  <code>{name}</code>
                </li>
              ))}
            </ul>
          </details>
          <SocialConnectionDetails connection={connection} manage={manage} onReload={onReload} />
        </div>
      </CardBody>
    </Card>
  );
}

function FutureCard() {
  const { t } = useI18n();
  return (
    <Card className="connector connector--future">
      <CardHeader
        title={
          <span className="u-row">
            <ChannelIcon channel="linkedin" size={18} /> LinkedIn · <ChannelIcon channel="x" size={16} /> X
          </span>
        }
        description={t('Future integration', 'ربط مستقبلي')}
        actions={<Badge>{t('Not available yet', 'غير متاح بعد')}</Badge>}
      />
      <CardBody>
        <p className="u-sm u-muted">{t('LinkedIn and X posts can be made, approved and put on the calendar today, and someone publishes them by hand. There is no connector yet, so they are not measured.', 'منشورات LinkedIn و X بتتعمل وتتعتمد وتتحط في التقويم من النهارده، وحد من الفريق بينشرها يدوي. لسه مفيش ربط، فأرقامها مش بتتقاس.')}</p>
      </CardBody>
    </Card>
  );
}
