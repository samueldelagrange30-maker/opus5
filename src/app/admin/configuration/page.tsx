import { ProvidersTable } from "@/components/providers-table";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function AdminConfig() {
  return (
    <div className="container-x max-w-4xl space-y-6 pt-8">
      <h1 className="font-display text-3xl font-black text-white">Configuration requise</h1>
      <Notice tone="warn">L&apos;espace administrateur nécessite Supabase. Renseignez NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY, appliquez la migration <code>supabase/migrations/0001_init.sql</code>, puis promouvez votre compte : <code>update profiles set role = &apos;admin&apos; where id = &apos;…&apos;;</code></Notice>
      <p className="text-sm text-ink-300">Le site fonctionne actuellement en <strong>mode direct</strong> : catalogue et prix lus en temps réel depuis les API publiques (avec cache).</p>
      <div className="panel p-2"><ProvidersTable showEnv /></div>
    </div>
  );
}
