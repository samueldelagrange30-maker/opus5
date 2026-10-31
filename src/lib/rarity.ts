// Classification des cartes spéciales à partir des raretés officielles (FR / EN / JP).
import type { CardTag, GameId } from "./types";

export const TAG_LABELS: Record<CardTag, string> = {
  holo: "Brillante (Holo)",
  reverse: "Reverse",
  "full-art": "Full Art",
  secret: "Secrète",
  "alt-art": "Version alternative",
  sar: "SAR (Illustration spéciale rare)",
  ir: "IR / AR (Illustration rare)",
  ultra: "Ultra rare",
  sec: "SEC (Secret Rare)",
  manga: "Manga Rare",
  sp: "SP (Special)",
  leader: "Leader",
  promo: "Promo",
  "first-edition": "1ère édition",
};

export const TAGS_BY_GAME: Record<GameId, CardTag[]> = {
  pokemon: ["holo", "reverse", "full-art", "ultra", "ir", "sar", "secret", "promo", "first-edition"],
  onepiece: ["alt-art", "sec", "manga", "sp", "leader", "promo"],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function pokemonTags(rarity: string | null, variants?: Record<string, boolean | undefined>): CardTag[] {
  const tags = new Set<CardTag>();
  const r = rarity ? norm(rarity) : "";
  if (r.includes("holo") || r.includes("brillant")) tags.add("holo");
  if (r.includes("illustration speciale") || r.includes("special illustration") || r === "sar") tags.add("sar");
  else if (r.includes("illustration rare") || r === "ar" || r === "ir") tags.add("ir");
  if (r.includes("hyper") || r.includes("secret") || r.includes("secrete") || r.includes("gold") || r === "ur") tags.add("secret");
  if (r.includes("ultra") || r.includes("double rare") || r.includes("rare v") || r.includes("rare ex")) tags.add("ultra");
  if (r.includes("full art") || r.includes("ultra") || tags.has("sar") || tags.has("secret")) tags.add("full-art");
  if (r.includes("promo")) tags.add("promo");
  if (variants?.holo && !variants?.normal) tags.add("holo");
  if (variants?.reverse) tags.add("reverse");
  if (variants?.firstEdition) tags.add("first-edition");
  return [...tags];
}

export function onePieceTags(rarity: string | null, cardType: string | null, imageId: string, name: string): CardTag[] {
  const tags = new Set<CardTag>();
  const r = rarity ? norm(rarity) : "";
  const n = norm(name);
  if (r === "sec" || r.includes("secret")) tags.add("sec");
  if (r === "l" || norm(cardType ?? "") === "leader") tags.add("leader");
  if (r === "p" || r.includes("promo")) tags.add("promo");
  if (r === "sp" || n.includes("(sp)") || n.includes("special")) tags.add("sp");
  if (n.includes("manga")) tags.add("manga");
  if (/_p\d+|_r\d+/i.test(imageId) || n.includes("parallel") || n.includes("alternate art")) tags.add("alt-art");
  return [...tags];
}

// Ordre indicatif des raretés pour l'affichage des filtres.
export const ONE_PIECE_RARITIES = ["C", "UC", "R", "SR", "SEC", "L", "SP", "P", "TR"];
