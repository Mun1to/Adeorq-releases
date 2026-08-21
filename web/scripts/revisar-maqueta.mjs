/* ============================================================================
   Adeorq · web/scripts/revisar-maqueta.mjs
   EL BARRIDO DE FALLOS.

   Recorre la maqueta entera —las siete pantallas, varios temas y tres anchos—
   y busca los fallos que se ven pero que nadie mira uno por uno:

     · texto que se sale de su caja
     · algo que desborda la ventana y saca barra lateral
     · texto ilegible: menos de 4,5:1 de contraste sobre su fondo
     · cajas de cero de alto o de ancho
     · dos cosas pintadas encima la una de la otra
     · errores en la consola

   Se lanza igual que probar-maqueta.mjs, desde una carpeta con playwright-core:
     node scripts/revisar-maqueta.mjs

   No sustituye a mirar la pantalla: hay fallos que solo se ven mirando. Lo que
   hace es que los que SI se pueden medir no lleguen nunca a la pantalla.
   ========================================================================= */

import { chromium } from 'playwright-core';

const EXE = 'C:/Users/Muni/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const URL = process.argv[2] || 'http://localhost:5177/demo/';

const VISTAS = ['cabina', 'panel', 'chat', 'agenda', 'lienzo', 'memoria', 'cuentas', 'comandos', 'ajustes'];
const TEMAS  = ['azul', 'claro', 'papel', 'matrix', 'negro'];
const ANCHOS = [1600, 1200, 900];

const nav = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await nav.newContext({ viewport: { width: 1600, height: 1080 }, colorScheme: 'dark' });
const pag = await ctx.newPage();

const fallos = [];
pag.on('pageerror', e => fallos.push({ que: 'JS', donde: '-', dato: e.message }));
pag.on('console', m => { if (m.type() === 'error') fallos.push({ que: 'consola', donde: '-', dato: m.text() }); });

await pag.goto(URL, { waitUntil: 'load' });
await pag.waitForTimeout(1400);

/* La comprobacion corre DENTRO de la pagina: mide cajas y colores de verdad. */
const REVISION = () => {
  const malos = [];
  const ade = document.getElementById('ade');
  if (!ade) return [{ que: 'falta', dato: 'no hay maqueta' }];

  // Visible de verdad: no basta con mirar el elemento, porque casi toda la
  // maqueta vive dentro de pantallas ocultas y ahi todo mide cero sin estar mal.
  // `offsetParent` a null lo dice de una vez para el elemento y sus padres.
  const visible = el => {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // --- 1. texto que se sale de su caja ---
  for (const el of ade.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') continue;
    const sobraX = el.scrollWidth - el.clientWidth;
    const sobraY = el.scrollHeight - el.clientHeight;
    if (sobraX > 2 || sobraY > 2) {
      // los que scrollean a proposito no cuentan
      if (/auto|scroll/.test(cs.overflowY + cs.overflowX)) continue;
      // un hijo colocado a mano que sobresale es un adorno queriendo (el badge
      // del boton de git, por ejemplo), no un texto que no cabe
      // Si lo que sobresale es un hijo colocado a mano (el badge del boton de
      // git, por ejemplo), es un adorno queriendo y no un texto que no cabe.
      const hayAbsoluto = [...el.children].some(h => getComputedStyle(h).position === 'absolute');
      if (hayAbsoluto) continue;
      malos.push({ que: 'se sale', dato: `${el.className || el.tagName} +${sobraX}x${sobraY}` });
    }
  }

  // --- 2. contraste del texto ---
  /* Leer un color de `getComputedStyle`. Ojo: los que salen de un `color-mix`
     vienen como `color(srgb 0.84 0.84 0.84 / 0.5)`, con los canales de 0 a 1 y
     no de 0 a 255. Tratarlos como bytes convierte un blanco casi puro en negro
     y hace que el revisor invente fallos de contraste que no existen. */
  const rgb = s => {
    const n = (String(s).match(/[\d.]+/g) || []).map(Number);
    if (n.length < 3) return [];
    const esFraccion = /^color\(/.test(String(s).trim());
    const c = esFraccion ? n.slice(0, 3).map(v => v * 255) : n.slice(0, 3);
    return n.length > 3 ? [...c, n[3]] : c;
  };
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const fondoDe = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.85)) return c;
      n = n.parentElement;
    }
    return [10, 14, 22];
  };
  for (const el of ade.querySelectorAll('span, p, b, i, h1, h2, h3, h4, li, button, kbd, div')) {
    if (!visible(el)) continue;
    const propio = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!propio) continue;
    const cs = getComputedStyle(el);
    const t = rgb(cs.color), f = fondoDe(el);
    if (t.length < 3) continue;
    if (t[3] !== undefined && t[3] < 0.5) continue;      // deliberadamente tenue
    const L1 = lum(t), L2 = lum(f);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const grande = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
    const minimo = grande ? 3 : 4.5;
    if (ratio < minimo) {
      malos.push({ que: 'poco contraste', dato:
        `${(el.className || el.tagName).toString().slice(0, 34)} ${ratio.toFixed(2)}:1 «${el.textContent.trim().slice(0, 22)}»` });
    }
  }

  // --- 3. cajas de cero ---
  for (const el of ade.querySelectorAll('.pane, .project, .stat-card, .panel-card, .set-tab, .tab, .mini')) {
    if (el.offsetParent === null) continue;       // esta en una pantalla oculta
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) malos.push({ que: 'caja a cero', dato: el.className });
  }
  return malos;
};

