import { requireAdmin } from "../guard";
import { AdminNav } from "../nav";
import { saveSet } from "../actions";
import Link from "next/link";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminSets({ searchParams }: { searchParams: Promise<{ jeu?: string; edit?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  let q = sb.from("sets").select("*").order("release_date", { ascending: false, nullsFirst: true });
  if (sp.jeu) q = q.eq("game", sp.jeu);
  const { data: sets } = await q;
  const [eg, eid] = (sp.edit ?? "").split(":");
  const editing = sets?.find((s) => s.game === eg && s.set_id === eid) ?? (sp.edit === "new" ? { game: "onepiece", set_id: "", languages: [] } as Record<string, unknown> : null);
  const v = (k: string) => (editing?.[k] as string | number | null | undefined) ?? "";
  return (
    <div className="container-x space-y-6 pt-8">
      <h1 className="font-display text-3xl font-black text-white">Extensions</h1>
      <AdminNav />
      {editing && (
        <form action={saveSet} className="panel grid gap-3 p-5 sm:grid-cols-3">
          <div><label className="label">Jeu</label><select name="game" defaultValue={String(v("game"))} className="input"><option value="pokemon">Pokémon</option><option value="onepiece">One Piece</option></select></div>
          <div><label className="label">Identifiant</label><input name="set_id" defaultValue={String(v("set_id"))} required className="input" /></div>
          <div><label className="label">Code officiel</label><input name="code" defaultValue={String(v("code"))} className="input" /></div>
          <div><label className="label">Nom officiel</label><input name="name" defaultValue={String(v("name"))} className="input" /></div>
          <div><label className="label">Série</label><input name="series" defaultValue={String(v("series"))} className="input" /></div>
          <div><label className="label">Génération / bloc</label><input name="generation" defaultValue={String(v("generation"))} className="input" /></div>
          <div><label className="label">Date de sortie</label><input name="release_date" type="date" defaultValue={String(v("release_date"))} className="input" /></div>
          <div><label className="label">Nombre de cartes</label><input name="total_cards" type="number" defaultValue={String(v("total_cards"))} className="input" /></div>
          <div><label className="label">Langues (fr,en,ja)</label><input name="languages" defaultValue={((editing.languages as string[]) ?? []).join(",")} className="input" /></div>
          <div className="sm:col-span-2"><label className="label">URL du logo</label><input name="logo_url" defaultValue={String(v("logo_url"))} className="input" /></div>
          <div><label className="label">URL du visuel</label><input name="image_url" defaultValue={String(v("image_url"))} className="input" /></div>
          <div><label className="label">Source</label><input name="source" defaultValue={String(v("source") || "Admin")} className="input" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="manual_override" defaultChecked={!!editing.manual_override || sp.edit !== "new"} />Protéger contre l&apos;écrasement par la synchronisation</label>
          <div className="flex items-end gap-2"><button className="btn-primary">Enregistrer</button><Link href="/admin/extensions" className="btn-ghost">Annuler</Link></div>
        </form>
      )}
      <div className="flex gap-2"><Link href="/admin/extensions?edit=new" className="btn-primary">Ajouter une extension</Link><Link href="/admin/extensions?jeu=pokemon" className="btn-ghost">Pokémon</Link><Link href="/admin/extensions?jeu=onepiece" className="btn-ghost">One Piece</Link></div>
      <div className="panel overflow-x-auto p-2">
        <table className="table-x min-w-[800px]">
          <thead><tr><th>Jeu</th><th>Code</th><th>Nom</th><th>Série</th><th>Sortie</th><th>Cartes</th><th>Logo</th><th>Protégée</th><th /></tr></thead>
          <tbody>{(sets ?? []).map((s) => (
            <tr key={`${s.game}:${s.set_id}`}><td>{s.game}</td><td className="font-mono text-xs">{s.code}</td><td className="font-semibold">{s.name}</td><td className="text-xs">{s.series}</td>
              <td className={s.release_date ? "text-xs" : "text-xs text-amber-300"}>{formatDate(s.release_date)}</td><td>{s.total_cards ?? "—"}</td>
              <td className={s.logo_url ? "text-up" : "text-amber-300"}>{s.logo_url ? "✓" : "manquant"}</td><td>{s.manual_override ? "✓" : ""}</td>
              <td><Link href={`/admin/extensions?edit=${s.game}:${encodeURIComponent(s.set_id)}`} className="text-xs text-sky-300 hover:underline">Modifier</Link></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
