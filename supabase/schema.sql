-- ============================================================================
-- RAM Martial Arts — schema de administración
-- Pegar completo en el SQL Editor de Supabase y ejecutar.
-- Es idempotente: volver a correrlo no duplica datos ni pisa ediciones.
--
-- QUÉ TOCA ESTE SCRIPT
--   · Crea el schema  ram  y todo lo suyo adentro.
--   · Crea el bucket de Storage  ram-media  y 4 políticas sobre
--     storage.objects, todas filtradas por ese bucket. Es lo único fuera de
--     ram que se toca, y es imprescindible para poder subir imágenes.
--   · NO toca public, NO toca auth, NO modifica nada que ya exista.
--
-- ANTES DE CORRERLO
--   Creá el usuario admin@ram.com desde Authentication → Users en el panel de
--   Supabase. Este script no lo crea a propósito: insertar en auth.users a mano
--   deja el usuario mal formado y el login no funciona.
-- ============================================================================

create schema if not exists ram;

-- ----------------------------------------------------------------------------
-- Quién puede escribir
-- ----------------------------------------------------------------------------
-- Lee el email del JWT que manda PostgREST. Sin sesión devuelve false, así que
-- el sitio público (anon) nunca puede escribir.
create or replace function ram.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ram, pg_temp
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    ''
  ) = 'admin@ram.com';
$fn$;

comment on function ram.es_admin() is
  'true solo para el admin del panel. Si cambia la cuenta, cambiar el email acá.';

-- Mantiene actualizado_en al día en cada UPDATE
create or replace function ram.tocar_actualizado()
returns trigger
language plpgsql
as $fn$
begin
  new.actualizado_en = now();
  return new;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- Tablas
-- ----------------------------------------------------------------------------

create table if not exists ram.disciplinas (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  orden          integer not null default 0,
  kicker         text not null default '',
  titulo         text not null,
  resumen        text not null default '',     -- descripción corta de la tarjeta
  img            text not null default '',
  lore           text[] not null default '{}', -- descripción larga: un párrafo por elemento
  puntos         text[] not null default '{}', -- qué se entrena
  para_quien     text not null default '',
  equipo         text not null default '',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists ram.instructores (
  id             uuid primary key default gen_random_uuid(),
  orden          integer not null default 0,
  nombre         text not null,
  ensena         text not null default '',   -- qué enseña
  bio            text not null default '',   -- descripción breve
  img            text not null default '',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Un instructor puede estar en varias disciplinas y al revés
create table if not exists ram.disciplina_instructores (
  disciplina_id uuid not null references ram.disciplinas(id) on delete cascade,
  instructor_id uuid not null references ram.instructores(id) on delete cascade,
  orden         integer not null default 0,
  primary key (disciplina_id, instructor_id)
);

create table if not exists ram.horarios (
  id             uuid primary key default gen_random_uuid(),
  orden          integer not null default 0,
  clase          text not null,
  dias           text not null default '',
  hora           text not null default '',
  nivel          text not null default '',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists ram.galeria (
  id             uuid primary key default gen_random_uuid(),
  orden          integer not null default 0,
  img            text not null,
  alt            text not null default '',
  destacada      boolean not null default false,  -- sale en la portada
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Los seis bloques de "Por qué RAM"
create table if not exists ram.beneficios (
  id             uuid primary key default gen_random_uuid(),
  orden          integer not null default 0,
  titulo         text not null,
  texto          text not null default '',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Textos sueltos, imágenes de sección y datos de contacto, como clave/valor
create table if not exists ram.ajustes (
  clave          text primary key,
  valor          text not null default '',
  descripcion    text not null default '',
  actualizado_en timestamptz not null default now()
);

-- Actividades / eventos: afiche, descripción, fecha y horario. La reserva se
-- hace por WhatsApp desde la página pública, así que acá no se guardan reservas.
create table if not exists ram.eventos (
  id             uuid primary key default gen_random_uuid(),
  orden          integer not null default 0,
  titulo         text not null,
  descripcion    text not null default '',
  flyer          text not null default '',   -- afiche del evento (imagen)
  fecha          date,                        -- día del evento
  hora           text not null default '',    -- ej: «19:00 – 21:00»
  lugar          text not null default '',    -- opcional
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Triggers de actualizado_en
do $blk$
declare t text;
begin
  foreach t in array array['disciplinas','instructores','horarios','galeria','beneficios','ajustes','eventos']
  loop
    execute format(
      'drop trigger if exists tg_%1$s_actualizado on ram.%1$s;', t);
    execute format(
      'create trigger tg_%1$s_actualizado before update on ram.%1$s
       for each row execute function ram.tocar_actualizado();', t);
  end loop;
end $blk$;

create index if not exists ix_disciplinas_orden  on ram.disciplinas (orden)  where activo;
create index if not exists ix_instructores_orden on ram.instructores (orden) where activo;
create index if not exists ix_horarios_orden     on ram.horarios (orden)     where activo;
create index if not exists ix_galeria_orden      on ram.galeria (orden)      where activo;
create index if not exists ix_galeria_destacada  on ram.galeria (destacada)  where activo and destacada;
create index if not exists ix_eventos_fecha      on ram.eventos (fecha)      where activo;

-- ----------------------------------------------------------------------------
-- Permisos y RLS
--   anon          → solo lectura (lo usa el sitio público)
--   admin@ram.com → lectura y escritura (el panel)
-- ----------------------------------------------------------------------------

grant usage on schema ram to anon, authenticated;
grant select on all tables in schema ram to anon, authenticated;
grant insert, update, delete on all tables in schema ram to authenticated;
grant execute on function ram.es_admin() to anon, authenticated;

alter default privileges in schema ram grant select on tables to anon, authenticated;
alter default privileges in schema ram grant insert, update, delete on tables to authenticated;

do $blk$
declare t text;
begin
  foreach t in array array['disciplinas','instructores','disciplina_instructores',
                           'horarios','galeria','beneficios','ajustes','eventos']
  loop
    execute format('alter table ram.%I enable row level security;', t);
    execute format('drop policy if exists p_%1$s_leer on ram.%1$s;', t);
    execute format('drop policy if exists p_%1$s_escribir on ram.%1$s;', t);
    -- cualquiera lee: el sitio es público
    execute format(
      'create policy p_%1$s_leer on ram.%1$s
         for select to anon, authenticated using (true);', t);
    -- solo el admin escribe
    execute format(
      'create policy p_%1$s_escribir on ram.%1$s
         for all to authenticated
         using (ram.es_admin()) with check (ram.es_admin());', t);
  end loop;
end $blk$;

-- ----------------------------------------------------------------------------
-- Storage: bucket propio para las imágenes del panel
-- Único punto fuera del schema ram. Las políticas filtran por bucket_id, así
-- que no afectan a ningún otro bucket del proyecto.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('ram-media', 'ram-media', true)
on conflict (id) do update set public = true;

drop policy if exists p_ram_media_leer    on storage.objects;
drop policy if exists p_ram_media_subir   on storage.objects;
drop policy if exists p_ram_media_cambiar on storage.objects;
drop policy if exists p_ram_media_borrar  on storage.objects;

create policy p_ram_media_leer on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'ram-media');

create policy p_ram_media_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ram-media' and ram.es_admin());

create policy p_ram_media_cambiar on storage.objects
  for update to authenticated
  using (bucket_id = 'ram-media' and ram.es_admin())
  with check (bucket_id = 'ram-media' and ram.es_admin());

create policy p_ram_media_borrar on storage.objects
  for delete to authenticated
  using (bucket_id = 'ram-media' and ram.es_admin());
