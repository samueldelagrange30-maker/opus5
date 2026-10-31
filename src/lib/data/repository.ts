import type {
  CardDetail, CardFilters, CardListItem, GameId, PricePoint, PriceSummary, RankingResult, RankingType, SearchResult, TcgSet,
} from "../types";

export interface CardPage {
  card: CardDetail;
  prices: PriceSummary;
  history: PricePoint[];
  historyNotice: string | null;
  set: TcgSet | null;
}

export interface Suggestion {
  game: GameId;
  id: string;
  name: string;
  setName: string;
  number: string;
  image: string | null;
  priceEur: number | null;
}

export interface Repository {
  mode: "supabase" | "live";
  listSets(game?: GameId): Promise<TcgSet[]>;
  getSet(game: GameId, setId: string): Promise<TcgSet | null>;
  getSetCards(game: GameId, setId: string): Promise<CardListItem[]>;
  getCard(game: GameId, cardId: string): Promise<CardPage | null>;
  getCardsByIds(refs: { game: GameId; id: string }[]): Promise<CardListItem[]>;
  search(filters: CardFilters): Promise<SearchResult>;
  suggest(q: string, game?: GameId): Promise<Suggestion[]>;
  ranking(type: RankingType, opts?: { game?: GameId; limit?: number }): Promise<RankingResult>;
}

export const RANKINGS: Record<RankingType, { title: string; description: string }> = {
  "most-expensive": { title: "Top 100 des cartes les plus chères", description: "Classées par prix du marché actuel en euros." },
  "most-searched": { title: "Top 100 des cartes les plus recherchées", description: "Basé sur les recherches et consultations réelles sur la plateforme." },
  "gainers-24h": { title: "Plus fortes hausses sur 24 heures", description: "Variation de prix sur les dernières 24 heures." },
  "gainers-7d": { title: "Plus fortes hausses sur 7 jours", description: "Variation de prix sur les 7 derniers jours." },
  "losers-7d": { title: "Plus fortes baisses", description: "Plus fortes baisses de prix sur 7 jours." },
  "best-sellers": { title: "Cartes les plus vendues", description: "Nombre de ventes conclues relevées (eBay Marketplace Insights)." },
  popular: { title: "Cartes les plus populaires", description: "Cartes les plus ajoutées aux collections et listes de souhaits." },
  recent: { title: "Cartes récemment sorties", description: "Cartes des extensions les plus récentes." },
};
