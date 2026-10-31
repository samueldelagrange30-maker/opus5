"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { clsx } from "clsx";
import { TAG_LABELS, TAGS_BY_GAME } from "@/lib/rarity";
import type { CardTag } from "@/lib/types";

interface Props {
  rarities: string[];
  categories: string[];
  sets: { id: string; name: string; game: string }[];
}

// Panneau de filtres : tous les critères sont combinables et reflétés dans l'URL.
export function FiltersPanel({ rarities, categories, sets }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const game = sp.get("jeu") ?? "";
  const tags = new Set((sp.get("special") ?? "").split(",").filter(Boolean));
  const allTags = (game === "pokemon" ? TAGS_BY_GAME.pokemon : game === "onepiece" ? TAGS_BY_GAME.onepiece : [...TAGS_BY_GAME.pokemon, ...TAGS_BY_GAME.onepiece]) as CardTag[];

  const apply = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v.trim() && k !== "special") p.set(k, v.trim());
    const special = fd.getAll("special").map(String);
    if (special.length) p.set("special", special.join(","));
    start(() => router.push(`/recherche?${p}`));
    setOpen(false);
  };

  return (
    <>
      <button onClick={() => setOpen(!open)} className="btn-ghost w-full lg:hidden"><SlidersHorizontal className="h-4 w-4" />Filtres</button>
      <form
        key={sp.toString()}
        onSubmit={(e) => { e.preventDefault(); apply(e.currentTarget); }}
        className={clsx("panel space-y-4 p-4 lg:block", open ? "block" : "hidden")}
      >
        <div><label className="label" htmlFor="f-q">Nom de la carte</label><input id="f-q" name="q" defaultValue={sp.get("q") ?? ""} className="input" placeholder="ex : Dracaufeu, Luffy" /></div>
        <div><label className="label" htmlFor="f-jeu">Jeu</label>
          <select id="f-jeu" name="jeu" defaultValue={game} className="input" onChange={(e) => apply(e.currentTarget.form!)}>
            <option value="">Pokémon + One Piece</option><option value="pokemon">Pokémon TCG</option><option value="onepiece">One Piece Card Game</option>
          </select></div>
        <div><label className="label" htmlFor="f-ext">Extension</label>
          <select id="f-ext" name="extension" defaultValue={sp.get("extension") ?? ""} className="input">
            <option value="">Toutes</option>
            {sets.filter((s) => !game || s.game === game).map((s) => <option key={`${s.game}:${s.id}`} value={s.id}>{s.name}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="f-num">Numéro</label><input id="f-num" name="numero" defaultValue={sp.get("numero") ?? ""} className="input" placeholder="ex : 199" /></div>
          <div><label className="label" htmlFor="f-perso">{game === "onepiece" ? "Personnage" : "Pokémon / perso"}</label><input id="f-perso" name="personnage" defaultValue={sp.get("personnage") ?? ""} className="input" /></div>
        </div>
        <div><label className="label" htmlFor="f-rar">Rareté</label>
          <select id="f-rar" name="rarete" defaultValue={sp.get("rarete") ?? ""} className="input"><option value="">Toutes</option>{rarities.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div><label className="label" htmlFor="f-type">Type de carte</label>
          <select id="f-type" name="type" defaultValue={sp.get("type") ?? ""} className="input"><option value="">Tous</option>{categories.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div><span className="label">Prix (€)</span>
          <div className="grid grid-cols-2 gap-2">
            <input name="prixMin" inputMode="decimal" defaultValue={sp.get("prixMin") ?? ""} placeholder="Min" className="input" aria-label="Prix minimum" />
            <input name="prixMax" inputMode="decimal" defaultValue={sp.get("prixMax") ?? ""} placeholder="Max" className="input" aria-label="Prix maximum" />
          </div></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="f-lang">Langue</label>
            <select id="f-lang" name="langue" defaultValue={sp.get("langue") ?? ""} className="input"><option value="">Toutes</option><option value="fr">Français</option><option value="en">Anglais</option><option value="ja">Japonais</option></select></div>
          <div><label className="label" htmlFor="f-ver">Version</label>
            <select id="f-ver" name="version" defaultValue={sp.get("version") ?? ""} className="input"><option value="">Toutes</option><option value="normal">Normale</option><option value="alternate">Alternative</option></select></div>
        </div>
        <div><label className="label" htmlFor="f-tend">Évolution du prix (7 j)</label>
          <select id="f-tend" name="tendance" defaultValue={sp.get("tendance") ?? ""} className="input"><option value="">Indifférent</option><option value="up">En hausse</option><option value="down">En baisse</option></select></div>
        <fieldset><legend className="label">Cartes spéciales</legend>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <label key={t} className="cursor-pointer">
                <input type="checkbox" name="special" value={t} defaultChecked={tags.has(t)} className="peer sr-only" />
                <span className="chip peer-checked:border-white/50 peer-checked:bg-white/15 peer-checked:text-white">{TAG_LABELS[t]}</span>
              </label>
            ))}
          </div></fieldset>
        <div><label className="label" htmlFor="f-tri">Trier par</label>
          <select id="f-tri" name="tri" defaultValue={sp.get("tri") ?? ""} className="input">
            <option value="">Pertinence</option><option value="price-desc">Prix décroissant</option><option value="price-asc">Prix croissant</option>
            <option value="name">Ordre alphabétique</option><option value="number">Numéro de carte</option><option value="release-desc">Date de sortie (récent)</option>
            <option value="release-asc">Date de sortie (ancien)</option><option value="change-desc">Plus fortes hausses</option><option value="change-asc">Plus fortes baisses</option>
          </select></div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={pending}>{pending ? "Recherche…" : "Appliquer"}</button>
          <button type="button" className="btn-ghost" onClick={() => start(() => router.push("/recherche"))}>Réinitialiser</button>
        </div>
        <p className="text-[11px] leading-relaxed text-ink-400">L&apos;état de conservation se renseigne dans votre collection ; les prix affichés correspondent à l&apos;état Near Mint / « trend » des sources.</p>
      </form>
    </>
  );
}
