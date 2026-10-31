// Connecteur OPTCG API (https://optcgapi.com) — API ouverte, sans clé.
// Fournit : extensions (boosters + decks de démarrage), cartes, versions alternatives,
// images, et les prix TCGplayer (USD) relevés quotidiennement, avec historique 2 semaines.
import { config } from "../config";
import { fetchJson } from "../http";
import { makeQuote } from "../pricing";
import { onePieceTags } from "../rarity";
import { num, slugify } from "../format";
import type { FxRates } from "../fx";
import type { CardBase, CardDetail, CardStat, PricePoint, PriceQuote, TcgSet } from "../types";
import { ONE_PIECE_SET_META } from "./onepiece-meta";

const BASE = () => config.onepiece.optcgBase;
const opts = (revalidate = config.cache.prices) => ({ provider: "optcgapi", revalidate, allow404: true, timeoutMs: 30000 });

export interface OptcgCard {
  inventory_price?: number | string | null;
  market_price?: number | string | null;
  card_name: string;
  set_name?: string;
  card_text?: string | null;
  set_id?: string;
  rarity?: string | null;
  card_set_id: string;
  card_color?: string | null;
  card_type?: string | null;
  life?: string | number | null;
  card_cost?: string | number | null;
  card_power?: string | number | null;
  sub_types?: string | null;
  counter_amount?: string | number | null;
  attribute?: string | null;
  date_scraped?: string | null;
  card_image_id?: string;
  card_image?: string | null;
}

type AnyRec = Record<string, unknown>;
const pick = (o: AnyRec, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return String(o[k]);
  return null;
};

export interface OptcgSetBrief { id: string; name: string; kind: "booster" | "starter" }

export async function listSetBriefs(): Promise<OptcgSetBrief[]> {
  const [sets, decks] = await Promise.all([
    fetchJson<AnyRec[]>(`${BASE()}/allSets/`, opts(config.cache.catalog)).catch(() => null),
    fetchJson<AnyRec[]>(`${BASE()}/allDecks/`, opts(config.cache.catalog)).catch(() => null),
  ]);
  const out: OptcgSetBrief[] = [];
  for (const s of sets ?? []) {
    const id = pick(s, "set_id", "id");
    const name = pick(s, "set_name", "name");
    if (id && name) out.push({ id, name, kind: "booster" });
  }
  for (const d of decks ?? []) {
    const id = pick(d, "structure_deck_id", "deck_id", "st_id", "set_id", "id");
    const name = pick(d, "structure_deck_name", "deck_name", "st_name", "set_name", "name");
    if (id && name) out.push({ id, name, kind: "starter" });
  }
  return out;
}

export const setSlug = (code: string) => slugify(code); // « OP-01 » → « op-01 »

export async function getSetCards(brief: OptcgSetBrief): Promise<OptcgCard[]> {
  const url = brief.kind === "booster" ? `${BASE()}/sets/${encodeURIComponent(brief.id)}/` : `${BASE()}/decks/${encodeURIComponent(brief.id)}/`;
  const data = await fetchJson<OptcgCard[] | { error?: string }>(url, opts());
  return Array.isArray(data) ? data : [];
}

export async function getAllCards(): Promise<OptcgCard[]> {
  const [a, b, c] = await Promise.all([
    fetchJson<OptcgCard[]>(`${BASE()}/allSetCards/`, opts()).catch(() => null),
    fetchJson<OptcgCard[]>(`${BASE()}/allSTCards/`, opts()).catch(() => null),
    fetchJson<OptcgCard[]>(`${BASE()}/allPromoCards/`, opts()).catch(() => null),
  ]);
  return [...(a ?? []), ...(b ?? []), ...(c ?? [])].filter((x) => x && x.card_set_id);
}

export async function getCardVersions(cardSetId: string): Promise<OptcgCard[]> {
  const data = await fetchJson<OptcgCard[]>(`${BASE()}/sets/card/${encodeURIComponent(cardSetId)}/`, opts());
  return Array.isArray(data) ? data : [];
}

// Historique quotidien des prix sur deux semaines (données TCGplayer relevées par OPTCG API).
export async function getTwoWeekHistory(cardSetId: string, imageId: string, fx: FxRates | null): Promise<PricePoint[]> {
  const isST = /^ST/i.test(cardSetId);
  const url = isST ? `${BASE()}/decks/card/twoweeks/${encodeURIComponent(cardSetId)}/` : `${BASE()}/sets/card/twoweeks/${encodeURIComponent(cardSetId)}/`;
  const data = await fetchJson<OptcgCard[]>(url, opts()).catch(() => null);
  if (!Array.isArray(data)) return [];
  const rate = fx?.rates.USD;
  if (!rate) return [];
  return data
    .filter((d) => (d.card_image_id ?? d.card_set_id) === imageId && d.date_scraped)
    .map((d) => ({ date: new Date(d.date_scraped!).toISOString(), eur: num(d.market_price) !== null ? Math.round((num(d.market_price)! / rate) * 100) / 100 : NaN, source: "TCGplayer (via OPTCG API)" }))
    .filter((p) => Number.isFinite(p.eur));
}

