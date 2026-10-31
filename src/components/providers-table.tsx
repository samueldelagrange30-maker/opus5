import { CircleCheck, Lock } from "lucide-react";
import { PRICE_PROVIDERS } from "@/lib/providers/price-providers";
import { GameBadge } from "./ui";

export function ProvidersTable({ showEnv }: { showEnv?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-x min-w-[720px]">
        <thead><tr><th>Source</th><th>Jeux</th><th>Type</th><th>État</th><th>Notes</th>{showEnv && <th>Variables</th>}</tr></thead>
        <tbody>
          {PRICE_PROVIDERS.map((p) => {
            const ok = p.isConfigured();
            return (
              <tr key={p.id}>
                <td><a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">{p.label}</a></td>
                <td className="space-x-1">{p.games.map((g) => <GameBadge key={g} game={g} />)}</td>
                <td className="text-xs">{p.kind === "intégré" ? "Intégré au catalogue" : "API externe"}</td>
                <td>{ok
                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-up"><CircleCheck className="h-3.5 w-3.5" />Actif</span>
                  : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300"><Lock className="h-3.5 w-3.5" />Clé / autorisation requise</span>}</td>
                <td className="max-w-md text-xs text-ink-300">{p.note}</td>
                {showEnv && <td className="font-mono text-[11px] text-ink-400">{p.envKeys.join(", ") || "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
