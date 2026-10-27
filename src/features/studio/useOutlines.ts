import { useEffect, useRef, useState } from 'react';
import type { StudioLayer, TextLayer } from '../../domain/studio';
import { api } from '../../lib/api';

export interface Outline { svg: string; height: number; overflow: boolean; missingGlyphs: string[] }

/** Everything that changes a text's shape; position is applied by the canvas, so moving never refetches. */
const keyOf = (l: TextLayer) => JSON.stringify([l.text, l.width, l.size, l.weight, l.align, l.lineHeight, l.color]);

/**
 * Brand-font outlines of the text layers, rendered by the server exactly as the final image will be.
 * While a changed text is being outlined, its previous outline stays on screen so typing never flickers.
 */
export function useOutlines(layers: StudioLayer[]): Map<string, Outline> {
  const cache = useRef(new Map<string, Outline>());
  const lastById = useRef(new Map<string, Outline>());
  const [, bump] = useState(0);
  const texts = layers.filter((l): l is TextLayer => l.kind === 'text');
  const missing = texts.filter((l) => !cache.current.has(keyOf(l)));
  const signature = missing.map(keyOf).join('|');

  useEffect(() => {
    if (!missing.length) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<Record<string, Outline>>('/api/studio/outline', { body: { layers: missing.map(({ id, text, width, size, weight, align, lineHeight, color }) => ({ id, text, width, size, weight, align, lineHeight, color })) } })
        .then((result) => {
          if (cancelled) return;
          for (const layer of missing) if (result[layer.id]) cache.current.set(keyOf(layer), result[layer.id]);
          bump((n) => n + 1);
        })
        .catch(() => undefined);
    }, 90);
    return () => { cancelled = true; clearTimeout(timer); };
    // The signature lists exactly the outlines still needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const out = new Map<string, Outline>();
  for (const layer of texts) {
    const hit = cache.current.get(keyOf(layer)) ?? lastById.current.get(layer.id);
    if (hit) { out.set(layer.id, hit); lastById.current.set(layer.id, hit); }
  }
  return out;
}
