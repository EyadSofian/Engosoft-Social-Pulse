import { APPROVED_LOGO, lockedLogoSvg, logoHref, minimumBadgeDiameter, normalizeLogoVariant, pickVariantForFlatBackground, type LogoHrefs, type LogoVariant } from '../brand/approved';
import { getLogoVariant, logoContainer } from '../../../server/creative-intelligence/brand/registry';
import { POST_SIZES, type PostSizeId } from '../post-design/templates';
import type { CreativeDirection } from './design-plan';

export type DesignLayer =
  | { type: 'shape'; id: string; x: number; y: number; width: number; height: number; fill: string; opacity?: number; radius?: number }
  | { type: 'image'; id: string; x: number; y: number; width: number; height: number; source: string; opacity?: number }
  | { type: 'text'; id: string; x: number; y: number; width: number; value: string; size: number; color: string; weight: number; maxLines: number; lineHeight?: number }
  | { type: 'logo'; id: string; x: number; y: number; width: number; source: string; variant: LogoVariant; locked: true; container?: 'white-circle' };
export interface LayeredDesign {
  canvas: { width: number; height: number; viewWidth: 1080; viewHeight: number; sizeId: PostSizeId };
  background: DesignLayer;
  layers: DesignLayer[];
  brand: { logoAssetId: string; locked: true };
  direction: CreativeDirection;
}
export interface CreativeCopy { headline: string; eyebrow: string; body: string; detail: string; cta: string; imageDataUrl?: string }
const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
function palette(mode: CreativeDirection['colorMode']) {
  if (mode === 'light_technical') return { bg: '#f7f9fc', ink: '#09215f', accent: '#0046ff', secondary: '#e7eefb' };
  if (mode === 'emerald_gold') return { bg: '#052e2a', ink: '#ffffff', accent: '#c9a65b', secondary: '#073e36' };
  if (mode === 'purple_tech') return { bg: '#24187e', ink: '#ffffff', accent: '#a898ff', secondary: '#351db8' };
  if (mode === 'dark_navy') return { bg: '#071a4b', ink: '#ffffff', accent: '#ff6600', secondary: '#0046ff' };
  return { bg: '#0046ff', ink: '#ffffff', accent: '#ff6600', secondary: '#062b89' };
}
function text(id: string, x: number, y: number, width: number, value: string, size: number, color: string, weight: number, maxLines = 3): DesignLayer { return { type: 'text', id, x, y, width, value, size, color, weight, maxLines }; }
function shape(id: string, x: number, y: number, width: number, height: number, fill: string, opacity = 1, radius = 0): DesignLayer { return { type: 'shape', id, x, y, width, height, fill, opacity, radius }; }
/** Converts a creative direction into independent editable layers. */
export function composeCreativeDesign(direction: CreativeDirection, sizeId: PostSizeId, copy: CreativeCopy, logoHrefs: LogoHrefs = {}, selectedLogo: LogoVariant | 'auto' = 'auto'): LayeredDesign {
  const size = POST_SIZES.find((entry) => entry.id === sizeId) ?? POST_SIZES[0];
  const h = Math.round(1080 * size.height / size.width);
  const wide = h < 760, story = h > 1500;
  const p = palette(direction.colorMode);
  const layers: DesignLayer[] = [];
  const image = copy.imageDataUrl || '';
  const addImage = (id: string, x: number, y: number, width: number, height: number) => { if (image) layers.push({ type: 'image', id, x, y, width, height, source: image }); };
  const titleSize = wide ? 62 : story ? (direction.headlineHierarchy === 'hero' ? 110 : 91) : (direction.headlineHierarchy === 'hero' ? 98 : 79);
  if (direction.composition === 'full_bleed_editorial') {
    addImage('hero-image', 0, 0, 1080, h);
    layers.push(shape('photo-tint', 0, 0, 1080, h, p.bg, image ? .12 : 1));
    layers.push(shape('reading-field', wide ? 550 : 530, 0, wide ? 530 : 550, h, p.bg, .84));
    layers.push(shape('accent-rule', wide ? 565 : 555, wide ? 133 : story ? 620 : 250, wide ? 435 : 445, 7, p.accent));
    layers.push(text('eyebrow', 998, wide ? 112 : story ? 590 : 223, wide ? 420 : 430, copy.eyebrow, wide ? 23 : 27, p.ink, 700, 1));
    layers.push(text('headline', 1000, wide ? 225 : story ? 850 : 405, wide ? 470 : 460, copy.headline, wide ? 58 : story ? 96 : 76, p.ink, 800, wide ? 2 : 4));
    layers.push(text('body', 1000, wide ? 415 : story ? 1260 : 720, wide ? 470 : 455, copy.body, wide ? 26 : 32, p.ink, 500, 3));
  } else if (direction.composition === 'centered_portrait') {
    layers.push(shape('upper-band', 0, 0, 1080, story ? 365 : wide ? 120 : 370, p.secondary));
    addImage('instructor-photo', wide ? 42 : 80, wide ? 55 : story ? 380 : 385, wide ? 425 : 920, wide ? h - 90 : story ? 1070 : 500);
    layers.push(shape('image-accent', wide ? 42 : 80, wide ? h - 42 : story ? 1450 : 886, wide ? 425 : 920, 8, p.accent));
    layers.push(text('eyebrow', 1000, wide ? 125 : story ? 230 : 145, wide ? 510 : 600, copy.eyebrow, wide ? 23 : 28, p.ink, 700, 1));
    layers.push(text('headline', 1000, wide ? 245 : story ? 800 : 205, wide ? 520 : 650, copy.headline, wide ? 62 : story ? 88 : 68, p.ink, 800, wide ? 2 : 2));
    layers.push(text('body', 1000, wide ? 415 : story ? 1540 : 938, wide ? 510 : 810, copy.body, wide ? 24 : 28, p.ink, 500, 2));
  } else if (direction.composition === 'technical_gallery') {
    layers.push(shape('top-line', 0, 0, 1080, 16, p.accent));
    const top = wide ? 75 : story ? 445 : 350;
    const visualHeight = wide ? 360 : story ? 1060 : h - 555;
    layers.push(shape('technical-mat', 60, top, 960, visualHeight, '#0b245b', 1, 18));
    addImage('technical-artwork', 76, top + 16, 928, visualHeight - 32);
    layers.push(shape('image-foot', 70, top + visualHeight + 8, 940, 8, p.accent));
    layers.push(text('eyebrow', 1000, wide ? 135 : story ? 210 : 145, 690, copy.eyebrow, wide ? 22 : 27, p.accent, 700, 1));
    layers.push(text('headline', 1000, wide ? 240 : story ? 335 : 245, wide ? 610 : 830, copy.headline, wide ? 53 : 70, p.ink, 800, 2));
    layers.push(text('body', 1000, wide ? 465 : story ? 1620 : h - 145, wide ? 530 : 900, copy.body, wide ? 24 : 30, p.ink, 500, 2));
  } else if (direction.composition === 'offer_focus') {
    addImage('offer-image', 0, 0, 1080, h);
    layers.push(shape('offer-tint', 0, 0, 1080, h, p.bg, .72));
    layers.push(shape('offer-band', 0, story ? 1020 : wide ? 280 : 555, 1080, story ? 650 : wide ? 190 : 365, p.secondary, .9));
    layers.push(text('eyebrow', 1000, wide ? 135 : story ? 520 : 285, 820, copy.eyebrow, wide ? 24 : 30, p.ink, 700, 1));
    layers.push(text('headline', 1000, wide ? 265 : story ? 1240 : 770, 900, copy.headline, wide ? 72 : story ? 120 : 104, p.ink, 800, wide ? 2 : 3));
    layers.push(text('body', 1000, wide ? 455 : story ? 1510 : 940, 850, copy.body, wide ? 24 : 32, p.ink, 500, 2));
  } else if (direction.composition === 'floating_panel') {
    addImage('hero-image', 0, 0, 1080, h);
    layers.push(shape('floating-card', 65, story ? 1010 : wide ? 200 : 545, 950, story ? 620 : wide ? 330 : 440, '#ffffff', .95, 24));
    layers.push(text('eyebrow', 970, story ? 1110 : wide ? 275 : 635, 850, copy.eyebrow, 28, '#0046ff', 700, 1));
    layers.push(text('headline', 970, story ? 1260 : wide ? 365 : 755, 850, copy.headline, titleSize, '#09215f', 800, wide ? 2 : 3));
    layers.push(text('body', 970, story ? 1510 : wide ? 475 : 925, 850, copy.body, 29, '#09215f', 500, 2));
  } else {
    addImage('accent-visual', wide ? 20 : 0, wide ? 0 : story ? 860 : 530, wide ? 420 : 1080, wide ? h : story ? 1060 : h - 530);
    layers.push(shape('impact-tint', 0, wide ? 0 : story ? 850 : 525, 1080, wide ? h : h - (story ? 850 : 525), p.bg, image ? .38 : 1));
    layers.push(shape('accent-bar', 70, wide ? 90 : story ? 625 : 355, 180, 12, p.accent));
    layers.push(text('eyebrow', 1000, wide ? 128 : story ? 275 : 185, 820, copy.eyebrow, 28, p.ink, 700, 1));
    layers.push(text('headline', 1000, wide ? 275 : story ? 540 : 360, 900, copy.headline, titleSize, p.ink, 800, wide ? 2 : 3));
    layers.push(text('body', 1000, wide ? 470 : story ? 760 : 500, 820, copy.body, wide ? 26 : 31, p.ink, 500, 2));
  }
  if (copy.detail) {
    let detailY = story ? h - 205 : wide ? h - 42 : h - 145;
    if (direction.composition === 'centered_portrait') detailY = story ? h - 250 : wide ? h - 42 : 355;
    if (direction.composition === 'technical_gallery') detailY = story ? h - 270 : wide ? h - 42 : h - 185;
    if (direction.composition === 'offer_focus') detailY = story ? 910 : wide ? h - 42 : 450;
    if (direction.composition === 'floating_panel') detailY = story ? 1185 : wide ? h - 42 : 695;
    layers.push(text('verified-detail', wide ? 600 : 1000, detailY, wide ? 440 : 790, copy.detail, wide ? 22 : 27, direction.composition === 'floating_panel' ? '#09215f' : p.ink, 700, 1));
  }
  if (copy.cta.trim() && direction.ctaTreatment !== 'none') {
    const ctaY = story ? h - 125 : wide ? h - 66 : h - 75;
    if (direction.ctaTreatment === 'pill') layers.push(shape('cta-pill', 685, ctaY - 49, 320, 63, p.accent, 1, 31));
    else if (direction.ctaTreatment === 'bottom_banner') layers.push(shape('cta-banner', 0, ctaY - 53, 1080, 78, p.accent));
    else if (direction.ctaTreatment === 'underline') layers.push(shape('cta-underline', 760, ctaY + 7, 245, 5, p.accent));
    layers.push(text('cta', 988, ctaY, 285, copy.cta, wide ? 24 : 27, direction.ctaTreatment === 'bottom_banner' && direction.colorMode === 'light_technical' ? '#fff' : p.ink, 800, 1));
  }
  // The logo sits top-left. For flat layouts this is the fill under it; for photographic compositions it is only
  // an estimate, and the server-side logo validator must measure the real pixels before export.
  const underLogo = direction.composition === 'centered_portrait' ? p.secondary : p.bg;
  // The approved lockup is stacked (symbol over wordmark); landscape layouts have no room for it, so they default to the symbol.
  const kind = selectedLogo === 'auto' ? (wide ? 'symbol' : 'lockup') : selectedLogo.startsWith('symbol') ? 'symbol' : 'lockup';
  const logoVariant = selectedLogo === 'auto' ? pickVariantForFlatBackground(underLogo, kind) : selectedLogo;
  // Where a photo fills the logo corner, its pixels are unknown here: use the approved white circle badge.
  const photoUnderLogo = Boolean(image) && selectedLogo === 'auto' && (wide || direction.composition === 'full_bleed_editorial' || direction.composition === 'floating_panel');
  if (photoUnderLogo) {
    const diameter = minimumBadgeDiameter(1080);
    const badge = logoContainer('white-circle');
    const width = badge.symbolWidth(diameter);
    const height = Math.round(width / getLogoVariant(badge.symbolVariant).aspectRatio);
    layers.push({ type: 'shape', id: 'logo-badge', x: 54, y: story ? 70 : 54, width: diameter, height: diameter, fill: badge.fill, radius: diameter / 2 });
    layers.push({ type: 'logo', id: 'official-logo', x: Math.round(54 + diameter / 2 - width / 2), y: Math.round((story ? 70 : 54) + diameter / 2 - height / 2), width, source: logoHref(badge.symbolVariant, logoHrefs), variant: badge.symbolVariant, locked: true, container: 'white-circle' });
  } else {
    layers.push({ type: 'logo', id: 'official-logo', x: 54, y: story ? 70 : 54, width: kind === 'symbol' ? (wide ? 64 : 88) : 240, source: logoHref(logoVariant, logoHrefs), variant: logoVariant, locked: true });
  }
  return { canvas: { width: size.width, height: size.height, viewWidth: 1080, viewHeight: h, sizeId }, background: shape('background', 0, 0, 1080, h, p.bg), layers, brand: { logoAssetId: APPROVED_LOGO.id, locked: true }, direction };
}
/** Drafts saved before the approved SVG logos carry cropped-sheet variant names and a PNG source; point them at the approved files. */
export function upgradeLegacyDesign(design: LayeredDesign, logoHrefs: LogoHrefs = {}): LayeredDesign {
  const fill = design.background.type === 'shape' ? design.background.fill : '#0046ff';
  const layers = design.layers.map((layer): DesignLayer => {
    if (layer.type !== 'logo') return layer;
    const named = normalizeLogoVariant(layer.variant);
    const variant = named === 'auto' ? pickVariantForFlatBackground(fill, 'lockup') : named;
    return { ...layer, variant, source: logoHref(variant, logoHrefs), width: variant.startsWith('symbol') ? Math.min(layer.width, 96) : Math.max(layer.width, 240) };
  });
  return { ...design, layers, brand: { logoAssetId: APPROVED_LOGO.id, locked: true } };
}
function wrap(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean), lines: string[] = []; let line = '';
  for (const word of words) { if (line && (line + ' ' + word).length > maxChars) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word; }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines[maxLines - 1] = `${lines.slice(maxLines - 1).join(' ').slice(0, maxChars - 1)}…`;
  return lines.slice(0, maxLines);
}
function layerSvg(layer: DesignLayer): string {
  if (layer.type === 'shape') return `<rect data-layer="${esc(layer.id)}" x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.radius ?? 0}" fill="${esc(layer.fill)}" opacity="${layer.opacity ?? 1}"/>`;
  if (layer.type === 'image') return layer.source ? `<image data-layer="${esc(layer.id)}" href="${esc(layer.source)}" x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="xMidYMid slice" opacity="${layer.opacity ?? 1}"/>` : '';
  if (layer.type === 'logo') return lockedLogoSvg(layer.x, layer.y, layer.width, layer.variant, layer.source);
  const rows = wrap(layer.value, Math.max(8, Math.floor(layer.width / (layer.size * .62))), layer.maxLines);
  // data-text keeps the canonical copy intact even when the preview breaks it across lines.
  return `<g data-layer="${esc(layer.id)}" data-text="${esc(layer.value)}">${rows.map((row, index) => { const rtl = /[\u0600-\u06ff]/.test(row); return `<text x="${rtl ? layer.x : layer.x - layer.width}" y="${layer.y + index * layer.size * (layer.lineHeight ?? 1.28)}" direction="${rtl ? 'rtl' : 'ltr'}" text-anchor="start" fill="${esc(layer.color)}" font-family="${rtl ? 'Almarai' : "'Plus Jakarta Sans'"},sans-serif" font-size="${layer.size}" font-weight="${layer.weight}">${esc(row)}</text>`; }).join('')}</g>`;
}
export function renderCreativeSvg(design: LayeredDesign): string {
  const { canvas } = design;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 1080 ${canvas.viewHeight}" role="img" aria-label="${esc(design.direction.name)}">${layerSvg(design.background)}${design.layers.map(layerSvg).join('')}</svg>`;
}
