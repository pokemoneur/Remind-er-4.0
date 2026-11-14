-- Remi shared demo catalog. Run this in the Supabase SQL editor.
-- The browser only receives a publishable key; row policies constrain access.
create table if not exists public.remi_shared_demos (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null unique check (length(catalog_key) between 32 and 64),
  program_name text not null check (length(program_name) between 1 and 160),
  program_kind text not null default 'website' check (program_kind in ('website','program')),
  program_version text not null default 'version not provided' check (length(program_version) <= 80),
  title text not null check (length(title) between 1 and 160),
  request text not null check (length(request) between 1 and 240),
  language text not null default 'en' check (language in ('en','fr','es','de','pt')),
  steps jsonb not null check (
    jsonb_typeof(steps) = 'array'
    and jsonb_array_length(steps) between 1 and 5
    and octet_length(steps::text) <= 12000
  ),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists remi_shared_demos_program_idx
  on public.remi_shared_demos (lower(program_name), program_version, created_at desc);
create index if not exists remi_shared_demos_catalog_idx
  on public.remi_shared_demos (catalog_key, created_at desc);

create or replace function public.limit_remi_demo_submissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  if (select count(*) from public.remi_shared_demos
      where created_by = auth.uid()
        and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Remi shared demo hourly limit reached';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_remi_demo_submissions() from public, anon, authenticated;
drop trigger if exists remi_shared_demo_rate_limit on public.remi_shared_demos;
create trigger remi_shared_demo_rate_limit
  before insert on public.remi_shared_demos
  for each row execute function public.limit_remi_demo_submissions();

alter table public.remi_shared_demos enable row level security;
revoke all on public.remi_shared_demos from anon, authenticated;
grant select (id, catalog_key, program_name, program_kind, program_version, title, request, language, steps, created_at)
  on public.remi_shared_demos to authenticated;
grant insert (catalog_key, program_name, program_kind, program_version, title, request, language, steps)
  on public.remi_shared_demos to authenticated;

drop policy if exists "Remi users can read shared demos" on public.remi_shared_demos;
create policy "Remi users can read shared demos"
  on public.remi_shared_demos for select
  to authenticated using (true);

drop policy if exists "Remi anonymous sessions can add shared demos" on public.remi_shared_demos;
create policy "Remi anonymous sessions can add shared demos"
  on public.remi_shared_demos for insert
  to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is true);

