create extension if not exists pgcrypto;

create or replace function public.is_allowed_admin_email()
returns boolean
language sql
stable
as $$
    select coalesce(
        (auth.jwt() ->> 'email') = any (array[
            'hau.hp+pnjcreative@example.com',
            'anh.hk+pnjcreative@example.com',
            'chau.hg+pnjcreative@example.com',
            'hau.nt+pnjcreative@example.com',
            'yen.dnh+pnjcreative@example.com'
        ]::text[]),
        false
    );
$$;

create table if not exists campaign_config (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    label text,
    display_order integer default 0,
    signature_text text,
    intro_text text,
    hero_video text,
    page_title text,
    created_at timestamptz not null default now()
);

create table if not exists blocks (
    id uuid primary key default gen_random_uuid(),
    branch_name text not null,
    type text not null,
    display_order integer default 0,
    media_url text,
    content text,
    text_style jsonb default '{}'::jsonb,
    button_text text,
    button_url text,
    created_at timestamptz not null default now()
);

create table if not exists hotspots (
    id uuid primary key default gen_random_uuid(),
    block_id uuid not null references blocks(id) on delete cascade,
    product_name text,
    price text,
    image_url text,
    product_url text,
    x numeric(6,2) not null default 0,
    y numeric(6,2) not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists leads (
    id uuid primary key default gen_random_uuid(),
    name text,
    phone text not null,
    branch_name text,
    created_at timestamptz not null default now()
);

create table if not exists events (
    id uuid primary key default gen_random_uuid(),
    event_type text not null,
    branch_name text,
    session_id text,
    product_name text,
    block_id text,
    extra_data jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_blocks_branch_name on blocks(branch_name);
create index if not exists idx_blocks_display_order on blocks(display_order);
create index if not exists idx_hotspots_block_id on hotspots(block_id);
create index if not exists idx_events_event_type on events(event_type);
create index if not exists idx_events_created_at on events(created_at desc);
create index if not exists idx_leads_created_at on leads(created_at desc);

alter table campaign_config enable row level security;
alter table blocks enable row level security;
alter table hotspots enable row level security;
alter table leads enable row level security;
alter table events enable row level security;

drop policy if exists "public read campaign_config" on campaign_config;
create policy "public read campaign_config"
on campaign_config for select
using (true);

drop policy if exists "authenticated admin write campaign_config" on campaign_config;
create policy "authenticated admin write campaign_config"
on campaign_config for all
to authenticated
using (public.is_allowed_admin_email())
with check (public.is_allowed_admin_email());

drop policy if exists "public read blocks" on blocks;
create policy "public read blocks"
on blocks for select
using (true);

drop policy if exists "authenticated admin write blocks" on blocks;
create policy "authenticated admin write blocks"
on blocks for all
to authenticated
using (public.is_allowed_admin_email())
with check (public.is_allowed_admin_email());

drop policy if exists "public read hotspots" on hotspots;
create policy "public read hotspots"
on hotspots for select
using (true);

drop policy if exists "authenticated admin write hotspots" on hotspots;
create policy "authenticated admin write hotspots"
on hotspots for all
to authenticated
using (public.is_allowed_admin_email())
with check (public.is_allowed_admin_email());

drop policy if exists "public write leads" on leads;
create policy "public write leads"
on leads for insert
to public
with check (true);

drop policy if exists "public read leads" on leads;
create policy "public read leads"
on leads for select
using (true);

drop policy if exists "public write events" on events;
create policy "public write events"
on events for insert
to public
with check (true);

drop policy if exists "public read events" on events;
create policy "public read events"
on events for select
using (true);
