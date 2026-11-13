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

/**
 * Calcula cuánto paga cada persona.
 * Pasos:
 *  1) Cada noche de invitado suma guestCost (p. ej. 0,40 €) a quien lo tuvo.
 *  2) Lo que queda de la factura se reparte entre todos con un "peso":
 *     peso = 1 + (pct/100) × lavadoras_extra
 *     (lavadoras_extra = las que superan freeWashesPerWeek en cada semana).
 *     Así quien no se pasa paga la parte normal y quien se pasa paga un pct% más por cada lavadora extra.
 */
export function computeSplit({ people, entries, from, to, total, settings }) {
  const { guestCost = 0.4, freeWashesPerWeek = 2, extraWashPct = 1 } = settings || {};
  const start = dayNumber(from), end = dayNumber(to);
  const totalCents = Math.round(total * 100);

  const stats = Object.fromEntries(people.map(p => [p.id, { guestNights: 0, washes: 0, weeks: {} }]));

  for (const [date, entry] of Object.entries(entries || {})) {
    const n = dayNumber(date);
    if (n < start || n > end) continue;
    for (const [pid, count] of Object.entries(entry.guests || {})) {
      if (stats[pid]) stats[pid].guestNights += count;
    }
    const wk = weekKey(date);
    for (const [pid, count] of Object.entries(entry.washes || {})) {
      if (!stats[pid]) continue;
      stats[pid].washes += count;
      stats[pid].weeks[wk] = (stats[pid].weeks[wk] || 0) + count;
    }
  }

  // Paso 1: invitados
  let guestCents = people.map(p => Math.round(stats[p.id].guestNights * guestCost * 100));
  const guestSum = guestCents.reduce((a, b) => a + b, 0);
  if (guestSum > totalCents) guestCents = splitCents(totalCents, guestCents); // caso raro: invitados > factura

  // Paso 2: resto con pesos por lavadoras extra
  const restCents = totalCents - guestCents.reduce((a, b) => a + b, 0);
  const extras = people.map(p =>
    Object.values(stats[p.id].weeks).reduce((a, c) => a + Math.max(0, c - freeWashesPerWeek), 0));
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
