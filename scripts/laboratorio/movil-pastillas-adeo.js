// Las pastillas de Adeo en el móvil, las mismas que en el PC (2026-10-21):
// «Conserje: programa · escalón», «Sesiones: Router» o un programa, y «Modelo»
// solo con un programa forzado que lo admita. Contra el doble recién arrancado
// (`node scripts/laboratorio/doble-movil.mjs`, en el 4390), a 390 px:
//
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-pastillas-adeo.js")
//
// Lo que se elige se comprueba volviendo a entrar en la conversación: si la
// pastilla sigue diciendo lo mismo es que el PC (el doble) lo guardó, no que el
// `select` se quedó como lo dejó el dedo.
//
// Devuelve { fallos, fotos }: `fallos` vacío es que todo está en su sitio.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const textos = (sel) => page.$$eval(`${sel} option`, (os) => os.map((o) => o.textContent));
  const valor = (sel) => page.$eval(sel, (s) => s.value);
  const oculto = () => page.$eval("#fijo-caja", (el) => el.hidden);
  const reentrar = async () => {
    await page.click(".barra button, #cajon-boton").catch(() => {});
    await page.goto(`${B}/`);
    await page.waitForSelector("#filas .fila");
    await page.click("#filas .fila");
    await page.waitForSelector("#cerebro option", { state: "attached" });
    await page.waitForTimeout(300);
  };

  await page.goto(`${B}/`);
  await page.setViewportSize({ width: 780, height: 1600 });
  const k = 780 / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(390 * k), height: Math.round(844 * k) });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${B}/`);
  await page.waitForSelector("#codigo");
  await page.fill("#codigo", "123456");
  await page.click("#entrar");
  await page.waitForSelector("#filas .fila");
  await page.click("#filas .fila");
  await page.waitForSelector("#cerebro option", { state: "attached" });
  await page.waitForTimeout(300);

  // 1. De entrada: Claude Sonnet, el router, y sin «Modelo».
  const cerebros = await textos("#cerebro");
  debe(cerebros.includes("Conserje: Claude Sonnet") && cerebros.includes("Conserje: Codex · Normal"), `el conserje ofrece Claude y Codex por escalones: ${cerebros.join(" | ")}`);
  debe(!cerebros.some((t) => /Gemini/.test(t)), "un programa sin instalar no sale para pensar");
  debe((await valor("#cerebro")) === "claude:sonnet", `de fábrica piensa con Claude Sonnet (${await valor("#cerebro")})`);
  const programas = await textos("#programa");
  debe(programas.join("|") === "Sesiones: Router|Sesiones: Claude|Sesiones: Codex|Sesiones: Antigravity", `Router primero y luego los programas: ${programas.join(" | ")}`);
  debe((await valor("#programa")) === "", "de fábrica las sesiones las elige el router");
  debe(await oculto(), "con el router no hay «Modelo» que elegir");
  await page.screenshot({ path: ".playwright-mcp/movil-pastillas-1.png" });

  // 2. Pensar con Codex a fondo: se guarda programa y escalón.
  await page.selectOption("#cerebro", "codex:opus");
  await page.waitForTimeout(600);
  await reentrar();
  debe((await valor("#cerebro")) === "codex:opus", `pensar con Codex a fondo se guarda (${await valor("#cerebro")})`);

  // 3. Sesiones con Codex: sale «Modelo», con el router eligiendo.
  await page.selectOption("#programa", "codex");
  await page.waitForTimeout(600);
  debe(!(await oculto()), "con un programa forzado sale «Modelo»");
  debe((await valor("#fijo")) === "router", `y empieza con el router eligiendo el modelo (${await valor("#fijo")})`);
  const modelos = await textos("#fijo");
  debe(modelos[0] === "Modelo: lo elige el router" && modelos.includes("Modelo: A fondo"), `los modelos de Codex por escalón: ${modelos.join(" | ")}`);

  // 4. Un modelo fijo apaga el router, y se guarda.
  await page.selectOption("#fijo", "haiku");
  await page.waitForTimeout(600);
  await reentrar();
  debe((await valor("#programa")) === "codex" && (await valor("#fijo")) === "haiku", `Codex con Rápido fijo se guarda (${await valor("#programa")}, ${await valor("#fijo")})`);
  await page.screenshot({ path: ".playwright-mcp/movil-pastillas-2.png" });

  // 5. Un programa sin modelo fijo posible devuelve el modelo al router.
  await page.selectOption("#programa", "agy");
  await page.waitForTimeout(600);
  debe(await oculto(), "Antigravity no admite modelo: no sale «Modelo»");
  await page.selectOption("#programa", "claude");
  await page.waitForTimeout(600);
  debe((await valor("#fijo")) === "router", `y al volver a uno que sí, el router manda (${await valor("#fijo")})`);

  // 6. Router: todo al router otra vez.
  await page.selectOption("#programa", "");
  await page.waitForTimeout(600);
  await reentrar();
  debe((await valor("#programa")) === "" && (await oculto()), "Router lo devuelve todo al router");

  // 7. Que quepan: las pastillas no desbordan la caja a lo ancho.
  const ancho = await page.$eval(".pastillas", (el) => ({ sw: el.scrollWidth, cw: el.clientWidth, vw: innerWidth, doc: document.documentElement.scrollWidth }));
  debe(ancho.doc <= ancho.vw, `la página no se desborda a lo ancho (${ancho.doc} > ${ancho.vw})`);

  return { fallos, ancho, fotos: [".playwright-mcp/movil-pastillas-1.png", ".playwright-mcp/movil-pastillas-2.png"] };
}
