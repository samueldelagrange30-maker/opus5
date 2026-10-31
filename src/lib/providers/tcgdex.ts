// Connecteur TCGdex (https://tcgdex.dev) — API ouverte, sans clé, multilingue.
// Fournit : extensions, cartes, images HD, et les prix Cardmarket (EUR) et TCGplayer (USD)
// intégrés dans l'objet « pricing » de chaque carte.
import { config } from "../config";
import { fetchJson, mapLimit } from "../http";
import { makeQuote } from "../pricing";
import { pokemonTags } from "../rarity";
import type { FxRates } from "../fx";
import type { CardAttack, CardBase, CardDetail, CardStat, PriceQuote, TcgSet } from "../types";
import { num } from "../format";

const BASE = () => config.pokemon.tcgdexBase;
const LANG = () => config.pokemon.lang;
export const POKEMON_LANGS = ["fr", "en", "de", "it", "es", "pt"] as const;

interface TcgdexSetBrief { id: string; name: string; logo?: string; symbol?: string; cardCount?: { total?: number; official?: number } }
interface TcgdexCardBrief { id: string; localId: string; name: string; image?: string }
export interface TcgdexSet extends TcgdexSetBrief {
  releaseDate?: string;
  serie?: { id: string; name: string };
  abbreviation?: { official?: string; normal?: string };
  tcgOnline?: string;
  cardCount?: { total?: number; official?: number; normal?: number; reverse?: number; holo?: number; firstEd?: number };
  cards?: TcgdexCardBrief[];
}
interface TcgdexPricingCardmarket {
  updated?: string; unit?: string; idProduct?: number;
  avg?: number; low?: number; trend?: number; avg1?: number; avg7?: number; avg30?: number;
  "avg-holo"?: number; "low-holo"?: number; "trend-holo"?: number; "avg1-holo"?: number; "avg7-holo"?: number; "avg30-holo"?: number;
}
interface TcgdexTcgplayerVariant { productId?: number; lowPrice?: number; midPrice?: number; highPrice?: number; marketPrice?: number; directLowPrice?: number }
export interface TcgdexCard extends TcgdexCardBrief {
  category?: string;
  illustrator?: string;
  rarity?: string;
  set: TcgdexSetBrief;
  variants?: { normal?: boolean; reverse?: boolean; holo?: boolean; firstEdition?: boolean; wPromo?: boolean };
  dexId?: number[];
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  description?: string;
  stage?: string;
  suffix?: string;
  attacks?: { cost?: string[]; name: string; effect?: string; damage?: string | number }[];
  abilities?: { type?: string; name: string; effect?: string }[];
  weaknesses?: { type: string; value?: string }[];
  resistances?: { type: string; value?: string }[];
  retreat?: number;
  regulationMark?: string;
  effect?: string;
  trainerType?: string;
  energyType?: string;
  legal?: { standard?: boolean; expanded?: boolean };
  updated?: string;
  pricing?: { cardmarket?: TcgdexPricingCardmarket | null; tcgplayer?: (Record<string, TcgdexTcgplayerVariant | string | undefined> & { updated?: string; unit?: string }) | null };
}

const opts = (revalidate = config.cache.catalog) => ({ provider: "tcgdex", revalidate, allow404: true });

export function imageUrl(base: string | undefined, quality: "high" | "low"): string | null {
  return base ? `${base}/${quality}.webp` : null;
}
const logoUrl = (base: string | undefined) => (base ? `${base}.webp` : null);

export async function listSetBriefs(lang = LANG()): Promise<TcgdexSetBrief[]> {
  return (await fetchJson<TcgdexSetBrief[]>(`${BASE()}/${lang}/sets`, opts())) ?? [];
}

export async function getRawSet(id: string, lang = LANG()): Promise<TcgdexSet | null> {
  const set = await fetchJson<TcgdexSet>(`${BASE()}/${lang}/sets/${encodeURIComponent(id)}`, opts());
  if (set || lang === "en") return set;
  return fetchJson<TcgdexSet>(`${BASE()}/en/sets/${encodeURIComponent(id)}`, opts());
}

export async function getRawCard(id: string, lang = LANG(), revalidate = config.cache.prices): Promise<TcgdexCard | null> {
  const card = await fetchJson<TcgdexCard>(`${BASE()}/${lang}/cards/${encodeURIComponent(id)}`, opts(revalidate));
  if (card || lang === "en") return card;
  return fetchJson<TcgdexCard>(`${BASE()}/en/cards/${encodeURIComponent(id)}`, opts(revalidate));
}

// Langues dans lesquelles l'extension est référencée chez TCGdex.
export async function setLanguages(id: string): Promise<string[]> {
  const found = await mapLimit([...POKEMON_LANGS], 6, async (l) => {
    try {
      const s = await fetchJson<TcgdexSetBrief>(`${BASE()}/${l}/sets/${encodeURIComponent(id)}`, opts());
      return s ? l : null;
    } catch {
      return null;
    }
  });
  return found.filter((x): x is (typeof POKEMON_LANGS)[number] => !!x);
}

