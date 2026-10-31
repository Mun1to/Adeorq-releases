// Supr o Retroceso no borran un trazo del lienzo mientras miras otra vista.
//
// Medido el 2026-10-31: el lienzo sigue montado (escondido) al pasar a la
// Cabina, y el manejador de Supr de la capa de dibujo no miraba si estaba a la
// vista, al contrario que los otros atajos del lienzo. Con un trazo
// seleccionado, pulsar Retroceso con el foco en un botón lo borraba sin verlo.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/lienzo-tecla-escondido.js" })
async (page) => {
  const vista = (nombre) =>
    page.locator(`.topbar button[data-tip="${nombre}"], .tabs button:has-text("${nombre}")`).first().click();
  await page.evaluate((b) => sessionStorage.setItem("__tablero", b), JSON.stringify({
    kind: "adeorq-lienzo", v: 1, flechas: [], nodos: [],
    trazos: [{ id: "d1", t: "caja", color: "#e6edf7", w: 4, relleno: 1, p: [200, 200, 520, 420] }],
  }));
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(2500);
  await vista("Lienzo");
  await page.waitForTimeout(2500);
  // Al volver, cada trazo recibe un id nuevo: se coge el único que hay.
  const caja = page.locator("g.canvas-draw-shape[data-id]").first();
  // Un punto de la caja que no tape otra cosa (el minimapa cae encima a veces).
  const b = await caja.boundingBox();
  const punto = await page.evaluate(([x, y, w, h]) => {
    for (let fy = 0.1; fy < 1; fy += 0.1)
      for (let fx = 0.05; fx < 1; fx += 0.05) {
        const el = document.elementFromPoint(x + w * fx, y + h * fy);
        if (el?.closest("g.canvas-draw-shape")) return [x + w * fx, y + h * fy];
      }
    return null;
  }, [b.x, b.y, b.width, b.height]);
  if (punto) await page.mouse.click(punto[0], punto[1]);
  const seleccionada = (await caja.getAttribute("data-sel")) === "true";
  await vista("Cabina");
  await page.waitForTimeout(600);
  const foco = await page.evaluate(() => document.activeElement?.tagName ?? "");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(400);
  await vista("Lienzo");
  await page.waitForTimeout(1500);
  const sigue = (await page.locator('g.canvas-draw-shape[data-id]').count()) > 0;

  // Lo mismo con Ctrl+Z, que solo escucha con una herramienta de dibujo puesta.
  // Se borra la caja A LA VISTA (eso sí vale), se coge el lápiz (P), y desde la
  // Cabina Ctrl+Z no puede devolverla sin que lo veas.
  if (sigue) {
    if (punto) await page.mouse.click(punto[0], punto[1]);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);
  }
  const previos = sigue ? 1 : 0;
  await page.keyboard.press("p");
  const antes = await page.locator("g.canvas-draw-shape[data-id]").count();
  await vista("Cabina");
  await page.waitForTimeout(600);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  await vista("Lienzo");
  await page.waitForTimeout(1000);
  const despues = await page.locator("g.canvas-draw-shape[data-id]").count();
  await page.keyboard.press("Escape");
  await page.evaluate(() => sessionStorage.removeItem("__tablero"));
  return [
    `${seleccionada ? "ok  " : "FALLA"} la caja estaba seleccionada antes de irse`,
    `${sigue ? "ok  " : "FALLA"} la caja sigue ahí tras pulsar Retroceso y Supr en la Cabina (foco en ${foco})`,
    `${antes === 0 ? "ok  " : "FALLA"} a la vista, Supr sí borra la caja (${previos} → ${antes})`,
    `${despues === antes ? "ok  " : "FALLA"} Ctrl+Z en la Cabina no deshace el dibujo (${antes} → ${despues})`,
  ].join("\n");
}
