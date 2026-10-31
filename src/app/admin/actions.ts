"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./guard";
import { runPriceAlerts, snapshotCollections, syncCatalogAndPrices } from "@/lib/sync";
import { PRICE_PROVIDERS } from "@/lib/providers/price-providers";
import type { GameId } from "@/lib/types";

export async function triggerSync(form: FormData) {
  const { admin, session } = await requireAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY requis pour la synchronisation");
  const kind = String(form.get("kind"));
  const by = `admin:${session.user.email}`;
  if (kind === "alerts") await runPriceAlerts(admin, by);
  else if (kind === "collections") await snapshotCollections(admin, by);
  else {
    const game = (String(form.get("game")) === "onepiece" ? "onepiece" : "pokemon") as GameId;
    const setIds = String(form.get("sets") ?? "").split(/[\s,]+/).filter(Boolean);
    await syncCatalogAndPrices(admin, { game, setIds: setIds.length ? setIds : undefined, triggeredBy: by, budgetMs: 55_000 });
  }
  revalidatePath("/", "layout");
}

export async function checkProviders(): Promise<{ id: string; ok: boolean; message: string }[]> {
  await requireAdmin();
  return Promise.all(PRICE_PROVIDERS.filter((p) => p.healthCheck).map(async (p) => {
    try {
      const r = await p.healthCheck!();
      return { id: p.id, ...r };
    } catch (e) {
      return { id: p.id, ok: false, message: (e as Error).message };
    }
  }));
}

export async function toggleSource(form: FormData) {
  const { sb } = await requireAdmin();
  await sb.from("price_sources").update({ enabled: form.get("enabled") === "true" }).eq("id", String(form.get("id")));
  revalidatePath("/admin");
}

const str = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : String(v).trim());

export async function saveSet(form: FormData) {
  const { sb } = await requireAdmin();
  const row = {
    game: String(form.get("game")), set_id: String(form.get("set_id")), code: str(form.get("code")) ?? String(form.get("set_id")).toUpperCase(),
    name: str(form.get("name")) ?? "Sans nom", series: str(form.get("series")), generation: str(form.get("generation")),
    release_date: str(form.get("release_date")), total_cards: str(form.get("total_cards")) ? Number(form.get("total_cards")) : null,
    logo_url: str(form.get("logo_url")), image_url: str(form.get("image_url")),
    languages: (str(form.get("languages")) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    source: str(form.get("source")) ?? "Admin", manual_override: form.get("manual_override") === "on", updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("sets").upsert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/extensions");
}

export async function saveCard(form: FormData) {
  const { sb } = await requireAdmin();
  const game = String(form.get("game"));
  const card_id = String(form.get("card_id"));
  const { error } = await sb.from("cards").update({
    name: str(form.get("name")), rarity: str(form.get("rarity")), category: str(form.get("category")), character: str(form.get("character")),
    image_large: str(form.get("image_large")), image_small: str(form.get("image_small")) ?? str(form.get("image_large")),
    manual_override: form.get("manual_override") === "on", updated_at: new Date().toISOString(),
  }).eq("game", game).eq("card_id", card_id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cartes");
}

export async function setRole(form: FormData) {
  const { sb, session } = await requireAdmin();
  const id = String(form.get("id"));
  if (id === session.user.id) return; // pas d'auto-rétrogradation
  await sb.from("profiles").update({ role: form.get("role") === "admin" ? "admin" : "user" }).eq("id", id);
  revalidatePath("/admin/utilisateurs");
}
