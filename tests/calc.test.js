import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, weekKey, splitCents, washExtrasByDate, blockRange } from '../calc.js';

const people = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id.toUpperCase() }));
const settings = { guestCost: 0.4, freeWashes: 2, windowDays: 9, blockStart: '2026-01-01', extraWashPct: 2 };
const base = { people, from: '2026-01-01', to: '2026-03-31', settings };
const sum = r => Math.round(r.rows.reduce((a, x) => a + x.total, 0) * 100) / 100;

test('weekKey devuelve el lunes', () => {
  assert.equal(weekKey('2026-11-13'), '2026-11-09'); // viernes -> lunes
  assert.equal(weekKey('2026-11-09'), '2026-11-09');
  assert.equal(weekKey('2026-11-15'), '2026-11-09'); // domingo
});

test('sin registros: reparto a partes iguales', () => {
  const r = computeSplit({ ...base, entries: {}, total: 100 });
  r.rows.forEach(x => assert.equal(x.total, 20));
});

test('invitados: 0,40 € por noche a quien los tuvo', () => {
  const entries = { '2026-01-10': { guests: { a: 1 } }, '2026-01-11': { guests: { a: 1 } } };
  const r = computeSplit({ ...base, entries, total: 100.8 });
  assert.equal(r.rows[0].guestAmount, 0.8);
  assert.equal(r.rows[0].total, 20.8);
  assert.equal(r.rows[1].total, 20);
  assert.equal(sum(r), 100.8);
});

test('lavadoras: bloques fijos de 9 días, la 3ª del bloque es extra', () => {
  const w = dates => Object.fromEntries(dates.map(d => [d, { washes: { a: 1 } }]));
  const x = dates => washExtrasByDate(w(dates), 'a', 2, 9, '2026-01-01');
  // bloque 1–9: días 2, 5 y 8 → la del 8 es extra
  assert.deepEqual(x(['2026-01-02', '2026-01-05', '2026-01-08']), { '2026-01-08': 1 });
  // días 5, 8 y 11 → el 11 es del bloque 10–18 → ninguna extra
  assert.deepEqual(x(['2026-01-05', '2026-01-08', '2026-01-11']), {});
  // 4 en el mismo bloque → 3ª y 4ª extra
  assert.deepEqual(x(['2026-01-10', '2026-01-11', '2026-01-12', '2026-01-18']), { '2026-01-12': 1, '2026-01-18': 1 });
  // 3 el mismo día → 1 extra
  assert.deepEqual(washExtrasByDate({ '2026-01-01': { washes: { a: 3 } } }, 'a', 2, 9, '2026-01-01'), { '2026-01-01': 1 });
});

test('blockRange da el inicio y fin del bloque', () => {
  assert.deepEqual(blockRange('2026-01-01', '2026-01-01'), ['2026-01-01', '2026-01-09']);
  assert.deepEqual(blockRange('2026-01-12', '2026-01-01'), ['2026-01-10', '2026-01-18']);
  assert.deepEqual(blockRange('2025-12-31', '2026-01-01'), ['2025-12-23', '2025-12-31']); // antes del inicio también funciona
});

test('lavadoras: +2 % por cada extra y el total cuadra', () => {
  const entries = { '2026-01-05': { washes: { a: 2, b: 1 } }, '2026-01-07': { washes: { a: 2, b: 1 } } };
  const r = computeSplit({ ...base, entries, total: 100 });
  assert.equal(r.rows[0].extraWashes, 2);
  assert.equal(r.rows[1].extraWashes, 0);
  assert.ok(Math.abs(r.rows[0].total / r.rows[1].total - 1.04) < 0.001); // 2 extra × 2 % = 4 % más
  assert.equal(sum(r), 100);
});

test('bloque que empieza antes de la factura: cuentan sus lavadoras, pero solo se cobran las del periodo', () => {
  const s2 = { ...settings, blockStart: '2025-12-28' }; // bloque 28/12 – 5/1
  const entries = { '2025-12-29': { washes: { a: 2 } }, '2026-01-02': { washes: { a: 1 } } };
  const r = computeSplit({ ...base, settings: s2, entries, total: 100 });
  assert.equal(r.rows[0].washes, 1);
  assert.equal(r.rows[0].extraWashes, 1);
});

test('fuera del periodo no cuenta', () => {
  const entries = { '2025-12-31': { guests: { a: 5 } } };
  const r = computeSplit({ ...base, entries, total: 100 });
  assert.equal(r.rows[0].guestNights, 0);
});

test('splitCents siempre suma el total exacto', () => {
  const s = splitCents(10001, [1, 1, 1.03, 1, 1]);
  assert.equal(s.reduce((a, b) => a + b, 0), 10001);
});
