import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/[.06] bg-ink-950">
      <div className="container-x grid gap-8 py-10 text-sm text-ink-300 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-lg font-extrabold text-white">TCG<span className="text-ink-300">Vault</span></p>
          <p className="mt-2 max-w-md leading-relaxed">
            Encyclopédie et suivi du marché des cartes Pokémon TCG et One Piece Card Game. Prix affichés en euros,
            issus exclusivement de sources de données vérifiables. En l&apos;absence de donnée, « Prix indisponible » est affiché.
          </p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-white">Explorer</p>
          <ul className="space-y-1.5">
            <li><Link href="/extensions" className="hover:text-white">Extensions</Link></li>
            <li><Link href="/recherche" className="hover:text-white">Recherche avancée</Link></li>
            <li><Link href="/classements" className="hover:text-white">Classements</Link></li>
            <li><Link href="/sources" className="hover:text-white">Sources & méthodologie des prix</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-white">Sources de données</p>
          <ul className="space-y-1.5">
            <li><a href="https://tcgdex.dev" className="hover:text-white" rel="noopener" target="_blank">TCGdex</a> · <a href="https://optcgapi.com" className="hover:text-white" rel="noopener" target="_blank">OPTCG API</a></li>
            <li>Cardmarket · TCGplayer · eBay · JustTCG</li>
            <li>Taux de change : BCE (Frankfurter)</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[.04] py-4 text-center text-xs text-ink-400">
        Pokémon est une marque de Nintendo / Creatures / GAME FREAK / The Pokémon Company. One Piece Card Game est une marque de Bandai / Eiichiro Oda / Shueisha / Toei Animation. Site non affilié.
      </div>
    </footer>
  );
}
