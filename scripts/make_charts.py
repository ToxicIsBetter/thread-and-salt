#!/usr/bin/env python3
"""Regenerate the two revenue charts used in the sample management-accounts report.
Reads the finance workbook, writes chart_monthly.png and chart_quarterly.png.
Run from repo root:  python scripts/make_charts.py
Deps: matplotlib, openpyxl  (pip install matplotlib openpyxl)
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "data", "Scenario-2-Thread-Salt-Finance-History.xlsx")
OUT = os.path.join(ROOT, "deliverables")

NAVY, TEAL, RED = "#1F3A4D", "#2E6E7E", "#B4553F"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})

wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["Monthly Revenue History"]
rows = [r for r in ws.iter_rows(values_only=True)][1:]
data = [(r[0], r[1]) for r in rows if r[0] and isinstance(r[1], (int, float))]
months = [m for m, _ in data]
rev = [v for _, v in data]

# monthly line
fig, ax = plt.subplots(figsize=(9, 3.1), dpi=150)
ax.plot(range(len(rev)), rev, color=NAVY, lw=2, marker="o", ms=3.2)
ax.scatter([len(rev) - 1], [rev[-1]], color=RED, zorder=5, s=45)
ax.annotate("Jul 2026\n-24% MoM", (len(rev) - 1, rev[-1]), textcoords="offset points",
            xytext=(-6, 18), ha="center", fontsize=8.5, color=RED, fontweight="bold")
ticks = [i for i, m in enumerate(months) if m.endswith("-01") or i == len(months) - 1]
ax.set_xticks(ticks); ax.set_xticklabels([months[i] for i in ticks], fontsize=8)
ax.yaxis.set_major_formatter(FuncFormatter(lambda x, _: f"£{x/1000:.0f}k"))
ax.set_ylim(30000, 75000)
for s in ["top", "right"]:
    ax.spines[s].set_visible(False)
ax.grid(axis="y", color="#eee", lw=0.8); ax.set_axisbelow(True)
ax.set_title("Monthly revenue - Jan 2024 to Jul 2026", color=NAVY, fontweight="bold",
             fontsize=11, loc="left", pad=8)
plt.tight_layout(); plt.savefig(os.path.join(OUT, "chart_monthly.png"), bbox_inches="tight"); plt.close()

# quarterly bars
from collections import OrderedDict
q = OrderedDict()
for m, v in data:
    y, mo = m.split("-"); qn = (int(mo) - 1) // 3 + 1
    q.setdefault(f"{y[2:]} Q{qn}", 0); q[f"{y[2:]} Q{qn}"] += v
labels, vals = list(q.keys()), list(q.values())
colors = [TEAL] * len(vals); colors[-1] = RED
fig, ax = plt.subplots(figsize=(9, 3.0), dpi=150)
ax.bar(labels, vals, color=colors, width=0.66)
ax.yaxis.set_major_formatter(FuncFormatter(lambda x, _: f"£{x/1000:.0f}k"))
for s in ["top", "right"]:
    ax.spines[s].set_visible(False)
ax.grid(axis="y", color="#eee", lw=0.8); ax.set_axisbelow(True)
ax.tick_params(axis="x", labelsize=8.5)
ax.set_title("Revenue by quarter (26 Q3 = July only)", color=NAVY, fontweight="bold",
             fontsize=11, loc="left", pad=8)
plt.tight_layout(); plt.savefig(os.path.join(OUT, "chart_quarterly.png"), bbox_inches="tight"); plt.close()
print("charts written to", OUT)
