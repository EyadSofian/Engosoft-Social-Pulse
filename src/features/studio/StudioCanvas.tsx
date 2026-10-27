import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { flipTransform, originalTextAppearance, rotateTransform, shapeShadow, strokeOf, textShadow, type Box, type StudioDoc, type StudioLayer } from '../../domain/studio';
import { useI18n } from '../../i18n/I18nProvider';
import { boundsOf, boxOf, groupOf, intersects, movable, moveLayers, resizeLayer, selectionBounds, snapAngle, updateLayer, type Handle } from './edit';
import { snapEdge, snapMove, type Guide } from './snap';
import { toolbarPosition } from './toolbar-position';
import type { Outline } from './useOutlines';

export type Tool = 'select' | 'ai';
type DragHandle = Handle | 'rotate';

/** Side handles first so the corners stay on top of them on short layers. */
const HANDLES: Record<StudioLayer['kind'], Handle[]> = {
  text: ['e', 'w', 'nw', 'ne', 'se', 'sw'],
  shape: ['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw'],
  image: ['nw', 'ne', 'se', 'sw'],
};
const ZOOMS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const typingIn = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

interface Drag {
  mode: 'move' | 'resize' | 'rotate' | 'marquee' | 'region' | 'pan';
  start: StudioDoc;
  px: number; py: number;
  cx: number; cy: number;
  moved?: boolean;
  ids?: Set<string>;
  id?: string;
  handle?: Handle;
  /** Selection to apply if the press ends without moving (a click inside a selected group picks one layer). */
  clickSelect?: string[];
  /** Selection kept while Shift-dragging a selection box. */
  base?: string[];
  others?: Box[];
  startBox?: Box;
  center?: { x: number; y: number };
  angle0?: number;
  scroll?: { left: number; top: number };
}

/**
 * The design: background image plus every layer drawn as SVG in document pixels. Text is the server's
 * brand-font outline, so what you see is what the saved image shows. Zoom with ⌘/Ctrl + wheel or the
 * zoom bar, pan with Space + drag or the middle button.
 */
