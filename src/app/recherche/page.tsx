import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { repo } from "@/lib/data";
import { filtersToQuery, parseFilters } from "@/lib/data/filters";
import { FiltersPanel } from "@/components/filters-panel";
import { CardGrid } from "@/components/card-tile";
import { Empty, Notice } from "@/components/ui";
import { TrackSearch } from "@/components/track-search";

export const metadata: Metadata = { title: "Recherche avancée de cartes", description: "Recherchez parmi toutes les cartes Pokémon et One Piece : extension, rareté, prix, langue, version alternative, cartes secrètes, SAR, Manga Rare…", alternates: { canonical: "/recherche" } };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const res = await repo().search(f).catch((e) => {
    console.error(e);
    return null;
  });
  const pages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1;
  const pageLink = (n: number) => `/recherche?${filtersToQuery({ ...f, page: n })}`;

  return (
    <div className="container-x pt-8">
      {f.q && <TrackSearch q={f.q} game={f.game} />}
      <h1 className="font-display text-3xl font-black text-white">Recherche avancée</h1>
      <p className="mt-1 text-sm text-ink-300">{res ? `${res.total.toLocaleString("fr-FR")} carte(s)` : "—"}{f.q ? ` pour « ${f.q} »` : ""}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          <Suspense><FiltersPanel rarities={res?.facets.rarities ?? []} categories={res?.facets.categories ?? []} sets={res?.facets.sets ?? []} /></Suspense>
        </aside>
        <div className="space-y-4">
          {res?.notice && <Notice>{res.notice}</Notice>}
          {!res && <Empty title="Recherche momentanément indisponible">Les sources de données ne répondent pas. Réessayez dans quelques instants.</Empty>}
          {res && res.items.length === 0 && <Empty title="Aucun résultat">Essayez d&apos;élargir vos critères de recherche.</Empty>}
          {res && res.items.length > 0 && <CardGrid cards={res.items} />}
          {res && pages > 1 && (
            <nav className="flex items-center justify-center gap-2 pt-4" aria-label="Pagination">
              {f.page! > 1 && <Link href={pageLink(f.page! - 1)} className="btn-ghost">← Précédent</Link>}
              <span className="text-sm text-ink-300">Page {f.page} / {pages}</span>
              {f.page! < pages && <Link href={pageLink(f.page! + 1)} className="btn-ghost">Suivant →</Link>}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
