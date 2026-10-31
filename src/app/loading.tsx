export default function Loading() {
  return (
    <div className="container-x space-y-6 pt-8" aria-busy="true" aria-label="Chargement">
      <div className="skeleton h-10 w-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-[63/100]" />)}
      </div>
    </div>
  );
}