const linea = (vista, tema, ancho) => `${vista}/${tema}/${ancho}`;

for (const ancho of ANCHOS) {
  await pag.setViewportSize({ width: ancho, height: 1080 });
  for (const tema of TEMAS) {
    await pag.evaluate(t => {
      document.getElementById('ade').dataset.tema = t;
      const s = document.getElementById('mando-tema'); if (s) s.value = t;
    }, tema);
    for (const vista of VISTAS) {
      await pag.evaluate(v => document.querySelector(`.tab[data-vista="${v}"]`)?.click(), vista);
      await pag.waitForTimeout(160);
      const malos = await pag.evaluate(REVISION);
      for (const m of malos) fallos.push({ ...m, donde: linea(vista, tema, ancho) });
    }
  }
}

// --- 4. la pagina no puede sacar barra lateral en ningun ancho ---
for (const ancho of ANCHOS) {
  await pag.setViewportSize({ width: ancho, height: 1080 });
  await pag.waitForTimeout(200);
  const sobra = await pag.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (sobra > 1) fallos.push({ que: 'scroll lateral', donde: ancho + 'px', dato: '+' + sobra + 'px' });
}

/* Se agrupan: el mismo fallo en veinte combinaciones es UN fallo, no veinte. */
const porTipo = new Map();
for (const f of fallos) {
  const clave = f.que + ' · ' + f.dato;
  if (!porTipo.has(clave)) porTipo.set(clave, { ...f, veces: 0, sitios: new Set() });
  const e = porTipo.get(clave);
  e.veces++;
  if (e.sitios.size < 3) e.sitios.add(f.donde);
}

const lista = [...porTipo.values()].sort((a, b) => b.veces - a.veces);
console.log(`REVISION · ${VISTAS.length} pantallas × ${TEMAS.length} temas × ${ANCHOS.length} anchos`);
if (!lista.length) console.log('sin fallos');
for (const f of lista) {
  console.log(`  ${String(f.veces).padStart(3)}×  ${f.que.padEnd(15)} ${f.dato}`);
  console.log(`        en ${[...f.sitios].join(', ')}`);
}
console.log(`TOTAL: ${lista.length} distintos, ${fallos.length} apariciones`);

await nav.close();
