-- ============================================================
--  WooSyncShop – Supabase Database Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── User profiles (extends Supabase auth.users) ────────────
create table if not exists public.user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text,
  plan            text not null default 'pro',       -- 'pro' | 'free_forever' | 'suspended'
  max_shops       int  not null default 10,
  gemini_model    text not null default 'gemini-2.0-flash-lite',
  img_max_kb      int  not null default 400,
  img_quality     int  not null default 85,
  img_max_width   int  not null default 1200,
  ai_taxonomy_enabled   boolean not null default false,
  ai_taxonomy_model     text    not null default 'gemini-2.0-flash-lite',
  ai_taxonomy_threshold int     not null default 80,
  is_admin        boolean not null default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, full_name, is_admin)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email = 'roeland@haagdirect.nl'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Shops ──────────────────────────────────────────────────
create table if not exists public.shops (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  site_url         text not null,
  locale           text not null default 'nl_NL',
  flag             text not null default '🌐',
  consumer_key     text not null,   -- encrypted at rest by Supabase
  consumer_secret  text not null,   -- encrypted at rest by Supabase
  companion_token  text,            -- token for WooSyncShop companion plugin
  wc_version       text,
  wp_version       text,
  last_connected   timestamptz,
  created_at       timestamptz default now()
);

-- ── Shop connections (defines sync pairs + hreflang mode) ──
create table if not exists public.shop_connections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  shop_id            uuid not null references public.shops(id) on delete cascade,
  connected_shop_id  uuid not null references public.shops(id) on delete cascade,
  locale             text,
  base_url           text,
  mode               text not null default 'full',  -- 'full' | 'inventory_only'
  created_at         timestamptz default now(),
  unique(shop_id, connected_shop_id)
);

-- ── Connected products (SKU-linked across shops) ───────────
create table if not exists public.connected_products (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  sku         text,
  shop_entries jsonb not null default '[]',
  -- shop_entries: [{shop_id, product_id, product_url, sku}]
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── AI taxonomy translation cache ─────────────────────────
create table if not exists public.ai_taxonomy_cache (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  source_locale  text not null,
  target_locale  text not null,
  field_type     text not null,  -- 'category' | 'attribute' | 'tag'
  source_term    text not null,
  target_term    text not null,
  confidence     float not null,
  model          text not null,
  use_count      int not null default 1,
  created_at     timestamptz default now(),
  unique(user_id, source_locale, target_locale, field_type, source_term)
);

-- ── Pending AI reviews (below confidence threshold) ────────
create table if not exists public.ai_taxonomy_pending (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  source_locale  text not null,
  target_locale  text not null,
  field_type     text not null,
  source_term    text not null,
  suggested_term text,
  confidence     float,
  status         text not null default 'pending',  -- 'pending' | 'accepted' | 'skipped'
  created_at     timestamptz default now()
);

-- ── Row Level Security ─────────────────────────────────────
alter table public.user_profiles     enable row level security;
alter table public.shops             enable row level security;
alter table public.shop_connections  enable row level security;
alter table public.connected_products enable row level security;
alter table public.ai_taxonomy_cache  enable row level security;
alter table public.ai_taxonomy_pending enable row level security;

-- Users can only see their own data
create policy "own data" on public.user_profiles     for all using (auth.uid() = id);
create policy "own data" on public.shops             for all using (auth.uid() = user_id);
create policy "own data" on public.shop_connections  for all using (auth.uid() = user_id);
create policy "own data" on public.connected_products for all using (auth.uid() = user_id);
create policy "own data" on public.ai_taxonomy_cache  for all using (auth.uid() = user_id);
create policy "own data" on public.ai_taxonomy_pending for all using (auth.uid() = user_id);

-- Admins can read everything (via service role in serverless functions)
-- No extra policy needed — service role bypasses RLS
