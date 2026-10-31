import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/config";
import { markNotificationsRead, signOut } from "../actions";
import { Empty } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!hasSupabase()) return <div className="container-x pt-8"><Empty title="Comptes indisponibles">Supabase n&apos;est pas configuré sur ce déploiement.</Empty></div>;
  const session = await currentProfile();
  if (!session) redirect("/connexion");
  const sb = (await supabaseServer())!;
  const { data: notifs } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
  const unread = (notifs ?? []).filter((n) => !n.read_at).length;
  return (
    <div className="container-x max-w-3xl space-y-6 pt-8">
      <div className="flex items-center justify-between">
        <div><h1 className="font-display text-3xl font-black text-white">Mon compte</h1><p className="text-sm text-ink-300">{session.user.email} · {session.profile?.role === "admin" ? "Administrateur" : "Membre"}</p></div>
        <form action={signOut}><button className="btn-ghost">Déconnexion</button></form>
      </div>
      <div className="flex gap-2"><Link href="/collection" className="btn-ghost">Mes collections</Link><Link href="/souhaits" className="btn-ghost">Ma liste de souhaits</Link></div>
      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Bell className="h-5 w-5" />Alertes de prix {unread > 0 && <span className="chip">{unread} non lue(s)</span>}</h2>
          {unread > 0 && <form action={markNotificationsRead}><button className="text-xs text-ink-300 hover:text-white">Tout marquer comme lu</button></form>}
        </div>
        {notifs?.length ? (
          <ul className="divide-y divide-white/5">
            {notifs.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 py-2.5">
                <div><p className={n.read_at ? "text-sm text-ink-300" : "text-sm font-semibold text-white"}>{n.title}</p><p className="text-xs text-ink-400">{n.body} · {formatDateTime(n.created_at)}</p></div>
                {n.link && <Link href={n.link} className="shrink-0 text-xs text-sky-300 hover:underline">Voir</Link>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-400">Aucune alerte. Définissez un objectif de prix sur une carte de votre liste de souhaits.</p>}
      </section>
    </div>
  );
}
