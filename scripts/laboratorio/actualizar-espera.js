// ¿Corta la actualización a un agente que ACABA de ponerse a trabajar?
//
// Lo que le pasó a Munir el 2026-10-08 a las 00:47, pasando de la 0.9.165 a la
// 0.9.167: le escribió «súbelo y verifica que todo esté bien» al panel de
// munito.dev, la app se reinició ocho segundos después y el agente volvió
// diciendo «No response requested»; hubo que escribírselo otra vez. La tarjeta
// solo miraba el estado que sale del transcript, que cada panel relee cada 20
// segundos, así que un agente recién puesto a trabajar seguía constando como
// «lista».
//
// Recorre dos casos sobre un tablero sembrado con un Claude en estado «lista»
// y una versión nueva esperando:
//
//   moviéndose  el agente escribe en su terminal (como el spinner de Claude
//               mientras trabaja) y se pulsa la tarjeta: NO se puede instalar
//               todavía, y la tarjeta tiene que decir que espera.
//   quieto      deja de escribir: a los pocos segundos la tarjeta instala sola.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/actualizar-espera.js" })
async (page) => {
  const SEMBRADO = JSON.stringify({
    panes: [
      { name: "munito.dev", cwd: "C:\\proyectos\\Adeorq", command: ["cmd.exe", "/k", "chcp 65001 >nul && claude --permission-mode acceptEdits --session-id 11111111-2222-4333-8444-555555555555"] },
    ],
    cols: [{ w: 1, hs: [1], idx: [0] }],
    ocultos: [],
  });
  await page.addInitScript((texto) => {
    try {
      if (sessionStorage.getItem("__sembrar")) localStorage.setItem("adeorq-layout", texto);
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
    window.__estadoPanel = "lista";
    window.__actualizacion = "9.9.9";
  }, SEMBRADO);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(6000);
  await page.evaluate(() => sessionStorage.removeItem("__sembrar"));

  const instalo = () =>
    page.evaluate(() =>
      window.__llamadas
        .map(([c]) => c)
        .filter((c) => c === "plugin:updater|install" || c === "plugin:updater|download_and_install"),
    );
  const tarjeta = () => page.locator(".update-card").first().innerText().catch(() => "(sin tarjeta)");
  const panel = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => a.id)[0]);

  // El agente se pone a trabajar: escribe cada medio segundo, como su spinner.
  await page.evaluate((id) => {
    window.__latido = window.setInterval(() => window.__emitir("pty-data", { id, data: "\r✻ Pensando…" }), 500);
  }, panel);
  await page.waitForTimeout(1500);
  await page.locator(".update-card-main").first().click();
  await page.waitForTimeout(3000);
  const moviendose = { instalo: await instalo(), tarjeta: await tarjeta() };

  // Para: el turno acabó y no sale nada más.
  await page.evaluate(() => window.clearInterval(window.__latido));
  await page.waitForTimeout(12000);
  const quieto = { instalo: await instalo(), tarjeta: await tarjeta() };

  return { panel, moviendose, quieto };
}