export function mapSet(s: TcgdexSet, languages: string[] = [LANG()]): TcgSet {
  const editions: string[] = [];
  const cc = s.cardCount ?? {};
  if (cc.normal) editions.push("Normale");
  if (cc.reverse) editions.push("Reverse");
  if (cc.holo) editions.push("Holo");
  if (cc.firstEd) editions.push("1ère édition");
  return {
    game: "pokemon",
    id: s.id,
    code: s.abbreviation?.official ?? s.tcgOnline ?? s.id.toUpperCase(),
    name: s.name,
    series: s.serie?.name ?? null,
    generation: s.serie?.name ?? null,
    releaseDate: s.releaseDate ?? null,
    totalCards: cc.total ?? s.cards?.length ?? null,
    officialCards: cc.official ?? null,
    logoUrl: logoUrl(s.logo),
    symbolUrl: logoUrl(s.symbol),
    imageUrl: logoUrl(s.logo),
    languages,
    editions,
    source: "TCGdex",
  };
}

export function numberSort(localId: string): number {
  const m = localId.match(/\d+/);
  const n = m ? Number(m[0]) : 0;
  const prefix = localId.match(/^[A-Za-z]+/)?.[0];
  return prefix ? 100000 + n : n; // ex: « TG05 », « SV001 » après les numéros simples
}

export function mapCardBrief(c: TcgdexCardBrief, set: TcgSet): CardBase {
  return {
    game: "pokemon",
    id: c.id,
    setId: set.id,
    setName: set.name,
    setCode: set.code,
    number: c.localId,
    numberSort: numberSort(c.localId),
    name: c.name,
    character: null,
    category: null,
    rarity: null,
    language: LANG(),
    releaseDate: set.releaseDate,
    imageSmall: imageUrl(c.image, "low"),
    imageLarge: imageUrl(c.image, "high"),
    isAlternate: false,
    variantLabel: null,
    baseCardId: null,
    tags: [],
    colors: [],
  };
}

export function mapCard(c: TcgdexCard, set: Pick<TcgSet, "id" | "name" | "code" | "releaseDate">): Omit<CardDetail, "alternates"> {
  const stats: CardStat[] = [];
  if (c.hp) stats.push({ label: "PV", value: String(c.hp) });
  if (c.stage) stats.push({ label: "Stade", value: c.stage });
  if (c.evolveFrom) stats.push({ label: "Évolue de", value: c.evolveFrom });
  if (c.types?.length) stats.push({ label: "Type", value: c.types.join(", ") });
  if (c.weaknesses?.length) stats.push({ label: "Faiblesse", value: c.weaknesses.map((w) => `${w.type} ${w.value ?? ""}`.trim()).join(", ") });
  if (c.resistances?.length) stats.push({ label: "Résistance", value: c.resistances.map((w) => `${w.type} ${w.value ?? ""}`.trim()).join(", ") });
  if (c.retreat !== undefined) stats.push({ label: "Retraite", value: String(c.retreat) });
  if (c.trainerType) stats.push({ label: "Type de Dresseur", value: c.trainerType });
  if (c.energyType) stats.push({ label: "Type d'Énergie", value: c.energyType });
  if (c.regulationMark) stats.push({ label: "Marque de régulation", value: c.regulationMark });
  if (c.dexId?.length) stats.push({ label: "N° Pokédex", value: c.dexId.join(", ") });
  if (c.legal) stats.push({ label: "Légalité", value: [c.legal.standard ? "Standard" : null, c.legal.expanded ? "Étendu" : null].filter(Boolean).join(" · ") || "Hors format" });

  const attacks: CardAttack[] = [
    ...(c.abilities ?? []).map((a) => ({ name: `${a.type ?? "Talent"} : ${a.name}`, cost: [], damage: null, effect: a.effect ?? null })),
    ...(c.attacks ?? []).map((a) => ({ name: a.name, cost: a.cost ?? [], damage: a.damage !== undefined ? String(a.damage) : null, effect: a.effect ?? null })),
  ];
  const finishes = Object.entries(c.variants ?? {}).filter(([, v]) => v).map(([k]) => k);
  const externalIds: Record<string, string> = {};
  if (c.pricing?.cardmarket?.idProduct) externalIds.cardmarket = String(c.pricing.cardmarket.idProduct);
  const tp = c.pricing?.tcgplayer;
  if (tp) {
    for (const v of Object.values(tp)) if (v && typeof v === "object" && v.productId) { externalIds.tcgplayer = String(v.productId); break; }
  }
  const category = c.category ?? null;
  return {
    game: "pokemon",
    id: c.id,
    setId: set.id,
    setName: set.name,
    setCode: set.code,
    number: c.localId,
    numberSort: numberSort(c.localId),
    name: c.name,
    character: category && /pok/i.test(category) ? c.name.replace(/[\s-]+(ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|LV\.X|TAG TEAM|☆|δ)$/u, "").trim() : null,
    category,
    rarity: c.rarity ?? null,
    language: LANG(),
    releaseDate: set.releaseDate,
    imageSmall: imageUrl(c.image, "low"),
    imageLarge: imageUrl(c.image, "high"),
    isAlternate: false,
    variantLabel: null,
    baseCardId: null,
    tags: pokemonTags(c.rarity ?? null, c.variants),
    colors: c.types ?? [],
    stats,
    text: c.description ?? c.effect ?? null,
    illustrator: c.illustrator ?? null,
    attacks,
    finishes,
    externalIds,
  };
}

