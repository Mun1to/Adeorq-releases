// Las zonas que ningún mod toca, sobre la interfaz de verdad con el doble
// (META 14, `docs/contexto/mods.md`): lo que pide un permiso, lo que pide una
// clave y las cuentas.
//
// Un mod de mentira esconde TODOS los botones, intenta cerrar antes de tiempo
// lo que le envuelve con una llave suelta y esconde Cuentas por su nombre. Se
// mide que fuera de las zonas sí se aplica (los botones de la barra, los
// iconos redondos) y que dentro no: Cuentas se ve con sus botones, y en Ajustes
// el modo de permisos y los permisos del MCP también.
//
// Se lanza con `pnpm dev` en marcha, en una página recién abierta (carga el
// doble él mismo, como `mods.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/mods-zonas.js" })
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const ESCONDE = {
    id: "lo-escondo-todo", nombre: "lo-escondo-todo", pedido: "esconde todos los botones", hechoPara: "0.9.196", toca: ["--r-icono"], fallo: null,
    hoja: "button { visibility: hidden !important; }\n:root { --r-icono: 999px; }\n}\n.accounts, [data-sin-mods] { display: none !important; }\n",
  };

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript((mod) => {
    try {
      localStorage.setItem("adeorq-mods", "1");
      localStorage.setItem("adeorq-lang", "es");
      window.__modsDeMentira = [mod];
    } catch { /* sin almacén */ }
  }, ESCONDE);
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ state: "attached", timeout: 20000 });
  await page.waitForTimeout(2000);

  const visible = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return "(no está)";
    const cs = getComputedStyle(e);
    return cs.display === "none" ? "display:none" : cs.visibility === "hidden" ? "hidden" : "visible";
  }, sel);
  pasos.estado = await page.evaluate(() => (window.__mods ?? []).map((m) => `${m.id}:${m.estado}`).join(" "));
  pasos.fueraBoton = await visible(".tabs .tab");
  pasos.fueraRadio = await page.evaluate(() => getComputedStyle(document.querySelector(".tabs .tab")).borderTopLeftRadius);
  debe(pasos.estado === "lo-escondo-todo:aplicado", `el mod no está puesto: ${pasos.estado}`);
  debe(pasos.fueraBoton === "hidden" && pasos.fueraRadio === "999px", `fuera de las zonas el mod no se aplica: ${pasos.fueraBoton} ${pasos.fueraRadio}`);

  // Cuentas: por la pestaña, que es un botón escondido; se pulsa por el DOM.
  await page.evaluate(() => document.querySelector('[data-tab="cuentas"]').click());
  await page.waitForTimeout(1200);
  pasos.cuentas = await visible(".accounts");
  pasos.botonCuentas = await visible(".accounts button");
  debe(pasos.cuentas === "visible", `Cuentas se esconde con un mod: ${pasos.cuentas}`);
  debe(pasos.botonCuentas === "visible", `los botones de Cuentas se esconden con un mod: ${pasos.botonCuentas}`);

  // Ajustes: el modo de permisos y los permisos del MCP.
  await page.evaluate(() => document.querySelector('[data-tab="ajustes"]').click());
  await page.waitForTimeout(800);
  await page.evaluate(() => [...document.querySelectorAll(".set-tab")].find((b) => b.querySelector(".set-tab-nom")?.textContent.trim() === "Terminales")?.click());
  await page.waitForTimeout(600);
  pasos.permisos = await page.evaluate(() => {
    const tarjetas = [...document.querySelectorAll(".panel-card")].filter((c) => /^(Modo de permisos|Qué puede hacer cada cliente por el MCP)$/.test(c.querySelector("h2")?.textContent.trim() ?? ""));
    return tarjetas.map((c) => {
      const b = c.querySelector("button");
      return `${c.querySelector("h2").textContent.trim()}: ${b ? getComputedStyle(b).visibility : "(sin botón)"}`;
    });
  });
  debe(pasos.permisos.includes("Modo de permisos: visible") && !pasos.permisos.some((p) => /: hidden$/.test(p)), `los permisos se esconden con un mod: ${JSON.stringify(pasos.permisos)}`);
  pasos.hoja = await page.evaluate(() => (document.getElementById("adeorq-mods")?.textContent ?? "").slice(0, 400));
  return { pasos, fallos };
}
