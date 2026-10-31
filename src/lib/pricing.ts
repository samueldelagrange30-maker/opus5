// Agrégation des cotations multi-sources en un résumé de prix en euros.
// Règle absolue : aucune valeur n'est extrapolée. Une donnée manquante reste « null »
// et l'interface affiche « Prix indisponible ».
import type { ListPrice, PriceChange, PriceChanges, PricePoint, PriceQuote, PriceSourceId, PriceSummary, PriceValues } from "./types";
import { eurPerUnit, type FxRates } from "./fx";
import { pctChange } from "./format";

export const EMPTY_VALUES: PriceValues = {
  market: null, low: null, avg: null, high: null, lastSale: null, trend: null, avg1: null, avg7: null, avg30: null,
};
export const EMPTY_CHANGES: PriceChanges = { h24: null, d7: null, d30: null, y1: null };

// Priorité des sources pour le « prix du marché » en euros.
// Cardmarket est la place de marché de référence en Europe (prix natifs en EUR).
export const SOURCE_PRIORITY: PriceSourceId[] = ["cardmarket", "justtcg", "tcgplayer", "pokemontcgio", "optcgapi", "ebay"];

export function convertValues(v: PriceValues, currency: string, fx: FxRates | null): { eur: PriceValues; rate: number | null } {
  const rate = eurPerUnit(currency, fx);
  if (rate === null) return { eur: { ...EMPTY_VALUES }, rate: null };
  const c = (x: number | null) => (x === null ? null : Math.round(x * rate * 100) / 100);
  return {
    rate,
    eur: {
      market: c(v.market), low: c(v.low), avg: c(v.avg), high: c(v.high), lastSale: c(v.lastSale),
      trend: c(v.trend), avg1: c(v.avg1), avg7: c(v.avg7), avg30: c(v.avg30),
    },
  };
}

export function makeQuote(input: {
  source: PriceSourceId;
  sourceLabel: string;
  variant: string;
  currency: PriceQuote["currency"];
  values: Partial<PriceValues>;
  fx: FxRates | null;
  updatedAt: string | null;
  url?: string | null;
  condition?: string | null;
  salesCount?: number | null;
  changes?: Partial<PriceChanges>;
  history?: PricePoint[];
}): PriceQuote | null {
  const original: PriceValues = { ...EMPTY_VALUES, ...input.values };
  // Un prix sans aucune valeur exploitable n'est pas une cotation.
  if (Object.values(original).every((x) => x === null || x === undefined)) return null;
  const { eur, rate } = convertValues(original, input.currency, input.fx);
  const changes = { ...EMPTY_CHANGES, ...input.changes };
  if (input.source === "cardmarket") {
    // Indicateurs dérivés des moyennes publiées par Cardmarket (méthode affichée à l'utilisateur).
    const ref = original.trend ?? original.avg;
    changes.h24 ??= toChange(pctChange(original.avg1, original.avg7), "Moyenne des ventes 24 h vs moyenne 7 j (Cardmarket)");
    changes.d7 ??= toChange(pctChange(ref, original.avg7), "Tendance actuelle vs moyenne 7 j (Cardmarket)");
    changes.d30 ??= toChange(pctChange(ref, original.avg30), "Tendance actuelle vs moyenne 30 j (Cardmarket)");
  }
  return {
    source: input.source,
    sourceLabel: input.sourceLabel,
    variant: input.variant,
    condition: input.condition ?? null,
    currency: input.currency,
    original,
    eur,
    fxRate: rate,
    fxDate: input.currency === "EUR" ? null : input.fx?.date ?? null,
    updatedAt: input.updatedAt,
    fetchedAt: new Date().toISOString(),
    url: input.url ?? null,
    salesCount: input.salesCount ?? null,
    changes,
    history: input.history,
  };
}

export function toChange(pct: number | null, basis: string): PriceChange | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  return { pct: Math.round(pct * 10) / 10, basis };
}

export function marketValue(v: PriceValues): number | null {
  return v.market ?? v.trend ?? v.avg ?? v.lastSale ?? v.low ?? null;
}

