"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Plus, X } from "lucide-react";
import { addToCollection, addToWishlist, myCollections } from "@/app/actions";

type Result = { ok: true; message?: string } | { ok: false; error: string; needsAuth?: boolean } | null;

function Feedback({ state }: { state: Result }) {
  if (!state) return null;
  if (state.ok) return <p className="text-xs text-up">{state.message}</p>;
  return <p className="text-xs text-down">{state.error} {state.needsAuth && <Link href="/connexion" className="underline">Se connecter</Link>}</p>;
}

export function CardActions({ game, cardId, priceEur }: { game: string; cardId: string; priceEur: number | null }) {
  const [panel, setPanel] = useState<"collection" | "wishlist" | null>(null);
  const [cols, setCols] = useState<{ id: string; name: string }[]>([]);
  const [colState, colAction, colPending] = useActionState(addToCollection, null);
  const [wishState, wishAction, wishPending] = useActionState(addToWishlist, null);

  useEffect(() => { if (panel === "collection") myCollections().then(setCols).catch(() => {}); }, [panel]);

  return (
    <>
      <button className="btn-primary" onClick={() => setPanel(panel === "collection" ? null : "collection")}><Plus className="h-4 w-4" />Ajouter à ma collection</button>
      <button className="btn-ghost" onClick={() => setPanel(panel === "wishlist" ? null : "wishlist")}><Heart className="h-4 w-4" />Liste de souhaits</button>
      {panel && (
        <div className="panel relative w-full p-4">
          <button onClick={() => setPanel(null)} className="absolute right-3 top-3 text-ink-400 hover:text-white" aria-label="Fermer"><X className="h-4 w-4" /></button>
          {panel === "collection" ? (
            <form action={colAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="game" value={game} /><input type="hidden" name="cardId" value={cardId} />
              <div><label className="label">Collection</label><select name="collectionId" className="input">{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}{!cols.length && <option value="">Ma collection</option>}</select></div>
              <div><label className="label">Quantité</label><input name="quantity" type="number" min={1} defaultValue={1} className="input" /></div>
              <div><label className="label">Langue</label><select name="language" className="input" defaultValue={game === "pokemon" ? "fr" : "en"}><option value="fr">Français</option><option value="en">Anglais</option><option value="ja">Japonais</option><option value="de">Allemand</option><option value="it">Italien</option><option value="es">Espagnol</option></select></div>
              <div><label className="label">État</label><select name="condition" className="input" defaultValue="NM"><option value="M">Mint</option><option value="NM">Near Mint</option><option value="EX">Excellent</option><option value="GD">Good</option><option value="LP">Light Played</option><option value="PL">Played</option><option value="PO">Poor</option></select></div>
              <div><label className="label">Version</label><select name="variant" className="input"><option value="normal">Normale</option><option value="holo">Holo / Foil</option><option value="reverse">Reverse</option><option value="parallel">Parallèle</option></select></div>
              <div><label className="label">Prix d&apos;achat (€)</label><input name="purchasePrice" inputMode="decimal" placeholder={priceEur !== null ? priceEur.toFixed(2) : "0,00"} className="input" /></div>
              <div><label className="label">Date d&apos;achat</label><input name="purchaseDate" type="date" className="input" /></div>
              <div className="flex items-end gap-3 sm:col-span-2"><button disabled={colPending} className="btn-primary">{colPending ? "Ajout…" : "Ajouter"}</button><Feedback state={colState} /></div>
            </form>
          ) : (
            <form action={wishAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="game" value={game} /><input type="hidden" name="cardId" value={cardId} />
              <div><label className="label">Objectif de prix (€)</label><input name="target" inputMode="decimal" placeholder={priceEur !== null ? (priceEur * 0.9).toFixed(2) : ""} className="input" /></div>
              <div><label className="label">Alerte</label><select name="alert" className="input"><option value="on">M&apos;alerter sous l&apos;objectif</option><option value="off">Pas d&apos;alerte</option></select></div>
              <div className="flex items-end gap-3"><button disabled={wishPending} className="btn-primary">{wishPending ? "…" : "Enregistrer"}</button><Feedback state={wishState} /></div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
