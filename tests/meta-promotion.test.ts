import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readViewsSplit } from '../server/connectors/meta';

test('Facebook views from ads are read from every shape Meta uses for a breakdown', () => {
  // Value keyed by the breakdown value.
  assert.deepEqual(readViewsSplit({ data: [{ name: 'post_media_view', values: [{ value: { true: 600, false: 400 } }] }] }), { paid: 600, organic: 400 });
  // total_value with breakdown results.
  assert.deepEqual(readViewsSplit({ data: [{ name: 'post_media_view', total_value: { breakdowns: [{ results: [{ dimension_values: ['false'], value: 90 }, { dimension_values: ['true'], value: 10 }] }] } }] }), { paid: 10, organic: 90 });
  // One row per breakdown value.
  assert.deepEqual(readViewsSplit({ data: [{ name: 'post_media_view', breakdowns: { is_from_ads: '1' }, values: [{ value: 5 }] }, { name: 'post_media_view', breakdowns: { is_from_ads: '0' }, values: [{ value: 7 }] }] }), { paid: 5, organic: 7 });
  // Only organic views reported: nothing came from ads.
  assert.deepEqual(readViewsSplit({ data: [{ name: 'post_media_view', values: [{ value: { false: 300 } }] }] }), { paid: 0, organic: 300 });
  // A plain total says nothing about ads.
  assert.deepEqual(readViewsSplit({ data: [{ name: 'post_media_view', values: [{ value: 1000 }] }] }), { paid: null, organic: null });
  assert.deepEqual(readViewsSplit({}), { paid: null, organic: null });
});
