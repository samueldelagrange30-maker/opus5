import type { Metadata } from "next";
import Link from "next/link";
import { RANKINGS } from "@/lib/data";
import type { RankingType } from "@/lib/types";

export const metadata: Metadata = { title: "Classements et tendances du marché", description: "Top 100 des cartes Pokémon et One Piece les plus chères, plus fortes hausses et baisses, cartes les plus recherchées et populaires.", alternates: { canonical: "/classements" } };

export default function RankingsIndex() {
  return (
    <div className="container-x pt-8">
      <h1 className="font-display text-3xl font-black text-white sm:text-4xl">Classements & tendances</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(RANKINGS) as RankingType[]).map((t) => (
          <Link key={t} href={`/classements/${t}`} className="panel panel-hover p-5">
            <p className="font-display text-lg font-bold text-white">{RANKINGS[t].title}</p>
            <p className="mt-1 text-sm text-ink-300">{RANKINGS[t].description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
