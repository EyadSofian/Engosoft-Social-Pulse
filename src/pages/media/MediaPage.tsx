import { useRef, useState } from 'react';
import { AudioLines, Award, Download, FileText, FileVideo, ImageIcon, LayoutTemplate, MonitorPlay, Shapes, Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { EmptyState } from '../../components/feedback/States';
import { FilterSelect, SearchInput, Select } from '../../components/forms/Field';
import { Drawer } from '../../components/overlay/Overlay';
import { Person } from '../../components/ui/Avatar';
import { Badge, ContentStatusBadge, DemoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DefinitionList } from '../../components/ui/Card';
import type { Asset, AssetKind } from '../../domain/assets';
import { ASSET_KINDS } from '../../domain/assets';
import { DEPARTMENTS, departmentById } from '../../domain/catalog';
import type { DepartmentId } from '../../domain/users';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useAct } from '../../features/workspace/hooks';
import { useToast } from '../../components/feedback/Toast';
import { canEditContent } from '../../features/workspace/permissions';
import { useI18n } from '../../i18n/I18nProvider';
import { assetKindLabel } from '../../i18n/labels';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

const ICON: Record<AssetKind, LucideIcon> = {
  image: ImageIcon,
  video: FileVideo,
  audio: AudioLines,
  certificate: Award,
  document: FileText,
  zoom_capture: MonitorPlay,
  logo: Shapes,
  template_asset: LayoutTemplate,
};

function kindOf(file: File): AssetKind {
  if (file.type.startsWith('image/')) return /logo/i.test(file.name) ? 'logo' : /zoom/i.test(file.name) ? 'zoom_capture' : 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (/certif/i.test(file.name)) return 'certificate';
  return 'document';
}

