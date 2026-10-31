"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/config";

type Result = { ok: true; message?: string } | { ok: false; error: string; needsAuth?: boolean };

const CONDITIONS = ["M", "NM", "EX", "GD", "LP", "PL", "PO"];
const num = (v: FormDataEntryValue | null) => {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

async function authed() {
  if (!hasSupabase()) return { error: "La base de données Supabase n'est pas configurée sur ce déploiement." } as const;
  const sb = (await supabaseServer())!;
  const { data } = await sb.auth.getUser();
  if (!data.user) return { error: "Connectez-vous pour utiliser cette fonctionnalité.", needsAuth: true } as const;
  return { sb, user: data.user } as const;
}

// La carte doit exister en base (FK) : en mode hybride, elle est synchronisée à la volée.
async function ensureCard(game: string, cardId: string) {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const admin = supabaseAdmin();
  if (!admin) return;
  const { data } = await admin.from("cards").select("card_id").eq("game", game).eq("card_id", cardId).maybeSingle();
  if (data) return;
  const { getFullCard } = await import("@/lib/catalog");
  const full = await getFullCard(game as "pokemon" | "onepiece", cardId);
  if (!full) return;
  const { syncCatalogAndPrices } = await import("@/lib/sync");
  await syncCatalogAndPrices(admin, { game: game as "pokemon" | "onepiece", setIds: [full.detail.setId], triggeredBy: "à la demande", budgetMs: 25_000 });
}

export async function myCollections(): Promise<{ id: string; name: string }[]> {
  const a = await authed();
  if ("error" in a) return [];
  const { data } = await a.sb.from("collections").select("id,name").order("is_default", { ascending: false }).order("created_at");
  return data ?? [];
}

export async function addToCollection(_: Result | null, form: FormData): Promise<Result> {
  const a = await authed();
  if ("error" in a) return { ok: false, error: a.error!, needsAuth: "needsAuth" in a };
  const game = String(form.get("game"));
  const cardId = String(form.get("cardId"));
  let collectionId = String(form.get("collectionId") ?? "");
  const condition = String(form.get("condition") ?? "NM");
  if (!CONDITIONS.includes(condition)) return { ok: false, error: "État invalide" };
  if (!collectionId) {
    const { data } = await a.sb.from("collections").insert({ user_id: a.user.id, name: "Ma collection", is_default: true }).select("id").single();
    collectionId = data!.id;
  }
  await ensureCard(game, cardId);
  const { error } = await a.sb.from("collection_items").insert({
    collection_id: collectionId, user_id: a.user.id, game, card_id: cardId,
    quantity: Math.max(1, Math.floor(num(form.get("quantity")) ?? 1)), language: String(form.get("language") ?? "fr"), condition,
    variant: String(form.get("variant") ?? "normal"), purchase_price_eur: num(form.get("purchasePrice")), purchase_date: form.get("purchaseDate") || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/collection");
  return { ok: true, message: "Carte ajoutée à la collection" };
}

export async function updateCollectionItem(form: FormData) {
  const a = await authed();
  if ("error" in a) return;
  const id = String(form.get("id"));
  if (form.get("delete")) await a.sb.from("collection_items").delete().eq("id", id);
  else await a.sb.from("collection_items").update({
    quantity: Math.max(1, Math.floor(num(form.get("quantity")) ?? 1)), condition: String(form.get("condition") ?? "NM"),
    language: String(form.get("language") ?? "fr"), purchase_price_eur: num(form.get("purchasePrice")),
  }).eq("id", id);
  revalidatePath("/collection");
}

export async function createCollection(form: FormData) {
  const a = await authed();
  if ("error" in a) return;
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;
  const { data } = await a.sb.from("collections").insert({ user_id: a.user.id, name, description: String(form.get("description") ?? "").slice(0, 300) || null }).select("id").single();
  revalidatePath("/collection");
  if (data) redirect(`/collection?c=${data.id}`);
}

export async function deleteCollection(form: FormData) {
  const a = await authed();
  if ("error" in a) return;
  await a.sb.from("collections").delete().eq("id", String(form.get("id"))).eq("is_default", false);
  revalidatePath("/collection");
  redirect("/collection");
}

export async function addToWishlist(_: Result | null, form: FormData): Promise<Result> {
  const a = await authed();
  if ("error" in a) return { ok: false, error: a.error!, needsAuth: "needsAuth" in a };
  const game = String(form.get("game"));
  const cardId = String(form.get("cardId"));
  await ensureCard(game, cardId);
  const { error } = await a.sb.from("wishlist_items").upsert({
    user_id: a.user.id, game, card_id: cardId, target_price_eur: num(form.get("target")), alert_enabled: form.get("alert") !== "off",
  }, { onConflict: "user_id,game,card_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/souhaits");
  return { ok: true, message: "Ajoutée à la liste de souhaits" };
}

export async function updateWishlistItem(form: FormData) {
  const a = await authed();
  if ("error" in a) return;
  const id = String(form.get("id"));
  if (form.get("delete")) await a.sb.from("wishlist_items").delete().eq("id", id);
  else await a.sb.from("wishlist_items").update({ target_price_eur: num(form.get("target")), alert_enabled: form.get("alert") === "on" }).eq("id", id);
  revalidatePath("/souhaits");
}

export async function markNotificationsRead() {
  const a = await authed();
  if ("error" in a) return;
  await a.sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/compte");
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb?.auth.signOut();
  redirect("/");
}
