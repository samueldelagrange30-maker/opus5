/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requireAdmin } from "../guard";
import { AdminNav } from "../nav";
import { saveCard } from "../actions";
import { formatEur, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const CHECKS = {
  "sans-image": { label: "Sans image", apply: (q: any) => q.is("image_large", null) },
  "sans-prix": { label: "Sans prix", apply: (q: any) => q.is("price_eur", null) },
  "prix-anciens": { label: "Prix > 3 jours", apply: (q: any) => q.lt("price_updated_at", new Date(Date.now() - 3 * 86400000).toISOString()) },
  "sans-rarete": { label: "Sans rareté", apply: (q: any) => q.is("rarity", null) },
} as const;

export default async function AdminCards({ searchParams }: { searchParams: Promise<{ q?: string; check?: keyof typeof CHECKS; edit?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  let q = sb.from("cards").select("game,card_id,name,set_name,number,rarity,category,character,image_large,image_small,price_eur,price_source,price_updated_at,manual_override").limit(100);
  if (sp.q) q = q.or(`name.ilike.*${sp.q.replace(/[,()*]/g, " ")}*,card_id.ilike.*${sp.q.replace(/[,()*]/g, " ")}*`);
  if (sp.check && CHECKS[sp.check]) q = CHECKS[sp.check].apply(q);
  const { data: cards } = await q.order("price_eur", { ascending: false, nullsFirst: false });
  const [eg, eid] = (sp.edit ?? "").split(":");
  const editing = cards?.find((c) => c.game === eg && c.card_id === eid);
  return (
    <div className="container-x space-y-6 pt-8">
      <h1 className="font-display text-3xl font-black text-white">Cartes & vérification des données</h1>
      <AdminNav />
      <form className="flex flex-wrap gap-2"><input name="q" defaultValue={sp.q} placeholder="Nom ou identifiant…" className="input max-w-sm" /><button className="btn-primary">Rechercher</button>
        {Object.entries(CHECKS).map(([k, c]) => <Link key={k} href={`/admin/cartes?check=${k}`} className="btn-ghost">{c.label}</Link>)}</form>
      {editing && (
        <form action={saveCard} className="panel grid gap-3 p-5 sm:grid-cols-3">
          <input type="hidden" name="game" value={editing.game} /><input type="hidden" name="card_id" value={editing.card_id} />
          <div><label className="label">Nom</label><input name="name" defaultValue={editing.name} className="input" /></div>
          <div><label className="label">Rareté</label><input name="rarity" defaultValue={editing.rarity ?? ""} className="input" /></div>
          <div><label className="label">Type</label><input name="category" defaultValue={editing.category ?? ""} className="input" /></div>
          <div><label className="label">Personnage / Pokémon</label><input name="character" defaultValue={editing.character ?? ""} className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Image HD</label><input name="image_large" defaultValue={editing.image_large ?? ""} className="input" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="manual_override" defaultChecked />Protéger (les prix restent synchronisés)</label>
          <div className="flex gap-2"><button className="btn-primary">Enregistrer</button><Link href="/admin/cartes" className="btn-ghost">Annuler</Link></div>
        </form>
      )}
      <div className="panel overflow-x-auto p-2">
        <table className="table-x min-w-[900px]">
          <thead><tr><th>Jeu</th><th>Id</th><th>Nom</th><th>Extension</th><th>Rareté</th><th>Prix</th><th>Source</th><th>MAJ</th><th /></tr></thead>
          <tbody>{(cards ?? []).map((c) => (
            <tr key={`${c.game}:${c.card_id}`}><td>{c.game}</td><td className="font-mono text-xs">{c.card_id}</td><td className="font-semibold">{c.name}{c.manual_override ? " 🔒" : ""}</td>
              <td className="text-xs">{c.set_name} · {c.number}</td><td className="text-xs">{c.rarity ?? "—"}</td><td>{formatEur(c.price_eur === null ? null : Number(c.price_eur))}</td>
              <td className="text-xs">{c.price_source ?? "—"}</td><td className="text-xs">{timeAgo(c.price_updated_at)}</td>
              <td><Link href={`/admin/cartes?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.check ? { check: sp.check } : {}), edit: `${c.game}:${c.card_id}` })}`} className="text-xs text-sky-300 hover:underline">Modifier</Link></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
