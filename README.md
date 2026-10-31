# TCG Vault — Pokémon TCG & One Piece Card Game

Plateforme de référence regroupant **toutes les extensions et cartes Pokémon TCG et One Piece Card Game**, avec **prix du marché en euros** actualisés automatiquement, historiques, classements, collections, listes de souhaits avec alertes, comparateur et espace administrateur.

> Règle fondamentale : **aucun prix n'est inventé**. Chaque prix provient d'une source identifiée et datée. Sans donnée, l'interface affiche « Prix indisponible ».

## Stack

| Couche | Technologie |
|---|---|
| Frontend | Next.js 15 (App Router, React 19, Server Components, ISR) |
| Design | Tailwind CSS 3 (mode sombre par défaut, couleurs Pokémon jaune/bleu et One Piece rouge/or) |
| Graphiques | Recharts |
| Base de données | Supabase PostgreSQL (`supabase/migrations/0001_init.sql`) |
| Authentification | Supabase Auth (e-mail + mot de passe) |
| Synchronisation | Vercel Cron → `/api/cron/sync` ou CLI `npm run sync:*` |
| Hébergement | Vercel |

## Démarrage

```bash
npm install
cp .env.example .env.local   # tout est facultatif pour démarrer
npm run dev                  # http://localhost:3000
```

### Deux modes de données

1. **Mode direct** (aucune configuration) : le catalogue et les prix sont lus en temps réel depuis TCGdex et OPTCG API, avec le cache de Next.js (12 h pour le catalogue, 2 h pour les prix). Toutes les pages publiques fonctionnent. Limites : recherche Pokémon plafonnée à 120 résultats hors filtre d'extension, classements calculés sur toutes les cartes One Piece et les 6 dernières extensions Pokémon, pas de comptes utilisateurs.
2. **Mode Supabase** (recommandé en production) : les synchronisations alimentent PostgreSQL. Recherche exhaustive et filtres SQL, classements complets, historique quotidien illimité, variations exactes sur 24 h, 7 j, 30 j et 1 an, comptes, collections, alertes et administration. Une carte ou une extension pas encore synchronisée est lue en direct (repli automatique).

### Mise en place de Supabase

