# Deploy en Hostinger — RAM Martial Arts

Sitio estático. No necesita build ni dependencias: `support.js` carga React y Babel
desde unpkg en el navegador.

## Qué se publica

| Archivo | Rol |
|---|---|
| `index.html` | Página publicada (**generada**, no la edites a mano) |
| `RAM Martial Arts.dc.html` | Fuente editable del Design Composer |
| `support.js` | Runtime que interpreta el `.dc.html` |
| `uploads/` | Imágenes |
| `.htaccess` | Cache, HTTPS, headers de seguridad y archivos que no se publican |
| `config.js` | Conexion a Supabase (la usan el sitio y el panel) |
| `admin/` | Panel de administracion, en /admin |
| `supabase/instalar.sql` | Schema `ram` + contenido inicial, para el SQL Editor |
| `robots.txt` | Indexación abierta |

En Hostinger se sube toda la carpeta, asi que es el `.htaccess` el que bloquea
el `.dc.html`, `scripts/`, `supabase/`, los `.md` y los archivos ocultos.

El contenido editable (disciplinas, horarios, galeria, instructores, textos y
datos de contacto) vive en Supabase y se administra desde `/admin/`.
Ver **[ADMIN.md](ADMIN.md)** para la puesta en marcha. Si Supabase no esta
configurado o no responde, el sitio usa el contenido escrito en el HTML.

## Flujo de edición

Editá siempre `RAM Martial Arts.dc.html` y después regenerá la página publicada:

```bash
node scripts/build-index.mjs
```

`scripts/seo-head.html` contiene el bloque de `<title>`, descripción y Open Graph,
y también el script del menú móvil (va en el `<head>` real porque el runtime no
ejecuta los `<script>` que se declaran dentro de `<helmet>`).

## Responsive

El sitio usa estilos inline, así que la capa responsive vive en el `<style>` del
`<helmet>`, al final del bloque, y usa `!important` para poder sobrescribirlos.
Los elementos que necesitan adaptarse están marcados con atributos `data-ram`
y `data-ram-grid`, en vez de depender del texto del `style` inline.

Breakpoints: **1024px** (tablet), **860px** (pasa a menú hamburguesa), **760px**
(móvil) y **420px** (móvil chico).

Decisiones que conviene conocer antes de editar:

- La tabla de horarios se convierte en una tarjeta por clase debajo de 860px.
  El grid son 28 celdas sueltas (1 fila de encabezados + 6 de datos) sin
  contenedor por fila, así que las tarjetas se arman con `nth-child(4n+k)`:
  los encabezados se ocultan y vuelven como etiqueta de cada dato vía `::before`.
  **Si agregás o quitás clases, mantené las filas de 4 celdas**, o la cuenta se
  desalinea y las etiquetas quedan en el dato equivocado.
- Debajo de 860px se anula el `transform` de las animaciones de entrada. Varias
  desplazan hasta 44px en horizontal y empujaban el contenido fuera de pantalla.
  El fundido de opacidad se mantiene.
- El degradado del hero es horizontal en escritorio y vertical en móvil, porque
  el texto pasa de estar a la izquierda a ocupar todo el ancho.
- **Disciplinas es un carrusel horizontal guiado por el scroll.** Arriba de
  860px la sección se queda pegada y las tarjetas se desplazan de costado
  mientras bajás; debajo de 860px es un desplazamiento lateral normal con snap.
  El alto de `[data-ram="dx"]` lo calcula el script a partir del ancho real del
  track, así que **agregar o quitar disciplinas no requiere tocar nada**.
  El resumen y el "Ver disciplina" sólo aparecen al pasar el mouse; en táctil se
  ven siempre.
- El contenedor raíz usa `overflow-x: clip` en vez de `hidden`. Son equivalentes
  para recortar, pero `hidden` crea un contexto de scroll que rompe
  `position: sticky`, y el carrusel depende de sticky. Queda `hidden` como
  declaración previa para Safari anterior a 16, donde el carrusel simplemente no
  se desplaza y las tarjetas se ven en fila.

## Subir a Hostinger

Lo que va al servidor es **solo** esto, en la raiz de `public_html`:

```
public_html/
  .htaccess
  index.html
  config.js
  support.js
  robots.txt
  admin/        (index.html y app.js)
  uploads/      (las fotos)
```

No subas `RAM Martial Arts.dc.html`, `scripts/`, `supabase/` ni los `.md`.
Si igual se suben, el `.htaccess` los bloquea, pero es mejor que no esten.

**Opcion A — File Manager (lo mas simple)**

1. hPanel → **Administrador de archivos** → entrar a `public_html`
2. Subir el ZIP y usar **Extraer**
3. Confirmar que `.htaccess` quedo en la raiz. El File Manager oculta los
   archivos que empiezan con punto: activá **Mostrar archivos ocultos**

**Opcion B — FTP**

Datos en hPanel → **Archivos → Cuentas FTP**. Subir con FileZilla a
`public_html`, en modo binario.

**Opcion C — Git**

Si el plan lo incluye: hPanel → **Avanzado → Git**, apuntar al repo y desplegar.
Ojo que esto sube tambien los archivos que no hacen falta; el `.htaccess` los
bloquea igual.

## Despues de subir

1. **Verificar que el `.htaccess` se aplica.** Abrir
   `https://tudominio.com/supabase/instalar.sql` — tiene que dar **404**.
   Si descarga el archivo, el `.htaccess` no se subio o Apache lo esta ignorando.
2. **Revisar el panel** en `https://tudominio.com/admin/`.
3. **Actualizar el dominio en los metadatos.** En `scripts/seo-head.html` figura
   `https://rammartialarts.vercel.app/` en `canonical` y `og:image`. Cambialo por
   el dominio real, corré `node scripts/build-index.mjs` y volvé a subir
   `index.html`. Hasta hacerlo, la vista previa al compartir por WhatsApp falla.

## Pendientes

- Las imagenes del hero pesan ~2 MB cada una. Pasarlas a WebP mejoraria mucho la
  carga en movil, sobre todo con datos moviles.
