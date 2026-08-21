/* ============================================================================
   Adeorq · web/scripts/extraer-clientes.mjs
   LA CINTA DE CLIENTES DE LA PORTADA, SACADA DEL CODIGO DE LA APP.

   Escribir a mano «soporta 22 clientes» y una fila de logos es firmar una
   mentira con fecha: el dia que entre un CLI nuevo en `src/lib/providers.ts`,
   la portada seguira contando la historia de hoy. Asi que la cinta no se
   escribe, se GENERA:

     · `src/lib/providers.ts`            -> el id, el nombre y el color de cada
                                            cliente, tal cual los usa la app.
     · `src/components/ProviderMark.tsx` -> quien tiene dibujo propio y quien no.
     · `web/demo/marcas.svg`             -> el sprite con esos dibujos, que a su
                                            vez lo genera `extraer-marcas.mjs`.

   Y se incrusta entre dos marcadores del HTML de la portada, no en un fichero
   aparte que haya que traerse con `fetch`. Dos motivos, y los dos importan:

     1. El sprite tiene que estar DENTRO del documento que lo pinta. Codex,
        Copilot y Qwen se recortan con una <mask>, y `mask="url(#pm-codex)"` se
        resuelve siempre contra el documento actual: desde un fichero externo no
        encuentra la mascara, no recorta, y Codex sale como un cuadrado azul.
        Ya paso una vez en la maqueta y esta apuntado en `demo/sprites.js`.
     2. Los nombres de los clientes son CONTENIDO. Si los pinta JavaScript, los
        buscadores acaban viendolos, pero los asistentes que responden preguntas
        no ejecutan JavaScript y se van con las manos vacias. Esto es la regla
        del cruce con WebIndex: un reveal esconde por CSS algo que YA esta en el
        HTML, nunca decide en JS si el texto existe.

   Se lanza con:  node scripts/extraer-clientes.mjs
   ========================================================================= */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../..');
const WEB = resolve(AQUI, '..');

const PROVIDERS = resolve(RAIZ, 'src/lib/providers.ts');
const PROVIDERMARK = resolve(RAIZ, 'src/components/ProviderMark.tsx');
const SPRITE = resolve(WEB, 'demo/marcas.svg');
const PORTADA = resolve(WEB, 'index.html');   // la portada ES la raiz desde el 2026-08-20

const INICIO = '<!-- CLIENTES:INICIO';
const FIN = '<!-- CLIENTES:FIN -->';

/* --------------------------------------------------------------------------
   1. LOS CLIENTES
   `PROVIDERS` es un array de objetos literales. Se corta por el `id:` de cada
   uno y se lee dentro de su trozo, en vez de con un solo regex que cruce todo
   el fichero: entre `label` y `hue` hay comentarios largos con comillas y
   codigo de ejemplo, y un `[\s\S]*?` glotón salta de un proveedor al siguiente
   sin avisar. Fue exactamente el fallo del extractor de marcas.
   -------------------------------------------------------------------------- */

function leerClientes() {
  const src = readFileSync(PROVIDERS, 'utf8');
  const i = src.indexOf('export const PROVIDERS');
  if (i < 0) throw new Error('no encuentro `export const PROVIDERS` en providers.ts');
  const cuerpo = src.slice(i);

  // Las aperturas de cada ficha: `    id: "claude",` con cuatro espacios, que
  // es el nivel del array. Con menos indentación seria la interfaz de arriba.
  const marcas = [...cuerpo.matchAll(/^ {4}id: "([a-z0-9]+)",$/gm)];
  if (!marcas.length) throw new Error('providers.ts no tiene ninguna ficha con `    id: "..."`');

  return marcas.map((m, k) => {
    const desde = m.index;
    const hasta = k + 1 < marcas.length ? marcas[k + 1].index : cuerpo.length;
    const trozo = cuerpo.slice(desde, hasta);
    const label = trozo.match(/^ {4}label: "([^"]+)",$/m);
    const hue = trozo.match(/^ {4}hue: "(#[0-9a-fA-F]{3,8})",$/m);
    if (!label) throw new Error(`el cliente "${m[1]}" no tiene label`);
    return { id: m[1], label: label[1], hue: hue ? hue[1] : null };
  });
}

