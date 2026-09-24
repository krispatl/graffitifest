-- Run this entire file in the Supabase SQL Editor. Safe to rerun.
create table if not exists public.installation (
  id int primary key check(id=1), version bigint not null default 0, payload jsonb not null
);
create table if not exists public.installation_signal (
  id int primary key check(id=1), version bigint not null default 0
);
insert into public.installation_signal values(1,0) on conflict do nothing;
create table if not exists public.graffiti_rate_limits (
  key text primary key, count int not null, expires timestamptz not null
);
create index if not exists graffiti_rate_limits_expiry on public.graffiti_rate_limits(expires);
alter table public.installation enable row level security;
alter table public.installation_signal enable row level security;
alter table public.graffiti_rate_limits enable row level security;
revoke all on public.installation, public.graffiti_rate_limits from anon, authenticated;
revoke all on public.installation_signal from anon, authenticated;
grant select on public.installation_signal to anon, authenticated;
grant all on public.installation, public.installation_signal, public.graffiti_rate_limits to service_role;
drop policy if exists "read version signal" on public.installation_signal;
create policy "read version signal" on public.installation_signal for select to anon,authenticated using(id=1);

create or replace function public.save_installation(expected_version bigint, new_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed int;
begin
  update public.installation set version=expected_version+1, payload=new_payload
    where id=1 and version=expected_version;
  get diagnostics changed=row_count;
  if changed=1 then
    update public.installation_signal set version=expected_version+1 where id=1;
  end if;
  return changed=1;
end; $$;
create or replace function public.consume_rate(rate_key text, maximum int, window_ms int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare hits int;
begin
  delete from public.graffiti_rate_limits where expires<now();
  insert into public.graffiti_rate_limits as limits(key,count,expires)
    values(rate_key,1,now()+window_ms*interval '1 millisecond')
    on conflict(key) do update set count=limits.count+1 returning count into hits;
  return hits<=maximum;
end; $$;
revoke all on function public.save_installation(bigint,jsonb) from public,anon,authenticated;
revoke all on function public.consume_rate(text,int,int) from public,anon,authenticated;
grant execute on function public.save_installation(bigint,jsonb) to service_role;
grant execute on function public.consume_rate(text,int,int) to service_role;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='installation_signal' and schemaname='public') then
    alter publication supabase_realtime add table public.installation_signal;
  end if;
end $$;
