import { hasSupabase } from "../config";
import { supabasePublic } from "../supabase/server";
import { liveRepo } from "./live-repo";
import { createSupabaseRepo } from "./supabase-repo";
import type { Repository } from "./repository";

let cached: Repository | null = null;

// Supabase si configuré (catalogue synchronisé), sinon lecture directe des API publiques.
// En mode Supabase, une extension ou une carte pas encore synchronisée est lue en direct.
export function repo(): Repository {
  if (cached) return cached;
  const sb = hasSupabase() && process.env.DATA_MODE !== "live" ? supabasePublic() : null;
  if (!sb) return (cached = liveRepo);
  const db = createSupabaseRepo(sb);
  const safe = async <T,>(p: Promise<T>, fallback: () => Promise<T>, empty: (v: T) => boolean): Promise<T> => {
    try {
      const v = await p;
      return empty(v) ? fallback() : v;
    } catch (e) {
      console.error("[supabase] repli en mode direct :", (e as Error).message);
      return fallback();
    }
  };
  cached = {
    ...db,
    listSets: (g) => safe(db.listSets(g), () => liveRepo.listSets(g), (v) => v.length === 0),
    getSet: (g, id) => safe(db.getSet(g, id), () => liveRepo.getSet(g, id), (v) => v === null),
    getSetCards: (g, id) => safe(db.getSetCards(g, id), () => liveRepo.getSetCards(g, id), (v) => v.length === 0),
    getCard: (g, id) => safe(db.getCard(g, id), () => liveRepo.getCard(g, id), (v) => v === null),
    search: (f) => safe(db.search(f), () => liveRepo.search(f), (v) => v.total === 0 && !f.q && !f.setId),
    ranking: (t, o) => safe(db.ranking(t, o), () => liveRepo.ranking(t, o), (v) => !v.available && !["most-searched", "popular", "best-sellers"].includes(t)),
  };
  return cached;
}

export { RANKINGS } from "./repository";
export type { Repository, CardPage, Suggestion } from "./repository";
