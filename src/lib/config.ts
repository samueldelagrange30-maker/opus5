// Configuration centralisée : toutes les clés sont optionnelles.
// Sans Supabase, la plateforme fonctionne en « mode direct » (lecture des API publiques avec cache).

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export const config = {
  siteUrl: env("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000",
  siteName: "TCG Vault",

  supabase: {
    url: env("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  },

  cronSecret: env("CRON_SECRET"),

  pokemon: {
    // Langue du catalogue Pokémon (TCGdex). Repli automatique sur l'anglais.
    lang: env("POKEMON_CATALOG_LANG") ?? "fr",
    tcgdexBase: env("TCGDEX_BASE_URL") ?? "https://api.tcgdex.net/v2",
  },

  onepiece: {
    optcgBase: env("OPTCG_BASE_URL") ?? "https://optcgapi.com/api",
  },

  providers: {
    justtcgKey: env("JUSTTCG_API_KEY"),
    pokemontcgKey: env("POKEMONTCG_API_KEY"),
    pokemontcgEnabled: env("POKEMONTCG_ENABLED") === "true" || !!env("POKEMONTCG_API_KEY"),
    cardmarket: {
      appToken: env("CARDMARKET_APP_TOKEN"),
      appSecret: env("CARDMARKET_APP_SECRET"),
      accessToken: env("CARDMARKET_ACCESS_TOKEN"),
      accessTokenSecret: env("CARDMARKET_ACCESS_TOKEN_SECRET"),
    },
    tcgplayer: {
      publicKey: env("TCGPLAYER_PUBLIC_KEY"),
      privateKey: env("TCGPLAYER_PRIVATE_KEY"),
    },
    ebay: {
      clientId: env("EBAY_CLIENT_ID"),
      clientSecret: env("EBAY_CLIENT_SECRET"),
      marketplace: env("EBAY_MARKETPLACE_ID") ?? "EBAY_FR",
    },
  },

  // Durées de cache (secondes)
  cache: {
    catalog: 60 * 60 * 12,
    prices: 60 * 60 * 2,
    fx: 60 * 60 * 6,
    news: 60 * 30,
  },

  newsFeeds: (env("NEWS_FEEDS") ??
    "https://www.pokebeach.com/feed|PokéBeach|pokemon,https://www.pokeguardian.com/feed|PokéGuardian|pokemon")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, source, game] = entry.split("|");
      return { url, source: source ?? new URL(url).hostname, game: (game as "pokemon" | "onepiece" | undefined) ?? null };
    }),
};

export const hasSupabase = (): boolean => !!(config.supabase.url && config.supabase.anonKey);
export const hasSupabaseAdmin = (): boolean => hasSupabase() && !!config.supabase.serviceRoleKey;
