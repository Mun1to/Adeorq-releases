// Que los tres oficios de la caja de Adeo en la Cabina (Preguntar, Escribir el encargo y
// Planear) enseñen su error cuando Rust falla. Hasta el 2026-11-17 solo Planear lo hacía:
// Preguntar y Mejorar lo guardaban, pero el aviso solo se pintaba en la fase «error», que
// ellos no ponen (lo cazó la revisión aparte de la rama de las capturas pegadas).
//
// Con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/adeo-errores-cabina.js
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const pasos = {};
  const fallos = [];
  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  // Los tres comandos fallan con un texto que se reconoce en pantalla.
  await page.addInitScript(() => {
    const d = window.__TAURI_INTERNALS__;
    const antes = d.invoke;
    d.invoke = (cmd, args) =>
      ["foreman_agente", "foreman_prompt", "foreman_plan"].includes(cmd)
        ? Promise.reject(`FALLO-DE-${cmd}: Adeo se quedó pensando demasiado (3 min); reintenta`)
        : antes(cmd, args);
  });
  await page.reload();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(1500);
  await page.locator('.topbar button[data-tip="Cabina"], .tabs button:has-text("Cabina")').first().click().catch(() => {});
  await page.waitForTimeout(500);
  if (!(await page.locator(".grid > .pane").count())) {
    await page.evaluate(() => document.querySelector("button.mini.mini-claude")?.click());
    await page.waitForTimeout(1500);
  }
  await page.locator(".franja-btn:has(.orbe)").first().click().catch(() => {});
  await page.waitForTimeout(800);
  const escribir = () => page.evaluate(() => {
    const caja = document.querySelector(".foreman-input");
    if (!caja) return false;
    const poner = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    poner.call(caja, "qué ves en esta captura");
    caja.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  for (const [nombre, boton, cmd] of [
    ["preguntar", /^(Preguntar|Ask)$/, "foreman_agente"],
    ["mejorar", /^(Escribir el encargo|Escribir y ponerlo|Write the brief|Write and place it)$/, "foreman_prompt"],
    ["planear", /^(Planear|Plan it|Plan)$/, "foreman_plan"],
  ]) {
    pasos[nombre] = { caja: await escribir() };
    await page.waitForTimeout(200);
    const clic = await page.evaluate((src) => {
      const re = new RegExp(src);
      const b = [...document.querySelectorAll(".foreman-row button")].find((x) => re.test(x.textContent.trim()));
      if (!b) return [...document.querySelectorAll(".foreman-row button")].map((x) => x.textContent.trim());
      b.click();
      return true;
    }, boton.source);
    await page.waitForTimeout(1200);
    const visto = await page.evaluate((cmd) => document.body.innerText.includes(`FALLO-DE-${cmd}`), cmd);
    pasos[nombre].clic = clic;
    pasos[nombre].errorEnPantalla = visto;
    if (clic !== true) fallos.push(`${nombre}: no encuentro su botón (hay: ${JSON.stringify(clic)})`);
    else if (!visto) fallos.push(`${nombre}: el error de ${cmd} no sale en pantalla`);
  }
  return { pasos, fallos };
}
