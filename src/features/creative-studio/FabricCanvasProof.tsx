import { useEffect, useRef } from 'react';
import { Canvas, FabricImage, Rect, Textbox, type FabricObject } from 'fabric';
import type { DesignLayer, LayeredDesign } from './creative-renderer';

type Tagged = FabricObject & { data?: { layerId: string } };
/** First editable-canvas proof: select, drag, scale and edit live text; logo is immutable. */
export function FabricCanvasProof({ design, onChange }: { design: LayeredDesign; onChange: (next: LayeredDesign) => void }) {
  const element = useRef<HTMLCanvasElement>(null);
  const latest = useRef(onChange);
  const current = useRef(design);
  latest.current = onChange;
  useEffect(() => {
    if (!element.current) return;
    const scale = 0.5;
    const canvas = new Canvas(element.current, { width: 540, height: Math.round(design.canvas.viewHeight * scale), backgroundColor: (design.background.type === 'shape' ? design.background.fill : '#fff'), preserveObjectStacking: true });
    let alive = true;
    const add = async (layer: DesignLayer) => {
      if (!alive) return;
      let object: Tagged | null = null;
      if (layer.type === 'shape') object = new Rect({ left: layer.x * scale, top: layer.y * scale, width: layer.width * scale, height: layer.height * scale, fill: layer.fill, opacity: layer.opacity ?? 1, rx: (layer.radius ?? 0) * scale, ry: (layer.radius ?? 0) * scale });
      if (layer.type === 'text') object = new Textbox(layer.value, { left: (layer.x - layer.width) * scale, top: (layer.y - layer.size) * scale, width: layer.width * scale, fontSize: layer.size * scale, fontFamily: /[\u0600-\u06ff]/.test(layer.value) ? 'Almarai' : 'Plus Jakarta Sans', fontWeight: layer.weight, fill: layer.color, textAlign: /[\u0600-\u06ff]/.test(layer.value) ? 'right' : 'left', direction: /[\u0600-\u06ff]/.test(layer.value) ? 'rtl' : 'ltr' });
      if (layer.type === 'image' && layer.source) {
        try { const image = await FabricImage.fromURL(layer.source); if (!alive) return; image.set({ left: layer.x * scale, top: layer.y * scale, scaleX: layer.width * scale / image.width, scaleY: layer.height * scale / image.height }); object = image; } catch { return; }
      }
      if (layer.type === 'logo' && layer.source) {
        try {
          const image = await FabricImage.fromURL(layer.source);
          if (!alive) return;
          // Uniform scale from width keeps the approved artwork's ratio.
          const logoScale = layer.width * scale / image.width;
          image.set({ left: layer.x * scale, top: layer.y * scale, scaleX: logoScale, scaleY: logoScale, selectable: false, evented: false, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
          object = image;
        } catch { return; }
      }
      // The badge behind the symbol is part of the locked brand mark.
      if (object && layer.id === 'logo-badge') object.set({ selectable: false, evented: false });
      if (object) { object.data = { layerId: layer.id }; object.set({ lockRotation: true }); canvas.add(object); canvas.requestRenderAll(); }
    };
    void (async () => { for (const layer of design.layers) await add(layer); })();
    const commit = (event: { target?: FabricObject }) => {
      const target = event.target as Tagged | undefined;
      const id = target?.data?.layerId;
      if (!target || !id || id === 'official-logo') return;
      const layers = current.current.layers.map((layer): DesignLayer => {
        if (layer.id !== id) return layer;
        const x = Math.round((target.left ?? 0) / scale), y = Math.round((target.top ?? 0) / scale);
        if (layer.type === 'text' && target instanceof Textbox) return { ...layer, x: x + Math.round((target.width * target.scaleX) / scale), y: y + Math.round((target.fontSize * target.scaleY) / scale), width: Math.round((target.width * target.scaleX) / scale), size: Math.round((target.fontSize * target.scaleY) / scale), value: target.text || '' };
        if (layer.type === 'shape' || layer.type === 'image') return { ...layer, x, y, width: Math.round(target.getScaledWidth() / scale), height: Math.round(target.getScaledHeight() / scale) };
        return layer;
      });
      current.current = { ...current.current, layers };
      latest.current(current.current);
    };
    canvas.on('object:modified', commit);
    canvas.on('text:changed', commit);
    return () => { alive = false; void canvas.dispose(); };
  }, [design]);
  return <div className="post-designer__fabric"><canvas ref={element} aria-label="Editable creative canvas" /><p className="u-xs u-muted">اسحب أو كبّر العناصر، واضغط مرتين لتعديل النص. الشعار مقفول.</p></div>;
}
