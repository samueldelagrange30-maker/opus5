// Mode direct : lecture des API publiques (TCGdex, OPTCG API…) avec cache.
// Fonctionne sans base de données. Certaines fonctionnalités (classements basés sur
// l'activité, historique long, comptes utilisateurs) nécessitent Supabase.
import * as catalog from "../catalog";
import * as tcgdex from "../providers/tcgdex";
import { getFxRates, type FxRates } from "../fx";
import { mapLimit } from "../http";
import { facetsOf, matches, sortCards } from "./filters";
import type { CardPage, Repository, Suggestion } from "./repository";
import type { CardFilters, CardListItem, GameId, RankingResult, RankingType, SearchResult, TcgSet } from "../types";

const H = 3600_000;

async function hydratePokemon(id: string, fx: FxRates | null): Promise<CardListItem | null> {
  return catalog.memoize(`pk:item:${id}`, 2 * H, async () => {
    const raw = await tcgdex.getRawCard(id).catch(() => null);
    if (!raw) return null;
    const set = await catalog.getSet("pokemon", raw.set.id).catch(() => null);
    const detail = tcgdex.mapCard(raw, set ?? { id: raw.set.id, name: raw.set.name, code: raw.set.id.toUpperCase(), releaseDate: null });
    return catalog.toListItem({ detail, quotes: tcgdex.quotesFromCard(raw, fx), preferredVariant: tcgdex.preferredVariant(raw), history: [] });
  });
}

async function sortedSets(game: GameId): Promise<TcgSet[]> {
  const sets = await catalog.listSets(game);
  return [...sets].sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
}

// Échantillon utilisé pour les classements en mode direct.
async function rankingPool(game?: GameId): Promise<{ items: CardListItem[]; scope: string }> {
  return catalog.memoize(`pool:${game ?? "all"}`, 2 * H, async () => {
    const fx = await getFxRates();
    const parts: CardListItem[] = [];
    const scope: string[] = [];
    if (!game || game === "onepiece") {
      const op = await catalog.getAllOnePieceCards(fx).catch(() => []);
      parts.push(...op.map(catalog.toListItem));
      scope.push("toutes les cartes One Piece");
    }
    if (!game || game === "pokemon") {
      const recent = (await sortedSets("pokemon").catch(() => [])).filter((s) => s.releaseDate).slice(0, 6);
      const lists = await mapLimit(recent, 2, (s) => catalog.getSetCards("pokemon", s.id, fx).catch(() => []));
      parts.push(...lists.flat().map(catalog.toListItem));
      if (recent.length) scope.push(`les ${recent.length} dernières extensions Pokémon`);
    }
    return { items: parts, scope: scope.join(" et ") };
  });
}

