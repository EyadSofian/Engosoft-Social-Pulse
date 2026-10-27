import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { migrateStudioDoc, STUDIO_VERSION, type StudioDoc } from '../src/domain/studio';
import { keyGreen, liftDecor, measureShape, measureTextBox, toRaw } from '../server/creative-intelligence/studio/pixels';
import { approvedWithBreaks, layersSvg, pasteInside } from '../server/creative-intelligence/studio/studio';
import { outlineText } from '../server/creative-intelligence/typography/text-outline';

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();
const pixel = async (image: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};

test('an AI patch only replaces pixels inside its boxes', async () => {
  const base = await png('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#ff0000"/></svg>');
  const edited = await png('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0000ff"/></svg>');
  const out = await pasteInside(base, edited, [{ x: 10, y: 10, width: 40, height: 40 }]);
  assert.deepEqual(await pixel(out, 30, 30), [0, 0, 255]);
  assert.deepEqual(await pixel(out, 150, 80), [255, 0, 0]);
});

test('text color and lines come from the original pixels', async () => {
  const image = await png('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#0b1b4d"/><rect x="40" y="40" width="200" height="30" fill="#ffffff"/><rect x="40" y="110" width="150" height="30" fill="#ffffff"/></svg>');
  const m = measureTextBox(await toRaw(image), { x: 30, y: 30, width: 230, height: 120 });
  assert.equal(m.color, '#FFFFFF');
  assert.equal(m.lines.length, 2);
  assert.ok(Math.abs(m.lines[0].top - 40) <= 1 && Math.abs(m.lines[1].left - 40) <= 1);
});

test('a pill is measured from its fill and keeps its icon as a separate image', async () => {
  const image = await png('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#f0f0f0"/><rect x="50" y="60" width="300" height="80" rx="40" fill="#ff6600"/><circle cx="110" cy="100" r="14" fill="#ffffff"/></svg>');
  const raw = await toRaw(image);
  const shape = measureShape(raw, { x: 60, y: 66, width: 280, height: 70 }, []);
  assert.ok(Math.abs(shape.box.x - 50) <= 3 && Math.abs(shape.box.x + shape.box.width - 350) <= 3, JSON.stringify(shape.box));
  assert.equal(shape.fill, '#FF6600');
  const decor = await liftDecor(raw, shape, 40, []);
  assert.equal(decor.length, 1);
  assert.ok(Math.abs(decor[0].box.x + decor[0].box.width / 2 - 110) <= 3);
});

test('a green-screen result is keyed to a transparent cut-out', async () => {
  const image = await png('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#00ff00"/><rect x="30" y="20" width="40" height="60" fill="#334455"/></svg>');
  const keyed = await keyGreen(image, 100, 100);
  assert.ok(keyed);
  assert.deepEqual(keyed.trim, { x: 30, y: 20, width: 40, height: 60 });
  assert.equal(await keyGreen(await png('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="#123456"/></svg>'), 50, 50), null);
});

test('approved spelling fixes a misspelled line but never merges a whole headline into one line', () => {
  assert.equal(approvedWithBreaks('باحترارف', 'باحتراف'), 'باحتراف');
  assert.equal(approvedWithBreaks('باحتـــراف', 'باحتراف'), 'باحتراف');
  assert.equal(approvedWithBreaks('باحتراف', 'قُد إدارة المرافق باحتراف'), 'باحتراف');
  assert.equal(approvedWithBreaks('قد إدارة\nالمرافق باحترارف', 'قد إدارة المرافق باحتراف'), 'قد إدارة\nالمرافق باحتراف');
});

test('typed line breaks are kept and words never break in the middle', () => {
  const style = { weight: 800, size: 40, color: '#000000' };
  const kept = outlineText({ text: 'سجّل\nالآن', x: 0, y: 0, width: 2000, preserveNewlines: true, style });
  assert.deepEqual(kept.lines.map((l) => l.text), ['سجّل', 'الآن']);
  const narrow = outlineText({ text: 'أتقن Revit MEP', x: 0, y: 0, width: 10, preserveNewlines: true, style });
  assert.deepEqual(narrow.lines.map((l) => l.text.replace(/[⁦-⁩]/g, '')), ['أتقن', 'Revit', 'MEP']);
  const collapsed = outlineText({ text: 'سجّل\nالآن', x: 0, y: 0, width: 2000, style });
  assert.equal(collapsed.lines.length, 1);
});

