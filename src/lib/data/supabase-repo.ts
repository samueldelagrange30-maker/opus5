// Mode Supabase : lecture du catalogue et des prix synchronisés dans PostgreSQL.
// Recherche exhaustive, filtres SQL combinables, classements complets et historique long.
import type { SupabaseClient } from "@supabase/supabase-js";
import { changesFromHistory, EMPTY_CHANGES, EMPTY_VALUES, summarize } from "../pricing";
import type { CardPage, Repository, Suggestion } from "./repository";
import type {
  CardDetail, CardFilters, CardListItem, CardTag, GameId, PriceChange, PriceChanges, PricePoint, PriceQuote, RankingResult, RankingType, SearchResult, TcgSet,
} from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function rowToSet(r: Row): TcgSet {
  return {
    game: r.game, id: r.set_id, code: r.code, name: r.name, series: r.series, generation: r.generation,
    releaseDate: r.release_date, totalCards: r.total_cards, officialCards: r.official_cards, logoUrl: r.logo_url,
    symbolUrl: r.symbol_url, imageUrl: r.image_url, languages: r.languages ?? [], editions: r.editions ?? [], source: r.source,
  };
}

const changeOf = (pct: unknown, basis: string | undefined): PriceChange | null =>
  pct === null || pct === undefined ? null : { pct: Number(pct), basis: basis ?? "Historique enregistré" };

export function rowToItem(r: Row): CardListItem {
  const basis = (r.change_basis ?? {}) as Record<string, string>;
  const changes: PriceChanges = {
    h24: changeOf(r.change_24h, basis.h24), d7: changeOf(r.change_7d, basis.d7), d30: changeOf(r.change_30d, basis.d30), y1: changeOf(r.change_1y, basis.y1),
  };
  return {
    game: r.game, id: r.card_id, setId: r.set_id, setName: r.set_name, setCode: r.set_code, number: r.number,
    numberSort: Number(r.number_sort), name: r.name, character: r.character, category: r.category, rarity: r.rarity,
    language: r.language, releaseDate: r.release_date, imageSmall: r.image_small, imageLarge: r.image_large,
    isAlternate: r.is_alternate, variantLabel: r.variant_label, baseCardId: r.base_card_id, tags: (r.tags ?? []) as CardTag[], colors: r.colors ?? [],
    price: { eur: n(r.price_eur), source: r.price_source, updatedAt: r.price_updated_at, change: changes.d7 ?? changes.d30 ?? changes.h24, changes },
  };
}

function rowToQuote(r: Row): PriceQuote {
  const v = (k: string) => n(r[k]);
  return {
    source: r.source, sourceLabel: r.source_label, variant: r.variant, condition: r.condition, currency: r.currency,
    original: { ...EMPTY_VALUES, market: v("market"), low: v("low"), avg: v("avg"), high: v("high"), lastSale: v("last_sale"), trend: v("trend"), avg1: v("avg1"), avg7: v("avg7"), avg30: v("avg30") },
    eur: {
      ...EMPTY_VALUES, market: v("eur_market"), low: v("eur_low"), avg: v("eur_avg"), high: v("eur_high"), lastSale: v("eur_last_sale"),
      trend: r.currency === "EUR" ? v("trend") : null, avg1: r.currency === "EUR" ? v("avg1") : null, avg7: r.currency === "EUR" ? v("avg7") : null, avg30: r.currency === "EUR" ? v("avg30") : null,
    },
    fxRate: v("fx_rate"), fxDate: r.fx_date, updatedAt: r.source_updated_at, fetchedAt: r.fetched_at, url: r.url,
    salesCount: r.sales_count, changes: { ...EMPTY_CHANGES, ...(r.changes ?? {}) },
  };
}

const LIST_COLUMNS = "game,card_id,set_id,set_name,set_code,number,number_sort,name,character,category,rarity,language,release_date,image_small,image_large,is_alternate,variant_label,base_card_id,tags,colors,price_eur,change_24h,change_7d,change_30d,change_1y,change_basis,price_source,price_updated_at";
const safe = (s: string) => s.replace(/[,()%*\\]/g, " ").trim();

