// Vuelca el DOM de la app de pruebas, vista por vista, con el mismo tablero que
// las fotos. De aquí sale la demostración de la portada de la web (`web/demo/`):
// no es una maqueta que imita a la app, es la app congelada. Las clases, el
// orden, los rótulos y hasta lo que dicen las terminales son los de verdad, y
// `web/scripts/hacer-demo.mjs` los empaqueta.
//
// Uso: node volcar.mjs <en|es> [parte...]   (sin partes: todo)
//   partes: cabina panel chat agenda decisiones memoria cuentas comandos
//           ajustes lienzo extras barra hojas
// Deja en `volcado/<idioma>/`:
//   app-cabina.html, app-lienzo.html   la ventana entera en esas dos vistas
//   v-<vista>.html                     la raíz de cada una de las otras
//   v-<vista>--<n>.html                la misma con su pestaña n abierta
//   x-objetivos, x-pulso, x-paleta,
//   x-lateral-N, x-barra-N             lo que se abre encima o al lado
//   raiz.json                          los atributos de <html> y <body>
// y en `volcado/`: hojas.css, las hojas de estilo que la página tiene cargadas.
import { mkdirSync, writeFileSync } from "node:fs";
import { abrir, apartarRaton, dormir, sinWebgl, vista } from "./escena.mjs";
import { cabina, montar } from "./tablero.mjs";

const [idioma, ...solo] = process.argv.slice(2);
if (!["en", "es"].includes(idioma)) {
  console.log("uso: node volcar.mjs <en|es> [parte...]");
  process.exit(1);
}
const quiere = (parte) => !solo.length || solo.includes(parte);
const es = idioma === "es";
const SALIDA = `volcado/${idioma}`;
mkdirSync(SALIDA, { recursive: true });

const p = await abrir();
await montar(p, idioma, cabina(idioma));

/** La raíz de la vista que hay delante: lo que cuelga de `.app` y no es el
 *  fondo, la barra ni la Cabina. */
const RAIZ_VISTA = `[...document.querySelector('.app').children].find((e) => !e.matches('.fondo, header.topbar, .view-cabina'))`;

async function volcar(nombre, expr = `document.querySelector('.app')`) {
  await apartarRaton(p);
  await dormir(450);
  const html = await p.js(`(() => { const e = ${expr}; return e ? e.outerHTML : ""; })()`);
  if (!html) return console.log(`  (${nombre}: no hay nada que volcar)`);
  writeFileSync(`${SALIDA}/${nombre}.html`, html);
  console.log(`${nombre}: ${html.length}`);
}

/** Las pestañas de dentro de una vista (el componente `Secciones`). La app
 *  recuerda la última que abriste, así que se pulsan todas y se acaba en la
 *  primera, que es la que tiene que quedar. */
async function secciones(nombre) {
  const n = await p.js(`document.querySelectorAll('nav.set-nav button.set-tab').length`);
  for (let i = 0; i < n; i++) {
    const rotulo = await p.js(`(() => { const b = document.querySelectorAll('nav.set-nav button.set-tab')[${i}]; if (b.dataset.on !== 'true') b.click(); return (b.querySelector('.set-tab-nom')?.textContent ?? '').trim(); })()`);
    await dormir(1300);
    await volcar(`v-${nombre}--${i}`, RAIZ_VISTA);
    console.log(`   ${i}: ${rotulo}`);
  }
  await p.js(`(() => { const b = document.querySelector('nav.set-nav button.set-tab'); if (b && b.dataset.on !== 'true') b.click(); })()`);
  await dormir(600);
}

const intentar = (accion) => accion().catch((e) => console.log("  (" + String(e.message ?? e).slice(0, 90) + ")"));

// ── La Cabina ───────────────────────────────────────────────────────────────
if (quiere("cabina")) {
  // Con todos los proyectos de la barra desplegados: la lista de sesiones de
  // uno plegado no existe en la página, y la demostración tiene que poder
  // abrirlos todos. Quién sale plegado lo decide `hacer-demo.mjs`.
  await p.js(`(() => { for (const b of document.querySelectorAll('.projects .project[data-open="false"] > button.project-main')) b.click(); })()`);
  await dormir(1500);
  await volcar("app-cabina");
}

// ── Las vistas de una hoja ──────────────────────────────────────────────────
if (quiere("panel")) {
  await vista(p, "panel", 2500);
  await secciones("panel");
}

if (quiere("chat")) {
  await vista(p, "chat", 2500);
  // Con una conversación abierta, y una que ya terminó: el hilo sale del
  // transcript de esa sesión, y a mitad de turno solo habría una pregunta.
  await intentar(() => p.clic("button.chat-fila", es ? "prueba del descuento" : "Discount test"));
  await dormir(3500);
  await volcar("v-chat", RAIZ_VISTA);
}

if (quiere("agenda")) {
  await vista(p, "agenda", 3000);
  // Con un proyecto elegido, la portada cuenta sus metas (el clic lo quita si
  // ya estaba puesto, así que se mira antes).
  const elegido = () => p.js(`(document.querySelectorAll('button.ag-cifra')[2]?.textContent ?? '').includes('storefront-api')`);
  if (!(await elegido())) await intentar(() => p.clic("aside.ag-rail button.project-logo", "SA"));
  await dormir(1200);
  await volcar("v-agenda", RAIZ_VISTA);
}

if (quiere("decisiones")) {
  await vista(p, "decisiones", 2500);
  await intentar(() => p.clic("button.dec-fila"));
  await dormir(1000);
  await volcar("v-decisiones", RAIZ_VISTA);
}

