import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as tcgdex from "../src/lib/providers/tcgdex";
import * as optcg from "../src/lib/providers/optcg";
import { changesFromHistory, summarize, toListPrice } from "../src/lib/pricing";
import { toEur, type FxRates } from "../src/lib/fx";
import { matches, parseFilters, sortCards, filtersToQuery } from "../src/lib/data/filters";
import { parseRss } from "../src/lib/news";
import { pokemonTags, onePieceTags } from "../src/lib/rarity";
import { formatEur, PRICE_UNAVAILABLE } from "../src/lib/format";
import type { CardListItem } from "../src/lib/types";

const fx: FxRates = { base: "EUR", date: "2026-10-30", rates: { USD: 1.08, GBP: 0.84, JPY: 165 } };
const card = JSON.parse(readFileSync(new URL("./fixtures/tcgdex-card.json", import.meta.url), "utf8"));
const op = JSON.parse(readFileSync(new URL("./fixtures/optcg-cards.json", import.meta.url), "utf8"));
const set = { id: "sv03.5", name: "151", code: "MEW", releaseDate: "2023-06-16" };

test("formatEur affiche « Prix indisponible » sans donnée", () => {
  assert.equal(formatEur(null), PRICE_UNAVAILABLE);
  assert.match(formatEur(12.5), /12,50\s?€/);
});

test("conversion USD → EUR au taux BCE, jamais de taux inventé", () => {
  assert.equal(toEur(108, "USD", fx), 100);
  assert.equal(toEur(10, "EUR", null), 10);
  assert.equal(toEur(10, "USD", null), null);
});

test("TCGdex : mapping de la carte et des prix Cardmarket/TCGplayer", () => {
  const d = tcgdex.mapCard(card, set);
  assert.equal(d.id, "sv03.5-199");
  assert.equal(d.imageLarge, "https://assets.tcgdex.net/fr/sv/sv03.5/199/high.webp");
  assert.equal(d.character, "Dracaufeu");
  assert.ok(d.tags.includes("sar"));
  assert.equal(d.externalIds.cardmarket, "732567");
  assert.equal(d.externalIds.tcgplayer, "517045");
  const quotes = tcgdex.quotesFromCard(card, fx);
  // Les valeurs « normal » à 0 sont ignorées : aucune cotation fictive à 0 €.
  assert.equal(quotes.filter((q) => q.source === "cardmarket").length, 1);
  const s = summarize(quotes, { preferredVariant: tcgdex.preferredVariant(card) });
  assert.equal(s.marketEur, 121.4);
  assert.equal(s.primary?.source, "cardmarket");
  assert.equal(s.lowEur, 99);
  assert.equal(s.highEur, 231.48); // 250 USD / 1,08
  assert.equal(s.lastSaleEur, 125);
  assert.ok(s.changes.d7 && Math.abs(s.changes.d7.pct - 5.6) < 0.05);
  assert.match(s.changes.d7!.basis, /Cardmarket/);
});

test("Résumé sans cotation → indisponible", () => {
  const s = summarize([]);
  assert.equal(s.available, false);
  assert.equal(s.marketEur, null);
  assert.equal(toListPrice(s).eur, null);
});

test("OPTCG : versions parallèles, raretés et prix USD convertis", () => {
  const meta = { id: "op-01", name: "Romance Dawn", code: "OP-01", releaseDate: "2022-12-02" };
  const alt = optcg.mapCard(op[1], meta);
  assert.equal(alt.id, "OP01-025_p1");
  assert.equal(alt.isAlternate, true);
  assert.equal(alt.character, "Roronoa Zoro");
  assert.ok(alt.tags.includes("alt-art"));
  const q = optcg.quotesFromCard(op[1], fx);
  assert.equal(q[0].eur.market, 153.15);
  assert.equal(optcg.quotesFromCard(op[2], fx).length, 0); // pas de prix → pas de cotation
  const leader = optcg.mapCard(op[2], meta);
  assert.ok(leader.tags.includes("leader"));
  assert.deepEqual(leader.colors, ["Red", "Green"]);
  const s = optcg.mapSet({ id: "OP-01", name: "Romance Dawn", kind: "booster" }, op);
  assert.equal(s.totalCards, 2);
  assert.equal(s.releaseDate, "2022-12-02");
  assert.ok(s.editions.includes("Parallèle (Alt Art)"));
});

test("Variations exactes depuis l'historique", () => {
  const today = new Date("2026-10-30T00:00:00Z").getTime();
  const pts = [0, 1, 7, 30].map((d) => ({ date: new Date(today - d * 86400000).toISOString(), eur: 100 - d, source: "cardmarket" }));
  const ch = changesFromHistory(pts, 100);
  assert.equal(ch.h24?.pct, 1);
  assert.equal(ch.d7?.pct, 7.5);
  assert.equal(ch.d30?.pct, 42.9);
  assert.equal(ch.y1, undefined);
});

test("Filtres combinables + tri + URL", () => {
  const meta = { id: "op-01", name: "Romance Dawn", code: "OP-01", releaseDate: "2022-12-02" };
  const items: CardListItem[] = op.map((c: never) => {
    const { stats: _s, text: _t, illustrator: _i, attacks: _a, finishes: _f, externalIds: _e, ...b } = optcg.mapCard(c, meta);
    return { ...b, price: toListPrice(summarize(optcg.quotesFromCard(c, fx))) };
  });
  assert.equal(items.filter((c) => matches(c, { q: "zoro", version: "alternate" })).length, 1);
  assert.equal(items.filter((c) => matches(c, { minPrice: 1, maxPrice: 10 })).length, 1);
  assert.equal(items.filter((c) => matches(c, { tags: ["leader"] })).length, 1);
  assert.equal(items.filter((c) => matches(c, { rarity: "sr", category: "Character" })).length, 2);
  const sorted = sortCards(items, "price-desc");
  assert.equal(sorted[0].id, "OP01-025_p1");
  assert.equal(sorted.at(-1)!.price.eur, null); // sans prix en dernier
  const f = parseFilters({ jeu: "onepiece", special: "sec,manga", prixMin: "2,5", tri: "price-asc", page: "2" });
  assert.deepEqual(f.tags, ["sec", "manga"]);
  assert.equal(f.minPrice, 2.5);
  assert.equal(f.page, 2);
  assert.match(filtersToQuery(f), /jeu=onepiece/);
});

test("Classification des raretés", () => {
  assert.ok(pokemonTags("Hyper rare").includes("secret"));
  assert.ok(pokemonTags("Special Illustration Rare").includes("sar"));
  assert.ok(pokemonTags("Illustration rare").includes("ir"));
  assert.ok(onePieceTags("SEC", "Character", "OP05-119", "Monkey.D.Luffy").includes("sec"));
  assert.ok(onePieceTags("SR", "Character", "OP06-118_p2", "Roronoa Zoro (Manga)").includes("manga"));
});

test("Parsing RSS", () => {
  const xml = `<rss><channel><item><title><![CDATA[Nouvelle extension &amp; promo]]></title><link>https://ex.com/a</link><pubDate>Thu, 30 Oct 2026 10:00:00 GMT</pubDate><enclosure url="https://ex.com/i.jpg"/></item></channel></rss>`;
  const items = parseRss(xml, "Ex", "pokemon");
  assert.equal(items[0].title, "Nouvelle extension & promo");
  assert.equal(items[0].image, "https://ex.com/i.jpg");
  assert.equal(items[0].publishedAt, "2026-10-30T10:00:00.000Z");
});
