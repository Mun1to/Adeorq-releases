// Las Decisiones y el cambio de modo de Claude Code en la página del móvil, a
// 390 px, contra el doble recién arrancado (`node scripts/laboratorio/doble-movil.mjs`,
// en el 4390; contestar o descartar una decisión cambia su estado, así que entre
// dos pasadas hay que volver a arrancarlo):
//
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-decisiones.js")
//
// Lo que fija:
//   · Cada decisión dice si sigue viva. El número del botón cuenta solo las que
//     te esperan de verdad (1). Munir tenía seis «pendientes» de terminales cerradas.
//   · La lista va en dos montones: te esperan y anteriores, que se limpian solas
//     (2026-10-11: ya no hay botón de «Descartar las N»).
//   · Una pregunta por pantalla (2026-11-18): ninguna opción marcada al entrar
//     y las dos recomendadas con su etiqueta; tocar una opción pasa sola a la
//     siguiente; el repaso dice lo que falta, enseña lo elegido y dónde cae la
//     respuesta; «Deshacer» para el envío; el borrador sobrevive a recargar;
//     enviada, celebrada y tecleada en el panel 1; una segunda respuesta, 409.
//   · Escribirle a una terminal desde el móvil da por hablada lo que preguntó;
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

  // 1. La portada: cuenta las vivas, y las demás ni suman ni se dicen.
  await page.goto(`${B}/`);
  await page.waitForSelector("#cuenta-dec:not([hidden])");
  r.cuenta = await page.textContent("#cuenta-dec");
  // La viva y las dos terminales que preguntan (la 2 y la 4, desde el 2026-10-16).
  debe(r.cuenta === "3", `el botón cuenta solo lo que te espera (${r.cuenta})`);
  debe(!(await page.$("#dec-sobran")), "ya no se dice cuántas sobran: se limpian solas");
  r.reclaman = await page.$$eval("#reclaman .fila-term[data-id]", (ts) => ts.map((t) => t.innerText.replace(/\s+/g, " ")));
  debe(r.reclaman.length === 1 && /Diseño de la web/.test(r.reclaman[0]), `la viva sale arriba en la portada (${r.reclaman})`);

  // 2. La lista, por montones y con su vigencia.
  await page.click("#abrir-cajon"); await page.click('#cajon .fila[data-ir="decisiones"]');
  await page.waitForSelector("#decisiones .tarjeta");
  r.secciones = await page.$$eval("#decisiones .seccion span", (ss) => ss.map((s) => s.textContent));
  r.lista = await page.$$eval("#decisiones .tarjeta", (ts) => ts.map((t) => `${t.dataset.vigencia}: ${t.innerText.replace(/\s+/g, " ")}`));
  // Las anteriores van plegadas y dicen cuántas son (2026-11-25): se abren tocándolas.
  debe(r.secciones.join("|") === "Te esperan|Anteriores (3)", `dos montones (${r.secciones})`);
  // Las anteriores, la que se movió más tarde arriba: la contestada hace 2 h,
  // la del panel cerrado de hace un día y la de otro arranque de hace cinco.
  debe(r.lista.map((x) => x.split(":")[0]).join() === "viva,contestada,huerfana,huerfana", `cada una con su vigencia (${r.lista})`);
  debe(/panel 1, abierto/.test(r.lista[0]) && /su terminal se cerró/.test(r.lista[2]), `dicen de quién son y si sigue ahí (${r.lista})`);
  debe(!(await page.$("#limpiar")), "sin botón de vaciar");
  r.sub = await page.textContent("#sub-dec");
  debe(r.sub === "3 te esperan", `el resumen de arriba («${r.sub}»)`);

  // 3. Una huérfana avisa de que nadie la espera.
  await page.click("#ver-anteriores");
  await page.waitForTimeout(450);
  await page.click('#decisiones .tarjeta[data-vigencia="huerfana"] >> nth=0');
  await page.waitForSelector(".pregunta-d");
  r.avisoHuerfana = await page.textContent(".dec-vig");
  debe(/Ya no la espera nadie/.test(r.avisoHuerfana), `la huérfana lo dice («${r.avisoHuerfana}»)`);
  await page.click("#atras");
  await page.waitForSelector("#decisiones .tarjeta");

  // 4. La viva: una pregunta por pantalla, ninguna opción marcada, recomendadas
  //    con etiqueta, y lo que falta no se dice hasta el repaso.
  const aLaVista = () => page.evaluate(() => ({
    preguntas: [...document.querySelectorAll(".pregunta-d")].filter((f) => f.offsetParent).map((f) => f.dataset.q).join(""),
    paso: document.getElementById("dec-paso")?.textContent.trim() ?? "",
    botones: [...document.querySelectorAll("#pie-dec button")].filter((b) => b.offsetParent).map((b) => `${b.textContent.trim()}${b.disabled ? " (apagado)" : ""}`).join(" | "),
    estado: document.getElementById("estado-envio")?.textContent ?? "",
  }));
  // Recién cambiada, una pantalla de la decisión no atiende toques (medio segundo).
  const asentar = () => page.waitForTimeout(650);
  await page.click("#decisiones .tarjeta >> nth=0");
  await page.waitForSelector(".pregunta-d");
  r.alEntrar = await aLaVista();
  debe(!(await page.$(".dec-vig")), "de la viva no se avisa arriba: se abre porque te espera");
  debe(r.alEntrar.preguntas === "A" && r.alEntrar.paso === "Pregunta 1 de 2", `se entra por la primera pregunta, sola (${JSON.stringify(r.alEntrar)})`);
  debe(r.alEntrar.botones === "Atrás (apagado) | Siguiente" && r.alEntrar.estado === "", `abajo, atrás y siguiente, sin decir aún lo que falta (${JSON.stringify(r.alEntrar)})`);
  r.marcadasAlEntrar = await page.$$eval("input[type=radio]:checked", (x) => x.length);
  r.recomendadas = await page.$$eval(".rec", (x) => x.length);
  debe(r.marcadasAlEntrar === 0 && r.recomendadas === 2, `ninguna marcada y dos recomendadas (${r.marcadasAlEntrar}, ${r.recomendadas})`);
  // Sin contestar nada, el repaso dice lo que falta y no deja enviar.
  await asentar(); await page.click("#paso-sig"); await asentar(); await page.click("#paso-sig");
  await page.waitForSelector("#dec-repaso .dec-fila");
  r.repasoVacio = { ...(await aLaVista()), filas: await page.$$eval("#dec-repaso .dec-fila", (fs) => fs.map((f) => f.innerText.replace(/\s+/g, " "))) };
  debe(/Faltan las preguntas A y B/.test(r.repasoVacio.estado) && r.repasoVacio.botones === "Atrás | Enviar respuesta (apagado)", `el repaso dice lo que falta (${JSON.stringify(r.repasoVacio)})`);
  debe(r.repasoVacio.filas.length === 2 && r.repasoVacio.filas.every((f) => /Sin contestar/.test(f)), `y cada pregunta, sin contestar (${r.repasoVacio.filas})`);

  // Tocar su fila vuelve a la pregunta; tocar una opción pasa sola a la siguiente.
  await asentar(); await page.click("#dec-repaso .dec-fila >> nth=0");
  await asentar(); await page.click('.pregunta-d[data-q="A"] .opcion >> nth=1');
  await page.waitForSelector("#dec-repaso .dec-fila");
  r.trasLaA = await aLaVista();
  debe(/Falta la pregunta B/.test(r.trasLaA.estado), `quien vino del repaso vuelve a él al contestar («${r.trasLaA.estado}»)`);
  await asentar(); await page.click("#dec-repaso .dec-fila >> nth=1");
  await page.fill('.libre[data-q="B"]', "El botón, pero con el idioma dentro de la hoja");
  r.conLaB = await aLaVista();
  debe(r.conLaB.preguntas === "B" && r.conLaB.botones === "Atrás | Repasar", `la B, sola y con «Repasar» (${JSON.stringify(r.conLaB)})`);
  await asentar(); await page.click("#paso-sig");
  await page.waitForSelector("#dec-repaso .dec-fila");
  r.repaso = await page.$$eval("#dec-repaso .dec-fila", (fs) => fs.map((f) => f.innerText.replace(/\s+/g, " ")));
  r.nota = await page.textContent(".dec-nota");
  debe(/^A .*2\. /.test(r.repaso[0]) && /idioma dentro de la hoja/.test(r.repaso[1]), `el repaso enseña lo elegido y lo escrito (${r.repaso})`);
  debe(/se teclea en el panel 1/.test(r.nota) && /5 segundos para deshacer/.test(r.nota), `y dice dónde cae la respuesta («${r.nota}»)`);
  debe((await page.$$eval("#dec-repaso .masc rect", (x) => x.length)) > 100, "con la mascota pintada");
  await page.click("#enviar-dec");
  await page.waitForTimeout(1200);
  await page.click("#enviar-dec");
  r.trasDeshacer = await page.textContent("#estado-envio");
  debe(r.trasDeshacer === "No se ha mandado.", `«Deshacer» para el envío («${r.trasDeshacer}»)`);

  await page.reload();
  await page.click("#abrir-cajon"); await page.click('#cajon .fila[data-ir="decisiones"]');
  await page.waitForSelector("#decisiones .tarjeta");
  await page.click("#decisiones .tarjeta >> nth=0");
  // Con todo contestado en el borrador, se entra por el repaso.
  await page.waitForSelector("#dec-repaso .dec-fila");
  r.borrador = await page.evaluate(() => ({
    a: document.querySelector('input[name="q-A"]:checked')?.value,
    b: document.querySelector('.libre[data-q="B"]').value,
  }));
  debe(r.borrador.a === "2" && /idioma dentro de la hoja/.test(r.borrador.b), `el borrador sobrevive a recargar (${JSON.stringify(r.borrador)})`);
  await page.click("#enviar-dec");
  await page.waitForFunction(() => /Enviada/.test(document.getElementById("estado-envio")?.textContent || ""), null, { timeout: 12000 });
  r.enviada = await page.textContent("#estado-envio");
  debe(r.enviada === "Enviada. Se ha tecleado en el panel 1.", `enviada y tecleada («${r.enviada}»)`);
  debe(!(await page.isVisible("#enviar-dec")) && !(await page.isVisible("#descartar-aqui")) && !(await page.isVisible("#paso-sig")), "contestada, ya no hay ni enviar ni descartar ni pasos");
  // Lo enviado se celebra, y queda a la vista lo que se eligió.
  r.quedo = await page.evaluate(() => ({
    titulo: document.querySelector(".dec-titulo")?.textContent.trim() ?? "",
    mascota: document.querySelectorAll('.dec-titulo .masc[data-animo="lista"] rect').length,
    dicho: [...document.querySelectorAll(".pregunta-d .dec-dicho")].map((x) => x.textContent),
    radios: document.querySelectorAll("#decision input").length,
  }));
  debe(r.quedo.titulo === "Enviada" && r.quedo.mascota > 100, `enviada, con Adeo celebrándolo (${JSON.stringify(r.quedo)})`);
  debe(r.quedo.dicho.length === 2 && /^2\. /.test(r.quedo.dicho[0]) && /idioma dentro de la hoja/.test(r.quedo.dicho[1]) && r.quedo.radios === 0, `y lo elegido, para leer y sin nada que marcar (${JSON.stringify(r.quedo)})`);
  r.escrito = await escritoEn(1);
  debe(/Munir ha contestado a «Diseño de la web»/.test(r.escrito || ""), `la respuesta llega al panel 1 («${r.escrito}»)`);
  r.otraVez = (await page.request.post(`${B}/api/decision/responder`, { headers: AUT, data: { id: "d19a2b3c4d5", elecciones: { A: { opcion: 1 }, B: { opcion: 1 } } } })).status();
  debe(r.otraVez === 409, `contestada no se vuelve a contestar (${r.otraVez})`);

  // 5. Escribirle a la terminal desde el móvil la da por hablada: sin botones.
  await page.request.post(`${B}/api/sembrar-decision`, { headers: AUT, data: { id: "d19a2b3c4e1", titulo: "¿Lo subo?", proyecto: "Adeorq", panel: 1 } });
  await page.request.post(`${B}/api/terminal/escribir`, { headers: AUT, data: { panel: 1, arranque: 111, texto: "sí, súbelo" } });
  await page.click("#atras");
  await page.waitForSelector("#decisiones .tarjeta");
  await page.waitForFunction(() => document.querySelector('#decisiones .tarjeta[data-id="d19a2b3c4e1"]')?.dataset.vigencia === "hablada", null, { timeout: 8000 });
  r.hablada = await page.textContent('#decisiones .tarjeta[data-id="d19a2b3c4e1"]');
  debe(/hablada/.test(r.hablada) && /le escribiste al panel 1/.test(r.hablada), `escribirle la da por hablada («${r.hablada.replace(/\s+/g, " ")}»)`);
  debe((await escritoEn(7)) === null, "a una terminal que no está no se le escribe");
  // Lo que preguntan las terminales también te espera (2026-10-16): para ver la
  // calma, que dejen de preguntar la 2 y la 4.
  for (const panel of [2, 4]) await page.request.post(`${B}/api/sembrar-estado`, { headers: AUT, data: { panel, estado: "lista" } });
  await page.waitForSelector(".calma", { timeout: 9000 });
  r.calma = await page.textContent(".calma");
  debe(/Nada te espera ahora mismo/.test(r.calma || ""), `sin vivas lo dice, con la mascota («${r.calma}»)`);
  debe((await page.$$eval(".calma .masc rect", (x) => x.length)) > 100, "y la mascota está pintada");
  await page.click('#decisiones .tarjeta[data-id="d19a2b3c4e1"]');
  await page.waitForSelector(".pregunta-d");
  debe(/La hablaste con el agente/.test(await page.textContent(".dec-vig")), "dentro lo dice");

  // 6. Descartar una VIVA: se le dice a su terminal, y ya no se contesta.
  await page.request.post(`${B}/api/sembrar-decision`, { headers: AUT, data: { id: "d19a2b3c4e0", titulo: "¿Publico ya?", proyecto: "Webs", panel: 4 } });
  await page.goto(`${B}/#decision=d19a2b3c4e0`);
  await page.waitForSelector(".pregunta-d");
  // Viva y de una sola pregunta: sin aviso arriba, sin pasos, y con «Descartar» debajo, a dos toques.
  debe(!(await page.$(".dec-vig")) && !(await page.$("#dec-paso")) && !(await page.isVisible("#paso-sig")), "la recién pedida por el panel 4 está viva, y con una sola pregunta no hay pasos");
  // «Descartar» tarda un segundo en atender desde que sale la pantalla, como «Enviar» en el repaso.
  await page.waitForTimeout(1150);
  await page.click("#descartar-aqui");
  r.armado = { rotulo: (await page.textContent("#descartar-aqui")).trim(), vigencia: (await (await page.request.get(`${B}/api/decision?id=d19a2b3c4e0`, { headers: AUT })).json()).vigencia };
  debe(r.armado.rotulo === "Toca otra vez" && r.armado.vigencia === "viva", `el primer toque solo arma el botón (${JSON.stringify(r.armado)})`);
  await page.waitForTimeout(900);
  await page.click("#descartar-aqui");
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
  await page.goto(`${B}/#terminal=1@111`);
  await page.waitForFunction(() => /Auto/.test(document.getElementById("modo")?.textContent || ""));
  r.modos = [await page.textContent("#modo")];
  await page.click("#modo");
  await page.waitForFunction(() => document.getElementById("modo")?.textContent === "Modo", null, { timeout: 6000 });
  r.modos.push(await page.textContent("#modo"));
  await page.click("#modo");
  await page.waitForFunction(() => /Aceptar/.test(document.getElementById("modo")?.textContent || ""), null, { timeout: 6000 });
  r.modos.push(await page.textContent("#modo"));
  // Su nombre y ya está, sin flechas (Munir, 2026-10-16: «solo deja Auto»).
  debe(r.modos.join("|") === "Auto|Modo|Aceptar ediciones", `el modo pasa de auto a normal y a aceptar ediciones (${r.modos})`);
  return { fallos, r };
}
