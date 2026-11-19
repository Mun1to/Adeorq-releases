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
// la bandeja (por lo que dice, no por su renglón); ? enseña las teclas; Esc te
// devuelve adonde estabas, y Ctrl+Mayús+B y el último renglón de la campana te
// traen. Y desde el 2026-11-16, un plan de Adeo que cerraste sin contestar va en
// «Te toca» («Aprueba»), se abre en Adeo tal como estaba y vuelve si lo cierras.
// Y ese mismo día (P2 de la A1), H pospone lo marcado (vuelve a la hora que digas,
// con una tecla o escrita, o antes si el agente dice algo nuevo) y U lo marca
// como visto o no visto: parte 16, con una casa limpia y una vuelta. Y el botón
// «Posponer» para el ratón (parte 17) y los arreglos de la revisión aparte de
// 09f58881 (partes 18 a 23): el menú no se come teclas ajenas ni se queda con
// otra fila, solo queda visto lo que se te pone delante con la ventana a la vista,
// Adeo no cuenta lo pospuesto, lo pospuesto vuelve sin ver y un localStorage roto
// no deja la app en blanco. Termina con una decisión abierta para los detectores:
//
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/decisiones-escritorio.js scripts/laboratorio/carceles.js scripts/laboratorio/mayusculas.js
//
// El MCP de Playwright solo lee archivos de su carpeta: cópialo antes a
// %LOCALAPPDATA%\Adeorq\navegador-agentes\.playwright-mcp y lánzalo desde ahí.
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
        // Como `quitar_nota`: la que dice eso, no la que caiga en su renglón.
        case "drop_inbox": {
          const i = (window.__notas ?? []).findIndex((n) => (args.text ? n.text === args.text && n.project === args.project : n.line === args.line));
          if (i < 0) throw "Esa nota ya no está en la bandeja: se quitó desde otro sitio.";
          window.__notas.splice(i, 1);
          return null;
        }
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
        // Como `decision_imagen`: por el id y el número, en binario.
        case "decision_imagen": {
          const b = window.__fotosDec?.[`${args.id}:${args.n}`];
          if (!b) throw "Esa imagen ya no está.";
          return b.slice(0);
        }
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
  const cuenta = await tab.locator(".tab-count").evaluate((x) => ({
    n: x.textContent,
    teToca: x.dataset.teToca,
    opacidad: getComputedStyle(x).opacity,
  }));
  debe(cuenta.n === "2" && cuenta.teToca === "true", `la pestaña cuenta 2 en ámbar (${JSON.stringify(cuenta)})`);
  debe(cuenta.opacidad === "1", `la cuenta no sale apagada como si cargara (${cuenta.opacidad})`);

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
  debe((await llamadasDe("drop_inbox")).map((a) => `${a.line}:${a.text ? "con lo que dice" : "sin texto"}`).join() === "7:con lo que dice", "Descartar la borra de la bandeja (por lo que dice)");
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

  // 15. Un plan de Adeo que cerraste sin contestar (`lib/planPendiente.ts`): va
  // en «Te toca», se abre en Adeo, que lo recoge, y cerrarlo otra vez lo devuelve.
  await page.evaluate(async () => {
    window.__abrioAdeo = 0;
    window.addEventListener("adeorq:abrir-adeo", () => window.__abrioAdeo++);
    const m = await import("/src/lib/planPendiente.ts");
    m.dejarPlan({
      plan: {
        resumen: "Repasar la guía y revisar lo hecho",
        acciones: [
          { tipo: "claude_nuevo", proyecto: "Adeorq", motivo: "repasar la guía de la web" },
          { tipo: "revisar", proyecto: "Adeorq", motivo: "revisar lo de la otra terminal" },
        ],
      },
      pedido: "repasa la guía",
      espejo: {},
      cuando: Date.now(),
    });
  });
  await page.waitForTimeout(300);
  const filaPlan = page.locator(".dec-fila[data-clase=plan]");
  debe(await filaPlan.count() === 1 && /^Aprueba/.test(((await filaPlan.textContent()) ?? "").trim()), `el plan sin contestar sale en Te toca, con «Aprueba» (${await filaPlan.textContent().catch(() => "")})`);
  await filaPlan.click();
  await page.waitForTimeout(200);
  debe(await page.locator(".dec-plan li").count() === 2, "su detalle dice sus dos acciones");
  await page.screenshot({ path: `${CAPTURAS}/dec-plan.png` });
  await page.locator(".dec-acciones button", { hasText: "Abrirlo en Adeo" }).click();
  await page.waitForTimeout(800);
  debe(await page.evaluate(() => window.__abrioAdeo) === 1, "«Abrirlo en Adeo» lo pide");
  debe(await page.locator(".dec-fila[data-clase=plan]").count() === 0, "Adeo lo recoge: sale de Decisiones");
  const enAdeo = await page.evaluate(() => document.body.innerText.includes("repasar la guía de la web"));
  debe(enAdeo, "y Adeo lo enseña como estaba");
  await page.screenshot({ path: `${CAPTURAS}/dec-plan-en-adeo.png` });
  await page.keyboard.press("Control+Shift+A");
  await page.waitForTimeout(600);
  debe(await page.locator(".dec-fila[data-clase=plan]").count() === 1, "cerrar Adeo sin contestar lo devuelve a Te toca");
  await page.locator(".dec-fila[data-clase=plan]").click();
  await page.locator(".dec-acciones button", { hasText: "Tirarlo" }).click();
  await page.waitForTimeout(200);
  debe(await page.locator(".dec-fila[data-clase=plan]").count() === 0, "«Tirarlo» lo quita");

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
  debe(en.eti.join() === "Your turn,Past" && en.botones.join() === "Discard,Snooze,Send answer" && en.palabra === "Decide", `la vista en inglés (${JSON.stringify(en)})`);
  await page.evaluate(() => sessionStorage.removeItem("__lang"));

  // 16. Posponer (H) y marcar como vista (U), P2 de la A1 (2026-11-16). Casa
  //     limpia, en español: dos decisiones vivas, una terminal que te espera, una
  //     que terminó y una idea. Cada paso va en su `paso`: si algo no existe, sale
  //     como un fallo con su nombre y el banco sigue, sin colgarse esperando.
  await page.reload();
  await tab.waitFor({ timeout: 15000 });
  page.setDefaultTimeout(3000);
  const paso = async (nombre, fn) => {
    try { await fn(); } catch (e) { fallos.push(`${nombre}: ${String(e.message ?? e).split("\n")[0]}`); }
  };
  const poner = () => page.evaluate(async () => {
    window.__notas = [{ line: 4, kind: "idea", project: "Adeorq", text: "Que la Agenda enseñe la semana entera" }];
    const { useAvisos } = await import("/src/lib/campana.ts");
    useAvisos.setState({ lista: [
      { n: 901, paneId: 3, nombre: "Adeorq · la barra", cwd: "C:/proyectos/Adeorq", tipo: "espera", porque: "hay un menú en pantalla", cuando: Date.now() - 120_000, leido: false },
      { n: 902, paneId: 5, nombre: "VoCript · dictado", cwd: "C:/proyectos/VoCript", tipo: "hecho", porque: "", cuando: Date.now() - 300_000, leido: false },
    ] });
  });
  await poner();
  await page.waitForTimeout(300);
  const cuentaTab = async () => ((await tab.locator(".tab-count").count()) ? await tab.locator(".tab-count").textContent() : "0");
  const sitio = () => page.locator(".dec-fila").evaluateAll((fs) => fs.map((f) => `${f.closest(".dec-parte")?.dataset.parte}:${f.dataset.id}`));
  const nuevas = () => page.locator(".dec-fila[data-nueva=true]").count();
  const abierta = () => page.locator(".dec-fila[data-on=true]").first().getAttribute("data-id");
  const guardado = () => page.evaluate(() => JSON.parse(localStorage.getItem("adeorq-decisiones-reposo") || "{}"));
  await tab.click();
  await page.waitForSelector(".dec-fila");
  await page.waitForTimeout(300);

  await paso("16a: al entrar, lo que ves ya está visto y lo demás es nuevo", async () => {
    debe(await cuentaTab() === "3", `la pestaña cuenta 3 (${await cuentaTab()})`);
    debe((await abierta()) === "aviso:3", `se abre la terminal que espera (${await abierta()})`);
    debe(await page.locator(".dec-fila[data-id='aviso:3']").getAttribute("data-nueva") === "false", "la que se abre sola ya está vista");
    debe(await nuevas() === 4, `las otras cuatro (dos decisiones, lo que terminó y la idea) son nuevas (${await nuevas()})`);
    debe(await page.locator(".dec-fila[data-clase=pasada][data-nueva=true]").count() === 0, "lo que ya pasó no es nuevo ni deja de serlo");
  });

  await paso("16b: J abre y marca como vista; U la devuelve a nueva y otra vez a vista", async () => {
    await page.keyboard.press("j");
    debe((await abierta()) === "dec:d19a2b3c4d01", `J baja a la primera decisión (${await abierta()})`);
    debe(await nuevas() === 3, `al abrirla se queda vista (${await nuevas()} nuevas)`);
    await page.keyboard.press("u");
    debe(await nuevas() === 4 && (await page.locator(".dec-fila[data-on=true]").getAttribute("data-nueva")) === "true", "U la marca como no vista, sin que se vuelva a marcar sola");
    await page.waitForTimeout(500);
    debe(await nuevas() === 4, "y sigue sin vista pasado un rato");
    await page.keyboard.press("u");
    debe(await nuevas() === 3, "otra U y vuelve a vista");
    await page.keyboard.press("u");
    await page.keyboard.press("k");
    debe((await abierta()) === "aviso:3" && await nuevas() === 4, "irte la deja sin ver, como la dejaste");
    await page.keyboard.press("j");
    debe(await nuevas() === 3, "y volver a ella la ve");
    await page.keyboard.press("k");
  });

  await paso("16c: lo visto se guarda", async () => {
    const g = await guardado();
    debe(g.vistas && Object.keys(g.vistas).includes("aviso:3") && Object.keys(g.vistas).includes("dec:d19a2b3c4d01"), `lo visto va a localStorage (${JSON.stringify(g)})`);
  });

  await paso("16d: H abre el menú, con sus cuatro plazos y «otra hora»; Esc lo cierra sin posponer nada", async () => {
    await page.keyboard.press("h");
    debe(await page.locator(".dec-posponer").count() === 1, "H abre el menú de posponer");
    const ops = await page.locator(".dec-posponer-op").allTextContents();
    debe(ops.length === 5 && /^1.*En una hora/.test(ops[0]) && /^2.*En tres horas/.test(ops[1]) && /^3.*Mañana a las 9:00/.test(ops[2]) && /^4.*semana/.test(ops[3]) && /^O.*Otra hora/.test(ops[4]), `cuatro plazos y otra hora (${ops.join(" | ")})`);
    debe(/antes si el agente dice algo nuevo/.test(await page.locator(".dec-posponer").textContent()), "el menú dice que vuelve antes si el agente habla");
    await page.screenshot({ path: `${CAPTURAS}/dec-posponer.png` });
    await page.keyboard.press("j");
    debe((await abierta()) === "aviso:3", "con el menú abierto, J no mueve la lista");
    await page.keyboard.press("Escape");
    debe(await page.locator(".dec-posponer").count() === 0 && (await abierta()) === "aviso:3" && await cuentaTab() === "3", "Esc lo cierra y no se pospone nada");
    debe(Object.keys((await guardado()).pospuestas ?? {}).length === 0, "ni se guarda nada");
  });

  await paso("16e: la 1 pospone una hora: sale de «Te toca», baja a «Pospuesto», pasa a la siguiente y baja la pestaña", async () => {
    await page.keyboard.press("h");
    await page.keyboard.press("1");
    await page.waitForTimeout(300);
    debe(await page.locator(".dec-posponer").count() === 0, "el menú se cierra");
    const donde = await sitio();
    debe(donde.join() === "toca:dec:d19a2b3c4d01,toca:dec:d19a2b3c4d00,termino:aviso:5,ideas:nota:idea|Adeorq|Que la Agenda enseñe la semana entera,pospuesto:aviso:3,pasado:dec:d19a2b3c4c00,pasado:dec:d19a2b3c4b00", `la pospuesta, en su parte (${donde.join(" ")})`);
    debe((await page.locator(".dec-lista-eti").allTextContents()).join() === "Te toca,Terminó,Ideas de tus agentes,Pospuesto,Ya pasó", "con su título entre las ideas y lo que ya pasó");
    debe(await cuentaTab() === "2", `la pestaña baja a 2 (${await cuentaTab()})`);
    debe((await abierta()) === "dec:d19a2b3c4d01", `se abre la siguiente que te toca (${await abierta()})`);
    const de = await page.locator(".dec-fila[data-id='aviso:3'] .dec-fila-de").textContent();
    debe(/^Adeorq.*Vuelve a las \d{1,2}:\d\d$/.test(de), `su fila dice cuándo vuelve (${de})`);
    debe(await page.locator(".dec-dicho").count() === 0, "sin frase de confirmación: ya se ve hecho");
    const g = (await guardado()).pospuestas?.["aviso:3"];
    debe(g && Math.abs(g.hasta - Date.now() - 3_600_000) < 60_000, `se guarda para dentro de una hora (${JSON.stringify(g)})`);
    await page.screenshot({ path: `${CAPTURAS}/dec-pospuestas.png` });
  });

  await paso("16f: si el agente dice algo nuevo, vuelve antes de su hora", async () => {
    await page.evaluate(async () => {
      const { useAvisos } = await import("/src/lib/campana.ts");
      const l = useAvisos.getState().lista;
      useAvisos.setState({ lista: l.map((a) => (a.paneId === 3 ? { ...a, cuando: Date.now(), n: a.n + 10 } : a)) });
    });
    await page.waitForTimeout(300);
    debe((await sitio()).includes("toca:aviso:3") && await cuentaTab() === "3", `vuelve a «Te toca» y la pestaña sube (${(await sitio()).join(" ")})`);
    debe(await page.locator(".dec-fila[data-id='aviso:3']").getAttribute("data-nueva") === "true", "y vuelve como nueva");
  });

  await paso("16g: «otra hora»: una mal escrita no se acepta, una buena sí", async () => {
    await page.locator(".dec-fila[data-id='aviso:3']").click();
    await page.keyboard.press("h");
    await page.keyboard.press("o");
    debe(await page.locator(".dec-hora").count() === 1 && await page.evaluate(() => document.activeElement?.className === "dec-hora"), "O pide la hora, con el foco en la caja");
    await page.keyboard.type("esto no");
    await page.keyboard.press("Enter");
    debe(/No entiendo esa hora/.test((await page.locator(".dec-posponer").textContent()) ?? "") && await page.locator(".dec-posponer").count() === 1, "una hora que no es hora se dice y no se cierra");
    await page.keyboard.press("Escape");
    debe(await page.locator(".dec-hora").count() === 0 && await page.locator(".dec-posponer").count() === 1, "Esc sale de la caja y deja el menú");
    await page.keyboard.press("o");
    await page.keyboard.type("+90");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const g = (await guardado()).pospuestas?.["aviso:3"];
    debe(g && Math.abs(g.hasta - Date.now() - 90 * 60_000) < 60_000, `«+90» son noventa minutos (${JSON.stringify(g)})`);
    debe((await sitio()).includes("pospuesto:aviso:3"), "y queda pospuesta");
  });

  await paso("16h: H en una pospuesta la trae de vuelta", async () => {
    await page.locator(".dec-fila[data-id='aviso:3']").click();
    await page.keyboard.press("h");
    await page.waitForTimeout(200);
    debe(await page.locator(".dec-posponer").count() === 0, "no abre el menú: ya está pospuesta");
    debe((await sitio()).includes("toca:aviso:3") && await cuentaTab() === "3", "vuelve a su sitio");
    debe(await page.locator(".dec-dicho").count() === 0, "sin frase de confirmación");
    debe(Object.keys((await guardado()).pospuestas ?? {}).length === 0, "y se borra de lo guardado");
  });

  await paso("16i: lo que ya pasó no se pospone", async () => {
    await page.locator(".dec-fila[data-clase=pasada]").first().click();
    await page.keyboard.press("h");
    debe(await page.locator(".dec-posponer").count() === 0, "H no hace nada con lo que ya pasó");
    await page.keyboard.press("u");
    debe(await page.locator(".dec-fila[data-clase=pasada][data-nueva=true]").count() === 0, "ni U");
  });

  await paso("16j: a su hora vuelve sola, sin tocar nada", async () => {
    await page.evaluate(async () => {
      const m = await import("/src/lib/decisiones.ts");
      const d = window.__dec.find((x) => x.id === "d19a2b3c4d00");
      m.useReposo.getState().posponer({ id: "dec:d19a2b3c4d00", cuando: d.creada }, Date.now() + 1500);
    });
    await page.waitForTimeout(250);
    debe((await sitio()).includes("pospuesto:dec:d19a2b3c4d00") && await cuentaTab() === "2", `se aparta (${(await sitio()).join(" ")})`);
    await page.waitForTimeout(2200);
    debe((await sitio()).includes("toca:dec:d19a2b3c4d00") && await cuentaTab() === "3", `y a su hora vuelve y la pestaña sube (${(await sitio()).join(" ")}, ${await cuentaTab()})`);
  });

  await paso("16k: la chuleta cuenta H y U", async () => {
    await page.keyboard.press("?");
    const teclas = await page.locator(".dec-teclas dt").allTextContents();
    debe(teclas.includes("H") && teclas.includes("U"), `la chuleta lleva H y U (${teclas.join(" | ")})`);
    await page.keyboard.press("Escape");
  });

  // Con la idea, que tiene el mismo nombre y la misma hora al recargar: las
  // decisiones del doble se vuelven a fechar en cada carga y no valen para esto.
  await paso("16l: lo pospuesto sobrevive a recargar", async () => {
    await page.locator(".dec-fila[data-clase=idea]").click();
    debe(Object.keys((await guardado()).vistas ?? {}).some((k) => k.startsWith("nota:idea|")), "abrir la idea la deja vista y guardada");
    await page.keyboard.press("h");
    await page.keyboard.press("3");
    await page.waitForTimeout(300);
    debe((await sitio()).some((s) => s.startsWith("pospuesto:nota:")), "la idea queda pospuesta para mañana");
    await page.evaluate(() => sessionStorage.setItem("__guardar", "1"));
    await page.reload();
    await tab.waitFor({ timeout: 15000 });
    await poner();
    await tab.click();
    await page.waitForSelector(".dec-fila");
    await page.waitForTimeout(300);
    const de = await page.locator(".dec-fila[data-clase=idea] .dec-fila-de").textContent();
    debe((await sitio()).some((s) => s.startsWith("pospuesto:nota:")) && /Vuelve mañana a las 9:00$/.test(de), `tras recargar sigue pospuesta (${de})`);
    await page.screenshot({ path: `${CAPTURAS}/dec-pospuesta-recargada.png` });
    await page.evaluate(() => sessionStorage.removeItem("__guardar"));
  });

  /** Recarga con la casa limpia, pone las dos terminales y la idea de la parte 16,
      hace `antes` (en la página) y entra en Decisiones. */
  const casaLimpia = async (antes) => {
    await page.reload();
    await tab.waitFor({ timeout: 15000 });
    await poner();
    if (antes) await page.evaluate(antes);
    await tab.click();
    await page.waitForSelector(".dec-fila");
    await page.waitForTimeout(300);
  };
  const ningunaPospuesta = async () => Object.keys((await guardado()).pospuestas ?? {}).length === 0;
  const botonPosponer = () => page.locator(".dec-doc button", { hasText: /^(Posponer|Traer de vuelta)$/ });
  /** Dónde sale el menú respecto al botón «Posponer» que lo abrió. */
  const junto = () => page.evaluate(() => {
    const m = document.querySelector(".dec-posponer")?.getBoundingClientRect();
    const b = [...document.querySelectorAll(".dec-doc button")].find((x) => x.textContent === "Posponer")?.getBoundingClientRect();
    const dec = document.querySelector(".dec").getBoundingClientRect();
    const barra = document.querySelector(".dec-barra")?.getBoundingClientRect();
    if (!m || !b) return null;
    return {
      hueco: Math.round(m.top >= b.bottom ? m.top - b.bottom : b.top - m.bottom),
      dentro: m.left >= dec.left && m.right <= dec.right && m.top >= dec.top && m.bottom <= dec.bottom,
      tapaLaBarra: barra ? m.bottom > barra.top && m.top < barra.bottom : false,
      pisaElBoton: m.left < b.right && m.right > b.left && m.top < b.bottom && m.bottom > b.top,
    };
  });

  // 17. El botón «Posponer», para el ratón (Munir, 2026-11-16: «sí, pon el botón
  //     Posponer para el ratón»): el mismo menú de H, saliendo de al lado del botón,
  //     y en una pospuesta «Traer de vuelta». En todas las clases que admiten H.
  await casaLimpia();
  await paso("17a: en una terminal que te espera, «Posponer» abre el menú de H junto al botón", async () => {
    debe((await abierta()) === "aviso:3", `se abre la terminal que espera (${await abierta()})`);
    const textos = await page.locator(".dec-doc .dec-acciones button").allTextContents();
    debe(textos.join() === "Ir a la terminal,Posponer", `sus botones (${textos.join(" | ")})`);
    await botonPosponer().click();
    debe(await page.locator(".dec-posponer").count() === 1, "abre el menú");
    const j = await junto();
    debe(j && j.dentro && !j.pisaElBoton && j.hueco >= 0 && j.hueco <= 32, `el menú sale junto al botón (${JSON.stringify(j)})`);
    await page.screenshot({ path: `${CAPTURAS}/dec-posponer-boton-terminal.png` });
    await page.locator(".dec-posponer-op", { hasText: "En una hora" }).click();
    await page.waitForTimeout(300);
    debe((await sitio()).includes("pospuesto:aviso:3") && (await abierta()) === "dec:d19a2b3c4d01", `pospone y pasa a la siguiente (${(await sitio()).join(" ")})`);
  });
  await paso("17b: en una pospuesta dice «Traer de vuelta», y la trae sin menú", async () => {
    await page.locator(".dec-fila[data-id='aviso:3']").click();
    debe((await botonPosponer().allTextContents()).join() === "Traer de vuelta", `el botón cambia de nombre (${(await botonPosponer().allTextContents()).join()})`);
    await botonPosponer().click();
    await page.waitForTimeout(200);
    debe(await page.locator(".dec-posponer").count() === 0 && (await sitio()).includes("toca:aviso:3") && await ningunaPospuesta(), "vuelve a su sitio, sin menú");
    debe((await botonPosponer().allTextContents()).join() === "Posponer", "y el botón vuelve a decir «Posponer»");
  });
  await paso("17c: en una decisión, en la barra del pie entre «Descartar» y «Enviar»; el menú sale encima sin tapar la barra", async () => {
    await page.locator(".dec-fila[data-id='dec:d19a2b3c4d01']").click();
    const pie = await page.locator(".dec-pie-botones button").allTextContents();
    debe(pie.join() === "Descartar,Posponer,Enviar respuesta", `los botones del pie (${pie.join(" | ")})`);
    await botonPosponer().click();
    const j = await junto();
    debe(j && j.dentro && !j.tapaLaBarra && !j.pisaElBoton && j.hueco >= 0 && j.hueco <= 40, `el menú, encima del pie (${JSON.stringify(j)})`);
    await page.screenshot({ path: `${CAPTURAS}/dec-posponer-boton-decision.png` });
    await page.locator(".dec-posponer button", { hasText: "Cancelar" }).click();
    debe(await page.locator(".dec-posponer").count() === 0 && await ningunaPospuesta(), "«Cancelar» no pospone nada");
    await botonPosponer().click();
    await page.keyboard.press("2");
    await page.waitForTimeout(300);
    debe((await sitio()).includes("pospuesto:dec:d19a2b3c4d01"), "abierto con el ratón, las teclas del menú siguen valiendo");
    await botonPosponer().click();
  });
  await paso("17d: en una idea también, y Esc cierra el menú abierto con el ratón", async () => {
    await page.locator(".dec-fila[data-clase=idea]").click();
    const textos = await page.locator(".dec-doc .dec-acciones button").allTextContents();
    debe(textos.join() === "Aceptar,Posponer,Descartar", `sus botones (${textos.join(" | ")})`);
    await botonPosponer().click();
    await page.keyboard.press("Escape");
    debe(await page.locator(".dec-posponer").count() === 0 && (await sitio()).some((s) => s.startsWith("ideas:")), "Esc lo cierra y no pospone nada");
  });
  await paso("17e: en lo que terminó, en un plan y en un encargo parado también; en lo que ya pasó, no", async () => {
    await page.locator(".dec-fila[data-id='aviso:5']").click();
    const mira = await page.locator(".dec-doc .dec-acciones button").allTextContents();
    debe(mira.join() === "Ir a la terminal,Posponer,Quitar de la lista", `lo que terminó (${mira.join(" | ")})`);
    await page.evaluate(async () => {
      window.__programados = [{
        id: "noche", nombre: "Repaso de la noche", encargo: "Repasa lo de ayer", cwd: "C:/proyectos/Adeorq", cli: "claude",
        cuando: { tipo: "diario", hora: "03:00" }, activo: true, creado: 0, ultima: 0, ultimoDia: "", corrida: null, ultimas: [],
        fallosSeguidos: 3, cortado: { cuando: Date.now() - 3_600_000, motivo: "La terminal se cerró sin terminar." },
      }];
      window.__emitir("programados:cambian");
      const m = await import("/src/lib/planPendiente.ts");
      m.dejarPlan({ plan: { resumen: "Repasar la guía", acciones: [{ tipo: "revisar", proyecto: "Adeorq", motivo: "repasar la guía" }] }, pedido: "repasa la guía", espejo: {}, cuando: Date.now() });
    });
    await page.waitForTimeout(400);
    await page.locator(".dec-fila[data-clase=plan]").click();
    const plan = await page.locator(".dec-doc .dec-acciones button").allTextContents();
    debe(plan.join() === "Abrirlo en Adeo,Posponer,Tirarlo", `un plan de Adeo (${plan.join(" | ")})`);
    await page.locator(".dec-fila[data-clase=parado]").click();
    const parado = await page.locator(".dec-doc .dec-acciones button").allTextContents();
    debe(parado.join() === "Abrirlo en la Agenda,Posponer", `un encargo parado (${parado.join(" | ")})`);
    await page.locator(".dec-fila[data-clase=pasada]").first().click();
    debe(await botonPosponer().count() === 0, "lo que ya pasó no lleva botón");
  });

  // 18. Con el menú de H abierto, las teclas que no son suyas no se las come
  //     (revisión aparte de 09f58881, hallazgo 2).
  await casaLimpia();
  await paso("18a: un clic en «otra cosa» cierra el menú, y lo tecleado va entero a la caja", async () => {
    await page.locator(".dec-fila[data-id='dec:d19a2b3c4d01']").click();
    await page.keyboard.press("h");
    debe(await page.locator(".dec-posponer").count() === 1, "H abre el menú");
    const caja = page.locator(".dec-pregunta textarea").first();
    await caja.click();
    await page.keyboard.type("1 cosa");
    debe(await page.locator(".dec-posponer").count() === 0, "el clic fuera cierra el menú");
    debe((await caja.inputValue()) === "1 cosa", `la caja tiene lo tecleado entero (${await caja.inputValue()})`);
    debe((await sitio()).includes("toca:dec:d19a2b3c4d01") && await ningunaPospuesta(), "y el «1» no pospone nada");
  });
  await paso("18b: en «otra hora», Tab hasta «Cancelar» e Intro cancela, no pospone", async () => {
    await page.locator(".dec-fila[data-id='dec:d19a2b3c4d01']").focus();
    await page.keyboard.press("h");
    await page.keyboard.press("o");
    await page.keyboard.type("16:30");
    await page.keyboard.press("Tab");
    const foco = await page.evaluate(() => document.activeElement?.textContent);
    debe(foco === "Cancelar", `Tab lleva a «Cancelar» (${foco})`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    debe(await page.locator(".dec-posponer").count() === 0, "Intro sobre «Cancelar» cierra el menú");
    debe(await ningunaPospuesta() && (await sitio()).includes("toca:dec:d19a2b3c4d01"), "y no pospone nada");
  });
  await paso("18c: Ctrl+1 no es el 1 del menú", async () => {
    await page.locator(".dec-fila[data-id='dec:d19a2b3c4d01']").focus();
    await page.keyboard.press("h");
    await page.keyboard.press("Control+1");
    await page.waitForTimeout(200);
    debe(await ningunaPospuesta(), "Ctrl+1 no pospone");
    await page.keyboard.press("Escape");
    debe(await page.locator(".dec-posponer").count() === 0, "y Esc cierra el menú");
  });

  // 19. El menú es de la fila con la que se abrió (hallazgo 3).
  await paso("19a: si su fila sale de la lista, el menú se cierra y no pospone a la vecina", async () => {
    await page.locator(".dec-fila[data-id='aviso:5']").click();
    await page.keyboard.press("h");
    debe(/VoCript · dictado/.test(await page.locator(".dec-posponer").textContent()), "el menú es de lo que terminó");
    await page.evaluate(async () => {
      const { useAvisos } = await import("/src/lib/campana.ts");
      useAvisos.setState({ lista: useAvisos.getState().lista.filter((a) => a.paneId !== 5) });
    });
    await page.waitForTimeout(200);
    debe(await page.locator(".dec-posponer").count() === 0, `el menú se va con su fila (${await page.locator(".dec-posponer").textContent().catch(() => "")})`);
    await page.keyboard.press("1");
    await page.waitForTimeout(200);
    debe(await ningunaPospuesta(), "y el «1» no pospone a la vecina");
  });
  await paso("19b: y no vuelve solo cuando llega otra fila", async () => {
    await page.evaluate(async () => {
      const { useAvisos } = await import("/src/lib/campana.ts");
      useAvisos.setState({ lista: [...useAvisos.getState().lista, { n: 950, paneId: 9, nombre: "Webs · portada", cwd: "C:/proyectos/Webs", tipo: "espera", porque: "", cuando: Date.now(), leido: false }] });
    });
    await page.waitForTimeout(200);
    debe(await page.locator(".dec-posponer").count() === 0, "el menú no reaparece");
  });
  await paso("19c: si su decisión se contesta desde otro sitio, el menú se cierra", async () => {
    await page.locator(".dec-fila[data-id='dec:d19a2b3c4d00']").click();
    await page.keyboard.press("h");
    await page.evaluate(() => {
      const d = window.__dec.find((x) => x.id === "d19a2b3c4d00");
      d.respuesta = { cuando: Date.now(), desde: "Android · Chrome", elecciones: { A: { opcion: 2 } }, entregada: false };
      window.__emitir("decisiones:cambian");
    });
    await page.waitForTimeout(300);
    debe(await page.locator(".dec-posponer").count() === 0, "lo que ya pasó no se pospone: el menú se va");
  });

  // 20. Solo queda vista lo que se te pone delante con la ventana a la vista (hallazgo 7).
  await casaLimpia(async () => {
    for (const d of window.__dec) d.respuesta ??= { cuando: Date.now(), desde: "el PC", elecciones: {}, entregada: true };
    window.__emitir("decisiones:cambian");
    const { useAvisos } = await import("/src/lib/campana.ts");
    useAvisos.setState({ lista: useAvisos.getState().lista.filter((a) => a.tipo !== "espera") });
  });
  await paso("20a: con la ventana escondida, lo que llega y se abre solo sigue nuevo; al volver a ella, ya está visto", async () => {
    debe(await page.locator(".dec-fila[data-on=true]").count() === 0, "al entrar no se abre ninguna");
    await page.evaluate(async () => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.hasFocus = () => false;
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("blur"));
      const { useAvisos } = await import("/src/lib/campana.ts");
      useAvisos.setState({ lista: [...useAvisos.getState().lista, { n: 960, paneId: 3, nombre: "Adeorq · la barra", cwd: "C:/proyectos/Adeorq", tipo: "espera", porque: "", cuando: Date.now(), leido: false }] });
    });
    await page.waitForTimeout(300);
    debe(await page.locator(".dec-fila[data-id='aviso:3'][data-on=true]").count() === 1, "se abre sola");
    debe(await page.locator(".dec-fila[data-id='aviso:3']").getAttribute("data-nueva") === "true", "pero nadie la ha mirado: sigue nueva");
    await page.evaluate(() => {
      delete document.hidden;
      delete document.hasFocus;
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(300);
    debe(await page.locator(".dec-fila[data-id='aviso:3']").getAttribute("data-nueva") === "false", "al volver a la ventana la tienes delante: vista");
  });

  // 21. La cara y el número de Adeo no cuentan lo pospuesto (hallazgo 5).
  await casaLimpia(async () => {
    const d = window.__dec.find((x) => x.id === "d19a2b3c4d00");
    d.respuesta = { cuando: Date.now(), desde: "el PC", elecciones: {}, entregada: true };
    window.__emitir("decisiones:cambian");
    const { useAvisos } = await import("/src/lib/campana.ts");
    useAvisos.setState({ lista: [] });
  });
  const cara = () => page.locator(".campana .mascota").getAttribute("data-animo");
  const globo = async () => (await page.locator(".campana").getAttribute("data-tip")) ?? "";
  await paso("21a: pospones la única decisión viva y Adeo deja de decir que te espera", async () => {
    debe((await abierta()) === "dec:d19a2b3c4d01", `se abre la decisión viva (${await abierta()})`);
    debe(await cara() === "duda" && /Una decisión te espera/.test(await globo()), `antes, Adeo duda (${await cara()}, ${await globo()})`);
    await page.locator(".dec-fila[data-id='dec:d19a2b3c4d01']").focus();
    await page.keyboard.press("h");
    await page.keyboard.press("1");
    await page.waitForTimeout(300);
    debe(await cuentaTab() === "0", `la pestaña, a cero (${await cuentaTab()})`);
    debe(await cara() !== "duda" && !/decisión te espera/.test(await globo()), `después, ni cara de duda ni globo (${await cara()}, ${await globo()})`);
  });
  await paso("21b: y lo mismo con una terminal que te espera, también en su número", async () => {
    await page.evaluate(async () => {
      const { useAvisos } = await import("/src/lib/campana.ts");
      useAvisos.setState({ lista: [{ n: 970, paneId: 3, nombre: "Adeorq · la barra", cwd: "C:/proyectos/Adeorq", tipo: "espera", porque: "", cuando: Date.now() - 1000, leido: false }] });
    });
    await page.waitForTimeout(300);
    debe(await cara() === "espera" && await page.locator(".campana-n").count() === 1, `antes, Adeo te espera con su 1 (${await cara()})`);
    await page.locator(".dec-fila[data-id='aviso:3']").click();
    await page.keyboard.press("h");
    await page.keyboard.press("1");
    await page.waitForTimeout(300);
    debe(await cara() !== "espera" && await page.locator(".campana-n").count() === 0, `después, ni la cara ni el número (${await cara()})`);
  });

  // 22. Lo pospuesto vuelve sin ver, como un correo pospuesto (hallazgo 6).
  await casaLimpia();
  await paso("22a: lo que pospusiste después de mirarlo vuelve en negrita, aunque lo abrieras mientras dormía", async () => {
    debe(await page.locator(".dec-fila[data-id='aviso:3']").getAttribute("data-nueva") === "false", "abierta, está vista");
    await page.evaluate(async () => {
      const m = await import("/src/lib/decisiones.ts");
      const { useAvisos } = await import("/src/lib/campana.ts");
      const a = useAvisos.getState().lista.find((x) => x.paneId === 3);
      m.useReposo.getState().posponer({ id: "aviso:3", cuando: a.cuando }, Date.now() + 2500);
    });
    await page.locator(".dec-fila[data-id='aviso:3']").click();
    await page.locator(".dec-fila[data-id='aviso:5']").click();
    await page.waitForTimeout(3000);
    debe((await sitio()).includes("toca:aviso:3"), "vuelve a su hora");
    debe(await page.locator(".dec-fila[data-id='aviso:3']").getAttribute("data-nueva") === "true", "y vuelve como nueva");
  });

  // 23. Un localStorage roto no deja la app en blanco (hallazgo 4).
  for (const [nombre, roto] of [
    ["una pospuesta vacía", '{"vistas":{},"pospuestas":{"x":null}}'],
    ["una vista vacía", '{"vistas":{"x":null},"pospuestas":{}}'],
  ]) {
    await paso(`23: con ${nombre} guardada, la app arranca y la lista se usa`, async () => {
      await page.evaluate((r) => {
        sessionStorage.setItem("__guardar", "1");
        localStorage.setItem("adeorq-decisiones-reposo", r);
      }, roto);
      await page.reload();
      await tab.waitFor({ timeout: 8000 });
      await poner();
      await tab.click();
      await page.waitForSelector(".dec-fila");
      await page.keyboard.press("j");
      await page.waitForTimeout(300);
      debe(await page.locator(".caida").count() === 0 && await page.locator(".dec-fila").count() > 0, "sin la pantalla de caída y con la lista");
    });
  }
  await page.evaluate(() => {
    sessionStorage.removeItem("__guardar");
    localStorage.removeItem("adeorq-decisiones-reposo");
  });

  // 24. Revisión aparte de los arreglos de H (2026-11-16): el «terminó» de una terminal
  //     duerme con su decisión pospuesta, y cerrar la lista de Adeo no tira lo pospuesto.
  await casaLimpia(async () => {
    const d = window.__dec.find((x) => x.id === "d19a2b3c4d00");
    d.respuesta = { cuando: Date.now(), desde: "el PC", elecciones: {}, entregada: true };
    window.__emitir("decisiones:cambian");
    const { useAvisos } = await import("/src/lib/campana.ts");
    const hecho = (n, paneId) => ({ n, paneId, nombre: `p${paneId}`, cwd: "C:/proyectos/Adeorq", tipo: "hecho", porque: "", cuando: Date.now() - 1000, leido: false });
    useAvisos.setState({ lista: [hecho(980, 3), hecho(981, 7)] });
  });
  const enLaCampana = () => page.evaluate(async () => (await import("/src/lib/campana.ts")).useAvisos.getState().lista.map((a) => `${a.paneId}:${a.tipo}:${a.leido}`).join());
  await paso("24a: pospones la decisión de una terminal que además terminó, y su «terminó» no cuenta en Adeo", async () => {
    debe(!(await sitio()).includes("termino:aviso:3"), "su «terminó» no es fila: lo dice la decisión");
    await page.locator(".dec-fila[data-id='dec:d19a2b3c4d01']").focus();
    await page.keyboard.press("h");
    await page.keyboard.press("1");
    await page.locator(".dec-fila[data-id='aviso:7']").focus();
    await page.keyboard.press("h");
    await page.keyboard.press("1");
    await page.waitForTimeout(300);
    debe((await sitio()).includes("pospuesto:aviso:7"), "el «terminó» de otra, pospuesto");
    debe(await cara() !== "lista" && await page.locator(".campana-n").count() === 0, `ni «terminó» en la cara ni número (${await cara()}, ${await page.locator(".campana-n").count()})`);
  });
  await paso("24b: abres y cierras la lista de Adeo, y lo pospuesto sigue ahí para volver a su hora", async () => {
    await page.locator(".campana").click();
    await page.waitForTimeout(200);
    debe(await page.locator(".avisos .aviso").count() === 0, `la lista de Adeo no enseña lo pospuesto (${await page.locator(".avisos .aviso").count()})`);
    await page.locator(".campana").click();
    await page.waitForTimeout(200);
    debe((await enLaCampana()) === "3:hecho:false,7:hecho:false", `los dos avisos siguen, sin leer (${await enLaCampana()})`);
    debe((await sitio()).includes("pospuesto:aviso:7"), "y su fila sigue pospuesta");
  });

  // 25. H en plena cuenta atrás de «Enviar» no pospone: irse la mandaría ya, sin «Deshacer».
  await casaLimpia();
  await paso("25a: con «Enviar» pulsado, H no abre el menú y la cuenta atrás sigue", async () => {
    await page.locator(".dec-fila[data-id='dec:d19a2b3c4d01']").click();
    const qs = page.locator(".dec-pregunta");
    await qs.nth(0).locator(".dec-opcion").nth(1).click();
    await qs.nth(1).locator(".dec-opcion").nth(0).click();
    await page.locator(".dec-pie-botones button", { hasText: "Enviar respuesta" }).click();
    await page.waitForTimeout(150);
    debe(await page.locator(".dec-deshacer").count() === 1, "empieza la cuenta atrás");
    await page.keyboard.press("h");
    await page.keyboard.press("1");
    await page.waitForTimeout(300);
    const d = await page.evaluate(() => window.__dec.find((x) => x.id === "d19a2b3c4d01")?.respuesta ?? null);
    debe(await page.locator(".dec-posponer").count() === 0 && await ningunaPospuesta(), "ni menú ni pospuesta");
    debe(d === null && await page.locator(".dec-deshacer").count() === 1, `no se manda de golpe: sigue el «Deshacer» (${JSON.stringify(d)})`);
    await page.locator(".dec-deshacer").click();
  });

  // 26. El menú abierto con el botón de arriba cabe en la pestaña, también con la caja de la hora.
  await casaLimpia();
  await paso("26a: el menú de una terminal que te espera, con «Otra hora» abierta, no se sale por abajo", async () => {
    // Una ventana baja, donde debajo del botón no cabe el menú entero.
    await page.setViewportSize({ width: 1100, height: 560 });
    await page.waitForTimeout(200);
    await page.locator(".dec-fila[data-id='aviso:3']").click();
    await botonPosponer().click();
    await page.locator(".dec-posponer-op", { hasText: /Otra hora/ }).click();
    await page.waitForTimeout(200);
    const j = await junto();
    const baja = await page.evaluate(() => {
      const m = document.querySelector(".dec-posponer");
      const dec = document.querySelector(".dec").getBoundingClientRect();
      return { abajo: Math.round(m.getBoundingClientRect().bottom - dec.bottom), alto: m.clientHeight, scroll: m.scrollHeight };
    });
    debe(j && j.dentro, `dentro de la pestaña (${JSON.stringify(j)}, ${JSON.stringify(baja)})`);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // Las imágenes de una decisión (`image` en ask_decision). Munir, 2026-11-19:
  // «Tiene que haber una manera la cual se puedan ver las imagenes de las
  // decisiones». Salen con su sitio guardado, pulsarlas las abre en grande sin
  // elegir la opción, las teclas de la lista no eligen por debajo y Escape
  // cierra la imagen sin salir de la decisión.
  await casaLimpia(async () => {
    const png = async (ancho, alto, color) => {
      const lienzo = new OffscreenCanvas(ancho, alto);
      const x = lienzo.getContext("2d");
      const g = x.createLinearGradient(0, 0, ancho, alto);
      g.addColorStop(0, color);
      g.addColorStop(1, "#d4a");
      x.fillStyle = g;
      x.fillRect(0, 0, ancho, alto);
      return (await lienzo.convertToBlob()).arrayBuffer();
    };
    window.__fotosDec = { "d19a2b3c4d09:1": await png(1200, 500, "#36c"), "d19a2b3c4d09:2": await png(1920, 1080, "#3a6"), "d19a2b3c4d09:3": await png(390, 844, "#c63") };
    const img = (n, ancho, alto) => ({ n, tipo: "image/png", ancho, alto });
    window.__dec.push({
      id: "d19a2b3c4d09", titulo: "Portada: los datos de la derecha", proyecto: "Adeorq", panel: 3, arranque: window.__dec[0].arranque, creada: Date.now(),
      preguntas: [{ id: "A", titulo: "¿Cómo quieres los tres datos?", imagen: img(1, 1200, 500), opciones: [
        { texto: "En fila", detalle: "Los tres números lado a lado.", recomendada: true, imagen: img(2, 1920, 1080) },
        { texto: "Como hoy: la ficha", recomendada: false, imagen: img(3, 390, 844) },
        { texto: "Todo al centro", recomendada: false },
      ] }],
    });
    window.__emitir("decisiones:cambian");
  });
  await page.locator(".dec-fila[data-id='dec:d19a2b3c4d09']").click();
  await page.waitForFunction(() => document.querySelectorAll(".dec-foto img").length === 3 && [...document.querySelectorAll(".dec-foto img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
  const fotos = await page.evaluate(() => [...document.querySelectorAll(".dec-foto")].map((b) => {
    const r = b.getBoundingClientRect();
    const txt = b.closest(".dec-opcion")?.querySelector(".dec-opcion-txt")?.getBoundingClientRect();
    return { ancho: Math.round(r.width), alto: Math.round(r.height), suelto: b.parentElement.classList.contains("dec-pregunta"), cargada: (b.querySelector("img")?.naturalWidth ?? 0) > 0, de: Math.round((b.closest(".dec-opcion") ?? b.parentElement).getBoundingClientRect().width), hueco: txt ? Math.round(r.top - txt.bottom) : 0 };
  }));
  debe(fotos.length === 3 && fotos.every((f) => f.cargada), `las tres imágenes llegan (${JSON.stringify(fotos)})`);
  debe(fotos[0]?.suelto && Math.abs(fotos[0].alto - (fotos[0].ancho * 500) / 1200) <= 2, `la de la pregunta, con su forma (${JSON.stringify(fotos[0])})`);
  debe(fotos.slice(1).every((f) => f.ancho >= f.de - 30), `las de las opciones llenan su opción (${JSON.stringify(fotos)})`);
  // La fila se estira a la opción más alta: la imagen de la más baja no se va a media tarjeta.
  debe(fotos.slice(1).every((f) => f.hueco >= 0 && f.hueco <= 16), `las de las opciones empiezan bajo su texto (${JSON.stringify(fotos)})`);
  await page.screenshot({ path: `${CAPTURAS}/dec-imagenes.png` });
  await page.locator(".dec-opcion").nth(1).locator(".dec-foto").click();
  await page.waitForSelector(".dec-foto-grande img");
  debe((await page.locator(".dec-foto-grande b").textContent()) === "2. Como hoy: la ficha", "en grande dice de qué opción es");
  const fondo = await page.locator(".dec-foto-grande").evaluate((el) => getComputedStyle(el).backgroundColor);
  debe(/^rgb\(/.test(fondo), `en grande, el fondo es opaco y no deja ver la página (${fondo})`);
  await page.screenshot({ path: `${CAPTURAS}/dec-imagen-grande.png` });
  await page.keyboard.press("1");
  await page.waitForTimeout(200);
  debe((await page.locator(".dec-opcion[data-marcada='true']").count()) === 0, "pulsar la imagen o una tecla con ella abierta no elige");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  debe((await page.locator(".dec-foto-grande").count()) === 0, "Escape cierra la imagen");
  debe((await page.locator(".dec-abierta[data-decision]").count()) === 1, "y la decisión sigue abierta");
  // En plena cuenta atrás, abrirla no tapa «Deshacer», y se puede deshacer sin
  // cerrarla (revisión del 2026-11-19: se mandaba con ella encima).
  await page.locator(".dec-opcion").nth(0).locator(".dec-opcion-txt b").click();
  await page.locator(".dec-pie-botones button", { hasText: "Enviar respuesta" }).click();
  await page.waitForSelector(".dec-deshacer");
  const fotoEnCuenta = page.locator(".dec-opcion").nth(1).locator(".dec-foto");
  await fotoEnCuenta.scrollIntoViewIfNeeded();
  const cajaEnCuenta = await fotoEnCuenta.boundingBox();
  await page.mouse.click(cajaEnCuenta.x + cajaEnCuenta.width / 2, cajaEnCuenta.y + cajaEnCuenta.height / 2);
  await page.waitForSelector(".dec-foto-grande img", { timeout: 3000 }).catch(() => {});
  const enCuenta = await page.evaluate(() => {
    const b = document.querySelector(".dec-deshacer")?.getBoundingClientRect();
    const encima = b && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { abierta: Boolean(document.querySelector(".dec-foto-grande")), deshacer: Boolean(encima?.closest(".dec-deshacer")) };
  });
  debe(enCuenta.abierta && enCuenta.deshacer, `con la imagen abierta en la cuenta atrás, «Deshacer» sigue a la vista (${JSON.stringify(enCuenta)})`);
  if (enCuenta.deshacer) await page.locator(".dec-deshacer").click();
  await page.waitForTimeout(5500);
  const trasDeshacer = await page.evaluate(() => window.__dec.find((x) => x.id === "d19a2b3c4d09").respuesta ?? null);
  debe(trasDeshacer === null, `«Deshacer» con la imagen abierta no la manda (${JSON.stringify(trasDeshacer)})`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Contestada, la imagen de lo elegido también se abre: va dentro de un fieldset
  // desactivado, donde un <button> no atiende (revisión del 2026-11-19). Con un
  // clic de ratón donde está: `click` esperaría a que se activase.
  await page.evaluate(() => {
    const d = window.__dec.find((x) => x.id === "d19a2b3c4d09");
    d.respuesta = { cuando: Date.now(), desde: "el PC", elecciones: { A: { opcion: 2 } }, entregada: false };
    window.__emitir("decisiones:cambian");
  });
  await page.waitForSelector(".dec-pregunta:disabled .dec-opcion[data-marcada='true'] .dec-foto img");
  const elegidaFoto = page.locator(".dec-opcion[data-marcada='true'] .dec-foto");
  await elegidaFoto.scrollIntoViewIfNeeded();
  const cajaElegida = await elegidaFoto.boundingBox();
  await page.mouse.click(cajaElegida.x + cajaElegida.width / 2, cajaElegida.y + cajaElegida.height / 2);
  await page.waitForSelector(".dec-foto-grande img", { timeout: 3000 }).catch(() => {});
  debe((await page.locator(".dec-foto-grande b").textContent({ timeout: 1000 }).catch(() => null)) === "2. Como hoy: la ficha", "contestada, la imagen de lo elegido se abre en grande");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Una tira muy apaisada (16000 × 60) se puede pulsar: medía 2 px de alto (revisión del 2026-11-19).
  await casaLimpia(async () => {
    const lienzo = new OffscreenCanvas(16000, 60);
    lienzo.getContext("2d").fillRect(0, 0, 16000, 60);
    window.__fotosDec = { "d19a2b3c4d0a:1": await (await lienzo.convertToBlob()).arrayBuffer() };
    window.__dec.push({
      id: "d19a2b3c4d0a", titulo: "Una tira", proyecto: "Adeorq", panel: 3, arranque: window.__dec[0].arranque, creada: Date.now(),
      preguntas: [{ id: "A", titulo: "¿Y esta?", imagen: { n: 1, tipo: "image/png", ancho: 16000, alto: 60 }, opciones: [{ texto: "Sí" }, { texto: "No" }] }],
    });
    window.__emitir("decisiones:cambian");
  });
  await page.locator(".dec-fila[data-id='dec:d19a2b3c4d0a']").click();
  await page.waitForSelector(".dec-pregunta > .dec-foto");
  const altoTira = await page.evaluate(() => Math.round(document.querySelector(".dec-pregunta > .dec-foto").getBoundingClientRect().height));
  debe(altoTira >= 44, `una tira muy apaisada se puede pulsar (${altoTira} px de alto)`);

  // La caché de imágenes tiene tope y suelta (`revokeObjectURL`) lo que echa: las
  // guardaba todas para siempre (revisión del 2026-11-19). Tres decisiones de 30
  // imágenes, una tras otra, contando los enlaces vivos.
  await casaLimpia(async () => {
    const lienzo = new OffscreenCanvas(40, 30);
    lienzo.getContext("2d").fillRect(0, 0, 40, 30);
    const bytes = await (await lienzo.convertToBlob()).arrayBuffer();
    const img = (n) => ({ n, tipo: "image/png", ancho: 40, alto: 30 });
    window.__fotosDec = {};
    for (const s of ["b1", "b2", "b3"]) {
      const id = `d19a2b3c4d${s}`;
      for (let n = 1; n <= 30; n++) window.__fotosDec[`${id}:${n}`] = bytes;
      window.__dec.push({
        id, titulo: `Treinta imágenes ${s}`, proyecto: "Adeorq", panel: 3, arranque: window.__dec[0].arranque, creada: Date.now(),
        preguntas: Array.from({ length: 5 }, (_, q) => ({
          id: String.fromCharCode(65 + q), titulo: `Pregunta ${q + 1}`, imagen: img(q * 6 + 1),
          opciones: Array.from({ length: 5 }, (_, o) => ({ texto: `Opción ${o + 1}`, imagen: img(q * 6 + o + 2) })),
        })),
      });
    }
    window.__vivas = new Set();
    const crear = URL.createObjectURL.bind(URL);
    const soltar = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (x) => { const u = crear(x); window.__vivas.add(u); return u; };
    URL.revokeObjectURL = (u) => { window.__vivas.delete(u); soltar(u); };
    window.__emitir("decisiones:cambian");
  });
  for (const s of ["b1", "b2", "b3"]) {
    await page.locator(`.dec-fila[data-id='dec:d19a2b3c4d${s}']`).click();
    await page.waitForFunction(() => { const i = [...document.querySelectorAll(".dec-foto img")]; return i.length === 30 && i.every((x) => x.complete && x.naturalWidth > 0); }, null, { timeout: 8000 }).catch(() => {});
  }
  const cache = await page.evaluate(() => ({ vivas: window.__vivas.size, rotas: [...document.querySelectorAll(".dec-foto img")].filter((i) => !(i.naturalWidth > 0)).length }));
  debe(cache.vivas <= 60 && cache.rotas === 0, `la caché de imágenes suelta lo que echa y no lo de la abierta (${JSON.stringify(cache)} tras 90 imágenes)`);

  // Para los detectores de detrás (`carceles.js`, `mayusculas.js`): una decisión
  // abierta, con el botón «Posponer» en su barra del pie.
  await casaLimpia();
  await page.locator(".dec-fila[data-id='dec:d19a2b3c4d01']").click();
  page.setDefaultTimeout(30000);

  return { fallos };
}
