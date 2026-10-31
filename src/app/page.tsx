import Link from "next/link";
import { Flame, TrendingDown, TrendingUp, Gem, Search, Newspaper, Activity, Layers } from "lucide-react";
import { repo } from "@/lib/data";
import { getNews } from "@/lib/news";
import { SearchBox } from "@/components/search-box";
import { SetTile } from "@/components/set-tile";
import { CardGrid, CardRow } from "@/components/card-tile";
import { NewsList } from "@/components/news-list";
import { Empty, Notice, SectionHeader } from "@/components/ui";
import { formatPct } from "@/lib/format";
import type { CardListItem, RankingResult } from "@/lib/types";

export const revalidate = 1800;

const settle = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
  try { return await p; } catch (e) { console.error(e); return fallback; }
};
const emptyRanking = (type: RankingResult["type"]): RankingResult => ({ type, items: [], notice: "Données momentanément indisponibles.", available: false });

function marketStats(cards: CardListItem[]) {
  const changes = cards.map((c) => c.price.changes.d7?.pct).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  const median = changes.length ? changes[Math.floor(changes.length / 2)] : null;
  return { tracked: changes.length, up: changes.filter((x) => x > 0).length, down: changes.filter((x) => x < 0).length, median };
}

export default async function Home() {
  const r = repo();
  const [sets, expensive, gainers, losers, searched, news] = await Promise.all([
    settle(r.listSets(), []),
    settle(r.ranking("most-expensive", { limit: 100 }), emptyRanking("most-expensive")),
    settle(r.ranking("gainers-7d", { limit: 100 }), emptyRanking("gainers-7d")),
    settle(r.ranking("losers-7d", { limit: 100 }), emptyRanking("losers-7d")),
    settle(r.ranking("most-searched", { limit: 12 }), emptyRanking("most-searched")),
    settle(getNews(6), { items: [], errors: [] }),
  ]);
  const latest = sets.filter((s) => s.releaseDate && s.releaseDate <= new Date().toISOString().slice(0, 10)).slice(0, 8);
  const pokeStats = marketStats([...gainers.items, ...losers.items].filter((c) => c.game === "pokemon"));
  const opStats = marketStats([...gainers.items, ...losers.items].filter((c) => c.game === "onepiece"));

  return (
    <div className="container-x space-y-14 pt-8">
      {/* Héros */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[.06] bg-gradient-to-br from-ink-900 via-ink-900 to-ink-850 px-6 py-12 sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-poke/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-op/20 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="chip mb-4"><Activity className="h-3 w-3 text-up" /> Prix en euros · Cardmarket · TCGplayer · eBay</p>
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
            La référence des cartes <span className="text-poke">Pokémon</span> et <span className="text-op-glow">One Piece</span>.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-ink-300 sm:text-lg">Toutes les extensions, toutes les cartes en haute définition, et le prix du marché actualisé automatiquement à partir de sources vérifiables.</p>
          <div className="mt-8 max-w-2xl"><SearchBox large /></div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Link href="/recherche" className="btn-ghost"><Search className="h-4 w-4" />Recherche avancée</Link>
            <Link href="/classements" className="btn-ghost"><Flame className="h-4 w-4" />Classements</Link>
          </div>
        </div>
      </section>

      {/* Deux univers */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link href="/pokemon" className="group relative overflow-hidden rounded-3xl border border-poke/20 bg-gradient-to-br from-poke/15 via-poke-deep/10 to-transparent p-8 transition hover:border-poke/50">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-poke">Univers</p>
          <h2 className="mt-1 font-display text-3xl font-black text-white">Pokémon TCG</h2>
          <p className="mt-2 text-sm text-ink-300">{sets.filter((s) => s.game === "pokemon").length || "—"} extensions · Cartes FR/EN · Prix Cardmarket & TCGplayer</p>
          <span className="mt-6 inline-flex text-sm font-semibold text-poke group-hover:underline">Explorer →</span>
        </Link>
        <Link href="/one-piece" className="group relative overflow-hidden rounded-3xl border border-op/20 bg-gradient-to-br from-op/15 via-op-deep/10 to-transparent p-8 transition hover:border-op/50">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-op-glow">Univers</p>
          <h2 className="mt-1 font-display text-3xl font-black text-white">One Piece Card Game</h2>
          <p className="mt-2 text-sm text-ink-300">{sets.filter((s) => s.game === "onepiece").length || "—"} extensions & decks · Versions parallèles · Prix TCGplayer</p>
          <span className="mt-6 inline-flex text-sm font-semibold text-op-glow group-hover:underline">Explorer →</span>
        </Link>
      </section>

      {/* Tendances du marché */}
      <section>
        <SectionHeader title="Tendances du marché" icon={<Activity className="h-5 w-5 text-sky-300" />} subtitle="Répartition des variations de prix sur 7 jours parmi les cartes suivies (≥ 1 €)." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[{ label: "Pokémon", s: pokeStats, color: "text-poke" }, { label: "One Piece", s: opStats, color: "text-op-glow" }].map(({ label, s, color }) => (
            <div key={label} className="panel p-5 lg:col-span-2">
              <p className={`text-xs font-bold uppercase tracking-widest ${color}`}>{label}</p>
              {s.tracked ? (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div><p className="font-display text-2xl font-bold text-up">{s.up}</p><p className="text-xs text-ink-400">en hausse</p></div>
                  <div><p className="font-display text-2xl font-bold text-down">{s.down}</p><p className="text-xs text-ink-400">en baisse</p></div>
                  <div><p className="font-display text-2xl font-bold text-white">{formatPct(s.median)}</p><p className="text-xs text-ink-400">variation médiane</p></div>
                </div>
              ) : <p className="mt-3 text-sm text-ink-400">Données de variation indisponibles pour le moment.</p>}
            </div>
          ))}
        </div>
        {(gainers.notice || expensive.notice) && <div className="mt-3"><Notice>{gainers.notice ?? expensive.notice}</Notice></div>}
      </section>

      {/* Dernières extensions */}
      <section>
        <SectionHeader title="Dernières extensions" href="/extensions" icon={<Layers className="h-5 w-5 text-ink-300" />} />
        {latest.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{latest.map((s) => <SetTile key={`${s.game}:${s.id}`} set={s} />)}</div>
        ) : <Empty title="Extensions indisponibles">Les sources de données ne répondent pas pour le moment. Réessayez dans quelques instants.</Empty>}
      </section>

      {/* Les plus chères */}
      <section>
        <SectionHeader title="Les cartes les plus chères du moment" href="/classements/most-expensive" icon={<Gem className="h-5 w-5 text-op-gold" />} />
        {expensive.items.length ? <CardGrid cards={expensive.items.slice(0, 12)} ranked /> : <Empty title="Prix indisponibles">{expensive.notice}</Empty>}
      </section>

      {/* Hausses / baisses */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <SectionHeader title="Plus fortes hausses (7 j)" href="/classements/gainers-7d" icon={<TrendingUp className="h-5 w-5 text-up" />} />
          {gainers.items.length ? gainers.items.slice(0, 8).map((c, i) => <CardRow key={`${c.game}:${c.id}`} card={c} rank={i + 1} metric="d7" />) : <p className="py-6 text-center text-sm text-ink-400">Données de variation indisponibles.</p>}
        </div>
        <div className="panel p-4">
          <SectionHeader title="Plus fortes baisses (7 j)" href="/classements/losers-7d" icon={<TrendingDown className="h-5 w-5 text-down" />} />
          {losers.items.length ? losers.items.slice(0, 8).map((c, i) => <CardRow key={`${c.game}:${c.id}`} card={c} rank={i + 1} metric="d7" />) : <p className="py-6 text-center text-sm text-ink-400">Données de variation indisponibles.</p>}
        </div>
      </section>

      {/* Les plus recherchées */}
      <section>
        <SectionHeader title="Les cartes les plus recherchées" href="/classements/most-searched" icon={<Search className="h-5 w-5 text-sky-300" />} />
        {searched.items.length ? <CardGrid cards={searched.items.slice(0, 12)} ranked /> : <Empty title="Classement en cours de constitution">{searched.notice}</Empty>}
      </section>

      {/* Actualités */}
      <section>
        <SectionHeader title="Dernières actualités TCG" href="/actualites" icon={<Newspaper className="h-5 w-5 text-ink-300" />} />
        {news.items.length ? <NewsList items={news.items} /> : <Empty title="Actualités indisponibles">Les flux d&apos;actualités ne répondent pas pour le moment.</Empty>}
      </section>
    </div>
  );
}