// Sélectionne la cotation principale : variante préférée puis priorité de source.
export function pickPrimary(quotes: PriceQuote[], preferredVariant?: string): PriceQuote | null {
  const usable = quotes.filter((q) => marketValue(q.eur) !== null);
  if (!usable.length) return null;
  const rank = (q: PriceQuote) => {
    const s = SOURCE_PRIORITY.indexOf(q.source);
    const v = preferredVariant && q.variant === preferredVariant ? 0 : q.variant === "normal" ? 1 : 2;
    return v * 100 + (s < 0 ? 99 : s);
  };
  return [...usable].sort((a, b) => rank(a) - rank(b))[0];
}

export function summarize(quotes: PriceQuote[], opts: { preferredVariant?: string; historyChanges?: Partial<PriceChanges> } = {}): PriceSummary {
  const primary = pickPrimary(quotes, opts.preferredVariant);
  if (!primary) {
    return {
      available: false, primary: null, quotes, marketEur: null, lowEur: null, avgEur: null, highEur: null,
      lastSaleEur: null, changes: { ...EMPTY_CHANGES, ...opts.historyChanges }, updatedAt: null,
    };
  }
  const sameVariant = quotes.filter((q) => q.variant === primary.variant || q.source === "ebay");
  const lows = sameVariant.map((q) => q.eur.low).filter((x): x is number => x !== null);
  const highs = sameVariant.map((q) => q.eur.high).filter((x): x is number => x !== null);
  const lastSale = sameVariant.find((q) => q.source === "ebay" && q.eur.lastSale !== null)?.eur.lastSale
    ?? primary.eur.lastSale ?? primary.eur.avg1 ?? null;

  // Les variations issues de l'historique enregistré (instantanés) priment sur les indicateurs dérivés.
  const changes: PriceChanges = {
    h24: opts.historyChanges?.h24 ?? primary.changes.h24,
    d7: opts.historyChanges?.d7 ?? primary.changes.d7,
    d30: opts.historyChanges?.d30 ?? primary.changes.d30,
    y1: opts.historyChanges?.y1 ?? primary.changes.y1,
  };
  const dates = quotes.map((q) => q.updatedAt).filter((d): d is string => !!d).sort();
  return {
    available: true,
    primary,
    quotes,
    marketEur: marketValue(primary.eur),
    lowEur: lows.length ? Math.min(...lows) : null,
    avgEur: primary.eur.avg ?? null,
    highEur: highs.length ? Math.max(...highs) : null,
    lastSaleEur: lastSale,
    changes,
    updatedAt: dates.at(-1) ?? primary.fetchedAt,
  };
}

export function toListPrice(s: PriceSummary): ListPrice {
  return {
    eur: s.marketEur,
    source: s.primary?.sourceLabel ?? null,
    updatedAt: s.updatedAt,
    change: s.changes.d7 ?? s.changes.d30 ?? s.changes.h24 ?? null,
    changes: s.changes,
  };
}

export const NO_PRICE: ListPrice = { eur: null, source: null, updatedAt: null, change: null, changes: EMPTY_CHANGES };

// Variations exactes calculées à partir d'un historique de points (instantanés quotidiens).
export function changesFromHistory(points: PricePoint[], nowEur: number | null): Partial<PriceChanges> {
  if (!points.length || nowEur === null) return {};
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const latestTs = new Date(sorted.at(-1)!.date).getTime();
  const at = (days: number) => {
    const target = latestTs - days * 86400000;
    // point le plus proche, au plus tard 25 % de la période d'écart
    let best: PricePoint | null = null;
    let bestDiff = Infinity;
    for (const p of sorted) {
      const d = Math.abs(new Date(p.date).getTime() - target);
      if (d < bestDiff) { bestDiff = d; best = p; }
    }
    return best && bestDiff <= Math.max(days * 0.25, 1) * 86400000 ? best.eur : null;
  };
  const basis = (label: string) => `Historique enregistré par la plateforme (${label})`;
  return {
    h24: toChange(pctChange(nowEur, at(1)), basis("24 h")) ?? undefined,
    d7: toChange(pctChange(nowEur, at(7)), basis("7 j")) ?? undefined,
    d30: toChange(pctChange(nowEur, at(30)), basis("30 j")) ?? undefined,
    y1: toChange(pctChange(nowEur, at(365)), basis("1 an")) ?? undefined,
  } as Partial<PriceChanges>;
}
