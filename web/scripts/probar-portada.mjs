/* Comprueba la portada en cuatro anchos. Responsive de verdad quiere decir
   comprobado, no `clamp()` puesto a ojo.

   Mira cuatro cosas, y las cuatro han fallado alguna vez de verdad:
     · no hay luz encima de la ventana: ni el resplandor de la derecha ni sus
       motas (Munir, 2026-11-16: «quita el glow de la derecha de el home de
       inmediato queda muy mal»);
     · la cinta de clientes RUEDA y sus logos no se pintan encima del rotulo
       (paso al animar el mismo elemento que recortaba);
     · el sprite de marcas no ha escupido su comentario como texto en la pagina
       (paso al cortar por el primer `<svg`, que estaba dentro del comentario);
     · ninguna marca sale vacia, que es lo que delata un simbolo que falta.

   Se lanza con:  node scripts/probar-portada.mjs   (con `pnpm dev` en marcha) */
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Muni/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const nav = await chromium.launch({ executablePath: EXE, headless: true });
const fallos = [];
for (const [w, h] of [[1600, 1000], [1280, 860], [900, 800], [430, 900]]) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const pag = await ctx.newPage();
  pag.on('pageerror', e => fallos.push(`${w}px PAGEERROR ${e.message}`));
  pag.on('console', m => { if (m.type() === 'error') fallos.push(`${w}px ${m.text()}`); });
  await pag.goto('http://localhost:5173/', { waitUntil: 'load' });
  await pag.waitForTimeout(2200);

  const r = await pag.evaluate(() => {
    const t = document.querySelector('.titular').getBoundingClientRect();

    // La cinta: los logos NO pueden pisar el rotulo de la izquierda.
    const rot = document.querySelector('.cinta__rotulo')?.getBoundingClientRect();
    const ven = document.querySelector('.cinta__ventana')?.getBoundingClientRect();
    const pisa = rot && ven &&
      ven.left < rot.right - 1 && ven.right > rot.left + 1 &&
      ven.top < rot.bottom - 1 && ven.bottom > rot.top + 1;

    // Marcas vacias: un <use> a un simbolo que no existe no ocupa nada.
    const vacias = [...document.querySelectorAll('.cinta__grupo:not([data-copia]) .cli__marca')]
      .filter(s => { const c = s.getBoundingClientRect(); return c.width < 4 || c.height < 4; }).length;

    // El comentario del sprite, escrito en la pagina: la senal es su linea de
    // iguales o su aviso de display:none sueltos en el texto del <body>.
    const suelto = /display:none, que tambien anula|={20,}\s*--&gt;|={20,}\s*-->/.test(document.body.innerText);

    return {
      luz: !!document.querySelector('.ventana__luz, .haz__glow, #haz-motas'),
      titular: Math.round(t.width) + 'x' + Math.round(t.height),
      sobra: document.documentElement.scrollWidth - innerWidth,
      logos: document.querySelectorAll('.cinta__grupo:not([data-copia]) .cli').length,
      copias: document.querySelectorAll('.cinta__grupo').length,
      pisa, vacias, suelto,
      manifiesto: !!document.querySelector('.manifiesto__frase'),
      firma: document.querySelector('.manifiesto__autor')?.textContent.trim() || 'SIN FIRMA',
      parrafos: document.querySelectorAll('.explica p').length,
    };
  });

  // La cinta: Se compara la matriz de la animacion, no el estilo escrito.
  const c1 = await pag.evaluate(() => getComputedStyle(document.querySelector('.cinta__pista')).transform);
  await pag.waitForTimeout(1100);
  const c2 = await pag.evaluate(() => getComputedStyle(document.querySelector('.cinta__pista')).transform);

  if (r.luz) fallos.push(`${w}px vuelve a haber luz encima de la ventana`);
  if (r.pisa) fallos.push(`${w}px la cinta pisa el rotulo`);
  if (r.vacias) fallos.push(`${w}px ${r.vacias} marcas vacias en la cinta`);
  if (r.suelto) fallos.push(`${w}px el comentario del sprite esta escrito en la pagina`);
  if (r.copias !== 2) fallos.push(`${w}px la cinta tiene ${r.copias} grupos y necesita 2 para dar la vuelta sin salto`);
  if (c1 === c2) fallos.push(`${w}px la cinta no rueda`);
  if (r.sobra > 0) fallos.push(`${w}px se desborda ${r.sobra}px a lo ancho`);

  console.log(
    `${String(w).padStart(4)}px  luz ${r.luz ? 'SI' : 'no'}  titular ${r.titular.padEnd(9)}` +
    `  cinta ${r.logos} logos x${r.copias} ${c1 !== c2 ? 'rodando' : 'PARADA'}` +
    `  manifiesto ${r.manifiesto ? 'si' : 'NO'}  parrafos ${r.parrafos}`
  );
  await pag.screenshot({ path: `resp-${w}.png` });
  await ctx.close();
}
console.log(fallos.length ? 'ERRORES:\n' + fallos.join('\n') : 'consola limpia y las cuatro comprobaciones en verde, en los cuatro anchos');
await nav.close();