export function setCodeFromCard(c: OptcgCard): string {
  // « OP05-119 » → « OP-05 » ; « ST01-001 » → « ST-01 » ; « EB01-001 » → « EB-01 »
  const m = c.card_set_id.match(/^([A-Z]+)(\d+)-/);
  return m ? `${m[1]}-${m[2]}` : (c.set_id ?? "PROMO");
}

export function mapSet(brief: OptcgSetBrief, cards: OptcgCard[]): TcgSet {
  const code = brief.id.toUpperCase();
  const meta = ONE_PIECE_SET_META[code];
  const unique = new Set(cards.map((c) => c.card_set_id));
  const hasAlt = cards.some((c) => c.card_image_id && c.card_image_id !== c.card_set_id);
  const cleanName = brief.name.replace(/^-?\s*/, "").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  return {
    game: "onepiece",
    id: setSlug(code),
    code,
    name: meta?.name ?? cleanName,
    series: brief.kind === "booster" ? (code.startsWith("EB") ? "Extra Booster" : code.startsWith("PRB") ? "Premium Booster" : "Booster Pack") : "Starter Deck",
    generation: meta?.block ?? null,
    releaseDate: meta?.releaseDate ?? null,
    totalCards: unique.size || null,
    officialCards: unique.size || null,
    logoUrl: null,
    symbolUrl: null,
    imageUrl: cards.find((c) => c.card_type?.toLowerCase() === "leader")?.card_image ?? cards[0]?.card_image ?? null,
    languages: ["en"],
    editions: hasAlt ? ["Normale", "Parallèle (Alt Art)"] : ["Normale"],
    source: "OPTCG API",
  };
}

const cleanName = (n: string) => n.replace(/\s*\((?:parallel|alternate art|manga|sp|special|box topper|reprint|[^)]*)\)\s*$/i, "").trim();

export function mapCard(c: OptcgCard, set: Pick<TcgSet, "id" | "name" | "code" | "releaseDate">): Omit<CardDetail, "alternates"> {
  const imageId = c.card_image_id ?? c.card_set_id;
  const isAlternate = imageId !== c.card_set_id;
  const variant = c.card_name.match(/\(([^)]+)\)\s*$/)?.[1] ?? null;
  const stats: CardStat[] = [];
  const add = (label: string, v: unknown) => { if (v !== null && v !== undefined && v !== "" && v !== "NULL") stats.push({ label, value: String(v) }); };
  add("Couleur", c.card_color);
  add("Coût", c.card_cost);
  add("Puissance", c.card_power);
  add("Contre", c.counter_amount);
  add("Vie", c.life);
  add("Attribut", c.attribute);
  add("Traits", c.sub_types);
  const n = c.card_set_id.split("-")[1] ?? c.card_set_id;
  return {
    game: "onepiece",
    id: imageId,
    setId: set.id,
    setName: set.name,
    setCode: set.code,
    number: c.card_set_id,
    numberSort: (Number(n.replace(/\D/g, "")) || 0) + (isAlternate ? 0.5 : 0),
    name: c.card_name,
    character: cleanName(c.card_name),
    category: c.card_type ?? null,
    rarity: c.rarity ?? null,
    language: "en",
    releaseDate: set.releaseDate,
    imageSmall: c.card_image ?? null,
    imageLarge: c.card_image ?? null,
    isAlternate,
    variantLabel: isAlternate ? (variant ?? "Parallèle") : null,
    baseCardId: isAlternate ? c.card_set_id : null,
    tags: onePieceTags(c.rarity ?? null, c.card_type ?? null, imageId, c.card_name),
    colors: (c.card_color ?? "").split(/[\s/]+/).filter(Boolean),
    stats,
    text: c.card_text && c.card_text !== "NULL" ? c.card_text : null,
    illustrator: null,
    attacks: [],
    finishes: [isAlternate ? "parallel" : "normal"],
    externalIds: {},
  };
}

export function quotesFromCard(c: OptcgCard, fx: FxRates | null): PriceQuote[] {
  const q = makeQuote({
    source: "optcgapi",
    sourceLabel: "TCGplayer (via OPTCG API)",
    variant: c.card_image_id && c.card_image_id !== c.card_set_id ? "parallel" : "normal",
    currency: "USD",
    fx,
    updatedAt: c.date_scraped ? new Date(c.date_scraped).toISOString() : null,
    url: `https://www.tcgplayer.com/search/one-piece-card-game/product?q=${encodeURIComponent(c.card_set_id)}`,
    values: { market: num(c.market_price), low: num(c.inventory_price) },
  });
  return q ? [q] : [];
}

export function toBase(c: OptcgCard, set: Pick<TcgSet, "id" | "name" | "code" | "releaseDate">): CardBase {
  const { stats: _s, text: _t, illustrator: _i, attacks: _a, finishes: _f, externalIds: _e, ...base } = mapCard(c, set);
  return base;
}
