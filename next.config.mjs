/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Images HD servies par les fournisseurs de données (optimisées par next/image).
    remotePatterns: [
      { protocol: "https", hostname: "assets.tcgdex.net" },
      { protocol: "https", hostname: "images.pokemontcg.io" },
      { protocol: "https", hostname: "optcgapi.com" },
      { protocol: "https", hostname: "www.optcgapi.com" },
      { protocol: "https", hostname: "en.onepiece-cardgame.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  poweredByHeader: false,
};
export default nextConfig;
