// Métadonnées officielles des extensions One Piece Card Game (édition anglaise, Bandai).
// L'API OPTCG ne fournit pas les dates de sortie : elles proviennent des annonces produits
// officielles (en.onepiece-cardgame.com/products). Toute extension absente de cette table
// affiche « Date non renseignée ». Les administrateurs peuvent compléter/corriger ces
// données dans Supabase (table `sets`, colonne `manual_override`).
export const ONE_PIECE_SET_META: Record<string, { name?: string; releaseDate?: string; block?: string }> = {
  "OP-01": { name: "Romance Dawn", releaseDate: "2022-12-02", block: "Bloc 1" },
  "OP-02": { name: "Paramount War", releaseDate: "2023-03-10", block: "Bloc 1" },
  "OP-03": { name: "Pillars of Strength", releaseDate: "2023-06-30", block: "Bloc 1" },
  "OP-04": { name: "Kingdoms of Intrigue", releaseDate: "2023-09-22", block: "Bloc 1" },
  "OP-05": { name: "Awakening of the New Era", releaseDate: "2023-12-08", block: "Bloc 2" },
  "OP-06": { name: "Wings of the Captain", releaseDate: "2024-03-15", block: "Bloc 2" },
  "OP-07": { name: "500 Years in the Future", releaseDate: "2024-06-28", block: "Bloc 2" },
  "OP-08": { name: "Two Legends", releaseDate: "2024-09-13", block: "Bloc 2" },
  "OP-09": { name: "Emperors in the New World", releaseDate: "2024-12-13", block: "Bloc 3" },
  "OP-10": { name: "Royal Blood", releaseDate: "2025-03-21", block: "Bloc 3" },
  "OP-11": { name: "A Fist of Divine Speed", releaseDate: "2025-06-06", block: "Bloc 3" },
  "EB-01": { name: "Memorial Collection", releaseDate: "2024-05-03" },
  "PRB-01": { name: "Premium Booster -The Best-", releaseDate: "2024-11-08" },
};
