// Connecteurs de prix externes. Chaque connecteur déclare : jeux couverts, besoin de clé,
// limites de débit (voir http.ts) et une méthode fetchQuotes(). Les connecteurs non
// configurés sont inactifs et clairement signalés dans l'espace administrateur.
import { createHmac, randomBytes } from "node:crypto";
import { config } from "../config";
import { fetchJson, ProviderError } from "../http";
import { makeQuote, toChange } from "../pricing";
import { num } from "../format";
import type { FxRates } from "../fx";
import type { CardBase, GameId, PricePoint, PriceQuote } from "../types";

export interface PriceLookup {
  card: CardBase;
  externalIds: Record<string, string>; // cardmarket idProduct, tcgplayer productId…
  englishName?: string | null;
  englishSetName?: string | null;
}

export interface PriceProvider {
  id: string;
  label: string;
  games: GameId[];
  kind: "intégré" | "api";
  requiresKey: boolean;
  envKeys: string[];
  docsUrl: string;
  note: string;
  isConfigured(): boolean;
  fetchQuotes?(lookup: PriceLookup, fx: FxRates | null): Promise<PriceQuote[]>;
  healthCheck?(): Promise<{ ok: boolean; message: string }>;
}

// ---------------------------------------------------------------------------
// JustTCG — prix TCGplayer par état/variante, variations 24 h/7 j/30 j et historique.
// Couvre Pokémon et One Piece. Clé gratuite : https://justtcg.com
// ---------------------------------------------------------------------------
interface JustTcgVariant {
  id: string; condition?: string; printing?: string; language?: string; price?: number;
  lastUpdated?: number; priceChange24hr?: number | null; priceChange7d?: number | null; priceChange30d?: number | null;
  priceHistory?: { p: number; t: number }[];
}
interface JustTcgCard { id: string; name: string; number?: string; set?: string; tcgplayerId?: string; variants?: JustTcgVariant[] }

const justtcg: PriceProvider = {
  id: "justtcg",
  label: "JustTCG",
  games: ["pokemon", "onepiece"],
  kind: "api",
  requiresKey: true,
  envKeys: ["JUSTTCG_API_KEY"],
  docsUrl: "https://justtcg.com/docs",
  note: "Prix TCGplayer par état (NM, LP…), variations et historique. Offre gratuite limitée en requêtes/jour.",
  isConfigured: () => !!config.providers.justtcgKey,
  async fetchQuotes(l, fx) {
    const key = config.providers.justtcgKey;
    if (!key) return [];
    const headers = { "x-api-key": key };
    const game = l.card.game === "pokemon" ? "pokemon" : "one-piece-card-game";
    const params = new URLSearchParams({ game, include_price_history: "true" });
    if (l.externalIds.tcgplayer) params.set("tcgplayerId", l.externalIds.tcgplayer);
    else params.set("q", `${l.englishName ?? l.card.character ?? l.card.name} ${l.card.number}`.trim());
    const res = await fetchJson<{ data?: JustTcgCard[] }>(`https://api.justtcg.com/v1/cards?${params}`, {
      provider: "justtcg", headers, revalidate: config.cache.prices,
    });
    const cards = res?.data ?? [];
    const match = cards.find((c) => l.externalIds.tcgplayer ? c.tcgplayerId === l.externalIds.tcgplayer : (c.number ?? "").toUpperCase() === l.card.number.toUpperCase()) ?? (l.externalIds.tcgplayer ? cards[0] : undefined);
    if (!match) return [];
    const nm = (match.variants ?? []).filter((v) => !v.condition || /near mint|^nm$/i.test(v.condition));
    return nm.flatMap((v) => {
      const history: PricePoint[] = (v.priceHistory ?? [])
        .map((h) => ({ date: new Date(h.t * 1000).toISOString(), eur: fx?.rates.USD ? Math.round((h.p / fx.rates.USD) * 100) / 100 : NaN, source: "JustTCG" }))
        .filter((p) => Number.isFinite(p.eur));
      const q = makeQuote({
        source: "justtcg", sourceLabel: "JustTCG (TCGplayer)", variant: (v.printing ?? "normal").toLowerCase().includes("foil") || (v.printing ?? "").toLowerCase().includes("holo") ? "holo" : "normal",
        condition: v.condition ?? "Near Mint", currency: "USD", fx,
        updatedAt: v.lastUpdated ? new Date(v.lastUpdated * 1000).toISOString() : null,
        values: { market: num(v.price) },
        changes: {
          h24: v.priceChange24hr != null ? toChange(v.priceChange24hr, "Variation 24 h (JustTCG)") : null,
          d7: v.priceChange7d != null ? toChange(v.priceChange7d, "Variation 7 j (JustTCG)") : null,
          d30: v.priceChange30d != null ? toChange(v.priceChange30d, "Variation 30 j (JustTCG)") : null,
        },
        history,
      });
      return q ? [q] : [];
    });
  },
  async healthCheck() {
    if (!config.providers.justtcgKey) return { ok: false, message: "Clé JUSTTCG_API_KEY manquante" };
    await fetchJson(`https://api.justtcg.com/v1/games`, { provider: "justtcg", headers: { "x-api-key": config.providers.justtcgKey }, retries: 0 });
    return { ok: true, message: "OK" };
  },
};

