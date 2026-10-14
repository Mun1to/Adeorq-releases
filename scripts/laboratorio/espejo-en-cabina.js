// Una terminal que el Capataz abre «en Modo Espejo» en la CABINA, ¿nace de
// verdad aislada?
//
// El Modo Espejo es que el agente escriba en su propio árbol de git y no en tu
// carpeta (`git_shadow.rs`): la terminal tiene que nacer DENTRO de ese árbol.
// Lo que se mira es qué le llega a Rust: un `shadow_init` antes de abrirla, y
// ningún `pty_spawn` en la carpeta del proyecto. El doble no monta espejos, así
// que lo rechaza, y la terminal NO se abre (que es lo que hace la app sin
// espejo: no abrirla antes que abrirla sin aislar).
//
// Se lanza con `pnpm dev` en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/espejo-en-cabina.js" })
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-layout", JSON.stringify({ panes: [], cols: [], ocultos: [] }));
      localStorage.setItem("adeorq-lang", "es");
    } catch { /* sin almacén */ }
  });
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-tab="cabina"]').first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__planCapataz = { resumen: "Un Claude aislado.", acciones: [{ tipo: "claude_nuevo", proyecto: "Adeorq", rol: "Espejo", prompt: "di hola" }] };
    window.__llamadas.length = 0;
  });
  await page.locator(".foreman-call").first().click();
  await page.waitForTimeout(400);
  await page.locator(".foreman-input").first().fill("abre un Claude aislado");
  await page.locator(".foreman-row button", { hasText: /^Planear$/ }).first().click();
  await page.locator(".plan-item").first().waitFor({ timeout: 10000 });
  await page.locator(".plan-shadow-chk input").first().check();
  await page.locator("button", { hasText: /^Ejecutar \d+ acci/ }).first().click();
  await page.waitForTimeout(3000);
  pasos.llamadas = await page.evaluate(() =>
    window.__llamadas.filter(([c]) => c === "shadow_init" || c === "pty_spawn").map(([c, a]) => `${c} ${a.cwd ?? a.projectPath ?? ""}`),
  );
  pasos.vista = await page.evaluate(() => document.querySelector(".tabs .tab[data-active=\"true\"]")?.getAttribute("data-tab"));
  debe(pasos.llamadas.some((l) => l.startsWith("shadow_init")), `no se pidió el espejo antes de abrir: ${JSON.stringify(pasos.llamadas)}`);
  debe(!pasos.llamadas.some((l) => /^pty_spawn C:\\proyectos\\Adeorq$/i.test(l)), `la terminal se abrió en la carpeta del proyecto, sin aislar: ${JSON.stringify(pasos.llamadas)}`);
  return { pasos, fallos };
}
