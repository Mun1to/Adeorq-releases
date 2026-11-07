// Contestar desde el móvil con dos decisiones parecidas abiertas a la vez, a
// 390 px, contra el doble recién arrancado (`node scripts/laboratorio/doble-movil.mjs`,
// en el 4390; contesta y resuelve decisiones, así que entre dos pasadas hay que
// volver a arrancarlo). Con `bancos-movil.mjs parecidas` lo arranca solo:
//
//   node scripts/laboratorio/bancos-movil.mjs parecidas
//
// Munir, 2026-11-07, de madrugada y desde el móvil: «ya contesté desde el
// móvil, si no te ha llegado dile a Adeorq que lo arregle», y luego «por qué
// hay decisiones waiting for me que ya he decidido». Tenía abiertas la del
// escudo y su versión reescrita, de seis preguntas cada una. Lo que fija:
//   · Un doble toque en «Enviar respuesta» no la deshace: «Deshacer» salía en
//     el mismo botón y el segundo toque la cancelaba.
//   · Si durante la cuenta atrás te vas a la otra decisión, la primera se manda
//     con tus palabras, y la otra NO sale «Enviada» ni pierde su botón.
//   · Lo de cada decisión se queda en la suya: el borrador de una no entra en la otra.
//   · La que el agente da por resuelta (`close_decision`) deja de contar, se ve
//     «Ya está decidida.» con lo que dijo el agente, y no se contesta.
//   · La que sustituye otra (`replaces`) lleva a la nueva con «Abrir la nueva».
//   · Si el agente la resuelve mientras la contestas, la página lo dice.
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
  // Cargada otra vez, ya con la clave: un cambio de `#` solo se atiende emparejado.
  await page.reload();
  const r = {};
  const leer = async (id) => (await page.request.get(`${B}/api/decision?id=${id}`, { headers: AUT })).json();
  const tres = (cual) => [
    { id: "A", titulo: `Tu memoria y tus gustos (${cual})`, opciones: [{ texto: "Que me lo pidan" }, { texto: "Sin pedírmelo", recomendada: true }] },
    { id: "B", titulo: `Cuánto dura tu sí (${cual})`, opciones: [{ texto: "Media hora" }, { texto: "Una vez" }] },
    { id: "C", titulo: `Dónde va el escudo (${cual})`, opciones: [{ texto: "En Archivos de programa" }, { texto: "En tu carpeta" }] },
  ];
  const sembrar = (id, titulo, cual) =>
    page.request.post(`${B}/api/sembrar-decision`, { headers: AUT, data: { id, titulo, proyecto: "Adeorq", panel: 1, preguntas: tres(cual) } });
  await sembrar("d1a1b268e900", "Escudo y claves: el plano", "primera");
  await sembrar("d1a1b29391a0", "Escudo y claves: el plano (preguntas reescritas)", "reescrita");

  // 1. La primera, con una opción, unas palabras y las dos cosas.
  await page.goto(`${B}/#decision=d1a1b268e900`);
  await page.waitForSelector('fieldset[data-q="C"]');
  await page.click('fieldset[data-q="A"] label.opcion:nth-of-type(1)');
  await page.fill('.libre[data-q="B"]', "una vez y ya, con mis palabras");
  await page.click('fieldset[data-q="C"] label.opcion:nth-of-type(2)');
  await page.fill('.libre[data-q="C"]', "pero que no pida permisos");
  debe(await page.isEnabled("#enviar-dec"), "con las tres contestadas se puede enviar");

  // 2. Doble toque: el segundo no la deshace.
  await page.click("#enviar-dec");
  await page.waitForTimeout(150);
  await page.click("#enviar-dec");
  r.dobleToque = { boton: (await page.textContent("#enviar-dec")).trim(), estado: (await page.textContent("#estado-envio")).trim() };
  debe(/^Deshacer/.test(r.dobleToque.boton) && r.dobleToque.estado !== "No se ha mandado.", `un doble toque no deshace el envío (${JSON.stringify(r.dobleToque)})`);

  // 3. A mitad de la cuenta te vas a la otra decisión, que se parece.
  await page.click("#atras");
  await page.waitForSelector('.tarjeta[data-id="d1a1b29391a0"]');
  await page.click('.tarjeta[data-id="d1a1b29391a0"]');
  await page.waitForSelector('fieldset[data-q="C"]');
  await page.waitForTimeout(6500);
  const primera = await leer("d1a1b268e900");
  r.primera = primera.respuesta?.elecciones ?? null;
  debe(r.primera?.A?.opcion === 1 && r.primera?.B?.texto === "una vez y ya, con mis palabras" && r.primera?.C?.opcion === 2 && r.primera?.C?.texto === "pero que no pida permisos",
    `la primera se mandó entera aunque te fueras (${JSON.stringify(r.primera)})`);
  r.otra = await page.evaluate(() => ({
    titulo: document.getElementById("titulo")?.textContent ?? "",
    estado: document.getElementById("estado-envio")?.textContent ?? "",
    botonVisible: Boolean(document.querySelector(".pie-dec") && !document.querySelector(".pie-dec").hidden && document.getElementById("enviar-dec")),
    cerrada: [...document.querySelectorAll("fieldset.pregunta-d")].some((f) => f.disabled),
    marcadas: document.querySelectorAll("fieldset.pregunta-d input:checked").length,
    escrito: [...document.querySelectorAll(".libre")].map((t) => t.value).join(""),
  }));
  debe(r.otra.titulo.includes("reescritas"), `sigues en la otra (${r.otra.titulo})`);
  debe(!/Enviada/.test(r.otra.estado), `la otra no sale «Enviada» (${r.otra.estado})`);
  debe(r.otra.botonVisible && !r.otra.cerrada, "la otra conserva su botón de enviar y se puede contestar");
  debe(r.otra.marcadas === 0 && r.otra.escrito === "", `lo de la primera no entra en la otra (${r.otra.marcadas} marcadas, «${r.otra.escrito}»)`);
  const otraEnDisco = await leer("d1a1b29391a0");
  debe(!otraEnDisco.respuesta, "la otra sigue sin contestar");

  // 4. El agente da la otra por resuelta: deja de contar y ya no se contesta.
  await page.request.post(`${B}/api/resolver-decision`, { headers: AUT, data: { id: "d1a1b29391a0", como: "Me la pegó la Sesión Suprema: A1, B1, C1." } });
  await page.goto(`${B}/#decision=d1a1b29391a0`);
  // Con un tope corto y sin reventar: la página de antes no la pinta, y el fallo
  // se cuenta abajo.
  await page.waitForSelector("fieldset.pregunta-d", { timeout: 8000 }).catch(() => {});
  await page.waitForSelector(".dec-vig", { timeout: 3000 }).catch(() => {});
  r.resuelta = await page.evaluate(() => ({
    vig: document.querySelector(".dec-vig")?.textContent ?? "",
    pie: Boolean(document.getElementById("pie-dec") && !document.getElementById("pie-dec").hidden),
    cerrada: [...document.querySelectorAll("fieldset.pregunta-d")].every((f) => f.disabled),
  }));
  debe(r.resuelta.vig.includes("Ya está decidida.") && r.resuelta.vig.includes("Me la pegó la Sesión Suprema: A1, B1, C1."), `la resuelta dice cómo («${r.resuelta.vig}»)`);
  debe(!r.resuelta.pie && r.resuelta.cerrada, "la resuelta no se contesta");
  r.contestarResuelta = (await page.request.post(`${B}/api/decision/responder`, { headers: AUT, data: { id: "d1a1b29391a0", elecciones: { A: { opcion: 1 }, B: { opcion: 1 }, C: { opcion: 1 } } } })).status();
  debe(r.contestarResuelta === 409, `contestar una resuelta es 409 (${r.contestarResuelta})`);
  const lista = (await (await page.request.get(`${B}/api/decisiones`, { headers: AUT })).json()).decisiones;
  r.estados = Object.fromEntries(lista.filter((d) => d.id.startsWith("d1a1b")).map((d) => [d.id, d.vigencia]));
  debe(r.estados.d1a1b268e900 === "contestada" && r.estados.d1a1b29391a0 === "resuelta", `ninguna de las dos te espera ya (${JSON.stringify(r.estados)})`);
  await page.click("#atras");
  await page.waitForSelector('.tarjeta[data-id="d1a1b29391a0"]');
  r.enAnteriores = await page.evaluate(() => document.querySelector('.tarjeta[data-id="d1a1b29391a0"]')?.dataset.vigencia ?? "");
  debe(r.enAnteriores === "resuelta", `en la lista sale como resuelta (${r.enAnteriores})`);

  // 5. Una reescrita: la vieja lleva a la nueva.
  await page.request.post(`${B}/api/sembrar-decision`, { headers: AUT, data: { id: "d1a1b30000a1", titulo: "¿Cuál de las dos?", proyecto: "Adeorq", panel: 1 } });
  await page.request.post(`${B}/api/sembrar-decision`, { headers: AUT, data: { id: "d1a1b30000a2", titulo: "¿Cuál de las dos? (mejor dicha)", proyecto: "Adeorq", panel: 1 } });
  await page.request.post(`${B}/api/resolver-decision`, { headers: AUT, data: { id: "d1a1b30000a1", como: "La sustituye «¿Cuál de las dos? (mejor dicha)» (d1a1b30000a2).", sustituta: "d1a1b30000a2" } });
  await page.goto(`${B}/#decision=d1a1b30000a1`);
  r.sustituta = await page.waitForSelector("#ir-sustituta", { timeout: 8000 }).then(async () => {
    await page.click("#ir-sustituta");
    await page.waitForFunction(() => document.getElementById("titulo")?.textContent.includes("mejor dicha"), null, { timeout: 8000 });
    return page.isVisible("#enviar-dec");
  }, () => false);
  debe(r.sustituta, "«Abrir la nueva» abre la que sí se contesta");

  // 6. La resuelve el agente mientras la contestas: se dice, no «ya contestada».
  await page.request.post(`${B}/api/sembrar-decision`, { headers: AUT, data: { id: "d1a1b30000b1", titulo: "¿Lo subo?", proyecto: "Adeorq", panel: 1 } });
  await page.goto(`${B}/#decision=d1a1b30000b1`);
  await page.waitForSelector('fieldset[data-q="A"]');
  await page.click('fieldset[data-q="A"] label.opcion:nth-of-type(1)');
  await page.click("#enviar-dec");
  await page.request.post(`${B}/api/resolver-decision`, { headers: AUT, data: { id: "d1a1b30000b1", como: "Me dijo que sí en la terminal." } });
  await page.waitForTimeout(6500);
  r.aMitad = await page.evaluate(() => ({ estado: document.getElementById("estado-envio")?.textContent ?? "", vig: document.querySelector(".dec-vig")?.textContent ?? "" }));
  debe(r.aMitad.estado.includes("el agente la dio por resuelta") && r.aMitad.vig.includes("Ya está decidida."), `resuelta a mitad, se dice (${JSON.stringify(r.aMitad)})`);
  return { fallos, r };
}
