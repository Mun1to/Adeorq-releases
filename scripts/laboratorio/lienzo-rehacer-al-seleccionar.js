// Seleccionar un trazo no borra el «rehacer» ni añade un paso a «deshacer».
//
// Medido el 2026-10-31 (`CanvasView.tsx`): agarrar un trazo con la flecha
// llama a `alEmpezarGesto`, que fotografía el estado y vacía el camino de
// vuelta al pulsar, aunque no llegues a mover nada. Con un solo clic para
// seleccionar, el «rehacer» de lo último que deshiciste desaparecía y
// «deshacer» ganaba un paso que no deshace nada.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/lienzo-rehacer-al-seleccionar.js" })
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
  const r = [];
  const ok = (n, c, d = "") => r.push(`${c ? "ok  " : "FALLA"} ${n}${c || !d ? "" : ` — ${d}`}`);
  const zona = await page.locator(".canvas-draw").first().boundingBox();
  const X = zona.x + zona.width * 0.65;
  const Y = zona.y + zona.height * 0.3;
  const deshacerOn = () => page.locator('.cp-btn[data-tip^="Deshacer"]').first().isEnabled();
  const rehacerOn = () => page.locator('.cp-btn[data-tip="Rehacer"]').first().isEnabled();

  // 1. Un trazo a lápiz, y deshacerlo: queda un «rehacer».
  await page.keyboard.press("p");
  await page.waitForTimeout(200);
  await page.mouse.move(X, Y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(X + i * 12, Y + i * 6);
  await page.mouse.up();
  await page.waitForTimeout(300);
  ok("el lápiz dejó un paso para deshacer", await deshacerOn());
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  ok("deshecho, queda uno para rehacer", await rehacerOn());
  ok("y ninguno más para deshacer", !(await deshacerOn()));

  // 2. Con la flecha, un clic para seleccionar la caja que ya había.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const caja = page.locator("g.canvas-draw-shape[data-id]").first();
  const b = await caja.boundingBox();
  const punto = await page.evaluate(([x, y, w, h]) => {
    for (let fy = 0.1; fy < 1; fy += 0.1)
      for (let fx = 0.05; fx < 1; fx += 0.05) {
        const el = document.elementFromPoint(x + w * fx, y + h * fy);
        if (el?.closest("g.canvas-draw-shape")) return [x + w * fx, y + h * fy];
      }
    return null;
  }, [b.x, b.y, b.width, b.height]);
  ok("hay un punto de la caja que se puede pinchar", !!punto);
  if (punto) await page.mouse.click(punto[0], punto[1]);
  await page.waitForTimeout(300);
  ok("la caja quedó seleccionada", (await caja.getAttribute("data-sel")) === "true");

  // 3. De vuelta a una herramienta de dibujo se miran los dos botones.
  await page.keyboard.press("p");
  await page.waitForTimeout(300);
  ok("seleccionar no borró el «rehacer»", await rehacerOn());
  ok("ni añadió un paso a «deshacer»", !(await deshacerOn()));

  // 4. Y mover la caja SÍ es un paso, y sí cierra el camino de vuelta.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if (punto) {
    await page.mouse.move(punto[0], punto[1]);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(punto[0] + i * 6, punto[1] + i * 3);
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
  await page.keyboard.press("p");
  await page.waitForTimeout(300);
  ok("mover la caja es un paso para deshacer", await deshacerOn());
  ok("y cierra el «rehacer», como cualquier cambio", !(await rehacerOn()));
  return r.join("\n");
}
