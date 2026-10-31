import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { clsx } from "clsx";
import { RANKINGS, repo } from "@/lib/data";
import { CardGrid } from "@/components/card-tile";
import { Empty, Notice } from "@/components/ui";
import type { GameId, RankingType } from "@/lib/types";

export const revalidate = 1800;
type Params = { type: string };

export function generateStaticParams() {
  return Object.keys(RANKINGS).map((type) => ({ type }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const t = (await params).type as RankingType;
  return RANKINGS[t] ? { title: RANKINGS[t].title, description: RANKINGS[t].description, alternates: { canonical: `/classements/${t}` } } : {};
}

export default async function RankingPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ jeu?: string }> }) {
  const type = (await params).type as RankingType;
  if (!RANKINGS[type]) notFound();
  const jeu = (await searchParams).jeu;
  const game = jeu === "pokemon" || jeu === "onepiece" ? (jeu as GameId) : undefined;
  const res = await repo().ranking(type, { game, limit: 100 }).catch(() => null);
  const tab = (label: string, g?: string) => (
    <Link href={`/classements/${type}${g ? `?jeu=${g}` : ""}`} className={clsx("rounded-xl px-4 py-2 text-sm font-semibold", (jeu ?? "") === (g ?? "") ? "bg-white text-ink-950" : "text-ink-300 hover:bg-white/[.06]")}>{label}</Link>
  );
  return (
    <div className="container-x pt-8">
      <nav className="mb-3 text-xs text-ink-400"><Link href="/classements" className="hover:text-white">Classements</Link></nav>
      <h1 className="font-display text-3xl font-black text-white sm:text-4xl">{RANKINGS[type].title}</h1>
      <p className="mt-1 text-ink-300">{RANKINGS[type].description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <div className="flex rounded-2xl border border-white/10 p-1">{tab("Tous")}{tab("Pokémon", "pokemon")}{tab("One Piece", "onepiece")}</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(RANKINGS) as RankingType[]).filter((t) => t !== type).map((t) => <Link key={t} href={`/classements/${t}${game ? `?jeu=${game}` : ""}`} className="chip hover:text-white">{RANKINGS[t].title.replace("Top 100 des cartes ", "")}</Link>)}
        </div>
      </div>
      {res?.notice && <div className="mt-4"><Notice tone={res.available ? "info" : "warn"}>{res.notice}</Notice></div>}
      <div className="mt-6">
        {res?.items.length ? <CardGrid cards={res.items} ranked /> : <Empty title="Classement indisponible">{res?.notice ?? "Les données ne sont pas disponibles pour le moment."}</Empty>}
      </div>
    </div>
  );
}
