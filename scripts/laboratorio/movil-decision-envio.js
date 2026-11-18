// Enviar una decisión desde el móvil y tenerla abierta mientras cambia en el
// PC. Lo que encontró la segunda revisión aparte del 2026-11-18:
//
//   · H1: tu propio envío salía como «contestada desde otro sitio», con lo que
//     sí se mandó debajo de «no se mandó». El PC apunta la respuesta y luego
//     espera a la ventana para teclearla (hasta 20 s), y el sondeo de la página
//     caía en ese hueco. Lo mismo si la contestación del PC se pierde a la
//     vuelta. Aquí el doble retiene o corta esa contestación
//     (`/api/sembrar-responder`).
//   · H2: una vuelta del sondeo que seguía a medias al cambiar de pantalla se
//     rearmaba al acabar y borraba el sondeo de la pantalla nueva.
//   · H3: volver a una pregunta durante la cuenta atrás la paraba sin decirlo.
//   · H4: si la respuesta se va a teclear lo dice el PC (`se_teclea`), y la
//     nota se pone al día si la terminal se cierra con la decisión abierta.
//
// Y lo que no se había medido: el sondeo sin red y con la pantalla apagada, lo
// escrito que no se mandó, y «Atrás» a 360, 390 y 430 px con la letra grande.
//
//   node scripts/laboratorio/bancos-movil.mjs envio
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const cab = { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  const errores = [];
  page.on("pageerror", (x) => errores.push(String(x).slice(0, 160)));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${B}/`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);

  const post = (ruta, cuerpo) => fetch(`${B}${ruta}`, { method: "POST", headers: cab, body: JSON.stringify(cuerpo) });
  const pregunta = (id, n) => ({ id, titulo: `La pregunta ${id}`, opciones: Array.from({ length: n }, (_, i) => ({ texto: `Opción ${i + 1} de ${id}` })) });
  const DOS = [pregunta("A", 2), pregunta("B", 2)];
  let serie = 0;
  const sembrar = async (preguntas, panel = 1) => {
    const id = `de7710a${String(++serie).padStart(4, "0")}`;
    await post("/api/sembrar-decision", { id, titulo: `Envío ${serie}`, proyecto: "Adeorq", panel, preguntas });
    return id;
  };
  /** La abre y espera a que se pueda tocar: recién pintada no atiende toques. */
  const ver = async (id) => {
    await page.goto(`${B}/?c=${++serie}#decision=${id}`);
    await page.waitForSelector(".pregunta-d", { state: "attached" });
    await page.waitForTimeout(900);
  };
  const abrir = async (preguntas, panel) => { const id = await sembrar(preguntas, panel); await ver(id); return id; };
  const enServidor = async (id) => (await fetch(`${B}/api/decision?id=${id}`, { headers: cab })).json();
  const borrador = (id) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), `adeorq-decision-${id}`);
  const opcion = (q, n) => `.pregunta-d[data-q="${q}"] .opcion:nth-of-type(${n})`;
  const vista = () => page.evaluate(() => {
    const visto = (x) => Boolean(x?.offsetParent);
    const texto = (sel) => [...document.querySelectorAll(sel)].filter(visto).map((x) => x.textContent.replace(/\s+/g, " ").trim()).join(" | ");
    const enviar = document.getElementById("enviar-dec");
    return {
      titulo: texto(".dec-titulo"),
      preguntas: [...document.querySelectorAll(".pregunta-d:not([disabled])")].filter(visto).map((f) => f.dataset.q).join(""),
      repaso: visto(document.getElementById("dec-repaso")),
      enviar: visto(enviar) ? enviar.textContent.trim() : "",
      estado: document.getElementById("estado-envio")?.textContent.trim() ?? "",
      hecha: texto(".dec-hecha"),
      mio: texto(".dec-mio"),
      aviso: texto(".dec-vig"),
      nota: texto(".dec-nota"),
    };
  });
  /** Un tramo que revienta es un fallo suyo y no tumba los demás. */
  const tramo = async (nombre, fn) => {
    try { await fn(); } catch (err) { fallos.push(`${nombre}: no se pudo recorrer (${String(err.message || err).split("\n")[0].slice(0, 160)})`); }
  };
  const SONDEO = /\/api\/decision\?/;
  const TEXTO = "con mis palabras, y que llegue";

  // ── H1: el PC apunta la respuesta y tarda en contestar ──
  await tramo("H1 (el hueco)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await page.click(opcion("A", 1));
    await page.fill('.libre[data-q="A"]', TEXTO);
    await post("/api/sembrar-responder", { espera: 9000 });
    await page.click("#enviar-dec");
    await page.waitForFunction(() => /Mandando/.test(document.getElementById("enviar-dec")?.textContent ?? ""), null, { timeout: 9000 });
    // Apuntada en el PC y aún sin contestación: en estos 7 s cae una vuelta del sondeo.
    await page.waitForTimeout(7000);
    const hueco = await vista();
    const apuntada = Boolean((await enServidor(id)).respuesta);
    await page.waitForFunction(() => /Enviada/.test(document.querySelector(".dec-titulo")?.textContent ?? ""), null, { timeout: 6000 }).catch(() => {});
    const fin = await vista();
    const b = await borrador(id);
    pasos.h1Hueco = { apuntada, hueco, fin, borrador: b };
    debe(apuntada, "H1: el doble apunta la respuesta antes de contestar, como el PC");
    debe(!/otro sitio/.test(hueco.estado) && !hueco.hecha, `H1: mientras el PC tarda en contestar, tu envío no sale como contestado desde otro sitio (estado «${hueco.estado}», «${hueco.hecha}»)`);
    debe(!hueco.mio, `H1: ni sale como no mandado lo que sí se mandó («${hueco.mio}»)`);
    debe(/Enviada/.test(fin.titulo) && /^Enviada\./.test(fin.estado), `H1: cuando el PC contesta, sale «Enviada» (título «${fin.titulo}», estado «${fin.estado}»)`);
    debe(!fin.mio && b === null, `H1: y no queda nada como no mandado («${fin.mio}», borrador ${JSON.stringify(b)})`);
  });

  // ── H1: la respuesta llega al PC y su contestación se pierde por el camino ──
  await tramo("H1 (la contestación se pierde)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await page.click(opcion("A", 2));
    await page.fill('.libre[data-q="A"]', TEXTO);
    await post("/api/sembrar-responder", { pierde: true });
    await page.click("#enviar-dec");
    // La cuenta, el envío que se queda sin contestación y, en la página de antes, la vuelta del sondeo.
    await page.waitForTimeout(5000 + 8000);
    const v = await vista();
    const s = await enServidor(id);
    const b = await borrador(id);
    pasos.h1Perdida = { apuntada: s.respuesta?.elecciones ?? null, v, borrador: b };
    debe(s.respuesta?.elecciones?.A?.texto === TEXTO, `H1: la respuesta sí llegó al PC (${JSON.stringify(s.respuesta?.elecciones)})`);
    debe(/Enviada/.test(v.titulo) && /^Enviada\./.test(v.estado), `H1: si la contestación del PC se pierde, la página mira cómo quedó y dice «Enviada» (título «${v.titulo}», estado «${v.estado}»)`);
    debe(!v.mio && b === null, `H1: y no saca lo mandado como no mandado («${v.mio}», borrador ${JSON.stringify(b)})`);
  });

  // ── Lo escrito y no mandado: solo lo que no está en la respuesta, con sus renglones, y se puede borrar ──
  await tramo("lo que no se mandó", async () => {
    const id = await abrir(DOS);
    const IGUAL = "lo mismo que dijo el otro aparato";
    const SOLO = "esto solo lo escribí aquí\ny en dos renglones";
    await page.fill('.libre[data-q="A"]', IGUAL);
    await page.click("#paso-sig");
    await page.waitForTimeout(650);
    await page.fill('.libre[data-q="B"]', SOLO);
    await post("/api/decision/responder", { id, elecciones: { A: { opcion: 1, texto: IGUAL }, B: { opcion: 2 } } });
    await page.waitForSelector(".dec-hecha", { timeout: 9000 });
    const v = await vista();
    const renglones = await page.evaluate(() => {
      const p = [...document.querySelectorAll(".dec-mio p")].find((x) => /solo lo escribí/.test(x.textContent));
      return p ? { espacios: getComputedStyle(p).whiteSpace, alto: Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)) } : null;
    });
    debe(/solo lo escribí aquí/.test(v.mio), `lo escrito aquí que no está en la respuesta sigue a la vista («${v.mio}»)`);
    debe(!v.mio.includes(IGUAL), `lo que ya está en la respuesta no sale como no mandado («${v.mio}»)`);
    debe(Boolean(renglones) && /^pre/.test(renglones.espacios) && renglones.alto >= 2, `y conserva sus saltos de línea (${JSON.stringify(renglones)})`);
    const boton = await page.$("#olvidar-mio");
    debe(Boolean(boton), "lo no mandado se puede borrar: antes salía cada vez que reabrías la decisión");
    await ver(id);
    const otraVez = await vista();
    debe(/solo lo escribí aquí/.test(otraVez.mio), `mientras no se borra, sigue ahí al reabrirla («${otraVez.mio}»)`);
    if (boton) {
      await page.click("#olvidar-mio");
      await page.waitForTimeout(300);
      const borrado = await vista();
      const b = await borrador(id);
      await ver(id);
      const luego = await vista();
      pasos.noMandado = { v: v.mio, renglones, borrado: borrado.mio, borrador: b, luego: luego.mio };
      debe(!borrado.mio && b === null && !luego.mio, `borrado, no vuelve a salir («${borrado.mio}», borrador ${JSON.stringify(b)}, al reabrir «${luego.mio}»)`);
    }
  });

  // ── H2: una vuelta a medias no se lleva el sondeo de la pantalla siguiente ──
  await tramo("H2", async () => {
    await abrir([pregunta("A", 2)]);
    await page.route(SONDEO, async (ruta) => {
      await new Promise((r) => setTimeout(r, 3000));
      await ruta.continue().catch(() => {});
    });
    try {
      await page.waitForRequest(SONDEO, { timeout: 9000 });
      // La vuelta está en el aire: se sale a la lista, que arma su propio sondeo.
      await page.click("#atras");
      await page.waitForSelector("#decisiones .tarjeta");
      await page.waitForTimeout(3500);
    } finally {
      await page.unroute(SONDEO);
    }
    const nueva = await sembrar([pregunta("A", 2)]);
    const llego = await page.waitForSelector(`#decisiones .tarjeta[data-id="${nueva}"]`, { timeout: 13000 }).then(() => true, () => false);
    pasos.h2 = { llego };
    debe(llego, "H2: salir de una decisión con una vuelta del sondeo en el aire no deja la lista sin ponerse al día");
  });

  // ── H3: durante la cuenta, volver a una pregunta la para y lo dice; irse la manda ──
  await tramo("H3", async () => {
    const id = await abrir(DOS);
    await page.click(opcion("A", 1));
    await page.waitForTimeout(1300);
    await page.click(opcion("B", 1));
    await page.waitForSelector("#dec-repaso .dec-fila");
    const enviar = async () => {
      await page.waitForFunction(() => { const b = document.getElementById("enviar-dec"); return b?.offsetParent && !b.disabled; }, null, { timeout: 4000 });
      await page.click("#enviar-dec");
      await page.waitForTimeout(1200);
    };
    await enviar();
    const contando = await vista();
    await page.click("#paso-atras");
    await page.waitForTimeout(400);
    const trasAtras = await vista();
    await page.waitForTimeout(5300);
    const s1 = await enServidor(id);
    debe(/^Deshacer/.test(contando.enviar), `H3: la cuenta atrás había empezado (botón «${contando.enviar}»)`);
    debe(trasAtras.preguntas === "B" && !s1.respuesta, `H3: «Atrás» del pie durante la cuenta vuelve a la última pregunta y no envía (se ve «${trasAtras.preguntas}», quedó «${s1.vigencia}»)`);
    debe(/No se ha mandado/.test(trasAtras.estado), `H3: y lo dice (estado «${trasAtras.estado}»)`);
    // Lo mismo tocando una fila del repaso.
    await page.click("#paso-sig");
    await page.waitForSelector("#dec-repaso .dec-fila");
    await enviar();
    await page.click('.dec-fila[data-i="0"]');
    await page.waitForTimeout(400);
    const trasFila = await vista();
    await page.waitForTimeout(5300);
    const s2 = await enServidor(id);
    debe(trasFila.preguntas === "A" && !s2.respuesta && /No se ha mandado/.test(trasFila.estado), `H3: tocar una fila del repaso durante la cuenta hace lo mismo (se ve «${trasFila.preguntas}», estado «${trasFila.estado}», quedó «${s2.vigencia}»)`);
    // Irse de la decisión no es volver a una pregunta: se pulsó «Enviar», y se manda.
    await page.click("#paso-sig");
    await page.waitForSelector("#dec-repaso .dec-fila");
    await enviar();
    await page.click("#atras");
    await page.waitForTimeout(6000);
    const s3 = await enServidor(id);
    pasos.h3 = { contando: contando.enviar, trasAtras, trasFila, alIrse: s3.vigencia };
    debe(Boolean(s3.respuesta), `irse de la decisión con la flecha de arriba durante la cuenta la manda igual (quedó «${s3.vigencia}»)`);
  });

  // ── El sondeo: con su firma, sin red y con la pantalla apagada ──
  await tramo("el sondeo", async () => {
    const id = await abrir([pregunta("A", 2)]);
    const pedidas = async () => (await fetch(`${B}/api/pedidas-decision`, { headers: cab })).json().catch(() => []);
    const antes = (await pedidas()).length;
    await page.waitForTimeout(13000);
    const vueltas = (await pedidas()).slice(antes);
    debe(vueltas.length >= 2 && vueltas.every((x) => x === "igual"), `mientras nada cambia, el sondeo pregunta con la firma de lo que tiene y el PC contesta solo «igual» (${vueltas.join(", ") || "ninguna vuelta con firma"})`);
    // Sin red: falla callado, y se puede seguir escribiendo.
    let cortadas = 0;
    await page.route(SONDEO, (ruta) => { cortadas += 1; return ruta.abort(); });
    await page.fill(".libre", "sin red también se escribe");
    await page.waitForTimeout(13000);
    await page.unroute(SONDEO);
    const sinRed = await vista();
    debe(cortadas >= 2 && sinRed.estado === "" && sinRed.preguntas === "A" && !errores.length, `sin red el sondeo falla callado y la pregunta sigue ahí (${cortadas} vueltas cortadas, estado «${sinRed.estado}», errores ${JSON.stringify(errores)})`);
    // Con la pantalla apagada no pregunta; al encenderla, se entera enseguida.
    let apagada = 0;
    const contar = (pedido) => { if (SONDEO.test(pedido.url())) apagada += 1; };
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    page.on("request", contar);
    await page.waitForTimeout(13000);
    page.off("request", contar);
    await post("/api/decision/responder", { id, elecciones: { A: { opcion: 2 } } });
    const t0 = Date.now();
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const tardo = await page.waitForSelector(".dec-hecha", { timeout: 9000 }).then(() => Date.now() - t0, () => null);
    const fin = await vista();
    pasos.sondeo = { vueltas, cortadas, apagada, tardo, mio: fin.mio };
    debe(apagada === 0, `con la pantalla apagada el sondeo no pregunta (${apagada} peticiones en 13 s)`);
    // Sin esperar a la vuelta siguiente del sondeo, que puede tardar seis segundos.
    debe(tardo !== null && tardo < 2500, `contestada desde el PC con la pantalla apagada, al encenderla la página se entera enseguida (${tardo === null ? "no se enteró" : `${tardo} ms`})`);
    debe(/sin red también se escribe/.test(fin.mio), `y lo que se había escrito aquí sigue a la vista («${fin.mio}»)`);
  });

  // ── BAJA 5: la terminal se cierra con la decisión abierta ──
  await tramo("la terminal se cierra", async () => {
    await abrir([pregunta("A", 2)], 5);
    const antes = await vista();
    await page.fill(".libre", "a medio escribir");
    await page.evaluate(() => { document.querySelector(".libre").dataset.mismo = "1"; });
    await post("/api/sembrar-cerrar-terminal", { panel: 5 });
    await page.waitForFunction(() => /no se teclea/.test(document.querySelector(".dec-nota")?.textContent ?? ""), null, { timeout: 9000 }).catch(() => {});
    const luego = await vista();
    const cuadro = await page.evaluate(() => ({ mismo: document.querySelector(".libre")?.dataset.mismo ?? "", texto: document.querySelector(".libre")?.value ?? "" }));
    pasos.seCierra = { antes: antes.nota, luego: luego.nota, aviso: luego.aviso, cuadro };
    debe(/se teclea en el panel 5/.test(antes.nota), `con su terminal abierta se promete el tecleo («${antes.nota}»)`);
    debe(/no se teclea/.test(luego.nota) && !/se teclea en el panel/.test(luego.nota), `cerrada la terminal con la decisión abierta, la nota deja de prometerlo («${luego.nota}»)`);
    debe(/nadie/.test(luego.aviso), `y sale el aviso de que ya no la espera nadie («${luego.aviso}»)`);
    debe(cuadro.mismo === "1" && cuadro.texto === "a medio escribir", `sin repintar la pantalla: el cuadro es el mismo y conserva lo escrito (${JSON.stringify(cuadro)})`);
  });

  // ── «Atrás» no se mueve: a 360, 390 y 430 px con la letra grande ──
  pasos.atras = {};
  for (const ancho of [360, 390, 430]) await tramo(`«Atrás» a ${ancho} px`, async () => {
    await page.setViewportSize({ width: ancho, height: 780 });
    await page.evaluate(() => localStorage.setItem("adeorq-movil-ajustes", JSON.stringify({ letra: 1.25 })));
    const id = await abrir(DOS);
    const caja = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el?.offsetParent) return null;
      const r = el.getBoundingClientRect();
      const letras = document.createRange();
      letras.selectNodeContents(el);
      return {
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        texto: el.textContent.trim(), renglones: new Set([...letras.getClientRects()].map((c) => Math.round(c.top))).size,
        letra: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
      };
    }, sel);
    const en = {};
    en.primera = { atras: await caja("#paso-atras"), otro: await caja("#paso-sig") };
    await page.click(opcion("A", 1));
    await page.waitForTimeout(1300);
    en.segunda = { atras: await caja("#paso-atras"), otro: await caja("#paso-sig") };
    await page.click(opcion("B", 1));
    await page.waitForSelector("#dec-repaso .dec-fila");
    await page.waitForFunction(() => !document.getElementById("enviar-dec").disabled, null, { timeout: 4000 });
    en.repaso = { atras: await caja("#paso-atras"), otro: await caja("#enviar-dec") };
    await page.click("#enviar-dec");
    await page.waitForTimeout(300);
    en.cuenta = { atras: await caja("#paso-atras"), otro: await caja("#enviar-dec") };
    const deLado = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    // Se deshace: este tramo mide, no manda.
    await page.waitForTimeout(700);
    await page.click("#enviar-dec");
    await page.waitForTimeout(300);
    const s = await enServidor(id);
    pasos.atras[ancho] = en;
    const misma = (a, b) => Boolean(a && b) && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    debe(misma(en.primera.atras, en.segunda.atras) && misma(en.segunda.atras, en.repaso.atras) && misma(en.repaso.atras, en.cuenta.atras),
      `a ${ancho} px y con la letra grande, «Atrás» ocupa la misma caja en las dos preguntas, en el repaso y durante la cuenta (${JSON.stringify(Object.fromEntries(Object.entries(en).map(([k, v]) => [k, v.atras && [v.atras.x, v.atras.y, v.atras.w, v.atras.h]])))})`);
    debe(Object.values(en).every((v) => v.atras?.renglones === 1 && v.otro?.renglones === 1),
      `a ${ancho} px los dos botones del pie caben en un renglón (${Object.entries(en).map(([k, v]) => `${k}: «${v.otro?.texto}» en ${v.otro?.renglones}`).join(", ")})`);
    debe(Object.values(en).every((v) => v.atras?.letra >= 13.5 && v.atras?.h >= 44), `a ${ancho} px «Atrás» se lee y se puede tocar (${en.repaso.atras?.letra} px de letra, ${en.repaso.atras?.h} px de alto)`);
    debe(!deLado, `a ${ancho} px nada empuja la página de lado`);
    debe(!s.respuesta, "deshecha la cuenta, no se manda");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem("adeorq-movil-ajustes"));

  // ── H4: si se teclea lo dice el PC. Va el último: escribirle al panel 1 da por habladas las suyas ──
  await tramo("H4", async () => {
    const id = await sembrar([pregunta("A", 2)]);
    const { arranque } = await (await fetch(`${B}/api/terminales`, { headers: cab })).json();
    await post("/api/terminal/escribir", { panel: 1, arranque, texto: "sigue con lo otro" });
    await ver(id);
    const h = await vista();
    const s = await enServidor(id);
    debe(s.vigencia === "hablada" && s.se_teclea === true, `H4: una hablada del mismo arranque y con su terminal abierta: el PC dice que se teclea (vigencia «${s.vigencia}», se_teclea ${s.se_teclea})`);
    debe(/se teclea en el panel 1/.test(h.nota), `H4: y la página dice lo mismo que hará el PC («${h.nota}»)`);
    await page.click(opcion("A", 1));
    await page.click("#enviar-dec");
    await page.waitForFunction(() => /^Enviada/.test(document.getElementById("estado-envio")?.textContent ?? ""), null, { timeout: 9000 }).catch(() => {});
    const fin = await vista();
    pasos.h4 = { vigencia: s.vigencia, seTeclea: s.se_teclea, nota: h.nota, fin: fin.estado };
    debe(fin.estado === "Enviada. Se ha tecleado en el panel 1.", `H4: y al enviarla se teclea («${fin.estado}»)`);
  });
  debe(!errores.length, `sin errores de página (${JSON.stringify(errores)})`);
  return { pasos, fallos };
}
