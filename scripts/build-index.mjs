// Genera index.html (lo que se publica) a partir del .dc.html (fuente editable)
// inyectando el bloque SEO de scripts/seo-head.html en el <head>.
// Uso: node scripts/build-index.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const SOURCE = readdirSync('.').find((f) => f.endsWith('.dc.html'));
if (!SOURCE) throw new Error('No se encontró ningún archivo .dc.html en la raíz.');

const ANCHOR = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const src = readFileSync(SOURCE, 'utf8');
if (!src.includes(ANCHOR)) throw new Error(`No se encontró el <meta viewport> en ${SOURCE}.`);

const head = readFileSync('scripts/seo-head.html', 'utf8').trimEnd();
writeFileSync('index.html', src.replace(ANCHOR, `${ANCHOR}\n${head}`), 'utf8');
console.log(`index.html generado desde "${SOURCE}".`);
