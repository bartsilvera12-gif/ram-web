# Deploy en Vercel — RAM Martial Arts

Sitio estático. No necesita build ni dependencias: `support.js` carga React y Babel
desde unpkg en el navegador.

## Qué se publica

| Archivo | Rol |
|---|---|
| `index.html` | Página publicada (**generada**, no la edites a mano) |
| `RAM Martial Arts.dc.html` | Fuente editable del Design Composer |
| `support.js` | Runtime que interpreta el `.dc.html` |
| `uploads/` | Imágenes |
| `vercel.json` | Cache de assets + headers de seguridad |
| `robots.txt` | Indexación abierta |

`.vercelignore` excluye del deploy el `.dc.html`, `scripts/`, `.thumbnail` y este archivo.

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

## Subir

**Opción A — Git (recomendado, deploy automático en cada push):**

```bash
git init && git add . && git commit -m "Sitio RAM Martial Arts"
```

Creá el repo en GitHub, hacé push, y en vercel.com → **Add New → Project** importalo.
En Framework Preset elegí **Other** y dejá Build Command y Output Directory vacíos.

**Opción B — CLI:**

```bash
npx vercel --prod
```

## Pendiente después del primer deploy

1. **Reemplazá el dominio placeholder.** En `scripts/seo-head.html` figura
   `https://rammartialarts.vercel.app/` en `canonical` y `og:image`. Cambialo por tu
   dominio real y volvé a correr `node scripts/build-index.mjs`. Hasta hacerlo, la
   vista previa al compartir por WhatsApp puede fallar.
2. **Peso de `uploads/`: 44 MB, de los cuales solo ~17 MB se usan.** Hay 32 archivos
   duplicados (los que terminan en `(1)`) que el sitio no referencia. Borrarlos acelera
   el deploy y la carga.
3. Las imágenes del hero pesan ~2 MB cada una. Comprimirlas a WebP mejoraría mucho el
   tiempo de carga en móvil.
