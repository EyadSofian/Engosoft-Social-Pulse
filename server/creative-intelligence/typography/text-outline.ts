/**
 * Exact text rendering for production creatives: HarfBuzz shaping (Arabic joining, ligatures, marks),
 * Unicode bidi ordering, measured line breaking, and output as vector outlines from the vendored brand
 * fonts. Outlines cannot fall back to a system font, so a render looks the same on every machine.
 */
import bidiFactory from 'bidi-js';
import { Blob, Buffer as HbBuffer, Direction, Face, Font, shape, Variation, type SvgPathCommand } from 'harfbuzzjs';
import { brandFontFor, readBrandFont, type BrandFontFamily } from '../brand/fonts.js';

const bidi = bidiFactory();

export interface TextStyle {
  /** 'brand' picks Almarai for Arabic script and Plus Jakarta Sans for Latin, per the brand guidelines. */
  family?: BrandFontFamily | 'brand';
  weight: number;
  size: number;
  color: string;
  lineHeight?: number;
}
export interface TextBlock {
  text: string;
  /** Box in canvas pixels; y is the top of the first line. */
  x: number; y: number; width: number;
  align?: 'start' | 'end' | 'center';
  direction?: 'rtl' | 'ltr' | 'auto';
  maxLines?: number;
  style: TextStyle;
  id?: string;
  /**
   * Keep dates, times and other digit groups in typed order (04-10-2026, 7:30) inside Arabic text.
   * Plain Unicode bidi would show "2026-10-04". Default true.
   */
  isolateNumbers?: boolean;
  /** Keep typed line breaks as hard breaks (Studio text layers). Default false: any whitespace is a space. */
  preserveNewlines?: boolean;
}
export interface OutlinedLine { text: string; width: number; baseline: number }
export interface OutlinedText {
  svg: string;
  lines: OutlinedLine[];
  height: number;
  /** Text needed more lines than maxLines, or a single word is wider than the box. Nothing is truncated. */
  overflow: boolean;
  /** Characters the chosen font has no glyph for. Any entry is a validation failure. */
  missingGlyphs: string[];
}

