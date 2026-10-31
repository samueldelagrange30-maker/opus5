import Link from "next/link";
import { Layers, Trophy, GitCompare, Library, Heart, Newspaper } from "lucide-react";
import { SearchBox } from "./search-box";
import { UserMenu } from "./user-menu";

export const NAV = [
  { href: "/pokemon", label: "Pokémon", accent: "text-poke" },
  { href: "/one-piece", label: "One Piece", accent: "text-op-glow" },
  { href: "/extensions", label: "Extensions", icon: "layers" },
  { href: "/classements", label: "Classements", icon: "trophy" },
  { href: "/comparateur", label: "Comparateur", icon: "compare" },
  { href: "/actualites", label: "Actualités", icon: "news" },
] as const;

const ICONS = { layers: Layers, trophy: Trophy, compare: GitCompare, news: Newspaper };

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[.06] bg-ink-950/80 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-poke via-poke-deep to-op font-display text-sm font-black text-ink-950">TV</span>
          <span className="hidden font-display text-lg font-extrabold tracking-tight sm:block">TCG<span className="text-ink-300">Vault</span></span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => {
            const Icon = "icon" in n ? ICONS[n.icon] : null;
            return (
              <Link key={n.href} href={n.href} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-200 transition hover:bg-white/[.06] hover:text-white ${"accent" in n ? n.accent : ""}`}>
                {Icon && <Icon className="h-4 w-4 opacity-70" />}{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto hidden w-full max-w-sm md:block"><SearchBox /></div>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link href="/collection" className="hidden rounded-lg p-2 text-ink-200 hover:bg-white/[.06] sm:block" title="Ma collection"><Library className="h-5 w-5" /></Link>
          <Link href="/souhaits" className="hidden rounded-lg p-2 text-ink-200 hover:bg-white/[.06] sm:block" title="Liste de souhaits"><Heart className="h-5 w-5" /></Link>
          <UserMenu />
        </div>
      </div>
      <div className="container-x pb-3 md:hidden"><SearchBox /></div>
    </header>
  );
}
