import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STUDIO_VERSION, type ShapeLayer, type StudioDoc, type TextLayer } from '../src/domain/studio';
import { runCommand } from '../src/features/studio/commands';
import { alignLayers, arrangeLayers, boundsOf, distributeLayers, duplicateLayers, groupOf, moveLayers, moveLayerTo, pasteLayers, removeLayers, resizeLayer, snapAngle } from '../src/features/studio/edit';
import { snapMove } from '../src/features/studio/snap';
import { layersSvg } from '../server/creative-intelligence/studio/studio';

const shape = (id: string, x: number, y: number, extra: Partial<ShapeLayer> = {}): ShapeLayer => ({ kind: 'shape', id, x, y, width: 100, height: 50, fill: '#FF6600', radius: 0, opacity: 1, ...extra });
const text = (id: string, extra: Partial<TextLayer> = {}): TextLayer => ({ kind: 'text', id, text: 'Hello', x: 0, y: 0, width: 200, size: 40, color: '#FFFFFF', weight: 700, align: 'center', lineHeight: 1.3, opacity: 1, ...extra });
const docOf = (layers: StudioDoc['layers']): StudioDoc => ({ version: STUDIO_VERSION, width: 1000, height: 1000, baseFile: '00000000-0000-0000-0000-000000000000.png', layers, objects: [], zones: [], logo: null });
const noHeights = () => undefined;

test('resizing a corner keeps the opposite corner fixed', () => {
  const r = resizeLayer(shape('a', 100, 100), 'se', 50, 20);
  assert.deepEqual([r.x, r.y, r.width, (r as ShapeLayer).height], [100, 100, 150, 70]);
  const l = resizeLayer(shape('a', 100, 100), 'nw', -50, -20);
  assert.deepEqual([l.x, l.y, l.width, (l as ShapeLayer).height], [50, 80, 150, 70]);
});

test('resizing a rotated layer moves along its own axes', () => {
  // Rotated 90°: dragging the east handle downward (page y) widens it, and the west edge stays put.
  const start = shape('a', 100, 100, { rotation: 90 });
  const r = resizeLayer(start, 'e', 0, 40) as ShapeLayer;
  assert.equal(r.width, 140);
  assert.equal(r.height, 50);
  // The west edge's midpoint (rotated) stays where it was: centre moved down by 20 page px.
  assert.equal(r.x + r.width / 2, 150);
  assert.equal(r.y + r.height / 2, 145);
});

test('text corners scale the font, sides only change the wrap width', () => {
  const side = resizeLayer(text('t'), 'e', 100, 0, { textHeight: 52 }) as TextLayer;
  assert.equal(side.width, 300);
  assert.equal(side.size, 40);
  const corner = resizeLayer(text('t'), 'se', 100, 26, { textHeight: 52 }) as TextLayer;
  assert.equal(corner.width, 300);
  assert.equal(corner.size, 60);
});

test('rotation snaps to right angles and to 15° steps with Shift', () => {
  assert.equal(snapAngle(88, false), 90);
  assert.equal(snapAngle(37, false), 37);
  assert.equal(snapAngle(37, true), 30);
  assert.equal(snapAngle(-182, false), 180);
});

test('a rotated layer reports its turned bounding box', () => {
  const b = boundsOf(shape('a', 0, 0, { rotation: 90 }));
  assert.deepEqual([Math.round(b.width), Math.round(b.height)], [50, 100]);
  assert.deepEqual([Math.round(b.x), Math.round(b.y)], [25, -25]);
});

test('snapping pulls a box onto the page centre and onto other layers', () => {
  const centre = snapMove({ x: 447, y: 10, width: 100, height: 50 }, [], { width: 1000, height: 1000 }, 6);
  assert.equal(centre.dx, 3);
  assert.equal(centre.guides[0].axis, 'x');
  const edge = snapMove({ x: 302, y: 400, width: 100, height: 50 }, [{ x: 200, y: 100, width: 100, height: 50 }], { width: 1000, height: 1000 }, 6);
  assert.equal(edge.dx, -2);
});

test('clicking a grouped layer selects its group; locked layers never move or delete', () => {
  const doc = docOf([shape('s', 0, 0, { group: 's' }), text('t', { group: 's' }), shape('x', 500, 500, { locked: true })]);
  assert.deepEqual(groupOf(doc, 't').sort(), ['s', 't']);
  const moved = moveLayers(doc, new Set(['s', 't', 'x']), 10, 10);
  assert.equal(moved.layers[2].x, 500);
  assert.equal(removeLayers(doc, ['x']).layers.length, 3);
});

test('align and distribute treat a whole group as one unit', () => {
  const doc = docOf([shape('a', 0, 0), shape('b', 100, 300), shape('c', 600, 600)]);
  const left = alignLayers(doc, ['a', 'b', 'c'], 'left', noHeights);
  assert.deepEqual(left.layers.map((l) => l.x), [0, 0, 0]);
  const page = alignLayers(doc, ['b'], 'hcenter', noHeights);
  assert.equal(page.layers[1].x, 450);
  const spread = distributeLayers(doc, ['a', 'b', 'c'], 'y', noHeights);
  assert.equal(spread.layers[1].y, 300);
  const grouped = docOf([shape('a', 0, 0, { group: 'g' }), shape('b', 200, 0, { group: 'g' })]);
  const centred = alignLayers(grouped, ['a', 'b'], 'hcenter', noHeights);
  assert.deepEqual(centred.layers.map((l) => l.x), [350, 550]);
});

