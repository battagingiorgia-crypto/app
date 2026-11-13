// Lógica pura de cálculo (sin interfaz) para poder probarla con tests.

/** Convierte "YYYY-MM-DD" en número de días desde 1970 (en UTC, para evitar líos de horario). */
export function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Devuelve la fecha (YYYY-MM-DD) del lunes de la semana a la que pertenece dateStr. */
export function weekKey(dateStr) {
  const n = dayNumber(dateStr);
  // 1/1/1970 fue jueves. (n + 3) % 7 da 0 = lunes ... 6 = domingo.
  const dow = ((n + 3) % 7 + 7) % 7;
  const monday = new Date((n - dow) * 86400000);
  return monday.toISOString().slice(0, 10);
}

/** Reparte `totalCents` según pesos, en céntimos exactos (método del mayor resto). */
export function splitCents(totalCents, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (totalCents <= 0 || sumW <= 0) return weights.map(() => 0);
  const raw = weights.map(w => (totalCents * w) / sumW);
  const floors = raw.map(Math.floor);
  let left = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) floors[order[k % order.length][1]]++;
  return floors;
}

/** Número del bloque al que pertenece una fecha (bloques fijos de `windowDays` días desde `blockStart`). */
export function blockIndex(date, blockStart, windowDays = 9) {
  return Math.floor((dayNumber(date) - dayNumber(blockStart)) / windowDays);
}

/** Primer y último día (YYYY-MM-DD) del bloque que contiene `date`. */
export function blockRange(date, blockStart, windowDays = 9) {
  const first = dayNumber(blockStart) + blockIndex(date, blockStart, windowDays) * windowDays;
  const str = n => new Date(n * 86400000).toISOString().slice(0, 10);
  return [str(first), str(first + windowDays - 1)];
}

/**
 * Lavadoras extra de una persona, por día: { "2026-11-13": 1, ... }.
 * Bloques fijos: los días se agrupan en bloques de `windowDays` días que empiezan en `blockStart`.
 * En cada bloque las `free` primeras lavadoras son normales; desde la siguiente (la 3ª si free = 2), son extra.
 * Ej. bloques 1–9, 10–18…: lavadoras los días 2, 5 y 8 → la del 8 es extra;
 *     lavadoras los días 5, 8 y 11 → ninguna es extra (la del 11 ya está en el bloque siguiente).
 */
export function washExtrasByDate(entries, pid, free = 2, windowDays = 9, blockStart = '2026-01-01') {
  const days = Object.entries(entries || {})
    .map(([date, e]) => [dayNumber(date), date, e.washes?.[pid] || 0])
    .filter(([, , c]) => c > 0)
    .sort((a, b) => a[0] - b[0]);
  const perBlock = {}; // lavadoras ya contadas en cada bloque
  const out = {};
  for (const [, date, count] of days) {
    const blk = blockIndex(date, blockStart, windowDays);
    for (let k = 0; k < count; k++) {
      perBlock[blk] = (perBlock[blk] || 0) + 1;
      if (perBlock[blk] > free) out[date] = (out[date] || 0) + 1;
    }
  }
  return out;
}

/** Lavadoras extra de todas las personas: { p1: { fecha: n }, ... } */
export function allWashExtras(entries, people, settings = {}) {
  const { freeWashes = 2, windowDays = 9, blockStart = '2026-01-01' } = settings;
  return Object.fromEntries(people.map(p => [p.id, washExtrasByDate(entries, p.id, freeWashes, windowDays, blockStart)]));
}

/**
 * Calcula cuánto paga cada persona.
 * Pasos:
 *  1) Cada noche de invitado suma guestCost (p. ej. 0,40 €) a quien lo tuvo.
 *  2) Lo que queda de la factura se reparte entre todos con un "peso":
 *     peso = 1 + (pct/100) × lavadoras_extra
 *     (lavadoras_extra = las que superan freeWashes dentro de cada bloque de windowDays días).
 *     Así quien no se pasa paga la parte normal y quien se pasa paga un pct% más por cada lavadora extra.
 */
export function computeSplit({ people, entries, from, to, total, settings }) {
  const { guestCost = 0.4, extraWashPct = 2 } = settings || {};
  const start = dayNumber(from), end = dayNumber(to);
  const inPeriod = date => { const n = dayNumber(date); return n >= start && n <= end; };
  const totalCents = Math.round(total * 100);

  const stats = Object.fromEntries(people.map(p => [p.id, { guestNights: 0, washes: 0 }]));
  for (const [date, entry] of Object.entries(entries || {})) {
    if (!inPeriod(date)) continue;
    for (const [pid, count] of Object.entries(entry.guests || {})) if (stats[pid]) stats[pid].guestNights += count;
    for (const [pid, count] of Object.entries(entry.washes || {})) if (stats[pid]) stats[pid].washes += count;
  }
  // Se cuentan los bloques completos (aunque empiecen antes del periodo de la factura),
  // pero solo se cobran las lavadoras extra cuya fecha está dentro del periodo.
  const extrasByDate = allWashExtras(entries, people, settings);
  const extras = people.map(p =>
    Object.entries(extrasByDate[p.id]).reduce((a, [date, n]) => a + (inPeriod(date) ? n : 0), 0));

  // Paso 1: invitados
  let guestCents = people.map(p => Math.round(stats[p.id].guestNights * guestCost * 100));
  const guestSum = guestCents.reduce((a, b) => a + b, 0);
  if (guestSum > totalCents) guestCents = splitCents(totalCents, guestCents); // caso raro: invitados > factura

  // Paso 2: resto con pesos por lavadoras extra
  const restCents = totalCents - guestCents.reduce((a, b) => a + b, 0);
  const weights = extras.map(e => 1 + (extraWashPct / 100) * e);
  const restShares = splitCents(restCents, weights);
  const equalShare = restCents / people.length;

  const rows = people.map((p, i) => ({
    id: p.id,
    name: p.name,
    guestNights: stats[p.id].guestNights,
    guestAmount: guestCents[i] / 100,
    washes: stats[p.id].washes,
    extraWashes: extras[i],
    weight: weights[i],
    baseAmount: restShares[i] / 100,
    laundryDiff: (restShares[i] - equalShare) / 100,
    total: (guestCents[i] + restShares[i]) / 100,
  }));

  return { rows, total: totalCents / 100, guestTotal: (totalCents - restCents) / 100, rest: restCents / 100 };
}
