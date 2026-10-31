import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { repo } from "@/lib/data";
import { GAMES, gameFromSlug, type PriceQuote } from "@/lib/types";
import { CardImage } from "@/components/card-image";
import { CardGrid } from "@/components/card-tile";
import { PriceChart } from "@/components/price-chart";
import { Change, GameBadge, Notice, Price, gameHref, setHref } from "@/components/ui";
import { CompareButton } from "@/components/compare";
import { CardActions } from "@/components/card-actions";
import { TrackView } from "@/components/track-view";
import { formatDate, formatDateTime, formatMoney, timeAgo } from "@/lib/format";
import { TAG_LABELS } from "@/lib/rarity";
import { marketValue } from "@/lib/pricing";

// Rendu à la demande puis mis en cache (ISR).
export async function generateStaticParams() {
  return [];
}

export const revalidate = 1800;
type Params = { game: string; cardId: string };

const LANGS: Record<string, string> = { fr: "Français", en: "Anglais", ja: "Japonais" };
const VARIANTS: Record<string, string> = { normal: "Normale", holo: "Holo / Foil", reverse: "Reverse", parallel: "Parallèle", "first-edition": "1ère édition" };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const game = gameFromSlug(p.game);
  if (!game) return {};
  const page = await repo().getCard(game, decodeURIComponent(p.cardId)).catch(() => null);
  if (!page) return { title: "Carte introuvable" };
  const c = page.card;
  const price = page.prices.marketEur !== null ? ` — ${page.prices.marketEur.toFixed(2).replace(".", ",")} €` : "";
  return {
    title: `${c.name} ${c.number} (${c.setName})${price}`,
    description: `${c.name} · ${c.setName} · ${c.number} · ${c.rarity ?? ""}. Prix du marché en euros, historique et évolution sur 24 h, 7 j, 30 j et 1 an.`,
    alternates: { canonical: `${gameHref(game)}/cartes/${encodeURIComponent(c.id)}` },
    openGraph: c.imageLarge ? { images: [c.imageLarge] } : undefined,
  };
}

