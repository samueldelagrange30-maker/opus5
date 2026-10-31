// Service de catalogue : orchestre les connecteurs (catalogue + prix) pour produire
// les objets de domaine. Utilisé par le mode direct ET par les tâches de synchronisation.
import * as tcgdex from "./providers/tcgdex";
import * as optcg from "./providers/optcg";
import { fetchExternalQuotes } from "./providers/price-providers";
import { getFxRates, type FxRates } from "./fx";
import { mapLimit } from "./http";
import { NO_PRICE, summarize, toListPrice } from "./pricing";
import { slugify } from "./format";
import type { CardBase, CardDetail, CardListItem, GameId, PricePoint, PriceQuote, PriceSummary, TcgSet } from "./types";

// Mémoïsation en mémoire (par instance serveur) en complément du cache HTTP de Next.js.
const memo = new Map<string, { at: number; p: Promise<unknown> }>();
export function memoize<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = fn().catch((e) => {
    memo.delete(key);
    throw e;
  });
  memo.set(key, { at: Date.now(), p });
  return p;
}
const H = 3600_000;

export interface HydratedCard {
  detail: Omit<CardDetail, "alternates">;
  quotes: PriceQuote[];
  preferredVariant: string;
  history: PricePoint[];
}

export function toListItem(h: HydratedCard): CardListItem {
  const { stats: _s, text: _t, illustrator: _i, attacks: _a, finishes: _f, externalIds: _e, ...base } = h.detail;
  const summary = summarize(h.quotes, { preferredVariant: h.preferredVariant });
  return { ...base, price: summary.available ? toListPrice(summary) : NO_PRICE };
}

// ----------------------------------------------------------------- Extensions
export function listSets(game: GameId): Promise<TcgSet[]> {
  return memoize(`sets:${game}`, 6 * H, async () => {
    if (game === "pokemon") return tcgdex.listSets();
    const briefs = await optcg.listSetBriefs();
    const sets = await mapLimit(briefs, 4, async (b) => {
      try {
        return optcg.mapSet(b, await optcg.getSetCards(b));
      } catch {
        return optcg.mapSet(b, []);
      }
    });
    return sets;
  });
}

export async function getSet(game: GameId, setId: string): Promise<TcgSet | null> {
  if (game === "pokemon") {
    return memoize(`set:pokemon:${setId}`, 6 * H, async () => {
      const raw = await tcgdex.getRawSet(setId);
      if (!raw) return null;
      const languages = await tcgdex.setLanguages(setId).catch(() => [] as string[]);
      return tcgdex.mapSet(raw, languages.length ? languages : ["fr"]);
    });
  }
  const sets = await listSets("onepiece");
  return sets.find((s) => s.id === setId) ?? null;
}

