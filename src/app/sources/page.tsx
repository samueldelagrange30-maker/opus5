import type { Metadata } from "next";
import { ProvidersTable } from "@/components/providers-table";

export const metadata: Metadata = { title: "Sources des prix et méthodologie", alternates: { canonical: "/sources" } };

export default function SourcesPage() {
  return (
    <div className="container-x max-w-4xl pt-8">
      <h1 className="font-display text-3xl font-black text-white">Sources des prix & méthodologie</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-200">
        <p><strong>Aucun prix n&apos;est inventé ni estimé.</strong> Chaque prix affiché provient d&apos;une source identifiée, avec sa date d&apos;actualisation. Lorsqu&apos;aucune source ne fournit de donnée, la mention « Prix indisponible » est affichée.</p>
        <p><strong>Prix du marché (€).</strong> Priorité à Cardmarket (place de marché européenne, prix natifs en euros : prix « tendance »). À défaut, prix de marché TCGplayer (USD) converti en euros au taux de référence de la Banque centrale européenne du jour.</p>
        <p><strong>Minimum / moyen / maximum.</strong> Minimum et maximum : valeurs les plus basses et les plus hautes relevées parmi les sources pour la même variante. Moyen : prix de vente moyen de la source principale.</p>
        <p><strong>Vente récente.</strong> Dernière vente conclue sur eBay (si l&apos;accès Marketplace Insights est configuré), sinon moyenne des ventes des dernières 24 h publiée par Cardmarket.</p>
        <p><strong>Variations 24 h / 7 j / 30 j / 1 an.</strong> Calculées en priorité à partir de l&apos;historique quotidien enregistré par la plateforme. À défaut, variations publiées par la source (JustTCG) ou comparaison du prix tendance aux moyennes 1 j / 7 j / 30 j publiées par Cardmarket. La méthode exacte est indiquée au survol de chaque variation.</p>
        <p><strong>Actualisation.</strong> Synchronisation automatique planifiée (plusieurs fois par jour) avec rotation sur l&apos;ensemble du catalogue ; les extensions récentes sont actualisées à chaque passage. Les sources publient elles-mêmes leurs prix une fois par jour environ.</p>
      </div>
      <h2 className="h-section mb-3 mt-10">Sources connectées</h2>
      <div className="panel p-2"><ProvidersTable /></div>
    </div>
  );
}
