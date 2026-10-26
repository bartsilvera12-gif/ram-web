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
- **Disciplinas es un carrusel horizontal con flechas.** Se mueve con los
  botones de los costados, arrastrando o con el dedo, y **no toca el scroll
  vertical**: la página sigue de largo con normalidad. Antes retenía la página
  con `position: sticky` mientras las tarjetas se desplazaban, lo que
  interrumpía la navegación.
  Las flechas se atenúan en los extremos pero nunca se deshabilitan: un botón
  `disabled` no dispara `click`, y si el estado quedara desactualizado la
  navegación se bloquearía sin forma de recuperarla.
  El resumen y el "Ver disciplina" sólo aparecen al pasar el mouse; en táctil se
  ven siempre. Agregar o quitar disciplinas no requiere tocar nada.
- El contenedor raíz usa `overflow-x: clip` en vez de `hidden`. Recortan igual,
  pero `hidden` crea un contexto de scroll que trae efectos secundarios; queda
  `hidden` como declaración previa para Safari anterior a 16.

## Deploy en Hostinger (por Git)

hPanel → **Avanzado → Git**: apuntar al repo `bartsilvera12-gif/ram-web`, rama
`main`, directorio `public_html`.

Cada cambio es: editar, regenerar `index.html`, commit, push y desplegar desde
hPanel (o automático, segun el plan).

```bash
node scripts/build-index.mjs
git add -A && git commit -m "..." && git push
```

> `index.html` se genera pero **se commitea**: es lo que sirve el servidor.
> Si te olvidas de regenerarlo, el sitio queda con la version anterior aunque
> el `.dc.html` ya tenga los cambios.

### Lo que queda en el servidor

Git clona el repo completo, asi que en `public_html` van a estar tambien el
`.dc.html`, `scripts/`, `supabase/` con los `.sql` y el directorio `.git`.
El `.htaccess` bloquea todo eso por HTTP; las reglas van primero, antes incluso
del redirect a HTTPS, para que un pedido a `/.git/config` se corte ahi mismo.

**Comprobalo despues del primer deploy.** Las tres tienen que dar 403 o 404:

```
https://tudominio.com/supabase/instalar.sql
https://tudominio.com/.git/config
https://tudominio.com/RAM%20Martial%20Arts.dc.html
```

Si alguna devuelve el archivo, el `.htaccess` no se esta aplicando: revisa que
haya llegado a la raiz de `public_html` y que el plan permita `AllowOverride`.

### Actualizar el dominio en los metadatos

En `scripts/seo-head.html` todavia figura `https://rammartialarts.vercel.app/`
en `canonical` y `og:image`. Cambialo por el dominio real y corre
`node scripts/build-index.mjs`. Hasta hacerlo, la vista previa al compartir el
link por WhatsApp no muestra la imagen.

## Pendientes

- Las imagenes del hero pesan ~2 MB cada una. Pasarlas a WebP mejoraria mucho la
  carga en movil, sobre todo con datos moviles.
