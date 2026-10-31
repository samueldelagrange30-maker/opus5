"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MobileMenu } from "./mobile-menu";

// Session lue côté client : les pages publiques restent statiques et mises en cache.
export function UserMenu() {
  const [state, setState] = useState<{ name: string | null; admin: boolean } | null>(null);
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const load = async () => {
      const { data } = await sb.auth.getUser();
      if (!data.user) return setState(null);
      const { data: p } = await sb.from("profiles").select("display_name, role").eq("id", data.user.id).maybeSingle();
      setState({ name: p?.display_name ?? data.user.email ?? "Mon compte", admin: p?.role === "admin" });
    };
    load();
    const { data: sub } = sb.auth.onAuthStateChange(() => { load(); });
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <>
      {state?.admin && <Link href="/admin" className="hidden rounded-lg p-2 text-ink-200 hover:bg-white/[.06] sm:block" title="Administration"><Shield className="h-5 w-5" /></Link>}
      {state ? <Link href="/compte" className="btn-ghost hidden max-w-[160px] truncate sm:inline-flex">{state.name}</Link> : <Link href="/connexion" className="btn-primary hidden sm:inline-flex">Connexion</Link>}
      <MobileMenu loggedIn={!!state} isAdmin={!!state?.admin} />
    </>
  );
}
