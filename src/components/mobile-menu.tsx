"use client";
import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const LINKS = [
  ["/pokemon", "Pokémon TCG"], ["/one-piece", "One Piece Card Game"], ["/extensions", "Extensions"], ["/recherche", "Recherche avancée"],
  ["/classements", "Classements"], ["/comparateur", "Comparateur"], ["/actualites", "Actualités"], ["/collection", "Ma collection"], ["/souhaits", "Liste de souhaits"],
] as const;

export function MobileMenu({ loggedIn, isAdmin }: { loggedIn: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(!open)} className="rounded-lg p-2 text-ink-100 hover:bg-white/[.06]" aria-label="Menu" aria-expanded={open}>
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div className="fixed inset-x-0 top-16 z-50 border-b border-white/10 bg-ink-950/98 p-4 backdrop-blur-xl">
          <nav className="grid gap-1">
            {LINKS.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-base font-medium hover:bg-white/[.06]">{label}</Link>)}
            {isAdmin && <Link href="/admin" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-base font-medium hover:bg-white/[.06]">Administration</Link>}
            <Link href={loggedIn ? "/compte" : "/connexion"} onClick={() => setOpen(false)} className="btn-primary mt-2">{loggedIn ? "Mon compte" : "Connexion"}</Link>
          </nav>
        </div>
      )}
    </div>
  );
}
