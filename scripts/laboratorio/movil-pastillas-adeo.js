// La pastilla de Adeo en el móvil (2026-10-21, «la 1»): una sola, «Sonnet ·
// Router», que abre dentro de la caja con qué piensa Adeo (programa y escalón)
// y con qué se abren sus sesiones (el router o un programa, y con uno que admita
// modelo, el router o uno fijo). Sustituye a las tres `select` de la mañana,
// que no cabían. Contra el doble recién arrancado (4390), a 390 px:
//
//   node scripts/laboratorio/bancos-movil.mjs pastillas
//
// Lo que se elige se comprueba volviendo a entrar en la conversación: si la
// pastilla sigue diciendo lo mismo es que el PC (el doble) lo guardó, no que el
// botón se quedó como lo dejó el dedo.
//
// Devuelve { fallos, fotos }: `fallos` vacío es que todo está en su sitio.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pastilla = () => page.$eval("#adeo", (b) => b.textContent.replace(/\s+/g, " ").trim());
  const abierta = () => page.$eval("#elegir-adeo", (el) => !el.hidden);
  const fila = (que) => page.$$eval(`#elegir-adeo .seg[data-que="${que}"] button`, (bs) => bs.map((b) => `${b.textContent}${b.getAttribute("aria-checked") === "true" ? "*" : ""}`));
  const tocar = async (que, valor) => {
    await page.click(`#elegir-adeo .seg[data-que="${que}"] button[data-valor="${valor}"]`);
    await page.waitForTimeout(700);
  };
  const abrir = async () => {
    if (!(await abierta())) await page.click("#adeo");
    await page.waitForTimeout(200);
  };
  const reentrar = async () => {
    await page.goto(`${B}/?vez=${Math.random()}`);
    await page.waitForSelector("#filas .fila");
    await page.click("#filas .fila");
    await page.waitForSelector("#adeo");
    await page.waitForFunction(() => /·/.test(document.getElementById("adeo").textContent));
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
  await page.waitForSelector("#adeo");
  await page.waitForFunction(() => /·/.test(document.getElementById("adeo").textContent));

  // 1. De entrada: «Sonnet · Router», cerrada, y cabe entera en la caja.
  debe((await pastilla()) === "Sonnet · Router", `de fábrica, Sonnet y el router (${await pastilla()})`);
  debe(!(await abierta()), "nace cerrada");
  const cabe = await page.$eval(".mandos .pastillas", (el) => ({ visto: el.clientWidth, entero: el.scrollWidth }));
  debe(cabe.entero <= cabe.visto + 1, `la pastilla y Mejorar caben sin deslizar (${cabe.entero} de ${cabe.visto} px)`);
  await page.screenshot({ path: ".playwright-mcp/movil-pastillas-1.png" });

  // 2. Abierta: los programas para pensar (Gemini sin instalar no sale), sus
  //    escalones, y con qué se abren las sesiones; sin «Con qué modelo».
  await abrir();
  debe(await abierta(), "al tocarla se abre");
  debe((await fila("pensador")).join("|") === "Claude*|Codex", `piensa con Claude o Codex: ${(await fila("pensador")).join(" | ")}`);
  debe((await fila("escalon")).join("|") === "Haiku|Sonnet*|Opus", `los escalones de Claude con su nombre: ${(await fila("escalon")).join(" | ")}`);
  debe((await fila("programa")).join("|") === "Router*|Claude|Codex|Antigravity", `Router primero y luego los programas: ${(await fila("programa")).join(" | ")}`);
  debe(!(await fila("fijo")).length, "con el router no hay modelo que elegir");
  await page.screenshot({ path: ".playwright-mcp/movil-pastillas-2.png" });

  // 3. Pensar con Codex a fondo (dos toques, la barra sigue abierta): se guarda.
  await tocar("pensador", "codex");
  debe(await abierta(), "tras un toque la barra sigue abierta");
  debe((await fila("escalon")).join("|") === "Rápido|Normal*|A fondo", `con Codex, los escalones por su nombre de la casa: ${(await fila("escalon")).join(" | ")}`);
  await tocar("escalon", "opus");
  await reentrar();
  debe((await pastilla()) === "Codex · A fondo · Router", `pensar con Codex a fondo se guarda (${await pastilla()})`);

  // 4. Sesiones con Codex: sale «Con qué modelo», con el router eligiendo.
  await abrir();
  await tocar("programa", "codex");
  debe((await fila("fijo")).join("|") === "Router*|Rápido|Normal|A fondo", `con un programa forzado, su modelo con el router de entrada: ${(await fila("fijo")).join(" | ")}`);

  // 5. Un modelo fijo apaga el router, y se guarda.
  await tocar("fijo", "haiku");
  await reentrar();
  debe((await pastilla()) === "Codex · A fondo · Codex Rápido", `Codex con Rápido fijo se guarda (${await pastilla()})`);

  // 6. Un programa sin modelo fijo posible devuelve el modelo al router.
  await abrir();
  await tocar("programa", "agy");
  debe(!(await fila("fijo")).length, "Antigravity no admite modelo: no sale «Con qué modelo»");
  await tocar("programa", "claude");
  debe((await fila("fijo"))[0] === "Router*", `y al volver a uno que sí, el router manda (${(await fila("fijo")).join(" | ")})`);

  // 7. Router: todo al router otra vez. Y al escribir, la barra se pliega.
  await tocar("programa", "");
  await page.click("#texto");
  await page.waitForTimeout(200);
  debe(!(await abierta()), "al ponerte a escribir, la barra se pliega");
  await reentrar();
  debe((await pastilla()) === "Codex · A fondo · Router", `Router lo devuelve todo al router (${await pastilla()})`);

  // 8. Que quepa: nada desborda la página a lo ancho, ni con la barra abierta.
  await abrir();
  const ancho = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth }));
  debe(ancho.doc <= ancho.vw, `la página no se desborda a lo ancho (${ancho.doc} > ${ancho.vw})`);

  return { fallos, cabe, ancho, fotos: [".playwright-mcp/movil-pastillas-1.png", ".playwright-mcp/movil-pastillas-2.png"] };
}
