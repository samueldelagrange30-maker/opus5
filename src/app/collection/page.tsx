import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clsx } from "clsx";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/config";
import { repo } from "@/lib/data";
import { createCollection, deleteCollection, updateCollectionItem } from "../actions";
import { CardImage } from "@/components/card-image";
import { Empty, Price, cardHref } from "@/components/ui";
import { PriceChart } from "@/components/price-chart";
import { formatEur, formatPct } from "@/lib/format";
import type { GameId } from "@/lib/types";

export const metadata: Metadata = { title: "Ma collection", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  if (!hasSupabase()) return <div className="container-x pt-8"><Empty title="Collections indisponibles">La gestion des collections nécessite Supabase (voir README).</Empty></div>;
  const sb = (await supabaseServer())!;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/connexion");
  const { data: cols } = await sb.from("collections").select("*").order("is_default", { ascending: false }).order("created_at");
  const wanted = (await searchParams).c;
  const current = cols?.find((c) => c.id === wanted) ?? cols?.[0];
  const { data: items } = current ? await sb.from("collection_items").select("*").eq("collection_id", current.id).order("created_at", { ascending: false }) : { data: [] };
  const { data: snaps } = current ? await sb.from("collection_value_snapshots").select("day,value_eur").eq("collection_id", current.id).order("day") : { data: [] };
  const cards = await repo().getCardsByIds((items ?? []).map((i) => ({ game: i.game as GameId, id: i.card_id }))).catch(() => []);
  const byKey = new Map(cards.map((c) => [`${c.game}:${c.id}`, c]));

  let value = 0, cost = 0, costCovered = 0, unpriced = 0;
  for (const i of items ?? []) {
    const p = byKey.get(`${i.game}:${i.card_id}`)?.price.eur ?? null;
    if (p === null) unpriced++;
    else value += p * i.quantity;
    if (i.purchase_price_eur !== null) {
      cost += Number(i.purchase_price_eur) * i.quantity;
      if (p !== null) costCovered += (p - Number(i.purchase_price_eur)) * i.quantity;
    }
  }
  const pl = cost > 0 ? costCovered : null;

  return (
    <div className="container-x space-y-6 pt-8">
      <h1 className="font-display text-3xl font-black text-white">Mes collections</h1>
      <div className="flex flex-wrap items-center gap-2">
        {cols?.map((c) => <Link key={c.id} href={`/collection?c=${c.id}`} className={clsx("rounded-xl px-4 py-2 text-sm font-semibold", c.id === current?.id ? "bg-white text-ink-950" : "border border-white/10 text-ink-200 hover:bg-white/[.06]")}>{c.name}</Link>)}
        <form action={createCollection} className="flex gap-2"><input name="name" placeholder="Nouvelle collection…" className="input w-48" required maxLength={80} /><button className="btn-ghost">Créer</button></form>
      </div>

      {current && (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="panel p-4"><p className="label">Valeur totale</p><Price eur={items?.length ? Math.round(value * 100) / 100 : null} size="lg" />{unpriced > 0 && <p className="text-[11px] text-ink-400">{unpriced} carte(s) sans prix exclue(s)</p>}</div>
            <div className="panel p-4"><p className="label">Prix d&apos;achat total</p><p className="font-display text-xl font-bold">{cost ? formatEur(cost) : "—"}</p></div>
            <div className="panel p-4"><p className="label">Plus / moins-value</p><p className={clsx("font-display text-xl font-bold", pl === null ? "text-ink-400" : pl >= 0 ? "text-up" : "text-down")}>{pl === null ? "—" : `${pl >= 0 ? "+" : ""}${formatEur(pl)}`}</p>{pl !== null && cost > 0 && <p className="text-xs text-ink-400">{formatPct((pl / cost) * 100)}</p>}</div>
            <div className="panel p-4"><p className="label">Cartes</p><p className="font-display text-xl font-bold">{(items ?? []).reduce((a, i) => a + i.quantity, 0)}</p></div>
          </section>

          <section className="panel p-5">
            <h2 className="mb-3 font-display text-lg font-bold">Évolution de la valeur</h2>
            <PriceChart history={(snaps ?? []).map((s) => ({ date: s.day, eur: Number(s.value_eur), source: "Valeur de la collection" }))} averages={[]} />
            {(snaps?.length ?? 0) < 2 && <p className="text-xs text-ink-400">La valeur est enregistrée chaque jour : le graphique apparaît après deux relevés.</p>}
          </section>

          <section className="panel overflow-x-auto p-2">
            {items?.length ? (
              <table className="table-x min-w-[900px]">
                <thead><tr><th>Carte</th><th>Qté</th><th>Langue</th><th>État</th><th>Prix d&apos;achat</th><th>Prix actuel</th><th>Valeur</th><th>+/−</th><th /></tr></thead>
                <tbody>
                  {items.map((i) => {
                    const c = byKey.get(`${i.game}:${i.card_id}`);
                    const p = c?.price.eur ?? null;
                    const diff = p !== null && i.purchase_price_eur !== null ? (p - Number(i.purchase_price_eur)) * i.quantity : null;
                    const formId = `item-${i.id}`;
                    return (
                      <tr key={i.id}>
                        <td>
                          <Link href={cardHref(i.game as GameId, i.card_id)} className="flex items-center gap-3">
                            <div className="w-10 shrink-0"><CardImage src={c?.imageSmall ?? null} alt={c?.name ?? i.card_id} sizes="40px" /></div>
                            <div><p className="font-semibold">{c?.name ?? i.card_id}</p><p className="text-xs text-ink-400">{c?.setName} · {c?.number}</p></div>
                          </Link>
                          <form id={formId} action={updateCollectionItem}><input type="hidden" name="id" value={i.id} /></form>
                        </td>
                        <td><input form={formId} name="quantity" type="number" min={1} defaultValue={i.quantity} className="input w-16 py-1" /></td>
                        <td><select form={formId} name="language" defaultValue={i.language} className="input w-20 py-1">{["fr", "en", "ja", "de", "it", "es"].map((l) => <option key={l}>{l}</option>)}</select></td>
                        <td><select form={formId} name="condition" defaultValue={i.condition} className="input w-20 py-1">{["M", "NM", "EX", "GD", "LP", "PL", "PO"].map((l) => <option key={l}>{l}</option>)}</select></td>
                        <td><input form={formId} name="purchasePrice" inputMode="decimal" defaultValue={i.purchase_price_eur ?? ""} className="input w-24 py-1" /></td>
                        <td><Price eur={p} size="sm" /></td>
                        <td><Price eur={p !== null ? Math.round(p * i.quantity * 100) / 100 : null} size="sm" /></td>
                        <td className={clsx("text-sm font-semibold tabular-nums", diff === null ? "text-ink-400" : diff >= 0 ? "text-up" : "text-down")}>{diff === null ? "—" : `${diff >= 0 ? "+" : ""}${formatEur(diff)}`}</td>
                        <td className="whitespace-nowrap">
                          <button form={formId} className="text-xs text-sky-300 hover:underline">Enregistrer</button>
                          <button form={formId} name="delete" value="1" className="ml-3 text-xs text-down hover:underline">Retirer</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <Empty title="Collection vide">Ajoutez des cartes depuis leur fiche (bouton « Ajouter à ma collection »).</Empty>}
          </section>
          {!current.is_default && <form action={deleteCollection}><input type="hidden" name="id" value={current.id} /><button className="text-xs text-down hover:underline">Supprimer la collection « {current.name} »</button></form>}
        </>
      )}
    </div>
  );
}
