-- =====================================================================
-- Lo que hay que ejecutar UNA vez en Supabase para que el Atajo del iPhone
-- pueda mandar tu peso (función supabase/functions/peso).
-- =====================================================================

-- Un "token" secreto por usuario: es la contraseña que lleva el enlace del
-- Atajo. Sin políticas: SOLO la función puede leerlo.
create table if not exists public.peso_atajo (
  user_id uuid primary key references auth.users on delete cascade,
  token text not null unique,
  creado timestamptz not null default now()
);
alter table public.peso_atajo enable row level security;
grant select, insert, update, delete on table public.peso_atajo to service_role;
