-- =====================================================================
-- Lo que hay que ejecutar UNA vez en Supabase (SQL Editor → Run) para los avisos.
-- =====================================================================

-- 1. Dónde guardamos los móviles/ordenadores que quieren avisos
create table public.suscripciones (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  datos jsonb not null,
  creado timestamptz not null default now()
);
alter table public.suscripciones enable row level security;
create policy "cada uno las suyas" on public.suscripciones for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.suscripciones to authenticated;

-- 2. Qué avisos ya se han mandado (para no repetirlos). Solo la función lo usa.
create table public.avisos_enviados (
  user_id uuid not null references auth.users on delete cascade,
  aviso_id text not null,
  enviado_en timestamptz not null default now(),
  primary key (user_id, aviso_id)
);
alter table public.avisos_enviados enable row level security;

-- 3. Las llaves para mandar notificaciones (las crea la función). Nadie más puede leerlas.
create table public.claves_vapid (
  id int primary key,
  publica text not null,
  privada text not null
);
alter table public.claves_vapid enable row level security;

-- 4. Permisos para la función (usa la llave de servicio)
grant select on table public.datos to service_role;
grant select, insert, update, delete on table public.suscripciones to service_role;
grant select, insert, update, delete on table public.avisos_enviados to service_role;
grant select, insert on table public.claves_vapid to service_role;

-- 5. Llamar a la función cada minuto
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('enviar-avisos', '* * * * *', $$
  select net.http_post(
    url := 'https://hcehbosfskzhfockbdor.supabase.co/functions/v1/avisos',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhib3Nmc2t6aGZvY2tiZG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzODM1NTIsImV4cCI6MjExMDk1OTU1Mn0.bwnh1O8j4UGCDB9hV6JX5zoDJqlFFVpbZksHGaRCt5U"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
