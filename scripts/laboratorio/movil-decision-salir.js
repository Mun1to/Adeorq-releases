// Lo que le pasa a una respuesta del móvil cuando la página se va o el PC contesta
// a medias. Sale de la revisión aparte del 2026-11-19: lo escrito mientras se manda
// se perdía sin aviso (M1), recargar en plena cuenta atrás perdía el envío (M2), y
// varios mensajes decían algo que no se sabía (B1 a B7).
//
//   node scripts/laboratorio/bancos-movil.mjs decision-salir
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

  const UNA = [{ id: "A", titulo: "La pregunta A", opciones: [{ texto: "Opción 1 de A" }, { texto: "Opción 2 de A" }, { texto: "Opción 3 de A" }] }];
  let serie = 0;
  const post = (ruta, cuerpo) => fetch(`${B}${ruta}`, { method: "POST", headers: cab, body: JSON.stringify(cuerpo) });
  const enPc = async (id) => (await fetch(`${B}/api/decision?id=${id}`, { headers: cab })).json();
  const sembrar = async () => {
    const id = `dca11da0${String(++serie).padStart(3, "0")}`;
    await post("/api/sembrar-decision", { id, titulo: `Salida ${serie}`, proyecto: "Adeorq", panel: 1, preguntas: UNA });
    return id;
  };
  const ver = async (id) => {
    await page.goto(`${B}/?s=${++serie}#decision=${id}`);
    await page.waitForSelector(".pregunta-d", { state: "attached" });
    await page.waitForTimeout(1100);
  };
  const elegir = (n) => page.click(`.pregunta-d[data-q="A"] .opcion:nth-of-type(${n})`);
  const enviar = async () => {
    await page.waitForFunction(() => !document.getElementById("enviar-dec")?.disabled);
    await page.click("#enviar-dec");
  };
  const estado = () => page.$eval("#estado-envio", (x) => x.textContent.trim()).catch(() => "");
  const dice = (re, timeout = 15000) => page.waitForFunction((f) => new RegExp(f).test(document.getElementById("estado-envio")?.textContent ?? ""), re.source, { timeout }).then(() => true, () => false);
  const aviso = () => page.$$eval("#envios-dec .aviso-dec b", (x) => x.map((y) => y.textContent.trim())).catch(() => []);
  const SOLO = (parte) => (u) => u.pathname + u.search === parte || (u.pathname + u.search).startsWith(parte);
  const tramo = async (nombre, fn) => {
    try { await fn(); } catch (err) { fallos.push(`${nombre}: reventó (${String(err.message).split("\n")[0]})`); }
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  };

  // ── M1: mientras se manda, el cuadro no admite cambios ──
  await tramo("M1", async () => {
    const id = await sembrar();
    await ver(id);
    await page.fill(".libre", "lo que quiero mandar");
    await post("/api/sembrar-responder", { espera: 6000 });
    await enviar();
    await page.waitForFunction(() => /Mandando/.test(document.getElementById("enviar-dec")?.textContent ?? ""), null, { timeout: 8000 });
    await page.evaluate(() => document.querySelector(".libre").focus());
    await page.keyboard.type(" y esto no llega");
    const visto = await page.inputValue(".libre");
    const capas = await page.evaluate(() => ({ cuerpo: document.getElementById("decision").inert, pregunta: document.querySelector(".pregunta-d").inert }));
    pasos.m1 = { visto, capas };
    debe(visto === "lo que quiero mandar", `M1: mientras se manda el cuadro no cambia («${visto}»)`);
    debe(capas.pregunta === true && capas.cuerpo === false, "M1: se bloquea lo de dentro y el cuerpo se sigue pudiendo desplazar");
    debe(await dice(/Enviada/), `M1: acaba enviada («${await estado()}»)`);
    debe((await enPc(id)).respuesta?.elecciones?.A?.texto === "lo que quiero mandar", "M1: al PC le llega lo que se veía");
  });

  // ── M2: recargar en plena cuenta atrás no pierde el envío ──
  await tramo("M2", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(2);
    await enviar();
    await page.waitForTimeout(1200);
    await page.reload();
    await page.waitForTimeout(1500);
    const pc = await enPc(id);
    await ver(id);
    pasos.m2 = { respuesta: pc.respuesta?.elecciones ?? null, estado: await estado() };
    debe(pc.respuesta?.elecciones?.A?.opcion === 2, "M2: la respuesta sale al irse de la página");
    debe(await dice(/Enviada/, 8000), `M2: al volver dice que se envió («${await estado()}»)`);
  });

  // ── M2b: y si al irse no pudo salir, al volver se dice ──
  await tramo("M2b", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(3);
    // El PC recibe el envío y no lo apunta: una ruta de Playwright no ve lo que sale al cerrar la página.
    await post("/api/sembrar-responder", { cuelga: true });
    await enviar();
    await page.waitForTimeout(1000);
    await page.reload();
    await page.waitForTimeout(800);
    await ver(id);
    debe(await dice(/No se sabe si ha llegado/, 8000), `M2b: al volver dice que no se sabe («${await estado()}»)`);
    debe(!(await enPc(id)).respuesta, "M2b: de verdad no llegó");
    debe(await page.isChecked('.pregunta-d[data-q="A"] .opcion:nth-of-type(3) input'), "M2b: lo elegido sigue marcado");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await enviar();
    debe(await dice(/Enviada/), `M2b: se puede volver a enviar («${await estado()}»)`);
    debe((await enPc(id)).respuesta?.elecciones?.A?.opcion === 3, "M2b: y llega");
  });

  // ── B1: descartada tras un envío sin saber, el pie dice que está descartada ──
  await tramo("B1", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await page.route(SOLO("/api/decision/responder"), (r) => r.abort());
    await enviar();
    debe(await dice(/No se sabe si ha llegado/), "B1: primero no se sabe");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.click("#descartar-aqui");
    await page.waitForTimeout(1000);
    await page.click("#descartar-aqui");
    await page.waitForSelector('.dec-vig[data-v="descartada"]', { timeout: 8000 });
    const dicho = await estado();
    pasos.b1 = dicho;
    debe(/Descartada/.test(dicho) && !/volver a enviarla|No se sabe/.test(dicho), `B1: el pie dice que está descartada («${dicho}»)`);
  });

  // ── B2: con un descarte en el aire no se puede enviar ──
  await tramo("B2", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await page.waitForTimeout(600);
    const caja = await page.locator('.pregunta-d[data-q="A"] .opcion:nth-of-type(2)').boundingBox();
    await page.route(SOLO("/api/decision/descartar"), async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue().catch(() => {}); });
    await page.click("#descartar-aqui");
    await page.waitForTimeout(1000);
    await page.click("#descartar-aqui");
    await page.waitForTimeout(200);
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.waitForTimeout(700);
    pasos.b2 = await page.$eval("#enviar-dec", (x) => x.disabled);
    debe(pasos.b2 === true, "B2: «Enviar» sigue apagado mientras se descarta");
    await page.waitForSelector('.dec-vig[data-v="descartada"]', { timeout: 8000 });
    debe(!(await enPc(id)).respuesta, "B2: no se manda ninguna respuesta");
  });

  // ── B3: sin red, la tarjeta deja de decir «Mandando…» al acabar el envío ──
  await tramo("B3", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await enviar();
    await page.waitForTimeout(400);
    await page.route((u) => u.pathname.startsWith("/api/decision"), (r) => r.abort());
    await page.click("#atras");
    await page.waitForSelector(`.tarjeta[data-id="${id}"]`, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => /No se sabe/.test(document.getElementById("envios-dec")?.textContent ?? ""), null, { timeout: 15000 });
    const tarjeta = await page.$eval(`.tarjeta[data-id="${id}"] .estado`, (x) => x.textContent.trim()).catch(() => "");
    pasos.b3 = tarjeta;
    debe(!/Mandando|Se manda/.test(tarjeta), `B3: la tarjeta ya no dice que se está mandando («${tarjeta}»)`);
  });

  // ── B4: el aviso se pone al día cuando la lista ya la enseña contestada ──
  await tramo("B4", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(2);
    await post("/api/sembrar-responder", { pierde: true });
    await page.route(SOLO(`/api/decision?id=${id}`), (r) => r.abort());
    await enviar();
    await page.waitForTimeout(300);
    await page.click("#atras");
    await page.waitForFunction(() => /No se sabe/.test(document.getElementById("envios-dec")?.textContent ?? ""), null, { timeout: 15000 });
    await page.unrouteAll({ behavior: "ignoreErrors" });
    const alDia = await page.waitForFunction(() => !/No se sabe/.test(document.getElementById("envios-dec")?.textContent ?? ""), null, { timeout: 15000 }).then(() => true, () => false);
    pasos.b4 = await aviso();
    debe(alDia, `B4: el aviso deja de decir que no se sabe («${pasos.b4}»)`);
  });

  // ── B5: un 200 con la contestación cortada no afirma dónde cayó ──
  await tramo("B5", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await page.route(SOLO("/api/decision/responder"), async (r) => {
      const real = await r.fetch();
      await real.body().catch(() => {});
      await r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":tr' });
    });
    await enviar();
    debe(await dice(/Enviada/), "B5: acaba enviada");
    pasos.b5 = await estado();
    debe(/tecleado en el panel 1/.test(pasos.b5), `B5: dice lo que de verdad pasó («${pasos.b5}»)`);
  });

  // ── B6: un 504 de la pasarela no afirma que no se mandó ──
  await tramo("B6", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await page.route(SOLO("/api/decision/responder"), (r) => r.fulfill({ status: 504, contentType: "application/json", body: "{}" }));
    await enviar();
    await dice(/No se/);
    pasos.b6 = await estado();
    debe(/No se sabe si ha llegado/.test(pasos.b6), `B6: dice que no se sabe («${pasos.b6}»)`);
  });

  // ── B8: si el PC aún no ha acabado de teclearla, no se afirma dónde cayó ──
  await tramo("B8", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await page.route(SOLO("/api/decision/responder"), async (r) => {
      const real = await r.fetch();
      await real.body().catch(() => {});
      await r.abort();
    });
    await page.route(SOLO(`/api/decision?id=${id}`), async (r) => {
      const real = await r.fetch();
      const v = await real.json();
      if (v.respuesta) v.respuesta.entregada = false;
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...v, se_teclea: true }) });
    });
    await enviar();
    debe(await dice(/Enviada/), "B8: acaba enviada");
    pasos.b8 = await estado();
    debe(pasos.b8 === "Enviada.", `B8: no dice que el agente la leerá después («${pasos.b8}»)`);
  });

  // ── B9: un descarte que falla se dice, aunque antes no se supiera cómo acabó el envío ──
  await tramo("B9", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await page.route(SOLO("/api/decision/responder"), (r) => r.abort());
    await enviar();
    debe(await dice(/No se sabe si ha llegado/), "B9: primero no se sabe");
    await page.route(SOLO("/api/decision/descartar"), (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"fallo de prueba"}' }));
    await page.click("#descartar-aqui");
    await page.waitForTimeout(1000);
    await page.click("#descartar-aqui");
    debe(await dice(/No se ha descartado/, 8000), `B9: dice que no se descartó («${await estado()}»)`);
    debe(await page.$eval(".pregunta-d", (x) => !x.inert), "B9: el formulario vuelve a atender");
  });

  // ── B10: las marcas de envíos que ya no hacen falta se limpian solas ──
  await tramo("B10", async () => {
    const vieja = "adeorq-movil-salida:dca11da0fff";
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ el: { A: { opcion: 1 } }, cuando: Date.now() })), vieja);
    await page.goto(`${B}/?s=${++serie}`);
    const limpia = await page.waitForFunction((k) => localStorage.getItem(k) === null, vieja, { timeout: 8000 }).then(() => true, () => false);
    debe(limpia, "B10: la marca de una decisión que ya no existe se borra");
    // Una lista que llega cortada no dice que no exista ninguna.
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ el: { A: { opcion: 1 } }, cuando: Date.now() })), vieja);
    await page.route(SOLO("/api/decisiones"), (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"decisiones":[{"id' }));
    await page.goto(`${B}/?s=${++serie}`);
    await page.waitForTimeout(2500);
    debe(await page.evaluate((k) => localStorage.getItem(k) !== null, vieja), "B10: con la lista cortada la marca se conserva");
    await page.evaluate((k) => localStorage.removeItem(k), vieja);
  });

  // ── B11: el 409 de un descarte tras un envío sin confirmar no lo llama «de otro sitio» ──
  await tramo("B11", async () => {
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await post("/api/sembrar-responder", { pierde: true });
    await page.route(SOLO(`/api/decision?id=${id}`), (r) => r.abort());
    await enviar();
    debe(await dice(/No se sabe si ha llegado/), "B11: primero no se sabe");
    await page.click("#descartar-aqui");
    await page.waitForTimeout(1000);
    await page.click("#descartar-aqui");
    await page.waitForTimeout(1500);
    pasos.b11 = await estado();
    debe(!/otro sitio/.test(pasos.b11), `B11: no dice que la contestaron desde otro sitio («${pasos.b11}»)`);
  });

  // ── B7: «Abrir», en el aviso y en claro, se lee ──
  await tramo("B7", async () => {
    await page.evaluate(() => localStorage.setItem("adeorq-movil-ajustes", JSON.stringify({ tema: "claro" })));
    const id = await sembrar();
    await ver(id);
    await elegir(1);
    await page.route(SOLO("/api/decision/responder"), (r) => r.abort());
    await enviar();
    await page.waitForTimeout(300);
    await page.click("#atras");
    await page.waitForSelector("#envios-dec .aviso-dec em", { timeout: 15000 });
    pasos.b7 = await page.evaluate(() => {
      const el = document.querySelector("#envios-dec .aviso-dec em");
      const rgba = (t) => { const n = t.match(/-?\d*\.?\d+(?:e-?\d+)?/g).map(Number); const k = t.startsWith("color(") ? 255 : 1; return [n[0] * k, n[1] * k, n[2] * k, n[3] ?? 1]; };
      const capas = [];
      for (let x = el; x; x = x.parentElement) {
        const f = rgba(getComputedStyle(x).backgroundColor);
        if (f[3] > 0) capas.push(f);
        if (f[3] >= 1) break;
      }
      let fondo = [0xe8, 0xee, 0xf8];
      for (const [r, g, b, a] of capas.reverse()) fondo = [r, g, b].map((v, i) => fondo[i] * (1 - a) + v * a);
      const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const [a, b] = [lum(rgba(getComputedStyle(el).color)), lum(fondo)];
      return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    });
    debe(pasos.b7 >= 4.5, `B7: «Abrir» da 4,5:1 o más en claro (${pasos.b7})`);
    await page.evaluate(() => localStorage.removeItem("adeorq-movil-ajustes"));
  });

  return { veredicto: fallos.length ? "MAL" : "BIEN", pasos, fallos };
}
