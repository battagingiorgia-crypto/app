import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, weekKey, splitCents } from '../calc.js';

const people = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id.toUpperCase() }));
const settings = { guestCost: 0.4, freeWashesPerWeek: 2, extraWashPct: 1 };
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

test('lavadoras: solo cuentan las que superan 2 por semana', () => {
  // semana del 5/1: a hace 4 (2 extra), b hace 2 (0 extra)
  const entries = {
    '2026-01-05': { washes: { a: 2, b: 1 } },
    '2026-01-07': { washes: { a: 2, b: 1 } },
  };
  const r = computeSplit({ ...base, entries, total: 100 });
  assert.equal(r.rows[0].extraWashes, 2);
  assert.equal(r.rows[1].extraWashes, 0);
  assert.ok(r.rows[0].total > r.rows[1].total);
  assert.equal(sum(r), 100);
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
