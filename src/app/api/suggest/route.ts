import { NextResponse, type NextRequest } from "next/server";
import { repo } from "@/lib/data";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const jeu = req.nextUrl.searchParams.get("jeu");
  const game = jeu === "pokemon" || jeu === "onepiece" ? jeu : undefined;
  try {
    const items = await repo().suggest(q, game);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
