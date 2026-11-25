// La tapa de la noche (`SaludTapa.tsx`), con el doble de Tauri y sin la app.
// Munir, 2026-11-24 (decisión d1a20f78a7b9): «Avisa y tapa la ventana con un
// aviso (se pospone con un clic)», quince minutos antes.
//
// Con el horario puesto alrededor de la hora de ahora (el cierre a +10 min o a
// −1 min, y el despertar a +3 h, que vale a cualquier hora del día), mira:
//   - a 10 minutos del cierre, la franja abajo y nada tapado;
//   - pasado el cierre, la ventana tapada, con el foco en su botón;
//   - un clic en «15 minutos más» la destapa, deja la franja y guarda lo pospuesto;
//   - apagado en Ajustes, nada.
// Se lanza con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/salud-tapa.js
// Deja fotos en %TEMP% (salud-tapa-*.png). Devuelve { pasos, fallos }.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const fotos = (process.env.TEMP || process.env.TMPDIR || ".").replace(/\\/g, "/");
  const hhmm = (min) => {
    const d = new Date(Date.now() + min * 60000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  // El doble deja la casa limpia en cada carga: lo de Salud pasa por `sessionStorage`.
  await page.addInitScript(() => {
    try {
      for (const k of ["adeorq-salud", "adeorq-salud-pospuesto"]) {
        const v = sessionStorage.getItem(k);
        if (v) localStorage.setItem(k, v);
      }
    } catch { /* sin almacén */ }
  });
  const abrir = async (salud) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.evaluate((s) => {
      sessionStorage.setItem("adeorq-salud", JSON.stringify(s));
      sessionStorage.removeItem("adeorq-salud-pospuesto");
    }, salud);
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="cabina"]').waitFor({ state: "attached", timeout: 20000 });
    await page.waitForTimeout(600);
  };
  const base = { porDia: false, dias: Array(7).fill("01:00"), avisoMin: 15, despierta: hhmm(180) };

  await abrir({ ...base, activo: true, cierre: hhmm(10) });
  pasos.aviso = {
    franja: await page.locator(".salud-franja").isVisible(),
    texto: (await page.locator(".salud-franja").textContent().catch(() => "")) || "",
    tapa: await page.locator(".salud-tapa").count(),
  };
  debe(pasos.aviso.franja && /hora de cierre \(\d{1,2}:\d\d\)/.test(pasos.aviso.texto) && pasos.aviso.tapa === 0, `a 10 minutos no sale la franja sola: ${JSON.stringify(pasos.aviso)}`);
  await page.screenshot({ path: `${fotos}/salud-tapa-aviso.png` });

  await abrir({ ...base, activo: true, cierre: hhmm(-1) });
  pasos.tapada = {
    tapa: await page.locator(".salud-tapa").isVisible(),
    titulo: (await page.locator("#salud-titulo").textContent().catch(() => "")) || "",
    foco: await page.evaluate(() => document.activeElement?.closest(".salud-tapa") !== null && document.activeElement?.tagName === "BUTTON"),
    franja: await page.locator(".salud-franja").count(),
    texto: (await page.locator(".salud-tapa .modal-text").textContent().catch(() => "")) || "",
  };
  // Las horas entre paréntesis y sin artículo: «a las 1:00» está mal dicho.
  debe(/cerrar \(\d{1,2}:\d\d\)\. .*despertar \(\d{1,2}:\d\d\)\./.test(pasos.tapada.texto), `el texto de la tapa no dice las dos horas: ${pasos.tapada.texto}`);
  debe(pasos.tapada.tapa && pasos.tapada.titulo === "Hora de descansar" && pasos.tapada.franja === 0, `pasado el cierre no se tapa: ${JSON.stringify(pasos.tapada)}`);
  debe(pasos.tapada.foco, "tapada, el foco no está en su botón");
  await page.screenshot({ path: `${fotos}/salud-tapa-tapada.png` });

  const antes = Date.now();
  await page.getByRole("button", { name: "15 minutos más" }).click();
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("adeorq-salud-pospuesto") || "null"));
  pasos.pospuesto = {
    tapa: await page.locator(".salud-tapa").count(),
    franja: await page.locator(".salud-franja").isVisible(),
    minutos: p ? Math.round((p.hasta - antes) / 60000) : null,
  };
  debe(pasos.pospuesto.tapa === 0 && pasos.pospuesto.franja && pasos.pospuesto.minutos === 15, `el clic no la pospone 15 minutos: ${JSON.stringify(pasos.pospuesto)}`);

  await abrir({ ...base, activo: false, cierre: hhmm(-1) });
  pasos.apagado = await page.locator(".salud-tapa, .salud-franja").count();
  debe(pasos.apagado === 0, "apagado, algo se pinta igual");

  return { pasos, fallos };
}
