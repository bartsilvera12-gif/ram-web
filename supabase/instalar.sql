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

-- Triggers de actualizado_en
do $blk$
declare t text;
begin
  foreach t in array array['disciplinas','instructores','horarios','galeria','beneficios','ajustes']
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
                           'horarios','galeria','beneficios','ajustes']
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


-- ============================================================================
-- SEMILLA: el contenido que hoy esta escrito a mano en el sitio.
-- Solo corre la primera vez. Si ya editaste desde el panel, no pisa nada.
-- ============================================================================

do $seed$
begin
if not exists (select 1 from ram.disciplinas) then
insert into ram.disciplinas
  (slug, orden, kicker, titulo, resumen, img, lore, puntos, para_quien, equipo)
values
  ('bjj', 10, 'Gi · Kimono', 'Brazilian Jiu-Jitsu', 'Base técnica, control de posiciones y sumisiones. El corazón de la academia.', 'uploads/_MG_6990.JPG.jpeg', array['El Brazilian Jiu-Jitsu es el arte del control: en lugar de responder a la fuerza con fuerza, usa palancas, ángulos y peso corporal para dominar al oponente desde el suelo. Por eso una persona más chica puede controlar a una más grande.', 'Se entrena con kimono (gi), que agrega agarres y estrategia: cada solapa y cada manga es una herramienta. Las clases arrancan con movilidad, siguen con técnica del día y cierran con rolling — sparring controlado donde aplicás lo aprendido.', 'Es la disciplina con progresión más clara de la academia: grados, cinturones y objetivos concretos clase a clase.'], array['Guardias, pasajes y control de posiciones', 'Sumisiones y defensas desde cada posición', 'Rolling progresivo según tu nivel', 'Preparación para competencia (opcional)'], 'Desde cero hasta competidores. Jóvenes y adultos, sin experiencia previa necesaria.', 'Ropa cómoda para tu primera clase. Luego, kimono (te ayudamos a conseguirlo).'),
  ('nogi', 20, 'No-Gi', 'Grappling sin kimono', 'Ritmo más alto, transiciones rápidas y lucha aplicada al combate real.', 'uploads/_MG_7043.JPG.jpeg', array['El no-gi es jiu-jitsu sin kimono: sin agarres de tela, todo depende del control de cuerpo, la presión y la velocidad de transición. El ritmo es más alto y las posiciones cambian todo el tiempo.', 'Es la puerta de entrada natural al grappling moderno y la base de la lucha dentro del MMA. Se entrena con rashguard y calza o short.', 'Muchos alumnos combinan gi y no-gi: uno afina la técnica y la paciencia, el otro el timing y la explosividad.'], array['Control de cuerpo y presión sin agarres de tela', 'Derribos y lucha de pie', 'Leg locks y sumisiones de no-gi', 'Transiciones rápidas y scrambles'], 'Alumnos de BJJ que quieren sumar ritmo y quienes vienen de lucha o MMA.', 'Rashguard y calza o short deportivo sin bolsillos ni cierres.'),
  ('mma', 30, 'MMA · Artes marciales mixtas', 'Artes marciales mixtas', 'Golpeo, derribos y suelo integrados en un mismo sistema.', 'uploads/_MG_7102.JPG.jpeg', array['El MMA integra las tres distancias del combate: golpeo de pie, clinch y derribos, y lucha en el suelo. En la academia se enseña por bloques, para que cada alumno construya la base antes de combinarla.', 'Las clases trabajan técnica con guanteletas, pads y escudos, más drills de transición entre distancias. El sparring es progresivo, con equipo completo y siempre supervisado.', 'No hace falta querer competir: la mayoría entrena MMA por estado físico, coordinación y defensa personal real.'], array['Golpeo con puños, codos, rodillas y patadas', 'Clinch, derribos y defensa de derribos', 'Ground and pound y control desde arriba', 'Sparring progresivo con equipo completo'], 'Jóvenes y adultos con alguna base física. Ideal si querés entrenar completo.', 'Short, rashguard, bucal y vendas. Guantes y canilleras se pueden alquilar.'),
  ('kick', 40, 'Kick Boxing · Boxeo', 'Kick boxing y boxeo', 'Golpeo con guantes, juego de piernas y acondicionamiento por rondas.', 'uploads/IMG_9774.jpg.jpeg', array['El boxeo construye la base de todo golpeo: guardia, distancia, juego de piernas y la capacidad de leer al oponente. El kick boxing suma patadas y rodillas, ampliando el rango y el trabajo de cadera.', 'Las clases se estructuran en rondas: calentamiento, técnica en pads o bolsa, combinaciones y acondicionamiento final. Es la disciplina más directa para bajar grasa y mejorar el cardio.', 'Podés entrenarlo sin nunca subir al ring: el sparring es opcional y siempre controlado.'], array['Guardia, desplazamientos y distancia', 'Combinaciones en pads y bolsa', 'Patadas, rodillas y trabajo de clinch', 'Acondicionamiento por rondas'], 'Cualquier nivel y edad desde adolescentes. No se requiere experiencia.', 'Ropa deportiva, vendas y bucal. Guantes disponibles en la academia.'),
  ('kids', 50, 'Niños y jóvenes', 'Niños y adolescentes', 'Coordinación, respeto y confianza. Clases por edad, con juego y estructura.', 'uploads/IMG_6244.JPG.jpeg', array['El programa infantil usa el jiu-jitsu como herramienta educativa: los chicos aprenden a cuidar al compañero, esperar su turno, perder sin frustrarse y volver a intentar.', 'Las clases se dividen por edad y por tamaño, combinando juegos de movimiento con técnica real. Trabajan coordinación, equilibrio y fuerza relativa sin cargas.', 'A medida que crecen, el juego cede lugar a la técnica y a los grados, con graduaciones que marcan el progreso de cada alumno.'], array['Juegos de movimiento y coordinación', 'Técnica de jiu-jitsu adaptada por edad', 'Rutinas de respeto, turnos y disciplina', 'Graduaciones y seguimiento individual'], 'Niños y adolescentes, divididos por edad y contextura.', 'Ropa cómoda la primera clase; después kimono. Pelo recogido y uñas cortas.'),
  ('empresas', 60, 'Empresas', 'Cursos y talleres para empresas', 'Programas cerrados de defensa personal y actividad física para equipos.', 'uploads/_MG_7086 (1).JPG.jpeg', array['Armamos programas a medida para empresas: talleres de defensa personal, jornadas de actividad física y ciclos de entrenamiento para equipos, en la academia o en tu propio espacio.', 'Cada programa se diseña según el objetivo —bienestar, integración del equipo o seguridad personal— y se ajusta a la cantidad de participantes y a la disponibilidad horaria.', 'Incluye instructores, equipamiento y material para los participantes.'], array['Talleres de defensa personal práctica', 'Jornadas de actividad física e integración', 'Ciclos de entrenamiento para equipos', 'Opción en la academia o en tu empresa'], 'Empresas, instituciones y grupos cerrados de cualquier tamaño.', 'Nosotros llevamos el equipamiento; los participantes solo necesitan ropa cómoda.')