1. Créer un projet Supabase, puis exécuter `supabase/migrations/0001_init.sql` (SQL Editor ou `supabase db push`).
2. Renseigner `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET`.
3. Premier remplissage : `npm run sync:onepiece`, puis `npm run sync:pokemon -- --complet` (parcourt toutes les extensions Pokémon, ce qui prend du temps).
4. Créer un compte sur `/inscription`, puis le promouvoir administrateur :
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'vous@exemple.fr');`

### Déploiement sur Vercel

Importer le dépôt dans Vercel, ajouter les variables d'environnement, puis déployer. `vercel.json` déclare les crons suivants :

| Cron | Fréquence | Rôle |
|---|---|---|
| `/api/cron/sync?job=pokemon` | toutes les 30 min | extensions récentes + rotation sur le catalogue, puis alertes de prix |
| `/api/cron/sync?job=onepiece` | toutes les 3 h | catalogue One Piece complet + prix, puis alertes |
| `/api/cron/sync?job=collections` | chaque jour | valorisation quotidienne des collections |

⚠️ L'offre Vercel **Hobby** limite les crons à une exécution par jour : avec cette offre, réduisez les fréquences ou lancez `npm run sync:*` depuis un serveur ou une GitHub Action. Chaque exécution est limitée à environ 50 s (`maxDuration = 60`), et un curseur stocké dans `sync_state` reprend la rotation là où elle s'est arrêtée.

## Sources de données et clés

| Source | Jeux | Données | Statut |
|---|---|---|---|
| [TCGdex](https://tcgdex.dev) | Pokémon | Extensions, cartes FR/EN, images HD, **prix Cardmarket (EUR)** et TCGplayer (USD) | ✅ Sans clé |
| [OPTCG API](https://optcgapi.com) | One Piece | Extensions, decks, cartes, versions parallèles, images, **prix TCGplayer (USD)**, historique sur 2 semaines | ✅ Sans clé |
| [Frankfurter](https://frankfurter.dev) (BCE) | — | Taux USD→EUR officiels du jour | ✅ Sans clé |
| [JustTCG](https://justtcg.com) | Les deux | Prix par état, variations 24 h/7 j/30 j, historique | 🔑 `JUSTTCG_API_KEY` (offre gratuite) |
| [Pokémon TCG API](https://pokemontcg.io) | Pokémon | Cardmarket + TCGplayer (source complémentaire) | 🔑 facultative (`POKEMONTCG_ENABLED=true`) |
| Cardmarket API 2.0 | Les deux | Price guide officiel (OAuth 1.0a déjà implémenté) | 🔒 Compte professionnel approuvé par Cardmarket |
| TCGplayer API | Les deux | Prix de marché officiels | 🔒 Clés partenaires (nouvelles clés rarement accordées) |
| eBay Marketplace Insights | Les deux | **Ventes réellement conclues** (min, médiane, max, dernière vente, volume) | 🔒 Accès restreint, sur demande auprès d'eBay |

Les connecteurs non configurés restent inactifs. Ils sont signalés comme tels dans `/sources` et `/admin`, avec la liste des variables attendues. Pour ajouter une source, il suffit d'implémenter l'interface `PriceProvider` dans `src/lib/providers/price-providers.ts`. Les limites de débit (concurrence et intervalle minimal par fournisseur), les nouvelles tentatives (backoff exponentiel, `Retry-After`) et le journal d'erreurs sont gérés dans `src/lib/http.ts`.

### Méthodologie des prix

- **Prix du marché** : on retient d'abord la tendance Cardmarket (EUR natif). À défaut, le prix de marché TCGplayer converti en euros au taux BCE du jour (le taux appliqué est affiché).
- **Min / max** : extrêmes relevés parmi les sources pour la même variante. **Moyen** : prix de vente moyen de la source principale.
- **Vente récente** : dernière vente eBay conclue, sinon moyenne Cardmarket des ventes sur 24 h.
- **Variations** : elles sont calculées en priorité à partir de l'historique enregistré (Supabase). À défaut, on utilise les variations publiées par JustTCG, puis les écarts entre la tendance Cardmarket et ses moyennes sur 1, 7 et 30 jours. La méthode s'affiche au survol de chaque variation.

## Fonctionnalités

- **Accueil** : recherche globale avec suggestions instantanées, accès Pokémon et One Piece, tendances du marché, dernières extensions, cartes les plus chères, plus fortes hausses et baisses, cartes les plus recherchées, actualités (flux RSS configurables).
- **Extensions** (`/extensions`, `/{jeu}/extensions/{id}`) : logo, visuel, date, nombre de cartes, série et génération, code, langues, éditions. Grille complète avec prix, tri par numéro, prix, variation ou nom, et valeur totale du set.
- **Fiche carte** (`/{jeu}/cartes/{id}`) : image HD et toutes les caractéristiques. Prix du marché, minimum, moyen, maximum et vente récente, variations sur 24 h, 7 j, 30 j et 1 an, graphique interactif (7 j, 30 j, 1 an, tout), comparaison des marchés, versions alternatives, JSON-LD.
- **Recherche avancée** (`/recherche`) : tous les filtres sont combinables et partageables par URL (jeu, extension, nom, numéro, rareté, prix min/max, langue, type, personnage, version normale ou alternative, holo, reverse, full art, SAR, IR, secrète, SEC, Manga, SP, Leader, promo, tendance, tris).
- **Classements** (`/classements/*`) : top 100 des plus chères, plus recherchées, hausses sur 24 h et 7 j, baisses, plus vendues (eBay), plus populaires, sorties récentes.
- **Collections** : plusieurs collections par compte. Quantité, langue, état (M à PO), version, prix et date d'achat, valeur totale, plus-values et moins-values, évolution quotidienne de la valeur.
- **Liste de souhaits** : prix actuel, variations, objectif de prix et alertes (notifications dans `/compte`).
- **Comparateur** : jusqu'à 6 cartes côte à côte, historique de chacune.
- **Administration** (`/admin`) : statistiques, vérification des données (cartes sans image, sans prix, prix obsolètes), édition des extensions et des cartes (protégées contre l'écrasement par la synchronisation), gestion des utilisateurs, état et test des API, activation des sources, journal des synchronisations et des erreurs, actualisation manuelle.
- **SEO** : URL directes, métadonnées par page, `sitemap.xml`, `robots.txt`, données structurées.

## Architecture

```
src/lib/
  types.ts                 modèle de domaine commun
  http.ts                  client HTTP : limites de débit, nouvelles tentatives, journal d'erreurs
  fx.ts                    taux BCE
  pricing.ts               agrégation multi-sources (sans aucune extrapolation)
  providers/tcgdex.ts      catalogue Pokémon + prix Cardmarket/TCGplayer
  providers/optcg.ts       catalogue One Piece + prix TCGplayer + historique
  providers/price-providers.ts  JustTCG, pokemontcg.io, Cardmarket, TCGplayer, eBay
  catalog.ts               orchestration des connecteurs (mode direct + synchronisation)
  data/                    Repository : live-repo (API) / supabase-repo (SQL) + repli
  sync/                    synchronisations catalogue/prix/historique, alertes, collections
supabase/migrations/       schéma, index, RLS, fonctions
```

## Tests

```bash
npm test          # mapping des API, calculs de prix, conversion, filtres, RSS
npm run typecheck
node tests/mock-api.mjs   # faux serveur d'API pour tester l'interface hors ligne :
# TCGDEX_BASE_URL=http://localhost:4010/tcgdex OPTCG_BASE_URL=http://localhost:4010/optcg FX_BASE_URL=http://localhost:4010/fx npm run dev
```

## Limites connues

- **One Piece** : l'API ne fournit ni logo d'extension ni date de sortie. Les dates des boosters anglais sont renseignées dans `src/lib/providers/onepiece-meta.ts`, et les logos s'ajoutent depuis l'administration. Les prix proviennent du marché américain (TCGplayer) tant que JustTCG ou Cardmarket ne sont pas configurés.
- **Cartes japonaises** : elles ne sont pas encore cataloguées (TCGdex utilise des identifiants distincts pour le japonais). L'architecture permet d'ajouter ce catalogue.
- **Prix par état de conservation** : ils ne sont disponibles qu'avec JustTCG. Les autres sources publient un prix de référence (Near Mint ou tendance).
