// Las líneas y flechas de varios puntos del lienzo: el doble clic no deja un
// tramo de longitud cero (la punta mirando siempre al este), y cambiar de
// herramienta a mitad no deja una línea fantasma.
//
// Medido el 2026-10-31 (`CanvasDraw.tsx`):
//  · un doble clic son DOS pulsaciones más el evento de doble clic; cada
//    pulsación clava un punto, así que `cerrarMulti` guardaba el último punto
//    dos veces. Una flecha calcula su punta con el último tramo, que mide cero:
//    `atan2(0, 0)` es 0, o sea hacia el este, dibujes hacia donde dibujes;
//  · con la línea a medias, elegir otra herramienta dejaba `multi` y el trazo
//    en curso vivos: seguía en pantalla y el siguiente clic seguía añadiéndole
//    puntos aunque ya tuvieras la caja puesta.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/lienzo-multipunto.js" })
async (page) => {
  const vista = (nombre) =>
    page.locator(`.topbar button[data-tip="${nombre}"], .tabs button:has-text("${nombre}")`).first().click();
  await page.evaluate((b) => sessionStorage.setItem("__tablero", b), JSON.stringify({
    kind: "adeorq-lienzo", v: 1, flechas: [], nodos: [], trazos: [],
  }));
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(2500);
  await vista("Lienzo");
  await page.waitForTimeout(2500);
  const r = [];
  const ok = (n, c, d = "") => r.push(`${c ? "ok  " : "FALLA"} ${n}${c || !d ? "" : ` — ${d}`}`);
  const guardados = () =>
    page.locator("g.canvas-draw-shape[data-id]").count();
  // Los puntos de la última figura guardada, leídos de lo que la app manda a Rust.
  const ultimosPuntos = async () => {
    await page.waitForTimeout(1600);
    return page.evaluate(() => {
      const llamadas = window.__llamadas.filter(([c]) => c === "save_board");
      const ultima = llamadas[llamadas.length - 1];
      if (!ultima) return null;
      try {
        const t = JSON.parse(ultima[1].content).trazos ?? [];
        return t.length ? t[t.length - 1].p : [];
      } catch {
        return null;
      }
    });
  };
  const zona = await page.locator(".canvas-draw").first().boundingBox();
  const X = zona.x + zona.width * 0.3;
  const Y = zona.y + zona.height * 0.35;

  // 1. Flecha de tres puntos cerrada con doble clic.
  await page.keyboard.press("f");
  await page.waitForTimeout(200);
  await page.mouse.click(X, Y);
  await page.mouse.click(X + 200, Y);
  await page.mouse.dblclick(X + 200, Y + 150);
  await page.waitForTimeout(400);
  ok("la flecha se guardó", (await guardados()) === 1, `figuras: ${await guardados()}`);
  const p = await ultimosPuntos();
  ok("tiene tres puntos y no cuatro", !!p && p.length === 6, JSON.stringify(p));
  if (p && p.length >= 4) {
    const ultimo = Math.hypot(p[p.length - 2] - p[p.length - 4], p[p.length - 1] - p[p.length - 3]);
    ok("su último tramo no mide cero (la punta no mira siempre al este)", ultimo > 1, `tramo: ${ultimo.toFixed(2)}`);
  }

  // 2. Cambiar de herramienta con una línea a medias.
  const enDisco = async () => {
    await page.waitForTimeout(1600);
    return page.evaluate(() => {
      const llamadas = window.__llamadas.filter(([c]) => c === "save_board");
      const ultima = llamadas[llamadas.length - 1];
      try {
        return (JSON.parse(ultima[1].content).trazos ?? []).length;
      } catch {
        return -1;
      }
    });
  };
  await page.keyboard.press("l");
  await page.waitForTimeout(200);
  await page.mouse.click(X, Y + 250);
  await page.mouse.click(X + 150, Y + 250);
  await page.keyboard.press("f");
  await page.waitForTimeout(400);
  const enPantalla = await guardados();
  const guardadas = await enDisco();
  ok("lo que llevabas clavado se guarda al cambiar de herramienta", guardadas === 2, `guardadas: ${guardadas}`);
  ok("sin línea fantasma: lo que se ve es lo que hay guardado", enPantalla === guardadas, `en pantalla ${enPantalla}, guardadas ${guardadas}`);
  await page.mouse.click(X + 400, Y + 250);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok("y el siguiente clic ya no le añade puntos a aquella línea", (await enDisco()) === 2);
  return r.join("\n");
}
