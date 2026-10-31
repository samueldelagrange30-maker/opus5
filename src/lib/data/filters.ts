// Filtres combinables appliqués en mémoire (mode direct). Le mode Supabase applique
// les mêmes règles en SQL (voir supabase-repo.ts).
import type { CardFilters, CardListItem, CardTag, GameId, SortKey } from "../types";

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function matches(c: CardListItem, f: CardFilters): boolean {
  if (f.game && c.game !== f.game) return false;
  if (f.setId && c.setId !== f.setId) return false;
  if (f.q) {
    const q = norm(f.q);
    const hay = norm(`${c.name} ${c.character ?? ""} ${c.number} ${c.setName} ${c.setCode}`);
    if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
  }
  if (f.number && !norm(c.number).includes(norm(f.number))) return false;
  if (f.rarity && norm(c.rarity) !== norm(f.rarity)) return false;
  if (f.category && norm(c.category) !== norm(f.category)) return false;
  if (f.character && !norm(c.character ?? c.name).includes(norm(f.character))) return false;
  if (f.language && c.language !== f.language) return false;
  if (f.version === "alternate" && !c.isAlternate) return false;
  if (f.version === "normal" && c.isAlternate) return false;
  if (f.tags?.length && !f.tags.every((t) => c.tags.includes(t))) return false;
  if (f.minPrice !== undefined && (c.price.eur === null || c.price.eur < f.minPrice)) return false;
  if (f.maxPrice !== undefined && (c.price.eur === null || c.price.eur > f.maxPrice)) return false;
  if (f.trend === "up" && !((c.price.change?.pct ?? 0) > 0)) return false;
  if (f.trend === "down" && !((c.price.change?.pct ?? 0) < 0)) return false;
  return true;
}

const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
};

export function sortCards(items: CardListItem[], sort: SortKey = "number"): CardListItem[] {
  const arr = [...items];
  const cmpNumber = (a: CardListItem, b: CardListItem) => a.setId.localeCompare(b.setId) || a.numberSort - b.numberSort || a.id.localeCompare(b.id);
  switch (sort) {
    case "name": return arr.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    case "price-desc": return arr.sort((a, b) => nullsLast(a.price.eur, b.price.eur, -1));
    case "price-asc": return arr.sort((a, b) => nullsLast(a.price.eur, b.price.eur, 1));
    case "change-desc": return arr.sort((a, b) => nullsLast(a.price.change?.pct ?? null, b.price.change?.pct ?? null, -1));
    case "change-asc": return arr.sort((a, b) => nullsLast(a.price.change?.pct ?? null, b.price.change?.pct ?? null, 1));
    case "release-desc": return arr.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "") || cmpNumber(a, b));
    case "release-asc": return arr.sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999") || cmpNumber(a, b));
    default: return arr.sort(cmpNumber);
  }
}

const SORTS: SortKey[] = ["number", "name", "price-desc", "price-asc", "change-desc", "change-asc", "release-desc", "release-asc"];

// Lecture des filtres depuis l'URL (les pages de recherche sont partageables par lien).
export function parseFilters(sp: Record<string, string | string[] | undefined>): CardFilters {
  const g = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v && v !== "" ? v : undefined;
  };
  const n = (k: string) => {
    const v = g(k);
    if (v === undefined) return undefined;
    const x = Number(v.replace(",", "."));
    return Number.isFinite(x) ? x : undefined;
  };
  const game = g("jeu");
  const tags = g("special")?.split(",").filter(Boolean) as CardTag[] | undefined;
  const sort = g("tri") as SortKey | undefined;
  return {
    game: game === "pokemon" || game === "onepiece" ? (game as GameId) : undefined,
    q: g("q"),
    setId: g("extension"),
    number: g("numero"),
    rarity: g("rarete"),
    minPrice: n("prixMin"),
    maxPrice: n("prixMax"),
    language: g("langue"),
    category: g("type"),
    character: g("personnage"),
    version: g("version") === "alternate" ? "alternate" : g("version") === "normal" ? "normal" : undefined,
    tags: tags?.length ? tags : undefined,
    trend: g("tendance") === "up" ? "up" : g("tendance") === "down" ? "down" : undefined,
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    page: Math.max(1, Math.floor(n("page") ?? 1)),
    pageSize: 48,
  };
}

export function filtersToQuery(f: CardFilters): string {
  const p = new URLSearchParams();
  const set = (k: string, v: string | number | undefined) => { if (v !== undefined && v !== "") p.set(k, String(v)); };
  set("jeu", f.game); set("q", f.q); set("extension", f.setId); set("numero", f.number); set("rarete", f.rarity);
  set("prixMin", f.minPrice); set("prixMax", f.maxPrice); set("langue", f.language); set("type", f.category);
  set("personnage", f.character); set("version", f.version); set("special", f.tags?.join(","));
  set("tendance", f.trend); set("tri", f.sort); if (f.page && f.page > 1) set("page", f.page);
  return p.toString();
}

export function facetsOf(items: CardListItem[]) {
  const rarities = [...new Set(items.map((c) => c.rarity).filter((x): x is string => !!x))].sort();
  const categories = [...new Set(items.map((c) => c.category).filter((x): x is string => !!x))].sort();
  return { rarities, categories };
}
