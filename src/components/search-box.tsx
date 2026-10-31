"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search } from "lucide-react";
import { clsx } from "clsx";
import { formatEur } from "@/lib/format";

interface Suggestion { game: "pokemon" | "onepiece"; id: string; name: string; setName: string; number: string; image: string | null; priceEur: number | null }

const slug = (g: string) => (g === "onepiece" ? "one-piece" : "pokemon");

// Recherche instantanée avec suggestions pendant la saisie (debounce + annulation).
export function SearchBox({ large, game, autoFocus }: { large?: boolean; game?: "pokemon" | "onepiece"; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ q });
        if (game) p.set("jeu", game);
        const res = await fetch(`/api/suggest?${p}`, { signal: ctrl.signal });
        if (res.ok) { setItems((await res.json()).items ?? []); setOpen(true); setActive(-1); }
      } catch { /* requête annulée */ } finally { setLoading(false); }
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, game]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active >= 0 && items[active]) { go(items[active]); return; }
    const p = new URLSearchParams({ q });
    if (game) p.set("jeu", game);
    setOpen(false);
    router.push(`/recherche?${p}`);
  };
  const go = (s: Suggestion) => { setOpen(false); router.push(`/${slug(s.game)}/cartes/${encodeURIComponent(s.id)}`); };

  return (
    <div ref={box} className="relative w-full">
      <form onSubmit={submit} role="search">
        <Search className={clsx("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400", large ? "h-5 w-5" : "h-4 w-4")} />
        <input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Rechercher une carte, un Pokémon, un personnage, un numéro…"
          aria-label="Recherche globale"
          className={clsx("input pl-10", large && "h-14 rounded-2xl text-base")}
        />
        {loading && <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />}
      </form>
      {open && items.length > 0 && (
        <ul className="absolute z-50 mt-2 max-h-[70vh] w-full overflow-auto rounded-2xl border border-white/10 bg-ink-900/95 p-1.5 shadow-2xl backdrop-blur" role="listbox">
          {items.map((s, i) => (
            <li key={`${s.game}:${s.id}`}>
              <button type="button" onMouseDown={() => go(s)} className={clsx("flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition", i === active ? "bg-white/10" : "hover:bg-white/[.06]")}>
                <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-800">
                  {s.image && <Image src={s.image} alt="" fill sizes="36px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="truncate text-xs text-ink-400"><span className={s.game === "pokemon" ? "text-poke" : "text-op-glow"}>{s.game === "pokemon" ? "Pokémon" : "One Piece"}</span> · {s.setName} · {s.number}</p>
                </div>
                <span className={clsx("text-sm font-bold tabular-nums", s.priceEur === null && "text-xs font-medium text-ink-400")}>{formatEur(s.priceEur)}</span>
              </button>
            </li>
          ))}
          <li><button type="button" onMouseDown={() => { setOpen(false); router.push(`/recherche?q=${encodeURIComponent(q)}`); }} className="w-full rounded-xl px-3 py-2 text-left text-xs text-ink-300 hover:bg-white/[.06]">Voir tous les résultats pour « {q} » →</button></li>
        </ul>
      )}
    </div>
  );
}
