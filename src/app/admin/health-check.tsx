"use client";
import { useState, useTransition } from "react";
import { checkProviders } from "./actions";

export function HealthCheck() {
  const [res, setRes] = useState<{ id: string; ok: boolean; message: string }[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button className="btn-ghost" disabled={pending} onClick={() => start(async () => setRes(await checkProviders()))}>{pending ? "Test en cours…" : "Tester la connexion aux API"}</button>
      {res && <ul className="mt-3 space-y-1 text-sm">{res.map((r) => <li key={r.id} className={r.ok ? "text-up" : "text-down"}>{r.ok ? "✓" : "✗"} {r.id} — {r.message}</li>)}</ul>}
    </div>
  );
}
