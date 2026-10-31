import { NextResponse } from "next/server";
import { hasSupabase, hasSupabaseAdmin } from "@/lib/config";
import { PRICE_PROVIDERS } from "@/lib/providers/price-providers";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    mode: hasSupabase() && process.env.DATA_MODE !== "live" ? "supabase" : "live",
    supabase: hasSupabase(), sync: hasSupabaseAdmin(),
    providers: PRICE_PROVIDERS.map((p) => ({ id: p.id, configured: p.isConfigured(), requiresKey: p.requiresKey })),
  });
}
