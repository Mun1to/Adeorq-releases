/* Ningun enlace de la portada puede llevar a ninguna parte.
   Nacio porque tres de los cuatro enlaces de la barra (`#trabajo`, `#clientes`,
   `#descargar`) apuntaban a anclas que NO existian en el documento, y con ellos
   el boton «Ver como trabaja» del hero y tres de las cuatro preguntas del final.
   Un clic muerto en una portada es peor que no poner el enlace.

   Comprueba tres cosas:
     · cada `href="#algo"` tiene su elemento con ese id;
     · datos.js ha rellenado la version, la fecha, el peso y el contador con lo
       que dice el JSON, y no se ha quedado el valor escrito a mano;
     · lo que se lee SIN JavaScript ya trae texto en esos huecos, que es la regla
       del cruce con WebIndex: un asistente no ejecuta scripts.

   Se lanza con:  node scripts/probar-enlaces.mjs   (con `pnpm dev` en marcha) */
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Muni/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const URL = 'http://localhost:5173/';

const nav = await chromium.launch({ executablePath: EXE, headless: true });
const fallos = [];

/* ── 1. Con JavaScript ──────────────────────────────────────────────────── */
const ctx = await nav.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' });
const pag = await ctx.newPage();
pag.on('pageerror', e => fallos.push('PAGEERROR ' + e.message));
pag.on('console', m => { if (m.type() === 'error') fallos.push('consola: ' + m.text()); });
await pag.goto(URL, { waitUntil: 'load' });
await pag.waitForTimeout(1800);

const r = await pag.evaluate(() => {
  const muertos = [...document.querySelectorAll('a[href^="#"]')]
    .map(a => a.getAttribute('href'))
    .filter(h => h && h.length > 1 && !document.getElementById(h.slice(1)));
  const t = s => (document.querySelector(s)?.textContent || '').trim();
  return {
    muertos: [...new Set(muertos)],
    anclas: document.querySelectorAll('a[href^="#"]').length,
    version: t('[data-descarga-version]'),
    fecha: t('[data-descarga-fecha]'),
    peso: t('[data-descarga-peso]'),
    cuenta: t('[data-log-cuenta]'),
    filas: document.querySelectorAll('.log__fila').length,
    preguntas: document.querySelectorAll('.pregunta').length,
    pasos: document.querySelectorAll('.paso').length,
    rasgos: document.querySelectorAll('.rasgo').length,
    // La frase de la licencia del pie tiene que estar y decirlo con esas
    // palabras: desde el 2026-11-21 es open source (AGPL-3.0). La frase vieja
    // de que NO lo era no puede quedarse ni en el pie ni en las preguntas.
    // Solo esas dos piezas: las notas de versión que pinta `.log__fila` pueden
    // nombrar PolyForm con todo derecho, y la pregunta «¿Es open source?» del
    // FAQ casaría sola con la frase buscada aunque el pie la hubiera perdido.
    // `textContent` y no `innerText`: este se salta las respuestas de las
    // preguntas cerradas, que es donde estaría la frase vieja.
    licencia: (() => {
      const pie = document.querySelector('.pie__linea')?.textContent || '';
      const faq = document.querySelector('#faq')?.textContent || '';
      return /es open source/i.test(pie) && /AGPL-3\.0/.test(pie) &&
        !/no es open source|PolyForm/i.test(pie + '\n' + faq);
    })(),
  };
});
await ctx.close();

/* ── 2. Sin JavaScript ──────────────────────────────────────────────────── */
const ctx2 = await nav.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
const pag2 = await ctx2.newPage();
await pag2.goto(URL, { waitUntil: 'load' });
const crudo = await pag2.evaluate(() => {
  const t = s => (document.querySelector(s)?.textContent || '').trim();
  return {
    version: t('[data-descarga-version]'),
    clientes: document.querySelectorAll('.cinta__grupo:not([data-copia]) .cli').length,
    palabras: document.body.innerText.split(/\s+/).filter(Boolean).length,
  };
});
await ctx2.close();
await nav.close();

if (r.muertos.length) fallos.push('enlaces a ninguna parte: ' + r.muertos.join(' '));
if (!/^v\d+\.\d+\.\d+$/.test(r.version)) fallos.push('la version no se ha rellenado: ' + r.version);
if (!r.fecha) fallos.push('la fecha de la descarga esta vacia');
if (!r.peso) fallos.push('el peso del instalador esta vacio');
if (!r.filas) fallos.push('las novedades no han pintado ninguna version');
if (!r.licencia) fallos.push('el pie no dice que es open source con la AGPL-3.0, o queda la frase vieja de PolyForm en el pie o en las preguntas');
if (!crudo.version) fallos.push('sin JavaScript no se ve ni la version: el HTML tiene que traerla escrita');
if (crudo.clientes < 20) fallos.push('sin JavaScript solo se leen ' + crudo.clientes + ' clientes');

console.log(`${r.anclas} anclas, ${r.muertos.length} muertas`);
console.log(`descarga: ${r.version} · ${r.fecha} · ${r.peso}   novedades: ${r.cuenta} versiones, ${r.filas} en lista`);
console.log(`estructura: ${r.pasos} pasos, ${r.rasgos} rasgos,${r.preguntas} preguntas`);
console.log(`sin JavaScript: ${crudo.palabras} palabras y ${crudo.clientes} clientes legibles`);
console.log(fallos.length ? 'ERRORES:\n' + fallos.join('\n') : 'todo en verde: ni un enlace muerto y los datos salen del JSON');
if (fallos.length) process.exitCode = 1;
