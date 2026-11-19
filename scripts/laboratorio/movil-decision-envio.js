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
  // `TRAMOS=N1,B3 node scripts/laboratorio/bancos-movil.mjs decision-envio` lanza solo los que empiezan así.
  const soloTramos = (typeof process === "undefined" ? "" : process.env.TRAMOS ?? "").split(",").filter(Boolean);
  /** Un tramo que revienta es un fallo suyo y no tumba los demás. */
  const tramo = async (nombre, fn) => {
    if (soloTramos.length && !soloTramos.some((s) => nombre.startsWith(s))) return;
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

  // Lo que dejó la revisión de la 0.9.261. Toques de ratón en puntos medidos antes, como el dedo.
  const punto = async (sel) => {
    const el = await page.$(sel);
    const c = el && await el.boundingBox();
    return c ? { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + c.height / 2) } : null;
  };
  const tocar = async (sel) => {
    const p = await punto(sel);
    if (!p) throw new Error(`no se ve ${sel}`);
    await page.mouse.click(p.x, p.y);
  };
  const tocarSiSeVe = async (sel) => { const p = await punto(sel); if (p) await page.mouse.click(p.x, p.y); return Boolean(p); };
  const enviarEncendido = () => page.waitForFunction(() => { const b = document.getElementById("enviar-dec"); return b?.offsetParent && !b.disabled; }, null, { timeout: 4000 });
  const enRepaso = () => page.waitForFunction(() => document.getElementById("dec-repaso")?.offsetParent, null, { timeout: 4000 });
  /** A y B con su opción 1, hasta el repaso con «Enviar» ya encendido. */
  const hastaElRepaso = async () => {
    await tocar(opcion("A", 1));
    await page.waitForTimeout(1300);
    await tocar(opcion("B", 1));
    await enRepaso();
    await enviarEncendido();
  };
  const tarjetaDe = (id) => `#decisiones .tarjeta[data-id="${id}"]`;
  /** Con la lista larga la tarjeta puede quedar por debajo de la pantalla: se lleva a la vista y se toca donde quede. */
  const tocarTarjeta = async (id) => {
    await page.$eval(tarjetaDe(id), (x) => x.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(120);
    await tocar(tarjetaDe(id));
  };
  /** La flecha de arriba y, desde la lista, otra vez a la misma decisión. */
  const salirYVolver = async (id) => {
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    await page.waitForTimeout(150);
    await tocarTarjeta(id);
    await page.waitForSelector("#pie-dec:not([hidden])");
    await page.waitForTimeout(650);
  };
  const hastaQueDiga = (re, ms = 9000) => page.waitForFunction((f) => new RegExp(f).test(document.getElementById("estado-envio")?.textContent ?? ""), re.source, { timeout: ms }).catch(() => {});
  const dichos = () => page.evaluate(() => [...document.querySelectorAll(".dec-dicho")].map((x) => x.textContent.trim()));
  const hastaApuntada = async (id, ms = 9000) => {
    for (const fin = Date.now() + ms; Date.now() < fin; await page.waitForTimeout(150)) if ((await enServidor(id)).respuesta) return true;
    return false;
  };
  const avisoEnvio = () => page.evaluate(() => document.getElementById("envios-dec")?.textContent.replace(/\s+/g, " ").trim() ?? "");

  // ── N1: salir durante la cuenta, volver y cambiar lo que ya se está mandando ──
  await tramo("N1 (reabrir)", async () => {
    const id = await abrir(DOS);
    await hastaElRepaso();
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await salirYVolver(id);
    const reabierta = await vista();
    const aspecto = await page.evaluate(() => ({
      descartar: getComputedStyle(document.querySelector(".dec-acciones")).visibility,
      fila: getComputedStyle(document.querySelector(".dec-fila")).borderTopColor,
    }));
    debe(aspecto.descartar === "hidden" && aspecto.fila === "rgba(0, 0, 0, 0)", `N1: lo que no se puede tocar mientras se manda deja de parecer pulsable (${JSON.stringify(aspecto)})`);
    // El dedo de la revisión: la fila de B y, si deja, su opción 2.
    await tocarSiSeVe('.dec-fila[data-i="1"]');
    await page.waitForTimeout(650);
    const trasFila = await vista();
    await tocarSiSeVe(opcion("B", 2));
    await page.waitForTimeout(1200);
    await hastaQueDiga(/Enviada|otro sitio/);
    const fin = await vista();
    const quedo = await dichos();
    const s = await enServidor(id);
    pasos.n1 = { reabierta, trasFila, fin: fin.estado, quedo, pc: s.respuesta?.elecciones ?? null };
    debe(reabierta.repaso && /^Deshacer \(\d\)$/.test(reabierta.enviar) && /^Se manda en \d s/.test(reabierta.estado), `N1: al reabrirla durante la cuenta sale el repaso con su «Deshacer» (repaso ${reabierta.repaso}, botón «${reabierta.enviar}», estado «${reabierta.estado}»)`);
    debe(trasFila.repaso && /^Deshacer/.test(trasFila.enviar), `N1: mientras se manda no se puede ir a cambiar una pregunta (se ve «${trasFila.preguntas}», botón «${trasFila.enviar}»)`);
    debe(s.respuesta?.elecciones?.B?.opcion === 1, `N1: el PC recibe lo que se pulsó (${JSON.stringify(s.respuesta?.elecciones)})`);
    debe(quedo.some((x) => x.startsWith("1. Opción 1 de B")), `N1: la pantalla enseña lo mismo que recibió el PC (${JSON.stringify(quedo)})`);
    debe(/^Enviada\./.test(fin.estado), `N1: y dice «Enviada», no que la contestó otro («${fin.estado}»)`);
  });
  await tramo("N1 (Deshacer)", async () => {
    const id = await abrir(DOS);
    await hastaElRepaso();
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await salirYVolver(id);
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    const deshecha = await vista();
    await page.waitForTimeout(5500);
    const s1 = await enServidor(id);
    debe(/No se ha mandado/.test(deshecha.estado) && deshecha.enviar === "Enviar respuesta", `N1: «Deshacer» de la cuenta retomada la para y lo dice (botón «${deshecha.enviar}», estado «${deshecha.estado}»)`);
    debe(!s1.respuesta, `N1: deshecha, no le llega nada al PC (${JSON.stringify(s1.respuesta?.elecciones)})`);
    const suelta = await page.evaluate(() => getComputedStyle(document.querySelector(".dec-acciones")).visibility);
    debe(suelta === "visible", `N1: deshecha, «Descartar» vuelve a estar a la vista (${suelta})`);
    // Parada la cuenta, ya se puede cambiar y mandar lo nuevo.
    await tocar('.dec-fila[data-i="1"]');
    await page.waitForTimeout(650);
    await tocar(opcion("B", 2));
    await enRepaso();
    await enviarEncendido();
    await tocar("#enviar-dec");
    await hastaQueDiga(/^Enviada/);
    const s2 = await enServidor(id);
    pasos.n1Deshacer = { deshecha: deshecha.estado, pc: s2.respuesta?.elecciones ?? null };
    debe(s2.respuesta?.elecciones?.B?.opcion === 2, `N1: tras deshacer, lo cambiado es lo que se manda (${JSON.stringify(s2.respuesta?.elecciones)})`);
  });
  await tramo("N1 (una sola pregunta)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await tocar(opcion("A", 1));
    await page.waitForTimeout(200);
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await salirYVolver(id);
    const reabierta = await vista();
    await tocarSiSeVe(opcion("A", 2));
    await page.waitForTimeout(400);
    const marcada = await page.evaluate(() => document.querySelector('input[name="q-A"]:checked')?.value ?? "");
    await hastaQueDiga(/Enviada|otro sitio/);
    const s = await enServidor(id);
    pasos.n1Una = { boton: reabierta.enviar, marcada, pc: s.respuesta?.elecciones ?? null };
    debe(/^Deshacer/.test(reabierta.enviar), `N1: con una sola pregunta también se retoma la cuenta (botón «${reabierta.enviar}»)`);
    debe(marcada === "1", `N1: con una sola pregunta, lo marcado no cambia mientras se manda (marcada ${marcada})`);
    debe(s.respuesta?.elecciones?.A?.opcion === 1, `N1: y el PC recibe lo que se pulsó (${JSON.stringify(s.respuesta?.elecciones)})`);
  });
  await tramo("N1 (mandando)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await tocar(opcion("A", 2));
    await page.waitForTimeout(200);
    await post("/api/sembrar-responder", { espera: 5000 });
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    debe(await hastaApuntada(id), "N1: la respuesta llega al PC aunque te hayas ido");
    // Por el aviso del móvil, que abre la decisión sin recargar: la lista se está
    // reordenando en este momento y la tarjeta puede cambiar de sitio bajo el toque.
    await page.evaluate((d) => { location.hash = `decision=${d}`; }, id);
    await page.waitForSelector("#titulo .tit");
    await page.waitForTimeout(700);
    const v = await vista();
    await hastaQueDiga(/^Enviada/);
    const fin = await vista();
    pasos.n1Mandando = { v, fin: fin.estado };
    debe(/Mandando/.test(v.enviar) && !v.hecha && !v.titulo, `N1: reabierta mientras el PC contesta, sigue en «Mandando…» (botón «${v.enviar}», título «${v.titulo}», «${v.hecha}»)`);
    debe(/^Enviada\./.test(fin.estado), `N1: y acaba en «Enviada» («${fin.estado}»)`);
  });

  // ── Salir con la flecha durante la cuenta: se ve que se está enviando ──
  await tramo("B2 (lista)", async () => {
    const id = await abrir(DOS);
    await hastaElRepaso();
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    await page.waitForTimeout(250);
    const estado = await page.textContent(`${tarjetaDe(id)} .estado`);
    const aviso = await avisoEnvio();
    await page.waitForFunction(() => /Enviada/.test(document.getElementById("envios-dec")?.textContent ?? ""), null, { timeout: 9000 }).catch(() => {});
    const luego = await avisoEnvio();
    const s = await enServidor(id);
    pasos.b2Lista = { estado: estado.trim(), aviso, luego, vigencia: s.vigencia };
    debe(!/te espera/i.test(estado) && /Se manda en \d s/.test(estado), `B2: en la lista ya no dice «te espera», dice que se manda («${estado.trim()}»)`);
    debe(!aviso, `B2: en la lista lo dice su tarjeta, sin repetirlo en un aviso encima («${aviso}»)`);
    debe(Boolean(s.respuesta), `B2: la flecha no cancela: la respuesta llega (quedó «${s.vigencia}»)`);
    debe(/Enviada/.test(luego), `B2: y el aviso dice cómo acabó («${luego}»)`);
  });
  await tramo("B2 (portada)", async () => {
    const id = await sembrar(DOS);
    const fila = `#reclaman .fila[data-id="${id}"]`;
    await page.goto(`${B}/?c=${++serie}`);
    await page.waitForSelector(fila);
    await page.waitForTimeout(400);
    await tocar(fila);
    await page.waitForSelector(".pregunta-d", { state: "attached" });
    await page.waitForTimeout(900);
    await hastaElRepaso();
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector("#reclaman", { state: "attached" });
    await page.waitForTimeout(700);
    const sigue = Boolean(await page.$(fila));
    const aviso = await avisoEnvio();
    pasos.b2Portada = { sigue, aviso };
    debe(!sigue, "B2: en la portada, lo que se está mandando ya no sale entre lo que te espera");
    debe(/Se manda en \d s|Mandando/.test(aviso), `B2: y la portada también avisa («${aviso}»)`);
    await hastaApuntada(id);
  });

  // ── Se pierde la contestación y tampoco se puede preguntar cómo quedó ──
  await tramo("B3", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await page.click(opcion("A", 1));
    await post("/api/sembrar-responder", { pierde: true });
    await page.route(SONDEO, (ruta) => ruta.abort());
    try {
      await page.click("#enviar-dec");
      await hastaQueDiga(/llegado|mandado/);
      const v = await vista();
      const s = await enServidor(id);
      pasos.b3 = { estado: v.estado, apuntada: Boolean(s.respuesta) };
      debe(Boolean(s.respuesta), "B3: la respuesta sí llegó al PC");
      debe(/No se sabe si ha llegado/.test(v.estado) && !/No se ha mandado/.test(v.estado), `B3: sin poder preguntar, dice que no se sabe si ha llegado («${v.estado}»)`);
    } finally {
      await page.unroute(SONDEO);
    }
    // Con red otra vez, el sondeo se entera de que era la tuya.
    await hastaQueDiga(/^Enviada/, 13000);
    const fin = await vista();
    pasos.b3.fin = fin.estado;
    debe(/^Enviada\./.test(fin.estado), `B3: y en cuanto hay red dice «Enviada» («${fin.estado}»)`);
  });

  // ── El primer intento llegó y se reenvía otro texto ──
  await tramo("B4", async () => {
    const id = await abrir([pregunta("A", 2)]);
    const PRIMERO = "el primer intento";
    const SEGUNDO = "el segundo intento, distinto";
    await page.click(opcion("A", 1));
    await page.fill('.libre[data-q="A"]', PRIMERO);
    await post("/api/sembrar-responder", { pierde: true });
    await page.route(SONDEO, (ruta) => ruta.abort());
    let cortado = true;
    try {
      await page.click("#enviar-dec");
      await hastaQueDiga(/llegado|mandado/);
      await page.fill('.libre[data-q="A"]', SEGUNDO);
      await enviarEncendido();
      await page.click("#enviar-dec");
      await page.waitForTimeout(400);
      await page.unroute(SONDEO);
      cortado = false;
      await page.waitForSelector(".dec-hecha", { timeout: 9000 });
    } finally {
      if (cortado) await page.unroute(SONDEO);
    }
    const v = await vista();
    const s = await enServidor(id);
    pasos.b4 = { titulo: v.titulo, estado: v.estado, mio: v.mio, pc: s.respuesta?.elecciones ?? null };
    debe(s.respuesta?.elecciones?.A?.texto === PRIMERO, `B4: al PC le llegó el primer intento (${JSON.stringify(s.respuesta?.elecciones)})`);
    debe(!/otro sitio/.test(v.estado), `B4: un intento tuyo que llegó no sale como contestado desde otro sitio («${v.estado}»)`);
    debe(/anterior/.test(v.estado) && /Enviada/.test(v.titulo), `B4: dice que llegó tu envío anterior (título «${v.titulo}», estado «${v.estado}»)`);
    debe(v.mio.includes(SEGUNDO), `B4: y lo último que escribiste sigue a la vista como no mandado («${v.mio}»)`);
  });

  // ── «Mandando…» tiene un límite ──
  const hastaSoltar = async () => {
    await page.waitForFunction(() => /Mandando/.test(document.getElementById("enviar-dec")?.textContent ?? ""), null, { timeout: 9000 });
    const t0 = Date.now();
    return page.waitForFunction(() => !/Mandando/.test(document.getElementById("enviar-dec")?.textContent ?? ""), null, { timeout: 38000 }).then(() => Date.now() - t0, () => null);
  };
  await tramo("B5 (apuntada)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await page.click(opcion("A", 1));
    await post("/api/sembrar-responder", { espera: 60000 });
    await page.click("#enviar-dec");
    const tardo = await hastaSoltar();
    // El botón se suelta justo antes de repintar la pantalla con cómo quedó.
    await hastaQueDiga(/Enviada|mandado|llegado/, 3000);
    const v = await vista();
    pasos.b5Apuntada = { tardo, titulo: v.titulo, estado: v.estado, apuntada: Boolean((await enServidor(id)).respuesta) };
    debe(tardo !== null && tardo >= 25000 && tardo <= 36000, `B5: «Mandando…» se corta a los 30 s (${tardo === null ? "seguía a los 38 s" : `${tardo} ms`})`);
    debe(/Enviada/.test(v.titulo), `B5: y al mirar cómo quedó, era la tuya (título «${v.titulo}», estado «${v.estado}»)`);
  });
  await tramo("B5 (sin apuntar)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await page.click(opcion("A", 2));
    await post("/api/sembrar-responder", { cuelga: true });
    await page.click("#enviar-dec");
    const tardo = await hastaSoltar();
    const v = await vista();
    const s = await enServidor(id);
    pasos.b5SinApuntar = { tardo, enviar: v.enviar, estado: v.estado, apuntada: Boolean(s.respuesta) };
    debe(tardo !== null && tardo <= 36000, `B5: sin contestación ni respuesta apuntada, también se corta (${tardo === null ? "seguía a los 38 s" : `${tardo} ms`})`);
    // A8: el PC contesta a la consulta, pero de este envío no se sabe nada: puede seguir en camino.
    debe(v.enviar === "Enviar respuesta" && /^No se sabe si ha llegado/.test(v.estado) && !/No se ha mandado|No llego/.test(v.estado), `A8: cortado a los 30 s no afirma que no se mandó, y se puede volver a enviar (botón «${v.enviar}», estado «${v.estado}»)`);
    await enviarEncendido();
    await page.click("#enviar-dec");
    await hastaQueDiga(/^Enviada/);
    debe((await enServidor(id)).respuesta?.elecciones?.A?.opcion === 2, "B5: el segundo envío llega");
  });

  // ── La letra de la pregunta, en claro y con un acento elegido ──
  await tramo("B6", async () => {
    const id = await sembrar(DOS);
    const medir = async (ajustes) => {
      await page.evaluate((a) => localStorage.setItem("adeorq-movil-ajustes", JSON.stringify(a)), ajustes);
      await ver(id);
      return page.evaluate(() => {
        const el = [...document.querySelectorAll(".pregunta-d .letra")].find((x) => x.offsetParent);
        const prueba = document.createElement("i");
        prueba.style.color = "var(--acento)";
        document.body.append(prueba);
        const acento = getComputedStyle(prueba).color;
        prueba.remove();
        const rgba = (t) => { const n = t.match(/-?\d*\.?\d+(?:e-?\d+)?/g).map(Number); const k = t.startsWith("color(") ? 255 : 1; return [n[0] * k, n[1] * k, n[2] * k, n[3] ?? 1]; };
        const capas = [];
        for (let x = el; x; x = x.parentElement) {
          const f = rgba(getComputedStyle(x).backgroundColor);
          if (f[3] > 0) capas.push(f);
          if (f[3] >= 1) break;
        }
        const claro = document.documentElement.dataset.tema === "claro";
        let fondo = claro ? [0xe8, 0xee, 0xf8] : [0x06, 0x0a, 0x12];
        for (const [r, g, b, a] of capas.reverse()) fondo = [r, g, b].map((v, i) => fondo[i] * (1 - a) + v * a);
        const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const color = getComputedStyle(el).color;
        const [a, b] = [lum(rgba(color)), lum(fondo)];
        return { color, acento, contraste: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 };
      });
    };
    // Los de Ajustes menos el azul, que es el de fábrica: con él no hay acento elegido y se mide abajo.
    const ACENTOS = ["#22d3ee", "#46c99a", "#f5c542", "#ff9a3c", "#ff4b6e", "#ff7ac6", "#a877ff"];
    pasos.b6 = { claro: {}, otros: {} };
    for (const acento of ACENTOS) {
      const m = await medir({ tema: "claro", acento });
      pasos.b6.claro[acento] = m.contraste;
      debe(m.contraste >= 4.5, `B6: en claro con el acento ${acento}, la letra de la pregunta se lee (contraste ${m.contraste})`);
    }
    for (const [nombre, ajustes] of [["oscuro y amarillo", { tema: "oscuro", acento: "#f5c542" }], ["oscuro de fábrica", { tema: "oscuro" }]]) {
      const m = await medir(ajustes);
      pasos.b6.otros[nombre] = m;
      debe(m.color === m.acento, `B6: en ${nombre} la letra de la pregunta sigue siendo el acento (${m.color} frente a ${m.acento})`);
    }
    // A4: cualquier acento en claro, también los más claros, el que viene del PC y el azul de fábrica.
    pasos.a4 = {};
    for (const acento of ["#ffffff", "#ffff00", "#ebbcba", "#00ff66", "#a6e22e", "#00f5d4", "#fbbf24", "#d9b06a", "#ff7edb", "#9aa4b8"]) {
      const m = await medir({ tema: "claro", acento });
      pasos.a4[acento] = m.contraste;
      debe(m.contraste >= 4.5, `A4: en claro con el acento ${acento}, la letra de la pregunta da 4,5:1 o más (${m.contraste})`);
    }
    const fabrica = await medir({ tema: "claro" });
    pasos.a4.fabrica = fabrica.contraste;
    debe(fabrica.contraste >= 4.5, `A4: en el claro de fábrica también (${fabrica.contraste})`);
    await page.evaluate(() => localStorage.setItem("adeorq-movil-pc", JSON.stringify({ acento: "#ffffff" })));
    await page.route("**/api/apariencia", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ acento: "#ffffff" }) }));
    const delPc = await medir({ tema: "claro" });
    await page.unroute("**/api/apariencia");
    pasos.a4.delPc = delPc.contraste;
    debe(delPc.contraste >= 4.5, `A4: con «El de tu PC» y el tema Negro (#ffffff) también (${delPc.contraste})`);
    await page.evaluate(() => { localStorage.removeItem("adeorq-movil-ajustes"); localStorage.removeItem("adeorq-movil-pc"); });
  });

  // Lo que dejó la revisión de las tres causas del 2026-11-18. Toques de ratón en puntos medidos, como el dedo.
  const cargaDe = (id) => (u) => u.pathname === "/api/decision" && u.searchParams.get("id") === id && !u.searchParams.has("si");
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── A1: tocar una, volver antes de que cargue, abrir otra y contestarla ──
  for (const [nombre, tardaA, tardaB] of [["la primera carga llega con la segunda ya pintada", 1200, 0], ["la primera carga llega con la segunda aún cargando", 1200, 2600]]) await tramo(`A1 (${nombre})`, async () => {
    const a = await sembrar(DOS, 4);
    const b = await sembrar(DOS, 2);
    await ver(await sembrar(DOS));
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(a));
    await page.waitForTimeout(300);
    await page.route(cargaDe(a), async (r) => { await pausa(tardaA); await r.continue().catch(() => {}); });
    if (tardaB) await page.route(cargaDe(b), async (r) => { await pausa(tardaB); await r.continue().catch(() => {}); });
    try {
      await tocarTarjeta(a);
      await page.waitForTimeout(250);
      await tocar("#atras");
      await page.waitForSelector(tarjetaDe(b));
      await page.waitForTimeout(150);
      await tocarTarjeta(b);
      await page.waitForTimeout(Math.max(tardaA, tardaB) + 1200);
      const seVe = await page.textContent("#titulo .tit");
      await tocar(opcion("A", 2));
      await page.waitForTimeout(1300);
      await tocar(opcion("B", 1));
      await enRepaso();
      await enviarEncendido();
      await tocar("#enviar-dec");
      await page.waitForTimeout(1200);
      const aviso = await avisoEnvio();
      await hastaApuntada(b, 9000);
      await page.waitForTimeout(1500);
      const [sa, sb] = [await enServidor(a), await enServidor(b)];
      const leer = async (panel) => (await (await fetch(`${B}/api/escrito?panel=${panel}`, { headers: cab })).json()).texto ?? "";
      const [en4, en2] = [await leer(4), await leer(2)];
      pasos[`a1 ${tardaB}`] = { seVe, aviso, a: sa.respuesta?.elecciones ?? null, b: sb.respuesta?.elecciones ?? null };
      debe(!sa.respuesta, `A1: la decisión que solo se abrió y se dejó no queda contestada (${JSON.stringify(sa.respuesta?.elecciones)})`);
      debe(sb.respuesta?.elecciones?.A?.opcion === 2 && sb.respuesta?.elecciones?.B?.opcion === 1, `A1: la que se contestó recibe lo que se marcó (${JSON.stringify(sb.respuesta?.elecciones)})`);
      debe(!aviso, `A1: no sale ningún envío de la otra decisión («${aviso}»)`);
      debe(!en4.includes(a), `A1: en la terminal de la decisión dejada no se teclea nada («${en4.slice(0, 90)}»)`);
      debe(en2.includes(b), `A1: en la terminal de la contestada sí («${en2.slice(0, 90)}»)`);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  // ── A2: lo que se le dijo a la persona no lo borra nadie ──
  const muestrasDe = async (n = 12) => {
    const dichos = [];
    for (let i = 0; i < n; i++) { dichos.push((await vista()).estado); await page.waitForTimeout(200); }
    return dichos;
  };
  await tramo("A2 (no se sabe si llegó)", async () => {
    const id = await abrir(DOS);
    await hastaElRepaso();
    let cortar = true;
    await page.route("**/api/decision/responder", (r) => r.abort());
    await page.route(cargaDe(id), (r) => (cortar ? r.abort() : r.continue()));
    try {
      await tocar("#enviar-dec");
      await page.waitForTimeout(300);
      await tocar("#atras");
      await page.waitForSelector(tarjetaDe(id));
      await page.waitForFunction(() => /No se sabe/.test(document.getElementById("envios-dec")?.textContent ?? ""), null, { timeout: 12000 });
      await page.waitForTimeout(6500);
      const fuera = await avisoEnvio();
      cortar = false;
      await tocar("#envios-dec .aviso-dec");
      await page.waitForSelector("#pie-dec:not([hidden])");
      const dichos = await muestrasDe();
      const tras = await avisoEnvio();
      pasos.a2 = { fuera, dichos: [...new Set(dichos)], tras };
      debe(/No se sabe/.test(fuera), `A2: lo que salió mal sigue avisado fuera pasados los 5 s («${fuera}»)`);
      debe(dichos.every((x) => /No se sabe si ha llegado/.test(x)), `A2: al abrirla se repite y se queda (${JSON.stringify([...new Set(dichos)])})`);
      debe(!tras, `A2: abierta, deja de avisarse fuera («${tras}»)`);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });
  await tramo("A2 (Deshacer nada más reabrir)", async () => {
    const id = await abrir(DOS);
    await hastaElRepaso();
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await salirYVolver(id);
    await tocar("#enviar-dec");
    const dichos = await muestrasDe();
    await page.waitForTimeout(4000);
    const s = await enServidor(id);
    pasos.a2Deshacer = [...new Set(dichos)];
    debe(dichos.every((x) => x === "No se ha mandado."), `A2: «Deshacer» en el primer segundo tras reabrir no pierde su frase (${JSON.stringify([...new Set(dichos)])})`);
    debe(!s.respuesta, `A2: y no se manda (${JSON.stringify(s.respuesta?.elecciones)})`);
  });

  // ── A8: cerrada desde otro sitio mientras estabas fuera ──
  await tramo("A8 (cerrada estando fuera)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await tocar(opcion("A", 1));
    await page.waitForTimeout(300);
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    await page.evaluate(() => ir({ vista: "lista" }));
    await post("/api/resolver-decision", { id, como: "ya me lo dijo en la terminal" });
    await page.waitForFunction(() => /resuelta/.test(document.getElementById("envios-dec")?.textContent ?? ""), null, { timeout: 12000 });
    await page.waitForTimeout(6500);
    const fuera = await avisoEnvio();
    debe(/resuelta/.test(fuera), `A8: lo que no salió se sigue diciendo fuera pasados los 5 s («${fuera}»)`);
    if (!fuera) return;
    await tocar("#envios-dec .aviso-dec");
    await page.waitForSelector(".dec-vig");
    await page.waitForTimeout(500);
    const v = await vista();
    pasos.a8Cerrada = { fuera, estado: v.estado };
    debe(/resuelta/.test(v.estado), `A8: y se repite al abrirla («${v.estado}»)`);
  });
  await tramo("A8 (lo bueno se va solo)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await tocar(opcion("A", 1));
    await page.waitForTimeout(300);
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    await page.evaluate(() => ir({ vista: "lista" }));
    await page.waitForFunction(() => /Enviada/.test(document.getElementById("envios-dec")?.textContent ?? ""), null, { timeout: 12000 });
    await page.waitForTimeout(5800);
    const luego = await avisoEnvio();
    debe(!luego, `A8: «Enviada» se va sola a los 5 s («${luego}»)`);
  });
  await tramo("A8 (cerrada con la cuenta en marcha)", async () => {
    const id = await abrir(DOS);
    await hastaElRepaso();
    let mandados = 0;
    const contar = (p) => { if (p.method() === "POST" && p.url().endsWith("/api/decision/responder")) mandados += 1; };
    page.on("request", contar);
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    await post("/api/resolver-decision", { id, como: "ya está hablado" });
    await page.waitForTimeout(150);
    await tocarTarjeta(id);
    await page.waitForSelector(".dec-vig", { timeout: 6000 });
    await page.waitForTimeout(6000);
    page.off("request", contar);
    const v = await vista();
    pasos.a8Parada = { mandados, enviar: v.enviar, aviso: v.aviso };
    debe(mandados === 0, `A8: cerrada desde otro sitio durante la cuenta, al abrirla se para y no se manda (${mandados} envíos)`);
    debe(!/^Deshacer/.test(v.enviar) && /decidida/.test(v.aviso), `A8: y se enseña cómo quedó (botón «${v.enviar}», aviso «${v.aviso}»)`);
  });

  // ── A3: reabrir con un envío en marcha sale al momento, sin esperar al PC ──
  const CARGAS = [
    ["la carga tarda 6 s", async (r) => { await pausa(6000); await r.continue().catch(() => {}); }],
    ["la carga falla", (r) => r.abort()],
  ];
  for (const [nombre, carga] of CARGAS) await tramo(`A3 (${nombre})`, async () => {
    const id = await abrir(DOS);
    await hastaElRepaso();
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    await page.route(cargaDe(id), carga);
    try {
      await page.waitForTimeout(150);
      await tocarTarjeta(id);
      await page.waitForTimeout(300);
      const v = await vista();
      const filas = await page.$$eval(".dec-fila b", (x) => x.map((y) => y.textContent.trim()));
      pasos[`a3 ${nombre}`] = { repaso: v.repaso, enviar: v.enviar, estado: v.estado, filas };
      debe(v.repaso && /^Deshacer \(\d\)$/.test(v.enviar), `A3 (${nombre}): sale el repaso con su «Deshacer» al momento (repaso ${v.repaso}, botón «${v.enviar}»)`);
      debe(filas.length === 2 && filas.every((x) => x.startsWith("1. Opción 1")), `A3 (${nombre}): con lo que se está mandando (${JSON.stringify(filas)})`);
      await page.waitForTimeout(500);
      await tocarSiSeVe("#enviar-dec");
      await page.waitForTimeout(300);
      const deshecha = await vista();
      await page.waitForTimeout(5200);
      const s = await enServidor(id);
      debe(/No se ha mandado/.test(deshecha.estado), `A3 (${nombre}): «Deshacer» funciona sin el PC («${deshecha.estado}»)`);
      debe(!s.respuesta, `A3 (${nombre}): y al PC no le llega nada (${JSON.stringify(s.respuesta?.elecciones)})`);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  // ── A7: reabrir justo antes de que acabe la cuenta, con una carga lenta que trae lo de antes ──
  await tramo("A7", async () => {
    const id = await abrir(DOS);
    await hastaElRepaso();
    await tocar("#enviar-dec");
    const t0 = Date.now();
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    await page.route(cargaDe(id), async (r) => { const res = await r.fetch(); await pausa(2200); await r.fulfill({ response: res }).catch(() => {}); });
    try {
      await page.waitForTimeout(Math.max(0, 4200 - (Date.now() - t0)));
      await tocarTarjeta(id);
      const malas = [];
      for (let i = 0; i < 28; i++) {
        const m = await page.evaluate(() => ({
          estado: document.getElementById("estado-envio")?.textContent.trim() ?? "",
          sinContestar: document.querySelectorAll(".dec-fila[data-falta]").length,
          cargando: /cargando/.test(document.getElementById("titulo")?.textContent ?? ""),
        }));
        if (/^Falta/.test(m.estado) || m.sinContestar || m.cargando) malas.push(m);
        await page.waitForTimeout(250);
      }
      await hastaQueDiga(/^Enviada/, 6000);
      const fin = await vista();
      const quedo = await dichos();
      pasos.a7 = { malas: malas.length, fin: fin.estado, quedo };
      debe(!malas.length, `A7: ni un momento sale sin contestar o cargando (${JSON.stringify(malas.slice(0, 2))})`);
      debe(/^Enviada\./.test(fin.estado) && /Enviada/.test(fin.titulo), `A7: y acaba en «Enviada» (título «${fin.titulo}», estado «${fin.estado}»)`);
      debe(quedo.length === 2 && quedo.every((x) => x.startsWith("1. Opción 1")), `A7: con lo que se mandó a la vista (${JSON.stringify(quedo)})`);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  // ── A5: un aviso que sale o se va no mueve lo que estás tocando ──
  await tramo("A5 (el aviso se va)", async () => {
    const a = await sembrar([pregunta("A", 2)]);
    const b = await sembrar([pregunta("A", 3), pregunta("B", 3)]);
    await ver(a);
    await tocar(opcion("A", 1));
    await page.waitForTimeout(300);
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(b));
    await page.waitForTimeout(150);
    await tocarTarjeta(b);
    await page.waitForSelector(".pregunta-d:not([hidden])");
    await page.waitForFunction(() => /Enviada/.test(document.getElementById("envios-dec")?.textContent ?? ""), null, { timeout: 12000 });
    await page.waitForTimeout(700);
    const medida = () => page.$eval(opcion("A", 2), (x) => { const r = x.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    const conAviso = await medida();
    const tapa = await page.evaluate(() => document.querySelector("#envios-dec .aviso-dec").getBoundingClientRect().bottom - document.getElementById("dec-paso").getBoundingClientRect().top);
    const x = 195;
    const y = Math.round(conAviso.bottom - 6);
    const bajoElDedo = () => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest(".opcion")?.querySelector("input")?.value ?? null, [x, y]);
    const antes = await bajoElDedo();
    await page.waitForFunction(() => !document.getElementById("envios-dec"), null, { timeout: 9000 });
    const despues = await bajoElDedo();
    const sinAviso = await medida();
    await page.mouse.click(x, y);
    await page.waitForTimeout(150);
    const marcada = await page.evaluate(() => document.querySelector('input[name="q-A"]:checked')?.value ?? null);
    pasos.a5Se = { salto: conAviso.top - sinAviso.top, antes, despues, marcada, tapa };
    debe(conAviso.top === sinAviso.top, `A5: cuando el aviso se va, la opción no se mueve (${conAviso.top - sinAviso.top} px)`);
    debe(antes === "2" && despues === "2" && marcada === "2", `A5: el toque cae en la opción que había bajo el dedo (antes ${antes}, después ${despues}, marcada ${marcada})`);
    debe(tapa <= 0, `A5: el aviso no tapa el principio de la pantalla (${tapa} px)`);
  });
  await tramo("A5 (el aviso sale)", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await tocar(opcion("A", 1));
    await page.waitForTimeout(300);
    await tocar("#enviar-dec");
    await page.waitForTimeout(300);
    await tocar("#atras");
    await page.waitForSelector(tarjetaDe(id));
    await page.waitForTimeout(300);
    const arriba = () => page.$eval("#decisiones", (x) => x.getBoundingClientRect().top);
    const antes = await arriba();
    await page.waitForFunction(() => document.querySelector("#envios-dec .aviso-dec"), null, { timeout: 12000 });
    // El dedo iba a lo de debajo y el aviso acaba de salir: ese toque no abre nada.
    await tocar("#envios-dec .aviso-dec");
    await page.waitForTimeout(200);
    const sigue = Boolean(await page.$("#decisiones"));
    const despues = await arriba().catch(() => null);
    pasos.a5Sale = { antes, despues, sigue };
    debe(antes === despues, `A5: cuando el aviso sale, la lista no se mueve (${antes} frente a ${despues})`);
    debe(sigue, "A5: un aviso recién salido no atiende el toque que iba a otra cosa");
  });

  // ── A6: el botón que acaba de cambiar de significado no atiende el toque que iba al de antes ──
  await tramo("A6", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await tocar(opcion("A", 1));
    await page.waitForTimeout(300);
    await page.route("**/api/decision/responder", (r) => r.abort());
    await page.route(cargaDe(id), (r) => r.abort());
    try {
      const p = await punto("#enviar-dec");
      await page.mouse.click(p.x, p.y);
      await page.waitForFunction(() => /Enviar respuesta/.test(document.getElementById("enviar-dec")?.textContent ?? ""), null, { timeout: 9000 });
      // El dedo iba a «Deshacer (1)» y cae justo cuando el envío acaba de fallar.
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(150);
      const trasFallo = await vista();
      debe(trasFallo.enviar === "Enviar respuesta", `A6: el toque que iba a «Deshacer» no arranca otro envío (botón «${trasFallo.enviar}»)`);
      debe(/No se sabe/.test(trasFallo.estado), `A6: y se sigue diciendo cómo acabó («${trasFallo.estado}»)`);
      // Pasado el momento atiende, y deshacer con dos toques seguidos tampoco vuelve a enviar.
      await enviarEncendido();
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(900);
      const contando = await vista();
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(90);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(150);
      const trasDeshacer = await vista();
      pasos.a6 = { trasFallo: trasFallo.enviar, contando: contando.enviar, trasDeshacer: trasDeshacer.enviar };
      debe(/^Deshacer/.test(contando.enviar), `A6: pasado el momento, el botón vuelve a atender (botón «${contando.enviar}»)`);
      debe(trasDeshacer.enviar === "Enviar respuesta" && /No se ha mandado/.test(trasDeshacer.estado), `A6: dos toques seguidos en «Deshacer» no vuelven a enviar (botón «${trasDeshacer.enviar}», estado «${trasDeshacer.estado}»)`);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  // ── A8: el segundo intento solo cambia la opción, y llegó el primero ──
  await tramo("A8 (solo cambia la opción)", async () => {
    const id = await abrir([pregunta("A", 3)]);
    await tocar(opcion("A", 1));
    await page.waitForTimeout(300);
    await post("/api/sembrar-responder", { pierde: true });
    let cortar = true;
    await page.route(SONDEO, (r) => (cortar ? r.abort() : r.continue()));
    try {
      await tocar("#enviar-dec");
      await hastaQueDiga(/No se sabe/, 12000);
      await page.waitForTimeout(900);
      await tocar(opcion("A", 3));
      await page.waitForTimeout(300);
      await enviarEncendido();
      await tocar("#enviar-dec");
      await page.waitForTimeout(400);
      cortar = false;
      await page.waitForSelector(".dec-hecha", { timeout: 12000 });
      await page.waitForTimeout(300);
      const v = await vista();
      const b = await borrador(id);
      const s = await enServidor(id);
      await ver(id);
      const luego = await vista();
      pasos.a8Opcion = { estado: v.estado, mio: v.mio, borrador: b, pc: s.respuesta?.elecciones ?? null, luego: luego.mio };
      debe(s.respuesta?.elecciones?.A?.opcion === 1, `A8: al PC le llegó el primer intento (${JSON.stringify(s.respuesta?.elecciones)})`);
      debe(/anterior/.test(v.estado), `A8: y se dice que llegó el anterior («${v.estado}»)`);
      debe(/Opción 3 de A/.test(v.mio), `A8: la opción que no se mandó sigue a la vista («${v.mio}»)`);
      debe(/Opción 3 de A/.test(luego.mio), `A8: también al volver a abrirla («${luego.mio}»)`);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

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
