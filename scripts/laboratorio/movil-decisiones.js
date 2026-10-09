// Las Decisiones y el cambio de modo de Claude Code en la página del móvil, a
// 390 px, contra el doble recién arrancado (`node scripts/laboratorio/doble-movil.mjs`,
// en el 4390; contestar una decisión cambia su estado, así que entre dos pasadas
// hay que volver a arrancarlo):
//
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-decisiones.js")
//
// Lo que tiene que salir: cuenta 1; ninguna opción marcada al entrar y las dos
// recomendadas con su etiqueta; «Deshacer» para el envío; el borrador sobrevive
// a recargar; enviada y tecleada en el panel 1; una segunda respuesta, 409; el
// enlace de un aviso abre la contestada; y el botón de modo pasa de «auto» a
// nada (normal) y a «aceptar ediciones».
async (page) => {
  const B = "http://127.0.0.1:4390";
  await page.goto(`${B}/`);
  await page.setViewportSize({ width: 780, height: 1600 });
  const k = 780 / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(390 * k), height: Math.round(844 * k) });
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));
  const r = {};

  await page.goto(`${B}/`);
  await page.waitForSelector("#cuenta-dec:not([hidden])");
  r.cuenta = await page.textContent("#cuenta-dec");
  await page.click("#decisiones");
  await page.waitForSelector("#decisiones .tarjeta");
  r.lista = await page.$$eval("#decisiones .tarjeta", (ts) => ts.map((t) => t.innerText.replace(/\s+/g, " ")));
  await page.click("#decisiones .tarjeta >> nth=0");
  await page.waitForSelector(".pregunta-d");
  r.marcadasAlEntrar = await page.$$eval("input[type=radio]:checked", (x) => x.length);
  r.recomendadas = await page.$$eval(".rec", (x) => x.length);
  r.estadoAlEntrar = await page.textContent("#estado-envio");

  await page.click('.pregunta-d[data-q="A"] .opcion >> nth=1');
  await page.fill('.libre[data-q="B"]', "El botón, pero con el idioma dentro de la hoja");
  await page.click("#enviar-dec");
  await page.waitForTimeout(1200);
  await page.click("#enviar-dec");
  r.trasDeshacer = await page.textContent("#estado-envio");

  await page.reload();
  await page.click("#decisiones");
  await page.waitForSelector("#decisiones .tarjeta");
  await page.click("#decisiones .tarjeta >> nth=0");
  await page.waitForSelector(".pregunta-d");
  r.borrador = await page.evaluate(() => ({
    a: document.querySelector('input[name="q-A"]:checked')?.value,
    b: document.querySelector('.libre[data-q="B"]').value,
  }));
  await page.click("#enviar-dec");
  await page.waitForFunction(() => /Enviada/.test(document.getElementById("estado-envio")?.textContent || ""), null, { timeout: 12000 });
  r.enviada = await page.textContent("#estado-envio");
  r.botonOculto = !(await page.isVisible("#enviar-dec"));
  r.escrito = await page.evaluate(async () => (await (await fetch("/api/escrito?panel=1", { headers: { Authorization: "Bearer clave-de-mentira" } })).json()).texto);
  r.otraVez = await page.evaluate(async () => (await fetch("/api/decision/responder", {
    method: "POST",
    headers: { Authorization: "Bearer clave-de-mentira", "Content-Type": "application/json" },
    body: JSON.stringify({ id: "d19a2b3c4d5", elecciones: { A: { opcion: 1 }, B: { opcion: 1 } } }),
  })).status);

  await page.goto(`${B}/#decision=d19a2b3c4d0`);
  await page.waitForSelector(".dec-hecha");
  r.porEnlace = await page.textContent(".dec-hecha");

  await page.goto(`${B}/#terminal=1`);
  await page.waitForFunction(() => /Modo/.test(document.getElementById("modo")?.textContent || ""));
  r.modos = [await page.textContent("#modo")];
  await page.click("#modo");
  await page.waitForFunction(() => document.getElementById("modo")?.textContent.includes("Cambiar modo"), null, { timeout: 6000 });
  r.modos.push(await page.textContent("#modo"));
  await page.click("#modo");
  await page.waitForFunction(() => /aceptar/.test(document.getElementById("modo")?.textContent || ""), null, { timeout: 6000 });
  r.modos.push(await page.textContent("#modo"));
  return r;
}
