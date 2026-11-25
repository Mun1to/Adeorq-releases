// Ajustes › Salud: el horario de cierre de cada noche (`AjustesSalud.tsx`).
// Munir, 2026-11-24: «una función de salud en Adeorq, en ajustes, de horario
// de ponerte topes [...] que puedas editar y posponer cuanto quieras».
//
// Mira, con el doble de Tauri y sin la app, a 1536 (su monitor al 125 %):
//   - la sección sale en la barra y viene apagada;
//   - encenderla, cambiar la hora a las 0:30 y el aviso a 30 minutos se guarda
//     en `adeorq-salud`, y sigue igual al volver a abrir;
//   - «Cada noche a su hora» enseña las siete noches, del lunes al domingo, y
//     «sin tope» en la del lunes la deja en `null` con su hora apagada.
// Se lanza con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/ajustes-salud.js
// Deja fotos en %TEMP% (ajustes-salud-*.png). Devuelve { pasos, fallos }.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const fotos = (process.env.TEMP || process.env.TMPDIR || ".").replace(/\\/g, "/");

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);

  const abrir = async () => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.addInitScript(() => {
      try {
        localStorage.setItem("adeorq-lang", "es");
        localStorage.setItem("adeorq-ajustes-seccion", "salud");
      } catch { /* sin almacén */ }
    });
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="cabina"]').waitFor({ state: "attached", timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-tab="ajustes"]').click());
    await page.getByRole("heading", { name: "Salud" }).waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(400);
  };
  const guardado = () => page.evaluate(() => JSON.parse(localStorage.getItem("adeorq-salud") || "null"));
  const fila = (texto) => page.locator(".setting-row", { hasText: texto }).first();

  // El doble deja la casa limpia en cada carga (`localStorage.clear()`): para
  // ver que lo guardado sigue al volver, se pasa por `sessionStorage`.
  await page.addInitScript(() => {
    try {
      const g = sessionStorage.getItem("salud-guardado");
      if (g) localStorage.setItem("adeorq-salud", g);
    } catch { /* sin almacén */ }
  });
  await abrir();
  pasos.enLaBarra = await page.locator(".set-tab", { hasText: "Salud" }).count();
  debe(pasos.enLaBarra === 1, "la sección Salud no sale en la barra de Ajustes");
  pasos.apagadaDeFabrica = !(await fila("Cerrar Adeorq por la noche").locator("input").isChecked());
  debe(pasos.apagadaDeFabrica, "viene encendida de fábrica");

  await fila("Cerrar Adeorq por la noche").locator("input").check();
  await fila("Hora de cierre").locator("input").fill("00:30");
  await fila("Avisar antes").locator("select").selectOption("30");
  const g1 = await guardado();
  pasos.guardado = g1 && { activo: g1.activo, cierre: g1.cierre, avisoMin: g1.avisoMin };
  debe(g1?.activo === true && g1?.cierre === "00:30" && g1?.avisoMin === 30, `no se guardó lo cambiado: ${JSON.stringify(pasos.guardado)}`);
  await page.screenshot({ path: `${fotos}/ajustes-salud-fija.png` });

  await fila("Cada noche a su hora").locator("input").check();
  pasos.noches = await page.locator(".salud-noche > span").allTextContents();
  debe(pasos.noches.length === 7 && pasos.noches[0] === "La noche del lunes" && pasos.noches[6] === "La noche del domingo", `las noches no salen del lunes al domingo: ${pasos.noches}`);
  pasos.sinHoraFija = await page.locator(".setting-row", { hasText: "Hora de cierre" }).count();
  debe(pasos.sinHoraFija === 0, "con cada noche a su hora sigue la hora de todas");
  const lunes = page.locator(".salud-noche", { hasText: "La noche del lunes" });
  await lunes.locator(".salud-sin input").check();
  const g2 = await guardado();
  pasos.lunes = g2?.dias?.[1] ?? "falta";
  debe(g2?.porDia === true && g2?.dias?.[1] === null, `«sin tope» no dejó la noche del lunes en null: ${JSON.stringify(g2?.dias)}`);
  pasos.horaApagada = await lunes.locator(".salud-hora").isDisabled();
  debe(pasos.horaApagada, "la hora de una noche sin tope se sigue pudiendo cambiar");
  pasos.sinTopeSeVe = await lunes.locator(".salud-sin input").evaluate((i) => getComputedStyle(i).backgroundColor !== getComputedStyle(i.closest(".panel-card")).backgroundColor && getComputedStyle(i).appearance === "none");
  debe(pasos.sinTopeSeVe, "«sin tope» no se pinta como los interruptores de Ajustes");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${fotos}/ajustes-salud-noches.png` });

  await page.evaluate(() => sessionStorage.setItem("salud-guardado", localStorage.getItem("adeorq-salud") || ""));
  await abrir();
  pasos.alVolver = {
    activo: await fila("Cerrar Adeorq por la noche").locator("input").isChecked(),
    porDia: await fila("Cada noche a su hora").locator("input").isChecked(),
    aviso: await fila("Avisar antes").locator("select").inputValue(),
  };
  debe(pasos.alVolver.activo && pasos.alVolver.porDia && pasos.alVolver.aviso === "30", `al volver no está como se dejó: ${JSON.stringify(pasos.alVolver)}`);

  return { pasos, fallos };
}