/* --------------------------------------------------------------------------
   2. QUIEN TIENE DIBUJO
   Las claves de `MARCAS` en ProviderMark.tsx. Unas reciben el `uid` de la
   mascara y otras no (`claude: () =>` frente a `codex: (uid) =>`), asi que el
   patron admite las dos formas.
   -------------------------------------------------------------------------- */

function leerConMarca() {
  const src = readFileSync(PROVIDERMARK, 'utf8');
  const i = src.indexOf('const MARCAS');
  if (i < 0) throw new Error('no encuentro `const MARCAS` en ProviderMark.tsx');
  const cuerpo = src.slice(i, src.indexOf('\nexport function tieneMarca', i));
  return new Set([...cuerpo.matchAll(/^ {2}([a-z0-9]+): \((?:uid)?\) =>/gm)].map(m => m[1]));
}

/* --------------------------------------------------------------------------
   3. EL SPRITE
   Se pega tal cual, sin su cabecera de comentario: en el HTML de la portada ya
   se explica de donde sale y el comentario son 900 bytes en cada visita.
   -------------------------------------------------------------------------- */

function simbolosDelSprite() {
  const src = readFileSync(SPRITE, 'utf8');
  return new Set([...src.matchAll(/<symbol id="m-([a-z0-9]+)"/g)].map(m => m[1]));
}

function leerSprite() {
  const src = readFileSync(SPRITE, 'utf8');
  // Por el `<svg xmlns`, no por el primer `<svg`: la cabecera del sprite es un
  // comentario que TRAE un ejemplo de uso (`<svg class="prov-mark">...`), y
  // cortar por ahi dejaba la segunda mitad del comentario suelta en el HTML,
  // sin el `<!--` que la abria, o sea escrita en la pagina.
  const i = src.indexOf('<svg xmlns');
  if (i < 0) throw new Error('marcas.svg no tiene un <svg xmlns>');
  const svg = src.slice(i).trimEnd();
  if (svg.includes('-->')) throw new Error('el sprite arrastra un comentario: el corte esta mal');
  return svg;
}

/* --------------------------------------------------------------------------
   4. EL HTML
   -------------------------------------------------------------------------- */

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Las iniciales de quien no tiene dibujo. Dos letras, y por este orden:
   las de sus dos palabras (Kimi Code -> KC), las de su mayuscula interna
   (CodeWhale -> CW), o las dos primeras. Si esas dos ya las gasto otro, se
   coge primera y ultima, que es lo unico que no vuelve a chocar: Codebuff y
   Cody dan los dos «Co», y dos chapas iguales en la misma fila no dicen nada. */
function siglaDe(label, gastadas) {
  const palabras = label.split(/[\s.-]+/).filter(Boolean);
  let s = null;
  if (palabras.length > 1) s = palabras[0][0] + palabras[1][0];
  else {
    const may = label.slice(1).match(/[A-Z]/);
    s = may ? label[0] + may[0] : label.slice(0, 2);
  }
  s = s[0].toUpperCase() + s[1].toLowerCase();
  if (gastadas.has(s)) s = (label[0] + label[label.length - 1]).replace(/^./, m => m.toUpperCase());
  gastadas.add(s);
  return s;
}

function pieza(c, gastadas) {
  const color = c.hue ? ` style="--cli: ${c.hue}"` : '';
  const dibujo = c.marca
    ? `<svg class="cli__marca prov-mark" viewBox="0 0 24 24" aria-hidden="true"><use href="#m-${c.id}"/></svg>`
    : `<span class="cli__sigla" aria-hidden="true">${esc(siglaDe(c.label, gastadas))}</span>`;
  return `        <li class="cli"${color}>${dibujo}<span>${esc(c.label)}</span></li>`;
}

