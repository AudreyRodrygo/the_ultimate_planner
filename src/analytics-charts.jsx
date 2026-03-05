import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const _GRID_LIGHT  = "var(--border)";
const _GRID_DARK   = "#181830";
const _TEXT_LIGHT  = "var(--text-secondary)";
const _TEXT_DARK   = "var(--text-muted)";

function WeekTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const learned = payload.find(p => p.dataKey === "learnedH");
  const worked  = payload.find(p => p.dataKey === "workedH");
  const tLearn  = payload[0]?.payload?.targetLearnH ?? 0;
  const tWork   = payload[0]?.payload?.targetWorkH  ?? 0;
  const pctLearn = tLearn > 0 ? Math.round(((learned?.value ?? 0) / tLearn) * 100) : 0;
  const pctWork  = tWork  > 0 ? Math.round(((worked?.value  ?? 0) / tWork)  * 100) : 0;
  return (
    <div style={{ background:"var(--card-bg)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 12px", fontSize:12 }}>
      <div style={{ fontWeight:600, marginBottom:4, color:"var(--text-primary)" }}>{label}</div>
      <div style={{ color:"#818CF8" }}>Учёба: {learned?.value ?? 0} ч ({pctLearn}% цели)</div>
      <div style={{ color:"#22D3EE" }}>Работа: {worked?.value  ?? 0} ч ({pctWork}% цели)</div>
    </div>
  );
}

function HeatTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background:"var(--card-bg)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 10px", fontSize:12 }}>
      <div style={{ color:"var(--text-primary)" }}>{d.date}</div>
      <div style={{ color:"#4ADE80" }}>{d.total} ч</div>
    </div>
  );
}

function heatColor(value, max) {
  if (!value || max === 0) return null;
  const t = Math.min(value / max, 1);
  const r = Math.round(30  + t * (74  - 30));
  const g = Math.round(41  + t * (222 - 41));
  const b = Math.round(59  + t * (128 - 59));
  return `rgb(${r},${g},${b})`;
}