// --------------------------------------------------------------------- Cartes
async function onePieceIndex(): Promise<{ cards: optcg.OptcgCard[]; sets: TcgSet[] }> {
  return memoize("op:index", 2 * H, async () => {
    const [cards, sets] = await Promise.all([optcg.getAllCards(), listSets("onepiece")]);
    const seen = new Set<string>();
    const unique = cards.filter((c) => {
      const k = c.card_image_id ?? c.card_set_id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { cards: unique, sets };
  });
}

function onePieceSetFor(c: optcg.OptcgCard, sets: TcgSet[]): TcgSet | Pick<TcgSet, "id" | "name" | "code" | "releaseDate"> {
  const code = (c.set_id ?? optcg.setCodeFromCard(c)).toUpperCase();
  return sets.find((s) => s.code === code) ?? { id: slugify(code), name: c.set_name ?? code, code, releaseDate: null };
}

export async function getSetCards(game: GameId, setId: string, fx?: FxRates | null): Promise<HydratedCard[]> {
  const rates = fx === undefined ? await getFxRates() : fx;
  if (game === "pokemon") {
    return memoize(`setcards:pokemon:${setId}`, 2 * H, async () => {
      const raw = await tcgdex.getRawSet(setId);
      if (!raw) return [];
      const set = tcgdex.mapSet(raw);
      const cards = await mapLimit(raw.cards ?? [], 12, async (brief) => {
        try {
          const full = await tcgdex.getRawCard(brief.id);
          if (!full) throw new Error("absente");
          return { detail: tcgdex.mapCard(full, set), quotes: tcgdex.quotesFromCard(full, rates), preferredVariant: tcgdex.preferredVariant(full), history: [] } satisfies HydratedCard;
        } catch {
          // Carte listée mais détail indisponible : affichée sans prix.
          const base = tcgdex.mapCardBrief(brief, set);
          return { detail: { ...base, stats: [], text: null, illustrator: null, attacks: [], finishes: [], externalIds: {} }, quotes: [], preferredVariant: "normal", history: [] } satisfies HydratedCard;
        }
      });
      return cards.sort((a, b) => a.detail.numberSort - b.detail.numberSort);
    });
  }
  return memoize(`setcards:onepiece:${setId}`, 2 * H, async () => {
    const sets = await listSets("onepiece");
    const set = sets.find((s) => s.id === setId);
    if (!set) return [];
    const briefs = await optcg.listSetBriefs();
    const brief = briefs.find((b) => optcg.setSlug(b.id) === setId);
    const cards = brief ? await optcg.getSetCards(brief) : [];
    const seen = new Set<string>();
    return cards
      .filter((c) => { const k = c.card_image_id ?? c.card_set_id; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((c) => ({ detail: optcg.mapCard(c, set), quotes: optcg.quotesFromCard(c, rates), preferredVariant: "normal", history: [] }))
      .sort((a, b) => a.detail.numberSort - b.detail.numberSort || a.detail.id.localeCompare(b.detail.id));
  });
}

export async function getAllOnePieceCards(fx?: FxRates | null): Promise<HydratedCard[]> {
  const rates = fx === undefined ? await getFxRates() : fx;
  const { cards, sets } = await onePieceIndex();
  return cards.map((c) => ({ detail: optcg.mapCard(c, onePieceSetFor(c, sets)), quotes: optcg.quotesFromCard(c, rates), preferredVariant: "normal", history: [] }));
}

export interface FullCard {
  detail: CardDetail;
  summary: PriceSummary;
  history: PricePoint[];
  set: TcgSet | null;
  sourceErrors: { provider: string; message: string }[];
}

// Fiche complète : catalogue + prix intégrés + sources externes configurées + historique source.
export async function getFullCard(game: GameId, cardId: string): Promise<FullCard | null> {
  const fx = await getFxRates();
  if (game === "pokemon") {
    const raw = await tcgdex.getRawCard(cardId);
    if (!raw) return null;
    const set = await getSet("pokemon", raw.set.id);
    const setLite = set ?? { id: raw.set.id, name: raw.set.name, code: raw.set.id.toUpperCase(), releaseDate: null };
    const detail = tcgdex.mapCard(raw, setLite);
    // Nom anglais : nécessaire pour interroger les sources anglophones (eBay, JustTCG, pokemontcg.io).
    const en = tcgdex.getRawCard(cardId, "en").catch(() => null);
    const enCard = await en;
    const ext = await fetchExternalQuotes({ card: detail, externalIds: detail.externalIds, englishName: enCard?.name ?? null, englishSetName: enCard?.set?.name ?? null }, fx);
    const quotes = [...tcgdex.quotesFromCard(raw, fx), ...ext.quotes];
    const history = ext.quotes.flatMap((q) => q.history ?? []);
    // Versions alternatives : même Pokémon dans la même extension (illustrations spéciales).
    let alternates: CardListItem[] = [];
    if (detail.character && set) {
      const siblings = await getSetCards("pokemon", set.id, fx).catch(() => []);
      alternates = siblings.filter((s) => s.detail.id !== detail.id && s.detail.character === detail.character).map(toListItem);
    }
    return { detail: { ...detail, alternates }, summary: summarize(quotes, { preferredVariant: tcgdex.preferredVariant(raw) }), history, set, sourceErrors: ext.errors };
  }

  const baseId = cardId.split("_")[0];
  const versions = await optcg.getCardVersions(baseId);
  const raw = versions.find((v) => (v.card_image_id ?? v.card_set_id) === cardId) ?? (cardId === baseId ? versions[0] : undefined);
  if (!raw) return null;
  const sets = await listSets("onepiece");
  const set = onePieceSetFor(raw, sets);
  const detail = optcg.mapCard(raw, set);
  const ext = await fetchExternalQuotes({ card: detail, externalIds: {}, englishName: detail.character }, fx);
  const quotes = [...optcg.quotesFromCard(raw, fx), ...ext.quotes];
  const sourceHistory = await optcg.getTwoWeekHistory(baseId, cardId, fx);
  const history = [...sourceHistory, ...ext.quotes.flatMap((q) => q.history ?? [])];
  const alternates = versions
    .filter((v) => (v.card_image_id ?? v.card_set_id) !== cardId)
    .map((v) => ({ detail: optcg.mapCard(v, onePieceSetFor(v, sets)), quotes: optcg.quotesFromCard(v, fx), preferredVariant: "normal", history: [] }))
    .map(toListItem);
  return { detail: { ...detail, alternates }, summary: summarize(quotes), history, set: "languages" in set ? (set as TcgSet) : null, sourceErrors: ext.errors };
}

export function cardBaseOf(item: CardListItem): CardBase {
  const { price: _p, ...base } = item;
  return base;
}
