import { NextResponse, type NextRequest } from "next/server";
import { supabasePublic } from "@/lib/supabase/server";

// Journalise recherches et consultations (classements « plus recherchées »). Anonyme.
export async function POST(req: NextRequest) {
  const sb = supabasePublic();
  if (!sb) return new NextResponse(null, { status: 204 });
  try {
    const body = JSON.parse(await req.text()) as { game?: string; cardId?: string; q?: string; kind?: string };
    const game = body.game === "pokemon" || body.game === "onepiece" ? body.game : null;
    await sb.from("search_events").insert({
      kind: body.kind === "view" ? "view" : "search", game, card_id: body.cardId?.slice(0, 64) ?? null, query: body.q?.slice(0, 120) ?? null,
    });
  } catch { /* ignoré */ }
  return new NextResponse(null, { status: 204 });
}
