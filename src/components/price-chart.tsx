"use client";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { clsx } from "clsx";
import { formatEur } from "@/lib/format";

interface Point { date: string; eur: number; source: string; variant?: string }
interface Averages { label: string; eur: number | null }

const RANGES = [
  { id: "7", label: "7 j", days: 7 },
  { id: "30", label: "30 j", days: 30 },
  { id: "365", label: "1 an", days: 365 },
  { id: "all", label: "Tout", days: Infinity },
] as const;

const LINE = "#60a5fa";
const GRID = "rgba(255,255,255,.06)";
const AXIS = "#6b7590";

const dateFmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

// Graphique interactif de l'évolution du prix (une série à la fois, sélection de la source).
export function PriceChart({ history, averages }: { history: Point[]; averages: Averages[] }) {
  const series = useMemo(() => {
    const m = new Map<string, Point[]>();
    for (const p of history) {
      const k = `${p.source}${p.variant && p.variant !== "normal" ? ` · ${p.variant}` : ""}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].map(([k, pts]) => [k, pts.sort((a, b) => a.date.localeCompare(b.date))] as const).sort((a, b) => b[1].length - a[1].length);
  }, [history]);
  const [source, setSource] = useState(series[0]?.[0] ?? "");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("all");

  const points = useMemo(() => {
    const pts = series.find(([k]) => k === source)?.[1] ?? [];
    const days = RANGES.find((r) => r.id === range)!.days;
    if (!Number.isFinite(days) || !pts.length) return pts;
    const last = new Date(pts.at(-1)!.date).getTime();
    return pts.filter((p) => new Date(p.date).getTime() >= last - days * 86400000);
  }, [series, source, range]);

  if (points.length >= 2) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-white/10 p-0.5">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)} className={clsx("rounded-lg px-3 py-1 text-xs font-semibold transition", range === r.id ? "bg-white text-ink-950" : "text-ink-300 hover:text-white")}>{r.label}</button>
            ))}
          </div>
          {series.length > 1 && (
            <select value={source} onChange={(e) => setSource(e.target.value)} className="input w-auto py-1 text-xs" aria-label="Source de prix">
              {series.map(([k]) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
        </div>
        <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer>
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={LINE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={dateFmt} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatEur(v)} domain={["auto", "auto"]} />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,.3)", strokeWidth: 1 }}
                contentStyle={{ background: "#11141c", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "#c9cfdd" }}
                labelFormatter={(d) => new Date(String(d)).toLocaleDateString("fr-FR", { dateStyle: "long" })}
                formatter={(v) => [formatEur(Number(v)), "Prix"]}
              />
              <Area type="monotone" dataKey="eur" stroke={LINE} strokeWidth={2} fill="url(#pc-fill)" dot={false} activeDot={{ r: 4, stroke: "#11141c", strokeWidth: 2 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-ink-400">{points.length} relevés · source : {source}</p>
      </div>
    );
  }

  const bars = averages.filter((a) => a.eur !== null) as { label: string; eur: number }[];
  if (bars.length >= 2) {
    return (
      <div>
        <p className="mb-3 text-xs text-ink-300">Moyennes glissantes publiées par Cardmarket (l&apos;historique jour par jour se constitue à chaque synchronisation).</p>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatEur(v)} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,.04)" }} contentStyle={{ background: "#11141c", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12 }} formatter={(v) => [formatEur(Number(v)), "Prix"]} />
              <Bar dataKey="eur" fill={LINE} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
  return <p className="py-10 text-center text-sm text-ink-400">Historique des prix indisponible pour cette carte.</p>;
}