test('stacking order moves the selection as a block', () => {
  const doc = docOf([shape('a', 0, 0), shape('b', 0, 0), shape('c', 0, 0), shape('d', 0, 0)]);
  const ids = (d: StudioDoc) => d.layers.map((l) => l.id).join('');
  assert.equal(ids(arrangeLayers(doc, ['a'], 'forward')), 'bacd');
  assert.equal(ids(arrangeLayers(doc, ['a', 'b'], 'front')), 'cdab');
  assert.equal(ids(arrangeLayers(doc, ['d'], 'back')), 'dabc');
  assert.equal(ids(arrangeLayers(doc, ['c'], 'backward')), 'acbd');
});

test('copies get fresh ids, sit above the original and keep whole groups together', () => {
  const doc = docOf([shape('s', 0, 0, { group: 's' }), text('t', { group: 's' }), shape('x', 0, 0)]);
  const dup = duplicateLayers(doc, ['s', 't']);
  assert.equal(dup.doc.layers.length, 5);
  assert.deepEqual(dup.doc.layers.slice(2, 4).map((l) => l.id), dup.ids);
  const copies = dup.doc.layers.slice(2, 4);
  assert.ok(copies[0].group && copies[0].group === copies[1].group && copies[0].group !== 's');
  const pasted = pasteLayers(doc, [doc.layers[1]]);
  assert.equal(pasted.doc.layers[3].group, undefined);
});

test('commands: group, ungroup and lock toggle', () => {
  const doc = docOf([shape('a', 0, 0), shape('b', 0, 0)]);
  const grouped = runCommand(doc, ['a', 'b'], 'group', noHeights).doc;
  assert.ok(grouped.layers[0].group && grouped.layers[0].group === grouped.layers[1].group);
  assert.equal(runCommand(grouped, ['a'], 'ungroup', noHeights).doc.layers[1].group, undefined);
  const locked = runCommand(doc, ['a'], 'lock', noHeights).doc;
  assert.equal(locked.layers[0].locked, true);
  assert.equal(runCommand(locked, ['a'], 'lock', noHeights).doc.layers[0].locked, undefined);
});

test('the render draws rotation, borders and text shadows like the editor', () => {
  const { svg } = layersSvg(docOf([shape('a', 100, 100, { rotation: 30, stroke: '#FFFFFF', strokeWidth: 6 }), text('t', { shadow: true })]));
  assert.match(svg, /rotate\(30 150 125\)/);
  assert.match(svg, /stroke="#FFFFFF" stroke-width="6"/);
  assert.match(svg, /<filter id="f-t"/);
});

test('dragging a row in the layers list moves that layer to the drop position', () => {
  const doc = docOf([shape('a', 0, 0), shape('b', 0, 0), shape('c', 0, 0)]);
  assert.equal(moveLayerTo(doc, 'a', 2).layers.map((l) => l.id).join(''), 'bca');
  assert.equal(moveLayerTo(doc, 'c', 0).layers.map((l) => l.id).join(''), 'cab');
});

test('moving and proportional corner resizing retain original letterforms; editing words switches to editable typography',async()=>{
  const {textAppearanceKey,originalTextAppearance}=await import('../src/domain/studio');
  const layer=text('t');layer.source={file:'00000000-0000-0000-0000-000000000000.png',x:4,y:8,width:180,height:35,signature:textAppearanceKey(layer)};
  assert.ok(originalTextAppearance({...layer,x:400,y:100,rotation:25,opacity:.5}));
  const resized=resizeLayer(layer,'se',100,26,{textHeight:52}) as TextLayer;
  assert.ok(originalTextAppearance(resized));assert.equal(resized.source!.width,270);
  assert.equal(originalTextAppearance({...layer,text:'Different words'}),undefined);
  assert.equal(originalTextAppearance({...layer,color:'#000000'}),undefined);
});

test('selection toolbar stays inside the viewport at both edges and avoids neighbouring text',async()=>{
  const {toolbarPosition}=await import('../src/features/studio/toolbar-position');
  for(const width of [320,800])for(const x of [-100,0,width-30,width+100]){
    const result=toolbarPosition({x,y:80,width:150,height:60},{width,height:500},{width:600,height:44});
    assert.ok(result.left>=0);assert.ok(result.left+Math.min(600,result.maxWidth)<=width);
    assert.ok(result.top>=0&&result.top+44<=500);
  }
  const result=toolbarPosition({x:510,y:150,width:200,height:90},{width:800,height:600},{width:600,height:50},[{x:360,y:100,width:350,height:40},{x:360,y:250,width:350,height:40}]);
  assert.equal(result.top,8,'Both adjacent lines are occupied, so dock in the viewport margin');
});
