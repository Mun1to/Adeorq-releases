// Borrar una conversación desde el móvil: se mantiene pulsada (en el inicio o
// en el cajón) y sale abajo «Borrar conversación» o «Cancelar». Las de prueba
// («hola») se acumulaban sin forma de quitarlas (Munir, 2026-10-15).
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-conversaciones.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  const lista = async () => (await (await page.request.get(`${B}/api/lista`, { headers: AUT })).json()).map((c) => c.id);

  // Dos conversaciones: la vieja del doble y una de prueba, «hola».
  await page.request.post(`${B}/api/enviar`, { headers: AUT, data: { id: "hola1", texto: "hola" } });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));
  await page.goto(`${B}/?v=1`);
  await page.waitForSelector('#filas .fila[data-id="hola1"]');

  // Mantener pulsado con el dedo (el reloj propio): sale la hoja y NO se abre la conversación.
  const fila = page.locator('#filas .fila[data-id="hola1"]');
  const caja = await fila.boundingBox();
  await page.mouse.move(caja.x + 40, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(300);
  pasos.alPulsar = await page.evaluate(() => ({
    hoja: !!document.getElementById("hoja"),
    titulo: document.getElementById("hoja-titulo")?.textContent,
    sigueEnElInicio: !!document.getElementById("filas"),
  }));
  debe(pasos.alPulsar.hoja && pasos.alPulsar.titulo === "hola", `mantener pulsada saca la hoja con su título (${JSON.stringify(pasos.alPulsar)})`);
  debe(pasos.alPulsar.sigueEnElInicio, "soltar el dedo no abre además la conversación");

  // Cancelar no borra nada.
  await page.click("#hoja-cancelar");
  await page.waitForTimeout(200);
  debe(!(await page.$("#hoja")) && (await lista()).includes("hola1"), "Cancelar cierra la hoja y no borra");

  // Con el menú del sistema (lo que lanza Chrome al mantener pulsado), y Borrar.
  await fila.dispatchEvent("contextmenu");
  await page.waitForSelector("#hoja-borrar");
  await page.click("#hoja-borrar");
  await page.waitForTimeout(400);
  pasos.trasBorrar = { enLaPagina: !!(await page.$('#filas .fila[data-id="hola1"]')), enElPc: (await lista()).includes("hola1") };
  debe(!pasos.trasBorrar.enLaPagina && !pasos.trasBorrar.enElPc, `Borrar la quita de la página y del PC (${JSON.stringify(pasos.trasBorrar)})`);

  // En el cajón también: la hoja sale por encima y la fila se va.
  await page.click("#abrir-cajon");
  await page.waitForSelector('#cajon .fila[data-conv="vieja1"]');
  await page.locator('#cajon .fila[data-conv="vieja1"]').dispatchEvent("contextmenu");
  await page.waitForSelector("#hoja-borrar");
  pasos.encima = await page.evaluate(() => {
    const r = document.getElementById("hoja-borrar").getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("#hoja") != null;
  });
  debe(pasos.encima, "la hoja queda por encima del cajón");
  await page.click("#hoja-borrar");
  await page.waitForTimeout(400);
  pasos.cajon = { enElCajon: !!(await page.$('#cajon .fila[data-conv="vieja1"]')), enElPc: (await lista()).includes("vieja1") };
  debe(!pasos.cajon.enElCajon && !pasos.cajon.enElPc, `desde el cajón también se borra (${JSON.stringify(pasos.cajon)})`);
  return { pasos, fallos };
}
