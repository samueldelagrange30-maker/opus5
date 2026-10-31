import type { MetadataRoute } from "next";
import { repo } from "@/lib/data";
import { config } from "@/lib/config";
import { GAMES } from "@/lib/types";
import { RANKINGS } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = config.siteUrl.replace(/\/$/, "");
  const statics = ["", "/pokemon", "/one-piece", "/extensions", "/recherche", "/classements", "/actualites", "/sources", ...Object.keys(RANKINGS).map((t) => `/classements/${t}`)];
  const sets = await repo().listSets().catch(() => []);
  return [
    ...statics.map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.8 })),
    ...sets.map((s) => ({ url: `${base}/${GAMES[s.game].slug}/extensions/${encodeURIComponent(s.id)}`, changeFrequency: "daily" as const, priority: 0.7 })),
  ];
}