// ---------------------------------------------------------------------------
// Pokémon TCG API (pokemontcg.io) — prix Cardmarket + TCGplayer (Pokémon uniquement).
// Clé facultative (débit plus élevé) : https://dev.pokemontcg.io
// ---------------------------------------------------------------------------
interface PtcgCard {
  id: string; number: string; name: string; set: { name: string; id: string };
  cardmarket?: { url?: string; updatedAt?: string; prices?: Record<string, number> };
  tcgplayer?: { url?: string; updatedAt?: string; prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }> };
}

const pokemontcgio: PriceProvider = {
  id: "pokemontcgio",
  label: "Pokémon TCG API",
  games: ["pokemon"],
  kind: "api",
  requiresKey: false,
  envKeys: ["POKEMONTCG_API_KEY", "POKEMONTCG_ENABLED"],
  docsUrl: "https://docs.pokemontcg.io",
  note: "Source complémentaire (prix Cardmarket/TCGplayer). Activée avec POKEMONTCG_ENABLED=true ou une clé.",
  isConfigured: () => config.providers.pokemontcgEnabled,
  async fetchQuotes(l, fx) {
    if (!config.providers.pokemontcgEnabled || !l.englishSetName) return [];
    const n = l.card.number.replace(/^0+(?=\d)/, "");
    const q = `number:"${n}" set.name:"${l.englishSetName.replace(/"/g, "")}"`;
    const headers: Record<string, string> = {};
    if (config.providers.pokemontcgKey) headers["X-Api-Key"] = config.providers.pokemontcgKey;
    const res = await fetchJson<{ data?: PtcgCard[] }>(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=5`, {
      provider: "pokemontcgio", headers, revalidate: config.cache.prices,
    });
    const card = res?.data?.[0];
    if (!card) return [];
    const out: PriceQuote[] = [];
    const cm = card.cardmarket?.prices;
    if (cm) {
      const updatedAt = card.cardmarket?.updatedAt ? new Date(card.cardmarket.updatedAt.replace(/\//g, "-")).toISOString() : null;
      const q1 = makeQuote({
        source: "cardmarket", sourceLabel: "Cardmarket (via pokemontcg.io)", variant: "normal", currency: "EUR", fx, updatedAt, url: card.cardmarket?.url,
        values: { market: num(cm.trendPrice), trend: num(cm.trendPrice), avg: num(cm.averageSellPrice), low: num(cm.lowPrice), avg1: num(cm.avg1), avg7: num(cm.avg7), avg30: num(cm.avg30) },
      });
      if (q1) out.push(q1);
      const q2 = makeQuote({
        source: "cardmarket", sourceLabel: "Cardmarket (via pokemontcg.io)", variant: "reverse", currency: "EUR", fx, updatedAt, url: card.cardmarket?.url,
        values: { market: num(cm.reverseHoloTrend), trend: num(cm.reverseHoloTrend), avg: num(cm.reverseHoloSell), low: num(cm.reverseHoloLow), avg1: num(cm.reverseHoloAvg1), avg7: num(cm.reverseHoloAvg7), avg30: num(cm.reverseHoloAvg30) },
      });
      if (q2) out.push(q2);
    }
    for (const [variant, v] of Object.entries(card.tcgplayer?.prices ?? {})) {
      const q3 = makeQuote({
        source: "tcgplayer", sourceLabel: "TCGplayer (via pokemontcg.io)", variant: variant.toLowerCase().includes("reverse") ? "reverse" : variant.toLowerCase().includes("holo") ? "holo" : "normal",
        currency: "USD", fx, updatedAt: card.tcgplayer?.updatedAt ? new Date(card.tcgplayer.updatedAt.replace(/\//g, "-")).toISOString() : null, url: card.tcgplayer?.url,
        values: { market: num(v.market), low: num(v.low), avg: num(v.mid), high: num(v.high) },
      });
      if (q3) out.push(q3);
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Cardmarket API officielle (MKM API 2.0, OAuth 1.0a). Accès réservé aux comptes
// professionnels approuvés par Cardmarket. Requiert 4 jetons.
// ---------------------------------------------------------------------------
function oauthHeader(method: string, url: string): string {
  const c = config.providers.cardmarket;
  const params: Record<string, string> = {
    realm: url,
    oauth_consumer_key: c.appToken!,
    oauth_token: c.accessToken!,
    oauth_nonce: randomBytes(12).toString("hex"),
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_signature_method: "HMAC-SHA1",
    oauth_version: "1.0",
  };
  const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  const baseParams = Object.entries(params).filter(([k]) => k !== "realm").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(baseParams)}`;
  const signature = createHmac("sha1", `${enc(c.appSecret!)}&${enc(c.accessTokenSecret!)}`).update(base).digest("base64");
  params.oauth_signature = signature;
  return "OAuth " + Object.entries(params).map(([k, v]) => `${k}="${enc(v)}"`).join(", ");
}

const cardmarket: PriceProvider = {
  id: "cardmarket",
  label: "Cardmarket (API officielle)",
  games: ["pokemon", "onepiece"],
  kind: "api",
  requiresKey: true,
  envKeys: ["CARDMARKET_APP_TOKEN", "CARDMARKET_APP_SECRET", "CARDMARKET_ACCESS_TOKEN", "CARDMARKET_ACCESS_TOKEN_SECRET"],
  docsUrl: "https://api.cardmarket.com/ws/documentation",
  note: "Accès soumis à l'approbation de Cardmarket (compte professionnel). En attendant, les prix Cardmarket arrivent via TCGdex.",
  isConfigured: () => Object.values(config.providers.cardmarket).every(Boolean),
  async fetchQuotes(l, fx) {
    if (!this.isConfigured() || !l.externalIds.cardmarket) return [];
    const url = `https://api.cardmarket.com/ws/v2.0/output.json/products/${l.externalIds.cardmarket}`;
    const res = await fetchJson<{ product?: { website?: string; priceGuide?: Record<string, number> } }>(url, {
      provider: "cardmarket", headers: { Authorization: oauthHeader("GET", url) }, revalidate: config.cache.prices,
    });
    const g = res?.product?.priceGuide;
    if (!g) return [];
    const link = res?.product?.website ? `https://www.cardmarket.com${res.product.website}` : null;
    const quotes = [
      makeQuote({ source: "cardmarket", sourceLabel: "Cardmarket", variant: "normal", currency: "EUR", fx, updatedAt: new Date().toISOString(), url: link,
        values: { market: num(g.TREND), trend: num(g.TREND), avg: num(g.SELL ?? g.AVG), low: num(g.LOWEX ?? g.LOW), avg1: num(g.AVG1), avg7: num(g.AVG7), avg30: num(g.AVG30) } }),
      makeQuote({ source: "cardmarket", sourceLabel: "Cardmarket", variant: "holo", currency: "EUR", fx, updatedAt: new Date().toISOString(), url: link,
        values: { market: num(g.TRENDFOIL), trend: num(g.TRENDFOIL), low: num(g.LOWFOIL), avg1: num(g.AVG1FOIL), avg7: num(g.AVG7FOIL), avg30: num(g.AVG30FOIL) } }),
    ];
    return quotes.filter((q): q is PriceQuote => !!q);
  },
};

// ---------------------------------------------------------------------------
// TCGplayer API officielle (prix de marché USD). Les nouvelles clés sont réservées
// aux partenaires approuvés par TCGplayer.
// ---------------------------------------------------------------------------
let tcgToken: { value: string; exp: number } | null = null;
async function tcgplayerToken(): Promise<string> {
  if (tcgToken && tcgToken.exp > Date.now()) return tcgToken.value;
  const { publicKey, privateKey } = config.providers.tcgplayer;
  const res = await fetchJson<{ access_token: string; expires_in: number }>("https://api.tcgplayer.com/token", {
    provider: "tcgplayer", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(publicKey!)}&client_secret=${encodeURIComponent(privateKey!)}`, retries: 1,
  });
  if (!res?.access_token) throw new ProviderError("tcgplayer", "Jeton refusé");
  tcgToken = { value: res.access_token, exp: Date.now() + (res.expires_in - 300) * 1000 };
  return tcgToken.value;
}

const tcgplayer: PriceProvider = {
  id: "tcgplayer",
  label: "TCGplayer (API officielle)",
  games: ["pokemon", "onepiece"],
  kind: "api",
  requiresKey: true,
  envKeys: ["TCGPLAYER_PUBLIC_KEY", "TCGPLAYER_PRIVATE_KEY"],
  docsUrl: "https://docs.tcgplayer.com",
  note: "Clés partenaires uniquement. En attendant, les prix TCGplayer arrivent via TCGdex, OPTCG API et JustTCG.",
  isConfigured: () => !!(config.providers.tcgplayer.publicKey && config.providers.tcgplayer.privateKey),
  async fetchQuotes(l, fx) {
    if (!this.isConfigured() || !l.externalIds.tcgplayer) return [];
    const token = await tcgplayerToken();
    const res = await fetchJson<{ results?: { subTypeName: string; lowPrice?: number; midPrice?: number; highPrice?: number; marketPrice?: number }[] }>(
      `https://api.tcgplayer.com/pricing/product/${l.externalIds.tcgplayer}`,
      { provider: "tcgplayer", headers: { Authorization: `bearer ${token}` }, revalidate: config.cache.prices },
    );
    return (res?.results ?? []).flatMap((r) => {
      const q = makeQuote({ source: "tcgplayer", sourceLabel: "TCGplayer", variant: /foil|holo/i.test(r.subTypeName) ? "holo" : "normal", currency: "USD", fx,
        updatedAt: new Date().toISOString(), url: `https://www.tcgplayer.com/product/${l.externalIds.tcgplayer}`,
        values: { market: num(r.marketPrice), low: num(r.lowPrice), avg: num(r.midPrice), high: num(r.highPrice) } });
      return q ? [q] : [];
    });
  },
};

// ---------------------------------------------------------------------------
// eBay Marketplace Insights API — ventes réellement conclues (90 derniers jours).
// API à accès restreint : nécessite l'approbation d'eBay pour le scope
// https://api.ebay.com/oauth/api_scope/buy.marketplace.insights
// ---------------------------------------------------------------------------
let ebayToken: { value: string; exp: number } | null = null;
async function ebayAppToken(): Promise<string> {
  if (ebayToken && ebayToken.exp > Date.now()) return ebayToken.value;
  const { clientId, clientSecret } = config.providers.ebay;
  const res = await fetchJson<{ access_token: string; expires_in: number }>("https://api.ebay.com/identity/v1/oauth2/token", {
    provider: "ebay", method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
    body: `grant_type=client_credentials&scope=${encodeURIComponent("https://api.ebay.com/oauth/api_scope/buy.marketplace.insights")}`, retries: 1,
  });
  if (!res?.access_token) throw new ProviderError("ebay", "Jeton refusé");
  ebayToken = { value: res.access_token, exp: Date.now() + (res.expires_in - 300) * 1000 };
  return ebayToken.value;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const ebay: PriceProvider = {
  id: "ebay",
  label: "eBay (ventes conclues)",
  games: ["pokemon", "onepiece"],
  kind: "api",
  requiresKey: true,
  envKeys: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_MARKETPLACE_ID"],
  docsUrl: "https://developer.ebay.com/api-docs/buy/marketplace-insights/overview.html",
  note: "Marketplace Insights (accès restreint, sur demande auprès d'eBay). Calcule min / médiane / max / dernière vente.",
  isConfigured: () => !!(config.providers.ebay.clientId && config.providers.ebay.clientSecret),
  async fetchQuotes(l, fx) {
    if (!this.isConfigured()) return [];
    const token = await ebayAppToken();
    const query = `${l.englishName ?? l.card.name} ${l.card.number} ${l.card.setCode}`.trim();
    const res = await fetchJson<{ itemSales?: { title: string; lastSoldPrice?: { value: string; currency: string }; lastSoldDate?: string; itemWebUrl?: string }[] }>(
      `https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?q=${encodeURIComponent(query)}&category_ids=183454&limit=100`,
      { provider: "ebay", headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": config.providers.ebay.marketplace }, revalidate: config.cache.prices },
    );
    const sales = (res?.itemSales ?? []).filter((s) => s.lastSoldPrice && !/lot|bundle|proxy|custom|fake/i.test(s.title));
    if (!sales.length) return [];
    const currency = (sales[0].lastSoldPrice!.currency as PriceQuote["currency"]) ?? "EUR";
    const values = sales.filter((s) => s.lastSoldPrice!.currency === currency).map((s) => Number(s.lastSoldPrice!.value)).filter(Number.isFinite);
    const latest = [...sales].sort((a, b) => (b.lastSoldDate ?? "").localeCompare(a.lastSoldDate ?? ""))[0];
    const q = makeQuote({
      source: "ebay", sourceLabel: `eBay ventes conclues (${config.providers.ebay.marketplace})`, variant: "normal", currency, fx,
      updatedAt: latest.lastSoldDate ?? null, url: latest.itemWebUrl ?? null, salesCount: values.length,
      values: { market: median(values), low: Math.min(...values), high: Math.max(...values), avg: values.reduce((a, b) => a + b, 0) / values.length, lastSale: num(latest.lastSoldPrice!.value) },
    });
    return q ? [q] : [];
  },
};

// Sources intégrées aux catalogues (aucune clé requise)
const tcgdexPricing: PriceProvider = {
  id: "tcgdex",
  label: "TCGdex (Cardmarket + TCGplayer)",
  games: ["pokemon"],
  kind: "intégré",
  requiresKey: false,
  envKeys: [],
  docsUrl: "https://tcgdex.dev",
  note: "Prix Cardmarket (EUR) et TCGplayer (USD) intégrés à chaque carte Pokémon, actualisés quotidiennement par TCGdex.",
  isConfigured: () => true,
  async healthCheck() {
    await fetchJson(`${config.pokemon.tcgdexBase}/en/sets/base1`, { provider: "tcgdex", retries: 0 });
    return { ok: true, message: "OK" };
  },
};

const optcgPricing: PriceProvider = {
  id: "optcgapi",
  label: "OPTCG API (TCGplayer)",
  games: ["onepiece"],
  kind: "intégré",
  requiresKey: false,
  envKeys: [],
  docsUrl: "https://optcgapi.com/documentation",
  note: "Prix TCGplayer (USD, convertis en EUR au taux BCE) relevés quotidiennement + historique 2 semaines.",
  isConfigured: () => true,
  async healthCheck() {
    await fetchJson(`${config.onepiece.optcgBase}/allSets/`, { provider: "optcgapi", retries: 0 });
    return { ok: true, message: "OK" };
  },
};

export const PRICE_PROVIDERS: PriceProvider[] = [tcgdexPricing, optcgPricing, justtcg, pokemontcgio, cardmarket, tcgplayer, ebay];

export function externalProvidersFor(game: GameId): PriceProvider[] {
  return PRICE_PROVIDERS.filter((p) => p.fetchQuotes && p.games.includes(game) && p.isConfigured());
}

// Interroge toutes les sources configurées ; une source en échec n'empêche pas les autres.
export async function fetchExternalQuotes(lookup: PriceLookup, fx: FxRates | null): Promise<{ quotes: PriceQuote[]; errors: { provider: string; message: string }[] }> {
  const providers = externalProvidersFor(lookup.card.game);
  const results = await Promise.allSettled(providers.map((p) => p.fetchQuotes!(lookup, fx)));
  const quotes: PriceQuote[] = [];
  const errors: { provider: string; message: string }[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") quotes.push(...r.value);
    else errors.push({ provider: providers[i].id, message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });
  return { quotes, errors };
}
