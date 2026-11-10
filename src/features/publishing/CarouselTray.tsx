import { useState, type DragEvent } from 'react';
import { ArrowLeft, ArrowRight, Film, GripVertical, Plus, RotateCcw, X } from 'lucide-react';
import { CAROUSEL_LIMITS, type CalendarPlatform } from '../../domain/calendar-post';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { useI18n } from '../../i18n/I18nProvider';
import { platformOf } from './publishing';

export interface TrayFile { id: string; url: string; type: string }
type Orders = Partial<Record<CalendarPlatform, string[]>>;

/** Moves one id to a new position. */
const move = (ids: string[], from: number, to: number) => {
  const next = [...ids];
  const [picked] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, picked);
  return next;
};

/**
 * The images of a post in the order they go out. A carousel shows every image as a numbered card: drag a card (or
 * use its arrows) to reorder, remove what should not go out. Each platform can keep the main order or have its
 * own order and choice of images, with that platform's limits shown beside it.
 */
export function CarouselTray({ files, ids, orders, platforms, carousel, disabled, onChange, onOrders }: {
  files: TrayFile[]; ids: string[]; orders: Orders; platforms: CalendarPlatform[]; carousel: boolean; disabled?: boolean;
  onChange: (ids: string[]) => void; onOrders: (orders: Orders) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'main' | CalendarPlatform>('main');
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const byId = new Map(files.map((file) => [file.id, file]));
  const carouselPlatforms = platforms.filter((platform) => CAROUSEL_LIMITS[platform]);
  const active = tab !== 'main' && carouselPlatforms.includes(tab) ? tab : 'main';
  const own = active !== 'main' ? orders[active] : undefined;
  const list = (own ?? ids).filter((id) => byId.has(id) && ids.includes(id));
  const excluded = active !== 'main' && own ? ids.filter((id) => !own.includes(id)) : [];
  const limits = active !== 'main' ? CAROUSEL_LIMITS[active] : undefined;

  /** Writes the list being edited: the main order, or this platform's own order. */
  const write = (next: string[]) => {
    if (active === 'main') {
      onChange(next);
      // Removing a file from the post removes it from every platform's own order too.
      const cleaned = Object.fromEntries(Object.entries(orders).map(([platform, list]) => [platform, (list ?? []).filter((id) => next.includes(id))]));
      onOrders(cleaned);
    } else onOrders({ ...orders, [active]: next });
  };
  const drop = (event: DragEvent, to: number) => {
    event.preventDefault();
    if (dragging !== null && dragging !== to) write(move(list, dragging, to));
    setDragging(null); setOver(null);
  };

  if (!list.length && active === 'main') return null;
  if (!carousel) {
    const file = byId.get(list[0]);
    return file ? <div className="ct ct--single"><Card file={file} index={0} total={1} disabled={disabled} onRemove={() => write([])} /></div> : null;
  }
  const count = list.length;
  const outOfRange = limits && (count < limits[0] || count > limits[1]);
  return <div className="ct">
    {carouselPlatforms.length > 0 && <div className="ct__tabs" role="tablist" aria-label={t('Carousel order', 'ترتيب الكاروسيل')}>
      <button type="button" role="tab" aria-selected={active === 'main'} onClick={() => setTab('main')}>{t('Main order', 'الترتيب الأساسي')}</button>
      {carouselPlatforms.map((platform) => <button key={platform} type="button" role="tab" aria-selected={active === platform} onClick={() => setTab(platform)}>
        <ChannelIcon channel={platform} size={14} /> {platformOf(platform).name}{orders[platform] && <i className="ct__own" title={t('Own order', 'ترتيب خاص')} />}
      </button>)}
    </div>}

    {active !== 'main' && <div className="ct__mode">
      {own
        ? <><span>{t(`${platformOf(active).name} has its own order.`, `${platformOf(active).name} ليها ترتيب خاص.`)}</span>
          <button type="button" className="ui-link" disabled={disabled} onClick={() => { const next = { ...orders }; delete next[active]; onOrders(next); }}><RotateCcw size={13} /> {t('Use the main order', 'رجّعها للترتيب الأساسي')}</button></>
        : <><span>{t(`${platformOf(active).name} uses the main order.`, `${platformOf(active).name} بتاخد الترتيب الأساسي.`)}</span>
          <button type="button" className="ui-link" disabled={disabled} onClick={() => onOrders({ ...orders, [active]: [...ids] })}>{t('Arrange it differently', 'رتّبها بشكل مختلف')}</button></>}
    </div>}

    <ol className="ct__list" data-readonly={(active !== 'main' && !own) || undefined}>
      {list.map((id, index) => {
        const file = byId.get(id)!;
        const editable = !disabled && (active === 'main' || Boolean(own));
        return <li key={id} draggable={editable} data-dragging={dragging === index || undefined} data-over={over === index && dragging !== index || undefined}
          onDragStart={(event) => { setDragging(index); event.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(event) => { if (dragging !== null) { event.preventDefault(); setOver(index); } }}
          onDragLeave={() => setOver((value) => (value === index ? null : value))}
          onDrop={(event) => drop(event, index)} onDragEnd={() => { setDragging(null); setOver(null); }}>
          <Card file={file} index={index} total={count} disabled={!editable}
            onEarlier={index > 0 ? () => write(move(list, index, index - 1)) : undefined}
            onLater={index < count - 1 ? () => write(move(list, index, index + 1)) : undefined}
            onRemove={() => write(list.filter((value) => value !== id))}
            removeLabel={active === 'main' ? t('Remove from the post', 'شيلها من المنشور') : t(`Leave out of ${platformOf(active).name}`, `شيلها من ${platformOf(active).name}`)} />
        </li>;
      })}
    </ol>

    {excluded.length > 0 && <div className="ct__excluded">
      <span>{t(`Not on ${platformOf(active as CalendarPlatform).name}:`, `مش ظاهرة على ${platformOf(active as CalendarPlatform).name}:`)}</span>
      {excluded.map((id) => <button key={id} type="button" disabled={disabled} onClick={() => write([...list, id])} title={t('Add back', 'رجّعها')}>
        {byId.get(id)?.type === 'image' ? <img src={byId.get(id)!.url} alt="" /> : <Film size={14} />}<Plus size={12} />
      </button>)}
    </div>}

    <p className="ct__hint" data-warn={outOfRange || undefined}>
      {active === 'main'
        ? t(`${count} images · drag to reorder, or use the arrows. This order goes to every platform unless one has its own.`, `${count} صور · اسحب الصورة لترتيبها أو استخدم الأسهم. الترتيب ده بيروح لكل المنصات إلا اللي ليها ترتيب خاص.`)
        : limits && t(`${platformOf(active).name}: ${count} of ${limits[0]}–${limits[1]} images.`, `${platformOf(active).name}: ${count} صور (المسموح من ${limits[0]} لـ ${limits[1]}).`)}
    </p>
  </div>;
}

function Card({ file, index, total, disabled, onEarlier, onLater, onRemove, removeLabel }: { file: TrayFile; index: number; total: number; disabled?: boolean; onEarlier?: () => void; onLater?: () => void; onRemove: () => void; removeLabel?: string }) {
  const { t } = useI18n();
  return <figure className="ct-card">
    {file.type === 'image' ? <img src={file.url} alt={t(`Image ${index + 1}`, `صورة ${index + 1}`)} draggable={false} /> : <span className="ct-card__video"><Film size={22} /></span>}
    <span className="ct-card__num u-tnum">{index + 1}</span>
    {!disabled && total > 1 && <GripVertical size={14} className="ct-card__grip" aria-hidden />}
    {!disabled && <button type="button" className="ct-card__remove" aria-label={removeLabel ?? t('Remove', 'إزالة')} title={removeLabel} onClick={onRemove}><X size={12} /></button>}
    {!disabled && total > 1 && <span className="ct-card__moves">
      <button type="button" disabled={!onEarlier} onClick={onEarlier} aria-label={t('Move earlier', 'قدّمها')}><ArrowLeft size={12} className="u-flip" /></button>
      <button type="button" disabled={!onLater} onClick={onLater} aria-label={t('Move later', 'أخّرها')}><ArrowRight size={12} className="u-flip" /></button>
    </span>}
  </figure>;
}