export function createSupabaseRepo(sb: SupabaseClient): Repository {
  const repo: Repository = {
    mode: "supabase",

    async listSets(game) {
      let q = sb.from("sets").select("*").order("release_date", { ascending: false, nullsFirst: false });
      if (game) q = q.eq("game", game);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(rowToSet);
    },

    async getSet(game, setId) {
      const { data } = await sb.from("sets").select("*").eq("game", game).eq("set_id", setId).maybeSingle();
      return data ? rowToSet(data) : null;
    },

    async getSetCards(game, setId) {
      const { data, error } = await sb.from("cards").select(LIST_COLUMNS).eq("game", game).eq("set_id", setId).order("number_sort").limit(2000);
      if (error) throw error;
      return (data ?? []).map(rowToItem);
    },

    async getCard(game, cardId): Promise<CardPage | null> {
      const { data: r } = await sb.from("cards").select("*").eq("game", game).eq("card_id", cardId).maybeSingle();
      if (!r) return null;
      const [prices, history, set, alts] = await Promise.all([
        sb.from("card_prices").select("*").eq("game", game).eq("card_id", cardId),
        sb.from("price_history").select("day,eur_market,source,variant").eq("game", game).eq("card_id", cardId).order("day").limit(2000),
        sb.from("sets").select("*").eq("game", game).eq("set_id", r.set_id).maybeSingle(),
        game === "onepiece"
          ? sb.from("cards").select(LIST_COLUMNS).eq("game", game).eq("number", r.number).neq("card_id", cardId).limit(24)
          : r.character
            ? sb.from("cards").select(LIST_COLUMNS).eq("game", game).eq("set_id", r.set_id).eq("character", r.character).neq("card_id", cardId).limit(24)
            : Promise.resolve({ data: [] as Row[] }),
      ]);
      const quotes = (prices.data ?? []).map(rowToQuote);
      const points: PricePoint[] = (history.data ?? []).map((h: Row) => ({ date: h.day, eur: Number(h.eur_market), source: h.source, variant: h.variant }));
      const base = rowToItem(r);
      const preliminary = summarize(quotes);
      const primarySeries = points.filter((p) => p.source === preliminary.primary?.source && p.variant === preliminary.primary?.variant);
      const summary = summarize(quotes, { historyChanges: changesFromHistory(primarySeries, preliminary.marketEur) });
      const { price: _p, ...cardBase } = base;
      const card: CardDetail = {
        ...cardBase, stats: r.stats ?? [], attacks: r.attacks ?? [], text: r.text, illustrator: r.illustrator, finishes: r.finishes ?? [],
        externalIds: r.external_ids ?? {}, alternates: ((alts as { data: Row[] | null }).data ?? []).map(rowToItem),
      };
      return {
        card, prices: summary, history: points, set: set.data ? rowToSet(set.data) : null,
        historyNotice: points.length < 2 ? "L'historique se constitue à chaque synchronisation quotidienne des prix." : null,
      };
    },

    async getCardsByIds(refs) {
      if (!refs.length) return [];
      const out: CardListItem[] = [];
      for (const game of ["pokemon", "onepiece"] as GameId[]) {
        const ids = refs.filter((r) => r.game === game).map((r) => r.id);
        if (!ids.length) continue;
        const { data } = await sb.from("cards").select(LIST_COLUMNS).eq("game", game).in("card_id", ids);
        out.push(...(data ?? []).map(rowToItem));
      }
      const order = new Map(refs.map((r, i) => [`${r.game}:${r.id}`, i]));
      return out.sort((a, b) => (order.get(`${a.game}:${a.id}`) ?? 0) - (order.get(`${b.game}:${b.id}`) ?? 0));
    },

    async search(f: CardFilters): Promise<SearchResult> {
      const page = f.page ?? 1;
      const pageSize = f.pageSize ?? 48;
      let q = sb.from("cards").select(LIST_COLUMNS, { count: "exact" });
      if (f.game) q = q.eq("game", f.game);
      if (f.setId) q = q.eq("set_id", f.setId);
      if (f.q) {
        // Chaque mot doit apparaître dans au moins un champ : and(or(...), or(...))
        const groups = safe(f.q).split(/\s+/).filter(Boolean).slice(0, 6)
          .map((t) => `or(name.ilike.*${t}*,character.ilike.*${t}*,number.ilike.*${t}*,set_name.ilike.*${t}*,set_code.ilike.*${t}*)`);
        if (groups.length) q = q.or(`and(${groups.join(",")})`);
      }
      if (f.number) q = q.ilike("number", `%${safe(f.number)}%`);
      if (f.rarity) q = q.eq("rarity", f.rarity);
      if (f.category) q = q.eq("category", f.category);
      if (f.character) q = q.ilike("character", `%${safe(f.character)}%`);
      if (f.language) q = q.eq("language", f.language);
      if (f.version === "alternate") q = q.eq("is_alternate", true);
      if (f.version === "normal") q = q.eq("is_alternate", false);
      if (f.tags?.length) q = q.contains("tags", f.tags);
      if (f.minPrice !== undefined) q = q.gte("price_eur", f.minPrice);
      if (f.maxPrice !== undefined) q = q.lte("price_eur", f.maxPrice);
      if (f.trend === "up") q = q.gt("change_7d", 0);
      if (f.trend === "down") q = q.lt("change_7d", 0);
      const sort = f.sort ?? (f.q ? "price-desc" : "release-desc");
      const o = { nullsFirst: false } as const;
      switch (sort) {
        case "name": q = q.order("name", { ascending: true }); break;
        case "price-desc": q = q.order("price_eur", { ascending: false, ...o }); break;
        case "price-asc": q = q.order("price_eur", { ascending: true, ...o }); break;
        case "change-desc": q = q.order("change_7d", { ascending: false, ...o }); break;
        case "change-asc": q = q.order("change_7d", { ascending: true, ...o }); break;
        case "release-asc": q = q.order("release_date", { ascending: true, ...o }).order("number_sort"); break;
        case "release-desc": q = q.order("release_date", { ascending: false, ...o }).order("number_sort"); break;
        default: q = q.order("set_id").order("number_sort");
      }
      const [{ data, count, error }, facets, sets] = await Promise.all([
        q.range((page - 1) * pageSize, page * pageSize - 1),
        sb.rpc("card_facets", { p_game: f.game ?? null, p_set: f.setId ?? null }),
        sb.from("sets").select("game,set_id,name").order("release_date", { ascending: false, nullsFirst: false }),
      ]);
      if (error) throw error;
      return {
        items: (data ?? []).map(rowToItem), total: count ?? 0, page, pageSize, notice: null,
        facets: {
          rarities: (facets.data as Row | null)?.rarities ?? [], categories: (facets.data as Row | null)?.categories ?? [],
          sets: (sets.data ?? []).filter((s: Row) => !f.game || s.game === f.game).map((s: Row) => ({ id: s.set_id, name: s.name, game: s.game })),
        },
      };
    },

    async suggest(q, game) {
      if (q.trim().length < 2) return [];
      const { data } = await sb.rpc("suggest_cards", { q: q.trim(), p_game: game ?? null, p_limit: 10 });
      return ((data ?? []) as Row[]).map((r): Suggestion => ({
        game: r.game, id: r.card_id, name: r.name, setName: r.set_name, number: r.number, image: r.image_small, priceEur: n(r.price_eur),
      }));
    },

    async ranking(type: RankingType, opts = {}): Promise<RankingResult> {
      const limit = opts.limit ?? 100;
      const base = () => {
        let q = sb.from("cards").select(LIST_COLUMNS);
        if (opts.game) q = q.eq("game", opts.game);
        return q;
      };
      let rows: Row[] = [];
      const fromScores = async (view: string) => {
        let q = sb.from(view).select("game,card_id,score").order("score", { ascending: false }).limit(limit);
        if (opts.game) q = q.eq("game", opts.game);
        const { data } = await q;
        return repo.getCardsByIds(((data ?? []) as Row[]).map((d) => ({ game: d.game, id: d.card_id })));
      };
      switch (type) {
        case "most-expensive": rows = (await base().not("price_eur", "is", null).order("price_eur", { ascending: false }).limit(limit)).data ?? []; break;
        case "gainers-24h": rows = (await base().gt("change_24h", 0).gte("price_eur", 1).order("change_24h", { ascending: false }).limit(limit)).data ?? []; break;
        case "gainers-7d": rows = (await base().gt("change_7d", 0).gte("price_eur", 1).order("change_7d", { ascending: false }).limit(limit)).data ?? []; break;
        case "losers-7d": rows = (await base().lt("change_7d", 0).gte("price_eur", 1).order("change_7d", { ascending: true }).limit(limit)).data ?? []; break;
        case "best-sellers": rows = (await base().not("sales_count_30d", "is", null).order("sales_count_30d", { ascending: false }).limit(limit)).data ?? []; break;
        case "recent": rows = (await base().not("release_date", "is", null).order("release_date", { ascending: false }).order("price_eur", { ascending: false, nullsFirst: false }).limit(limit)).data ?? []; break;
        case "most-searched": {
          const items = await fromScores("card_search_counts");
          return { type, items, available: items.length > 0, notice: items.length ? null : "Pas encore assez de recherches enregistrées pour établir ce classement." };
        }
        case "popular": {
          const items = await fromScores("card_popularity");
          return { type, items, available: items.length > 0, notice: items.length ? null : "Pas encore assez de cartes ajoutées aux collections pour établir ce classement." };
        }
      }
      const items = rows.map(rowToItem);
      const notice = !items.length
        ? type === "best-sellers"
          ? "Aucune donnée de ventes : configurez eBay Marketplace Insights (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)."
          : "Données insuffisantes : lancez une synchronisation des prix."
        : null;
      return { type, items, available: items.length > 0, notice };
    },
  };
  return repo;
}