function construir() {
  const todos = leerClientes();
  const conMarca = leerConMarca();
  const enSprite = simbolosDelSprite();

  /* La verdad de lo que se puede PINTAR es el sprite, no ProviderMark.tsx: el
     sprite se genera aparte con extraer-marcas.mjs y puede haberse quedado
     atras. Paso justo aqui: Grok tenia dibujo en el componente y el sprite no
     lo traia, asi que la cinta salia con un hueco donde iba su logo. Se cruza
     con los dos y se avisa, que un aviso cuesta menos que descubrirlo en una
     captura. */
  const rezagados = [...conMarca].filter(id => !enSprite.has(id));
  if (rezagados.length) {
    console.warn(
      `⚠ el sprite no trae ${rezagados.join(', ')}: lanza antes ` +
      'scripts/extraer-marcas.mjs'
    );
  }

  // Todos, sin «y N mas» (Munir, 2026-08-20): la cinta es la lista entera de
  // lo que Adeorq sabe abrir, y un contador escondiendo a doce de ellos hacia
  // parecer que soporta menos de lo que soporta. Los que tienen dibujo van
  // delante porque son los que se reconocen de lejos.
  const conDibujo = todos.filter(c => conMarca.has(c.id) && enSprite.has(c.id));
  const sinDibujo = todos.filter(c => !(conMarca.has(c.id) && enSprite.has(c.id)));
  const lista = [...conDibujo, ...sinDibujo].map(c => ({
    ...c, marca: conMarca.has(c.id) && enSprite.has(c.id),
  }));

  if (conDibujo.length < 5) throw new Error(`solo ${conDibujo.length} clientes con dibujo: algo se ha roto al leer`);
  if (lista.length !== todos.length) throw new Error('la cinta no lleva a todos los clientes');

  // El grupo se escribe DOS veces: la pista se desplaza justo la mitad de su
  // ancho, y en ese momento la segunda copia esta exactamente donde empezo la
  // primera, asi que la vuelta no se ve. Las siglas se reparten UNA vez y las
  // dos copias llevan las mismas, o en la segunda vuelta cambiarian las letras.
  const gastadas = new Set();
  const grupo = lista.map(c => pieza(c, gastadas)).join("\n");

  return [
    `${INICIO} · generado por scripts/extraer-clientes.mjs, no editar a mano.`,
    `     ${todos.length} clientes en src/lib/providers.ts, ${conDibujo.length} con dibujo propio.`,
    `     El sprite va aquí dentro y no en un fichero aparte porque Codex, Copilot`,
    `     y Qwen se recortan con una <mask>, y una máscara solo se resuelve contra`,
    `     el documento que la pinta. -->`,
    leerSprite(),
    `<section class="cinta" id="cinta" aria-labelledby="cinta-tit">`,
    `  <div class="cinta__caja">`,
    `    <p class="cinta__rotulo" id="cinta-tit">`,
    `      Los <b>${todos.length} clientes</b><br>que sabe abrir`,
    `    </p>`,
    `    <div class="cinta__ventana">`,
    `      <div class="cinta__pista">`,
    `        <ul class="cinta__grupo">`,
    grupo,
    `        </ul>`,
    `        <ul class="cinta__grupo" aria-hidden="true" data-copia>`,
    grupo,
    `        </ul>`,
    `      </div>`,
    `    </div>`,
    `  </div>`,
    `  <!-- Obligatorio, y no es tramite: los logos de arriba son MARCAS`,
    `       REGISTRADAS de sus titulares. Nada puede insinuar patrocinio, y la`,
    `       frase de producto es siempre «funciona con TU cuenta», nunca «te damos`,
    `       acceso a». Está en AGENTS.md como condición para poder vender Adeorq. -->`,
    `  <p class="cinta__legal">`,
    `    Todas son marcas de sus titulares. Adeorq no está afiliado a ninguna ni`,
    `    revende su acceso: funciona con la sesión que ya tienes en tu equipo.`,
    `  </p>`,
    `</section>`,
    FIN,
  ].join('\n');
}

/* --------------------------------------------------------------------------
   5. AL HTML
   -------------------------------------------------------------------------- */

const html = readFileSync(PORTADA, 'utf8');
const i = html.indexOf(INICIO);
const j = html.indexOf(FIN);
if (i < 0 || j < 0) {
  throw new Error(`portada/index.html no tiene los marcadores ${INICIO} ... ${FIN}`);
}

const bloque = construir();
// El HTML de la portada está en LF; el bloque se escribe igual para no dejar
// el fichero con las dos clases de salto de línea mezcladas.
const salida = html.slice(0, i) + bloque + html.slice(j + FIN.length);
writeFileSync(PORTADA, salida);

console.log(`cinta -> ${(bloque.match(/<li class="cli"/g) || []).length / 2} logos, ${bloque.length} bytes en el HTML`);
