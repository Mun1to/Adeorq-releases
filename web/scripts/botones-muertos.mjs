/* ============================================================================
   Adeorq · web/scripts/botones-muertos.mjs
   EL CENSO DE BOTONES MUERTOS.

   Recorre las nueve pantallas de la maqueta, pulsa TODOS los botones y apunta
   los que no hacen absolutamente nada: ni cambian el DOM, ni sacan aviso, ni se
   marcan. En una demo que se vende como interactiva, un boton que no responde
   es peor que no ponerlo, y a ojo no se cazan: son mas de cien.

   La primera pasada saco siete: los tres botones de la ventana, el anterior y
   el siguiente del reproductor, y la franja de la derecha entera.

   Se lanza igual que probar-maqueta.mjs, desde una carpeta con playwright-core
   instalado y con el servidor de desarrollo levantado:
     node scripts/botones-muertos.mjs
   ========================================================================= */
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Muni/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const VISTAS = ['cabina','panel','chat','agenda','lienzo','memoria','cuentas','comandos','ajustes'];

const nav = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await nav.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
const pag = await ctx.newPage();
const errores = [];
pag.on('pageerror', e => errores.push('PAGEERROR ' + e.message));
pag.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
await pag.goto('http://localhost:5177/demo/?desnuda=1', { waitUntil: 'load' });
await pag.waitForTimeout(1800);

const muertos = [];
for (const v of VISTAS) {
  await pag.evaluate(x => document.querySelector(`.tab[data-vista="${x}"]`)?.click(), v);
  await pag.waitForTimeout(300);
  const n = await pag.evaluate(() =>
    document.querySelectorAll('#ade button:not([disabled]), #ade input, #ade select, #ade textarea').length);
  for (let i = 0; i < n; i++) {
    const r = await pag.evaluate(async (idx) => {
      const els = [...document.querySelectorAll('#ade button:not([disabled]), #ade input, #ade select, #ade textarea')];
      const el = els[idx];
      if (!el || el.offsetParent === null) return null;
      const etiq = (el.getAttribute('title') || el.textContent.trim() || el.placeholder || el.className || el.tagName).slice(0, 44);
      if (el.tagName !== 'BUTTON') return { etiq, clase: el.className, vivo: true, tipo: el.tagName };
      const antes = document.getElementById('ade').outerHTML;
      el.click();
      await new Promise(r => setTimeout(r, 120));
      const despues = document.getElementById('ade').outerHTML;
      return { etiq, clase: el.className, vivo: antes !== despues, tipo: 'BUTTON' };
    }, i);
    if (r && !r.vivo) muertos.push({ vista: v, ...r });
  }
  // dejarlo como estaba
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(1200);
}

const clave = m => m.vista + ' · ' + m.etiq;
const vistos = new Set();
console.log('BOTONES QUE NO HACEN NADA');
for (const m of muertos) {
  if (vistos.has(clave(m))) continue;
  vistos.add(clave(m));
  console.log(`  ${m.vista.padEnd(9)} ${m.etiq.padEnd(46)} .${(m.clase || '').split(' ')[0]}`);
}
console.log(`total: ${vistos.size}`);
if (errores.length) console.log('ERRORES:\n' + errores.join('\n'));
await nav.close();