export function StudioCanvas({ doc, outlines, selection, tool, region, highlight, working, editing, compare, originalUrl, toolbar, onSelect, onLive, onCommit, onRegion, onEdit, onContextMenu, onDropFiles }: {
  doc: StudioDoc;
  outlines: Map<string, Outline>;
  selection: string[];
  tool: Tool;
  region: Box | null;
  highlight: Box | null;
  working: boolean;
  /** Text layer being typed into on the canvas. */
  editing: string | null;
  /** Show the original design instead of the layers. */
  compare: boolean;
  originalUrl: string;
  /** Quick actions shown above the selection. */
  toolbar?: ReactNode;
  onSelect: (ids: string[]) => void;
  /** Continuous change (dragging, typing): no history step until `onCommit`. */
  onLive: (doc: StudioDoc) => void;
  onCommit: () => void;
  onRegion: (box: Box | null) => void;
  onEdit: (id: string | null) => void;
  onContextMenu: (at: { x: number; y: number }) => void;
  onDropFiles: (files: File[], at: { x: number; y: number }) => void;
}) {
  const { t } = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 480, height: 42 });
  const [view, setView] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [hover, setHover] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const drag = useRef<Drag | null>(null);
  const anchor = useRef<{ docX: number; docY: number; clientX: number; clientY: number } | null>(null);
  /** Layer under the last press: pointer capture retargets the following dblclick to the viewport. */
  const lastHit = useRef<string | null>(null);

  const heightOf = (id: string) => outlines.get(id)?.height;
  const PAD = view.width < 520 ? 16 : 48;
  const fit = Math.max(0.05, Math.min((view.width - PAD * 2) / doc.width, (view.height - PAD * 2) / doc.height));
  const scale = zoom === 'fit' ? fit : zoom;
  const stageW = doc.width * scale, stageH = doc.height * scale;
  const innerW = Math.max(view.width, stageW + PAD * 2), innerH = Math.max(view.height, stageH + PAD * 2);
  const offX = (innerW - stageW) / 2, offY = (innerH - stageH) / 2;

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setView({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Zoom keeping the document point under the cursor (or the view centre) in place. */
  const zoomTo = (next: number | 'fit', at?: { clientX: number; clientY: number }) => {
    const el = viewport.current, st = stage.current;
    if (el && st && next !== 'fit') {
      const rect = st.getBoundingClientRect(), vr = el.getBoundingClientRect();
      const clientX = at?.clientX ?? vr.left + vr.width / 2, clientY = at?.clientY ?? vr.top + vr.height / 2;
      anchor.current = { docX: (clientX - rect.left) / scale, docY: (clientY - rect.top) / scale, clientX: clientX - vr.left, clientY: clientY - vr.top };
    }
    setZoom(next === 'fit' ? 'fit' : Math.min(6, Math.max(0.05, next)));
  };
  const stepZoom = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOMS.find((z) => z > scale + 0.001) : [...ZOOMS].reverse().find((z) => z < scale - 0.001);
    zoomTo(next ?? scale);
  };
  useLayoutEffect(() => {
    const a = anchor.current, el = viewport.current;
    anchor.current = null;
    if (!a || !el) return;
    el.scrollLeft = offX + a.docX * scale - a.clientX;
    el.scrollTop = offY + a.docY * scale - a.clientY;
  }, [scale, offX, offY]);

  // Pinch and ⌘/Ctrl + wheel zoom; needs a non-passive listener to stop the page zooming.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomTo(scale * Math.exp(-event.deltaY * 0.01), event);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (typingIn(event.target)) return;
      if (event.code === 'Space' && !event.repeat) { setSpace(true); event.preventDefault(); }
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === '=' || event.key === '+')) { event.preventDefault(); stepZoom(1); }
      if (mod && event.key === '-') { event.preventDefault(); stepZoom(-1); }
      if (mod && event.key === '0') { event.preventDefault(); zoomTo('fit'); }
      if (mod && event.key === '1') { event.preventDefault(); zoomTo(1); }
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpace(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  useEffect(() => {
    if (!editing || !editor.current) return;
    editor.current.focus();
    editor.current.select();
  }, [editing]);
  const editLayer = editing ? doc.layers.find((l) => l.id === editing && l.kind === 'text') : undefined;
  useLayoutEffect(() => {
    const el = editor.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });

  const toDoc = (event: { clientX: number; clientY: number }) => {
    const rect = stage.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };
  const visible = doc.layers.filter((l) => !l.hidden);
  const othersThan = (ids: Set<string>) => visible.filter((l) => !ids.has(l.id)).map((l) => boundsOf(l, heightOf(l.id)));

  const begin = (event: ReactPointerEvent, next: Omit<Drag, 'px' | 'py' | 'cx' | 'cy' | 'start'>) => {
    const p = toDoc(event);
    drag.current = { ...next, start: doc, px: p.x, py: p.y, cx: event.clientX, cy: event.clientY };
    viewport.current?.setPointerCapture(event.pointerId);
  };
  const beginMove = (event: ReactPointerEvent, ids: string[], clickSelect?: string[]) => {
    const set = movable(doc, ids);
    begin(event, { mode: 'move', ids: set, clickSelect, others: othersThan(set), startBox: selectionBounds(doc, set, heightOf) ?? undefined });
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('.studio__float, .studio__inline')) return;
    if (event.button === 1 || (event.button === 0 && space)) {
      event.preventDefault();
      begin(event, { mode: 'pan', scroll: { left: viewport.current!.scrollLeft, top: viewport.current!.scrollTop } });
      return;
    }
    if (event.button !== 0) return;
    if (editing) { onCommit(); onEdit(null); }
    lastHit.current = null;
    const p = toDoc(event);
    if (tool === 'ai') { begin(event, { mode: 'region' }); onRegion({ x: p.x, y: p.y, width: 0, height: 0 }); return; }

    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as DragHandle | undefined;
    const single = selection.length === 1 ? doc.layers.find((l) => l.id === selection[0]) : undefined;
    if (handle && single && !single.locked) {
      const box = boxOf(single, heightOf(single.id));
      if (handle === 'rotate') {
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        begin(event, { mode: 'rotate', id: single.id, center, angle0: Math.atan2(p.y - center.y, p.x - center.x) });
      } else {
        begin(event, { mode: 'resize', id: single.id, handle, others: othersThan(new Set([single.id])) });
      }
      return;
    }

    const hitId = target.closest('[data-layer]')?.getAttribute('data-layer');
    lastHit.current = hitId ?? null;
    if (hitId) {
      const unit = groupOf(doc, hitId);
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        const has = selection.includes(hitId);
        const next = has ? selection.filter((id) => !unit.includes(id)) : [...new Set([...selection, ...unit])];
        onSelect(next);
        if (!has) beginMove(event, next);
      } else if (selection.includes(hitId)) {
        const wholeGroup = selection.length > 1 && unit.length === selection.length && unit.every((id) => selection.includes(id));
        beginMove(event, selection, wholeGroup ? [hitId] : undefined);
      } else {
        onSelect(unit);
        beginMove(event, unit);
      }
      return;
    }
    const bounds = selection.length > 1 ? selectionBounds(doc, selection, heightOf) : null;
    if (bounds && p.x >= bounds.x && p.x <= bounds.x + bounds.width && p.y >= bounds.y && p.y <= bounds.y + bounds.height) { beginMove(event, selection); return; }
    const base = event.shiftKey ? selection : [];
    if (!event.shiftKey) onSelect([]);
    begin(event, { mode: 'marquee', base });
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      viewport.current!.scrollLeft = d.scroll!.left - (event.clientX - d.cx);
      viewport.current!.scrollTop = d.scroll!.top - (event.clientY - d.cy);
      return;
    }
    const p = toDoc(event);
    let dx = p.x - d.px, dy = p.y - d.py;
    if (!d.moved && Math.hypot(event.clientX - d.cx, event.clientY - d.cy) < 3) return;
    if (!d.moved) { d.moved = true; setDragging(true); setHover(null); }
    const page = { width: doc.width, height: doc.height };
    const reach = 6 / scale;

    if (d.mode === 'region') {
      onRegion({ x: Math.max(0, Math.min(d.px, p.x)), y: Math.max(0, Math.min(d.py, p.y)), width: Math.abs(dx), height: Math.abs(dy) });
      return;
    }
    if (d.mode === 'marquee') {
      const box = { x: Math.min(d.px, p.x), y: Math.min(d.py, p.y), width: Math.abs(dx), height: Math.abs(dy) };
      setMarquee(box);
      const hits = visible.filter((l) => !l.locked && intersects(boundsOf(l, heightOf(l.id)), box)).flatMap((l) => groupOf(doc, l.id));
      onSelect([...new Set([...(d.base ?? []), ...hits])]);
      return;
    }
    if (d.mode === 'move') {
      // Shift keeps the move on one axis; Alt turns snapping off.
      if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      let found: Guide[] = [];
      if (d.startBox && !event.altKey) {
        const snapped = snapMove({ ...d.startBox, x: d.startBox.x + dx, y: d.startBox.y + dy }, d.others ?? [], page, reach);
        if (!event.shiftKey || dy === 0) dx += snapped.dx;
        if (!event.shiftKey || dx === 0) dy += snapped.dy;
        found = snapped.guides.filter((g) => (g.axis === 'x' ? !event.shiftKey || dy === 0 : !event.shiftKey || dx === 0));
      }
      setGuides(found);
      onLive(moveLayers(d.start, d.ids!, dx, dy));
      return;
    }
    const startLayer = d.start.layers.find((l) => l.id === d.id);
    if (!startLayer) return;
    if (d.mode === 'rotate') {
      const angle = Math.atan2(p.y - d.center!.y, p.x - d.center!.x);
      const rotation = snapAngle((startLayer.rotation ?? 0) + ((angle - d.angle0!) * 180) / Math.PI, event.shiftKey);
      setLabel(`${rotation}°`);
      onLive(updateLayer(d.start, d.id!, { rotation }));
      return;
    }
    // Resize: snap the edge being dragged when the layer is upright and the drag is not proportional.
    const handle = d.handle!;
    const found: Guide[] = [];
    const proportional = handle.length === 2 && (startLayer.kind !== 'shape' || event.shiftKey);
    if (!startLayer.rotation && !proportional && !event.altKey) {
      const box = boxOf(startLayer, heightOf(startLayer.id));
      const edge = (axis: 'x' | 'y', value: number) => { const s = snapEdge(value, axis, d.others ?? [], page, reach); if (s.guide) found.push(s.guide); return s.shift; };
      if (handle.includes('e')) dx += edge('x', box.x + box.width + dx);
      if (handle.includes('w')) dx += edge('x', box.x + dx);
      if (startLayer.kind !== 'text') {
        if (handle.includes('s')) dy += edge('y', box.y + box.height + dy);
        if (handle.includes('n')) dy += edge('y', box.y + dy);
      }
    }
    setGuides(found);
    const resized = resizeLayer(startLayer, handle, dx, dy, { textHeight: heightOf(startLayer.id), keepRatio: event.shiftKey, fromCenter: event.altKey });
    setLabel(resized.kind === 'text' ? `${resized.size}px` : `${resized.width} × ${resized.height}`);
    onLive(updateLayer(d.start, d.id!, resized));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuides([]); setLabel(null); setMarquee(null); setDragging(false);
    if (!d || d.mode === 'pan') return;
    if (d.mode === 'region') { if (!d.moved || !region || region.width < 16 || region.height < 16) onRegion(null); return; }
    if (d.mode === 'marquee') return;
    if (d.moved) onCommit();
    else if (d.clickSelect) onSelect(d.clickSelect);
  };

  const onDoubleClick = (event: ReactMouseEvent) => {
    if (tool !== 'select') return;
    const id = (event.target as Element).closest('[data-layer]')?.getAttribute('data-layer') ?? lastHit.current;
    const layer = id ? doc.layers.find((l) => l.id === id) : undefined;
    if (!layer || layer.locked) return;
    onSelect([layer.id]);
    if (layer.kind === 'text') onEdit(layer.id);
  };
  const onContext = (event: ReactMouseEvent) => {
    event.preventDefault();
    if (tool !== 'select') return;
    const id = (event.target as Element).closest('[data-layer]')?.getAttribute('data-layer');
    if (id && !selection.includes(id)) onSelect(groupOf(doc, id));
    if (!id && !selection.length) return;
    onContextMenu({ x: event.clientX, y: event.clientY });
  };
  const onDrop = (event: DragEvent) => {
    const files = [...event.dataTransfer.files].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    if (!files.length) return;
    event.preventDefault();
    onDropFiles(files, toDoc(event));
  };

  // Overlay geometry, in screen pixels inside the stage.
  const css = (b: Box): CSSProperties => ({ left: b.x * scale, top: b.y * scale, width: b.width * scale, height: b.height * scale });
  const rotated = (l: StudioLayer): CSSProperties => ({ ...css(boxOf(l, heightOf(l.id))), transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined });
  const selected = doc.layers.filter((l) => selection.includes(l.id) && !l.hidden);
  const single = selected.length === 1 ? selected[0] : null;
  const bounds = selected.length ? selectionBounds(doc, selection, heightOf) : null;
  const hoverLayer = hover && !selection.includes(hover) && !dragging ? doc.layers.find((l) => l.id === hover) : undefined;
  const showFloat = Boolean(toolbar && bounds && !dragging && !editing && tool === 'select' && !compare);
  const floatingPosition = bounds ? toolbarPosition({ x: bounds.x * scale + offX - scrollLeft, y: bounds.y * scale + offY - scrollTop, width: bounds.width * scale, height: bounds.height * scale }, view, toolbarSize, visible.filter(l => !selection.includes(l.id)).map(l => { const b = boundsOf(l, heightOf(l.id)); return { x: b.x * scale + offX - scrollLeft, y: b.y * scale + offY - scrollTop, width: b.width * scale, height: b.height * scale }; })) : undefined;
  useLayoutEffect(() => {
    const el = floating.current;
    if (!el) return;
    const measure = () => setToolbarSize({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, [showFloat]);
  const filterOf = (l: StudioLayer) => ((l.kind === 'text' || l.kind === 'shape') && l.shadow ? `url(#f-${l.id})` : undefined);

  return (
    <div className="studio__view">
      <div ref={viewport} className="studio__viewport" data-tool={tool} data-pan={space || undefined} data-dragging={dragging || undefined}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onScroll={(e) => { setScrollTop(e.currentTarget.scrollTop); setScrollLeft(e.currentTarget.scrollLeft); }}
        onDoubleClick={onDoubleClick} onContextMenu={onContext} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={onDrop}>
        <div className="studio__inner" style={{ width: innerW, height: innerH }}>
          <div ref={stage} className="studio__stage" style={{ left: offX, top: offY, width: stageW, height: stageH }}>
            <img className="studio__base" src={compare && originalUrl ? originalUrl : `/api/studio/${doc.baseFile}`} alt="" draggable={false} />
            {!compare && <svg className="studio__svg" viewBox={`0 0 ${doc.width} ${doc.height}`} aria-hidden>
              <defs>
                {doc.layers.map((l) => {
                  if (l.kind === 'shape') {
                    const s = shapeShadow(l);
                    return <g key={l.id}>
                      {l.fill2 && <linearGradient id={`g-${l.id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={l.fill} /><stop offset="1" stopColor={l.fill2} /></linearGradient>}
                      {l.shadow && <filter id={`f-${l.id}`} x="-30%" y="-30%" width="160%" height="190%"><feDropShadow dx="0" dy={s.dy} stdDeviation={s.blur} floodColor={s.color} floodOpacity={s.opacity} /></filter>}
                    </g>;
                  }
                  if (l.kind === 'text' && l.shadow) {
                    const s = textShadow(l);
                    return <filter key={l.id} id={`f-${l.id}`} x="-30%" y="-30%" width="160%" height="190%"><feDropShadow dx="0" dy={s.dy} stdDeviation={s.blur} floodColor={s.color} floodOpacity={s.opacity} /></filter>;
                  }
                  return null;
                })}
              </defs>
              {doc.layers.map((l) => {
                if (l.hidden) return null;
                const height = boxOf(l, heightOf(l.id)).height;
                const common = {
                  'data-layer': l.id, opacity: l.opacity, className: `studio__item${l.locked ? ' is-locked' : ''}`,
                  onPointerEnter: () => { if (!drag.current) setHover(l.id); }, onPointerLeave: () => setHover((h) => (h === l.id ? null : h)),
                };
                const rot = rotateTransform(l, height) || undefined;
                if (l.kind === 'shape') {
                  const sw = strokeOf(l);
                  return <g key={l.id} {...common} transform={rot}>
                    <rect x={l.x} y={l.y} width={l.width} height={l.height} rx={l.radius} fill={l.fill2 ? `url(#g-${l.id})` : l.fill} filter={filterOf(l)} />
                    {sw > 0 && <rect x={l.x + sw / 2} y={l.y + sw / 2} width={l.width - sw} height={l.height - sw} rx={Math.max(0, l.radius - sw / 2)} fill="none" stroke={l.stroke!} strokeWidth={sw} />}
                  </g>;
                }
                if (l.kind === 'image') return <g key={l.id} {...common} transform={rot}><image href={`/api/studio/${l.file}`} x={l.x} y={l.y} width={l.width} height={l.height} preserveAspectRatio="none" transform={flipTransform(l) || undefined} /></g>;
                const outline = outlines.get(l.id);
                const source = originalTextAppearance(l);
                return (
                  <g key={l.id} {...common} transform={[rot, `translate(${l.x} ${l.y})`].filter(Boolean).join(' ')} filter={filterOf(l)}>
                    <rect width={l.width} height={Math.max(height, l.size)} fill="transparent" />
                    {(editing !== l.id || source) && (source ? <image href={`/api/studio/${source.file}`} x={source.x} y={source.y} width={source.width} height={source.height} /> : outline && <g dangerouslySetInnerHTML={{ __html: outline.svg }} />)}
                  </g>
                );
              })}
            </svg>}

            <div className="studio__overlay">
              {hoverLayer && !compare && <span className="studio__hover" style={rotated(hoverLayer)} />}
              {!compare && tool === 'select' && selected.length > 1 && selected.map((l) => <span key={l.id} className="studio__member" style={rotated(l)} />)}
              {!compare && tool === 'select' && selected.length > 1 && bounds && <span className="studio__frame" style={css(bounds)} />}
              {!compare && tool === 'select' && single && (
                <div className={`studio__selection${single.locked ? ' is-locked' : ''}`} style={rotated(single)}>
                  {!single.locked && editing !== single.id && HANDLES[single.kind].map((h) => <span key={h} className="studio__handle" data-handle={h} />)}
                  {!single.locked && editing !== single.id && <span className="studio__rotate" data-handle="rotate" title={t('Rotate (Shift: 15° steps)', 'تدوير (Shift: كل 15°)')} />}
                </div>
              )}
              {guides.map((g, i) => <span key={i} className={`studio__guide studio__guide--${g.axis}`} style={g.axis === 'x' ? { left: g.at * scale, top: g.from * scale, height: (g.to - g.from) * scale } : { top: g.at * scale, left: g.from * scale, width: (g.to - g.from) * scale }} />)}
              {marquee && <span className="studio__marquee" style={css(marquee)} />}
              {highlight && <span className="studio__highlight" style={css(highlight)} />}
              {region && <span className={`studio__region${working ? ' is-working' : ''}`} style={css(region)} />}
              {label && bounds && <span className="studio__label u-tnum" style={{ left: (bounds.x + bounds.width / 2) * scale, top: (bounds.y + bounds.height) * scale + 14 }}>{label}</span>}
              {editLayer && editLayer.kind === 'text' && (
                <textarea ref={editor} className="studio__inline" dir="auto" spellCheck={false} value={editLayer.text} aria-label={t('Text', 'النص')}
                  style={{
                    left: editLayer.x * scale, top: editLayer.y * scale, width: editLayer.width * scale,
                    fontSize: editLayer.size * scale, fontWeight: editLayer.weight, color: originalTextAppearance(editLayer) ? 'transparent' : editLayer.color, lineHeight: editLayer.lineHeight,
                    textAlign: editLayer.align, opacity: editLayer.opacity, transform: editLayer.rotation ? `rotate(${editLayer.rotation}deg)` : undefined,
                  }}
                  onChange={(e) => onLive(updateLayer(doc, editLayer.id, { text: e.target.value }))}
                  onBlur={() => { onCommit(); onEdit(null); }}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); e.currentTarget.blur(); } }} />
              )}

            </div>
            {working && !region && <span className="studio__working" aria-hidden />}
          </div>
        </div>
      </div>
      {showFloat && floatingPosition && <div ref={floating} className="studio__float" style={floatingPosition}>{toolbar}</div>}
      <div className="studio__zoombar glass" role="group" aria-label={t('Zoom', 'التكبير')}>
        <button type="button" onClick={() => stepZoom(-1)} aria-label={t('Zoom out', 'تصغير')} title={t('Zoom out (⌘−)', 'تصغير (⌘−)')}><Minus size={14} /></button>
        <button type="button" className="u-tnum" onClick={() => zoomTo(zoom === 'fit' ? 1 : 'fit')} title={t('Fit / 100%  (⌘0 / ⌘1)', 'ملاءمة / 100%  (⌘0 / ⌘1)')}>{Math.round(scale * 100)}%</button>
        <button type="button" onClick={() => stepZoom(1)} aria-label={t('Zoom in', 'تكبير')} title={t('Zoom in (⌘+)', 'تكبير (⌘+)')}><Plus size={14} /></button>
        <button type="button" aria-pressed={zoom === 'fit'} onClick={() => zoomTo('fit')} aria-label={t('Fit to screen', 'ملاءمة الشاشة')} title={t('Fit to screen', 'ملاءمة الشاشة')}><Maximize size={14} /></button>
      </div>
    </div>
  );
}
