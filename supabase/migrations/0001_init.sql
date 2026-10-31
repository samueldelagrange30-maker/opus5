-- =============================================================================
-- TCG Vault — schéma PostgreSQL (Supabase)
-- Pokémon TCG + One Piece Card Game : catalogue, prix multi-sources, historique,
-- collections, listes de souhaits, alertes, supervision des synchronisations.
-- =============================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() n'est pas IMMUTABLE : enveloppe pour l'utiliser dans les index.
create or replace function public.f_unaccent(text) returns text
language sql immutable parallel safe strict as $$ select public.unaccent('public.unaccent', $1) $$;

-- ----------------------------------------------------------------- Catalogue
create table public.games (
  id text primary key check (id in ('pokemon', 'onepiece')),
  name text not null
);
insert into public.games (id, name) values ('pokemon', 'Pokémon TCG'), ('onepiece', 'One Piece Card Game');

create table public.sets (
  game text not null references public.games(id),
  set_id text not null,
  code text not null,
  name text not null,
  series text,
  generation text,
  release_date date,
  total_cards int,
  official_cards int,
  logo_url text,
  symbol_url text,
  image_url text,
  languages text[] not null default '{}',
  editions text[] not null default '{}',
  source text not null,
  manual_override boolean not null default false, -- protège les corrections admin
  updated_at timestamptz not null default now(),
  primary key (game, set_id)
);
create index sets_release_idx on public.sets (release_date desc nulls last);

create table public.cards (
  game text not null references public.games(id),
  card_id text not null,
  set_id text not null,
  set_name text not null,
  set_code text not null,
  number text not null,
  number_sort numeric not null default 0,
  name text not null,
  character text,
  category text,
  rarity text,
  language text not null default 'en',
  release_date date,
  image_small text,
  image_large text,
  is_alternate boolean not null default false,
  variant_label text,
  base_card_id text,
  tags text[] not null default '{}',
  colors text[] not null default '{}',
  stats jsonb not null default '[]',
  attacks jsonb not null default '[]',
  text text,
  illustrator text,
  finishes text[] not null default '{}',
  external_ids jsonb not null default '{}',
  -- Résumé de prix dénormalisé (EUR) pour des listes/filtres/tris rapides
  price_eur numeric(12,2),
  price_low_eur numeric(12,2),
  price_avg_eur numeric(12,2),
  price_high_eur numeric(12,2),
  price_last_sale_eur numeric(12,2),
  change_24h numeric(8,2),
  change_7d numeric(8,2),
  change_30d numeric(8,2),
  change_1y numeric(8,2),
  change_basis jsonb not null default '{}',
  price_source text,
  price_updated_at timestamptz,
  sales_count_30d int,
  search_vector tsvector generated always as (
    to_tsvector('simple', public.f_unaccent(coalesce(name,'') || ' ' || coalesce(character,'') || ' ' || coalesce(number,'') || ' ' || coalesce(set_name,'') || ' ' || coalesce(set_code,'')))
  ) stored,
  manual_override boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (game, card_id),
  foreign key (game, set_id) references public.sets(game, set_id) on delete cascade
);
create index cards_set_idx on public.cards (game, set_id, number_sort);
create index cards_price_idx on public.cards (price_eur desc nulls last);
create index cards_change7_idx on public.cards (change_7d desc nulls last);
create index cards_change24_idx on public.cards (change_24h desc nulls last);
create index cards_release_idx on public.cards (release_date desc nulls last);
create index cards_search_idx on public.cards using gin (search_vector);
create index cards_name_trgm_idx on public.cards using gin (public.f_unaccent(lower(name)) gin_trgm_ops);
create index cards_tags_idx on public.cards using gin (tags);
create index cards_rarity_idx on public.cards (game, rarity);

-- Identifiants chez les fournisseurs externes (Cardmarket idProduct, TCGplayer productId…)
create table public.card_external_ids (
  game text not null,
  card_id text not null,
  provider text not null,
  external_id text not null,
  primary key (game, card_id, provider),
  foreign key (game, card_id) references public.cards(game, card_id) on delete cascade
);

