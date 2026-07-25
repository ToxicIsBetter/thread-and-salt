'use strict';
/**
 * Rule-based signal detection (Core). Deterministic and fully traceable: every
 * signal carries the exact figures behind it, so GATE 2 can prove the rendered
 * insight box matches what was actually computed.
 *
 * The optional upgrade replaces this with an agentic observe → analyse →
 * recommend → repeat loop; the interface (an array of signals) stays identical.
 */
const { pctChange } = require('../transform/pnl');

const gbp = (pence) => '£' + Math.round(pence / 100).toLocaleString('en-GB');
const pc = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

function detect(model, cfg) {
  const out = [];
  const { headline, period, yoy, prior, monthlySeries, meta } = model;

  // ---- 1. Year-on-year decline: the strongest signal a small brand can get ----
  if (headline.yoyPct != null && headline.yoyPct < 0) {
    const firstEver = isFirstYoyDeclineForThisSlot(model);
    out.push({
      id: 'yoy-decline',
      severity: 'high',
      title: `Watch — ${meta.periodLabel} revenue broke trend`,
      figures: {
        revenuePence: period.revenuePence,
        yoyPct: headline.yoyPct,
        priorPct: headline.priorPct,
        yoyRevenuePence: yoy.revenuePence,
        priorRevenuePence: prior.revenuePence,
      },
      body:
        `${meta.periodLabel} came in at ${gbp(period.revenuePence)} — ` +
        `${pc(headline.priorPct == null ? 0 : headline.priorPct)} on the ${headline.priorLabel} and ` +
        `${pc(headline.yoyPct)} on the ${headline.yoyLabel}.` +
        (firstEver ? ' This is the first time this period has fallen below the same period a year earlier.' : ''),
      action:
        'Treat this as a signal, not noise. Check whether a hero line sold through or stocked out, ' +
        'confirm marketing spend did not pause, and line up a mailing-list drop ahead of the reliable Q4 lift.',
    });
  }

  // ---- 2. Sharp sequential drop, even if still up YoY ----
  if (headline.priorPct != null && headline.priorPct <= -15) {
    out.push({
      id: 'sequential-drop',
      severity: headline.yoyPct != null && headline.yoyPct < 0 ? 'medium' : 'high',
      title: `Sharp fall against the ${headline.priorLabel}`,
      figures: { priorPct: headline.priorPct, revenuePence: period.revenuePence },
      body: `Revenue fell ${pc(headline.priorPct)} versus the ${headline.priorLabel} (${gbp(prior.revenuePence)} → ${gbp(period.revenuePence)}).`,
      action: 'Compare against the usual seasonal shape before acting — some of this may be normal for the time of year.',
    });
  }

  // ---- 3. Growth cooling: trailing 6 months vs the 6 before ----
  const cooling = trailingGrowth(monthlySeries, meta.months[meta.months.length - 1]);
  if (cooling && cooling.recentPct != null && cooling.priorPct != null && cooling.recentPct < cooling.priorPct - 3) {
    out.push({
      id: 'growth-cooling',
      severity: 'medium',
      title: 'Growth is cooling',
      figures: cooling,
      body:
        `The last 6 months grew ${pc(cooling.recentPct)} year-on-year, against ${pc(cooling.priorPct)} ` +
        'for the 6 months before that — the trend was softening before this period.',
      action: 'Worth a look at acquisition: is discovery (social/Instagram) still bringing new customers at the old rate?',
    });
  }

  // ---- 4. Margin compression (fixed costs biting harder than revenue fell) ----
  if (headline.netMarginPct != null && headline.priorPct != null && headline.priorPct < 0) {
    const priorNetMargin = prior.revenuePence > 0 ? (prior.netPence / prior.revenuePence) * 100 : null;
    if (priorNetMargin != null && headline.netMarginPct < priorNetMargin - 1) {
      out.push({
        id: 'margin-compression',
        severity: 'low',
        title: 'Net margin squeezed more than revenue fell',
        figures: { netMarginPct: headline.netMarginPct, priorNetMarginPct: priorNetMargin },
        body:
          `Net margin moved from ${priorNetMargin.toFixed(1)}% to ${headline.netMarginPct.toFixed(1)}%. ` +
          'Because some costs are fixed, a soft period compresses margin by more than the revenue drop alone.',
        action: 'No action needed if the dip is seasonal — but two consecutive periods would be worth a cost review.',
      });
    }
  }

  // ---- 5. Positive: Q4 build-up ahead ----
  const lastMonthNum = Number(meta.months[meta.months.length - 1].slice(5, 7));
  if (lastMonthNum >= 8 && lastMonthNum <= 10) {
    out.push({
      id: 'q4-runway',
      severity: 'info',
      title: 'Q4 is the reliable peak — prepare now',
      figures: {},
      body: 'Every year in the history shows a clear November–December lift.',
      action: 'Lock stock and the mailing-list calendar for the Q4 window while there is still lead time.',
    });
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 };
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  return out;
}

/** Was this the first YoY fall for this calendar slot in the whole series? */
function isFirstYoyDeclineForThisSlot(model) {
  const { monthlySeries, meta } = model;
  const target = meta.months[meta.months.length - 1];
  const slot = target.slice(5, 7);
  const byPeriod = new Map(monthlySeries.map((m) => [m.period, m.revenuePence]));
  const sameSlot = monthlySeries
    .filter((m) => m.period.slice(5, 7) === slot && m.period <= target)
    .map((m) => m.period)
    .sort();
  let priorDeclines = 0;
  for (const p of sameSlot) {
    if (p === target) continue;
    const yearBefore = `${Number(p.slice(0, 4)) - 1}-${slot}`;
    if (byPeriod.has(yearBefore) && byPeriod.get(p) < byPeriod.get(yearBefore)) priorDeclines++;
  }
  return priorDeclines === 0;
}

/** YoY growth of the trailing 6 months vs the 6 months before that. */
function trailingGrowth(series, lastPeriod) {
  const byPeriod = new Map(series.map((m) => [m.period, m.revenuePence]));
  const idx = series.findIndex((m) => m.period === lastPeriod);
  if (idx < 0) return null;
  const window = (endIdx, n) => series.slice(Math.max(0, endIdx - n + 1), endIdx + 1);
  const recent = window(idx, 6);
  const earlier = window(idx - 6, 6);
  const sumYoY = (rows) => {
    let now = 0;
    let then = 0;
    for (const r of rows) {
      const prevKey = `${Number(r.period.slice(0, 4)) - 1}-${r.period.slice(5, 7)}`;
      if (!byPeriod.has(prevKey)) return null;
      now += r.revenuePence;
      then += byPeriod.get(prevKey);
    }
    return pctChange(now, then);
  };
  const recentPct = recent.length === 6 ? sumYoY(recent) : null;
  const priorPct = earlier.length === 6 ? sumYoY(earlier) : null;
  return { recentPct, priorPct };
}

module.exports = { detect };