interface LoadedFont { font: Font; upem: number; ascender: number; descender: number }
const fonts = new Map<string, LoadedFont>();
function loadFont(family: BrandFontFamily, weight: number): LoadedFont {
  const { file, weight: resolved } = brandFontFor(family, weight);
  const key = `${file.file}@${resolved}`;
  const hit = fonts.get(key);
  if (hit) return hit;
  const face = new Face(new Blob(new Uint8Array(readBrandFont(file))));
  const font = new Font(face);
  if (file.variable) font.setVariations([new Variation('wght', resolved)]);
  const extents = font.hExtents();
  const loaded = { font, upem: face.upem, ascender: extents.ascender, descender: extents.descender };
  fonts.set(key, loaded);
  return loaded;
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/;
const BIDI_CONTROL = /[‎‏‪-‮⁦-⁩]/;
const LRI = '⁦', PDI = '⁩';

/** Wrap digit groups joined by - / . : (dates, times, versions) in left-to-right isolates. */
export function isolateNumericSequences(text: string): string {
  return text.replace(/\d+(?:[-/.:]\d+)+/g, (match) => `${LRI}${match}${PDI}`);
}

function familyFor(char: string, rtlContext: boolean, style: TextStyle): BrandFontFamily {
  if (style.family && style.family !== 'brand') return style.family;
  if (ARABIC.test(char)) return 'Almarai';
  if (LATIN_LETTER.test(char)) return 'Plus Jakarta Sans';
  return rtlContext ? 'Almarai' : 'Plus Jakarta Sans';
}

interface Run { start: number; end: number; level: number; family: BrandFontFamily }
interface ShapedGlyph { glyph: number; x: number; y: number; advance: number; font: LoadedFont; cluster: number }
interface ShapedLine { width: number; glyphs: ShapedGlyph[]; missing: string[] }

function shapeLine(text: string, base: 'rtl' | 'ltr', style: TextStyle): ShapedLine {
  const levels = bidi.getEmbeddingLevels(text, base).levels;
  const runs: Run[] = [];
  for (let i = 0; i < text.length; i++) {
    // Bidi controls have done their job in the level computation and are not drawn.
    if (BIDI_CONTROL.test(text[i])) continue;
    const level = levels[i];
    const family = familyFor(text[i], level % 2 === 1, style);
    const last = runs[runs.length - 1];
    if (last && last.end === i && last.level === level && last.family === family) last.end = i + 1;
    else runs.push({ start: i, end: i + 1, level, family });
  }
  // Unicode bidi rule L2: from the highest level down to the lowest odd level, reverse every
  // maximal sequence of runs at that level or higher. Glyphs inside an RTL run come back from
  // HarfBuzz already in visual order.
  const visual = [...runs];
  const max = Math.max(0, ...runs.map((r) => r.level));
  const minOdd = Math.min(...runs.map((r) => r.level).filter((l) => l % 2 === 1), max + 1);
  for (let level = max; level >= minOdd; level--) {
    for (let i = 0; i < visual.length;) {
      if (visual[i].level < level) { i++; continue; }
      let j = i;
      while (j < visual.length && visual[j].level >= level) j++;
      visual.splice(i, j - i, ...visual.slice(i, j).reverse());
      i = j;
    }
  }
  const glyphs: ShapedGlyph[] = [];
  const missing: string[] = [];
  let pen = 0;
  for (const run of visual) {
    const font = loadFont(run.family, style.weight);
    const scale = style.size / font.upem;
    const buffer = new HbBuffer();
    buffer.addText(text.slice(run.start, run.end));
    buffer.guessSegmentProperties();
    buffer.setDirection(run.level % 2 === 1 ? Direction.RTL : Direction.LTR);
    shape(font.font, buffer);
    for (const g of buffer.getGlyphInfosAndPositions()) {
      if (g.codepoint === 0) missing.push(text[run.start + g.cluster]);
      glyphs.push({ glyph: g.codepoint, x: pen + (g.xOffset ?? 0) * scale, y: -(g.yOffset ?? 0) * scale, advance: (g.xAdvance ?? 0) * scale, font, cluster: run.start + g.cluster });
      pen += (g.xAdvance ?? 0) * scale;
    }
  }
  return { width: pen, glyphs, missing };
}

const round = (n: number) => Math.round(n * 100) / 100;
function glyphPath(glyph: ShapedGlyph, originX: number, baseline: number, size: number): string {
  const scale = size / glyph.font.upem;
  const commands: SvgPathCommand[] = glyph.font.font.glyphToJson(glyph.glyph);
  return commands.map((command) => {
    const values: number[] = [];
    for (let i = 0; i < command.values.length; i += 2) {
      values.push(round(originX + glyph.x + command.values[i] * scale), round(baseline + glyph.y - command.values[i + 1] * scale));
    }
    return command.type + values.join(' ');
  }).join('');
}

const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function paragraphDirection(text: string): 'rtl' | 'ltr' {
  for (const char of text) {
    if (ARABIC.test(char)) return 'rtl';
    if (LATIN_LETTER.test(char)) return 'ltr';
  }
  return 'rtl';
}

/** Width of one line of text as rendered, in pixels. */
export function measureText(text: string, style: TextStyle, direction: 'rtl' | 'ltr' = paragraphDirection(text)): number {
  return shapeLine(isolateNumericSequences(text), direction, style).width;
}

/** Shape, break and outline a block of text. Returns SVG path markup positioned in canvas pixels. */
export function outlineText(block: TextBlock): OutlinedText {
  const { style } = block;
  const direction = !block.direction || block.direction === 'auto' ? paragraphDirection(block.text) : block.direction;
  const lineHeight = style.size * (style.lineHeight ?? 1.3);
  const source = block.isolateNumbers === false ? block.text : isolateNumericSequences(block.text);
  const paragraphs = block.preserveNewlines ? source.split(/\r?\n/) : [source];
  const lines: { text: string; shaped: ShapedLine }[] = [];
  let overflow = false;
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    // An empty typed line still takes a line's height.
    if (!words.length) { if (block.preserveNewlines) lines.push({ text: '', shaped: { width: 0, glyphs: [], missing: [] } }); continue; }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const shaped = shapeLine(candidate, direction, style);
      if (shaped.width <= block.width || !current) {
        if (!current && shaped.width > block.width) overflow = true;
        current = candidate;
      } else {
        lines.push({ text: current, shaped: shapeLine(current, direction, style) });
        current = word;
        if (shapeLine(word, direction, style).width > block.width) overflow = true;
      }
    }
    if (current) lines.push({ text: current, shaped: shapeLine(current, direction, style) });
  }
  if (block.maxLines && lines.length > block.maxLines) overflow = true;

  const primary = loadFont(direction === 'rtl' || style.family === 'Almarai' ? 'Almarai' : 'Plus Jakarta Sans', style.weight);
  const ascent = primary.ascender * style.size / primary.upem;
  const align = block.align ?? 'start';
  const outlined: OutlinedLine[] = [];
  const paths: string[] = [];
  const missing = new Set<string>();
  lines.forEach((line, index) => {
    const baseline = block.y + ascent + index * lineHeight;
    const free = block.width - line.shaped.width;
    const startsRight = direction === 'rtl' ? align === 'start' : align === 'end';
    const originX = block.x + (align === 'center' ? free / 2 : startsRight ? free : 0);
    for (const glyph of line.shaped.glyphs) paths.push(glyphPath(glyph, originX, baseline, style.size));
    line.shaped.missing.forEach((char) => missing.add(char));
    outlined.push({ text: line.text.replace(new RegExp(BIDI_CONTROL.source, 'g'), ''), width: round(line.shaped.width), baseline: round(baseline) });
  });
  const height = lines.length ? ascent + (lines.length - 1) * lineHeight + Math.abs(primary.descender) * style.size / primary.upem : 0;
  const svg = `<path${block.id ? ` data-layer="${esc(block.id)}"` : ''} data-text="${esc(block.text)}" fill="${esc(style.color)}" d="${paths.join('')}"/>`;
  return { svg, lines: outlined, height: round(height), overflow, missingGlyphs: [...missing] };
}
