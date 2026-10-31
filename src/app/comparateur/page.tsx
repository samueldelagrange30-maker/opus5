import type { Metadata } from "next";
import Link from "next/link";
import { repo } from "@/lib/data";
import { CardImage } from "@/components/card-image";
import { Change, GameBadge, Price, cardHref, Empty } from "@/components/ui";
import { PriceChart } from "@/components/price-chart";
import { formatDate, formatDateTime } from "@/lib/format";
import type { GameId } from "@/lib/types";

export const metadata: Metadata = { title: "Comparateur de cartes", description: "Comparez côte à côte plusieurs cartes Pokémon et One Piece : rareté, extension, prix, historique et évolution." };
export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ cartes?: string }> }) {
  const refs = ((await searchParams).cartes ?? "").split(",").map((s) => {
    const i = s.indexOf(":");
    return { game: s.slice(0, i) as GameId, id: s.slice(i + 1) };
  }).filter((r) => (r.game === "pokemon" || r.game === "onepiece") && r.id).slice(0, 6);

  if (!refs.length) {
    return (
      <div className="container-x pt-8">
        <h1 className="font-display text-3xl font-black text-white">Comparateur de cartes</h1>
        <div className="mt-6"><Empty title="Aucune carte à comparer">Ouvrez la fiche d&apos;une carte et cliquez sur « Comparer » pour l&apos;ajouter (jusqu&apos;à 6 cartes). <Link href="/recherche" className="underline">Rechercher des cartes</Link></Empty></div>
      </div>
    );
  }
  const pages = (await Promise.all(refs.map((r) => repo().getCard(r.game, r.id).catch(() => null)))).filter((p) => !!p);
  const rows: [string, (p: (typeof pages)[number]) => React.ReactNode][] = [
    ["Jeu", (p) => <GameBadge game={p.card.game} />],
    ["Extension", (p) => `${p.card.setName} (${p.card.setCode})`],
    ["Numéro", (p) => p.card.number],
    ["Rareté", (p) => p.card.rarity ?? "—"],
    ["Type", (p) => p.card.category ?? "—"],
    ["Langue", (p) => p.card.language.toUpperCase()],
    ["Version", (p) => (p.card.isAlternate ? p.card.variantLabel ?? "Alternative" : "Normale")],
    ["Date de sortie", (p) => formatDate(p.card.releaseDate)],
    ["Prix du marché", (p) => <Price eur={p.prices.marketEur} size="lg" />],
    ["Prix min / max", (p) => <span className="text-xs"><Price eur={p.prices.lowEur} size="sm" /> — <Price eur={p.prices.highEur} size="sm" /></span>],
    ["Variation 24 h", (p) => <Change change={p.prices.changes.h24} />],
    ["Variation 7 j", (p) => <Change change={p.prices.changes.d7} />],
    ["Variation 30 j", (p) => <Change change={p.prices.changes.d30} />],
    ["Variation 1 an", (p) => <Change change={p.prices.changes.y1} />],
    ["Source", (p) => <span className="text-xs">{p.prices.primary?.sourceLabel ?? "—"}</span>],
    ["Actualisé", (p) => <span className="text-xs">{formatDateTime(p.prices.updatedAt)}</span>],
  ];
  return (
    <div className="container-x pt-8">
      <h1 className="font-display text-3xl font-black text-white">Comparateur de cartes</h1>
      <div className="mt-6 overflow-x-auto">
        <table className="table-x min-w-[720px]">
          <thead>
            <tr><th className="w-36" />{pages.map((p) => (
              <th key={p.card.id} className="align-top normal-case tracking-normal">
                <Link href={cardHref(p.card.game, p.card.id)} className="block w-36 sm:w-44">
                  <CardImage src={p.card.imageSmall} alt={p.card.name} sizes="176px" />
                  <p className="mt-2 text-sm font-semibold text-white">{p.card.name}</p>
                </Link>
              </th>
            ))}</tr>
          </thead>
          <tbody>{rows.map(([label, fn]) => <tr key={label}><td className="text-xs font-medium uppercase tracking-wide text-ink-300">{label}</td>{pages.map((p) => <td key={p.card.id}>{fn(p)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h2 className="h-section mb-4 mt-10">Historique des prix</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => {
          const cm = p.prices.quotes.find((q) => q.source === "cardmarket");
          return (
            <div key={p.card.id} className="panel p-4">
              <p className="mb-2 font-semibold">{p.card.name} <span className="text-xs text-ink-400">{p.card.setCode} · {p.card.number}</span></p>
              <PriceChart history={p.history} averages={cm ? [{ label: "Moy. 30 j", eur: cm.eur.avg30 }, { label: "Moy. 7 j", eur: cm.eur.avg7 }, { label: "Moy. 24 h", eur: cm.eur.avg1 }, { label: "Tendance", eur: cm.eur.trend }] : []} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
