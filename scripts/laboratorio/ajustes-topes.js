// Ajustes › Terminales: los dos topes que van por la memoria libre
// (`AjusteAbrirDeGolpe.tsx` y `AjusteTopeAgentes.tsx`, decisión d1a213cb2ce0).
//
// Mira, con el doble de Tauri y sin la app, a 1536 (su monitor al 125 %):
//   - los dos interruptores salen encendidos de fábrica y los números dicen «Como mucho»;
//   - apagar el de abrir de golpe se guarda en `adeorq-open-all-memoria` y el rótulo
//     vuelve a «Cuántas sesiones abre de golpe un proyecto»;
//   - apagar el de los agentes y bajar su número con la flecha llega a Rust
//     (`fijar_tope_agentes`, en el doble `window.__topeAgentes`) y cambia el rótulo;
//   - con la memoria para dos, una sesión nueva deja elegir «hasta 2».
// Se lanza con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/ajustes-topes.js
// Deja fotos en %TEMP% (ajustes-topes-*.png). Devuelve { pasos, fallos }.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const fotos = (process.env.TEMP || process.env.TMPDIR || ".").replace(/\\/g, "/");

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);

  await page.setViewportSize({ width: 1536, height: 864 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-lang", "es");
      localStorage.setItem("adeorq-ajustes-seccion", "terminales");
    } catch { /* sin almacén */ }
    window.__cabida = { totalMb: 8192, libreMb: 3072, reservaMb: 2048, porTerminalMb: 500, caben: 2 };
  });
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ state: "attached", timeout: 20000 });
  await page.evaluate(() => document.querySelector('[data-tab="ajustes"]').click());
  await page.getByRole("heading", { name: "Terminales" }).first().waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(400);

  const fila = (texto) => page.locator(".setting-row", { hasText: texto }).first();
  const marcada = (texto) => fila(texto).locator('input[type="checkbox"]').isChecked();

  const golpe = "Abrir de golpe solo las sesiones que quepan en la memoria libre";
  const agentes = "Que tus agentes abran solo las terminales que quepan en la memoria libre";
  pasos.golpeDeFabrica = await marcada(golpe);
  pasos.agentesDeFabrica = await marcada(agentes);
  debe(pasos.golpeDeFabrica === true, "abrir de golpe por memoria viene encendido");
  debe(pasos.agentesDeFabrica === true, "los agentes por memoria viene encendido");
  pasos.rotulosComoMucho = await page.locator(".setting-row", { hasText: "Como mucho," }).count();
  debe(pasos.rotulosComoMucho === 2, `los dos números dicen «Como mucho» (salen ${pasos.rotulosComoMucho})`);
  await fila(golpe).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${fotos}/ajustes-topes-encendidos.png` });

  await fila(golpe).locator('input[type="checkbox"]').click();
  pasos.golpeGuardado = await page.evaluate(() => localStorage.getItem("adeorq-open-all-memoria"));
  debe(pasos.golpeGuardado === "0", "apagado se guarda como «0»");
  pasos.rotuloFijo = await fila("Cuántas sesiones abre de golpe un proyecto").count();
  debe(pasos.rotuloFijo === 1, "apagado, el rótulo es el de siempre");

  await fila(agentes).locator('input[type="checkbox"]').click();
  await page.waitForTimeout(200);
  const numeroAgentes = fila("Terminales abiertas por tus agentes a la vez").locator('input[type="range"]');
  await numeroAgentes.focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(300);
  pasos.agentesEnRust = await page.evaluate(() => window.__topeAgentes ?? null);
  debe(pasos.agentesEnRust?.porMemoria === false, "apagar los agentes llega a Rust");
  debe(pasos.agentesEnRust?.comoMucho === 11, `la flecha baja el número a 11 (sale ${pasos.agentesEnRust?.comoMucho})`);
  await page.screenshot({ path: `${fotos}/ajustes-topes-apagados.png` });

  // Una sesión nueva con abrir de golpe por la memoria y sitio para dos.
  await page.evaluate(() => localStorage.removeItem("adeorq-open-all-memoria"));
  await page.evaluate(() => window.dispatchEvent(new Event("adeorq-open-all-memoria")));
  await page.evaluate(() => document.querySelector('[data-tab="cabina"]').click());
  await page.waitForTimeout(600);
  const nueva = page.locator(".rail-new:visible").first();
  pasos.botonNueva = await nueva.count();
  if (pasos.botonNueva) {
    await nueva.click();
    await page.waitForTimeout(800);
    await page.locator(".wizard .wiz-item", { hasText: "Vidorq" }).first().click({ timeout: 5000 });
    await page.getByRole("button", { name: "Siguiente" }).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(800);
    pasos.chips = await page.locator(".chip-row .choice").allTextContents().catch(() => []);
    pasos.hasta = await page.locator(".count-max").first().textContent({ timeout: 3000 }).catch(() => null);
    await page.screenshot({ path: `${fotos}/ajustes-topes-nueva.png` });
  }
  debe(pasos.hasta === "hasta 2", `con sitio para dos, una sesión nueva deja hasta 2 (sale ${pasos.hasta})`);
  return { pasos, fallos };
}