-- ---------------------------------------------------------------------- Prix
create table public.price_sources (
  id text primary key,
  label text not null,
  games text[] not null,
  enabled boolean not null default true,
  requires_key boolean not null default false,
  priority int not null default 100,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  notes text
);
insert into public.price_sources (id, label, games, requires_key, priority, notes) values
  ('tcgdex', 'TCGdex (Cardmarket + TCGplayer)', '{pokemon}', false, 10, 'Intégré, sans clé'),
  ('optcgapi', 'OPTCG API (TCGplayer)', '{onepiece}', false, 20, 'Intégré, sans clé'),
  ('justtcg', 'JustTCG', '{pokemon,onepiece}', true, 30, 'JUSTTCG_API_KEY'),
  ('pokemontcgio', 'Pokémon TCG API', '{pokemon}', false, 40, 'POKEMONTCG_API_KEY facultative'),
  ('cardmarket', 'Cardmarket (API officielle)', '{pokemon,onepiece}', true, 5, 'OAuth 1.0a, compte approuvé'),
  ('tcgplayer', 'TCGplayer (API officielle)', '{pokemon,onepiece}', true, 50, 'Clés partenaires'),
  ('ebay', 'eBay (ventes conclues)', '{pokemon,onepiece}', true, 60, 'Marketplace Insights (accès restreint)');

-- Dernière cotation connue par carte / source / variante
create table public.card_prices (
  game text not null,
  card_id text not null,
  source text not null,          -- cardmarket, tcgplayer, ebay, justtcg, optcgapi…
  source_label text not null,
  variant text not null default 'normal',
  condition text,
  currency text not null,
  market numeric(12,2), low numeric(12,2), avg numeric(12,2), high numeric(12,2),
  last_sale numeric(12,2), trend numeric(12,2), avg1 numeric(12,2), avg7 numeric(12,2), avg30 numeric(12,2),
  eur_market numeric(12,2), eur_low numeric(12,2), eur_avg numeric(12,2), eur_high numeric(12,2), eur_last_sale numeric(12,2),
  fx_rate numeric(12,6),
  fx_date date,
  sales_count int,
  changes jsonb not null default '{}',
  url text,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (game, card_id, source_label, variant),
  foreign key (game, card_id) references public.cards(game, card_id) on delete cascade
);
create index card_prices_card_idx on public.card_prices (game, card_id);

-- Historique quotidien (1 point par jour, source et variante)
create table public.price_history (
  game text not null,
  card_id text not null,
  source text not null,
  variant text not null default 'normal',
  day date not null,
  eur_market numeric(12,2) not null,
  original_market numeric(12,2),
  currency text not null,
  primary key (game, card_id, source, variant, day),
  foreign key (game, card_id) references public.cards(game, card_id) on delete cascade
);
create index price_history_card_idx on public.price_history (game, card_id, day desc);

-- ------------------------------------------------------------ Synchronisation
create table public.sync_runs (
  id bigserial primary key,
  kind text not null check (kind in ('catalog', 'prices', 'alerts', 'collections')),
  game text,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  triggered_by text not null default 'cron',
  items_processed int not null default 0,
  items_failed int not null default 0,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_runs_started_idx on public.sync_runs (started_at desc);

create table public.sync_errors (
  id bigserial primary key,
  run_id bigint references public.sync_runs(id) on delete cascade,
  provider text not null,
  game text,
  ref text,
  status_code int,
  message text not null,
  created_at timestamptz not null default now()
);
create index sync_errors_created_idx on public.sync_errors (created_at desc);

-- État de la synchronisation des prix (curseur de rotation par jeu)
create table public.sync_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------- Activité
create table public.search_events (
  id bigserial primary key,
  query text,
  game text,
  card_id text,
  kind text not null default 'search' check (kind in ('search', 'view')),
  created_at timestamptz not null default now()
);
create index search_events_card_idx on public.search_events (game, card_id, created_at desc);
create index search_events_created_idx on public.search_events (created_at desc);

-- ------------------------------------------------------------- Utilisateurs
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.collections (user_id, name, is_default) values (new.id, 'Ma collection', true);
  return new;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id);

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  card_id text not null,
  quantity int not null default 1 check (quantity > 0),
  language text not null default 'fr',
  condition text not null default 'NM' check (condition in ('M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO')),
  variant text not null default 'normal',
  purchase_price_eur numeric(12,2),
  purchase_date date,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (game, card_id) references public.cards(game, card_id)
);
create index collection_items_coll_idx on public.collection_items (collection_id);
create index collection_items_user_idx on public.collection_items (user_id);

