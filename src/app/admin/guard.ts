import "server-only";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/config";

export async function requireAdmin() {
  if (!hasSupabase()) redirect("/admin/configuration");
  const session = await currentProfile();
  if (!session) redirect("/connexion");
  if (session.profile?.role !== "admin") redirect("/");
  return { session, sb: (await supabaseServer())!, admin: supabaseAdmin() };
}
