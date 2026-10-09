// La pestaña «Decisiones» de la app de escritorio, con la app de verdad (Vite)
// y un doble de Tauri que contesta como `decisiones.rs`:
//
//   1. `pnpm dev` (solo Vite, no compila Rust ni toca `C:\ct`)
//   2. desde una sesión con el MCP de Playwright, con la página recién abierta:
//        browser_run_code_unsafe(filename = "scripts/laboratorio/decisiones-escritorio.js")
//
// Munir, 2026-10-09, contestando desde el móvil la primera decisión de verdad:
// quería verlas también en el PC, «una sección Decisiones dentro de la app».
// Lo que fija esto: la pestaña cuenta las que te esperan; ninguna opción sale
// marcada aunque haya recomendada; «Enviar» no se deja pulsar hasta tener cada
// pregunta contestada; lo marcado sobrevive a irse de la pestaña; «Deshacer»
// para el envío; al mandarla se teclea en el panel que preguntó y se apunta
// como entregada; una contestada se lee y no se edita; irse en plena cuenta
// atrás la manda igual; una nueva del MCP sube la cuenta sin recargar; y en
// inglés la pestaña se llama Decisions.
//
// Devuelve { fallos: [...] }: vacío es que todo está en su sitio.
// ⚠ Cargarlo dos veces en la misma página suma los dos guiones de arranque:
// cerrar la página (browser_close) antes de volver a lanzarlo.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const CAPTURAS = "C:/Users/Muni/AppData/Local/Temp/claude/C--proyectos-Adeorq/572c3eb8-4cba-4c56-8923-bddd346e5626/scratchpad";
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
        id: "d19a2b3c4d00", titulo: "Cómo se llama la sección nueva", proyecto: "VoCript", creada: ahora - 2 * 3_600_000,
        preguntas: [pregunta("A", "El nombre", [op("Dictados"), op("Historial", { recomendada: true })])],
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
    const contestar = (cmd, args) => {
      llamadas.push([cmd, copia(args ?? {})]);
      switch (cmd) {
        case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
        case "plugin:event|unlisten": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        // Como `decisiones.rs`: las pendientes primero.
        case "decisiones_listar":
          return copia([...window.__dec].sort((a, b) => Boolean(a.respuesta) - Boolean(b.respuesta) || b.creada - a.creada));
        case "decision_responder": {
          const d = window.__dec.find((x) => x.id === args.id);
          if (!d) throw "Esa decisión ya no está.";
          if (d.respuesta) throw "Esa decisión ya está contestada.";
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
  const boton = page.locator(".dec-pie button");
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
  debe(await page.locator(".dec-fila").count() === 3, "tres en la lista");
  const etis = await page.locator(".dec-lista-eti").allTextContents();
  debe(etis.join() === "Te esperan,Contestadas", `las dos secciones de la lista (${etis})`);
  debe((await page.locator(".dec-abierta h2").textContent()) === "Dónde va la barra de la guía", "abre la primera que te espera");
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
    pie: Boolean(document.querySelector(".dec-pie")),
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

  // 9. Una nueva del MCP sube la cuenta sin recargar.
  await page.evaluate(() => {
    window.__dec.push({ id: "d19a2b3c4d02", titulo: "Una nueva", creada: Date.now(), preguntas: [{ id: "A", titulo: "¿Sí?", opciones: [{ texto: "Sí", recomendada: false }, { texto: "No", recomendada: false }] }] });
    window.__emitir("decisiones:cambian");
  });
  await page.waitForTimeout(300);
  debe((await tab.locator(".tab-count").textContent()) === "1", "una nueva sube la cuenta");

  // 10. En inglés.
  await page.evaluate(() => sessionStorage.setItem("__lang", "en"));
  await page.reload();
  await tab.waitFor({ timeout: 15000 });
  debe(/Decisions/.test(await tab.textContent()), `en inglés (${await tab.textContent()})`);
  await tab.click();
  await page.waitForSelector(".dec-abierta");
  const en = await page.evaluate(() => ({ eti: [...document.querySelectorAll(".dec-lista-eti")].map((x) => x.textContent), boton: document.querySelector(".dec-pie button")?.textContent }));
  debe(en.eti.join() === "Waiting for you,Answered" && en.boton === "Send answer", `la vista en inglés (${JSON.stringify(en)})`);
  await page.evaluate(() => sessionStorage.removeItem("__lang"));

  return { fallos };
}
