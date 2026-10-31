// Tâches de synchronisation (appelées par les crons Vercel, l'espace admin ou la CLI).
// - catalogue + prix intégrés : extensions et cartes avec cotations Cardmarket/TCGplayer
// - prix externes : JustTCG, eBay, Cardmarket/TCGplayer officiels (si clés configurées)
// - historique : un point par jour, source et variante
// - alertes : liste de souhaits sous le prix cible → notifications
// - collections : instantané quotidien de la valeur
// Chaque exécution est bornée dans le temps (limites des fonctions serverless) et reprend
// grâce à un curseur stocké dans `sync_state`.
import type { SupabaseClient } from "@supabase/supabase-js";
import * as catalog from "../catalog";
import { getFxRates } from "../fx";
import { fetchExternalQuotes, externalProvidersFor } from "../providers/price-providers";
import { changesFromHistory, marketValue, summarize } from "../pricing";
import type { GameId, PricePoint, PriceQuote, TcgSet } from "../types";
import type { HydratedCard } from "../catalog";

type Sb = SupabaseClient;
export interface SyncReport { runId: number | null; processed: number; failed: number; message: string; done: boolean }

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

async function startRun(sb: Sb, kind: string, game: string | null, triggeredBy: string): Promise<number | null> {
  const { data } = await sb.from("sync_runs").insert({ kind, game, triggered_by: triggeredBy }).select("id").single();
  return data?.id ?? null;
}
async function finishRun(sb: Sb, id: number | null, r: { processed: number; failed: number; message: string }) {
  if (!id) return;
  await sb.from("sync_runs").update({
    status: r.failed === 0 ? "success" : r.processed > 0 ? "partial" : "failed",
    items_processed: r.processed, items_failed: r.failed, message: r.message, finished_at: new Date().toISOString(),
  }).eq("id", id);
}
async function logError(sb: Sb, runId: number | null, e: { provider: string; game?: string; ref?: string; message: string; status?: number | null }) {
  await sb.from("sync_errors").insert({ run_id: runId, provider: e.provider, game: e.game ?? null, ref: e.ref ?? null, message: e.message.slice(0, 1000), status_code: e.status ?? null });
  await sb.from("price_sources").update({ last_error_at: new Date().toISOString(), last_error: e.message.slice(0, 500) }).eq("id", e.provider);
}
async function getState<T>(sb: Sb, key: string, fallback: T): Promise<T> {
  const { data } = await sb.from("sync_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
async function setState(sb: Sb, key: string, value: unknown) {
  await sb.from("sync_state").upsert({ key, value, updated_at: new Date().toISOString() });
}

function setRow(s: TcgSet) {
  return {
    game: s.game, set_id: s.id, code: s.code, name: s.name, series: s.series, generation: s.generation, release_date: s.releaseDate,
    total_cards: s.totalCards, official_cards: s.officialCards, logo_url: s.logoUrl, symbol_url: s.symbolUrl, image_url: s.imageUrl,
    languages: s.languages, editions: s.editions, source: s.source, updated_at: new Date().toISOString(),
  };
}

function quoteRows(game: GameId, cardId: string, quotes: PriceQuote[]) {
  return quotes.map((q) => ({
    game, card_id: cardId, source: q.source, source_label: q.sourceLabel, variant: q.variant, condition: q.condition, currency: q.currency,
    market: q.original.market, low: q.original.low, avg: q.original.avg, high: q.original.high, last_sale: q.original.lastSale,
    trend: q.original.trend, avg1: q.original.avg1, avg7: q.original.avg7, avg30: q.original.avg30,
    eur_market: marketValue(q.eur), eur_low: q.eur.low, eur_avg: q.eur.avg, eur_high: q.eur.high, eur_last_sale: q.eur.lastSale,
    fx_rate: q.fxRate, fx_date: q.fxDate, sales_count: q.salesCount, changes: q.changes, url: q.url,
    source_updated_at: q.updatedAt, fetched_at: q.fetchedAt,
  }));
}

// Upsert d'un lot de cartes hydratées : fiche, cotations, point d'historique du jour, résumé dénormalisé.
async function writeCards(sb: Sb, game: GameId, cards: HydratedCard[], extra: Map<string, PriceQuote[]> = new Map()) {
  if (!cards.length) return;
  const ids = cards.map((c) => c.detail.id);
  // Points d'historique de référence (J-1, J-7, J-30, J-365, ± tolérance) pour les variations exactes.
  const refDays = [1, 2, 6, 7, 8, 29, 30, 31, 364, 365, 366].map(daysAgo);
  const { data: hist } = await sb.from("price_history").select("card_id,source,variant,day,eur_market").eq("game", game).in("card_id", ids).in("day", refDays);
  const byCard = new Map<string, PricePoint[]>();
  for (const h of hist ?? []) {
    const list = byCard.get(h.card_id) ?? [];
    list.push({ date: h.day, eur: Number(h.eur_market), source: h.source, variant: h.variant });
    byCard.set(h.card_id, list);
  }

  const cardRows = [];
  const priceRows = [];
  const historyRows = [];
  const externalRows = [];
  for (const c of cards) {
    const d = c.detail;
    const quotes = [...c.quotes, ...(extra.get(d.id) ?? [])];
    const prelim = summarize(quotes, { preferredVariant: c.preferredVariant });
    const series = (byCard.get(d.id) ?? []).filter((p) => p.source === prelim.primary?.source && p.variant === prelim.primary?.variant);
    const withToday = prelim.marketEur !== null ? [...series, { date: today(), eur: prelim.marketEur, source: prelim.primary!.source }] : series;
    const s = summarize(quotes, { preferredVariant: c.preferredVariant, historyChanges: changesFromHistory(withToday, prelim.marketEur) });
    const basis: Record<string, string> = {};
    for (const k of ["h24", "d7", "d30", "y1"] as const) if (s.changes[k]) basis[k] = s.changes[k]!.basis;
    cardRows.push({
      game, card_id: d.id, set_id: d.setId, set_name: d.setName, set_code: d.setCode, number: d.number, number_sort: d.numberSort,
      name: d.name, character: d.character, category: d.category, rarity: d.rarity, language: d.language, release_date: d.releaseDate,
      image_small: d.imageSmall, image_large: d.imageLarge, is_alternate: d.isAlternate, variant_label: d.variantLabel, base_card_id: d.baseCardId,
      tags: d.tags, colors: d.colors, stats: d.stats, attacks: d.attacks, text: d.text, illustrator: d.illustrator, finishes: d.finishes,
      external_ids: d.externalIds, price_eur: s.marketEur, price_low_eur: s.lowEur, price_avg_eur: s.avgEur, price_high_eur: s.highEur,
      price_last_sale_eur: s.lastSaleEur, change_24h: s.changes.h24?.pct ?? null, change_7d: s.changes.d7?.pct ?? null,
      change_30d: s.changes.d30?.pct ?? null, change_1y: s.changes.y1?.pct ?? null, change_basis: basis,
      price_source: s.primary?.sourceLabel ?? null, price_updated_at: s.updatedAt,
      sales_count_30d: quotes.find((q) => q.source === "ebay")?.salesCount ?? null, updated_at: new Date().toISOString(),
    });
    priceRows.push(...quoteRows(game, d.id, quotes));
    const seen = new Set<string>();
    for (const q of quotes) {
      const eur = marketValue(q.eur);
      const key = `${q.source}:${q.variant}`;
      if (eur === null || seen.has(key)) continue;
      seen.add(key);
      historyRows.push({ game, card_id: d.id, source: q.source, variant: q.variant, day: today(), eur_market: eur, original_market: marketValue(q.original), currency: q.currency });
    }
    for (const [provider, external_id] of Object.entries(d.externalIds)) externalRows.push({ game, card_id: d.id, provider, external_id });
  }
  // Ne pas écraser les corrections manuelles des administrateurs.
  const { data: locked } = await sb.from("cards").select("card_id").eq("game", game).eq("manual_override", true).in("card_id", ids);
  const lockedIds = new Set((locked ?? []).map((l) => l.card_id));
  const writable = cardRows.filter((r) => !lockedIds.has(r.card_id));
  const lockedPrices = cardRows.filter((r) => lockedIds.has(r.card_id)).map((r) => ({
    game, card_id: r.card_id, price_eur: r.price_eur, price_low_eur: r.price_low_eur, price_avg_eur: r.price_avg_eur, price_high_eur: r.price_high_eur,
    price_last_sale_eur: r.price_last_sale_eur, change_24h: r.change_24h, change_7d: r.change_7d, change_30d: r.change_30d, change_1y: r.change_1y,
    change_basis: r.change_basis, price_source: r.price_source, price_updated_at: r.price_updated_at,
  }));

  const chunk = <T,>(arr: T[], n = 500) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  for (const part of chunk(writable)) {
    const { error } = await sb.from("cards").upsert(part);
    if (error) throw new Error(`cards: ${error.message}`);
  }
  for (const r of lockedPrices) await sb.from("cards").update(r).eq("game", game).eq("card_id", r.card_id);
  for (const part of chunk(priceRows)) {
    const { error } = await sb.from("card_prices").upsert(part);
    if (error) throw new Error(`card_prices: ${error.message}`);
  }
  for (const part of chunk(historyRows)) {
    const { error } = await sb.from("price_history").upsert(part);
    if (error) throw new Error(`price_history: ${error.message}`);
  }
  for (const part of chunk(externalRows)) await sb.from("card_external_ids").upsert(part);
}

// Synchronise les extensions puis, par rotation, les cartes et leurs prix.
export async function syncCatalogAndPrices(sb: Sb, opts: { game: GameId; budgetMs?: number; triggeredBy?: string; setIds?: string[] }): Promise<SyncReport> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 50_000;
  const runId = await startRun(sb, "prices", opts.game, opts.triggeredBy ?? "cron");
  let processed = 0;
  let failed = 0;
  const fx = await getFxRates();
  if (!fx) await logError(sb, runId, { provider: "frankfurter", game: opts.game, message: "Taux BCE indisponibles : les prix en USD ne sont pas convertis lors de cette exécution." });

  let sets: TcgSet[] = [];
  try {
    sets = await catalog.listSets(opts.game);
    const { data: locked } = await sb.from("sets").select("set_id").eq("game", opts.game).eq("manual_override", true);
    const lockedIds = new Set((locked ?? []).map((l) => l.set_id));
    const rows = sets.filter((s) => !lockedIds.has(s.id)).map(setRow);
    if (rows.length) {
      const { error } = await sb.from("sets").upsert(rows);
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    await logError(sb, runId, { provider: opts.game === "pokemon" ? "tcgdex" : "optcgapi", game: opts.game, message: `Extensions : ${(e as Error).message}` });
    await finishRun(sb, runId, { processed: 0, failed: 1, message: "Échec du chargement des extensions" });
    return { runId, processed: 0, failed: 1, message: "Échec du chargement des extensions", done: true };
  }

  // Extensions récentes en priorité, puis rotation sur tout le catalogue.
  const ordered = [...sets].sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
  const stateKey = `cursor:${opts.game}`;
  const cursor = await getState<{ index: number }>(sb, stateKey, { index: 0 });
  const queue = opts.setIds?.length ? ordered.filter((s) => opts.setIds!.includes(s.id)) : [...ordered.slice(0, 3), ...rotate(ordered, cursor.index)];
  const done = new Set<string>();
  let index = cursor.index;

  if (opts.game === "onepiece" && !opts.setIds?.length) {
    // One Piece : l'ensemble des cartes tient en quelques requêtes.
    try {
      const all = await catalog.getAllOnePieceCards(fx);
      const knownSets = new Set(sets.map((s) => s.id));
      const missing = [...new Set(all.map((c) => c.detail.setId))].filter((id) => !knownSets.has(id));
      if (missing.length) {
        await sb.from("sets").upsert(missing.map((id) => {
          const sample = all.find((c) => c.detail.setId === id)!.detail;
          return setRow({ game: "onepiece", id, code: sample.setCode, name: sample.setName, series: "Promo / Autres", generation: null, releaseDate: null, totalCards: null, officialCards: null, logoUrl: null, symbolUrl: null, imageUrl: sample.imageLarge, languages: ["en"], editions: [], source: "OPTCG API" });
        }), { onConflict: "game,set_id", ignoreDuplicates: true });
      }
      await writeCards(sb, "onepiece", all, await externalBatch(sb, runId, all, started, budget));
      processed = all.length;
    } catch (e) {
      failed++;
      await logError(sb, runId, { provider: "optcgapi", game: "onepiece", message: (e as Error).message });
    }
    await finishRun(sb, runId, { processed, failed, message: `${processed} cartes One Piece synchronisées` });
    await sb.from("price_sources").update({ last_success_at: new Date().toISOString() }).eq("id", "optcgapi");
    return { runId, processed, failed, message: `${processed} cartes One Piece synchronisées`, done: true };
  }

  for (const set of queue) {
    if (Date.now() - started > budget) break;
    if (done.has(set.id)) continue;
    done.add(set.id);
    try {
      const cards = await catalog.getSetCards(opts.game, set.id, fx);
      await writeCards(sb, opts.game, cards, await externalBatch(sb, runId, cards, started, budget));
      processed += cards.length;
      failed += cards.filter((c) => !c.detail.rarity && !c.quotes.length && !c.detail.category).length;
    } catch (e) {
      failed++;
      await logError(sb, runId, { provider: "tcgdex", game: opts.game, ref: set.id, message: (e as Error).message });
    }
    if (!opts.setIds?.length && ordered.indexOf(set) >= 0 && queue.indexOf(set) >= 3) index = (ordered.indexOf(set) + 1) % ordered.length;
  }
  if (!opts.setIds?.length) await setState(sb, stateKey, { index });
  await sb.from("price_sources").update({ last_success_at: new Date().toISOString() }).eq("id", "tcgdex");
  const message = `${done.size} extension(s), ${processed} cartes synchronisées`;
  await finishRun(sb, runId, { processed, failed, message });
  return { runId, processed, failed, message, done: index === 0 };
}

function rotate<T>(arr: T[], start: number): T[] {
  return [...arr.slice(start), ...arr.slice(0, start)];
}

// Sources externes (JustTCG, eBay…) : interrogées pour les cartes de valeur, dans la limite du temps restant.
async function externalBatch(sb: Sb, runId: number | null, cards: HydratedCard[], started: number, budget: number): Promise<Map<string, PriceQuote[]>> {
  const out = new Map<string, PriceQuote[]>();
  if (!cards.length || !externalProvidersFor(cards[0].detail.game).length) return out;
  const fx = await getFxRates();
  const valuable = cards
    .map((c) => ({ c, v: summarize(c.quotes).marketEur ?? 0 }))
    .filter((x) => x.v >= Number(process.env.EXTERNAL_MIN_PRICE_EUR ?? 5))
    .sort((a, b) => b.v - a.v)
    .slice(0, Number(process.env.EXTERNAL_BATCH_SIZE ?? 25));
  for (const { c } of valuable) {
    if (Date.now() - started > budget * 0.8) break;
    const { quotes, errors } = await fetchExternalQuotes({ card: c.detail, externalIds: c.detail.externalIds, englishName: c.detail.game === "onepiece" ? c.detail.character : null }, fx);
    if (quotes.length) out.set(c.detail.id, quotes);
    for (const e of errors) await logError(sb, runId, { provider: e.provider, game: c.detail.game, ref: c.detail.id, message: e.message });
  }
  return out;
}

// Alertes de prix : liste de souhaits dont le prix actuel passe sous l'objectif.
export async function runPriceAlerts(sb: Sb, triggeredBy = "cron"): Promise<SyncReport> {
  const runId = await startRun(sb, "alerts", null, triggeredBy);
  const { data: items } = await sb.from("wishlist_items").select("id,user_id,game,card_id,target_price_eur,last_alerted_at").eq("alert_enabled", true).not("target_price_eur", "is", null).limit(5000);
  let sent = 0;
  for (const w of items ?? []) {
    const { data: card } = await sb.from("cards").select("name,price_eur,price_updated_at").eq("game", w.game).eq("card_id", w.card_id).maybeSingle();
    if (!card?.price_eur || Number(card.price_eur) > Number(w.target_price_eur)) continue;
    if (w.last_alerted_at && Date.now() - new Date(w.last_alerted_at).getTime() < 24 * 3600_000) continue;
    const slug = w.game === "onepiece" ? "one-piece" : "pokemon";
    await sb.from("notifications").insert({
      user_id: w.user_id, kind: "price_alert", title: `${card.name} est passée sous votre objectif`,
      body: `Prix actuel : ${Number(card.price_eur).toFixed(2).replace(".", ",")} € (objectif ${Number(w.target_price_eur).toFixed(2).replace(".", ",")} €)`,
      link: `/${slug}/cartes/${encodeURIComponent(w.card_id)}`,
    });
    await sb.from("wishlist_items").update({ last_alerted_at: new Date().toISOString() }).eq("id", w.id);
    sent++;
  }
  await finishRun(sb, runId, { processed: sent, failed: 0, message: `${sent} alerte(s) envoyée(s)` });
  return { runId, processed: sent, failed: 0, message: `${sent} alerte(s) envoyée(s)`, done: true };
}

// Instantané quotidien de la valeur de chaque collection (évolution dans le temps).
export async function snapshotCollections(sb: Sb, triggeredBy = "cron"): Promise<SyncReport> {
  const runId = await startRun(sb, "collections", null, triggeredBy);
  const { data: cols } = await sb.from("collections").select("id").limit(10000);
  let processed = 0;
  for (const col of cols ?? []) {
    const { data: items } = await sb.from("collection_items").select("game,card_id,quantity,purchase_price_eur").eq("collection_id", col.id);
    if (!items?.length) continue;
    let value = 0, cost = 0, priced = 0;
    for (const g of ["pokemon", "onepiece"]) {
      const ids = items.filter((i) => i.game === g).map((i) => i.card_id);
      if (!ids.length) continue;
      const { data: cards } = await sb.from("cards").select("card_id,price_eur").eq("game", g).in("card_id", ids);
      const price = new Map((cards ?? []).map((c) => [c.card_id, c.price_eur === null ? null : Number(c.price_eur)]));
      for (const i of items.filter((x) => x.game === g)) {
        const p = price.get(i.card_id);
        if (p !== null && p !== undefined) { value += p * i.quantity; priced++; }
        if (i.purchase_price_eur !== null) cost += Number(i.purchase_price_eur) * i.quantity;
      }
    }
    await sb.from("collection_value_snapshots").upsert({ collection_id: col.id, day: today(), value_eur: Math.round(value * 100) / 100, cost_eur: Math.round(cost * 100) / 100, priced_items: priced, total_items: items.length });
    processed++;
  }
  await finishRun(sb, runId, { processed, failed: 0, message: `${processed} collection(s) valorisée(s)` });
  return { runId, processed, failed: 0, message: `${processed} collection(s) valorisée(s)`, done: true };
}
