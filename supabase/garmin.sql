-- =====================================================================
-- Lo que hay que ejecutar UNA vez en Supabase (SQL Editor → Run) para que
-- tus actividades del Garmin lleguen solas a la app.
--
-- Cómo funciona:
--   - La función "garmin" (supabase/functions/garmin/index.ts) se ejecuta
--     cada minuto. Con tu clave personal de Garmin pregunta qué
--     actividades nuevas tienes y descarga su archivo original (.FIT).
--   - Deja cada archivo en la tabla garmin_archivos.
--   - Cuando abres la app, la pestaña Entreno recoge esos archivos, los lee
--     igual que si los hubieras subido a mano y los borra de esa tabla.
-- =====================================================================

-- 1. Tu conexión con Garmin: la clave y por dónde va la descarga.
--    Sin políticas: SOLO la función puede leerla (la web no ve tu clave).
create table public.garmin_conexion (
  user_id uuid primary key references auth.users on delete cascade,
  clave text not null,
  token text,
  token_caduca timestamptz,
  historial_desde int not null default 0,       -- por dónde va trayendo tu historial antiguo
  historial_completo boolean not null default false,
  ultima_sync timestamptz,
  ultimo_error text,
  pausa_hasta timestamptz,                     -- si Garmin pide ir más despacio, hasta cuándo esperar
  creada timestamptz not null default now()
);
alter table public.garmin_conexion enable row level security;

-- 2. Qué actividades de Garmin conocemos y si ya se descargaron. Solo la función.
create table public.garmin_actividades (
  user_id uuid not null references auth.users on delete cascade,
  activity_id bigint not null,
  inicio timestamptz,
  estado text not null default 'pendiente',  -- pendiente | descargada | error
  intentos int not null default 0,
  primary key (user_id, activity_id)
);
alter table public.garmin_actividades enable row level security;

-- 3. Los archivos descargados, esperando a que la app los recoja.
--    Tú (la app) puedes verlos y borrarlos; solo los tuyos.
create table public.garmin_archivos (
  user_id uuid not null references auth.users on delete cascade,
  activity_id bigint not null,
  archivo text not null,          -- el .zip de Garmin, en base64
  creado timestamptz not null default now(),
  primary key (user_id, activity_id)
);
alter table public.garmin_archivos enable row level security;
create policy "cada uno los suyos" on public.garmin_archivos for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, delete on table public.garmin_archivos to authenticated;

-- 4. Permisos para la función (usa la llave de servicio)
grant select, insert, update, delete on table public.garmin_conexion to service_role;
grant select, insert, update, delete on table public.garmin_actividades to service_role;
grant select, insert, update, delete on table public.garmin_archivos to service_role;

-- 5. Llamar a la función cada minuto (si no hay nada pendiente, ella misma
--    solo pregunta a Garmin cada 3 minutos)
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('traer-garmin', '* * * * *', $$
  select net.http_post(
    url := 'https://hcehbosfskzhfockbdor.supabase.co/functions/v1/garmin',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhib3Nmc2t6aGZvY2tiZG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzODM1NTIsImV4cCI6MjExMDk1OTU1Mn0.bwnh1O8j4UGCDB9hV6JX5zoDJqlFFVpbZksHGaRCt5U"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- ---------------------------------------------------------------------
-- Si ya lo tenías instalado de antes (cada 10 min), basta con esto:
--   alter table public.garmin_conexion add column if not exists pausa_hasta timestamptz;
--   select cron.alter_job((select jobid from cron.job where jobname = 'traer-garmin'), schedule := '* * * * *');
