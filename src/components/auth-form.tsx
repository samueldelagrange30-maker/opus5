"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  if (!sb) return <p className="text-sm text-amber-200">Les comptes utilisateurs nécessitent Supabase (NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY).</p>;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    setLoading(true);
    setMsg(null);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = mode === "login"
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: { display_name: String(fd.get("name") ?? "") } } });
    setLoading(false);
    if (error) return setMsg({ ok: false, text: error.message });
    if (mode === "signup") return setMsg({ ok: true, text: "Compte créé. Vérifiez votre e-mail pour confirmer votre inscription." });
    router.push("/collection");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "signup" && <div><label className="label" htmlFor="name">Pseudo</label><input id="name" name="name" className="input" maxLength={40} /></div>}
      <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
      <div><label className="label" htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" required minLength={8} className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
      <button disabled={loading} className="btn-primary w-full">{loading ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
      {msg && <p className={msg.ok ? "text-sm text-up" : "text-sm text-down"}>{msg.text}</p>}
      <p className="text-center text-sm text-ink-300">
        {mode === "login" ? <>Pas encore de compte ? <Link href="/inscription" className="text-white underline">Inscription</Link></> : <>Déjà inscrit ? <Link href="/connexion" className="text-white underline">Connexion</Link></>}
      </p>
    </form>
  );
}
