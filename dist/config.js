// ---------------------------------------------------------------------------
// Conexión a tu Supabase self-hosted.
// Completá estos dos valores y listo: el panel y el sitio público usan ambos
// este archivo.
//
// SUPABASE_URL  la URL pública de tu Supabase (la del API gateway / Kong),
//               sin barra final. Ej: https://supabase.tudominio.com
// SUPABASE_ANON_KEY  la anon key del proyecto. Es pública por diseño: lo que
//               protege los datos es RLS, no esconder esta clave.
//
// IMPORTANTE: el schema se llama "ram", no "public". Para que PostgREST lo
// exponga tenés que agregarlo a la variable de entorno de tu Supabase:
//
//     PGRST_DB_SCHEMAS=public,storage,graphql_public,ram
//
// y reiniciar el servicio rest. Sin eso, toda consulta responde 404.
// ---------------------------------------------------------------------------

window.RAM_CONFIG = {
  SUPABASE_URL: 'https://api.neura.com.py',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc0MTAxNDYxLCJleHAiOjE5MzE3ODE0NjF9.7_wAph8IolPMXtgfpezSwS5XR62IdD__qhqCywLDp3Q',

  // Schema y bucket: coinciden con supabase/instalar.sql
  SCHEMA: 'ram',
  BUCKET: 'ram-media',

  // La cuenta que puede entrar al panel. Tiene que ser la misma que figura en
  // la función ram.es_admin() del SQL.
  ADMIN_EMAIL: 'admin@ram.com'
};