if (quiere("memoria")) {
  await vista(p, "memoria", 4000);
  // El mapa de la bóveda se pinta en un lienzo, que no se puede volcar: se
  // abren las carpetas y un documento, que sí son texto.
  const carpetas = await p.js(`document.querySelectorAll('button.mem-carpeta').length`);
  for (let i = 0; i < carpetas; i++) {
    await p.js(`document.querySelectorAll('button.mem-carpeta')[${i}]?.click()`);
    await dormir(500);
  }
  await intentar(() => p.clic("button.mem-hoja", es ? "Redondeo" : "Rounding"));
  await dormir(1800);
  await volcar("v-memoria", RAIZ_VISTA);
}

if (quiere("cuentas")) {
  await vista(p, "cuentas", 5000);
  await secciones("cuentas");
}

if (quiere("comandos")) {
  await vista(p, "comandos", 2500);
  await volcar("v-comandos", RAIZ_VISTA);
}

if (quiere("ajustes")) {
  await vista(p, "ajustes", 2000);
  await secciones("ajustes");
}

// ── El Lienzo, con la ventana entera (lleva dentro la Cabina, escondida) ────
if (quiere("lienzo")) {
  await vista(p, "lienzo", 7000);
  await sinWebgl(p);
  await dormir(3000);
  await volcar("app-lienzo");
}

// ── Lo que se abre encima o al lado, en la Cabina ───────────────────────────
if (quiere("extras")) {
  await vista(p, "cabina", 2000);
  await intentar(async () => {
    await p.clic(".objetivos-toggle");
    await dormir(1300);
    await volcar("x-objetivos", `document.querySelector('.obj-flota') ?? document.querySelector('.objetivos')`);
    await p.clic(".objetivos-toggle");
    await dormir(600);
  });
  await intentar(async () => {
    await p.clic("button.pulso");
    await dormir(1000);
    // El detalle no cuelga del botón: la app lo monta fuera de la barra.
    await volcar("x-pulso", `document.querySelector('.pulso-detalle')`);
    await p.clic("button.pulso");
    await dormir(500);
  });
  // La paleta de Ctrl+K (2 es la tecla Ctrl en el protocolo).
  await intentar(async () => {
    const tecla = (type, extra = {}) => p.enviar("Input.dispatchKeyEvent", { type, key: "k", code: "KeyK", windowsVirtualKeyCode: 75, modifiers: 2, ...extra });
    await tecla("rawKeyDown");
    await tecla("keyUp");
    await dormir(1200);
    await volcar("x-paleta", `document.querySelector('.paleta-caja')?.parentElement`);
    await p.enviar("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await p.enviar("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await dormir(600);
  });
  // La barra de la derecha: skills, actividad y archivos. Con una terminal
  // enfocada, las tres hablan de SU proyecto.
  await intentar(() => p.clic(".view-cabina .xterm-screen"));
  await dormir(800);
  for (let i = 0; i < 3; i++) {
    await intentar(async () => {
      await p.js(`document.querySelectorAll('nav.franja button.franja-btn')[${i}].click()`);
      await dormir(2800);
      if (i === 2) {
        for (const carpeta of ["src", "test"]) {
          await intentar(() => p.clic('button.arch-fila[data-carpeta="true"]', carpeta));
          await dormir(600);
        }
      }
      await volcar(`x-lateral-${i}`, `document.querySelector('.lateral-zona')`);
    });
  }
  // Se cierra volviendo a pulsar la que quedó abierta.
  await intentar(() => p.js(`document.querySelectorAll('nav.franja button.franja-btn')[2].click()`));
  await dormir(1500);
}

// ── La barra de proyectos en sus otros dos modos ────────────────────────────
// En logos y en tira no es la misma barra con otro ancho: tiene otro esqueleto.
// 0 es «solo los logos» y 2 «la tira»; la 1, logo y nombre, es la de siempre.
if (quiere("barra")) {
  await vista(p, "cabina", 1500);
  await intentar(async () => {
    await p.js(`document.querySelectorAll('aside.sidebar .rail-tab')[0].click()`);
    await dormir(1600);
    await volcar("x-barra-0", `document.querySelector('aside.sidebar')`);
    await p.js(`document.querySelectorAll('aside.sidebar .rail-tab')[2].click()`);
    await dormir(1600);
    await volcar("x-barra-2", `document.querySelector('aside.sidebar')`);
    // De la tira se vuelve con su segundo botón; se deja como estaba.
    await p.js(`document.querySelector('aside.sidebar .rail-mini .mini:not(.rail-new)').click()`);
    await dormir(1200);
  });
}

// ── Las hojas de estilo y la raíz ───────────────────────────────────────────
// Las de cada terminal (`.xterm-screen`) no: viajan dentro de su propio volcado.
if (quiere("hojas")) {
  const r = await p.js(`(() => {
    const attrs = (e) => Object.fromEntries([...e.attributes].map((a) => [a.name, a.value]));
    const hojas = [...document.styleSheets]
      .filter((h) => !(h.ownerNode && h.ownerNode.closest && h.ownerNode.closest('.xterm')))
      .map((h) => {
        const de = h.href || (h.ownerNode && h.ownerNode.getAttribute('data-vite-dev-id')) || '?';
        let texto = '';
        try { texto = [...h.cssRules].map((x) => x.cssText).join('\\n'); } catch (e) { texto = '/* ilegible */'; }
        return '/* ==== ' + String(de).split('node_modules/').pop().split('/src/').pop() + ' ==== */\\n' + texto;
      });
    return { html: attrs(document.documentElement), body: attrs(document.body), css: hojas.join('\\n\\n') };
  })()`);
  writeFileSync("volcado/hojas.css", r.css);
  writeFileSync(`${SALIDA}/raiz.json`, JSON.stringify({ html: r.html, body: r.body }, null, 1));
  console.log(`hojas.css: ${r.css.length}`);
}
await vista(p, "cabina", 600);
p.cerrar();
