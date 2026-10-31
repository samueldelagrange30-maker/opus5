// Client HTTP commun à tous les connecteurs : délai d'expiration, nouvelles tentatives
// avec backoff exponentiel, respect des limites de débit (429 / Retry-After),
// limitation de concurrence par fournisseur et journal des erreurs.

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status: number | null = null,
    public url: string | null = null,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

export interface ProviderLimits {
  concurrency: number; // requêtes simultanées max
  minIntervalMs: number; // intervalle minimal entre deux requêtes
}

const DEFAULT_LIMITS: ProviderLimits = { concurrency: 6, minIntervalMs: 0 };
const LIMITS: Record<string, ProviderLimits> = {
  tcgdex: { concurrency: 12, minIntervalMs: 0 },
  optcgapi: { concurrency: 4, minIntervalMs: 100 },
  justtcg: { concurrency: 2, minIntervalMs: 650 }, // offre gratuite : ~100 req/min
  pokemontcgio: { concurrency: 4, minIntervalMs: 100 },
  cardmarket: { concurrency: 1, minIntervalMs: 1200 },
  tcgplayer: { concurrency: 2, minIntervalMs: 300 },
  ebay: { concurrency: 2, minIntervalMs: 500 },
  frankfurter: { concurrency: 2, minIntervalMs: 0 },
  rss: { concurrency: 3, minIntervalMs: 0 },
};

class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  private last = 0;
  constructor(private limits: ProviderLimits) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      if (this.active < this.limits.concurrency) {
        this.active++;
        resolve();
      } else this.queue.push(() => { this.active++; resolve(); });
    });
    try {
      const wait = this.last + this.limits.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const limiters = new Map<string, Limiter>();
function limiterFor(provider: string): Limiter {
  let l = limiters.get(provider);
  if (!l) {
    l = new Limiter(LIMITS[provider] ?? DEFAULT_LIMITS);
    limiters.set(provider, l);
  }
  return l;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Journal en mémoire des dernières erreurs (consultable dans l'espace admin).
export interface ErrorLogEntry {
  provider: string;
  message: string;
  status: number | null;
  url: string | null;
  at: string;
}
const errorLog: ErrorLogEntry[] = [];
const statusLog = new Map<string, { lastOk: string | null; lastError: string | null; lastMessage: string | null; latencyMs: number | null }>();

export function recentProviderErrors(): ErrorLogEntry[] {
  return [...errorLog].reverse();
}
export function providerRuntimeStatus() {
  return Object.fromEntries(statusLog);
}

function record(provider: string, ok: boolean, info: { message?: string; status?: number | null; url?: string; latency?: number }) {
  const s = statusLog.get(provider) ?? { lastOk: null, lastError: null, lastMessage: null, latencyMs: null };
  const now = new Date().toISOString();
  if (ok) {
    s.lastOk = now;
    s.latencyMs = info.latency ?? null;
  } else {
    s.lastError = now;
    s.lastMessage = info.message ?? null;
    errorLog.push({ provider, message: info.message ?? "Erreur", status: info.status ?? null, url: info.url ?? null, at: now });
    if (errorLog.length > 200) errorLog.shift();
  }
  statusLog.set(provider, s);
}

export interface FetchOptions {
  provider: string;
  revalidate?: number | false; // cache de données Next.js (ignoré hors Next)
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  allow404?: boolean;
  tags?: string[];
}

export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T | null> {
  const text = await fetchText(url, opts);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    const err = new ProviderError(opts.provider, "Réponse JSON invalide", null, url);
    record(opts.provider, false, { message: err.message, url });
    throw err;
  }
}

export async function fetchText(url: string, opts: FetchOptions): Promise<string | null> {
  const retries = opts.retries ?? 3;
  const limiter = limiterFor(opts.provider);
  let lastErr: ProviderError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      const res = await limiter.run(() =>
        fetch(url, {
          method: opts.method ?? "GET",
          headers: { Accept: "application/json", "User-Agent": "TCGVault/1.0 (+price tracker)", ...opts.headers },
          body: opts.body,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
          ...(opts.revalidate !== undefined
            ? { next: { revalidate: opts.revalidate, tags: opts.tags } }
            : { cache: "no-store" as RequestCache }),
        } as RequestInit),
      );

      if (res.status === 404 && opts.allow404) {
        record(opts.provider, true, { latency: Date.now() - started });
        return null;
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        lastErr = new ProviderError(opts.provider, `HTTP ${res.status}`, res.status, url);
        if (attempt < retries) {
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
          continue;
        }
        break;
      }
      if (!res.ok) {
        lastErr = new ProviderError(opts.provider, `HTTP ${res.status}`, res.status, url);
        break; // erreurs 4xx : inutile de réessayer
      }
      const text = await res.text();
      record(opts.provider, true, { latency: Date.now() - started });
      return text;
    } catch (e) {
      lastErr = new ProviderError(opts.provider, e instanceof Error ? e.message : String(e), null, url);
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    }
  }
  record(opts.provider, false, { message: lastErr?.message, status: lastErr?.status, url });
  throw lastErr ?? new ProviderError(opts.provider, "Erreur inconnue", null, url);
}

// Exécute des tâches avec une concurrence bornée (en conservant l'ordre des résultats).
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