test('older Studio documents upgrade to layered ones', () => {
  const doc = migrateStudioDoc({ version: 'studio:v1', width: 1080, height: 1350, baseFile: 'x.png', zones: [], logo: null, layers: [{ id: 't1', text: 'نص', x: 1, y: 2, width: 300, size: 40, color: '#FFFFFF', weight: 800, align: 'start', lineHeight: 1.3 }] });
  assert.equal(doc?.version, STUDIO_VERSION);
  assert.equal(doc?.layers[0].kind, 'text');
  assert.equal(doc?.layers[0].opacity, 1);
  assert.deepEqual(doc?.objects, []);
  assert.equal(migrateStudioDoc({ svgTemplate: {} }), null);
});

test('layers render in order, hidden ones are skipped', () => {
  const doc: StudioDoc = {
    version: STUDIO_VERSION, width: 400, height: 300, baseFile: '00000000-0000-0000-0000-000000000000.png', objects: [], zones: [], logo: null,
    layers: [
      { kind: 'shape', id: 's1', x: 10, y: 10, width: 200, height: 60, fill: '#FF6600', fill2: '#FF8800', radius: 30, shadow: true, opacity: 1 },
      { kind: 'text', id: 't1', text: 'سجّل الآن', x: 20, y: 20, width: 180, size: 30, color: '#FFFFFF', weight: 800, align: 'center', lineHeight: 1.3, opacity: 0.5 },
      { kind: 'shape', id: 's2', x: 0, y: 0, width: 5, height: 5, fill: '#000000', radius: 0, opacity: 1, hidden: true },
    ],
  };
  const { svg, textHeights } = layersSvg(doc);
  assert.ok(svg.indexOf('<rect') < svg.indexOf('<path'));
  assert.ok(svg.includes('url(#g-s1)') && svg.includes('feDropShadow') && svg.includes('opacity="0.5"'));
  assert.equal((svg.match(/<rect/g) ?? []).length, 1);
  assert.ok((textHeights.get('t1') ?? 0) > 20);
});

test('a shape fill is its dominant color even when white text covers much of it', async () => {
  const image = await png('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#f0f0f0"/><rect x="50" y="60" width="300" height="80" rx="40" fill="#f75913"/><rect x="120" y="80" width="160" height="40" fill="#ffffff"/></svg>');
  const shape = measureShape(await toRaw(image), { x: 55, y: 62, width: 290, height: 76 }, []);
  assert.equal(shape.fill, '#F75913');
});

