// Synchronisation manuelle depuis un poste ou un serveur (sans limite de durée serverless).
// Usage : npm run sync:pokemon | sync:onepiece | sync:alerts   (variables lues depuis .env.local)
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { runPriceAlerts, snapshotCollections, syncCatalogAndPrices } from "../src/lib/sync";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const job = process.argv[2] ?? "pokemon";
const full = process.argv.includes("--complet");

(async () => {
  if (job === "alerts") return console.log(await runPriceAlerts(sb, "cli"));
  if (job === "collections") return console.log(await snapshotCollections(sb, "cli"));
  const game = job === "onepiece" ? "onepiece" : "pokemon";
  // --complet : enchaîne les passes jusqu'à avoir parcouru tout le catalogue
  for (let pass = 1; ; pass++) {
    const r = await syncCatalogAndPrices(sb, { game, budgetMs: full ? 10 * 60_000 : 120_000, triggeredBy: "cli" });
    console.log(`Passe ${pass} : ${r.message} (${r.failed} échec(s))`);
    if (!full || r.done) break;
  }
})();
