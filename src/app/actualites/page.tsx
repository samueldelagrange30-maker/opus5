import type { Metadata } from "next";
import { getNews } from "@/lib/news";
import { NewsList } from "@/components/news-list";
import { Empty, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Actualités TCG", description: "Les dernières actualités Pokémon TCG et One Piece Card Game.", alternates: { canonical: "/actualites" } };
export const revalidate = 1800;

export default async function NewsPage() {
  const { items, errors } = await getNews(30);
  return (
    <div className="container-x pt-8">
      <h1 className="font-display text-3xl font-black text-white">Actualités TCG</h1>
      <p className="mt-1 text-sm text-ink-300">Agrégées depuis les flux publics des sites spécialisés (liens vers les articles originaux).</p>
      {errors.length > 0 && <div className="mt-4"><Notice tone="warn">Flux indisponible(s) : {errors.join(", ")}</Notice></div>}
      <div className="mt-6">{items.length ? <NewsList items={items} /> : <Empty title="Aucune actualité disponible">Les flux d&apos;actualités ne répondent pas pour le moment.</Empty>}</div>
    </div>
  );
}
