import Link from "next/link";
import { CardImage } from "./card-image";
import { Change, GameBadge, Price, cardHref } from "./ui";
import type { CardListItem } from "@/lib/types";
import { timeAgo } from "@/lib/format";

// Tuile de carte : le prix est toujours affiché directement sous l'image.
export function CardTile({ card, rank, showGame = true, priority }: { card: CardListItem; rank?: number; showGame?: boolean; priority?: boolean }) {
  return (
    <Link href={cardHref(card.game, card.id)} className="group panel panel-hover flex flex-col gap-2 p-2.5 animate-fade-up">
      <div className="relative">
        <CardImage src={card.imageSmall ?? card.imageLarge} alt={`${card.name} — ${card.setName} ${card.number}`} priority={priority} className="transition duration-300 group-hover:scale-[1.02]" />
        {rank !== undefined && (
          <span className="absolute left-1.5 top-1.5 rounded-lg bg-ink-950/85 px-2 py-0.5 font-display text-xs font-bold text-white backdrop-blur">#{rank}</span>
        )}
        {card.isAlternate && <span className="absolute right-1.5 top-1.5 rounded-md bg-op-gold/90 px-1.5 py-0.5 text-[10px] font-bold text-ink-950">ALT</span>}
      </div>
      <div className="flex min-h-[3.75rem] flex-col gap-1 px-0.5">
        <div className="flex items-center gap-1.5">
          {showGame && <GameBadge game={card.game} />}
          <span className="truncate text-[11px] text-ink-300">{card.setCode} · {card.number}</span>
        </div>
        <p className="line-clamp-1 text-sm font-semibold text-ink-100" title={card.name}>{card.name}</p>
        <div className="mt-auto flex items-center justify-between gap-1">
          <Price eur={card.price.eur} size="sm" />
          <Change change={card.price.change} />
        </div>
        {card.price.updatedAt && <p className="text-[10px] text-ink-400" title={card.price.source ?? undefined}>{card.rarity ?? ""}{card.rarity ? " · " : ""}MAJ {timeAgo(card.price.updatedAt)}</p>}
      </div>
    </Link>
  );
}

export function CardGrid({ cards, ranked, showGame = true }: { cards: CardListItem[]; ranked?: boolean; showGame?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {cards.map((c, i) => <CardTile key={`${c.game}:${c.id}`} card={c} rank={ranked ? i + 1 : undefined} showGame={showGame} priority={i < 6} />)}
    </div>
  );
}

// Liste compacte (classements de la page d'accueil)
export function CardRow({ card, rank, metric }: { card: CardListItem; rank: number; metric?: "h24" | "d7" | "d30" }) {
  const change = metric ? card.price.changes[metric] : card.price.change;
  return (
    <Link href={cardHref(card.game, card.id)} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[.04]">
      <span className="w-6 text-right font-display text-sm font-bold text-ink-400">{rank}</span>
      <div className="w-10 shrink-0"><CardImage src={card.imageSmall} alt={card.name} sizes="40px" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{card.name}</p>
        <p className="truncate text-xs text-ink-400"><GameBadge game={card.game} className="mr-1" />{card.setName} · {card.number}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <Price eur={card.price.eur} size="sm" />
        <Change change={change} />
      </div>
    </Link>
  );
}
