/* ============================================================================
   Adeorq · web/scripts/fotos-estilos.mjs

   Las fotos de los cuatro estilos (Ajustes › Aspecto › Estilo) para los README,
   la portada y la imagen del enlace: `assets/screens/<idioma>/style-*.png`.

   Salen de la demostración de la portada (`demo/`), que es el DOM de la app de
   verdad volcado sobre el taller de demostración, con las sesiones grabadas en
   sus terminales. Encima se pone la hoja de los estilos tal cual la carga la app
   (`src/estilos/42-aspectos.css`) y `<html data-aspecto>`, como hace
   `lib/aspecto.ts`. Así una foto en Terminal enseña lo mismo que la app en
   Terminal sin montar la casa de pruebas, y se rehace con un comando cuando
   cambia la hoja.

   Los tres lisos van con Contraste, el tema de fábrica; el Cristal, con Azul
   noche y la foto de la demostración, como abre la demo.

   Necesita playwright-core, que NO es dependencia de este repo (lo mismo que
   `hacer-tarjeta-social.mjs`), y ffmpeg en el PATH para comprimirlas como las
   demás de `assets/screens` (si no está, las deja sin comprimir y lo dice):

     PLAYWRIGHT_CORE=C:/proyectos/Orquio/web/node_modules/playwright-core \
       node scripts/fotos-estilos.mjs

   Va a 1920 x 1080 a doble escala (3840 x 2160), como las del equipo de capturas.
   ========================================================================= */

import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(AQUI, '..');
const HOJA = readFileSync(resolve(WEB, '../src/estilos/42-aspectos.css'), 'utf8');

/* El aro de los tres estados (`05-cabina.css`) llegó después del volcado de la
   demo (0.9.260): sin él, el «terminó» salía sin color en los tres lisos y en
   naranja en el Cristal. Se pone encima igual que la hoja de los estilos: su
   tramo de `05-cabina.css` tal cual y los tres colores oscuros de `01-base.css`. */
function trozo(texto, desde, hasta) {
  const i = texto.indexOf(desde);
  const j = i < 0 ? -1 : texto.indexOf(hasta, i);
  if (j < 0) throw new Error(`No encuentro «${desde}» en la hoja: ¿cambió 05-cabina.css?`);
  return texto.slice(i, j);
}
const CABINA = readFileSync(resolve(WEB, '../src/estilos/05-cabina.css'), 'utf8');
const BASE = readFileSync(resolve(WEB, '../src/estilos/01-base.css'), 'utf8');
const ARO = `:root{${['necesita', 'termino', 'trabaja'].map((e) => BASE.match(new RegExp(`--estado-${e}:[^;]+;`))[0]).join('')}}
${trozo(CABINA, '/* ── Alrededor de una terminal, tres estados', '.pane-hidden {')}
/* Quieto, para que la foto salga igual cada vez. */
.pane[data-estado="trabaja"] > .pane-aro > i { animation-play-state: paused; animation-delay: -0.6s; }`;

const BRAVE = process.env.BRAVE || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';

/** [estilo de la app, tema, nombre del archivo] */
const ESTILOS = [
  ['terminal', 'contraste', 'style-terminal'],
  ['consola', 'contraste', 'style-console'],
  ['liso', 'contraste', 'style-flat'],
  ['cristal', 'azul', 'style-glass'],
];

async function cargarChromium() {
  const intentos = ['playwright-core'];
  if (process.env.PLAYWRIGHT_CORE) {
    const raiz = process.env.PLAYWRIGHT_CORE.replace(/[\\/]+$/, '');
    intentos.unshift(pathToFileURL(resolve(raiz, 'index.mjs')).href);
  }
  for (const via of intentos) {
    try {
      return (await import(via)).chromium;
    } catch { /* se prueba el siguiente */ }
  }
  console.error('No encuentro playwright-core. No es dependencia de este repo.');
  console.error('Dime donde esta:  PLAYWRIGHT_CORE=C:/proyectos/Orquio/web/node_modules/playwright-core');
  process.exit(2);
}

