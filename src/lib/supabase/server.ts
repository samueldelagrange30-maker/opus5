import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { config, hasSupabase, hasSupabaseAdmin } from "../config";

// Client lié à la session de l'utilisateur (cookies) — respecte les règles RLS.
export async function supabaseServer(): Promise<SupabaseClient | null> {
  if (!hasSupabase()) return null;
  const store = await cookies();
  return createServerClient(config.supabase.url!, config.supabase.anonKey!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* appelé depuis un Server Component : le middleware rafraîchit la session */
        }
      },
    },
  });
}

// Client public sans session (lecture du catalogue, compatible cache).
let anon: SupabaseClient | null = null;
export function supabasePublic(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  anon ??= createJsClient(config.supabase.url!, config.supabase.anonKey!, { auth: { persistSession: false } });
  return anon;
}

// Client « service role » — uniquement côté serveur (synchronisations, admin).
let admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient | null {
  if (!hasSupabaseAdmin()) return null;
  admin ??= createJsClient(config.supabase.url!, config.supabase.serviceRoleKey!, { auth: { persistSession: false } });
  return admin;
}

export async function currentUser() {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function currentProfile() {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data } = await sb.from("profiles").select("id, display_name, role").eq("id", u.user.id).maybeSingle();
  return { user: u.user, profile: data as { id: string; display_name: string | null; role: "user" | "admin" } | null };
}
