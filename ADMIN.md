# Panel de administración

El sitio toma su contenido de Supabase. Si Supabase no está configurado o no
responde, muestra el contenido que trae escrito, así que **nunca queda en
blanco**.

- Panel: `/admin/` (por ejemplo `https://tusitio.vercel.app/admin/`)
- Esquema de base: `ram` (no toca `public` ni ningún otro)
- Imágenes: bucket `ram-media` del Storage de Supabase

---

## Puesta en marcha

### 1. Crear el usuario administrador

En el panel de Supabase: **Authentication → Users → Add user**

- Email: `admin@ram.com`
- Contraseña: la que elijas
- Marcá **Auto Confirm User** (si no, no va a poder entrar)

> El SQL no crea este usuario a propósito. Insertar en `auth.users` a mano deja
> el registro mal formado y el login falla.

### 2. Correr el SQL

Pegá **`supabase/instalar.sql`** completo en el SQL Editor y ejecutalo.

Crea el esquema `ram` con sus siete tablas, las políticas de seguridad, el
bucket `ram-media` y carga el contenido actual del sitio como punto de partida.
Es idempotente: podés volver a correrlo sin duplicar nada ni pisar lo que hayas
editado.

Lo único que toca fuera de `ram` es el bucket de Storage y cuatro políticas
sobre `storage.objects`, todas filtradas por `bucket_id = 'ram-media'`. Es
imprescindible para poder subir imágenes y no afecta a ningún otro bucket.

### 3. Exponer el esquema `ram`

**Este paso es el que más se olvida y sin él nada funciona.** PostgREST solo
publica los esquemas que le indiques. En tu self-hosted, agregá `ram` a la
variable de entorno:

```
PGRST_DB_SCHEMAS=public,storage,graphql_public,ram
```

y reiniciá el servicio `rest`. Si falta, toda consulta responde **404** y el
panel te lo va a avisar con ese mismo mensaje.

### 4. Completar la conexión

Editá **`config.js`** en la raíz del repo:

```js
window.RAM_CONFIG = {
  SUPABASE_URL: 'https://supabase.tudominio.com',   // sin barra final
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  ...
};
```

La `anon key` es pública por diseño: lo que protege los datos es RLS, no
esconderla. Hacé commit y push, y Vercel redeploya.

---

## Qué se edita desde el panel

| Sección | Qué controla |
|---|---|
| **Disciplinas** | Imagen y descripción corta de la tarjeta, descripción larga, qué se entrena, para quién es, qué llevar, y qué instructores aparecen en cada una |
| **Horarios** | La tabla completa: agregar, editar, reordenar y borrar filas |
| **Por qué RAM** | Antetítulo, título, imagen y los seis bloques de texto |
| **Galería** | Subir fotos, marcar las **destacadas** (las 4 del inicio) y ordenar el resto |
| **Instructores** | Nombre, qué enseña, descripción y foto |
| **Configuración** | Imagen de portada, WhatsApp, correo, ubicación, Instagram y los textos de Sobre RAM |

El número de WhatsApp de Configuración alimenta **todos** los enlaces del sitio,
incluido el botón flotante.

---

## Cómo funciona por dentro

El sitio pide los datos a Supabase apenas carga y los deja en
`window.RAM_DATOS`. El componente escucha el evento `ram:datos` y vuelve a
dibujarse. Cada sección tiene su respaldo escrito en el propio HTML
(`Component.HORARIOS`, `Component.BENEFICIOS`, `Component.PROFES`,
`Component.DISC`, `Component.SHOTS`), que se usa cuando la consulta devuelve
vacío. Por eso una caída de Supabase no deja el sitio sin contenido.

Las imágenes pueden ser una URL del Storage o una ruta como `uploads/foto.jpeg`
(las que ya venían con el sitio). `Component.ruta()` resuelve ambas, así que
podés reemplazarlas de a poco.

### Al tocar el contenido

- **Horarios:** las filas de la tabla se generan de a cuatro celdas. El diseño
  de tarjetas en móvil depende de eso (`nth-child(4n+k)`), pero como ahora las
  genera un bucle, no hay nada que mantener a mano.
- **Galería:** conviene dejar exactamente **4 destacadas**. El panel te avisa
  cuántas hay. Con menos, el inicio muestra huecos; con más, solo salen las 4
  primeras.
- **Disciplinas:** el identificador (`slug`) no debería cambiarse una vez
  publicado, porque es lo que identifica a la disciplina al navegar.

### Cambiar la cuenta de administración

Está en dos lugares y tienen que coincidir:

1. La función `ram.es_admin()` en `supabase/instalar.sql`
2. `ADMIN_EMAIL` en `config.js`

---

## Si algo no anda

| Síntoma | Causa más probable |
|---|---|
| Todo responde **404** | Falta `ram` en `PGRST_DB_SCHEMAS`, o no reiniciaste `rest` |
| Entra pero no guarda | La cuenta no es la de `ram.es_admin()`, o RLS la está rechazando |
| No suben las imágenes | El bucket `ram-media` no existe, o el Storage no está expuesto |
| «Invalid login credentials» | El usuario no está confirmado (Auto Confirm) |
| El sitio muestra lo viejo | Supabase no responde y entró el respaldo. Mirá la consola del navegador |