/* La demo pide sus datos con fetch: hace falta servirla, no abrirla de disco. */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const servidor = createServer((req, res) => {
  let f = join(WEB, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!f.startsWith(WEB) || !existsSync(f)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const puerto = servidor.address().port;

const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const temporal = mkdtempSync(join(tmpdir(), 'adeorq-estilos-'));
const chromium = await cargarChromium();
const navegador = await chromium.launch({ executablePath: BRAVE, headless: true });
try {
  for (const idioma of ['es', 'en']) {
    for (const [estilo, tema, nombre] of ESTILOS) {
      const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: 'dark' });
      try {
        const page = await ctx.newPage();
        const fallos = [];
        page.on('pageerror', (e) => fallos.push(String(e)));
        await page.goto(`http://127.0.0.1:${puerto}/demo/?${idioma === 'en' ? 'lang=en&' : ''}vista=cabina`);
        await page.waitForFunction(() => !document.getElementById('root').hasAttribute('aria-busy'));
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(800);
        /* Sin transiciones al cambiar de estilo: con ellas, una foto salía a
           veces con la pestaña y las filas de la lista a medio camino del
           Cristal (pasó en la de Terminal en español). */
        await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
        await page.evaluate(({ estilo, tema }) => {
          const h = document.documentElement;
          h.dataset.theme = tema;
          if (estilo === 'cristal') delete h.dataset.aspecto;
          else h.dataset.aspecto = estilo;
        }, { estilo, tema });
        await page.addStyleTag({ content: HOJA });
        await page.addStyleTag({ content: ARO });
        /* Cada panel, con el estado que le daría `lib/aroDeEstado.ts` a lo que
           enseña, en su orden: un menú en pantalla, el pie trabajando, y el
           «terminó» que no has mirado. El `data-done` de la demo se apaga, que
           en su hoja vieja es el naranja. La esquina del aro, la de dentro. */
        await page.evaluate(() => {
          for (const p of document.querySelectorAll('.grid > .pane')) {
            const estado = p.querySelector('.ask-btns')
              ? 'necesita'
              : /esc to interrupt/.test(p.textContent)
                ? 'trabaja'
                : p.dataset.done === 'true' && p.dataset.focused !== 'true'
                  ? 'termino'
                  : '';
            if (estado) p.dataset.estado = estado;
            p.dataset.done = 'false';
            const aro = document.createElement('span');
            aro.className = 'pane-aro';
            aro.setAttribute('aria-hidden', 'true');
            aro.append(document.createElement('i'));
            p.append(aro);
            const cs = getComputedStyle(p);
            if (!cs.getPropertyValue('--pane-r-dentro').trim()) {
              const r = Math.max(0, parseFloat(cs.borderTopLeftRadius) - parseFloat(cs.borderTopWidth));
              p.style.setProperty('--pane-r-dentro', `${r}px`);
            }
          }
        });
        await page.waitForTimeout(700);
        if (fallos.length) throw new Error(`la demo falló en ${idioma}/${estilo}: ${fallos[0]}`);
        const crudo = join(temporal, `${nombre}-${idioma}.png`);
        const destino = resolve(WEB, 'assets/screens', idioma, `${nombre}.png`);
        await page.screenshot({ path: crudo });
        if (ffmpeg) {
          const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', crudo, '-compression_level', '9', '-pred', 'mixed', destino]);
          if (r.status !== 0) throw new Error(`ffmpeg no pudo con ${crudo}`);
        } else {
          renameSync(crudo, destino);
        }
        console.log(`assets/screens/${idioma}/${nombre}.png`);
      } finally {
        await ctx.close();
      }
    }
  }
  if (!ffmpeg) console.log('ffmpeg no está en el PATH: las fotos van sin comprimir.');
} finally {
  await navegador.close();
  servidor.close();
  rmSync(temporal, { recursive: true, force: true });
}
