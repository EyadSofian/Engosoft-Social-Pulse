import type { ReactNode } from 'react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { DataNotice, EmptyState, SkeletonRows } from './States';

/** Loading / offline / not-connected handling shared by every live block. */
export function LiveGate({ children, needs }: { children: ReactNode; needs?: 'posts' }) {
  const { t } = useI18n();
  const { store } = useLiveData();
  if (store.phase === 'loading') return <SkeletonRows rows={3} />;
  if (store.phase === 'offline') return <DataNotice status="error" message={store.staleError || t('The Mobde3 API did not respond.', 'واجهة مبدع لم تستجب.')} onRetry={() => void store.reload()} />;
  if (needs === 'posts' && !store.data.posts.length) {
    const connected = store.data.connectors.some((connector) => connector.status === 'connected');
    return connected ? (
      <EmptyState compact title={t('Connected sources returned no posts yet.', 'المصادر المتصلة لم ترجع منشورات بعد.')} text={t('Run a sync from Connections.', 'شغّل المزامنة من صفحة الربط.')} />
    ) : (
      <DataNotice status="needs_setup" message={t('Connect a platform to see performance.', 'اربط منصة لعرض الأداء.')} setupHref="/connections" />
    );
  }
  return (
    <>
      {store.staleError && <DataNotice status="stale" message={store.staleError} onRetry={() => void store.reload()} />}
      {children}
    </>
  );
}
