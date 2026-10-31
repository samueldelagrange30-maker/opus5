import type { Metadata } from "next";
import Link from "next/link";
import { repo } from "@/lib/data";
import { SetTile } from "@/components/set-tile";
import { Empty } from "@/components/ui";
import { clsx } from "clsx";
import type { GameId } from "@/lib/types";

export const metadata: Metadata = { title: "Toutes les extensions Pokémon et One Piece", description: "Catalogue complet des extensions Pokémon TCG et One Piece Card Game : logos, dates de sortie, nombre de cartes, codes et listes de cartes avec prix.", alternates: { canonical: "/extensions" } };
export const revalidate = 3600;

export default async function ExtensionsPage({ searchParams }: { searchParams: Promise<{ jeu?: string; tri?: string }> }) {
  const sp = await searchParams;
  const game = sp.jeu === "pokemon" || sp.jeu === "onepiece" ? (sp.jeu as GameId) : undefined;
  const sets = await repo().listSets(game).catch(() => []);
  const sorted = sp.tri === "ancien" ? [...sets].reverse() : sp.tri === "nom" ? [...sets].sort((a, b) => a.name.localeCompare(b.name, "fr")) : sets;
  const tab = (label: string, jeu?: string) => (
    <Link href={jeu ? `/extensions?jeu=${jeu}` : "/extensions"} className={clsx("rounded-xl px-4 py-2 text-sm font-semibold transition", (sp.jeu ?? "") === (jeu ?? "") ? "bg-white text-ink-950" : "text-ink-300 hover:bg-white/[.06]")}>{label}</Link>
  );
  return (
    <div className="container-x pt-8">
      <h1 className="font-display text-3xl font-black text-white sm:text-4xl">Catalogue des extensions</h1>
      <p className="mt-2 text-ink-300">{sets.length} extensions · triées par date de sortie</p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex rounded-2xl border border-white/10 p-1">{tab("Toutes")}{tab("Pokémon", "pokemon")}{tab("One Piece", "onepiece")}</div>
        <div className="ml-auto flex gap-2 text-xs">
          {[["", "Plus récentes"], ["ancien", "Plus anciennes"], ["nom", "Nom"]].map(([v, l]) => (
            <Link key={v} href={`/extensions?${new URLSearchParams({ ...(game ? { jeu: game } : {}), ...(v ? { tri: v } : {}) })}`} className={clsx("chip", (sp.tri ?? "") === v && "border-white/40 text-white")}>{l}</Link>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{sorted.map((s) => <SetTile key={`${s.game}:${s.id}`} set={s} />)}</div>
      {!sets.length && <Empty title="Extensions indisponibles">Les sources de données ne répondent pas pour le moment.</Empty>}
    </div>
  );
}
