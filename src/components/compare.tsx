"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { GitCompare, X } from "lucide-react";
import { clsx } from "clsx";

export interface CompareRef { game: "pokemon" | "onepiece"; id: string; name: string; image: string | null }
const KEY = "tcgvault:compare";
export const MAX_COMPARE = 6;

function read(): CompareRef[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
let snapshot: CompareRef[] | null = null;
const listeners = new Set<() => void>();
function write(list: CompareRef[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_COMPARE)));
  snapshot = null;
  listeners.forEach((l) => l());
}
export function useCompare() {
  const list = useSyncExternalStore(
    (cb) => { listeners.add(cb); const s = (e: StorageEvent) => { if (e.key === KEY) { snapshot = null; cb(); } }; window.addEventListener("storage", s); return () => { listeners.delete(cb); window.removeEventListener("storage", s); }; },
    () => (snapshot ??= read()),
    () => EMPTY,
  );
  return {
    list,
    has: (r: Pick<CompareRef, "game" | "id">) => list.some((x) => x.game === r.game && x.id === r.id),
    toggle: (r: CompareRef) => write(list.some((x) => x.game === r.game && x.id === r.id) ? list.filter((x) => !(x.game === r.game && x.id === r.id)) : [...list, r]),
    remove: (r: Pick<CompareRef, "game" | "id">) => write(list.filter((x) => !(x.game === r.game && x.id === r.id))),
    clear: () => write([]),
  };
}
const EMPTY: CompareRef[] = [];

export function CompareButton({ card }: { card: CompareRef }) {
  const c = useCompare();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = mounted && c.has(card);
  const full = mounted && !active && c.list.length >= MAX_COMPARE;
  return (
    <button type="button" disabled={full} onClick={() => c.toggle(card)} className={clsx("btn-ghost", active && "border-sky-400/40 bg-sky-400/10 text-sky-200")} title={full ? `Maximum ${MAX_COMPARE} cartes` : undefined}>
      <GitCompare className="h-4 w-4" />{active ? "Dans le comparateur" : "Comparer"}
    </button>
  );
}

export function CompareTray() {
  const c = useCompare();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || c.list.length === 0) return null;
  const ids = c.list.map((r) => `${r.game}:${r.id}`).join(",");
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="panel flex max-w-full items-center gap-3 overflow-x-auto px-3 py-2 shadow-2xl">
        <GitCompare className="h-4 w-4 shrink-0 text-sky-300" />
        <div className="flex gap-2">
          {c.list.map((r) => (
            <div key={`${r.game}:${r.id}`} className="group relative h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-800" title={r.name}>
              {r.image && <Image src={r.image} alt={r.name} fill sizes="40px" className="object-cover" />}
              <button onClick={() => c.remove(r)} className="absolute right-0 top-0 hidden rounded-bl bg-ink-950/90 p-0.5 group-hover:block" aria-label={`Retirer ${r.name}`}><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
        <Link href={`/comparateur?cartes=${encodeURIComponent(ids)}`} className="btn-primary shrink-0">Comparer ({c.list.length})</Link>
        <button onClick={c.clear} className="shrink-0 text-xs text-ink-400 hover:text-white">Vider</button>
      </div>
    </div>
  );
}
