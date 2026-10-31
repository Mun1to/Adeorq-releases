// Un lienzo guardado que no se puede leer no se sustituye por uno vacío.
//
// Medido el 2026-10-31: `read_board` (Rust) rechaza un tablero de más de 64 MB
// y el lienzo lo trataba como «empieza en blanco», pero encendía el guardado
// automático igual, así que a los 900 ms escribía ese blanco encima del archivo
// bueno. Con una decena de capturas pegadas (van dentro, en base64) el tablero
// entero se perdía al reiniciar. Lo mismo con un JSON que no es un lienzo.
//
// Se lanza con el MCP de Playwright, con Vite en marcha y DESPUÉS de cargar el
// doble (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/lienzo-ilegible.js" })
// Usa el origen en el que ya esté la página, así que vale para cualquier puerto.
async (page) => {
  const origen = new URL(page.url()).origin;
  const bueno = JSON.stringify({ kind: "adeorq-lienzo", version: 1, nodos: [], flechas: [], marca: "el-bueno" });
  const resultado = [];
  const ok = (nombre, cond, detalle = "") => resultado.push(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);

  // El doble contesta `read_board` desde sessionStorage; aquí se le enseña a
  // fallar como Rust cuando hay una marca puesta.
  await page.addInitScript(() => {
    const i = window.__TAURI_INTERNALS__;
    if (!i || i.__conFallo) return;
    const orig = i.invoke;
    i.invoke = (cmd, args, o) => {
      const fallo = sessionStorage.getItem("__tablero_falla");
      if (cmd === "read_board" && fallo) return Promise.reject(fallo);
      return orig(cmd, args, o);
    };
    i.__conFallo = true;
  });

  const alLienzo = async () => {
    await page.goto(origen);
    await page.waitForTimeout(2500);
    await page.locator('.topbar button[data-tip="Lienzo"], .tabs button:has-text("Lienzo")').first().click();
    // La vuelta, y los 900 ms del guardado automático con margen.
    await page.waitForTimeout(3000);
  };

  // 1. Rust no lo puede leer (pesa más de 64 MB).
  await page.evaluate((b) => {
    sessionStorage.setItem("__tablero", b);
    sessionStorage.setItem("__tablero_falla", "el lienzo guardado pesa más de 64 MB");
  }, bueno);
  await alLienzo();
  let guardado = await page.evaluate(() => sessionStorage.getItem("__tablero"));
  ok("con la lectura fallida, el archivo bueno sigue intacto", guardado === bueno, `quedó: ${String(guardado).slice(0, 120)}`);
  const aviso = await page.locator(".relay-note").first().textContent().catch(() => "");
  ok("y se avisa de que no se guarda solo", /64 MB/.test(aviso ?? ""), `aviso: «${aviso}»`);

  // 2. Lo leído no es un lienzo (JSON de otra cosa).
  await page.evaluate(() => {
    sessionStorage.removeItem("__tablero_falla");
    sessionStorage.setItem("__tablero", '{"otra":"cosa"}');
  });
  await alLienzo();
  guardado = await page.evaluate(() => sessionStorage.getItem("__tablero"));
  ok("un archivo que no es un lienzo tampoco se pisa", guardado === '{"otra":"cosa"}', `quedó: ${String(guardado).slice(0, 120)}`);

  // 3. Control: con una lectura buena, el guardado automático SÍ escribe (si no,
  //    los dos de arriba saldrían bien sin probar nada).
  await page.evaluate((b) => sessionStorage.setItem("__tablero", b), bueno);
  await alLienzo();
  guardado = await page.evaluate(() => sessionStorage.getItem("__tablero"));
  ok("con una lectura buena, el guardado automático escribe", !!guardado && guardado !== bueno && guardado.includes("adeorq-lienzo"), `quedó: ${String(guardado).slice(0, 120)}`);

  await page.evaluate(() => {
    sessionStorage.removeItem("__tablero_falla");
    sessionStorage.removeItem("__tablero");
  });
  return resultado.join("\n");
}