export const liveRepo: Repository = {
  mode: "live",

  async listSets(game) {
    const games: GameId[] = game ? [game] : ["pokemon", "onepiece"];
    const lists = await Promise.all(games.map((g) => catalog.listSets(g).catch(() => [] as TcgSet[])));
    return lists.flat().sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
  },

  getSet: (game, setId) => catalog.getSet(game, setId),

  async getSetCards(game, setId) {
    return (await catalog.getSetCards(game, setId)).map(catalog.toListItem);
  },

  async getCard(game, cardId): Promise<CardPage | null> {
    const full = await catalog.getFullCard(game, cardId);
    if (!full) return null;
    const notice = full.history.length
      ? "Historique issu des sources de prix (2 semaines pour OPTCG API). Connectez Supabase pour conserver l'historique complet."
      : "L'historique détaillé est constitué par les synchronisations quotidiennes (Supabase). En attendant, les moyennes publiées par Cardmarket sont affichées.";
    return { card: full.detail, prices: full.summary, history: full.history, historyNotice: notice, set: full.set };
  },

  async getCardsByIds(refs) {
    const fx = await getFxRates();
    const opIndex = refs.some((r) => r.game === "onepiece") ? await catalog.getAllOnePieceCards(fx).catch(() => []) : [];
    const out = await mapLimit(refs, 6, async (r) => {
      if (r.game === "pokemon") return hydratePokemon(r.id, fx);
      const h = opIndex.find((c) => c.detail.id === r.id);
      return h ? catalog.toListItem(h) : null;
    });
    return out.filter((x): x is CardListItem => !!x);
  },

  async search(f: CardFilters): Promise<SearchResult> {
    const fx = await getFxRates();
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 48;
    const notices: string[] = [];
    const pool: CardListItem[] = [];

    if (!f.game || f.game === "onepiece") {
      if (!f.setId || f.game === "onepiece") {
        const all = await catalog.getAllOnePieceCards(fx).catch(() => []);
        pool.push(...all.map(catalog.toListItem).filter((c) => !f.setId || c.setId === f.setId));
      }
    }
    if (!f.game || f.game === "pokemon") {
      const isPokemonSet = f.setId && (f.game === "pokemon" || !f.setId.startsWith("op-") && !f.setId.startsWith("st-") && !f.setId.startsWith("eb-") && !f.setId.startsWith("prb-"));
      if (isPokemonSet) {
        const cards = await catalog.getSetCards("pokemon", f.setId!, fx).catch(() => []);
        pool.push(...cards.map(catalog.toListItem));
      } else if (f.q || f.number || f.rarity || f.category || f.character) {
        // Recherche côté TCGdex puis enrichissement (prix) des résultats.
        const briefs = await tcgdex.searchCardBriefs({ name: f.q ?? f.character, rarity: f.rarity, category: f.category, localId: f.number, page: 1, perPage: 120 }).catch(() => []);
        const hydrated = await mapLimit(briefs, 12, (b) => hydratePokemon(b.id, fx));
        pool.push(...hydrated.filter((x): x is CardListItem => !!x));
        if (briefs.length >= 120) notices.push("Mode direct : seuls les 120 premiers résultats Pokémon sont analysés. Affinez la recherche ou connectez Supabase pour une recherche exhaustive.");
      } else {
        const latest = (await sortedSets("pokemon").catch(() => [])).find((s) => s.releaseDate);
        if (latest) {
          const cards = await catalog.getSetCards("pokemon", latest.id, fx).catch(() => []);
          pool.push(...cards.map(catalog.toListItem));
          notices.push(`Mode direct : sans critère, les cartes Pokémon affichées proviennent de la dernière extension (${latest.name}).`);
        }
      }
    }

    // Les recherches Pokémon par nom sont déjà filtrées côté source : on n'applique que les autres critères.
    const filtered = pool.filter((c) => matches(c, c.game === "pokemon" && !f.setId ? { ...f, q: undefined, character: undefined } : f));
    const sorted = sortCards(filtered, f.sort ?? (f.q ? "price-desc" : "number"));
    const sets = await this.listSets(f.game).catch(() => [] as TcgSet[]);
    return {
      items: sorted.slice((page - 1) * pageSize, page * pageSize),
      total: sorted.length,
      page,
      pageSize,
      notice: notices.join(" ") || null,
      facets: { ...facetsOf(pool), sets: sets.map((s) => ({ id: s.id, name: s.name, game: s.game })) },
    };
  },

  async suggest(q, game) {
    if (q.trim().length < 2) return [];
    const fx = await getFxRates();
    const out: Suggestion[] = [];
    if (!game || game === "onepiece") {
      const all = await catalog.getAllOnePieceCards(fx).catch(() => []);
      const items = all.map(catalog.toListItem).filter((c) => matches(c, { q }));
      out.push(...sortCards(items, "price-desc").slice(0, 6).map(toSuggestion));
    }
    if (!game || game === "pokemon") {
      const briefs = await tcgdex.searchCardBriefs({ name: q, perPage: 8 }).catch(() => []);
      const items = await mapLimit(briefs, 8, (b) => hydratePokemon(b.id, fx));
      out.push(...items.filter((x): x is CardListItem => !!x).map(toSuggestion));
    }
    return out.slice(0, 10);
  },

  async ranking(type: RankingType, opts = {}): Promise<RankingResult> {
    const limit = opts.limit ?? 100;
    if (type === "most-searched" || type === "popular" || type === "best-sellers") {
      return {
        type, items: [], available: false,
        notice: type === "best-sellers"
          ? "Classement basé sur les ventes conclues eBay : nécessite Supabase et l'accès eBay Marketplace Insights (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)."
          : "Classement basé sur l'activité réelle des utilisateurs : nécessite la base de données Supabase.",
      };
    }
    const { items, scope } = await rankingPool(opts.game);
    let ranked: CardListItem[] = [];
    if (type === "most-expensive") ranked = sortCards(items.filter((c) => c.price.eur !== null), "price-desc");
    if (type === "gainers-24h") ranked = items.filter((c) => (c.price.changes.h24?.pct ?? 0) > 0).sort((a, b) => b.price.changes.h24!.pct - a.price.changes.h24!.pct);
    if (type === "gainers-7d") ranked = items.filter((c) => (c.price.changes.d7?.pct ?? 0) > 0).sort((a, b) => b.price.changes.d7!.pct - a.price.changes.d7!.pct);
    if (type === "losers-7d") ranked = items.filter((c) => (c.price.changes.d7?.pct ?? 0) < 0).sort((a, b) => a.price.changes.d7!.pct - b.price.changes.d7!.pct);
    if (type === "recent") ranked = sortCards(items, "release-desc");
    // Les variations sur des cartes à quelques centimes ne sont pas significatives.
    if (type.startsWith("gainers") || type.startsWith("losers")) ranked = ranked.filter((c) => (c.price.eur ?? 0) >= 1);
    const changeNote = type.startsWith("gainers") || type.startsWith("losers")
      ? " Variations calculées à partir des moyennes publiées par les sources (méthode indiquée au survol), cartes ≥ 1 €."
      : "";
    return { type, items: ranked.slice(0, limit), available: ranked.length > 0, notice: `Mode direct : classement calculé sur ${scope || "les données disponibles"}.${changeNote}` };
  },
};

function toSuggestion(c: CardListItem): Suggestion {
  return { game: c.game, id: c.id, name: c.name, setName: c.setName, number: c.number, image: c.imageSmall, priceEur: c.price.eur };
}
