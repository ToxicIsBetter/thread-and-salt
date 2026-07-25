'use strict';
/**
 * Chart rendering with @napi-rs/canvas (pure Node — no matplotlib dependency, so
 * this runs anywhere the pipeline runs, including a scheduled cloud agent).
 * Visual language matches the signed-off sample: navy line, teal bars, red accent
 * on the most recent period when it is falling.
 */
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const NAVY = '#1F3A4D';
const TEAL = '#2E6E7E';
const RED = '#B4553F';
const GRID = '#EEEAE1';
const GREY = '#5A5A5A';
const FONT = 'sans-serif';

const money = (pence) => '£' + Math.round(pence / 100 / 1000) + 'k';

function baseCanvas(w, h) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

function title(ctx, text, x, y) {
  ctx.fillStyle = NAVY;
  ctx.font = `bold 17px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function yAxis(ctx, { x0, x1, yTop, yBot, min, max, ticks = 4 }) {
  ctx.textAlign = 'right';
  ctx.font = `13px ${FONT}`;
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const y = yBot - ((v - min) / (max - min)) * (yBot - yTop);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillStyle = GREY;
    ctx.fillText(money(v), x0 - 8, y + 4);
  }
}

/** Monthly revenue line chart over the whole available history. */
function monthlyChart(model, outFile) {
  const W = 1335;
  const H = 450;
  const { c, ctx } = baseCanvas(W, H);
  const series = model.monthlySeries;
  const x0 = 92;
  const x1 = W - 26;
  const yTop = 62;
  const yBot = H - 54;

  const values = series.map((s) => s.revenuePence);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.18 || 1000;
  const min = Math.max(0, rawMin - pad);
  const max = rawMax + pad;

  title(
    ctx,
    `Monthly revenue — ${series[0].period} to ${series[series.length - 1].period}`,
    x0 - 60,
    34
  );
  yAxis(ctx, { x0, x1, yTop, yBot, min, max });

  const xFor = (i) => x0 + (i / Math.max(1, series.length - 1)) * (x1 - x0);
  const yFor = (v) => yBot - ((v - min) / (max - min)) * (yBot - yTop);

  // line
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  series.forEach((s, i) => (i ? ctx.lineTo(xFor(i), yFor(s.revenuePence)) : ctx.moveTo(xFor(i), yFor(s.revenuePence))));
  ctx.stroke();

  // points
  ctx.fillStyle = NAVY;
  series.forEach((s, i) => {
    ctx.beginPath();
    ctx.arc(xFor(i), yFor(s.revenuePence), 2.9, 0, Math.PI * 2);
    ctx.fill();
  });

  // highlight the reporting period's final month
  const lastIdx = series.length - 1;
  const falling = model.headline.priorPct != null && model.headline.priorPct < 0;
  if (falling) {
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(xFor(lastIdx), yFor(series[lastIdx].revenuePence), 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold 13px ${FONT}`;
    // right-anchored just above the point, so a long label never sits on the marker
    ctx.textAlign = 'right';
    const lbl = `${series[lastIdx].period}  ${model.headline.priorPct.toFixed(1)}%`;
    ctx.fillText(lbl, Math.min(xFor(lastIdx) - 12, x1), yFor(series[lastIdx].revenuePence) - 14);
  }

  // x labels — every January plus the final point
  ctx.fillStyle = GREY;
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'center';
  series.forEach((s, i) => {
    if (s.period.endsWith('-01') || i === lastIdx) {
      ctx.fillText(s.period, xFor(i), yBot + 22);
    }
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, c.toBuffer('image/png'));
  return outFile;
}

/** Revenue by quarter, grouped bars per year. */
function quarterlyChart(model, outFile) {
  const W = 1335;
  const H = 435;
  const { c, ctx } = baseCanvas(W, H);
  const { years, rows } = model.quarters;
  const x0 = 92;
  const x1 = W - 26;
  const yTop = 62;
  const yBot = H - 54;

  const bars = [];
  for (const row of rows) {
    for (const y of years) {
      const cell = row.byYear[y];
      if (cell) bars.push({ label: `${y.slice(2)} ${row.quarter}`, value: cell.revenuePence, partial: cell.monthCount < 3 });
    }
  }
  bars.sort((a, b) => (a.label < b.label ? -1 : 1));

  const max = Math.max(...bars.map((b) => b.value)) * 1.12;
  title(ctx, 'Revenue by quarter', x0 - 60, 34);
  yAxis(ctx, { x0, x1, yTop, yBot, min: 0, max });

  const slot = (x1 - x0) / bars.length;
  const bw = Math.min(slot * 0.66, 54);
  bars.forEach((b, i) => {
    const cx = x0 + slot * (i + 0.5);
    const h = (b.value / max) * (yBot - yTop);
    ctx.fillStyle = b.partial ? RED : TEAL;
    ctx.fillRect(cx - bw / 2, yBot - h, bw, h);
    ctx.fillStyle = GREY;
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(b.label, cx, yBot + 20);
  });

  if (bars.some((b) => b.partial)) {
    ctx.fillStyle = RED;
    ctx.font = `italic 12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('red = incomplete quarter', x1, 50);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, c.toBuffer('image/png'));
  return outFile;
}

function renderCharts(model, dir) {
  return {
    monthly: monthlyChart(model, path.join(dir, 'chart_monthly.png')),
    quarterly: quarterlyChart(model, path.join(dir, 'chart_quarterly.png')),
  };
}

module.exports = { renderCharts, monthlyChart, quarterlyChart };
