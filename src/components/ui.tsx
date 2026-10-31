import Link from "next/link";
import { clsx } from "clsx";
import { TrendingDown, TrendingUp, Info } from "lucide-react";
import { formatEur, formatPct, PRICE_UNAVAILABLE } from "@/lib/format";
import { GAMES, type GameId, type PriceChange } from "@/lib/types";

export const gameHref = (game: GameId) => `/${GAMES[game].slug}`;
export const cardHref = (game: GameId, id: string) => `${gameHref(game)}/cartes/${encodeURIComponent(id)}`;
export const setHref = (game: GameId, id: string) => `${gameHref(game)}/extensions/${encodeURIComponent(id)}`;

export function GameBadge({ game, className }: { game: GameId; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      game === "pokemon" ? "bg-poke/15 text-poke" : "bg-op/15 text-op-glow", className)}>
      {GAMES[game].short}
    </span>
  );
}

export function Price({ eur, className, size = "md" }: { eur: number | null; className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const missing = eur === null;
  return (
    <span className={clsx("font-display font-bold tabular-nums",
      missing ? "text-ink-400 font-medium" : "text-white",
      size === "sm" && (missing ? "text-[11px]" : "text-sm"),
      size === "md" && (missing ? "text-xs" : "text-base"),
      size === "lg" && (missing ? "text-sm" : "text-xl"),
      size === "xl" && (missing ? "text-lg" : "text-4xl"),
      className)}>
      {missing ? PRICE_UNAVAILABLE : formatEur(eur)}
    </span>
  );
}

export function Change({ change, label, className }: { change: PriceChange | null; label?: string; className?: string }) {
  if (!change) return <span className={clsx("text-xs text-ink-400", className)} title="Variation indisponible">{label ? `${label} ` : ""}—</span>;
  const up = change.pct > 0;
  const flat = change.pct === 0;
  return (
    <span title={change.basis} className={clsx("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
      flat ? "bg-white/5 text-ink-300" : up ? "bg-up/10 text-up" : "bg-down/10 text-down", className)}>
      {!flat && (up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
      {label && <span className="mr-0.5 font-medium opacity-70">{label}</span>}
      {formatPct(change.pct)}
    </span>
  );
}

export function SectionHeader({ title, href, linkLabel = "Tout voir", subtitle, icon }: { title: string; href?: string; linkLabel?: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="h-section flex items-center gap-2">{icon}{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-300">{subtitle}</p>}
      </div>
      {href && <Link href={href} className="shrink-0 text-sm font-medium text-ink-300 transition hover:text-white">{linkLabel} →</Link>}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={clsx("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed",
      tone === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-sky-400/20 bg-sky-400/[.07] text-sky-100")}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold text-white">{title}</p>
      {children && <div className="max-w-lg text-sm text-ink-300">{children}</div>}
    </div>
  );
}
