// ¿Qué le teclea el Capataz a la terminal que tienes delante al despachar un encargo?
//
// Con el modo automático puesto, el Capataz ajusta el panel con foco y le deja
// el encargo escrito. Hasta el 2026-10-08 le mandaba `/model <alias>` y
// `/effort <nivel>` sin mirar qué CLI corría ahí; a un Codex eso le llega como
// un mensaje y se pone a trabajar. Ahora cada CLI recibe solo su idioma
// (`lineasEnVivo` en `lib/providers.ts`): Claude `/model` y `/effort`, Gemini
// `/model set <alias>`, Codex nada.
//
// Recorre tres tableros de una sola terminal (Claude, Gemini y Codex) y para
// cada uno apunta lo que le llegó por `pty_write`.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/despacho-en-vivo.js" })
async (page) => {
  const LINEAS = {
    claude: "chcp 65001 >nul && claude --permission-mode acceptEdits --session-id 11111111-2222-4333-8444-555555555555",
    gemini: "chcp 65001 >nul && gemini --approval-mode auto_edit",
    codex: "chcp 65001 >nul && codex",
  };
  await page.addInitScript(() => {
    try {
      const t = sessionStorage.getItem("__tablero1");
      if (t) localStorage.setItem("adeorq-layout", t);
      localStorage.setItem("adeorq-asistente-auto", "1");
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
  });
  const salida = {};
  for (const [cli, linea] of Object.entries(LINEAS)) {
    const tablero = JSON.stringify({
      panes: [{ name: `Adeorq · ${cli}`, cwd: "C:\\proyectos\\Adeorq", command: ["cmd.exe", "/k", linea] }],
      cols: [{ w: 1, hs: [1], idx: [0] }],
      ocultos: [],
    });
    await page.evaluate((t) => sessionStorage.setItem("__tablero1", t), tablero);
    await page.goto("http://localhost:1420/");
    await page.waitForTimeout(5000);
    await page.locator('[data-tab="cabina"]').first().click();
    await page.waitForTimeout(500);
    // El foco en la terminal, como cuando la tienes delante.
    await page.locator("[data-pane-id]").first().click({ position: { x: 60, y: 60 } });
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__llamadas.length = 0; });
    await page.locator(".foreman-call").first().click();
    await page.waitForTimeout(400);
    await page.locator(".foreman-input").first().fill("revisa el login");
    // El botón del encargo (no «Planear» ni «Preguntar»): busca por su texto.
    const boton = page.locator(".foreman-row button", { hasText: /encargo|Escribir/i }).first();
    if (await boton.count()) await boton.click();
    else await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(2500);
    salida[cli] = await page.evaluate(() =>
      window.__llamadas.filter(([c]) => c === "pty_write").map(([, a]) => JSON.stringify(a.data)).filter((d) => d !== '"\\u001b[I"' && d !== '"\\u001b[O"'),
    );
  }
  await page.evaluate(() => sessionStorage.removeItem("__tablero1"));
  return salida;
}
