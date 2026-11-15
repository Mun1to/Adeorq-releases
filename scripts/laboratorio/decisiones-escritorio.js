// La pestaña «Decisiones» de la app de escritorio, con la app de verdad (Vite)
// y un doble de Tauri que contesta como `decisiones.rs`:
//
//   1. `pnpm dev` (solo Vite, no compila Rust ni toca `C:\ct`)
//   2. desde una sesión con el MCP de Playwright, con la página recién abierta:
//        browser_run_code_unsafe(filename = "scripts/laboratorio/decisiones-escritorio.js")
//
// Munir, 2026-10-09, contestando desde el móvil la primera decisión de verdad:
// quería verlas también en el PC, «una sección Decisiones dentro de la app».
// Lo que fija esto: la pestaña cuenta las que te esperan DE VERDAD (las de una
// terminal que sigue abierta); lo que ya no espera va junto en «Anteriores» y
// lo dice, y se descarta sin teclear en ninguna terminal; escribirle una
// frase a la terminal que preguntó la da por hablada (2026-10-11: «que se
// limpie sola»), y pulsar Intro a secas no; con nada pendiente no se abre
// ninguna sola; la ficha de la derecha dice lo elegido; ninguna opción sale
// marcada aunque haya recomendada; «Enviar» no se deja pulsar hasta tener cada
// pregunta contestada; lo marcado sobrevive a irse de la pestaña; «Deshacer»
// para el envío; al mandarla se teclea en el panel que preguntó y se apunta
// como entregada; una contestada se lee y no se edita; irse en plena cuenta
// atrás la manda igual; una nueva del MCP sube la cuenta sin recargar; y en
// inglés la pestaña se llama Decisions.
//
// Y desde el 2026-11-15 (A1), la lista única: una terminal que te espera, una
// decisión viva y un encargo parado van en «Te toca» y cuentan en la pestaña;
// lo que terminó y las ideas de tus agentes van debajo y no cuentan; todo de
// borde a borde y sin recuadro; se maneja con J/K, Intro, 1 a 9, Tab, O, Esc y
// Ctrl+Intro; Retroceso quita un «terminó»; una idea se descarta aquí y sale de
// la bandeja; ? enseña las teclas; Esc te devuelve adonde estabas, y
// Ctrl+Mayús+B y el último renglón de la campana te traen.
//
// Devuelve { fallos: [...] }: vacío es que todo está en su sitio.
// ⚠ Cargarlo dos veces en la misma página suma los dos guiones de arranque:
// cerrar la página (browser_close) antes de volver a lanzarlo.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  // Donde el MCP de Playwright deja escribir, y git no mira.
  const CAPTURAS = ".playwright-mcp";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const lang = sessionStorage.getItem("__lang") || "es";
    // Lo marcado se guarda en localStorage: se conserva entre cargas si la
    // prueba lo pide (`__guardar`), y si no, casa limpia.
    if (!sessionStorage.getItem("__guardar")) localStorage.clear();
    localStorage.setItem("adeorq-lang", lang);
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude", "codex"] }));

    const ahora = Date.now();
    const ARRANQUE = ahora - 3_600_000;
    const pregunta = (id, titulo, opciones, contexto) => ({ id, titulo, contexto, opciones });
    const op = (texto, extra = {}) => ({ texto, recomendada: false, ...extra });
    window.__dec = window.__dec || [
      {
        id: "d19a2b3c4d01", titulo: "Dónde va la barra de la guía", proyecto: "Adeorq", panel: 3, arranque: ARRANQUE,
        contexto: "La guía de la web tiene dos barras arriba y en el móvil ocupan media pantalla.",
        creada: ahora - 6 * 60_000,
        preguntas: [
          pregunta("A", "La barra de arriba", [
            op("Como está"),
            op("La de la portada", { recomendada: true, detalle: "Una sola barra, la misma que ya conoces de adeorq.com." }),
            op("Ninguna, solo el índice"),
          ]),
          pregunta("B", "El menú en el móvil", [op("Un botón que lo despliega"), op("Una fila de enlaces que se desliza")],
            "A 390 px no caben los seis enlaces."),
        ],
      },
      {
        // Sin terminal apuntada y pedida en este arranque: sigue viva.
        id: "d19a2b3c4d00", titulo: "Cómo se llama la sección nueva", proyecto: "VoCript", creada: ahora - 20 * 60_000,
        preguntas: [pregunta("A", "El nombre", [op("Dictados"), op("Historial", { recomendada: true })])],
      },
      {
        // De una terminal de otro arranque: ya no la espera nadie.
        id: "d19a2b3c4b00", titulo: "El color de ayer", proyecto: "Webs", panel: 3, arranque: ARRANQUE - 86_400_000,
        creada: ahora - 3 * 86_400_000,
        preguntas: [pregunta("A", "¿Cuál?", [op("Azul"), op("Verde")])],
      },
      {
        id: "d19a2b3c4c00", titulo: "Decisiones: primera prueba de verdad", proyecto: "Adeorq", panel: 1, arranque: ARRANQUE,
        creada: ahora - 26 * 3_600_000,
        preguntas: [pregunta("A", "¿Cómo te llegó esta decisión?", [op("Por el aviso"), op("Mirando la lista"), op("Por el número del botón")])],
        respuesta: { cuando: ahora - 25 * 3_600_000, desde: "Android · Chrome", elecciones: { A: { opcion: 3 } }, entregada: true },
      },
    ];

    const llamadas = [];
    window.__llamadas = llamadas;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const oyentes = {};
    let escucha = 1;
    window.__emitir = (evento, payload = null) => {
      for (const h of oyentes[evento] ?? []) window[`_${h}`]?.({ event: evento, id: h, payload });
    };
    const copia = (v) => JSON.parse(JSON.stringify(v));
    // Como `vigencia` (decisiones.rs).
    const ABIERTOS = [3];
    const cerrada = (d) => Number(Boolean(d.respuesta || d.descartada));
    const vigenciaDe = (d) =>
      d.respuesta ? "contestada" : d.descartada ? "descartada" : d.hablada ? "hablada"
        : (d.panel != null ? d.arranque === ARRANQUE && ABIERTOS.includes(d.panel) : d.creada >= ARRANQUE) ? "viva" : "huerfana";
    const contestar = (cmd, args) => {
      llamadas.push([cmd, copia(args ?? {})]);
      switch (cmd) {
        case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
        case "plugin:event|unlisten": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        // La bandeja de la Agenda (`inbox.rs`): vacía hasta que el banco la llena.
        case "read_inbox": return copia(window.__notas ?? []);
        case "drop_inbox": window.__notas = (window.__notas ?? []).filter((n) => n.line !== args.line); return null;
        case "programados_listar": return { puede: true, reloj: true, encargos: copia(window.__programados ?? []) };
        // Como `decisiones.rs`: las pendientes primero, y cada una con su
        // vigencia. El panel 3 es el único con terminal abierta.
        case "decisiones_listar":
          return copia([...window.__dec]
            .sort((a, b) => cerrada(a) - cerrada(b) || b.creada - a.creada)
            .map((d) => ({ ...d, vigencia: vigenciaDe(d) })));
        // Como `decision_descartar`: a la terminal que la esperaba se le dice.
        case "decision_descartar": {
          const d = window.__dec.find((x) => x.id === args.id);
          if (!d) throw "Esa decisión ya no está.";
          if (d.respuesta) throw "Esa decisión ya está contestada.";
          const viva = vigenciaDe(d) === "viva" && d.panel != null;
          d.descartada ??= Date.now();
          setTimeout(() => window.__emitir("decisiones:cambian"), 0);
          return { panel: viva ? d.panel : null, texto: viva ? `Munir ha descartado la decisión «${d.titulo}» (${d.id}) sin contestarla: no esperes respuesta.` : null };
        }
        case "decision_responder": {
          const d = window.__dec.find((x) => x.id === args.id);
          if (!d) throw "Esa decisión ya no está.";
          if (d.respuesta) throw "Esa decisión ya está contestada.";
          if (d.descartada) throw "Esa decisión está descartada.";
          for (const q of d.preguntas) {
            const e = args.elecciones[q.id] ?? {};
            if (!e.opcion && !e.texto) throw `Falta contestar la pregunta ${q.id}.`;
          }
          d.respuesta = { cuando: Date.now(), desde: "el PC", elecciones: copia(args.elecciones), entregada: false };
          setTimeout(() => window.__emitir("decisiones:cambian"), 0);
          const mismo = d.panel != null && d.arranque === ARRANQUE;
          return { decision: copia(d), panel: mismo ? d.panel : null, texto: mismo ? `Munir ha contestado a «${d.titulo}» (decisión ${d.id}):` : null };
        }
        case "decision_entregada": {
          const d = window.__dec.find((x) => x.id === args.id);
          if (d?.respuesta) d.respuesta.entregada = true;
          setTimeout(() => window.__emitir("decisiones:cambian"), 0);
          return null;
        }
        // Como `marcar_habladas`: las de ese panel, de este arranque y sin cerrar.
        case "decisiones_habladas": {
          const suyas = window.__dec.filter((x) => x.panel === args.panel && x.arranque === ARRANQUE && !x.respuesta && !x.descartada && !x.hablada);
          for (const x of suyas) x.hablada = Date.now();
          if (suyas.length) setTimeout(() => window.__emitir("decisiones:cambian"), 0);
          return suyas.length;
        }
        case "pty_send": return null;
        default:
          throw new Error(`sin doble: ${cmd}`);
      }
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd, args) => Promise.resolve().then(() => contestar(cmd, args)),
        transformCallback: (cb) => {
          const id = Math.floor(Math.random() * 1e9);
          window[`_${id}`] = cb;
          return id;
        },
        convertFileSrc: (ruta) => ruta,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  });

  const llamadasDe = (cmd) => page.evaluate((c) => window.__llamadas.filter(([x]) => x === c).map(([, a]) => a), cmd);
  const tab = page.locator('button.tab[data-tab="decisiones"]');
  // El de enviar es el último de la barra del pie; delante va «Descartar».
  const boton = page.locator(".dec-pie-botones button:last-child");
  const estado = page.locator(".dec-estado");
  const preguntas = page.locator(".dec-pregunta");

  await page.goto("http://localhost:1420/");
  await tab.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  // 1. La pestaña cuenta las que te esperan, en ámbar.
  const cuenta = await tab.locator(".tab-count").evaluate((x) => ({ n: x.textContent, espera: x.dataset.espera }));
  debe(cuenta.n === "2" && cuenta.espera === "true", `la pestaña cuenta 2 en ámbar (${JSON.stringify(cuenta)})`);

  // 2. Abre en la primera que te espera, sin nada marcado aunque haya recomendada.
  await tab.click();
  await page.waitForSelector(".dec-abierta");
  debe(await page.locator(".dec-fila").count() === 4, "cuatro en la lista");
  const etis = await page.locator(".dec-lista-eti").allTextContents();
  debe(etis.join() === "Te toca,Ya pasó", `las partes con algo dentro, y solo esas (${etis})`);
  debe(await page.locator(".dec-limpiar").count() === 0, "ya no hay botón de vaciar: se limpia sola");
  debe((await page.locator(".dec-head").textContent()) === "Decisiones2 te tocan", `el título va dentro del cristal (${await page.locator(".dec-head").textContent()})`);
  debe((await page.locator(".dec-abierta h2").textContent()) === "Dónde va la barra de la guía", "abre la primera que te espera");
  debe(/El panel 3 sigue abierto/.test(await page.locator(".dec-vigencia").textContent()), "la viva dice quién la espera");
  const ficha = await page.locator(".dec-resumen li").allTextContents();
  debe(ficha.join("|") === "AFalta|BFalta", `la barra del pie dice lo que falta (${ficha.join("|")})`);

  // 2b. La que nadie espera: no cuenta en la pestaña, lo dice, y se descarta
  //     sin escribir en ninguna terminal (el panel 3 de hoy es otra).
  await page.locator(".dec-fila", { hasText: "El color de ayer" }).click();
  debe(/Ya no la espera nadie/.test(await page.locator(".dec-vigencia").textContent()), "la huérfana lo dice");
  debe(/^Sin nadie detrás/.test(await page.locator(".dec-fila", { hasText: "El color de ayer" }).textContent()), "su fila empieza por cómo acabó");
  await page.locator(".dec-barra button", { hasText: "Descartar" }).click();
  await page.waitForTimeout(400);
  debe((await llamadasDe("decision_descartar")).length === 1 && (await llamadasDe("pty_send")).length === 0, "se descarta sin teclear en ninguna terminal");
  debe(/La descartaste/.test(await page.locator(".dec-vigencia").textContent()), `queda como descartada (${await page.locator(".dec-vigencia").textContent()})`);
  debe(await page.locator(".dec-barra").count() === 0 && await page.locator(".dec-pregunta:disabled").count() === 1, "y ya no se contesta");
  debe((await tab.locator(".tab-count").textContent()) === "2", "la cuenta de la pestaña no cambia: nunca la contó");
  await page.locator(".dec-fila", { hasText: "Dónde va la barra" }).click();
  await page.waitForTimeout(200);
  debe(await page.locator(".dec-abierta input:checked").count() === 0, "ninguna opción sale marcada");
  debe(await page.locator(".dec-rec").count() === 1, "la recomendada lleva su etiqueta");
  debe(await boton.isDisabled(), "Enviar apagado sin contestar");
  debe((await estado.textContent()) === "Faltan las preguntas A y B.", `dice qué falta (${await estado.textContent()})`);
  await page.screenshot({ path: `${CAPTURAS}/dec-abierta.png` });

  // 3. Se marca, se escribe, y se guarda solo.
  await preguntas.nth(0).locator(".dec-opcion").nth(1).click();
  debe((await estado.textContent()) === "Falta la pregunta B.", `falta una (${await estado.textContent()})`);
  await preguntas.nth(1).locator("textarea").fill("Mejor un menú que se despliega desde la barra");
  debe(!(await boton.isDisabled()), "Enviar encendido con todo contestado");
  const elegido = await page.locator(".dec-resumen li").allTextContents();
  debe(/2 · La de la portada/.test(elegido[0]) && /«Mejor un menú/.test(elegido[1]), `la ficha dice lo elegido (${elegido.join("|")})`);
  const borrador = await page.evaluate(() => JSON.parse(localStorage.getItem("adeorq-decision-d19a2b3c4d01") || "{}"));
  debe(borrador.A?.opcion === 2 && /despliega/.test(borrador.B?.texto ?? ""), `el borrador se guarda (${JSON.stringify(borrador)})`);
  await page.screenshot({ path: `${CAPTURAS}/dec-rellena.png` });

  // 4. Irse de la pestaña y volver no lo pierde.
  await page.locator('button.tab[data-tab="panel"]').click();
  await page.waitForTimeout(300);
  await tab.click();
  await page.waitForSelector(".dec-abierta");
  const vuelta = await page.evaluate(() => ({
    marcada: document.querySelectorAll(".dec-pregunta")[0].querySelector("input:checked")?.closest(".dec-opcion")?.querySelector(".dec-num")?.textContent,
    texto: document.querySelectorAll(".dec-pregunta")[1].querySelector("textarea").value,
  }));
  debe(vuelta.marcada === "2" && /despliega/.test(vuelta.texto), `lo marcado vuelve (${JSON.stringify(vuelta)})`);

  // 5. «Deshacer» para el envío.
  await boton.click();
  debe((await boton.textContent()) === "Deshacer (5)", `cuenta atrás (${await boton.textContent()})`);
  debe(await page.locator(".dec-pregunta:disabled").count() === 2, "durante la cuenta atrás no se cambia nada");
  await page.waitForTimeout(1200);
  await boton.click();
  await page.waitForTimeout(300);
  debe((await estado.textContent()) === "No se ha mandado.", `deshecho (${await estado.textContent()})`);
  debe((await llamadasDe("decision_responder")).length === 0, "deshecho no llega a Rust");

  // 6. Se manda, se teclea en el panel 3 y se apunta como entregada.
  await boton.click();
  await page.waitForTimeout(6000);
  const resp = await llamadasDe("decision_responder");
  debe(resp.length === 1 && resp[0].elecciones.A?.opcion === 2 && resp[0].elecciones.A?.texto === undefined
    && /despliega/.test(resp[0].elecciones.B?.texto ?? "") && resp[0].elecciones.B?.opcion === undefined,
    `manda lo marcado y lo escrito, sin cajas vacías (${JSON.stringify(resp)})`);
  const tecleo = await llamadasDe("pty_send");
  debe(tecleo.length === 1 && tecleo[0].id === 3 && /^Munir ha contestado/.test(tecleo[0].texto), `se teclea en el panel 3 (${JSON.stringify(tecleo)})`);
  debe((await llamadasDe("decision_entregada")).length === 1, "se apunta como entregada");
  debe((await estado.textContent()) === "Enviada. Se ha tecleado en el panel 3.", `lo dice (${await estado.textContent()})`);
  debe(await page.evaluate(() => localStorage.getItem("adeorq-decision-d19a2b3c4d01")) === null, "el borrador se borra");
  await page.waitForTimeout(300);
  debe((await tab.locator(".tab-count").textContent()) === "1", "la cuenta baja a 1");
  debe(/Contestada desde el PC/.test(await page.locator(".dec-hecha").textContent()), "se ve contestada desde el PC");
  debe(/Se tecleó en el panel 3/.test(await page.locator(".dec-hecha").textContent()), "y que se tecleó");

  // 7. Una contestada se lee, no se edita.
  await page.locator(".dec-fila", { hasText: "primera prueba de verdad" }).click();
  await page.waitForTimeout(200);
  const leida = await page.evaluate(() => ({
    hecha: document.querySelector(".dec-hecha")?.textContent ?? "",
    pie: Boolean(document.querySelector(".dec-barra")),
    apagadas: [...document.querySelectorAll(".dec-pregunta")].every((f) => f.disabled),
    marcada: document.querySelector(".dec-opcion[data-marcada=true] .dec-num")?.textContent,
    caja: Boolean(document.querySelector(".dec-libre")),
  }));
  debe(/Android · Chrome/.test(leida.hecha) && /Se tecleó en el panel 1/.test(leida.hecha), `de dónde vino (${leida.hecha})`);
  debe(!leida.pie && leida.apagadas && leida.marcada === "3" && !leida.caja, `se lee sin poder tocarla (${JSON.stringify(leida)})`);
  await page.screenshot({ path: `${CAPTURAS}/dec-contestada.png` });

  // 8. Irse en plena cuenta atrás la manda igual; sin panel, no se teclea.
  await page.locator(".dec-fila", { hasText: "sección nueva" }).click();
  await preguntas.nth(0).locator(".dec-opcion").nth(1).click();
  await boton.click();
  await page.waitForTimeout(400);
  await page.locator('button.tab[data-tab="panel"]').click();
  await page.waitForTimeout(800);
  const segunda = (await llamadasDe("decision_responder")).filter((a) => a.id === "d19a2b3c4d00");
  debe(segunda.length === 1 && segunda[0].elecciones.A?.opcion === 2, `irse la manda (${JSON.stringify(segunda)})`);
  debe((await llamadasDe("pty_send")).length === 1, "sin panel no se teclea en ninguna terminal");
  await page.waitForTimeout(300);
  debe(await tab.locator(".tab-count").count() === 0, "sin pendientes no hay cuenta");

  // 8b. Sin nada pendiente no se abre ninguna sola: lo dice, con Adeo.
  await page.reload();
  await tab.waitFor({ timeout: 15000 });
  await page.evaluate(() => { for (const x of window.__dec) if (!x.respuesta) x.descartada ??= Date.now(); window.__emitir("decisiones:cambian"); });
  await tab.click();
  await page.waitForSelector(".dec-calma");
  debe(await page.locator(".dec-abierta").count() === 0 && /Nada te toca ahora/.test(await page.locator(".dec-calma").textContent()), "con nada pendiente, la calma");
  debe(await page.locator(".dec-calma .mascota, .dec-calma svg, .dec-calma canvas").count() > 0, "y Adeo en ella");
  await page.screenshot({ path: `${CAPTURAS}/dec-calma.png` });

  // 9. Una nueva del MCP sube la cuenta sin recargar.
  const ARR = await page.evaluate(() => window.__dec[0].arranque);
  await page.evaluate((arranque) => {
    window.__dec.push({ id: "d19a2b3c4d02", titulo: "Una nueva", panel: 3, arranque, creada: Date.now(), preguntas: [{ id: "A", titulo: "¿Sí?", opciones: [{ texto: "Sí", recomendada: false }, { texto: "No", recomendada: false }] }] });
    window.__emitir("decisiones:cambian");
  }, ARR);
  await page.waitForTimeout(300);
  debe((await tab.locator(".tab-count").textContent()) === "1", "una nueva sube la cuenta");

  // 9b. Escribirle una frase a su terminal la da por hablada; un Intro a secas no.
  //     Lo que teclea Munir llega por `lib/hablada` desde el onData de xterm,
  //     que aquí no hay: se llama a lo mismo que llama él.
  const teclear = (datos) => page.evaluate(async (d) => {
    const h = await import("/src/lib/hablada.ts");
    const dec = await import("/src/lib/decisiones.ts");
    if (h.mandoUnaFrase(3, d, false)) dec.hablarCon(3);
  }, datos);
  await teclear("\r");
  await page.waitForTimeout(300);
  debe((await llamadasDe("decisiones_habladas")).length === 0, "un Intro a secas no la cierra");
  for (const c of "vale, la 1") await teclear(c);
  await teclear("\r");
  await page.waitForTimeout(500);
  debe((await llamadasDe("decisiones_habladas")).map((a) => a.panel).join() === "3", "una frase en el panel 3 la da por hablada");
  debe(await tab.locator(".tab-count").count() === 0, "y la cuenta vuelve a cero sola");
  await page.locator(".dec-fila", { hasText: "Una nueva" }).click();
  debe(/La hablaste con el agente/.test(await page.locator(".dec-vigencia").textContent()), "la abierta dice que la hablaste");
  debe(/^Hablada/.test(await page.locator(".dec-fila", { hasText: "Una nueva" }).textContent()), "y su fila empieza por «Hablada»");

  // 11. La lista única (A1, 2026-11-15): lo que te toca, lo que terminó y las
  //     ideas de tus agentes, como un correo. Una terminal que te espera, una
  //     decisión viva y un encargo que el freno paró cuentan en la pestaña; el
  //     turno acabado y las ideas, no.
  await page.evaluate(async (arranque) => {
    const op = (texto, extra = {}) => ({ texto, recomendada: false, ...extra });
    window.__dec.push({
      id: "d19a2b3c4d03", titulo: "Qué color lleva el botón", proyecto: "Adeorq", panel: 3, arranque, creada: Date.now() - 60_000,
      preguntas: [
        { id: "A", titulo: "El color", opciones: [op("Azul", { recomendada: true, detalle: "El acento de la casa." }), op("Verde")] },
        { id: "B", titulo: "El borde", opciones: [op("Con borde"), op("Sin borde")] },
      ],
    });
    window.__notas = [
      { line: 4, kind: "idea", project: "Adeorq", text: "Que la Agenda enseñe la semana entera" },
      { line: 7, kind: "paso", project: "Adeorq", text: "Probar el arranque en un Windows limpio" },
    ];
    window.__programados = [{
      id: "noche", nombre: "Repaso de la noche", encargo: "Repasa lo de ayer", cwd: "C:/proyectos/Adeorq", cli: "claude",
      cuando: { tipo: "diario", hora: "03:00" }, activo: true, creado: 0, ultima: 0, ultimoDia: "", corrida: null, ultimas: [],
      fallosSeguidos: 3, cortado: { cuando: Date.now() - 3_600_000, motivo: "La terminal se cerró sin terminar." },
    }];
    const { useAvisos } = await import("/src/lib/campana.ts");
    useAvisos.setState({ lista: [
      { n: 901, paneId: 3, nombre: "Adeorq · la barra", cwd: "C:/proyectos/Adeorq", tipo: "espera", porque: "hay un menú en pantalla", cuando: Date.now() - 120_000, leido: false },
      { n: 902, paneId: 5, nombre: "VoCript · dictado", cwd: "C:/proyectos/VoCript", tipo: "hecho", porque: "", cuando: Date.now() - 300_000, leido: false },
    ] });
    window.__emitir("decisiones:cambian");
    window.__emitir("programados:cambian");
  }, ARR);
  await page.locator('button.tab[data-tab="panel"]').click();
  await page.waitForTimeout(300);
  await tab.click();
  await page.waitForSelector(".dec-parte[data-parte=ideas]");
  await page.waitForTimeout(300);
  debe((await tab.locator(".tab-count").textContent()) === "3", `la pestaña cuenta lo que te toca: 3 (${await tab.locator(".tab-count").textContent()})`);
  const partes = await page.locator(".dec-lista-eti").allTextContents();
  debe(partes.join() === "Te toca,Terminó,Ideas de tus agentes,Ya pasó", `las cuatro partes en su orden (${partes})`);
  const palabras = await page.locator(".dec-parte[data-parte=toca] .dec-palabra").allTextContents();
  debe(palabras.join() === "Contesta,Decide,Parado", `en Te toca, la terminal, la decisión y el encargo (${palabras})`);
  debe(/^Mira/.test(await page.locator(".dec-parte[data-parte=termino] .dec-fila").textContent()), "lo que terminó empieza por «Mira»");
  const ideas = await page.locator(".dec-parte[data-parte=ideas] .dec-fila-titulo").allTextContents();
  debe(ideas.length === 2 && /Probar el arranque/.test(ideas[0]), `las ideas, la última del archivo arriba (${ideas})`);
  debe((await page.locator(".dec-abierta h2").textContent()) === "Adeorq · la barra", "abre la primera que te toca: la terminal que espera");
  debe(await page.locator(".dec-acciones button", { hasText: "Ir a la terminal" }).count() === 1, "y lleva a su terminal");
  const caras = await page.evaluate(() => {
    const est = (sel) => { const e = document.querySelector(sel); const c = e && getComputedStyle(e); return c && { borde: c.borderTopWidth, radio: c.borderTopLeftRadius }; };
    const cuerpo = document.querySelector(".dec-cuerpo").getBoundingClientRect();
    const dec = document.querySelector(".dec").getBoundingClientRect();
    return { lista: est(".dec-lista"), cuerpo: { izq: cuerpo.left - dec.left, der: dec.right - cuerpo.right, abajo: dec.bottom - cuerpo.bottom } };
  });
  debe(caras.lista.borde === "0px" && caras.lista.radio === "0px", `la lista sin recuadro (${JSON.stringify(caras.lista)})`);
  debe(caras.cuerpo.izq === 0 && caras.cuerpo.der === 0 && caras.cuerpo.abajo === 0, `de borde a borde (${JSON.stringify(caras.cuerpo)})`);
  await page.screenshot({ path: `${CAPTURAS}/dec-lista.png` });

  // 12. Con el teclado: J y K, Intro, 1 a 9, Tab, O, Esc por capas y Ctrl+Intro.
  const foco = () => page.evaluate(() => {
    const a = document.activeElement;
    return { id: a?.dataset?.id ?? "", tipo: a?.type ?? a?.tagName, q: a?.closest(".dec-pregunta")?.id.slice(-1) ?? "" };
  });
  debe((await foco()).id === "aviso:3", `al entrar, el foco en la lista (${JSON.stringify(await foco())})`);
  await page.keyboard.press("j");
  debe((await page.locator(".dec-abierta h2").textContent()) === "Qué color lleva el botón", "J baja a la decisión");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  let f = await foco();
  debe(f.tipo === "radio" && f.q === "A", `Intro entra en la primera pregunta (${JSON.stringify(f)})`);
  await page.keyboard.press("1");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  f = await foco();
  debe(f.tipo === "radio" && f.q === "B", `Tab pasa a la pregunta B (${JSON.stringify(f)})`);
  await page.keyboard.press("2");
  await page.waitForTimeout(150);
  const marcadas = await page.evaluate(() => [...document.querySelectorAll(".dec-pregunta")].map((q) => q.querySelector("input:checked")?.closest(".dec-opcion")?.querySelector(".dec-num")?.textContent ?? "-"));
  debe(marcadas.join() === "1,2", `1 en la A y 2 en la B (${marcadas})`);
  debe(!(await boton.isDisabled()), "con las dos, Enviar se enciende");
  await page.keyboard.press("o");
  f = await foco();
  debe(f.tipo === "textarea" && f.q === "B", `O escribe en la pregunta de delante (${JSON.stringify(f)})`);
  await page.keyboard.press("Escape");
  f = await foco();
  debe(f.tipo === "radio" && f.q === "B", `Esc sale de la caja de texto a su pregunta (${JSON.stringify(f)})`);
  await page.keyboard.press("Escape");
  debe((await foco()).id === "dec:d19a2b3c4d03", "otro Esc vuelve a la lista");
  await page.screenshot({ path: `${CAPTURAS}/dec-teclado.png` });
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(100);
  debe((await boton.textContent()) === "Deshacer (5)", `Ctrl+Intro la manda con su cuenta atrás (${await boton.textContent()})`);
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(200);
  debe((await estado.textContent()) === "No se ha mandado." && !(await llamadasDe("decision_responder")).some((a) => a.id === "d19a2b3c4d03"), "y otra vez la deshace");
  await page.keyboard.press("j");
  debe(await page.locator(".dec-acciones button", { hasText: "Abrirlo en la Agenda" }).count() === 1, "el encargo parado lleva a la Agenda");
  await page.keyboard.press("j");
  debe(/VoCript · dictado/.test(await page.locator(".dec-abierta h2").textContent()), "J baja a lo que terminó");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(200);
  debe(await page.locator(".dec-parte[data-parte=termino]").count() === 0, "Retroceso lo quita de la lista");
  debe(/Probar el arranque/.test((await page.locator(".dec-propuesta").textContent()) ?? ""), "y se abre la que ocupa su sitio");
  await page.keyboard.press("k");
  debe((await page.locator(".dec-abierta h2").textContent()) === "Repaso de la noche", "K sube");
  await page.keyboard.press("j");

  // 13. Una idea de un agente: se descarta aquí, y sale de la bandeja.
  await page.locator(".dec-acciones button", { hasText: "Descartar" }).click();
  await page.waitForTimeout(400);
  debe((await llamadasDe("drop_inbox")).map((a) => a.line).join() === "7", "Descartar la borra de la bandeja (su línea)");
  debe(await page.locator(".dec-parte[data-parte=ideas] .dec-fila").count() === 1, "y deja la otra");
  debe(/Descartada/.test((await page.locator(".dec-dicho").textContent()) ?? ""), "y lo dice");

  // 14. La chuleta, y Esc que te devuelve; Ctrl+Mayús+B y la campana te traen.
  await page.keyboard.press("?");
  debe(await page.locator(".dec-teclas").count() === 1, "? abre la chuleta de las teclas");
  await page.screenshot({ path: `${CAPTURAS}/dec-chuleta.png` });
  await page.keyboard.press("Escape");
  debe(await page.locator(".dec-teclas").count() === 0, "Esc la cierra");
  await page.locator(".dec-fila").first().focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  debe(await page.locator(".dec").count() === 0, "Esc en la lista vuelve adonde estabas");
  await page.keyboard.press("Control+Shift+B");
  await page.waitForTimeout(400);
  debe(await page.locator(".dec").count() === 1, "Ctrl+Mayús+B abre Decisiones");
  await page.locator('button.tab[data-tab="panel"]').click();
  await page.waitForTimeout(300);
  await page.locator(".campana").click();
  await page.waitForTimeout(200);
  debe((await page.locator(".avisos-pie").textContent()) === "Abrir Decisiones", "el último renglón de la campana");
  await page.locator(".avisos-pie").click();
  await page.waitForTimeout(400);
  debe(await page.locator(".dec").count() === 1 && await page.locator(".avisos").count() === 0, "lleva a Decisiones y cierra la lista");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  await page.locator(".dec-fila", { hasText: "Qué color lleva el botón" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${CAPTURAS}/dec-1920.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  // 10. En inglés.
  await page.evaluate(() => sessionStorage.setItem("__lang", "en"));
  await page.reload();
  await tab.waitFor({ timeout: 15000 });
  // La pestaña ya no lleva texto (cabecera solo de iconos): el nombre va en su etiqueta.
  debe((await tab.getAttribute("aria-label")) === "Decisions", `en inglés (${await tab.getAttribute("aria-label")})`);
  await tab.click();
  await page.waitForSelector(".dec-abierta");
  const en = await page.evaluate(() => ({ eti: [...document.querySelectorAll(".dec-lista-eti")].map((x) => x.textContent), botones: [...document.querySelectorAll(".dec-pie-botones button")].map((b) => b.textContent), palabra: document.querySelector(".dec-palabra")?.textContent }));
  // Recargar deja la casa como al principio: vuelven las vivas y la que nadie espera.
  debe(en.eti.join() === "Your turn,Past" && en.botones.join() === "Discard,Send answer" && en.palabra === "Decide", `la vista en inglés (${JSON.stringify(en)})`);
  await page.evaluate(() => sessionStorage.removeItem("__lang"));

  return { fallos };
}