on conflict (slug) do nothing;

insert into ram.galeria (orden, img, alt, destacada)
values
  (10, 'uploads/PHOTO-2026-08-04-11-49-13.jpg.jpeg', 'Clase de niños en RAM', false),
  (20, 'uploads/IMG_9774.jpg.jpeg', 'Equipo de MMA de RAM', true),
  (30, 'uploads/_MG_6913 (1).JPG.jpeg', 'Alumna de la clase infantil', false),
  (40, 'uploads/_MG_6948.JPG.jpeg', 'Kimono en el tatami', false),
  (50, 'uploads/8adb4671-70b9-481f-aa99-38f197ec3e39.JPG.jpeg', 'Clase femenina de jiu-jitsu', false),
  (60, 'uploads/_MG_7102.JPG.jpeg', 'Práctica de lucha de pie', true),
  (70, 'uploads/_MG_6990.JPG.jpeg', 'Rolling de jiu-jitsu con kimono', true),
  (80, 'uploads/IMG_6243.JPG.jpeg', 'Instructora con la clase de los más chicos', false),
  (90, 'uploads/IMG_6244.JPG.jpeg', 'Clase infantil en el tatami', false),
  (100, 'uploads/WhatsApp Image 2026-08-10 at 07.54.29.jpeg', 'Alumnos de RAM Martial Arts', false),
  (110, 'uploads/_MG_6910.JPG.jpeg', 'Entrenamiento en el tatami', false),
  (120, 'uploads/_MG_6963 (1).JPG.jpeg', 'Técnica de guardia', false),
  (130, 'uploads/_MG_7013.JPG.jpeg', 'Sparring de jiu-jitsu', false),
  (140, 'uploads/_MG_7018.JPG.jpeg', 'Equipo RAM Martial Arts', false),
  (150, 'uploads/_MG_7022.JPG.jpeg', 'Entrenamiento guiado', false),
  (160, 'uploads/_MG_7043.JPG.jpeg', 'Pasaje de guardia', false),
  (170, 'uploads/_MG_7086 (1).JPG.jpeg', 'Control de posición', true),
  (180, 'uploads/_MG_7103.JPG.jpeg', 'Proyección en el tatami', false),
  (190, 'uploads/_MG_7125 (1).JPG.jpeg', 'Clase de adultos', false),
  (200, 'uploads/_MG_7132 (1).JPG.jpeg', 'Entrenamiento de RAM Martial Arts', false);

