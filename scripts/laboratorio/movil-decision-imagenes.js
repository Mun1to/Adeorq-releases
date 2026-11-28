// Las imágenes de las decisiones en la página del móvil, a 390 px, contra el
// doble recién arrancado (`node scripts/laboratorio/doble-movil.mjs [puerto]`).
// Munir, 2026-11-19, desde el móvil y con la captura de una decisión de diseño
// cuyas fotos solo estaban en una página del PC: «Tiene que haber una manera la
// cual se puedan ver las imagenes de las decisiones».
//
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-decision-imagenes.js
//
// Va contra el 4390 como los demás (`bancos-movil.mjs` lo lanza con ellos); con
// `DOBLE_PUERTO=<n>` contra otro, y con `FOTOS=<carpeta>` deja una foto de cada
// parada en oscuro y en claro.
//
// Lo que fija:
//   · La imagen de la pregunta y la de cada opción salen a todo el ancho, con su
//     sitio guardado: las imágenes llegan 3 s tarde y nada se mueve al llegar.
//   · Se piden por el id de la decisión y su número, con la clave.
//   · Tocar la imagen la abre en grande y NO elige la opción (ni pasa de
//     pregunta por debajo); un toque la pone a su tamaño; el Atrás del teléfono
//     la cierra sin salir de la decisión, y también su flecha y Escape.
//   · Tocar el texto de la opción sigue eligiendo y pasando a la siguiente.
//   · Una imagen que ya no está lo dice en su hueco, sin mover nada.
//   · Contestada, se ve la imagen de lo que se eligió.
//
// Devuelve { fallos, r }: `fallos` vacío es que todo está en su sitio.
async (page) => {
  const ENV = typeof process !== "undefined" ? process.env : {};
  const B = `http://127.0.0.1:${ENV.DOBLE_PUERTO || 4390}`;
  const FOTOS = ENV.FOTOS || null;
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const r = {};
  const espera = (ms) => page.waitForTimeout(ms);
  const foto = async (nombre) => { if (FOTOS) await page.screenshot({ path: `${FOTOS}/${nombre}.png` }); };
  // Un toque de dedo donde está: `page.click` esperaría a que se active lo que está desactivado.
  const tocar = async (sel) => {
    const c = await page.evaluate((s) => { const x = document.querySelector(s)?.getBoundingClientRect(); return x ? { x: x.left + x.width / 2, y: x.top + x.height / 2 } : null; }, sel);
    if (c) await page.mouse.click(c.x, c.y);
  };

  await page.goto(`${B}/`);
  await page.setViewportSize({ width: 780, height: 1600 });
  const k = 780 / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(390 * k), height: Math.round(844 * k) });
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));

  const sembrar = (v) => page.request.post(`${B}/api/sembrar-decision`, { headers: AUT, data: v });
  const ID = "d19a2b3c5f1";
  await sembrar({
    id: ID, titulo: "Portada: los datos de la derecha", proyecto: "Adeorq", panel: 1, tardaImagenes: 3000,
    imagenes: [{ n: 1, ancho: 1200, alto: 600 }, { n: 2, ancho: 390, alto: 844 }, { n: 3, ancho: 1920, alto: 1080 }],
    preguntas: [
      { id: "A", titulo: "¿Cómo quieres los tres datos de la derecha del título?", imagen: { n: 1, tipo: "image/png", ancho: 1200, alto: 600 }, opciones: [
        { texto: "Como hoy: la ficha", detalle: "Tres filas con raya.", imagen: { n: 2, tipo: "image/png", ancho: 390, alto: 844 } },
        { texto: "En fila", detalle: "Los tres números lado a lado.", recomendada: true, imagen: { n: 3, tipo: "image/png", ancho: 1920, alto: 1080 } },
        { texto: "Todo al centro", detalle: "Sin columna derecha." },
      ] },
      { id: "B", titulo: "¿Y el título?", opciones: [{ texto: "Como está" }, { texto: "Una línea" }] },
    ],
  });
  // Una que pide una imagen que el PC ya no tiene.
  await sembrar({
    id: "d19a2b3c5f2", titulo: "Una imagen que se fue", proyecto: "Adeorq", panel: 1,
    preguntas: [{ id: "A", titulo: "¿Cuál?", opciones: [{ texto: "Esta", imagen: { n: 9, tipo: "image/png", ancho: 800, alto: 400 } }, { texto: "Otra" }] }],
  });

  const medir = () => page.evaluate(() => {
    const vista = document.querySelector('.pregunta-d:not([hidden])');
    const caja = (el) => { const x = el.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)]; };
    return {
      opciones: [...vista.querySelectorAll(".opcion")].map(caja),
      fotos: [...vista.querySelectorAll(".dec-foto")].map((b) => ({ n: b.dataset.n, caja: caja(b), img: b.querySelector("img")?.naturalWidth ?? 0, opcion: b.closest(".opcion") ? caja(b.closest(".opcion")) : null })),
      ancho: document.documentElement.scrollWidth, ventana: innerWidth, alto: innerHeight,
    };
  });

  for (const tema of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: tema });
    // 1. Al entrar, los huecos ya están; las imágenes llegan tarde y nada se mueve.
    await page.goto(`${B}/?r=${tema}#decision=${ID}`);
    await page.waitForSelector('.pregunta-d:not([hidden]) .dec-foto');
    // La pantalla y la pregunta entran desde 14 px a la derecha cada una (`entra`,
    // 0,24 s): medido a media entrada, todo sale corrido y la página parece
    // desbordar. Se espera a que acabe y no un tiempo fijo, porque en la primera
    // carga la animación se queda en su fotograma 0 unos 700 ms antes de echar a
    // andar (medido el 2026-11-28: a los 450 ms las opciones salían en x 44, las
    // dos entradas sin empezar, y después en 16, y parecía que las movía la imagen).
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.animationName === "entra").map((a) => a.finished.catch(() => {}))));
    const antes = await medir();
    debe(antes.fotos.every((f) => f.img === 0), `${tema}: las imágenes todavía no han llegado al medir el antes`);
    await page.waitForFunction(() => [...document.querySelectorAll('.pregunta-d:not([hidden]) .dec-foto img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 });
    const despues = await medir();
    r[`${tema}-despues`] = despues;
    debe(JSON.stringify(antes.opciones) === JSON.stringify(despues.opciones), `${tema}: las opciones se movieron al llegar las imágenes (${JSON.stringify(antes.opciones)} → ${JSON.stringify(despues.opciones)})`);
    debe(despues.fotos.length === 3, `${tema}: la de la pregunta y las de dos opciones (${despues.fotos.length})`);
    debe(despues.ancho <= despues.ventana, `${tema}: nada se sale de lado (${despues.ancho} > ${despues.ventana})`);
    const [pq, f1, f2] = despues.fotos;
    // A todo el ancho: la de la pregunta, el de la columna; la de una opción, el de dentro de su opción.
    debe(pq && pq.caja[2] >= despues.ventana - 34, `${tema}: la imagen de la pregunta va a todo el ancho (${pq?.caja})`);
    for (const f of [f1, f2]) debe(f && f.caja[2] >= f.opcion[2] - 34, `${tema}: la imagen de la opción ${f?.n} llena su opción (${f?.caja} en ${f?.opcion})`);
    // Con su forma: la apaisada, a su proporción; la alta, con su tope.
    debe(f2 && Math.abs(f2.caja[3] - (f2.caja[2] * 1080) / 1920) <= 3, `${tema}: la apaisada guarda su proporción (${f2?.caja})`);
    debe(f1 && f1.caja[3] <= Math.min(despues.alto * 0.62, 560) + 2 && f1.caja[3] > 300, `${tema}: la alta no se come la pantalla (${f1?.caja})`);
    await foto(`decision-imagenes-${tema}-pregunta`);

    // 2. Tocar la imagen de la recomendada la abre en grande, y no la elige.
    await espera(650);
    await page.click('.pregunta-d:not([hidden]) .opcion:nth-of-type(2) .dec-foto');
    await page.waitForSelector(".foto-grande img");
    await espera(700);
    r[`${tema}-abierta`] = await page.evaluate(() => ({
      elegida: document.querySelector('input[name="q-A"]:checked')?.value ?? null,
      pregunta: document.querySelector(".pregunta-d:not([hidden])")?.dataset.q,
      titulo: document.querySelector(".foto-grande .tit")?.textContent,
      estado: history.state,
      img: document.querySelector(".foto-grande img").getBoundingClientRect().width,
    }));
    const ab = r[`${tema}-abierta`];
    debe(ab.elegida === null, `${tema}: tocar la imagen eligió la opción ${ab.elegida}`);
    debe(ab.pregunta === "A", `${tema}: abrir la imagen pasó de pregunta (${ab.pregunta})`);
    debe(ab.titulo === "2. En fila", `${tema}: en grande dice de qué opción es («${ab.titulo}»)`);
    debe(ab.estado?.fotoDec === true, `${tema}: abrirla mete su paso en el historial`);
    debe(Math.abs(ab.img - despues.ventana) <= 1, `${tema}: en grande va a lo ancho (${ab.img})`);
    await foto(`decision-imagenes-${tema}-grande`);
    // Un toque, a su tamaño de verdad (1920 px de ancho), y otro, a lo ancho.
    await page.click(".foto-grande img");
    const entera = await page.evaluate(() => document.querySelector(".foto-grande img").getBoundingClientRect().width);
    debe(entera === 1920, `${tema}: un toque la pone a su tamaño (${entera})`);
    await page.click(".foto-grande img");

    // 3. El Atrás del teléfono la cierra, y sigue en la decisión.
    await page.goBack();
    await page.waitForSelector(".foto-grande", { state: "detached", timeout: 3000 }).catch(() => {});
    r[`${tema}-atras`] = await page.evaluate(() => ({
      abierta: Boolean(document.querySelector(".foto-grande")),
      pregunta: document.querySelector(".pregunta-d:not([hidden])")?.dataset.q,
      url: location.href,
      foco: document.activeElement?.className,
    }));
    const at = r[`${tema}-atras`];
    debe(!at.abierta, `${tema}: el Atrás del teléfono no cerró la imagen`);
    debe(at.pregunta === "A" && at.url.startsWith(B), `${tema}: el Atrás del teléfono sacó de la decisión (${at.url}, ${at.pregunta})`);
    debe(at.foco === "dec-foto", `${tema}: el foco vuelve a la imagen (${at.foco})`);

    // 4. Con su flecha y con Escape también, sin dejar pasos colgando en el historial.
    const pasos = await page.evaluate(() => history.length);
    await page.click('.pregunta-d:not([hidden]) > .dec-foto');
    await page.waitForSelector(".foto-grande");
    await page.click("#foto-cerrar");
    await espera(300);
    await page.focus('.pregunta-d:not([hidden]) .opcion:nth-of-type(1) .dec-foto');
    await page.keyboard.press("Enter");
    await page.waitForSelector(".foto-grande");
    debe((await page.textContent(".foto-grande .tit")) === "1. Como hoy: la ficha", `${tema}: con el teclado abre la de la opción 1`);
    await page.keyboard.press("Escape");
    await espera(300);
    r[`${tema}-cerrar`] = await page.evaluate((antes) => ({ abierta: Boolean(document.querySelector(".foto-grande")), estado: history.state, pasos: history.length - antes, elegida: document.querySelector('input[name="q-A"]:checked')?.value ?? null }), pasos);
    const ce = r[`${tema}-cerrar`];
    debe(!ce.abierta && !ce.estado?.fotoDec, `${tema}: la flecha y Escape la cierran (${JSON.stringify(ce)})`);
    debe(ce.elegida === null, `${tema}: abrirla con el teclado eligió la opción ${ce.elegida}`);

    // 5. El texto de la opción sigue eligiendo y pasando a la siguiente.
    await espera(650);
    await page.click('.pregunta-d:not([hidden]) .opcion:nth-of-type(2) .txt b');
    await page.waitForSelector('.pregunta-d[data-q="B"]:not([hidden])', { timeout: 3000 }).catch(() => {});
    const ahora = await page.evaluate(() => document.querySelector(".pregunta-d:not([hidden])")?.dataset.q);
    debe(ahora === "B", `${tema}: tocar el texto de la opción ya no pasa a la siguiente (${ahora})`);
    // Se vuelve a la A para la pasada siguiente: el borrador se queda, y se borra.
    await page.evaluate((id) => { for (const k of Object.keys(localStorage)) if (k.includes(id)) localStorage.removeItem(k); }, ID);
  }

  // 6. Una imagen que el PC ya no tiene lo dice en su hueco, sin mover nada.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${B}/?r=falla#decision=d19a2b3c5f2`);
  await page.waitForSelector(".dec-foto");
  const hueco = await page.evaluate(() => document.querySelector(".dec-foto").getBoundingClientRect().height);
  await page.waitForSelector(".dec-foto[data-falla]", { timeout: 4000 }).catch(() => {});
  r.falla = await page.evaluate(() => ({ texto: document.querySelector(".dec-foto")?.textContent, alto: document.querySelector(".dec-foto").getBoundingClientRect().height }));
  debe(r.falla.texto === "Esa imagen ya no está.", `la que no está lo dice («${r.falla.texto}»)`);
  debe(Math.abs(r.falla.alto - hueco) <= 1, `y no cambia de alto (${hueco} → ${r.falla.alto})`);
  await page.click(".dec-foto");
  debe(!(await page.$(".foto-grande")), "la que no está no abre una vista vacía");

  // 7. Contestada, se ve la imagen de lo que se eligió.
  await page.request.post(`${B}/api/decision/responder`, { headers: AUT, data: { id: ID, elecciones: { A: { opcion: 2 }, B: { opcion: 1 } } } });
  for (const tema of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: tema });
    await page.goto(`${B}/?r=c-${tema}#decision=${ID}`);
    await page.waitForSelector('.pregunta-d[disabled]');
    await page.waitForFunction(() => [...document.querySelectorAll(".dec-foto img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
    r[`${tema}-cerrada`] = await page.$$eval(".pregunta-d[disabled]", (fs) => fs.map((f) => ({ q: f.dataset.q, foto: f.querySelector(".dec-foto")?.dataset.titulo ?? null })));
    debe(JSON.stringify(r[`${tema}-cerrada`]) === JSON.stringify([{ q: "A", foto: "2. En fila" }, { q: "B", foto: null }]), `${tema}: contestada, la imagen de lo elegido (${JSON.stringify(r[`${tema}-cerrada`])})`);
    await foto(`decision-imagenes-${tema}-contestada`);
    // Y se abre de verdad: va dentro de un fieldset desactivado, donde un <button> no atiende (revisión del 2026-11-19).
    await tocar(".pregunta-d[disabled] .dec-foto");
    await page.waitForSelector(".foto-grande img", { timeout: 3000 }).catch(() => {});
    const grandeCerrada = await page.evaluate(() => document.querySelector(".foto-grande .tit")?.textContent ?? null);
    debe(grandeCerrada === "2. En fila", `${tema}: contestada, tocar la imagen la abre en grande («${grandeCerrada}»)`);
    await page.keyboard.press("Escape");
    await espera(300);
  }

  // 9. En plena cuenta atrás, abrir una imagen no tapa «Deshacer», y se puede
  // deshacer sin cerrarla (revisión del 2026-11-19: se mandaba con ella encima).
  const UNA = "d19a2b3c5f3";
  const de800 = (n) => ({ n, tipo: "image/png", ancho: 800, alto: 500 });
  await sembrar({
    id: UNA, titulo: "Una sola", proyecto: "Adeorq", panel: 1, tardaImagenes: 0,
    imagenes: [{ n: 1, ancho: 800, alto: 500 }, { n: 2, ancho: 800, alto: 500 }],
    preguntas: [{ id: "A", titulo: "¿Cuál de las dos?", opciones: [{ texto: "Izquierda", imagen: de800(1) }, { texto: "Derecha", imagen: de800(2) }] }],
  });
  await page.goto(`${B}/?r=cuenta#decision=${UNA}`);
  await page.waitForFunction(() => [...document.querySelectorAll(".pregunta-d .dec-foto img")].filter((i) => i.naturalWidth > 0).length === 2, null, { timeout: 8000 }).catch(() => {});
  await espera(800);
  await page.click(".pregunta-d .opcion:nth-of-type(1) .txt b");
  await page.waitForFunction(() => !document.querySelector("#enviar-dec").disabled, null, { timeout: 5000 }).catch(() => {});
  await page.click("#enviar-dec");
  await espera(1200);
  await tocar(".pregunta-d .opcion:nth-of-type(2) .dec-foto");
  await page.waitForSelector(".foto-grande img", { timeout: 3000 }).catch(() => {});
  r.cuenta = await page.evaluate(() => {
    const b = document.querySelector("#enviar-dec").getBoundingClientRect();
    const encima = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { abierta: Boolean(document.querySelector(".foto-grande")), boton: document.querySelector("#enviar-dec").textContent, encima: encima?.id || encima?.className || null };
  });
  await foto("decision-imagenes-cuenta-atras");
  debe(r.cuenta.abierta, "en la cuenta atrás, tocar la imagen la abre");
  debe(r.cuenta.encima === "enviar-dec" && /\d/.test(r.cuenta.boton), `con la imagen abierta, la cuenta y «Deshacer» siguen a la vista (${JSON.stringify(r.cuenta)})`);
  await tocar("#enviar-dec");
  await espera(5500);
  r.cuenta.respuesta = (await (await page.request.get(`${B}/api/decision?id=${UNA}`, { headers: AUT })).json()).respuesta ?? null;
  debe(r.cuenta.respuesta === null, `«Deshacer» con la imagen abierta no la manda (${JSON.stringify(r.cuenta.respuesta)})`);

  // 10. Una tira muy apaisada (16000 × 60) se puede tocar: medía 2 px de alto (revisión del 2026-11-19).
  const TIRA = "d19a2b3c5f4";
  await sembrar({
    id: TIRA, titulo: "Una tira", proyecto: "Adeorq", panel: 1, tardaImagenes: 0,
    imagenes: [{ n: 1, ancho: 16000, alto: 60 }],
    preguntas: [{ id: "A", titulo: "¿Y esta?", imagen: { n: 1, tipo: "image/png", ancho: 16000, alto: 60 }, opciones: [{ texto: "Sí" }, { texto: "No" }] }],
  });
  await page.goto(`${B}/?r=tira#decision=${TIRA}`);
  await page.waitForSelector(".pregunta-d:not([hidden]) > .dec-foto");
  await espera(450);
  r.tira = await page.evaluate(() => Math.round(document.querySelector(".pregunta-d:not([hidden]) > .dec-foto").getBoundingClientRect().height));
  debe(r.tira >= 44, `una tira muy apaisada se puede tocar (${r.tira} px de alto)`);

  // 11. Al entrar se bajan solo las de la pregunta a la vista y la siguiente, al
  // volver tras otra decisión no se bajan otra vez, y la caché llena suelta antes
  // lo de otras decisiones que lo de la abierta (revisión del 2026-11-19: 56 al
  // entrar en una de 8 × 7, y otras 56 al volver).
  const MUCHAS = "d19a2b3c5f5";
  const OTRA = "d19a2b3c5f6";
  const chica = (n) => ({ n, tipo: "image/png", ancho: 40, alto: 30 });
  const chicas = (k) => Array.from({ length: k }, (_, i) => ({ n: i + 1, ancho: 40, alto: 30 }));
  await sembrar({
    id: MUCHAS, titulo: "Muchas", proyecto: "Adeorq", panel: 1, tardaImagenes: 0, imagenes: chicas(56),
    preguntas: Array.from({ length: 8 }, (_, q) => ({
      id: String.fromCharCode(65 + q), titulo: `Pregunta ${q + 1}`, imagen: chica(q * 7 + 1),
      opciones: Array.from({ length: 6 }, (_, o) => ({ texto: `Opción ${o + 1}`, imagen: chica(q * 7 + o + 2) })),
    })),
  });
  await sembrar({
    id: OTRA, titulo: "Otra", proyecto: "Adeorq", panel: 1, tardaImagenes: 0, imagenes: chicas(8),
    preguntas: [
      { id: "A", titulo: "¿Cuál?", imagen: chica(1), opciones: Array.from({ length: 6 }, (_, o) => ({ texto: `O${o + 1}`, imagen: chica(o + 2) })) },
      { id: "B", titulo: "¿Y esta?", imagen: chica(8), opciones: [{ texto: "Sí" }, { texto: "No" }] },
    ],
  });
  const pedidasDe = async (id) => (await (await page.request.get(`${B}/api/pedidas-imagen`, { headers: AUT })).json()).filter((p) => p.startsWith(`${id}:`)).length;
  const aLaVista = () => page.waitForFunction(() => [...document.querySelectorAll(".pregunta-d:not([hidden]) .dec-foto img")].every((i) => i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
  await page.goto(`${B}/?r=muchas#decision=${MUCHAS}`);
  await aLaVista();
  await espera(800);
  r.muchas = { entrar: await pedidasDe(MUCHAS) };
  await page.evaluate((id) => window.ir({ vista: "decision", id }), OTRA);
  await espera(1200);
  await page.evaluate((id) => window.ir({ vista: "decision", id }), MUCHAS);
  await aLaVista();
  await espera(800);
  r.muchas.volver = (await pedidasDe(MUCHAS)) - r.muchas.entrar;
  r.muchas.rotas = await page.evaluate(() => [...document.querySelectorAll(".pregunta-d:not([hidden]) .dec-foto img")].filter((i) => !(i.naturalWidth > 0)).length);
  debe(r.muchas.entrar <= 14, `al entrar, solo las de la pregunta a la vista y la siguiente (${r.muchas.entrar} de 56)`);
  debe(r.muchas.volver === 0 && r.muchas.rotas === 0, `al volver tras otra decisión no se bajan otra vez (${JSON.stringify(r.muchas)})`);
  // Con la caché llena (60): las 56 de una, las 8 de otra y otra vez las 56.
  // Antes cada una que volvía echaba a la siguiente suya, y se bajaban todas.
  await page.evaluate(async ([a, b]) => {
    for (let n = 1; n <= 56; n++) await fotoDec(a, n);
    for (let n = 1; n <= 8; n++) await fotoDec(b, n);
  }, [MUCHAS, OTRA]);
  const antesDeVolver = await pedidasDe(MUCHAS);
  await page.evaluate(async (a) => { for (let n = 1; n <= 56; n++) await fotoDec(a, n); }, MUCHAS);
  r.muchas.llena = (await pedidasDe(MUCHAS)) - antesDeVolver;
  debe(r.muchas.llena <= 8, `con la caché llena, volver a las 56 no las baja todas otra vez (${r.muchas.llena})`);

  // 12. Si el envío falla con la imagen abierta, la imagen se cierra y se ve por
  // qué, como cuando sale bien (revisión del 2026-11-19: el aviso quedaba debajo).
  const dos = (id, titulo) => sembrar({
    id, titulo, proyecto: "Adeorq", panel: 1, tardaImagenes: 0,
    imagenes: [{ n: 1, ancho: 800, alto: 500 }, { n: 2, ancho: 800, alto: 500 }],
    preguntas: [{ id: "A", titulo: "¿Cuál de las dos?", opciones: [{ texto: "Izquierda", imagen: de800(1) }, { texto: "Derecha", imagen: de800(2) }] }],
  });
  const lasDos = () => page.waitForFunction(() => [...document.querySelectorAll(".pregunta-d .dec-foto img")].filter((i) => i.naturalWidth > 0).length === 2, null, { timeout: 8000 }).catch(() => {});
  const FALLA = "d19a2b3c5f7";
  await dos(FALLA, "Una que no llega");
  const noLlega = (ruta) => ruta.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "El banco no la deja pasar." }) });
  await page.route("**/api/decision/responder", noLlega);
  await page.goto(`${B}/?r=falla-envio#decision=${FALLA}`);
  await lasDos();
  await espera(800);
  await page.click(".pregunta-d .opcion:nth-of-type(1) .txt b");
  await page.waitForFunction(() => !document.querySelector("#enviar-dec").disabled, null, { timeout: 5000 }).catch(() => {});
  await page.click("#enviar-dec");
  await espera(1200);
  await tocar(".pregunta-d .opcion:nth-of-type(2) .dec-foto");
  await page.waitForSelector(".foto-grande img", { timeout: 3000 }).catch(() => {});
  const abiertaEnCuenta = Boolean(await page.$(".foto-grande"));
  await page.waitForFunction(() => document.querySelector("#enviar-dec").textContent === "Enviar respuesta", null, { timeout: 9000 }).catch(() => {});
  await espera(400);
  r.fallaEnvio = await page.evaluate(() => {
    const est = document.querySelector("#estado-envio");
    const eb = est.getBoundingClientRect();
    const encima = eb.height ? document.elementFromPoint(eb.left + eb.width / 2, eb.top + eb.height / 2) : null;
    return { abierta: Boolean(document.querySelector(".foto-grande")), estado: est.textContent, tapado: Boolean(encima?.closest(".foto-grande")), paso: history.state?.fotoDec ?? false };
  });
  await page.unroute("**/api/decision/responder", noLlega);
  debe(abiertaEnCuenta, "en la cuenta atrás de un envío que fallará, la imagen se abre");
  debe(r.fallaEnvio.estado !== "" && !r.fallaEnvio.tapado, `si el envío falla con la imagen abierta, se ve por qué (${JSON.stringify(r.fallaEnvio)})`);
  debe(!r.fallaEnvio.abierta && !r.fallaEnvio.paso, `y la imagen se cierra sin dejar su paso en el historial (${JSON.stringify(r.fallaEnvio)})`);

  // 13. Cerrar una con la flecha y abrir otra en el mismo instante deja abierta la
  // segunda: el «atrás» de la primera llega unos milisegundos tarde y la cerraba
  // (revisión del 2026-11-19). Y el Atrás del teléfono la cierra a ella.
  const CARRERA = "d19a2b3c5f8";
  await dos(CARRERA, "Cerrar y abrir");
  await page.goto(`${B}/?r=carrera#decision=${CARRERA}`);
  await lasDos();
  await espera(800);
  await tocar(".pregunta-d .opcion:nth-of-type(1) .dec-foto");
  await page.waitForSelector(".foto-grande", { timeout: 3000 }).catch(() => {});
  await espera(300);
  await page.evaluate(() => {
    document.querySelector("#foto-cerrar").click();
    document.querySelector(".pregunta-d .opcion:nth-of-type(2) .dec-foto").click();
  });
  await espera(400);
  r.carrera = await page.evaluate(() => ({ abierta: document.querySelector(".foto-grande .tit")?.textContent ?? null, paso: history.state?.fotoDec ?? false }));
  debe(r.carrera.abierta === "2. Derecha" && r.carrera.paso, `cerrar una y abrir otra al instante deja abierta la segunda, con su paso (${JSON.stringify(r.carrera)})`);
  if (r.carrera.abierta) {
    await page.goBack();
    await page.waitForSelector(".foto-grande", { state: "detached", timeout: 3000 }).catch(() => {});
    r.carrera.atras = await page.evaluate(() => ({ abierta: Boolean(document.querySelector(".foto-grande")), q: document.querySelector(".pregunta-d:not([hidden])")?.dataset.q ?? null, url: location.href }));
    debe(!r.carrera.atras.abierta && r.carrera.atras.q === "A" && r.carrera.atras.url.startsWith(B), `y el Atrás del teléfono la cierra sin salir de la decisión (${JSON.stringify(r.carrera.atras)})`);
  }

  // 14. Con teclado, Tab no sale de la vista en grande (es modal): solo su flecha y,
  // con la cuenta a la vista, los botones del pie. Antes se salía a la página de
  // detrás, se abría otra encima y se apilaban pasos (revisión del 2026-11-19).
  const TAB = "d19a2b3c5f9";
  await dos(TAB, "Con teclado");
  await page.goto(`${B}/?r=tab#decision=${TAB}`);
  await lasDos();
  await espera(800);
  const dentro = () => page.evaluate(() => {
    const a = document.activeElement;
    return a?.closest(".foto-grande") ? "vista" : a?.closest("#pie-dec") ? `pie:${a.id || a.className}` : `fuera:${a?.tagName}.${a?.className || a?.id || ""}`;
  });
  await page.focus(".pregunta-d .opcion:nth-of-type(1) .dec-foto");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".foto-grande", { timeout: 3000 }).catch(() => {});
  r.tab = { sinCuenta: [] };
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
    r.tab.sinCuenta.push(await dentro());
  }
  debe(r.tab.sinCuenta.every((x) => x === "vista"), `sin cuenta, Tab y Mayús+Tab se quedan en la vista en grande (${r.tab.sinCuenta})`);
  await page.keyboard.press("Escape");
  await espera(300);
  r.tab.trasEscape = await page.evaluate(() => ({ abierta: Boolean(document.querySelector(".foto-grande")), paso: history.state?.fotoDec ?? false }));
  debe(!r.tab.trasEscape.abierta && !r.tab.trasEscape.paso, `y Escape la cierra sin dejar su paso (${JSON.stringify(r.tab.trasEscape)})`);
  // En la cuenta atrás, Tab llega a «Deshacer», que queda por debajo, y vuelve a la vista.
  await page.click(".pregunta-d .opcion:nth-of-type(1) .txt b");
  await page.waitForFunction(() => !document.querySelector("#enviar-dec").disabled, null, { timeout: 5000 }).catch(() => {});
  await page.click("#enviar-dec");
  await espera(1200);
  await page.focus(".pregunta-d .opcion:nth-of-type(2) .dec-foto");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".foto-grande", { timeout: 3000 }).catch(() => {});
  r.tab.enCuenta = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    r.tab.enCuenta.push(await dentro());
  }
  debe(r.tab.enCuenta.includes("pie:enviar-dec") && r.tab.enCuenta.includes("vista") && r.tab.enCuenta.every((x) => !x.startsWith("fuera")), `en la cuenta, Tab va de la vista a «Deshacer» y vuelve, sin salir (${r.tab.enCuenta})`);
  // Se deshace, que esta no se mande.
  await page.focus("#enviar-dec");
  await page.keyboard.press("Enter");
  await espera(300);

  // 8. Las pidió por su id y su número, nunca una ruta.
  r.pedidas = await (await page.request.get(`${B}/api/pedidas-imagen`, { headers: AUT })).json();
  debe(["1", "2", "3"].every((n) => r.pedidas.includes(`${ID}:${n}`)), `pidió las tres por su número (${r.pedidas})`);
  debe(r.pedidas.every((p) => /^d[0-9a-f]+:\d+$/.test(p)), `solo id y número (${r.pedidas})`);
  return { fallos, r };
}
