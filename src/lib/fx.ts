// Taux de change officiels de la Banque centrale européenne (via l'API Frankfurter, sans clé).
// Les prix en USD (TCGplayer, eBay US…) sont convertis en EUR avec le taux BCE du jour.
// Si le taux est indisponible, le prix converti reste vide : aucun taux n'est inventé.
import { fetchJson } from "./http";
import { config } from "./config";

export interface FxRates {
  base: "EUR";
  date: string;
  // nombre d'unités de devise pour 1 EUR
  rates: Record<string, number>;
}

let memo: { at: number; value: FxRates | null } | null = null;

export async function getFxRates(): Promise<FxRates | null> {
  if (memo && Date.now() - memo.at < config.cache.fx * 1000) return memo.value;
  const urls = [
    ...(process.env.FX_BASE_URL ? [`${process.env.FX_BASE_URL}/latest?base=EUR&symbols=USD,GBP,JPY`] : []),
    "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP,JPY",
    "https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,JPY",
  ];
  for (const url of urls) {
    try {
      const data = await fetchJson<{ date: string; rates: Record<string, number> }>(url, {
        provider: "frankfurter",
        revalidate: config.cache.fx,
        retries: 1,
      });
      if (data?.rates?.USD) {
        const value: FxRates = { base: "EUR", date: data.date, rates: data.rates };
        memo = { at: Date.now(), value };
        return value;
      }
    } catch {
      /* source suivante */
    }
  }
  memo = { at: Date.now(), value: null };
  return null;
}

// Convertit un montant vers l'euro. Renvoie null si le taux n'est pas connu.
export function toEur(amount: number | null | undefined, currency: string, fx: FxRates | null): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  if (currency === "EUR") return amount;
  const rate = fx?.rates[currency];
  if (!rate) return null;
  return Math.round((amount / rate) * 100) / 100;
}

// Taux « 1 unité de devise = x EUR »
export function eurPerUnit(currency: string, fx: FxRates | null): number | null {
  if (currency === "EUR") return 1;
  const rate = fx?.rates[currency];
  return rate ? 1 / rate : null;
}
