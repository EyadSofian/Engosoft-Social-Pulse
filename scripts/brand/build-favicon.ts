/** Favicon = the approved brand-blue circle badge with the approved white symbol (symbol width 31.57% of the diameter). */
import { readFileSync, writeFileSync } from 'node:fs';
import logos from '../../brand/logos.json';

const symbol = logos.variants.find((variant) => variant.id === 'symbol-reversed')!;
const svg = readFileSync(new URL(`../../${symbol.assetPath}`, import.meta.url), 'utf8');
const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)![1];
const width = 31.57, height = width / symbol.aspectRatio;
writeFileSync(new URL('../../public/brand/engosoft-favicon.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="64" height="64"><circle cx="50" cy="50" r="50" fill="#0046FF"/>` +
  `<svg x="${(50 - width / 2).toFixed(3)}" y="${(50 - height / 2).toFixed(3)}" width="${width}" height="${height.toFixed(3)}" viewBox="0 0 ${symbol.width} ${symbol.height}">${inner}</svg></svg>\n`);
console.log('public/brand/engosoft-favicon.svg written');
