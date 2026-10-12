/* ============================================================================
   Adeorq · web/scripts/rueda-demo.js
   LA RUEDA DEL RATÓN SOBRE LA DEMOSTRACIÓN DE LA PORTADA.

   La demostración es un <iframe> que ocupa media pantalla. Si se queda con la
   rueda, la portada deja de bajar justo donde el visitante tiene el ratón, y
   desde fuera se lee como que la web «va a tirones» (Munir, 2026-10-12: «cuando
   haces scroll en la parte del dashboard va muy lag»). Ese día no bajaba nada:
   la hoja de la app lleva `overscroll-behavior: none` en la raíz, y dentro de
   un marco eso corta el paso de la rueda a la página.

   Mide dos cosas, con la rueda de verdad (no con `scrollTo`, que no pasa por
   ahí):
     1. cuánto baja la portada con el ratón fuera de la demostración, sobre ella
        y sobre una de sus zonas con scroll propio. Tiene que bajar lo mismo;
     2. cuánto tarda cada fotograma mientras la portada baja con la ventana a
        la vista.

   No es un script de Node: es la función que ejecuta el navegador del banco (el
   MCP de Playwright), con el servidor de la web levantado
   (`pnpm exec vite --port 5199` en `web/`):

     browser_run_code_unsafe(filename = "web/scripts/rueda-demo.js")
   ========================================================================= */
async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://demo.localhost:5199/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#ventana-demo')?.contentDocument?.querySelector('.app'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);

  const rueda = async (nombre, colocar) => {
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(500);
    await colocar();
    const antes = await page.evaluate(() => scrollY);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(900);
    return { donde: nombre, baja: Math.round((await page.evaluate(() => scrollY)) - antes) };
  };
  const marco = () => page.locator('#ventana-demo').boundingBox();

  const pasos = [
    await rueda('fuera de la demostración', () => page.mouse.move(600, 120)),
    await rueda('sobre una terminal', async () => { const b = await marco(); await page.mouse.move(b.x + b.width * 0.5, Math.min(1000, b.y + 300)); }),
    await rueda('sobre la barra de proyectos', async () => { const b = await marco(); await page.mouse.move(b.x + 120, Math.min(1000, b.y + 260)); }),
  ];

  // Los fotogramas, bajando la portada de arriba hasta pasar la ventana. Un
  // fotograma «perdido» es el que tarda más de vez y media lo que tarda uno con
  // la página quieta, que es lo que da el monitor (4,2 ms a 240 Hz, 16,7 a 60).
  const pasada = () =>
    page.evaluate(async () => {
      const mediana = (d) => [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)];
      const cuadros = (n, cada) =>
        new Promise((ok) => {
          const d = [];
          let antes = 0, i = 0;
          const paso = (t) => {
            if (antes) d.push(t - antes);
            antes = t;
            cada?.(i);
            if (++i < n) requestAnimationFrame(paso); else ok(d);
          };
          requestAnimationFrame(paso);
        });
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 700));
      const cadencia = mediana(await cuadros(60));
      const d = await cuadros(166, (i) => window.scrollTo(0, i * 12));
      return { cadencia_ms: +cadencia.toFixed(1), perdidos: d.filter((x) => x > cadencia * 1.5).length, de: d.length, peor_ms: +Math.max(...d).toFixed(1) };
    });
  const fotogramas = [];
  for (let i = 0; i < 4; i++) fotogramas.push(await pasada());

  const referencia = pasos[0].baja;
  return { pasos, fotogramas, bien: referencia > 0 && pasos.every((p) => p.baja >= referencia * 0.8) };
}