create table public.collection_value_snapshots (
  collection_id uuid not null references public.collections(id) on delete cascade,
  day date not null,
  value_eur numeric(14,2) not null,
  cost_eur numeric(14,2),
  priced_items int not null default 0,
  total_items int not null default 0,
  primary key (collection_id, day)
);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  card_id text not null,
  target_price_eur numeric(12,2),
  alert_enabled boolean not null default true,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, game, card_id),
  foreign key (game, card_id) references public.cards(game, card_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'price_alert',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ------------------------------------------------------------------- Vues
-- Popularité : nombre de collections + listes de souhaits contenant la carte
create or replace view public.card_popularity as
  select game, card_id, count(*)::int as score from (
    select game, card_id from public.collection_items
    union all select game, card_id from public.wishlist_items
  ) t group by game, card_id;

-- Recherches / consultations sur 30 jours
create or replace view public.card_search_counts as
  select game, card_id, count(*)::int as score
  from public.search_events
  where card_id is not null and created_at > now() - interval '30 days'
  group by game, card_id;

-- ------------------------------------------------------------ Sécurité (RLS)
alter table public.games enable row level security;
alter table public.sets enable row level security;
alter table public.cards enable row level security;
alter table public.card_external_ids enable row level security;
alter table public.card_prices enable row level security;
alter table public.price_history enable row level security;
alter table public.price_sources enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_errors enable row level security;
alter table public.sync_state enable row level security;
alter table public.search_events enable row level security;
alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.collection_value_snapshots enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.notifications enable row level security;

-- Lecture publique du catalogue et des prix
create policy "public read" on public.games for select using (true);
create policy "public read" on public.sets for select using (true);
create policy "public read" on public.cards for select using (true);
create policy "public read" on public.card_external_ids for select using (true);
create policy "public read" on public.card_prices for select using (true);
create policy "public read" on public.price_history for select using (true);
create policy "public read" on public.price_sources for select using (true);

-- Écriture catalogue : administrateurs (la synchronisation utilise la clé service)
create policy "admin write" on public.sets for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.cards for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.price_sources for update using (public.is_admin()) with check (public.is_admin());
create policy "admin read" on public.sync_runs for select using (public.is_admin());
create policy "admin read" on public.sync_errors for select using (public.is_admin());
create policy "admin read" on public.sync_state for select using (public.is_admin());
create policy "admin read" on public.search_events for select using (public.is_admin());

-- Journalisation anonyme des recherches (insertion seule)
create policy "anyone insert" on public.search_events for insert with check (true);

-- Profils
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());
create policy "admin profiles" on public.profiles for update using (public.is_admin());

-- Données personnelles
create policy "own" on public.collections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.collection_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.collection_value_snapshots for select using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()));
create policy "own" on public.wishlist_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------- Fonctions utilitaires
-- Suggestions instantanées (préfixe + trigrammes)
create or replace function public.suggest_cards(q text, p_game text default null, p_limit int default 10)
returns setof public.cards language sql stable as $$
  select * from public.cards
  where (p_game is null or game = p_game)
    and (public.f_unaccent(lower(name)) like '%' || public.f_unaccent(lower(q)) || '%' or number ilike q || '%')
  order by (public.f_unaccent(lower(name)) like public.f_unaccent(lower(q)) || '%') desc, price_eur desc nulls last
  limit p_limit
$$;

-- Statistiques pour le tableau de bord
create or replace function public.admin_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() or auth.role() = 'service_role' then jsonb_build_object(
    'sets', (select count(*) from sets),
    'cards', (select count(*) from cards),
    'cards_priced', (select count(*) from cards where price_eur is not null),
    'cards_no_image', (select count(*) from cards where image_large is null),
    'cards_stale', (select count(*) from cards where price_updated_at < now() - interval '3 days'),
    'history_points', (select count(*) from price_history),
    'users', (select count(*) from profiles),
    'collections_items', (select count(*) from collection_items),
    'errors_24h', (select count(*) from sync_errors where created_at > now() - interval '24 hours')
  ) else null end
$$;

-- Valeurs disponibles pour les filtres (raretés, types) selon le jeu / l'extension
create or replace function public.card_facets(p_game text default null, p_set text default null) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'rarities', coalesce((select jsonb_agg(distinct rarity order by rarity) from public.cards where rarity is not null and (p_game is null or game = p_game) and (p_set is null or set_id = p_set)), '[]'),
    'categories', coalesce((select jsonb_agg(distinct category order by category) from public.cards where category is not null and (p_game is null or game = p_game) and (p_set is null or set_id = p_set)), '[]')
  )
$$;
