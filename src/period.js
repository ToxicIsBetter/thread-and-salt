'use strict';
/**
 * Cadence → reporting window. Pure functions, no clock reads inside the pipeline
 * (asOf is always passed in) so every run is reproducible and testable.
 */

const CADENCES = ['weekly', 'monthly', 'quarterly', 'midyearly', 'yearly'];

const pad = (n) => String(n).padStart(2, '0');
const ym = (y, m) => `${y}-${pad(m)}`;
const iso = (d) => d.toISOString().slice(0, 10);

/** Month arithmetic on a 'YYYY-MM' key. */
function addMonths(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return ym(Math.floor(total / 12), (total % 12) + 1);
}
function monthRange(startKey, endKey) {
  const out = [];
  let k = startKey;
  while (k <= endKey) {
    out.push(k);
    k = addMonths(k, 1);
  }
  return out;
}
const monthName = (key) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Build the window for a cadence.
 * asOf is the run date; every cadence reports on the last COMPLETED period before it.
 * Returns { cadence, kind, label, months[], start, end, requiresGrain, compare{} }
 */
function windowFor(cadence, asOfISO) {
  if (!CADENCES.includes(cadence)) {
    throw new Error(`Unknown cadence "${cadence}". Expected one of: ${CADENCES.join(', ')}`);
  }
  const asOf = new Date(`${asOfISO}T00:00:00Z`);
  const asOfMonth = ym(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1);

  if (cadence === 'weekly') {
    // Last completed Mon–Sun week before asOf. Needs daily grain (Xero).
    const day = asOf.getUTCDay(); // 0=Sun
    const daysSinceMonday = (day + 6) % 7;
    const thisMonday = new Date(asOf);
    thisMonday.setUTCDate(asOf.getUTCDate() - daysSinceMonday);
    const start = new Date(thisMonday);
    start.setUTCDate(thisMonday.getUTCDate() - 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return {
      cadence,
      kind: 'week',
      label: `Week of ${iso(start)}`,
      months: [ym(start.getUTCFullYear(), start.getUTCMonth() + 1)],
      start: iso(start),
      end: iso(end),
      requiresGrain: 'day',
      compare: { priorLabel: 'previous week', yoyLabel: 'same week last year' },
    };
  }

  const lastMonth = addMonths(asOfMonth, -1); // last completed month

  if (cadence === 'monthly') {
    return {
      cadence,
      kind: 'month',
      label: monthName(lastMonth),
      months: [lastMonth],
      start: `${lastMonth}-01`,
      end: endOfMonth(lastMonth),
      requiresGrain: 'month',
      compare: { priorLabel: 'previous month', yoyLabel: 'same month last year' },
    };
  }
  if (cadence === 'quarterly') {
    const months = monthRange(addMonths(lastMonth, -2), lastMonth);
    return {
      cadence,
      kind: 'quarter',
      label: `3 months to ${monthName(lastMonth)}`,
      months,
      start: `${months[0]}-01`,
      end: endOfMonth(lastMonth),
      requiresGrain: 'month',
      compare: { priorLabel: 'previous 3 months', yoyLabel: 'same 3 months last year' },
    };
  }
  if (cadence === 'midyearly') {
    const months = monthRange(addMonths(lastMonth, -5), lastMonth);
    return {
      cadence,
      kind: 'halfyear',
      label: `6 months to ${monthName(lastMonth)}`,
      months,
      start: `${months[0]}-01`,
      end: endOfMonth(lastMonth),
      requiresGrain: 'month',
      compare: { priorLabel: 'previous 6 months', yoyLabel: 'same 6 months last year' },
    };
  }
  // yearly — the last full calendar year
  const year = asOf.getUTCFullYear() - 1;
  const months = monthRange(ym(year, 1), ym(year, 12));
  return {
    cadence,
    kind: 'year',
    label: `FY${year}`,
    months,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    requiresGrain: 'month',
    compare: { priorLabel: 'previous year', yoyLabel: 'previous year' },
  };
}

function endOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m, 0)));
}

/** The equivalent window one year earlier (for YoY). */
function priorYearMonths(months) {
  return months.map((k) => addMonths(k, -12));
}
/** The immediately preceding window of the same length (for MoM / prior-period). */
function priorPeriodMonths(months) {
  const n = months.length;
  return months.map((k) => addMonths(k, -n));
}

/**
 * Which cadences are due on a given date — the calendar equivalent of the five cron
 * expressions in routines/schedules.md. Lets ONE daily routine replace five scheduled
 * ones: it wakes up, asks what's due, and runs only that (usually nothing).
 *
 *   weekly     Mondays                      (cron 0 7 * * 1)
 *   monthly    3rd of every month           (cron 0 7 3 * *)
 *   quarterly  3rd of Jan / Apr / Jul / Oct (cron 0 7 3 1,4,7,10 *)
 *   midyearly  4th of Jan and Jul           (cron 0 7 4 1,7 *)
 *   yearly     5th of January               (cron 0 8 5 1 *)
 */
function dueCadences(asOfISO) {
  const d = new Date(`${asOfISO}T00:00:00Z`);
  const dom = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const isMonday = d.getUTCDay() === 1;
  const due = [];
  if (isMonday) due.push('weekly');
  if (dom === 3) due.push('monthly');
  if (dom === 3 && [1, 4, 7, 10].includes(month)) due.push('quarterly');
  if (dom === 4 && [1, 7].includes(month)) due.push('midyearly');
  if (dom === 5 && month === 1) due.push('yearly');
  return due;
}

module.exports = {
  CADENCES,
  windowFor,
  dueCadences,
  addMonths,
  monthRange,
  monthName,
  priorYearMonths,
  priorPeriodMonths,
  endOfMonth,
};
