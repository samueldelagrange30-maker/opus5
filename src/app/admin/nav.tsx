import Link from "next/link";
export function AdminNav() {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {[["/admin", "Tableau de bord"], ["/admin/extensions", "Extensions"], ["/admin/cartes", "Cartes & vérification"], ["/admin/utilisateurs", "Utilisateurs"]].map(([h, l]) => (
        <Link key={h} href={h} className="btn-ghost">{l}</Link>
      ))}
    </nav>
  );
}