test('text-only extraction keeps badge artwork and the original lettering instead of rebuilding shapes', async () => {
  const { planLayers, studioPath } = await import('../server/creative-intelligence/studio/studio');
  const { readFileSync } = await import('node:fs');
  const { originalTextAppearance } = await import('../src/domain/studio');
  const lettering = outlineText({ text:'CFM', x:200, y:195, width:300, align:'center', style:{size:62,weight:800,color:'#102048'} });
  const original = await png(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#F4F7FB"/><rect x="50" y="180" width="500" height="105" rx="50" fill="#FFFFFF"/><circle cx="105" cy="232" r="35" fill="#0046FF"/>${lettering.svg}</svg>`);
  const analysis: import('../server/creative-intelligence/studio/analyze').StudioAnalysis = {texts:[{text:'CFM',approved:'CFM',box:{x:.34,y:.49,width:.48,height:.2},align:'center',weight:'extrabold',shape:0}],shapes:[{kind:'pill',box:{x:50/600,y:.45,width:500/600,height:105/400},corners:'round',shadow:true}],objects:[],faces:[]};
  const plan = await planLayers(original,analysis);
  assert.equal(plan.layers.length,1);assert.equal(plan.layers[0].kind,'text');
  const layer = plan.layers[0] as import('../src/domain/studio').TextLayer;
  const source = originalTextAppearance(layer);assert.ok(source);
  assert.ok(readFileSync(studioPath(source.file)).length>50);
  assert.ok(plan.holes.every(b=>b.x>150),'Clearing text must not erase the icon to its left');
  const doc:StudioDoc={version:STUDIO_VERSION,width:600,height:400,baseFile:'00000000-0000-0000-0000-000000000000.png',layers:[layer],objects:[],zones:[],logo:null};
  const svg=layersSvg(doc).svg;assert.ok(svg.includes('<image'));assert.ok(!svg.includes('<path'));
  const {svg:changed}=layersSvg({...doc,layers:[{...layer,text:'NEW'}]});assert.ok(!changed.includes('<image'));assert.ok(changed.includes('<path'));
  // Reassemble the lifted glyphs over the same white surface: the actual silhouette and antialiasing survive.
  assert.equal(plan.holes.length,0,'Quiet surfaces should not be sent to an image-generation edit');
  assert.equal(plan.flatPatches.length,1);
  const cleared=await sharp(original).composite(plan.flatPatches.map(p=>({input:p.png,left:p.box.x,top:p.box.y}))).png().toBuffer();
  const restored=await sharp(cleared).composite([{input:Buffer.from(svg)}]).removeAlpha().raw().toBuffer();
  const before=await sharp(original).removeAlpha().raw().toBuffer();
  const error=restored.reduce((sum,v,i)=>sum+Math.abs(v-before[i]),0)/before.length;
  assert.ok(error<.2,`Mean pixel difference: ${error}`);
});

test('uncertain text stays in the artwork instead of being erased and replaced with guessed lettering',async()=>{
  const {planLayers}=await import('../server/creative-intelligence/studio/studio');
  const original=await png('<svg width="300" height="200"><rect width="300" height="200" fill="#ffffff"/></svg>');
  const plan=await planLayers(original,{texts:[{text:'غير موجود',approved:'',box:{x:.1,y:.1,width:.5,height:.2},align:'right',weight:'bold',shape:-1}],shapes:[],objects:[],faces:[]});
  assert.equal(plan.layers.length,0);assert.equal(plan.holes.length,0);
});

test('object extraction applies only the generated alpha mask to original pixels, preserving colors and details',async()=>{
  const {originalCutout}=await import('../server/creative-intelligence/studio/pixels');
  const original=await png('<svg width="80" height="80"><rect width="80" height="80" fill="#0046ff"/><rect x="30" y="30" width="10" height="10" fill="#ff6600"/></svg>');
  // Deliberately different model colors must never become the extracted object's colors.
  const mask=await png('<svg width="40" height="40"><rect x="2" y="2" width="36" height="36" fill="#ff0000"/></svg>');
  const cut=await originalCutout(original,{png:mask,trim:{x:20,y:20,width:40,height:40}});
  assert.deepEqual(await pixel(cut,5,5),[0,70,255]);assert.deepEqual(await pixel(cut,15,15),[255,102,0]);
  const {data}=await sharp(cut).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(data[3],0);
});

test('a flat-background design decomposes and reassembles without a generative repaint',async()=>{
  const {decompose,studioPath}=await import('../server/creative-intelligence/studio/studio');
  const {readFileSync}=await import('node:fs');
  const letters=outlineText({text:'CFM',x:100,y:100,width:300,style:{size:70,weight:800,color:'#0046FF'}});
  const original=await png(`<svg width="500" height="300"><rect width="500" height="300" fill="#fff"/>${letters.svg}<circle cx="40" cy="200" r="20" fill="#ff6600"/></svg>`);
  const split=await decompose({original,format:'feed',approvedCopy:[],env:{},analysis:{texts:[{text:'CFM',approved:'CFM',box:{x:.18,y:.3,width:.6,height:.27},align:'left',weight:'extrabold',shape:-1}],shapes:[],objects:[],faces:[]}});
  assert.equal(split.layers.length,1);
  const output=await sharp(readFileSync(studioPath(split.baseFile))).composite([{input:Buffer.from(layersSvg(split).svg)}]).removeAlpha().raw().toBuffer();
  const pixels=await sharp(original).removeAlpha().raw().toBuffer();
  assert.ok(output.reduce((s,v,i)=>s+Math.abs(v-pixels[i]),0)/pixels.length<.2);
});

test('overlapping duplicate text detections create one editable layer',async()=>{
 const {planLayers}=await import('../server/creative-intelligence/studio/studio');
 const out=outlineText({text:'CFM',x:80,y:80,width:280,style:{size:60,weight:800,color:'#0046FF'}});
 const original=await png(`<svg width="500" height="300"><rect width="500" height="300" fill="#fff"/>${out.svg}</svg>`);
 const text={text:'CFM',approved:'CFM',box:{x:.15,y:.25,width:.6,height:.25},align:'left' as const,weight:'extrabold' as const,shape:-1};
 const plan=await planLayers(original,{texts:[text,{...text,box:{...text.box,x:.16}}],shapes:[],faces:[],objects:[]});
 assert.equal(plan.layers.filter(l=>l.kind==='text').length,1);
});