/** A simple asset library: find, preview, link to content. Not a DAM. */
export function MediaPage() {
  const { t, tx, num, bytes, date } = useI18n();
  const { state, addAsset } = useWorkspace();
  const act = useAct();
  const toast = useToast();
  const [query, setQuery] = useQueryState();
  const input = useRef<HTMLInputElement | null>(null);
  usePageMeta(t('Media Library', 'مكتبة الوسائط'), [{ label: t('Media Library', 'مكتبة الوسائط') }]);
  const kind = (query.get('kind') ?? 'all') as AssetKind | 'all';
  const department = (query.get('department') ?? 'all') as DepartmentId | 'all';
  const q = (query.get('q') ?? '').toLowerCase();
  const linkTarget = state.content.find((item) => item.id === query.get('link')) ?? null;
  const open = state.assets.find((asset) => asset.id === query.get('asset')) ?? null;

  const list = state.assets.filter((asset) => (kind === 'all' || asset.kind === kind) && (department === 'all' || asset.departmentId === department) && (!q || `${asset.name} ${asset.tags.join(' ')}`.toLowerCase().includes(q)));

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    let added = 0;
    for (const file of files) if (act(addAsset({ name: file.name, kind: kindOf(file), mime: file.type, sizeBytes: file.size, contentId: linkTarget?.id ?? null }))) added++;
    if (added) toast.success(t(`${num(added)} file(s) registered`, `تم تسجيل ${num(added)} ملف`), t('Metadata only: file storage is not connected yet.', 'البيانات الوصفية فقط: تخزين الملفات غير مربوط بعد.'));
    if (input.current) input.current.value = '';
  };

  return (
    <div className="u-stack">
      <PageHeader
        title={t('Media Library', 'مكتبة الوسائط')}
        description={t('Images, videos, certificates, Zoom captures and brand files used in content.', 'الصور والفيديوهات والشهادات ولقطات Zoom وملفات الهوية المستخدمة في المحتوى.')}
        actions={
          <>
            <input ref={input} type="file" multiple hidden onChange={(event) => upload(event.target.files)} />
            <Button variant="primary" icon={<Upload size={15} />} onClick={() => input.current?.click()}>
              {linkTarget ? t('Upload to this item', 'ارفع لهذا العنصر') : t('Upload', 'رفع')}
            </Button>
          </>
        }
      />
      {linkTarget && (
        <div className="ui-notice ui-notice--partial" role="status">
          <div className="ui-notice__text">
            <b>{t('Attaching to', 'الإرفاق إلى')}: <span dir="auto">{linkTarget.title}</span></b>
            <span>{t('Open a file and choose “Link to content”, or upload a new one.', 'افتح ملفًا واختر «اربط بمحتوى»، أو ارفع ملفًا جديدًا.')}</span>
          </div>
          <Link to={`/content/${linkTarget.id}`} className="ui-notice__action">
            {t('Back to item', 'العودة للعنصر')}
          </Link>
        </div>
      )}
      <div className="toolbar">
        <div className="toolbar__search">
          <SearchInput value={query.get('q') ?? ''} onChange={(value) => setQuery({ q: value || null })} placeholder={t('Search names and tags', 'ابحث في الأسماء والوسوم')} label={t('Search media', 'ابحث في الوسائط')} />
        </div>
        <div className="filters">
          <FilterSelect label={t('Type', 'النوع')} allLabel={t('All', 'الكل')} value={kind} onChange={(value) => setQuery({ kind: value === 'all' ? null : value })} options={ASSET_KINDS.map((value) => ({ value, label: tx(assetKindLabel[value]) }))} />
          <FilterSelect label={t('Department', 'القسم')} allLabel={t('All', 'الكل')} value={department} onChange={(value) => setQuery({ department: value === 'all' ? null : value })} options={DEPARTMENTS.map((entry) => ({ value: entry.id, label: tx(entry.name) }))} />
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState title={t('No files match.', 'لا ملفات مطابقة.')} text={t('Clear the filters or upload a file.', 'امسح الفلاتر أو ارفع ملفًا.')} />
      ) : (
        <ul className="asset-grid">
          {list.map((asset) => {
            const Icon = ICON[asset.kind];
            return (
              <li key={asset.id}>
                <button type="button" className="asset-tile" onClick={() => setQuery({ asset: asset.id }, { replace: false })}>
                  <span className="asset-tile__preview" data-kind={asset.kind}>
                    <Icon size={26} aria-hidden />
                    {(asset.width || asset.durationSec) && (
                      <small className="u-tnum">{asset.width ? `${asset.width}×${asset.height}` : `${Math.floor(asset.durationSec! / 60)}:${String(asset.durationSec! % 60).padStart(2, '0')}`}</small>
                    )}
                  </span>
                  <span className="asset-tile__name u-truncate" dir="ltr">
                    {asset.name}
                  </span>
                  <span className="asset-tile__meta">
                    {tx(assetKindLabel[asset.kind])} · {bytes(asset.sizeBytes)} · {date(asset.uploadedAt, 'dayShort')}
                  </span>
                  <span className="asset-tile__meta">{t(`Used in ${num(asset.contentIds.length)}`, `مستخدم في ${num(asset.contentIds.length)}`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <AssetDrawer asset={open} onClose={() => setQuery({ asset: null })} linkTargetId={linkTarget?.id ?? null} />
    </div>
  );
}

function AssetDrawer({ asset, onClose, linkTargetId }: { asset: Asset | null; onClose: () => void; linkTargetId: string | null }) {
  const { t } = useI18n();
  return (
    <Drawer open={Boolean(asset)} onClose={onClose} title={asset?.name ?? ''} label={t('File', 'ملف')} width="md">
      {asset && <AssetBody asset={asset} linkTargetId={linkTargetId} />}
    </Drawer>
  );
}

function AssetBody({ asset, linkTargetId }: { asset: Asset; linkTargetId: string | null }) {
  const { t, tx, bytes, date } = useI18n();
  const { state, me, linkAsset } = useWorkspace();
  const act = useAct();
  const [target, setTarget] = useState(linkTargetId ?? '');
  const Icon = ICON[asset.kind];
  const used = asset.contentIds.map((id) => state.content.find((item) => item.id === id)).filter((item) => item != null);
  const linkable = state.content.filter((item) => canEditContent(me, item) && !asset.contentIds.includes(item.id) && !['archived', 'cancelled'].includes(item.status));
  return (
    <div className="u-stack u-stack--lg">
      <div className="asset-preview" data-kind={asset.kind}>
        <Icon size={40} aria-hidden />
        <p className="u-xs u-muted">{asset.hasFile ? '' : t('Preview unavailable: this record has metadata only. File storage arrives with the media backend.', 'المعاينة غير متاحة: هذا السجل يحوي بيانات وصفية فقط. تخزين الملفات يأتي مع خدمة الوسائط.')}</p>
      </div>
      <div className="u-row">
        <Button icon={<Download size={15} />} disabled={!asset.hasFile} title={asset.hasFile ? undefined : t('No stored file to download yet', 'لا يوجد ملف مخزن للتحميل بعد')}>
          {t('Download', 'تحميل')}
        </Button>
        <DemoBadge />
      </div>
      <DefinitionList
        items={[
          { label: t('Type', 'النوع'), value: tx(assetKindLabel[asset.kind]) },
          { label: t('Size', 'الحجم'), value: bytes(asset.sizeBytes) },
          ...(asset.width ? [{ label: t('Dimensions', 'الأبعاد'), value: <span className="u-tnum" dir="ltr">{asset.width}×{asset.height}</span> }] : []),
          { label: t('Department', 'القسم'), value: tx(departmentById(asset.departmentId)!.name) },
          { label: t('Uploaded by', 'رفعه'), value: <Person users={state.users} id={asset.uploadedById} /> },
          { label: t('Uploaded', 'تاريخ الرفع'), value: date(asset.uploadedAt, 'dateTime') },
          { label: t('Tags', 'الوسوم'), value: asset.tags.length ? <span className="u-row u-row--wrap">{asset.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</span> : '—' },
        ]}
      />
      <section className="u-stack u-stack--sm">
        <h3 className="sub-title">{t('Used in', 'مستخدم في')}</h3>
        {used.length === 0 ? (
          <p className="u-sm u-muted">{t('Not linked to any content yet.', 'غير مرتبط بأي محتوى بعد.')}</p>
        ) : (
          <ul className="u-stack u-stack--xs">
            {used.map((item) => (
              <li key={item.id} className="u-row u-row--between">
                <Link to={`/content/${item.id}`} className="ui-link u-truncate" dir="auto">
                  {item.title}
                </Link>
                <ContentStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="u-stack u-stack--sm">
        <h3 className="sub-title">{t('Link to content', 'اربط بمحتوى')}</h3>
        <div className="u-row">
          <Select value={target} onChange={(event) => setTarget(event.target.value)} aria-label={t('Content item', 'عنصر المحتوى')}>
            <option value="">{t('Choose an item you can edit', 'اختر عنصرًا تملك تعديله')}</option>
            {linkable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
          <Button disabled={!target} onClick={() => act(linkAsset(asset.id, target), t('Linked', 'تم الربط')) && setTarget('')}>
            {t('Link', 'ربط')}
          </Button>
        </div>
      </section>
    </div>
  );
}