// Cotations intégrées (Cardmarket EUR + TCGplayer USD) — valeurs réelles fournies par TCGdex.
export function quotesFromCard(c: TcgdexCard, fx: FxRates | null): PriceQuote[] {
  const quotes: PriceQuote[] = [];
  const cm = c.pricing?.cardmarket;
  if (cm) {
    const url = cm.idProduct ? `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${cm.idProduct}` : null;
    const base = makeQuote({
      source: "cardmarket", sourceLabel: "Cardmarket (via TCGdex)", variant: "normal", currency: "EUR", fx,
      updatedAt: cm.updated ?? null, url,
      values: { market: num(cm.trend), trend: num(cm.trend), avg: num(cm.avg), low: num(cm.low), avg1: num(cm.avg1), avg7: num(cm.avg7), avg30: num(cm.avg30) },
    });
    if (base) quotes.push(base);
    const holo = makeQuote({
      source: "cardmarket", sourceLabel: "Cardmarket (via TCGdex)", variant: "holo", currency: "EUR", fx,
      updatedAt: cm.updated ?? null, url,
      values: { market: num(cm["trend-holo"]), trend: num(cm["trend-holo"]), avg: num(cm["avg-holo"]), low: num(cm["low-holo"]), avg1: num(cm["avg1-holo"]), avg7: num(cm["avg7-holo"]), avg30: num(cm["avg30-holo"]) },
    });
    if (holo) quotes.push(holo);
  }
  const tp = c.pricing?.tcgplayer;
  if (tp) {
    const currency = (typeof tp.unit === "string" ? tp.unit : "USD") as "USD";
    for (const [variant, v] of Object.entries(tp)) {
      if (!v || typeof v !== "object") continue;
      const q = makeQuote({
        source: "tcgplayer", sourceLabel: "TCGplayer (via TCGdex)", variant: normalizeVariant(variant), currency, fx,
        updatedAt: typeof tp.updated === "string" ? tp.updated : null,
        url: v.productId ? `https://www.tcgplayer.com/product/${v.productId}` : null,
        values: { market: num(v.marketPrice), low: num(v.lowPrice), avg: num(v.midPrice), high: num(v.highPrice) },
      });
      if (q) quotes.push(q);
    }
  }
  return quotes;
}

export function normalizeVariant(v: string): string {
  const s = v.toLowerCase();
  if (s.includes("reverse")) return "reverse";
  if (s.includes("1st") || s.includes("first")) return "first-edition";
  if (s.includes("holo") || s.includes("foil")) return "holo";
  return "normal";
}

export function preferredVariant(c: Pick<TcgdexCard, "variants">): string {
  if (c.variants && !c.variants.normal && c.variants.holo) return "holo";
  return "normal";
}

// Charge les détails de toutes les extensions (date de sortie, série…) — mis en cache 12 h.
export async function listSets(): Promise<TcgSet[]> {
  const briefs = await listSetBriefs();
  const enBriefs = LANG() === "en" ? [] : await listSetBriefs("en").catch(() => []);
  const ids = new Map<string, string>();
  for (const b of briefs) ids.set(b.id, LANG());
  for (const b of enBriefs) if (!ids.has(b.id)) ids.set(b.id, "en");
  const sets = await mapLimit([...ids.entries()], 10, async ([id, lang]) => {
    try {
      const raw = await getRawSet(id, lang);
      return raw ? mapSet(raw, lang === LANG() ? [LANG()] : ["en"]) : null;
    } catch {
      return null;
    }
  });
  return sets.filter((s): s is TcgSet => !!s);
}

// Recherche serveur TCGdex (filtres « like » insensibles à la casse + pagination).
export async function searchCardBriefs(f: { name?: string; rarity?: string; category?: string; localId?: string; page?: number; perPage?: number }): Promise<TcgdexCardBrief[]> {
  const p = new URLSearchParams();
  if (f.name) p.set("name", f.name);
  if (f.rarity) p.set("rarity", `eq:${f.rarity}`);
  if (f.category) p.set("category", `eq:${f.category}`);
  if (f.localId) p.set("localId", f.localId);
  p.set("pagination:page", String(f.page ?? 1));
  p.set("pagination:itemsPerPage", String(f.perPage ?? 48));
  const res = await fetchJson<TcgdexCardBrief[]>(`${BASE()}/${LANG()}/cards?${p}`, opts(config.cache.catalog));
  return Array.isArray(res) ? res : [];
}

export const setIdFromCardId = (cardId: string) => cardId.slice(0, cardId.lastIndexOf("-"));
