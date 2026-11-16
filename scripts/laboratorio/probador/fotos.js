// Fotos y medidas de una dirección del probador, en oscuro (su Windows va en
// oscuro, y un navegador sin ventana sale en claro si no se emula) y a 1920x1080.
// Con el probador en marcha (probador.mjs):
//   OPCION=1 [SALIDA=<carpeta>] [PANTALLAS=cabina,ajustes] [PUERTO=5240] node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/probador/fotos.js
// Pantallas: cabina, menu, dialogo, panel, perfil, ajustes, decisiones, chat (todas si no se dice).
// Por defecto las fotos van a %TEMP%\adeorq-probador\fotos, como <pantalla>-<opción>.png.
// Devuelve las rutas de las fotos y, por pantalla, cuántos textos visibles hay por
// debajo de 12 y de 13 px y cuántos salen cortados con «…».
async (page) => {
  const OPCION = Number(process.env.OPCION || 0);
  const PUERTO = Number(process.env.PUERTO || 5240);
  const SALIDA = (process.env.SALIDA || `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/adeorq-probador/fotos`).replace(/\\/g, "/").replace(/\/?$/, "/");
  const QUIERO = (process.env.PANTALLAS || "cabina,menu,dialogo,panel,perfil,ajustes,decisiones,chat").split(",");
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 160)); });
  page.on("requestfailed", (r) => errores.push(`falló ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) errores.push(`${r.status()} ${r.url()}`); });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`http://127.0.0.1:${PUERTO}/?opcion=${OPCION}`);
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(900);

  const medir = () =>
    page.evaluate(() => {
      let bajo12 = 0, bajo13 = 0, cortados = 0, textos = 0;
      const vistos = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest(".xterm")) continue;
        const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!propio) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
        textos++;
        const px = parseFloat(cs.fontSize);
        if (px < 12) { bajo12++; if (vistos.length < 6) vistos.push(`${px}px «${el.textContent.trim().slice(0, 24)}»`); }
        if (px < 13) bajo13++;
        if (el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflowX) && cs.textOverflow === "ellipsis") cortados++;
      }
      return { textos, bajo12, bajo13, cortados, ejemplosBajo12: vistos };
    });

  const fotos = [];
  const medidas = {};
  const foto = async (nombre) => {
    await page.waitForTimeout(350);
    const ruta = `${SALIDA}${nombre}-${OPCION}.png`;
    await page.screenshot({ path: ruta });
    fotos.push(ruta);
    medidas[nombre] = await medir();
  };
  const tab = async (t, espera) => {
    await page.locator(`[data-tab="${t}"]`).click();
    await page.waitForTimeout(espera);
  };

  await tab("cabina", 2200);
  if (QUIERO.includes("cabina")) await foto("cabina");
  if (QUIERO.includes("menu")) {
    await page.locator(".layout-btn").click();
    await page.waitForTimeout(350);
    await foto("menu");
    await page.locator(".layout-btn").click();
  }
  if (QUIERO.includes("dialogo")) {
    await page.locator(".tab-danger").first().click();
    await page.waitForTimeout(350);
    await foto("dialogo");
    await page.locator(".modal-overlay").click({ position: { x: 6, y: 6 } });
    await page.waitForTimeout(300);
  }
  if (QUIERO.includes("panel")) { await tab("panel", 1300); await foto("panel"); }
  if (QUIERO.includes("perfil")) { await tab("perfil", 1300); await foto("perfil"); }
  if (QUIERO.includes("ajustes")) { await tab("ajustes", 1100); await foto("ajustes"); }
  if (QUIERO.includes("decisiones")) {
    const d = page.locator('[data-tab="decisiones"]');
    if (await d.count()) { await d.click(); await page.waitForTimeout(1100); await foto("decisiones"); }
  }
  if (QUIERO.includes("chat")) {
    await tab("chat", 700);
    await page.locator(".cj-nueva").click();
    await page.waitForTimeout(500);
    await page.locator(".chat-input").fill("Arregla el scroll de las terminales y mira por qué se cae el radar");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5200);
    await foto("chat");
  }
  return { opcion: OPCION, fotos, medidas, errores: [...new Set(errores)].slice(0, 12) };
}
