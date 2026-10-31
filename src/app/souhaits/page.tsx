import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/config";
import { repo } from "@/lib/data";
import { updateWishlistItem } from "../actions";
import { CardImage } from "@/components/card-image";
import { Change, Empty, Price, cardHref } from "@/components/ui";
import type { GameId } from "@/lib/types";

export const metadata: Metadata = { title: "Liste de souhaits", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  if (!hasSupabase()) return <div className="container-x pt-8"><Empty title="Liste de souhaits indisponible">Cette fonctionnalité nécessite Supabase (voir README).</Empty></div>;
  const sb = (await supabaseServer())!;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/connexion");
  const { data: items } = await sb.from("wishlist_items").select("*").order("created_at", { ascending: false });
  const cards = await repo().getCardsByIds((items ?? []).map((i) => ({ game: i.game as GameId, id: i.card_id }))).catch(() => []);
  const byKey = new Map(cards.map((c) => [`${c.game}:${c.id}`, c]));
  return (
    <div className="container-x space-y-6 pt-8">
      <div><h1 className="font-display text-3xl font-black text-white">Liste de souhaits</h1><p className="text-sm text-ink-300">Fixez un objectif de prix : une alerte est créée dès que le prix du marché passe en dessous (vérification après chaque synchronisation).</p></div>
      {items?.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => {
            const c = byKey.get(`${i.game}:${i.card_id}`);
            const reached = c?.price.eur != null && i.target_price_eur != null && c.price.eur <= Number(i.target_price_eur);
            return (
              <div key={i.id} className={`panel flex gap-4 p-4 ${reached ? "border-up/40" : ""}`}>
                <Link href={cardHref(i.game as GameId, i.card_id)} className="w-24 shrink-0"><CardImage src={c?.imageSmall ?? null} alt={c?.name ?? i.card_id} sizes="96px" /></Link>
                <div className="min-w-0 flex-1 space-y-2">
                  <div><p className="truncate font-semibold">{c?.name ?? i.card_id}</p><p className="truncate text-xs text-ink-400">{c?.setName} · {c?.number}</p></div>
                  <div className="flex flex-wrap items-center gap-2"><Price eur={c?.price.eur ?? null} /><Change change={c?.price.changes.d7 ?? null} label="7 j" /><Change change={c?.price.changes.d30 ?? null} label="30 j" /></div>
                  {reached && <p className="text-xs font-semibold text-up">Objectif atteint !</p>}
                  <form action={updateWishlistItem} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={i.id} />
                    <input name="target" inputMode="decimal" defaultValue={i.target_price_eur ?? ""} placeholder="Objectif €" className="input w-28 py-1" aria-label="Objectif de prix" />
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="alert" defaultChecked={i.alert_enabled} />Alerte</label>
                    <button className="text-xs text-sky-300 hover:underline">OK</button>
                    <button name="delete" value="1" className="text-xs text-down hover:underline">Retirer</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      ) : <Empty title="Votre liste est vide">Ajoutez des cartes depuis leur fiche avec le bouton « Liste de souhaits ».</Empty>}
    </div>
  );
}
