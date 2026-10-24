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

El bloque de `<title>`, descripción y Open Graph vive en `scripts/seo-head.html`.

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
