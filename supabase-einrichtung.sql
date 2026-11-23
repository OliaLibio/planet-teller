-- Planet Teller – einmalige Einrichtung in Supabase
-- In Supabase: links „SQL Editor“ öffnen, alles hier einfügen und auf „Run“ klicken.

-- Eine Tabelle für alle gespeicherten Werte der App (ein Tag = eine Zeile, Profil = eine Zeile …)
create table if not exists public.planet_daten (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Zeitstempel bei jeder Änderung vom Server setzen (unabhängig von der Uhr des Geräts)
create or replace function public.planet_daten_zeit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists planet_daten_zeit on public.planet_daten;
create trigger planet_daten_zeit
  before insert or update on public.planet_daten
  for each row execute function public.planet_daten_zeit();

create index if not exists planet_daten_user_zeit on public.planet_daten (user_id, updated_at);

-- Wichtig: Jede Person sieht und ändert nur ihre eigenen Zeilen.
alter table public.planet_daten enable row level security;

drop policy if exists "eigene Daten lesen" on public.planet_daten;
drop policy if exists "eigene Daten anlegen" on public.planet_daten;
drop policy if exists "eigene Daten ändern" on public.planet_daten;
drop policy if exists "eigene Daten löschen" on public.planet_daten;

create policy "eigene Daten lesen" on public.planet_daten
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "eigene Daten anlegen" on public.planet_daten
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "eigene Daten ändern" on public.planet_daten
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene Daten löschen" on public.planet_daten
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Nicht angemeldete Besucher bekommen keinerlei Zugriff.
revoke all on public.planet_daten from anon;
grant select, insert, update, delete on public.planet_daten to authenticated;