insert into ram.horarios (orden, clase, dias, hora, nivel) values
  (10, 'BJJ Adultos', 'Lun · Mié · Vie', '19:00 – 20:30', 'Todos'),
  (20, 'BJJ Principiantes', 'Mar · Jue', '19:00 – 20:00', 'Inicial'),
  (30, 'No-Gi', 'Mar · Jue', '20:00 – 21:30', 'Intermedio'),
  (40, 'Artes marciales / MMA', 'Lun · Mié', '20:30 – 22:00', 'Avanzado'),
  (50, 'Kids 4–8', 'Mar · Jue', '17:00 – 17:45', 'Infantil'),
  (60, 'Kids 9–14', 'Mar · Jue', '18:00 – 19:00', 'Juvenil');

insert into ram.beneficios (orden, titulo, texto) values
  (10, 'Técnica real', 'Nada de coreografía: posiciones que funcionan bajo presión, enseñadas paso a paso.'),
  (20, 'Estado físico', 'Fuerza funcional, movilidad y resistencia, sin pasar horas mirando el reloj del gimnasio.'),
  (30, 'Defensa personal', 'Saber controlar una situación y salir de ella. Confianza que se nota afuera del tatami.'),
  (40, 'Cabeza fría', 'Disciplina mental, manejo de la frustración y foco. El jiu-jitsu enseña a perder bien.'),
  (50, 'Acompañamiento', 'Instructores que te conocen por nombre y corrigen tu progreso, clase a clase.'),
  (60, 'Comunidad', 'Gente que te espera para entrenar. La razón número uno por la que nadie abandona.');

insert into ram.instructores (orden, nombre, ensena, bio, img) values
  (10, 'Clases de adultos', 'Brazilian Jiu-Jitsu · Gi y No-Gi', 'Corrección técnica alumno por alumno, con progresión clara desde principiantes hasta competencia.', 'uploads/_MG_7022.JPG.jpeg'),
  (20, 'Programa infantil', 'Kids · 4 a 14 años', 'Clases por edad: juego, coordinación, respeto y técnica, con seguimiento y graduaciones.', 'uploads/_MG_7103.JPG.jpeg'),
  (30, 'Artes marciales y defensa personal', 'Striking · Acondicionamiento', 'Golpeo, defensa personal y trabajo físico aplicado, siempre con equipo y supervisión.', 'uploads/_MG_7043.JPG.jpeg');

end if;
end $seed$;

-- Los ajustes se insertan siempre: on conflict los vuelve idempotentes y asi
-- una clave nueva aparece aunque el resto de la semilla ya se haya corrido.
insert into ram.ajustes (clave, valor, descripcion) values
  ('hero_img', 'uploads/_MG_7132 (1).JPG.jpeg', 'Imagen de portada del inicio'),
  ('whatsapp', '595981105384', 'Numero de WhatsApp con codigo de pais, solo digitos. Tambien lo usa el boton flotante.'),
  ('whatsapp_visible', '(0981) 105-384', 'Como se muestra el numero en pantalla'),
  ('email', 'ram.romero81@gmail.com', 'Correo de contacto'),
  ('instagram_usuario', '@rammartial', 'Usuario de Instagram como se muestra'),
  ('instagram_url', 'https://www.instagram.com/rammartial', 'Enlace a Instagram'),
  ('direccion', 'Sucre 1124 entre Bulnes y Mautín · Villa Morra, Asunción', 'Ubicacion de la academia'),
  ('porque_kicker', 'Por qué RAM', 'Antetitulo de la seccion Por que RAM'),
  ('porque_titulo', 'Lo que te llevás del tatami', 'Titulo de la seccion Por que RAM'),
  ('porque_img', 'uploads/_MG_7043.JPG.jpeg', 'Imagen de la seccion Por que RAM'),
  ('nosotros_img', 'uploads/_MG_7018.JPG.jpeg', 'Imagen de la seccion Sobre RAM'),
  ('nosotros_p1', 'RAM Martial Arts nació con una idea simple: enseñar artes marciales de verdad, con método, seguridad y acompañamiento real. Cada clase tiene estructura — calentamiento, técnica, drills y práctica — para que progreses sin importar desde dónde arranques.', 'Primer parrafo de Sobre RAM'),
  ('nosotros_p2', 'Trabajamos con niños, adolescentes y adultos. Desde el primer día estás en el tatami, con instructores que corrigen y compañeros que cuidan.', 'Segundo parrafo de Sobre RAM')
on conflict (clave) do nothing;
