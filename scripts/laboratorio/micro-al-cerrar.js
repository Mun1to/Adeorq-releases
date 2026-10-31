// Cerrar el Asistente mientras el micrófono arranca no lo deja abierto.
//
// Medido el 2026-10-31: Ctrl+Mayús+M abre el Asistente ya grabando, pero el
// micrófono tarda un momento en abrirse (pregunta por whisper y pide permiso).
// Si Escape lo cerraba en ese rato, el desmontaje no tenía aún nada que soltar,
// y cuando el micrófono llegaba nadie lo paraba: la luz se quedaba encendida
// hasta cerrar Adeorq. Dos pulsaciones seguidas abrían además dos micrófonos.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/micro-al-cerrar.js" })
async (page) => {
  await page.addInitScript(() => {
    // Un micrófono de mentira que tarda en abrirse y cuenta sus pistas vivas.
    window.__pistas = [];
    const pista = () => {
      const t = { vivo: true, stop() { t.vivo = false; } };
      window.__pistas.push(t);
      return t;
    };
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: () => new Promise((ok) => setTimeout(() => { const t = pista(); ok({ getTracks: () => [t] }); }, 600)) },
    });
    window.MediaRecorder = class { start() {} stop() {} };
    const i = window.__TAURI_INTERNALS__;
    const orig = i.invoke;
    i.invoke = (cmd, args, o) => (cmd === "voz_lista" ? Promise.resolve("ok") : orig(cmd, args, o));
  });
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(2500);
  const vivas = () => page.evaluate(() => window.__pistas.filter((t) => t.vivo).length);
  const abiertas = () => page.evaluate(() => window.__pistas.length);

  // 1. Abrir dictando y cerrar con Escape antes de que llegue el micrófono.
  await page.keyboard.press("Control+Shift+M");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  const tras1 = { abiertas: await abiertas(), vivas: await vivas() };

  // 2. Con el Asistente abierto, dos pulsaciones seguidas: un solo micrófono.
  await page.keyboard.press("Control+Shift+M");
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const antes2 = await abiertas();
  await page.keyboard.press("Control+Shift+A"); // abierto a mano: no graba
  await page.waitForTimeout(600);
  await page.keyboard.press("Control+Shift+M");
  await page.keyboard.press("Control+Shift+M");
  await page.waitForTimeout(1200);
  const tras2 = { nuevas: (await abiertas()) - antes2, vivas: await vivas() };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const alFinal = await vivas();
  return [
    `${tras1.abiertas >= 1 && tras1.vivas === 0 ? "ok  " : "FALLA"} cerrado mientras arrancaba, el micrófono no se queda abierto (${JSON.stringify(tras1)})`,
    `${tras2.nuevas <= 1 ? "ok  " : "FALLA"} dos pulsaciones seguidas abren un solo micrófono (${JSON.stringify(tras2)})`,
    `${alFinal === 0 ? "ok  " : "FALLA"} al cerrar no queda ninguno vivo (${alFinal})`,
  ].join("\n");
}
