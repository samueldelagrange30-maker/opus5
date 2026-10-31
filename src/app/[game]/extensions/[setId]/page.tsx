import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { repo } from "@/lib/data";
import { GAMES, gameFromSlug, type SortKey } from "@/lib/types";
import { SetLogo } from "@/components/set-tile";
import { CardGrid } from "@/components/card-tile";
import { Empty, GameBadge, Notice, Price, gameHref } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { matches, sortCards } from "@/lib/data/filters";

// Rendu à la demande puis mis en cache (ISR).
export async function generateStaticParams() {
  return [];
}

export const revalidate = 3600;

const LANG_LABELS: Record<string, string> = { fr: "Français", en: "Anglais", de: "Allemand", it: "Italien", es: "Espagnol", pt: "Portugais", ja: "Japonais" };

type Params = { game: string; setId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const game = gameFromSlug(p.game);
  if (!game) return {};
  const set = await repo().getSet(game, decodeURIComponent(p.setId)).catch(() => null);
  if (!set) return { title: "Extension introuvable" };
  return {
    title: `${set.name} (${set.code}) — liste des cartes et prix`,
    description: `Liste complète des ${set.totalCards ?? ""} cartes de l'extension ${set.name} (${GAMES[game].name}) avec images HD et prix en euros actualisés.`,
    alternates: { canonical: `${gameHref(game)}/extensions/${set.id}` },
    openGraph: set.logoUrl ? { images: [set.logoUrl] } : undefined,
  };
}

export default async function SetPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await params;
  const sp = await searchParams;
  const game = gameFromSlug(p.game);
  if (!game) notFound();
  const setId = decodeURIComponent(p.setId);
  const r = repo();
  const [set, cards] = await Promise.all([r.getSet(game, setId), r.getSetCards(game, setId).catch(() => [])]);
  if (!set) notFound();

  const sort = (sp.tri as SortKey) ?? "number";
  const filtered = sortCards(cards.filter((c) => matches(c, {
    q: sp.q, rarity: sp.rarete, version: sp.version === "alternate" ? "alternate" : sp.version === "normal" ? "normal" : undefined,
  })), sort);
  const priced = cards.filter((c) => c.price.eur !== null);
  const total = priced.reduce((a, c) => a + (c.price.eur ?? 0), 0);
  const top = [...priced].sort((a, b) => (b.price.eur ?? 0) - (a.price.eur ?? 0))[0];
  const rarities = [...new Set(cards.map((c) => c.rarity).filter(Boolean))] as string[];
  const lastUpdate = priced.map((c) => c.price.updatedAt).filter(Boolean).sort().at(-1);

  const jsonLd = { "@context": "https://schema.org", "@type": "CreativeWorkSeries", name: set.name, datePublished: set.releaseDate ?? undefined, publisher: game === "pokemon" ? "The Pokémon Company" : "Bandai" };

  return (
    <div className="container-x pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="mb-4 text-xs text-ink-400"><Link href={gameHref(game)} className="hover:text-white">{GAMES[game].name}</Link> / <Link href={`/extensions?jeu=${game}`} className="hover:text-white">Extensions</Link> / <span className="text-ink-200">{set.name}</span></nav>
      <section className="panel grid gap-6 p-6 md:grid-cols-[280px_1fr] md:p-8">
        <SetLogo set={set} className="h-32 md:h-40" />
        <div>
          <div className="flex flex-wrap items-center gap-2"><GameBadge game={game} /><span className="chip">Code : {set.code}</span>{set.series && <span className="chip">{set.series}</span>}</div>
          <h1 className="mt-2 font-display text-3xl font-black text-white sm:text-4xl">{set.name}</h1>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><dt className="label">Sortie</dt><dd className="font-semibold">{formatDate(set.releaseDate)}</dd></div>
            <div><dt className="label">Cartes</dt><dd className="font-semibold">{set.totalCards ?? "?"}{set.officialCards && set.officialCards !== set.totalCards ? ` (${set.officialCards} officielles)` : ""}</dd></div>
            <div><dt className="label">Série / génération</dt><dd className="font-semibold">{set.generation ?? set.series ?? "—"}</dd></div>
            <div><dt className="label">Langues</dt><dd className="font-semibold">{set.languages.map((l) => LANG_LABELS[l] ?? l).join(", ") || "—"}</dd></div>
            <div><dt className="label">Éditions</dt><dd className="font-semibold">{set.editions.join(", ") || "—"}</dd></div>
            <div><dt className="label">Valeur du set (1 ex. de chaque)</dt><dd><Price eur={priced.length ? Math.round(total * 100) / 100 : null} /></dd><dd className="text-[11px] text-ink-400">{priced.length}/{cards.length} cartes cotées</dd></div>
            <div><dt className="label">Carte la plus chère</dt><dd className="truncate font-semibold">{top ? `${top.name}` : "—"}</dd>{top && <dd><Price eur={top.price.eur} size="sm" /></dd>}</div>
            <div><dt className="label">Source</dt><dd className="font-semibold">{set.source}</dd></div>
          </dl>
        </div>
      </section>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <div className="min-w-[200px] flex-1"><label className="label" htmlFor="q">Filtrer</label><input id="q" name="q" defaultValue={sp.q} placeholder="Nom, numéro…" className="input" /></div>
        <div><label className="label" htmlFor="rarete">Rareté</label>
          <select id="rarete" name="rarete" defaultValue={sp.rarete ?? ""} className="input"><option value="">Toutes</option>{rarities.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor="version">Version</label>
          <select id="version" name="version" defaultValue={sp.version ?? ""} className="input"><option value="">Toutes</option><option value="normal">Normale</option><option value="alternate">Alternative</option></select></div>
        <div><label className="label" htmlFor="tri">Trier par</label>
          <select id="tri" name="tri" defaultValue={sort} className="input">
            <option value="number">Numéro de carte</option><option value="price-desc">Prix décroissant</option><option value="price-asc">Prix croissant</option>
            <option value="change-desc">Plus fortes hausses</option><option value="change-asc">Plus fortes baisses</option><option value="name">Ordre alphabétique</option>
          </select></div>
        <button className="btn-primary">Appliquer</button>
      </form>

      <div className="mb-3 mt-6 flex items-center justify-between text-sm text-ink-300">
        <span>{filtered.length} carte(s)</span>
        {lastUpdate && <span className="text-xs">Prix actualisés le {new Date(lastUpdate).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</span>}
      </div>
      {game === "onepiece" && <div className="mb-4"><Notice>Prix TCGplayer (marché américain, USD) convertis en euros au taux BCE du jour. Ajoutez une clé JustTCG ou l&apos;accès Cardmarket pour d&apos;autres marchés.</Notice></div>}
      {filtered.length ? <CardGrid cards={filtered} showGame={false} /> : <Empty title="Aucune carte">Aucune carte ne correspond à ces critères, ou la source ne répond pas.</Empty>}
    </div>
  );
}
