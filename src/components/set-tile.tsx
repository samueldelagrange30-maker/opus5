import Link from "next/link";
import Image from "next/image";
import { clsx } from "clsx";
import { GameBadge, setHref } from "./ui";
import { formatDate } from "@/lib/format";
import type { TcgSet } from "@/lib/types";

export function SetLogo({ set, className }: { set: TcgSet; className?: string }) {
  if (set.logoUrl) {
    return (
      <div className={clsx("relative h-20 w-full", className)}>
        <Image src={set.logoUrl} alt={`Logo ${set.name}`} fill sizes="240px" className="object-contain drop-shadow-[0_6px_20px_rgba(0,0,0,.5)]" unoptimized={!set.logoUrl.includes("tcgdex")} />
      </div>
    );
  }
  // One Piece : pas de logo dans l'API → visuel de la carte Leader + code officiel
  return (
    <div className={clsx("relative flex h-20 w-full items-center justify-center overflow-hidden rounded-xl", className)}>
      {set.imageUrl && <Image src={set.imageUrl} alt="" fill sizes="240px" className="object-cover object-top opacity-30 blur-[1px]" unoptimized={!set.imageUrl.includes("optcgapi")} />}
      <span className={clsx("relative font-display text-2xl font-black tracking-tight", set.game === "onepiece" ? "text-op-gold" : "text-poke")}>{set.code}</span>
    </div>
  );
}

export function SetTile({ set }: { set: TcgSet }) {
  return (
    <Link href={setHref(set.game, set.id)} className="group panel panel-hover flex flex-col gap-3 p-4">
      <SetLogo set={set} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-1 font-semibold text-white">{set.name}</p>
          <p className="text-xs text-ink-300">{set.series ?? "—"}</p>
        </div>
        <GameBadge game={set.game} />
      </div>
      <div className="flex items-center justify-between text-xs text-ink-300">
        <span>{formatDate(set.releaseDate)}</span>
        <span className="chip">{set.totalCards ?? "?"} cartes · {set.code}</span>
      </div>
    </Link>
  );
}
