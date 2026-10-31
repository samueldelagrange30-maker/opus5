// Actualités TCG agrégées depuis des flux RSS publics (configurables via NEWS_FEEDS).
import { config } from "./config";
import { fetchText } from "./http";
import type { NewsItem } from "./types";

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1];

export function parseRss(xml: string, source: string, game: NewsItem["game"]): NewsItem[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  return items.map((it) => {
    const link = tag(it, "link") ?? it.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const date = tag(it, "pubDate") ?? tag(it, "published") ?? tag(it, "updated") ?? null;
    const img = it.match(/<media:content[^>]*url="([^"]+)"/i)?.[1] ?? it.match(/<enclosure[^>]*url="([^"]+)"/i)?.[1] ?? decode(tag(it, "content:encoded") ?? tag(it, "description") ?? "").match(/<img[^>]*src="([^"]+)"/i)?.[1] ?? null;
    return {
      title: decode(tag(it, "title") ?? "").replace(/<[^>]+>/g, ""),
      link: decode(link),
      source,
      publishedAt: date ? new Date(decode(date)).toISOString() : null,
      game,
      image: img,
    };
  }).filter((n) => n.title && n.link.startsWith("http"));
}

export async function getNews(limit = 12): Promise<{ items: NewsItem[]; errors: string[] }> {
  const errors: string[] = [];
  const all = await Promise.all(config.newsFeeds.map(async (f) => {
    try {
      const xml = await fetchText(f.url, { provider: "rss", revalidate: config.cache.news, retries: 1, headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
      return xml ? parseRss(xml, f.source, f.game) : [];
    } catch {
      errors.push(f.source);
      return [];
    }
  }));
  const items = all.flat().sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).slice(0, limit);
  return { items, errors };
}
