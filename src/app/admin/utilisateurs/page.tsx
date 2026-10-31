import { requireAdmin } from "../guard";
import { AdminNav } from "../nav";
import { setRole } from "../actions";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const { sb, admin } = await requireAdmin();
  const { data: profiles } = await sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
  const emails = new Map<string, string>();
  if (admin) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) emails.set(u.id, u.email ?? "");
  }
  return (
    <div className="container-x space-y-6 pt-8">
      <h1 className="font-display text-3xl font-black text-white">Utilisateurs</h1>
      <AdminNav />
      <div className="panel overflow-x-auto p-2">
        <table className="table-x min-w-[700px]">
          <thead><tr><th>Pseudo</th><th>E-mail</th><th>Inscription</th><th>Rôle</th><th /></tr></thead>
          <tbody>{(profiles ?? []).map((p) => (
            <tr key={p.id}><td className="font-semibold">{p.display_name ?? "—"}</td><td className="text-xs">{emails.get(p.id) ?? "(clé service requise)"}</td><td className="text-xs">{formatDateTime(p.created_at)}</td><td>{p.role}</td>
              <td><form action={setRole}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="role" value={p.role === "admin" ? "user" : "admin"} /><button className="text-xs text-sky-300 hover:underline">{p.role === "admin" ? "Retirer admin" : "Promouvoir admin"}</button></form></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
