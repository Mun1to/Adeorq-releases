// Carreras en una decisión del móvil: lo que aparece al pasar de pantalla no
// puede caer debajo del dedo. La revisión aparte del 2026-11-18 lo reprodujo
// con clics en coordenadas fijas: tocar una opción pasa sola a la pantalla
// siguiente a los 420 ms, y el toque que venía detrás (un doble toque, o ir a
// «Atrás» o a «Repasar» sin esperar) caía en lo que acababa de salir en ese
// mismo sitio. Descartaba la decisión sin vuelta atrás (A1, A2), la enviaba sin
// ver el repaso (A3), contestaba una pregunta sin haberla visto (M1) o se
// llevaba el cuadro en el que se estaba escribiendo (M2).
//
// Aquí los toques son de ratón, en puntos medidos ANTES y a milisegundos fijos
// del primero: no esperan a nada, como el dedo. Debajo, lo que salió de la
// misma revisión: descartar a dos toques, quitar una elección (M3), cambiar
// durante la cuenta atrás (M4) y decir dónde cae la respuesta (M5).
//
//   node scripts/laboratorio/bancos-movil.mjs carreras
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const cab = { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${B}/`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);

  const pregunta = (id, n) => ({ id, titulo: `La pregunta ${id}`, opciones: Array.from({ length: n }, (_, i) => ({ texto: `Opción ${i + 1} de ${id}` })) });
  const DOS = [pregunta("A", 2), pregunta("B", 2)];
  let serie = 0;
  const sembrar = async (preguntas, panel = 1) => {
    const id = `dca77e7a${String(++serie).padStart(3, "0")}`;
    await fetch(`${B}/api/sembrar-decision`, { method: "POST", headers: cab, body: JSON.stringify({ id, titulo: `Carrera ${serie}`, proyecto: "Adeorq", panel, preguntas }) });
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
  const aLaVista = () => page.evaluate(() => {
    const visto = (x) => Boolean(x?.offsetParent);
    return {
      preguntas: [...document.querySelectorAll(".pregunta-d")].filter(visto).map((f) => f.dataset.q).join(""),
      repaso: visto(document.getElementById("dec-repaso")),
      enviar: document.getElementById("enviar-dec")?.textContent.trim() ?? "",
      enviarApagado: document.getElementById("enviar-dec")?.disabled ?? null,
      estado: document.getElementById("estado-envio")?.textContent.trim() ?? "",
      foco: document.activeElement?.className || document.activeElement?.tagName,
      aviso: [...document.querySelectorAll(".dec-vig")].filter(visto).map((x) => x.textContent.trim().slice(0, 40)).join(" | "),
      nota: [...document.querySelectorAll(".dec-nota")].filter(visto).map((x) => x.textContent.trim()).join(" | "),
    };
  });
  /** El centro de algo (o `fx` de su ancho), como punto fijo; `null` si no se ve. */
  const punto = async (sel, fx = 0.5) => {
    const el = await page.$(sel);
    const c = el && await el.boundingBox();
    return c ? { x: Math.round(c.x + c.width * fx), y: Math.round(c.y + c.height / 2) } : null;
  };
  const opcion = (q, n) => `.pregunta-d[data-q="${q}"] .opcion:nth-of-type(${n})`;
  const tocar = (p) => page.mouse.click(p.x, p.y);
  /** Toques en puntos fijos, cada uno a sus milisegundos del primero. */
  const toques = async (lista) => {
    const t0 = Date.now();
    for (const [ms, p] of lista) {
      const falta = ms - (Date.now() - t0);
      if (falta > 0) await page.waitForTimeout(falta);
      await tocar(p);
    }
  };
  /** Contesta A con su opción 1 y espera a que B se pueda tocar. */
  const hastaB = async () => { await tocar(await punto(opcion("A", 1))); await page.waitForTimeout(1300); };
  /** Un tramo que revienta (falta un botón, no llega una pantalla) es un fallo suyo y no tumba los demás. */
  const tramo = async (nombre, fn) => {
    try { await fn(); } catch (err) { fallos.push(`${nombre}: no se pudo recorrer (${String(err.message || err).split("\n")[0].slice(0, 160)})`); }
  };

  // ── A1: «Atrás» tras elegir en la última pregunta ──
  pasos.a1 = [];
  for (const ms of [480, 700]) await tramo(`A1 (${ms} ms)`, async () => {
    const id = await abrir(DOS);
    await hastaB();
    const atras = await punto("#paso-atras");
    await toques([[0, await punto(opcion("B", 1))], [ms, atras]]);
    await page.waitForTimeout(700);
    const s = await enServidor(id);
    const b = await borrador(id);
    pasos.a1.push({ ms, atras, vigencia: s.vigencia, borrador: b });
    debe(s.vigencia !== "descartada", `A1: tocar «Atrás» a los ${ms} ms de elegir en la última pregunta no descarta la decisión (quedó «${s.vigencia}»)`);
    debe(b?.A?.opcion === 1 && b?.B?.opcion === 1, `A1 (${ms} ms): lo elegido sigue guardado (${JSON.stringify(b)})`);
  });

  // ── A2: repetir el toque en el mismo punto, con menos opciones en la siguiente ──
  pasos.a2 = [];
  for (const [na, nb] of [[4, 2], [5, 3], [6, 4]]) await tramo(`A2 (${na} y ${nb} opciones)`, async () => {
    const id = await abrir([pregunta("A", na), pregunta("B", nb)]);
    const p = await punto(opcion("A", na), 0.25);
    await toques([[0, p], [560, p]]);
    await page.waitForTimeout(700);
    const s = await enServidor(id);
    pasos.a2.push({ opciones: `${na}/${nb}`, p, vigencia: s.vigencia });
    debe(s.vigencia !== "descartada", `A2 (${na} y ${nb} opciones): repetir el toque a los 560 ms no descarta la decisión (quedó «${s.vigencia}»)`);
  });

  // ── A3: «Repasar» sin esperar no envía ──
  pasos.a3 = [];
  const sinEnviar = (v) => v.enviar === "Enviar respuesta" && !/Se manda/.test(v.estado);
  for (const ms of [480, 700]) await tramo(`A3 (${ms} ms)`, async () => {
    await abrir(DOS);
    await hastaB();
    const sig = await punto("#paso-sig");
    await toques([[0, await punto(opcion("B", 2))], [ms, sig]]);
    await page.waitForTimeout(300);
    const v = await aLaVista();
    pasos.a3.push({ ms, sig, ...v });
    debe(v.repaso && sinEnviar(v), `A3: tocar «Repasar» a los ${ms} ms de elegir en la última pregunta no empieza a enviar (botón «${v.enviar}», estado «${v.estado}»)`);
  });
  await tramo("A3 (doble toque en «Repasar»)", async () => {
    // Con todo contestado, se vuelve a B desde el repaso y se da doble toque en «Repasar».
    await abrir(DOS);
    await hastaB();
    await tocar(await punto(opcion("B", 1)));
    await page.waitForTimeout(1500);
    await tocar(await punto('.dec-fila[data-i="1"]'));
    await page.waitForTimeout(1300);
    const sig = await punto("#paso-sig");
    await toques([[0, sig], [120, sig]]);
    await page.waitForTimeout(300);
    const v = await aLaVista();
    debe(v.repaso && sinEnviar(v), `A3: un doble toque en «Repasar» (120 ms) no empieza a enviar (botón «${v.enviar}», estado «${v.estado}»)`);
    // Y visto el repaso, «Enviar» sí envía: no se queda muerto.
    await page.waitForTimeout(1300);
    await tocar(sig);
    await page.waitForTimeout(250);
    const luego = await aLaVista();
    pasos.a3.push({ dobleToque: v, luego });
    debe(/^Deshacer/.test(luego.enviar), `con el repaso a la vista un momento, «Enviar respuesta» empieza la cuenta (botón «${luego.enviar}»)`);
    await page.waitForTimeout(900);
    await tocar(sig);
  });
  await tramo("A3 (con el repaso recién salido)", async () => {
    // El repaso sale a los 420 ms del toque, y el segundo cae 750 ms después:
    // la pantalla ya atiende toques (500) y «Enviar» aún no (1000). Sin este
    // caso, quitar solo la espera de «Enviar» no ponía nada en rojo.
    await abrir(DOS);
    await hastaB();
    const sig = await punto("#paso-sig");
    await toques([[0, await punto(opcion("B", 1))], [420 + 750, sig]]);
    await page.waitForTimeout(300);
    const v = await aLaVista();
    pasos.a3.push({ recienSalido: v });
    debe(v.repaso && sinEnviar(v), `A3: tocar donde está «Enviar» a los 750 ms de salir el repaso no empieza a enviar (botón «${v.enviar}», estado «${v.estado}»)`);
  });

  // ── M1: doble toque lento, no contesta la pregunta que no se ha visto ──
  pasos.m1 = [];
  for (const ms of [450, 600, 800]) await tramo(`M1 (${ms} ms)`, async () => {
    const id = await abrir([pregunta("A", 3), pregunta("B", 3), pregunta("C", 3)]);
    const p = await punto(opcion("A", 2));
    await toques([[0, p], [ms, p]]);
    await page.waitForTimeout(900);
    const v = await aLaVista();
    const b = await borrador(id);
    pasos.m1.push({ ms, aLaVista: v.preguntas, borrador: b });
    debe(v.preguntas === "B" && !b?.B?.opcion, `M1: un doble toque de ${ms} ms deja la pregunta B a la vista y sin contestar (se ve «${v.preguntas}», B = ${JSON.stringify(b?.B)})`);
  });

  // ── M2: de una opción a «Otra cosa», el avance no se lleva el cuadro ──
  await tramo("M2", async () => {
    const id = await abrir(DOS);
    const TEXTO = "quiero más contexto";
    await toques([[0, await punto(opcion("A", 1))], [150, await punto('.pregunta-d[data-q="A"] .libre')]]);
    await page.keyboard.type(TEXTO, { delay: 45 });
    await page.waitForTimeout(400);
    const v = await aLaVista();
    const b = await borrador(id);
    pasos.m2 = { aLaVista: v.preguntas, foco: v.foco, guardado: b?.A?.texto };
    debe(v.preguntas === "A", `M2: al pasar de una opción a «Otra cosa» se sigue en la pregunta A (se ve «${v.preguntas}»)`);
    debe(b?.A?.texto === TEXTO, `M2: lo escrito se guarda entero («${b?.A?.texto}»)`);
    debe(/libre/.test(String(v.foco)), `M2: el cuadro conserva el foco (lo tiene «${v.foco}»)`);
  });

  // ── Descartar va a dos toques, y un doble toque no cuenta como dos ──
  await tramo("Descartar", async () => {
    // Recién salida, la pantalla ya atiende toques (500 ms) y «Descartar» aún no (1000).
    const pronto = await sembrar([pregunta("A", 2)]);
    await page.goto(`${B}/?c=${++serie}#decision=${pronto}`);
    await page.waitForSelector(".pregunta-d", { state: "attached" });
    await page.waitForTimeout(600);
    await tocar(await punto("#descartar-aqui"));
    await page.waitForTimeout(150);
    const sinArmar = (await page.textContent("#descartar-aqui")).trim();
    debe(sinArmar === "Descartar esta decisión", `a los 600 ms de salir la pantalla, «Descartar» aún no atiende («${sinArmar}»)`);
    const id = await abrir([pregunta("A", 2)]);
    await page.waitForTimeout(300);
    const d = await punto("#descartar-aqui");
    debe(Boolean(d), "con una sola pregunta, «Descartar esta decisión» va debajo de ella y no en el pie");
    if (d) {
      await toques([[0, d], [120, d]]);
      await page.waitForTimeout(400);
      const rotulo = (await page.textContent("#descartar-aqui")).trim();
      const s = await enServidor(id);
      debe(s.vigencia !== "descartada", `un doble toque en «Descartar» no descarta (quedó «${s.vigencia}»)`);
      debe(/otra vez/i.test(rotulo), `tras el primer toque el botón pide otro («${rotulo}»)`);
      await page.waitForTimeout(500);
      await tocar(d);
      await page.waitForTimeout(700);
      const fin = await enServidor(id);
      pasos.descartar = { rotulo, antes: s.vigencia, despues: fin.vigencia };
      debe(fin.vigencia === "descartada", `el segundo toque, ya leído, la descarta (quedó «${fin.vigencia}»)`);
    }
  });

  // ── Tres toques en el mismo punto, donde «Descartar» cae sobre una opción ──
  // El primero elige, y los otros dos (a 950 y 1850 ms) armaban y descartaban:
  // «Descartar» no atiende hasta llevar un momento a la vista, como «Enviar».
  pasos.tresToques = [];
  for (const [na, nb] of [[3, 1], [4, 1], [4, 2], [5, 2], [5, 3], [6, 3], [6, 4]]) await tramo(`tres toques (${na} y ${nb} opciones)`, async () => {
    const forma = [pregunta("A", na), pregunta("B", nb)];
    // Dónde queda «Descartar» en la segunda pregunta, y si en la primera hay una opción ahí.
    await abrir(forma);
    await hastaB();
    const d = await punto("#descartar-aqui");
    await tocar(await punto("#paso-atras"));
    await page.waitForTimeout(900);
    const sobre = d ? await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest(".opcion")), [d.x, d.y]) : false;
    if (!sobre) return;
    const id = await abrir(forma);
    await toques([[0, d], [950, d], [1850, d]]);
    await page.waitForTimeout(700);
    const s = await enServidor(id);
    pasos.tresToques.push({ opciones: `${na}/${nb}`, d, vigencia: s.vigencia });
    debe(s.vigencia !== "descartada", `tres toques en el mismo punto (0, 950 y 1850 ms) con ${na} y ${nb} opciones no descartan la decisión (quedó «${s.vigencia}»)`);
  });
  debe(pasos.tresToques.length >= 3, `se probaron al menos tres repartos en los que «Descartar» cae sobre una opción (${pasos.tresToques.length})`);

  // ── M3: una opción tocada por error se puede quitar ──
  await tramo("M3", async () => {
    const id = await abrir([pregunta("A", 3)]);
    debe(!(await page.isVisible("#quitar-eleccion").catch(() => false)), "sin nada elegido no hay «Quitar mi elección»");
    await tocar(await punto(opcion("A", 2)));
    await page.waitForTimeout(300);
    const q = await punto("#quitar-eleccion");
    debe(Boolean(q) && await page.isVisible("#quitar-eleccion"), "con una opción marcada sale «Quitar mi elección»");
    if (q) {
      await tocar(q);
      await page.waitForTimeout(300);
      const marcadas = await page.locator(".pregunta-d input:checked").count();
      const b = await borrador(id);
      const v = await aLaVista();
      pasos.m3 = { marcadas, borrador: b, enviarApagado: v.enviarApagado };
      debe(marcadas === 0 && !b?.A?.opcion, `M3: al quitarla no queda ninguna marcada ni guardada (${marcadas}, ${JSON.stringify(b)})`);
      debe(v.enviarApagado === true, "M3: y sin nada elegido no se puede enviar");
    }
  });

  // ── M4: cambiar de opción durante la cuenta atrás no envía lo de antes ──
  await tramo("M4", async () => {
    const id = await abrir([pregunta("A", 2)]);
    await tocar(await punto(opcion("A", 1)));
    await page.waitForTimeout(300);
    await tocar(await punto("#enviar-dec"));
    await page.waitForTimeout(1000);
    const contando = await aLaVista();
    await tocar(await punto(opcion("A", 2)));
    await page.waitForTimeout(300);
    const v = await aLaVista();
    await page.waitForTimeout(5300);
    const s = await enServidor(id);
    pasos.m4 = { contando: contando.enviar, despues: v.enviar, estado: v.estado, vigencia: s.vigencia, respuesta: s.respuesta?.elecciones };
    debe(/^Deshacer/.test(contando.enviar), `M4: la cuenta atrás había empezado (botón «${contando.enviar}»)`);
    debe(v.enviar === "Enviar respuesta" && /No se ha mandado/.test(v.estado), `M4: cambiar de opción durante la cuenta la para y lo dice (botón «${v.enviar}», estado «${v.estado}»)`);
    debe(s.vigencia !== "contestada", `M4: y no se manda lo que ya no se ve (quedó «${s.vigencia}», ${JSON.stringify(s.respuesta?.elecciones)})`);
  });

  // ── M5: dónde cae la respuesta, sin prometer un tecleo que no habrá ──
  await tramo("M5", async () => {
    // Viva y con una sola pregunta: también se dice, y aquí sí se teclea.
    await abrir([pregunta("A", 2)]);
    const viva = await aLaVista();
    debe(/se teclea en el panel 1/.test(viva.nota), `M5: con una sola pregunta también se dice dónde cae la respuesta («${viva.nota}»)`);
    // De un panel que ya no está (o de otro arranque): se entra por el repaso
    // con el borrador entero, y el aviso tiene que seguir a la vista.
    const id = await abrir(DOS, 99);
    await hastaB();
    await tocar(await punto(opcion("B", 1)));
    await page.waitForTimeout(1000);
    await ver(id);
    const huerfana = await aLaVista();
    debe(huerfana.repaso, "M5: con el borrador entero se entra por el repaso");
    debe(/nadie/.test(huerfana.aviso), `M5: en el repaso sigue el aviso de que ya no la espera nadie («${huerfana.aviso}»)`);
    debe(/no se teclea/.test(huerfana.nota) && !/se teclea en el panel/.test(huerfana.nota), `M5: y no se promete teclearla («${huerfana.nota}»)`);
    // Hablada: le escribiste al panel después de que preguntara. Deja de
    // esperarte, pero es del mismo arranque y su terminal sigue abierta, así que
    // el PC la teclea igual: lo que se promete es lo que él dice (`se_teclea`).
    // Va la última, que escribirle al panel 1 da por habladas todas las suyas.
    const hablada = await sembrar([pregunta("A", 2)]);
    const { arranque } = await (await fetch(`${B}/api/terminales`, { headers: cab })).json();
    const escrito = await fetch(`${B}/api/terminal/escribir`, { method: "POST", headers: cab, body: JSON.stringify({ panel: 1, arranque, texto: "sigue con lo otro" }) });
    await ver(hablada);
    const h = await aLaVista();
    const vig = (await enServidor(hablada)).vigencia;
    pasos.m5 = { viva: viva.nota, huerfana, escrito: escrito.status, hablada: { vigencia: vig, aviso: h.aviso, nota: h.nota } };
    debe(vig === "hablada", `M5: escribirle al panel deja la decisión hablada (quedó «${vig}», el doble contestó ${escrito.status})`);
    debe(/se teclea en el panel 1/.test(h.nota) && /hablaste/.test(h.aviso), `M5: una hablada con su terminal abierta avisa de que la hablaste y dice que se teclea, que es lo que hará el PC («${h.aviso}», «${h.nota}»)`);
  });
  return { pasos, fallos };
}
