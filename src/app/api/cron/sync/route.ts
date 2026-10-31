import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runPriceAlerts, snapshotCollections, syncCatalogAndPrices } from "@/lib/sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Appelé par Vercel Cron (voir vercel.json) avec « Authorization: Bearer $CRON_SECRET ».
// ?job=pokemon | onepiece | alerts | collections
export async function GET(req: NextRequest) {
  if (!config.cronSecret || req.headers.get("authorization") !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 503 });
  const job = req.nextUrl.searchParams.get("job") ?? "pokemon";
  try {
    const report =
      job === "alerts" ? await runPriceAlerts(sb)
      : job === "collections" ? await snapshotCollections(sb)
      : await syncCatalogAndPrices(sb, { game: job === "onepiece" ? "onepiece" : "pokemon", budgetMs: 50_000 });
    if (job === "pokemon" || job === "onepiece") await runPriceAlerts(sb);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
