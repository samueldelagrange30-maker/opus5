"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-x flex flex-col items-center gap-4 py-24 text-center">
      <p className="font-display text-2xl font-bold text-white">Une source de données ne répond pas.</p>
      <p className="text-ink-300">Aucune donnée inventée n&apos;est affichée à la place. Réessayez dans un instant.</p>
      <button onClick={reset} className="btn-primary">Réessayer</button>
    </div>
  );
}
