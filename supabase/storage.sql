-- ============================================================================
-- Solo la parte de Storage de instalar.sql.
--
-- Correr esto si el panel no puede subir imágenes y
--   select id from storage.buckets where id = 'ram-media';
-- no devuelve nada.
--
-- Si falla por permisos, creá el bucket a mano desde el panel de Supabase
-- (Storage → New bucket → nombre: ram-media → marcá "Public bucket") y después
-- volvé a correr solo la parte de políticas de más abajo.
--
-- Todo acá está filtrado por bucket_id = 'ram-media': no afecta a ningún otro
-- bucket del proyecto.
-- ============================================================================

-- 1. El bucket
insert into storage.buckets (id, name, public)
values ('ram-media', 'ram-media', true)
on conflict (id) do update set public = true;

-- 2. Las políticas
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

-- 3. Comprobación: tiene que devolver una fila
select id, public from storage.buckets where id = 'ram-media';