export const AnalyticsCharts = React.memo(function AnalyticsCharts({ data, theme = "dark" }) {
  const isDark   = theme === "dark";
  const gridCol  = isDark ? _GRID_DARK  : _GRID_LIGHT;
  const textCol  = isDark ? _TEXT_DARK  : _TEXT_LIGHT;

  const weekData = (data.weeklyProgress ?? []).map(w => ({
    ...w,
    name: w.week.replace(/^\d{4}-/, ""),
  }));

  const catData = [...(data.categoryProgress ?? [])]
    .filter(c => c.totalH > 0)
    .sort((a, b) => {
      const aFull = a.doneH >= a.totalH;
      const bFull = b.doneH >= b.totalH;
      if (aFull !== bFull) return aFull ? 1 : -1;
      return (b.totalH - b.doneH) - (a.totalH - a.doneH);
    })
    .map(c => ({
      ...c,
      pct: c.totalH > 0 ? Math.round((c.doneH / c.totalH) * 100) : 0,
    }));

  const daily   = data.dailyActivity ?? [];
  const maxHeat = Math.max(...daily.map(d => d.hoursLearned + d.hoursWorked), 1);

  const heatWeeks = [];
  const DOW_LABELS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

  for (const d of daily) {
    const dt  = new Date(d.date + "T00:00:00");
    const dow = (dt.getDay() + 6) % 7;
    const mon = new Date(dt);
    mon.setDate(dt.getDate() - dow);
    const weekKey = mon.toISOString().split("T")[0];

    let week = heatWeeks.find(w => w.key === weekKey);
    if (!week) { week = { key: weekKey, cells: Array(7).fill(null) }; heatWeeks.push(week); }
    week.cells[dow] = { date: d.date, total: Math.round((d.hoursLearned + d.hoursWorked) * 10) / 10 };
  }
  heatWeeks.sort((a, b) => a.key.localeCompare(b.key));

  const CELL = 14;
  const GAP  = 3;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:32 }}>

      {weekData.length > 0 && <div>
        <div style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", marginBottom:10 }}>
          Прогресс по неделям
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={weekData} margin={{ top:10, right:16, left:-10, bottom:0 }}>
            <defs>
              <linearGradient id="gradLearn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#818CF8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradWork" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22D3EE" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridCol} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize:11, fill:textCol }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:11, fill:textCol }} axisLine={false} tickLine={false} unit="ч" />
            <Tooltip content={<WeekTooltip />} />
            <Legend
              wrapperStyle={{ fontSize:12, paddingTop:8 }}
              formatter={(value) => (
                <span style={{ color:textCol }}>
                  {value === "learnedH" ? "Учёба" : "Работа"}
                </span>
              )}
            />
            {weekData.map(w => (
              <ReferenceLine key={`tl-${w.name}`} x={w.name} y={w.targetLearnH}
                stroke="#818CF8" strokeDasharray="4 3" strokeOpacity={0.5} ifOverflow="extendDomain" />
            ))}
            {weekData.map(w => (
              <ReferenceLine key={`tw-${w.name}`} x={w.name} y={w.targetWorkH}
                stroke="#22D3EE" strokeDasharray="4 3" strokeOpacity={0.5} ifOverflow="extendDomain" />
            ))}
            <Area type="monotone" dataKey="learnedH" stroke="#818CF8" strokeWidth={2}
              fill="url(#gradLearn)" dot={false} activeDot={{ r:4 }} />
            <Area type="monotone" dataKey="workedH"  stroke="#22D3EE" strokeWidth={2}
              fill="url(#gradWork)"  dot={false} activeDot={{ r:4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>}

      {catData.length > 0 && <div>
        <div style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", marginBottom:10 }}>
          По категориям
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {catData.map(c => (
            <div key={c.cat} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{
                width:130, fontSize:11, color:textCol,
                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", flexShrink:0,
              }}>
                {c.label}
              </div>
              <div style={{
                flex:1, height:10, borderRadius:5,
                background: isDark ? "#1e293b" : "var(--border)",
                overflow:"hidden",
              }}>
                <div style={{
                  height:"100%", borderRadius:5,
                  width: `${c.pct}%`,
                  background: c.color,
                  transition: "width .4s ease",
                }} />
              </div>
              <div style={{ fontSize:11, color:textCol, whiteSpace:"nowrap", minWidth:52, textAlign:"right" }}>
                {c.doneH} / {c.totalH} ч
              </div>
            </div>
          ))}
        </div>
      </div>}

      {heatWeeks.length > 0 && <div>
        <div style={{ display:"flex", gap:GAP, marginBottom:GAP, marginLeft:0 }}>
          {DOW_LABELS.map(lbl => (
            <div key={lbl} style={{
              width:CELL, textAlign:"center", fontSize:9, color:textCol, lineHeight:1,
            }}>{lbl}</div>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:GAP }}>
          {heatWeeks.map(week => (
            <div key={week.key} style={{ display:"flex", gap:GAP }}>
              {week.cells.map((cell, i) => {
                const col = cell ? heatColor(cell.total, maxHeat) : null;
                return (
                  <div
                    key={i}
                    title={cell ? `${cell.date}: ${cell.total} ч` : undefined}
                    style={{
                      width:CELL, height:CELL, borderRadius:2, flexShrink:0,
                      background: col ?? (isDark ? "#1e293b" : "var(--border)"),
                      opacity: cell ? 1 : 0.4,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>}

    </div>
  );
});

export const ReadingProgressPanel = React.memo(function ReadingProgressPanel({ data, theme = "dark" }) {
  const isDark  = theme === "dark";
  const textSub = isDark ? "var(--text-muted)" : "var(--text-secondary)";
  const trackBg = isDark ? "#1e293b" : "var(--border)";

  const books = data.readingProgress ?? [];
  if (books.length === 0) {
    return (
      <div style={{ color: textSub, fontSize: 13, padding: "12px 0" }}>
        Книги не добавлены
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {books.map(book => {
        const pct = book.totalPages > 0
          ? Math.min(100, Math.round((book.readPages / book.totalPages) * 100))
          : 0;

        let projLabel = null;
        if (book.pagesPerDay > 0 && book.readPages < book.totalPages) {
          const daysLeft = Math.ceil((book.totalPages - book.readPages) / book.pagesPerDay);
          const proj = new Date();
          proj.setDate(proj.getDate() + daysLeft);
          projLabel = proj.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
        } else if (book.readPages >= book.totalPages) {
          projLabel = "Прочитана";
        }

        return (
          <div key={book.bookId}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                📖 {book.title}
              </div>
              <div style={{ fontSize: 12 }}>
                {book.onTrack
                  ? <span style={{ color: "#4ADE80" }}>✅ в графике</span>
                  : <span style={{ color: "#FCD34D" }}>⚠️ отстаёт</span>
                }
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: trackBg, overflow: "hidden", marginBottom: 5 }}>
              <div style={{
                height: "100%", borderRadius: 4,
                width: `${pct}%`,
                background: book.onTrack ? "#4ADE80" : "#FCD34D",
                transition: "width .4s ease",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: textSub }}>
              <span>
                {book.readPages} из {book.totalPages} стр · ~{book.pagesPerDay} стр/день
              </span>
              {projLabel && (
                <span>финиш ~{projLabel}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export const SummaryStats = React.memo(function SummaryStats({ summary, weeklyProgress = [], theme = "dark" }) {
  const isDark  = theme === "dark";
  const textSub = isDark ? "var(--text-muted)" : "var(--text-secondary)";
  const cardBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  const weeks = [...weeklyProgress].sort((a, b) => a.week.localeCompare(b.week));
  const cur  = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];

  const trendLearn = !cur || !prev ? 0 : Math.sign(cur.learnedH - prev.learnedH);
  const trendWork  = !cur || !prev ? 0 : Math.sign(cur.workedH  - prev.workedH);
  const curTotal  = cur  ? (cur.learnedH  + cur.workedH)  : null;
  const prevTotal = prev ? (prev.learnedH + prev.workedH) : null;
  const trendAvg  = curTotal === null || prevTotal === null ? 0 : Math.sign(curTotal - prevTotal);
  const trendPct  = trendLearn;

  const TrendIcon = ({ dir }) => {
    if (dir > 0) return <span style={{ color: "#4ADE80", fontSize: 13 }}>↑</span>;
    if (dir < 0) return <span style={{ color: "#F87171", fontSize: 13 }}>↓</span>;
    return <span style={{ color: textSub, fontSize: 13 }}>→</span>;
  };

  const cards = [
    { emoji: "📚", value: summary.totalHoursLearned, unit: "ч", label: "Часов учёбы",   trend: trendLearn },
    { emoji: "💻", value: summary.totalHoursWorked,  unit: "ч", label: "Часов работы",  trend: trendWork  },
    { emoji: "📈", value: summary.avgDailyHours,      unit: "ч", label: "Среднее в день", trend: trendAvg  },
    { emoji: "🎯", value: `${summary.completionRate}`, unit: "%", label: "Выполнено задач", trend: trendPct },
  ];

  return (
    <div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 10,
        marginBottom: 14,
      }}>
        {cards.map(card => (
          <div key={card.label} style={{
            background: cardBg,
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                {card.value}
              </span>
              <span style={{ fontSize: 13, color: textSub }}>{card.unit}</span>
              <TrendIcon dir={card.trend} />
            </div>
            <div style={{ fontSize: 11, color: textSub }}>
              {card.emoji} {card.label}
            </div>
          </div>
        ))}
      </div>

      {(summary.mostProductiveDay || summary.mostProductiveTime) && (
        <div style={{ fontSize: 12, color: textSub, textAlign: "center" }}>
          {summary.mostProductiveDay && (
            <>Самый продуктивный день: <strong style={{ color: "var(--text-primary)" }}>{summary.mostProductiveDay}</strong></>
          )}
          {summary.mostProductiveDay && summary.mostProductiveTime && " · "}
          {summary.mostProductiveTime && (
            <>Лучшее время: <strong style={{ color: "var(--text-primary)" }}>{summary.mostProductiveTime}</strong></>
          )}
        </div>
      )}
    </div>
  );
});