function QuoteRow({ q }: { q: PriceQuote }) {
  return (
    <tr>
      <td><p className="font-semibold">{q.sourceLabel}</p><p className="text-[11px] text-ink-400">{VARIANTS[q.variant] ?? q.variant}{q.condition ? ` · ${q.condition}` : ""}</p></td>
      <td className="tabular-nums font-semibold"><Price eur={marketValue(q.eur)} size="sm" />{q.currency !== "EUR" && <p className="text-[11px] text-ink-400">{formatMoney(marketValue(q.original), q.currency)}</p>}</td>
      <td className="tabular-nums">{formatMoney(q.eur.low, "EUR")}</td>
      <td className="tabular-nums">{formatMoney(q.eur.avg, "EUR")}</td>
      <td className="tabular-nums">{formatMoney(q.eur.high, "EUR")}</td>
      <td className="text-xs text-ink-300">{q.updatedAt ? formatDateTime(q.updatedAt) : "—"}</td>
      <td>{q.url ? <a href={q.url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-sky-300 hover:underline">Voir →</a> : null}</td>
    </tr>
  );
}

export default async function CardPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const game = gameFromSlug(p.game);
  if (!game) notFound();
  const page = await repo().getCard(game, decodeURIComponent(p.cardId)).catch((e) => { console.error(e); return null; });
  if (!page) notFound();
  const { card: c, prices: s, history, set } = page;
  const cm = s.quotes.find((q) => q.source === "cardmarket" && q.variant === (s.primary?.variant ?? "normal")) ?? s.quotes.find((q) => q.source === "cardmarket");
  const averages = cm ? [
    { label: "Moy. 30 j", eur: cm.eur.avg30 }, { label: "Moy. 7 j", eur: cm.eur.avg7 }, { label: "Moy. 24 h", eur: cm.eur.avg1 }, { label: "Tendance", eur: cm.eur.trend },
  ] : [];
  const fx = s.quotes.find((q) => q.currency !== "EUR" && q.fxRate);
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: `${c.name} ${c.number}`, image: c.imageLarge ?? undefined, sku: c.id,
    brand: game === "pokemon" ? "Pokémon TCG" : "One Piece Card Game", category: "Trading card",
    ...(s.lowEur !== null && s.highEur !== null ? { offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: s.lowEur, highPrice: s.highEur } } : {}),
  };

  return (
    <div className="container-x pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TrackView game={game} cardId={c.id} />
      <nav className="mb-4 text-xs text-ink-400">
        <Link href={gameHref(game)} className="hover:text-white">{GAMES[game].name}</Link> / <Link href={setHref(game, c.setId)} className="hover:text-white">{c.setName}</Link> / <span className="text-ink-200">{c.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(280px,420px)_1fr]">
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <CardImage src={c.imageLarge} alt={`${c.name} — ${c.setName} ${c.number}`} priority sizes="(max-width: 1024px) 90vw, 420px" className="shadow-2xl" />
          {c.imageLarge && <a href={c.imageLarge} target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-ink-400 hover:text-white">Ouvrir l&apos;image en haute définition</a>}
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <GameBadge game={game} />
              <span className="chip">{c.setCode} · {c.number}</span>
              {c.rarity && <span className="chip">{c.rarity}</span>}
              {c.isAlternate && <span className="chip border-op-gold/40 text-op-gold">{c.variantLabel ?? "Version alternative"}</span>}
              {c.tags.map((t) => <span key={t} className="chip">{TAG_LABELS[t]}</span>)}
            </div>
            <h1 className="mt-3 font-display text-3xl font-black text-white sm:text-4xl">{c.name}</h1>
            <p className="mt-1 text-ink-300"><Link href={setHref(game, c.setId)} className="hover:text-white">{c.setName}</Link> · sortie {formatDate(c.releaseDate ?? set?.releaseDate)}</p>
          </div>

          {/* Prix */}
          <section className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="label">Prix du marché actuel</p>
                <Price eur={s.marketEur} size="xl" />
                <p className="mt-1 text-xs text-ink-400">{s.primary ? `${s.primary.sourceLabel} · ${VARIANTS[s.primary.variant] ?? s.primary.variant}` : "Aucune source ne fournit de prix pour cette carte."}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Change change={s.changes.h24} label="24 h" />
                <Change change={s.changes.d7} label="7 j" />
                <Change change={s.changes.d30} label="30 j" />
                <Change change={s.changes.y1} label="1 an" />
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Prix minimum", s.lowEur], ["Prix moyen", s.avgEur], ["Prix maximum", s.highEur], ["Vente récente", s.lastSaleEur]].map(([label, v]) => (
                <div key={label as string} className="rounded-xl bg-white/[.03] p-3"><dt className="label">{label}</dt><dd><Price eur={v as number | null} size="md" /></dd></div>
              ))}
            </dl>
            <p className="mt-4 text-[11px] text-ink-400">
              Dernière actualisation : {s.updatedAt ? `${formatDateTime(s.updatedAt)} (${timeAgo(s.updatedAt)})` : "—"}
              {fx && ` · Conversion USD → EUR au taux BCE du ${formatDate(fx.fxDate)} (1 $ = ${fx.fxRate!.toFixed(4).replace(".", ",")} €)`}
              {" · "}Survolez une variation pour connaître sa méthode de calcul.
            </p>
          </section>

          <div className="flex flex-wrap gap-2">
            <CardActions game={game} cardId={c.id} priceEur={s.marketEur} />
            <CompareButton card={{ game, id: c.id, name: c.name, image: c.imageSmall }} />
          </div>

          {/* Historique */}
          <section className="panel p-5 sm:p-6">
            <h2 className="mb-4 font-display text-lg font-bold">Évolution du prix</h2>
            <PriceChart history={history} averages={averages} />
            {page.historyNotice && <div className="mt-3"><Notice>{page.historyNotice}</Notice></div>}
          </section>

          {/* Comparaison des marchés */}
          <section className="panel overflow-x-auto p-5 sm:p-6">
            <h2 className="mb-3 font-display text-lg font-bold">Comparaison des marchés</h2>
            {s.quotes.length ? (
              <table className="table-x min-w-[640px]">
                <thead><tr><th>Source</th><th>Marché</th><th>Min</th><th>Moyen</th><th>Max</th><th>Actualisé</th><th /></tr></thead>
                <tbody>{s.quotes.map((q, i) => <QuoteRow key={i} q={q} />)}</tbody>
              </table>
            ) : <p className="text-sm text-ink-400">Prix indisponible sur l&apos;ensemble des sources connectées.</p>}
          </section>

          {/* Caractéristiques */}
          <section className="panel p-5 sm:p-6">
            <h2 className="mb-4 font-display text-lg font-bold">Caractéristiques</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div><dt className="label">Numéro</dt><dd className="font-semibold">{c.number}{game === "pokemon" && set?.officialCards ? ` / ${set.officialCards}` : ""}</dd></div>
              <div><dt className="label">Extension</dt><dd className="font-semibold">{c.setName} ({c.setCode})</dd></div>
              <div><dt className="label">Rareté</dt><dd className="font-semibold">{c.rarity ?? "—"}</dd></div>
              <div><dt className="label">Type de carte</dt><dd className="font-semibold">{c.category ?? "—"}</dd></div>
              <div><dt className="label">{game === "pokemon" ? "Pokémon" : "Personnage"}</dt><dd className="font-semibold">{c.character ?? "—"}</dd></div>
              <div><dt className="label">Langue</dt><dd className="font-semibold">{LANGS[c.language] ?? c.language}</dd></div>
              {c.illustrator && <div><dt className="label">Illustrateur</dt><dd className="font-semibold">{c.illustrator}</dd></div>}
              {c.finishes.length > 0 && <div><dt className="label">Finitions</dt><dd className="font-semibold">{c.finishes.map((f) => VARIANTS[f] ?? f).join(", ")}</dd></div>}
              {c.stats.map((st) => <div key={st.label}><dt className="label">{st.label}</dt><dd className="font-semibold">{st.value}</dd></div>)}
            </dl>
            {c.attacks.length > 0 && (
              <div className="mt-5 space-y-2">
                {c.attacks.map((a, i) => (
                  <div key={i} className="rounded-xl bg-white/[.03] p-3">
                    <div className="flex items-center justify-between gap-2"><p className="font-semibold">{a.cost.length ? <span className="mr-2 text-xs text-ink-400">[{a.cost.join(" ")}]</span> : null}{a.name}</p>{a.damage && <span className="font-display font-bold">{a.damage}</span>}</div>
                    {a.effect && <p className="mt-1 text-sm text-ink-300">{a.effect}</p>}
                  </div>
                ))}
              </div>
            )}
            {c.text && <p className="mt-5 whitespace-pre-line rounded-xl bg-white/[.03] p-3 text-sm text-ink-200">{c.text}</p>}
          </section>
        </div>
      </div>

      {c.alternates.length > 0 && (
        <section className="mt-12">
          <h2 className="h-section mb-4">Versions alternatives & illustrations spéciales</h2>
          <CardGrid cards={c.alternates} showGame={false} />
        </section>
      )}
    </div>
  );
}
