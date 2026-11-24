-- =====================================================================
-- Lo que hay que ejecutar UNA vez en Supabase para mandar entrenos a
-- Garmin a través de Intervals.icu (función supabase/functions/intervals).
-- =====================================================================

-- Tu API key de Intervals.icu. Sin políticas: SOLO la función puede leerla
-- (la web no ve tu clave).
create table if not exists public.intervals_conexion (
  user_id uuid primary key references auth.users on delete cascade,
  clave text not null,
  atleta text,
  creada timestamptz not null default now()
);
alter table public.intervals_conexion enable row level security;
grant select, insert, update, delete on table public.intervals_conexion to service_role;
