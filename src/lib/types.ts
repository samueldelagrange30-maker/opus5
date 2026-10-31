// Modèle de domaine commun à Pokémon TCG et One Piece Card Game.

export type GameId = "pokemon" | "onepiece";

export const GAMES: Record<GameId, { id: GameId; name: string; short: string; slug: string }> = {
  pokemon: { id: "pokemon", name: "Pokémon TCG", short: "Pokémon", slug: "pokemon" },
  onepiece: { id: "onepiece", name: "One Piece Card Game", short: "One Piece", slug: "one-piece" },
};

export function gameFromSlug(slug: string): GameId | null {
  if (slug === "pokemon") return "pokemon";
  if (slug === "one-piece" || slug === "onepiece") return "onepiece";
  return null;
}

export interface TcgSet {
  game: GameId;
  id: string; // identifiant technique stable (ex: "sv08", "op-01")
  code: string; // code officiel affiché (ex: "SSP", "OP-01")
  name: string;
  series: string | null;
  generation: string | null;
  releaseDate: string | null; // ISO yyyy-mm-dd
  totalCards: number | null;
  officialCards: number | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  imageUrl: string | null;
  languages: string[]; // langues pour lesquelles l'extension existe dans la source
  editions: string[]; // éditions / variantes d'impression connues
  source: string;
}

export type CardTag =
  | "holo"
  | "reverse"
  | "full-art"
  | "secret"
  | "alt-art"
  | "sar"
  | "ir"
  | "ultra"
  | "sec"
  | "manga"
  | "sp"
  | "leader"
  | "promo"
  | "first-edition";

export interface CardBase {
  game: GameId;
  id: string; // identifiant unique (ex: "sv08-238", "OP05-119_p1")
  setId: string;
  setName: string;
  setCode: string;
  number: string; // numéro de collection (ex: "238", "OP05-119")
  numberSort: number;
  name: string;
  character: string | null; // Pokémon ou personnage
  category: string | null; // type de carte (Pokémon, Dresseur, Leader, Personnage…)
  rarity: string | null;
  language: string;
  releaseDate: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  isAlternate: boolean;
  variantLabel: string | null;
  baseCardId: string | null; // carte de base pour les versions alternatives
  tags: CardTag[];
  colors: string[]; // types d'énergie (Pokémon) ou couleurs (One Piece)
}

export interface CardStat {
  label: string;
  value: string;
}

export interface CardAttack {
  name: string;
  cost: string[];
  damage: string | null;
  effect: string | null;
}

export interface CardDetail extends CardBase {
  stats: CardStat[];
  text: string | null;
  illustrator: string | null;
  attacks: CardAttack[];
  finishes: string[];
  alternates: CardListItem[];
  externalIds: Record<string, string>;
}

export type PriceSourceId =
  | "cardmarket"
  | "tcgplayer"
  | "ebay"
  | "justtcg"
  | "pokemontcgio"
  | "optcgapi";

export interface PriceValues {
  market: number | null;
  low: number | null;
  avg: number | null;
  high: number | null;
  lastSale: number | null;
  trend: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
}

export interface PriceChange {
  pct: number;
  basis: string; // explication de la méthode de calcul (transparence)
}

export interface PriceChanges {
  h24: PriceChange | null;
  d7: PriceChange | null;
  d30: PriceChange | null;
  y1: PriceChange | null;
}

export interface PriceQuote {
  source: PriceSourceId;
  sourceLabel: string; // ex: "Cardmarket (via TCGdex)"
  variant: string; // normal, holo, reverse, foil…
  condition: string | null;
  currency: "EUR" | "USD" | "GBP" | "JPY";
  original: PriceValues;
  eur: PriceValues;
  fxRate: number | null; // taux appliqué vers EUR (BCE)
  fxDate: string | null;
  updatedAt: string | null; // date d'actualisation côté source
  fetchedAt: string; // date de récupération par la plateforme
  url: string | null;
  salesCount: number | null;
  changes: PriceChanges;
  history?: PricePoint[];
}

export interface PriceSummary {
  available: boolean;
  primary: PriceQuote | null;
  quotes: PriceQuote[];
  marketEur: number | null;
  lowEur: number | null;
  avgEur: number | null;
  highEur: number | null;
  lastSaleEur: number | null;
  changes: PriceChanges;
  updatedAt: string | null;
}

export interface PricePoint {
  date: string; // ISO
  eur: number;
  source: string;
  variant?: string;
}

export interface ListPrice {
  eur: number | null;
  source: string | null;
  updatedAt: string | null;
  change: PriceChange | null; // variation la plus pertinente disponible (7j par défaut)
  changes: PriceChanges;
}

export interface CardListItem extends CardBase {
  price: ListPrice;
}

export type SortKey =
  | "number"
  | "name"
  | "price-desc"
  | "price-asc"
  | "change-desc"
  | "change-asc"
  | "release-desc"
  | "release-asc";

export interface CardFilters {
  game?: GameId;
  q?: string;
  setId?: string;
  number?: string;
  rarity?: string;
  minPrice?: number;
  maxPrice?: number;
  language?: string;
  category?: string;
  character?: string;
  version?: "normal" | "alternate";
  tags?: CardTag[];
  trend?: "up" | "down";
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  items: CardListItem[];
  total: number;
  page: number;
  pageSize: number;
  notice: string | null; // limitation éventuelle du mode de données
  facets: { rarities: string[]; categories: string[]; sets: { id: string; name: string; game: GameId }[] };
}

export type RankingType =
  | "most-expensive"
  | "most-searched"
  | "gainers-24h"
  | "gainers-7d"
  | "losers-7d"
  | "best-sellers"
  | "popular"
  | "recent";

export interface RankingResult {
  type: RankingType;
  items: CardListItem[];
  notice: string | null;
  available: boolean;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  game: GameId | null;
  image: string | null;
}
