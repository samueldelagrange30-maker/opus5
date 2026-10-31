import type { Metadata } from "next";
import { requireAdmin } from "./guard";
import { AdminNav } from "./nav";
import { HealthCheck } from "./health-check";
import { toggleSource, triggerSync } from "./actions";
import { ProvidersTable } from "@/components/providers-table";
import { Notice } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import { providerRuntimeStatus } from "@/lib/http";

export const metadata: Metadata = { title: "Administration", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { sb, admin } = await requireAdmin();
  const [stats, runs, errors, sources] = await Promise.all([
    sb.rpc("admin_stats"),
    sb.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(25),
    sb.from("sync_errors").select("*").order("created_at", { ascending: false }).limit(50),
    sb.from("price_sources").select("*").order("priority"),
  ]);
  const s = (stats.data ?? {}) as Record<string, number>;
  const runtime = providerRuntimeStatus();
  const KPIS: [string, string][] = [["sets", "Extensions"], ["cards", "Cartes"], ["cards_priced", "Cartes cotées"], ["cards_no_image", "Sans image"], ["cards_stale", "Prix > 3 jours"], ["history_points", "Points d'historique"], ["users", "Utilisateurs"], ["errors_24h", "Erreurs (24 h)"]];
  return (
    <div className="container-x space-y-8 pt-8">
      <h1 className="font-display text-3xl font-black text-white">Administration</h1>
      <AdminNav />
      {!admin && <Notice tone="warn">SUPABASE_SERVICE_ROLE_KEY n&apos;est pas configurée : les synchronisations manuelles et automatiques sont désactivées.</Notice>}

      <section className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {KPIS.map(([k, l]) => <div key={k} className="panel p-4"><p className="label">{l}</p><p className="font-display text-2xl font-bold">{(s[k] ?? 0).toLocaleString("fr-FR")}</p></div>)}
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">Actualisation manuelle</h2>
        <form action={triggerSync} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="kind" value="prices" />
          <div><label className="label">Jeu</label><select name="game" className="input"><option value="pokemon">Pokémon</option><option value="onepiece">One Piece</option></select></div>
          <div className="min-w-[240px] flex-1"><label className="label">Extensions (facultatif, ids séparés par des virgules)</label><input name="sets" placeholder="ex : sv08, sv08.5 — vide = rotation automatique" className="input" /></div>
          <button className="btn-primary">Synchroniser catalogue + prix</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <form action={triggerSync}><input type="hidden" name="kind" value="alerts" /><button className="btn-ghost">Vérifier les alertes de prix</button></form>
          <form action={triggerSync}><input type="hidden" name="kind" value="collections" /><button className="btn-ghost">Valoriser les collections</button></form>
        </div>
        <p className="text-xs text-ink-400">Chaque exécution est limitée à ~55 s (fonctions serverless). La rotation reprend automatiquement là où elle s&apos;est arrêtée.</p>
      </section>

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">État des sources de prix</h2><HealthCheck /></div>
        <ProvidersTable showEnv />
        <div className="overflow-x-auto">
          <table className="table-x min-w-[720px]">
            <thead><tr><th>Source</th><th>Activée</th><th>Dernier succès</th><th>Dernière erreur</th><th>Instance (mémoire)</th></tr></thead>
            <tbody>
              {(sources.data ?? []).map((src) => (
                <tr key={src.id}>
                  <td className="font-semibold">{src.label}</td>
                  <td><form action={toggleSource}><input type="hidden" name="id" value={src.id} /><input type="hidden" name="enabled" value={String(!src.enabled)} /><button className={src.enabled ? "text-xs text-up" : "text-xs text-ink-400"}>{src.enabled ? "Oui (désactiver)" : "Non (activer)"}</button></form></td>
                  <td className="text-xs">{src.last_success_at ? timeAgo(src.last_success_at) : "—"}</td>
                  <td className="max-w-xs truncate text-xs text-down" title={src.last_error ?? ""}>{src.last_error_at ? `${timeAgo(src.last_error_at)} — ${src.last_error}` : "—"}</td>
                  <td className="text-xs text-ink-400">{runtime[src.id]?.latencyMs ? `${runtime[src.id].latencyMs} ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel overflow-x-auto p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Dernières synchronisations</h2>
        <table className="table-x min-w-[720px]">
          <thead><tr><th>Début</th><th>Type</th><th>Jeu</th><th>Statut</th><th>Traités</th><th>Échecs</th><th>Message</th><th>Déclencheur</th></tr></thead>
          <tbody>{(runs.data ?? []).map((r) => (
            <tr key={r.id}><td className="text-xs">{formatDateTime(r.started_at)}</td><td>{r.kind}</td><td>{r.game ?? "—"}</td>
              <td className={r.status === "success" ? "text-up" : r.status === "running" ? "text-sky-300" : r.status === "partial" ? "text-amber-300" : "text-down"}>{r.status}</td>
              <td>{r.items_processed}</td><td>{r.items_failed}</td><td className="text-xs">{r.message}</td><td className="text-xs text-ink-400">{r.triggered_by}</td></tr>
          ))}</tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Erreurs de synchronisation</h2>
        {errors.data?.length ? (
          <table className="table-x min-w-[720px]">
            <thead><tr><th>Date</th><th>Source</th><th>Jeu</th><th>Réf.</th><th>Code</th><th>Message</th></tr></thead>
            <tbody>{errors.data.map((e) => <tr key={e.id}><td className="text-xs">{formatDateTime(e.created_at)}</td><td>{e.provider}</td><td>{e.game ?? "—"}</td><td className="font-mono text-xs">{e.ref ?? "—"}</td><td>{e.status_code ?? "—"}</td><td className="text-xs text-down">{e.message}</td></tr>)}</tbody>
          </table>
        ) : <p className="text-sm text-ink-400">Aucune erreur enregistrée.</p>}
      </section>
    </div>
  );
}
