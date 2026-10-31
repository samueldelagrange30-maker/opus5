import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container-x flex flex-col items-center gap-4 py-24 text-center">
      <p className="font-display text-6xl font-black text-white">404</p>
      <p className="text-ink-300">Cette page, cette extension ou cette carte est introuvable.</p>
      <Link href="/recherche" className="btn-primary">Rechercher une carte</Link>
    </div>
  );
}
