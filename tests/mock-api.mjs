// Serveur local reproduisant les formats de réponse TCGdex / OPTCG API / Frankfurter.
// Usage : node tests/mock-api.mjs  puis  TCGDEX_BASE_URL=http://localhost:4010/tcgdex OPTCG_BASE_URL=http://localhost:4010/optcg FX_BASE_URL=http://localhost:4010/fx npm run dev
// Sert uniquement à tester l'interface hors ligne : ces données ne sont jamais utilisées en production.
import http from "node:http";
import { readFileSync } from "node:fs";

const H = "http://localhost:4010";
const card199 = JSON.parse(readFileSync(new URL("./fixtures/tcgdex-card.json", import.meta.url), "utf8"));
card199.image = `${H}/img/dracaufeu`;
const card025 = { ...card199, id: "sv03.5-025", localId: "025", name: "Pikachu", rarity: "Commune", image: `${H}/img/pikachu`, hp: 60, types: ["Électrique"], variants: { normal: true, reverse: true }, attacks: [], pricing: { cardmarket: { updated: "2026-10-30T00:42:15.000Z", unit: "EUR", avg: 0.35, low: 0.05, trend: 0.31, avg1: 0.4, avg7: 0.33, avg30: 0.36 } } };
const op = JSON.parse(readFileSync(new URL("./fixtures/optcg-cards.json", import.meta.url), "utf8")).map((c) => ({ ...c, card_image: `${H}/img/${c.card_image_id}` }));
const set = { id: "sv03.5", name: "151", logo: undefined, symbol: undefined, releaseDate: "2023-06-16", serie: { id: "sv", name: "Écarlate et Violet" }, abbreviation: { official: "MEW" }, cardCount: { total: 207, official: 165, normal: 150, reverse: 150, holo: 40 }, cards: [card025, card199].map(({ id, localId, name, image }) => ({ id, localId, name, image })) };

const routes = {
  "/fx/latest": { date: "2026-10-30", rates: { USD: 1.08, GBP: 0.84, JPY: 165 } },
  "/optcg/allSets/": [{ set_name: "Romance Dawn", set_id: "OP-01" }],
  "/optcg/allDecks/": [],
  "/optcg/sets/OP-01/": op,
  "/optcg/allSetCards/": op,
  "/optcg/allSTCards/": [],
  "/optcg/allPromoCards/": [],
  "/optcg/sets/card/OP01-025/": op.slice(0, 2),
  "/optcg/sets/card/OP01-003/": op.slice(2),
  "/optcg/sets/card/twoweeks/OP01-025/": Array.from({ length: 14 }, (_, i) => ({ ...op[1], market_price: 140 + i * 2 + (i % 3), date_scraped: new Date(Date.UTC(2026, 9, 17 + i)).toISOString() })),
};

http.createServer((req, res) => {
  const url = new URL(req.url, H);
  const p = url.pathname;
  if (p.startsWith("/img/")) {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    const label = decodeURIComponent(p.slice(5));
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 630 880"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d7dca"/><stop offset="1" stop-color="#e63946"/></linearGradient></defs><rect width="630" height="880" rx="30" fill="url(#g)"/><rect x="30" y="30" width="570" height="820" rx="20" fill="#11141c" opacity=".55"/><text x="315" y="460" font-family="sans-serif" font-size="48" fill="#fff" text-anchor="middle">${label}</text><text x="315" y="520" font-family="sans-serif" font-size="22" fill="#ccc" text-anchor="middle">image de test</text></svg>`);
  }
  let body = routes[p];
  const m = p.match(/^\/tcgdex\/(\w+)\/(sets|cards)(?:\/(.+))?$/);
  if (m) {
    if (m[2] === "sets" && !m[3]) body = [{ id: set.id, name: set.name, cardCount: set.cardCount }];
    else if (m[2] === "sets" && m[3] === "sv03.5") body = set;
    else if (m[2] === "cards" && !m[3]) {
      const q = (url.searchParams.get("name") ?? "").toLowerCase();
      body = [card025, card199].filter((c) => c.name.toLowerCase().includes(q)).map(({ id, localId, name, image }) => ({ id, localId, name, image }));
    } else if (m[2] === "cards") body = [card025, card199].find((c) => c.id === decodeURIComponent(m[3]));
  }
  if (!body) { res.writeHead(404); return res.end("{}"); }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}).listen(4010, () => console.log("mock API sur", H));
