// Las Decisiones y el cambio de modo de Claude Code en la página del móvil, a
// 390 px, contra el doble recién arrancado (`node scripts/laboratorio/doble-movil.mjs`,
// en el 4390; contestar o descartar una decisión cambia su estado, así que entre
// dos pasadas hay que volver a arrancarlo):
//
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-decisiones.js")
//
// Lo que fija:
//   · Cada decisión dice si sigue viva. El número del botón cuenta solo las que
//     te esperan de verdad (1), y las dos que ya no espera nadie se dicen al
//     lado, sin sumar. Munir tenía seis «pendientes» de terminales cerradas.
//   · La lista va por montones: te esperan, ya no las espera nadie, cerradas.
//   · Ninguna opción marcada al entrar y las dos recomendadas con su etiqueta;
//     «Deshacer» para el envío; el borrador sobrevive a recargar; enviada y
//     tecleada en el panel 1; una segunda respuesta, 409.
//   · Descartar las huérfanas las cierra todas sin escribir en ninguna terminal;
//     descartar una viva se lo dice a su terminal; una descartada no se contesta.
//   · El enlace de un aviso abre la contestada; y el botón de modo pasa de
//     «auto» a nada (normal) y a «aceptar ediciones».
//
// Devuelve { fallos, r }: `fallos` vacío es que todo está en su sitio.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.goto(`${B}/`);
  await page.setViewportSize({ width: 780, height: 1600 });
  const k = 780 / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(390 * k), height: Math.round(844 * k) });
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));
  const r = {};
  const escritoEn = async (panel) => (await (await page.request.get(`${B}/api/escrito?panel=${panel}`, { headers: AUT })).json()).texto;

  // 1. La portada: cuenta las vivas, y las que nadie espera van aparte.
  await page.goto(`${B}/`);
  await page.waitForSelector("#cuenta-dec:not([hidden])");
  r.cuenta = await page.textContent("#cuenta-dec");
  r.sobran = await page.textContent("#dec-sobran");
  debe(r.cuenta === "1", `el botón cuenta solo la que te espera (${r.cuenta})`);
  debe(r.sobran === "2 sin nadie detrás", `las huérfanas se dicen al lado, sin sumar («${r.sobran}»)`);
  r.reclaman = await page.$$eval("#reclaman .tarjeta[data-id]", (ts) => ts.map((t) => t.innerText.replace(/\s+/g, " ")));
  debe(r.reclaman.length === 1 && /Diseño de la web/.test(r.reclaman[0]), `la viva sale arriba en la portada (${r.reclaman})`);

  // 2. La lista, por montones y con su vigencia.
  await page.click("#decisiones");
  await page.waitForSelector("#decisiones .tarjeta");
  r.secciones = await page.$$eval("#decisiones .seccion span", (ss) => ss.map((s) => s.textContent));
  r.lista = await page.$$eval("#decisiones .tarjeta", (ts) => ts.map((t) => `${t.dataset.vigencia}: ${t.innerText.replace(/\s+/g, " ")}`));
  debe(r.secciones.join("|") === "Te esperan|Ya no las espera nadie|Cerradas", `tres montones (${r.secciones})`);
  debe(r.lista.map((x) => x.split(":")[0]).join() === "viva,huerfana,huerfana,contestada", `cada una con su vigencia (${r.lista})`);
  debe(/panel 1, abierto/.test(r.lista[0]) && /su terminal se cerró/.test(r.lista[1]), `dicen de quién son y si sigue ahí (${r.lista.slice(0, 2)})`);
  r.sub = await page.textContent("#sub-dec");
  debe(r.sub === "1 te espera · 2 sin nadie detrás", `el resumen de arriba («${r.sub}»)`);

  // 3. Una huérfana avisa de que nadie la espera, y se puede descartar ahí.
  await page.click('#decisiones .tarjeta[data-vigencia="huerfana"] >> nth=0');
  await page.waitForSelector(".pregunta-d");
  r.avisoHuerfana = await page.textContent(".dec-vig");
  debe(/Ya no la espera nadie/.test(r.avisoHuerfana), `la huérfana lo dice («${r.avisoHuerfana}»)`);
  await page.click("#atras");
  await page.waitForSelector("#limpiar");

  // 4. La viva: lo dice, ninguna opción marcada, recomendadas con etiqueta.
  await page.click("#decisiones .tarjeta >> nth=0");
  await page.waitForSelector(".pregunta-d");
  r.avisoViva = await page.textContent(".dec-vig");
  debe(/Te espera\./.test(r.avisoViva) && /El panel 1 sigue abierto/.test(r.avisoViva), `la viva dice quién la espera («${r.avisoViva}»)`);
  r.marcadasAlEntrar = await page.$$eval("input[type=radio]:checked", (x) => x.length);
  r.recomendadas = await page.$$eval(".rec", (x) => x.length);
  r.estadoAlEntrar = await page.textContent("#estado-envio");
  debe(r.marcadasAlEntrar === 0 && r.recomendadas === 2, `ninguna marcada y dos recomendadas (${r.marcadasAlEntrar}, ${r.recomendadas})`);
  debe(/Faltan las preguntas A y B/.test(r.estadoAlEntrar), `dice lo que falta («${r.estadoAlEntrar}»)`);

  await page.click('.pregunta-d[data-q="A"] .opcion >> nth=1');
  await page.fill('.libre[data-q="B"]', "El botón, pero con el idioma dentro de la hoja");
  await page.click("#enviar-dec");
  await page.waitForTimeout(1200);
  await page.click("#enviar-dec");
  r.trasDeshacer = await page.textContent("#estado-envio");
  debe(r.trasDeshacer === "No se ha mandado.", `«Deshacer» para el envío («${r.trasDeshacer}»)`);

  await page.reload();
  await page.click("#decisiones");
  await page.waitForSelector("#decisiones .tarjeta");
  await page.click("#decisiones .tarjeta >> nth=0");
  await page.waitForSelector(".pregunta-d");
  r.borrador = await page.evaluate(() => ({
    a: document.querySelector('input[name="q-A"]:checked')?.value,
    b: document.querySelector('.libre[data-q="B"]').value,
  }));
  debe(r.borrador.a === "2" && /idioma dentro de la hoja/.test(r.borrador.b), `el borrador sobrevive a recargar (${JSON.stringify(r.borrador)})`);
  await page.click("#enviar-dec");
  await page.waitForFunction(() => /Enviada/.test(document.getElementById("estado-envio")?.textContent || ""), null, { timeout: 12000 });
  r.enviada = await page.textContent("#estado-envio");
  debe(r.enviada === "Enviada. Se ha tecleado en el panel 1.", `enviada y tecleada («${r.enviada}»)`);
  debe(!(await page.isVisible("#enviar-dec")) && !(await page.isVisible("#descartar-dec")), "contestada, ya no hay ni enviar ni descartar");
  r.escrito = await escritoEn(1);
  debe(/Munir ha contestado a «Diseño de la web»/.test(r.escrito || ""), `la respuesta llega al panel 1 («${r.escrito}»)`);
  r.otraVez = (await page.request.post(`${B}/api/decision/responder`, { headers: AUT, data: { id: "d19a2b3c4d5", elecciones: { A: { opcion: 1 }, B: { opcion: 1 } } } })).status();
  debe(r.otraVez === 409, `contestada no se vuelve a contestar (${r.otraVez})`);

  // 5. Descartar las que nadie espera: se cierran todas y no se escribe a nadie.
  await page.click("#atras");
  await page.waitForSelector("#limpiar");
  r.limpiar = await page.textContent("#limpiar");
  debe(r.limpiar === "Descartar las 2", `el botón dice cuántas («${r.limpiar}»)`);
  await page.click("#limpiar");
  await page.waitForFunction(() => !document.querySelector('#decisiones .tarjeta[data-vigencia="huerfana"]') && !document.getElementById("limpiar"), null, { timeout: 8000 });
  r.trasLimpiar = await page.$$eval("#decisiones .tarjeta", (ts) => ts.map((t) => t.dataset.vigencia));
  debe(r.trasLimpiar.filter((x) => x === "descartada").length === 2 && !r.trasLimpiar.includes("huerfana"), `las dos pasan a descartadas (${r.trasLimpiar})`);
  debe((await escritoEn(7)) === null, "a una terminal que no está no se le escribe");
  r.calma = await page.textContent(".calma");
  debe(/Nada te espera ahora mismo/.test(r.calma || ""), `sin vivas lo dice, con la mascota («${r.calma}»)`);
  debe((await page.$$eval(".calma .masc rect", (x) => x.length)) > 100, "y la mascota está pintada");

  // 6. Descartar una VIVA: se le dice a su terminal, y ya no se contesta.
  await page.request.post(`${B}/api/sembrar-decision`, { headers: AUT, data: { id: "d19a2b3c4e0", titulo: "¿Publico ya?", proyecto: "Webs", panel: 4 } });
  await page.goto(`${B}/#decision=d19a2b3c4e0`);
  await page.waitForSelector(".pregunta-d");
  debe(/El panel 4 sigue abierto/.test(await page.textContent(".dec-vig")), "la recién pedida por el panel 4 está viva");
  await page.click("#descartar-dec");
  await page.waitForFunction(() => /Descartada/.test(document.getElementById("estado-envio")?.textContent || ""), null, { timeout: 8000 });
  r.descartada = await page.textContent("#estado-envio");
  debe(r.descartada === "Descartada. Se le ha dicho al panel 4 que no espere respuesta.", `descartar una viva avisa («${r.descartada}»)`);
  debe(/ha descartado la decisión «¿Publico ya\?»/.test((await escritoEn(4)) || ""), "y a su terminal le llega");
  debe(/Descartada/.test(await page.textContent(".dec-vig")) && (await page.$$eval(".pregunta-d:disabled", (x) => x.length)) === 1, "queda cerrada, sin poder marcar nada");
  r.contestarDescartada = (await page.request.post(`${B}/api/decision/responder`, { headers: AUT, data: { id: "d19a2b3c4e0", elecciones: { A: { opcion: 1 } } } })).status();
  debe(r.contestarDescartada === 400, `una descartada no se contesta (${r.contestarDescartada})`);

  // 7. El enlace de un aviso abre la contestada.
  await page.goto(`${B}/#decision=d19a2b3c4d0`);
  await page.waitForSelector(".dec-hecha");
  r.porEnlace = await page.textContent(".dec-hecha");
  debe(/Contestada desde Android · Chrome/.test(r.porEnlace), `el enlace de un aviso abre la contestada («${r.porEnlace}»)`);

  // 8. El modo de Claude Code, con Shift+Tab.
  await page.goto(`${B}/#terminal=1`);
  await page.waitForFunction(() => /Modo/.test(document.getElementById("modo")?.textContent || ""));
  // Las teclas van plegadas: el botón del modo está en esa fila.
  if (await page.$eval("#teclas", (t) => t.hidden)) await page.click("#abrir-teclas");
  r.modos = [await page.textContent("#modo")];
  await page.click("#modo");
  await page.waitForFunction(() => document.getElementById("modo")?.textContent.includes("Cambiar modo"), null, { timeout: 6000 });
  r.modos.push(await page.textContent("#modo"));
  await page.click("#modo");
  await page.waitForFunction(() => /aceptar/.test(document.getElementById("modo")?.textContent || ""), null, { timeout: 6000 });
  r.modos.push(await page.textContent("#modo"));
  debe(r.modos.join("|") === "Modo: auto ⇄|Cambiar modo|Modo: aceptar ediciones ⇄", `el modo pasa de auto a normal y a aceptar ediciones (${r.modos})`);
  return { fallos, r };
}
