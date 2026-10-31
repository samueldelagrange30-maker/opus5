import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { repo } from "@/lib/data";
import { GAMES, gameFromSlug } from "@/lib/types";
import { SearchBox } from "@/components/search-box";
import { SetTile } from "@/components/set-tile";
import { CardGrid, CardRow } from "@/components/card-tile";
import { Empty, Notice, SectionHeader } from "@/components/ui";
import { clsx } from "clsx";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const game = gameFromSlug((await params).game);
  if (!game) return {};
  return { title: `${GAMES[game].name} — cartes, extensions et prix`, description: `Toutes les extensions et cartes ${GAMES[game].name} avec leurs prix en euros actualisés, historiques et tendances.`, alternates: { canonical: `/${GAMES[game].slug}` } };
}

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const game = gameFromSlug((await params).game);
  if (!game) notFound();
  const r = repo();
  const [sets, expensive, gainers] = await Promise.all([
    r.listSets(game).catch(() => []),
    r.ranking("most-expensive", { game, limit: 18 }).catch(() => null),
    r.ranking("gainers-7d", { game, limit: 10 }).catch(() => null),
  ]);
  const bySeries = new Map<string, typeof sets>();
  for (const s of sets) bySeries.set(s.series ?? "Autres", [...(bySeries.get(s.series ?? "Autres") ?? []), s]);
  const isPoke = game === "pokemon";

  return (
    <div className="container-x space-y-12 pt-8">
      <section className={clsx("relative overflow-hidden rounded-3xl border p-8 sm:p-12", isPoke ? "border-poke/20 bg-gradient-to-br from-poke/15 via-poke-deep/10 to-ink-900" : "border-op/20 bg-gradient-to-br from-op/15 via-op-deep/10 to-ink-900")}>
        <p className={clsx("text-xs font-bold uppercase tracking-[.25em]", isPoke ? "text-poke" : "text-op-glow")}>Encyclopédie & marché</p>
        <h1 className="mt-2 font-display text-4xl font-black text-white sm:text-5xl">{GAMES[game].name}</h1>
        <p className="mt-3 text-ink-300">{sets.length} extensions référencées · {sets.reduce((a, s) => a + (s.totalCards ?? 0), 0).toLocaleString("fr-FR")} cartes</p>
        <div className="mt-6 max-w-xl"><SearchBox game={game} large /></div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader title="Les plus chères" href={`/classements/most-expensive?jeu=${game}`} />
          {expensive?.items.length ? <CardGrid cards={expensive.items.slice(0, 10)} ranked showGame={false} /> : <Empty title="Prix indisponibles">{expensive?.notice}</Empty>}
        </div>
        <div className="panel h-fit p-4">
          <SectionHeader title="Hausses 7 jours" href={`/classements/gainers-7d?jeu=${game}`} />
          {gainers?.items.length ? gainers.items.map((c, i) => <CardRow key={c.id} card={c} rank={i + 1} metric="d7" />) : <p className="py-6 text-center text-sm text-ink-400">Données de variation indisponibles.</p>}
          {gainers?.notice && <div className="mt-3"><Notice>{gainers.notice}</Notice></div>}
        </div>
      </section>

      <section className="space-y-10">
        <h2 className="h-section">Toutes les extensions</h2>
        {sets.length === 0 && <Empty title="Extensions indisponibles">La source de données ne répond pas pour le moment.</Empty>}
        {[...bySeries.entries()].map(([series, list]) => (
          <div key={series}>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-ink-300">{series} <span className="text-ink-500">· {list.length}</span></h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{list.map((s) => <SetTile key={s.id} set={s} />)}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
