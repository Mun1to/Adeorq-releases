// Arrastrar un archivo del árbol a una terminal para dejarle su ruta escrita.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página.
//
// OJO con lo que demuestra: el gesto va por puntero (`lib/arrastrarRuta.ts`) y
// aquí se hace con el ratón de Playwright, que SÍ genera eventos de puntero.
// Eso prueba el camino que usa la ventana de verdad. Con el arrastre nativo
// del navegador este banco también daría verde y en la app no funcionaría.
//
//   · Un clic a secas sigue abriendo el archivo: no es un arrastre.
//   · Al llevarlo, la fila se apaga, sale la copia en la mano y la terminal de
//     debajo se marca.
//   · Al soltarlo sobre la terminal, su ruta queda escrita entre comillas, con
//     un espacio y SIN Intro; y el archivo no se abre.
//   · Soltarlo fuera de una terminal, o darle a Esc, no escribe nada.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-lateral", "archivos");
      localStorage.setItem("adeorq-layout", JSON.stringify({
        panes: [{ name: "Web · consola", cwd: "C:\\proyectos\\Web" }],
        cols: [{ w: 1, hs: [1], idx: [0] }],
        ocultos: [],
      }));
    } catch { /* sin almacenamiento */ }
  });
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(4000);
  await page.locator('[data-tab="cabina"]').first().click();
  await page.waitForTimeout(600);
  await page.locator("[data-pane-id]").first().click({ position: { x: 60, y: 60 } });
  await page.waitForTimeout(800);
  const raiz = await page.locator(".arch-raiz").first().getAttribute("data-tip");
  await page.evaluate((R) => {
    const viejo = Date.now() - 3_600_000;
    window.__carpetas = { [R]: [{ nombre: "App.tsx", cuando: viejo }, { nombre: "Con espacio.md", cuando: viejo }] };
    window.__git = { git: true, cambios: [] };
  }, raiz);
  await page.locator('.franja-btn[data-tip="Ocultar panel"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.franja-btn[data-tip="Archivos"]').first().click();
  await page.waitForTimeout(1500);

  const fila = page.locator(".arch-fila", { hasText: "Con espacio.md" }).first();
  const terminal = page.locator("[data-pane-id]").first();
  const panel = Number(await terminal.getAttribute("data-pane-id"));
  const centro = async (l) => { const c = await l.boundingBox(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; };
  const desde = () => page.evaluate(() => { window.__desde = window.__llamadas.length; });
  const hechas = (cmd) => page.evaluate((c) => window.__llamadas.slice(window.__desde).filter(([x]) => x === c).map(([, a]) => a), cmd);

  // 1. Un clic a secas abre el archivo.
  await desde();
  await page.locator(".arch-fila", { hasText: "App.tsx" }).first().click();
  await page.waitForTimeout(700);
  debe((await hechas("leer_archivo")).length === 1 && (await hechas("pty_write")).length === 0, "un clic abre el archivo y no escribe en ninguna terminal");

  // 2. Lo llevas: la fila se apaga, hay copia en la mano y la terminal se marca.
  const a = await centro(fila);
  const b = await centro(terminal);
  await desde();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x - 30, a.y + 10, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.waitForTimeout(150);
  pasos.enLaMano = await page.evaluate(() => ({
    filaApagada: document.querySelectorAll(".arch-fila[data-moviendo]").length,
    copia: document.querySelectorAll("body > .fantasma").length,
    marcada: document.querySelectorAll("[data-pane-id][data-recibe]").length,
  }));
  debe(pasos.enLaMano.filaApagada === 1 && pasos.enLaMano.copia === 1 && pasos.enLaMano.marcada === 1, `mientras lo llevas (${JSON.stringify(pasos.enLaMano)})`);

  // 3. Lo sueltas: la ruta, entre comillas, con su espacio y sin Intro.
  await page.mouse.up();
  await page.waitForTimeout(500);
  pasos.escrito = await hechas("pty_write");
  debe(pasos.escrito.length === 1 && pasos.escrito[0].id === panel && pasos.escrito[0].data === `"${raiz}\\Con espacio.md" `, `la ruta queda escrita en esa terminal (${JSON.stringify(pasos.escrito)})`);
  debe((await hechas("pty_send")).length === 0, "sin Intro: no se manda nada por ti");
  debe((await hechas("leer_archivo")).length === 0, "y soltarlo no abre el archivo");
  pasos.trasSoltar = await page.evaluate(() => ({
    filaApagada: document.querySelectorAll(".arch-fila[data-moviendo]").length,
    copia: document.querySelectorAll("body > .fantasma").length,
    marcada: document.querySelectorAll("[data-pane-id][data-recibe]").length,
  }));
  debe(pasos.trasSoltar.filaApagada === 0 && pasos.trasSoltar.copia === 0 && pasos.trasSoltar.marcada === 0, `al soltar no queda nada de la mano (${JSON.stringify(pasos.trasSoltar)})`);

  // 4. Soltarlo fuera de una terminal no escribe nada.
  const raizCaja = await centro(page.locator(".arch-raiz").first());
  await desde();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x - 20, a.y - 20, { steps: 4 });
  await page.mouse.move(raizCaja.x, raizCaja.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  debe((await hechas("pty_write")).length === 0 && (await hechas("leer_archivo")).length === 0, "soltarlo fuera de una terminal no escribe ni abre nada");

  // 5. Esc a mitad lo cancela.
  await desde();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const trasEsc = await page.evaluate(() => document.querySelectorAll("body > .fantasma, [data-recibe], .arch-fila[data-moviendo]").length);
  await page.mouse.up();
  await page.waitForTimeout(400);
  debe(trasEsc === 0 && (await hechas("pty_write")).length === 0, `Esc lo cancela y no escribe (${trasEsc} restos)`);

  return { pasos, fallos };
}
