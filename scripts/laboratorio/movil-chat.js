// El chat de una terminal en la página del móvil, a 390 px, contra el doble
// recién arrancado (`node scripts/laboratorio/doble-movil.mjs`, en el 4390;
// contestar la decisión o un menú cambia su estado, así que entre dos pasadas
// hay que volver a arrancarlo):
//
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-chat.js")
//
// Munir lo dijo dos veces, el 2026-10-08 y el 10-09: «no veo mucho historial
// de la terminal», las dos mirando «Pantalla», que en un Claude Code no tiene
// historial ninguno. Lo que fija esto: una terminal de agente se abre en el
// Chat; el chat dice qué hace AHORA (y no parece parado); una pregunta sale con
// sus opciones como botones; la decisión pendiente se ve desde dentro; los
// pasos dicen qué hizo cada uno; el chat que no cambia no se vuelve a bajar; y
// «Pantalla» avisa de que el historial está en el Chat, sin rayas partidas ni
// cajitas en lugar de símbolos.
//
// Devuelve { fallos: [...] }: vacío es que todo está en su sitio.
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

  // 1. Una terminal de agente se abre en el Chat. Con `?r=1` la página se
  // recarga y lee la clave: cambiar solo el `#` no recarga, y en un perfil
  // recién hecho (`banco-sin-mcp.mjs`) se quedaba emparejando.
  await page.goto(`${B}/?r=1#terminal=1@111`);
  await page.waitForSelector("#turnos .turno");
  await page.waitForTimeout(600);
  const pest = await page.$$eval(".pestanas .pastilla", (b) => b.map((x) => `${x.textContent}:${x.dataset.on}`));
  debe(pest.join() === "Chat:true,Pantalla:false", `abre en el Chat (${pest})`);

  // 2. Lo que hace ahora, leído de la pantalla.
  const ahora = await page.$eval("#ahora", (x) => (x.hidden ? "" : x.innerText));
  debe(/Trabajando · 26s/.test(ahora), `dice que trabaja y desde cuándo (${ahora})`);
  debe(/Listing 1 directory/.test(ahora) && /\$ curl/.test(ahora), "dice el paso en marcha y su comando");

  // 3. Los pasos: cuántos, y los últimos 30 con lo que hizo cada uno.
  const todos = await page.$$eval("details.pasos", (ds) => ds.map((d) => d.querySelector("summary b").innerText));
  debe(todos.includes("151 pasos"), `el turno largo cuenta 151 pasos (${todos.slice(-3)})`);
  const largo = await page.$$eval("details.pasos", (ds) => {
    const d = ds.find((x) => x.querySelector("summary b").innerText === "151 pasos");
    return d ? { filas: d.querySelectorAll("li").length, antes: d.querySelector(".antes")?.textContent, ultimo: d.querySelector("li:last-child").textContent } : null;
  });
  debe(largo?.filas === 31 && largo?.antes === "y 121 antes", `30 pasos y «y 121 antes» (${JSON.stringify(largo)})`);
  debe(/Edit\s*scrollTerm\.ts/.test(largo?.ultimo || ""), "cada paso dice qué hizo");

  // 4. El chat que no cambia no se vuelve a bajar: tras dos vueltas, «igual».
  await page.waitForTimeout(6500);
  const pedidas = await (await page.request.get(`${B}/api/pedidas-sesion`, { headers: AUT })).json();
  debe(pedidas[0] === "entera" && pedidas.slice(1).length >= 1 && pedidas.slice(1).every((x) => x === "igual"), `entera una vez y luego «igual» (${pedidas})`);

  // 5. La decisión pendiente, desde dentro de la terminal, y vuelta a ella.
  const aviso = await page.$eval("#aviso-dec", (x) => (x.hidden ? "" : x.innerText));
  // Es la de ESTA terminal (la pidió el panel 1), y lo dice.
  debe(/Esta terminal espera tu decisión/.test(aviso), `se ve la decisión pendiente (${aviso})`);
  await page.click("#aviso-dec");
  await page.waitForSelector(".pregunta-d");
  await page.click("#atras");
  await page.waitForSelector("#turnos .turno");
  debe(await page.$eval("#titulo", (h) => /claude/.test(h.textContent)), "«atrás» vuelve a la terminal de la que venía");

  // 6. Bajo el texto, solo Parar, el modelo con su esfuerzo («Opus · extra») y
  //    el modo (2026-10-16, «la 3» y «añade el effort»), en la fila de adjuntar
  //    y mandar, sin iconos y sin que nada se corte. Parar solo mientras
  //    trabaja. La pastilla abre en la caja una barra con los modelos y los
  //    esfuerzos, lo puesto en azul; tocar uno se lo pide al PC y la cierra.
  debe(/modo auto/.test(await page.textContent("#sub")), `el modo se dice arriba (${await page.textContent("#sub")})`);
  const mandos = () => page.evaluate(() => {
    const ve = (id) => { const el = document.getElementById(id); return !!el && !el.hidden && !el.closest("[hidden]"); };
    return {
      teclas: !!document.getElementById("teclas") || !!document.getElementById("abrir-teclas"),
      modelo: ve("modelo"), modo: ve("modo"), parar: ve("parar"),
      cabe: (() => { const p = document.querySelector("#caja .mandos-term"); return p.scrollWidth <= p.clientWidth; })(),
      textos: [...document.querySelectorAll("#caja .mandos-term > :not([hidden])")].map((x) => x.textContent.trim()),
      iconos: document.querySelectorAll("#modelo svg, #modo svg").length,
      select: document.querySelectorAll("#caja select").length,
      filas: new Set([...document.querySelectorAll("#caja .mandos > *, #caja .mandos-term > :not([hidden])")].filter((x) => x.offsetParent).map((x) => { const c = x.getBoundingClientRect(); return Math.round((c.top + c.height / 2) / 8); })).size,
    };
  });
  const t1 = await mandos();
  debe(!t1.teclas, "ya no está la fila de teclas");
  debe(t1.modelo && t1.modo && t1.parar, `Parar, el modelo y el modo, trabajando (${JSON.stringify(t1)})`);
  debe(JSON.stringify(t1.textos) === JSON.stringify(["Parar", "Opus · extra", "Auto"]) && !t1.iconos && !t1.select, `sin estrella, sin flechas y sin la lista del teléfono (${JSON.stringify(t1)})`);
  debe(t1.cabe, `con Parar a la vista caben todas, sin cortar «Auto» (${JSON.stringify(t1)})`);
  debe(t1.filas === 1, `todo en una fila con adjuntar y mandar (${JSON.stringify(t1)})`);
  const barra = () => page.evaluate(() => ({
    abierta: !document.getElementById("elegir").hidden,
    ops: [...document.querySelectorAll("#elegir .seg")].map((s) => [...s.querySelectorAll("button")].map((b) => b.textContent).join(" ")),
    puesto: [...document.querySelectorAll('#elegir [aria-checked="true"]')].map((b) => b.textContent),
    azul: document.getElementById("modelo").getAttribute("aria-expanded") === "true",
    // Dentro de la caja, entre el texto y los mandos.
    sitio: document.getElementById("elegir").previousElementSibling?.id + ">" + document.getElementById("elegir").nextElementSibling?.className,
    ancho: document.documentElement.scrollWidth,
  }));
  const delPc = () => page.evaluate(async () => {
    const r = await fetch("/api/terminal?panel=1&arranque=111", { headers: { Authorization: `Bearer ${localStorage.getItem("adeorq-movil-clave")}` } }).then((x) => x.json());
    return { modelo: r.modelo, esfuerzo: r.esfuerzo, fallo: !document.getElementById("fallo").hidden, pastilla: document.getElementById("modelo").textContent };
  });
  debe(!(await barra()).abierta, "la barra nace cerrada");
  await page.click("#modelo");
  const b1 = await barra();
  debe(b1.abierta && JSON.stringify(b1.ops) === JSON.stringify(["Haiku Sonnet Opus Fable", "Bajo Medio Alto Extra Máx"]) && b1.puesto.join() === "Opus,Extra" && b1.azul, `la pastilla abre los modelos y los esfuerzos con lo puesto marcado (${JSON.stringify(b1)})`);
  debe(b1.sitio === "texto>mandos" && b1.ancho <= 412, `la barra va dentro de la caja, bajo el texto, sin salirse (${JSON.stringify(b1)})`);
  await page.click('#elegir [data-valor="sonnet"]');
  await page.waitForTimeout(1200);
  const t2 = { ...(await delPc()), cerrada: !(await barra()).abierta };
  debe(t2.modelo === "sonnet" && t2.pastilla === "Sonnet · extra" && t2.cerrada && !t2.fallo, `un toque cambia el modelo en el PC y cierra la barra (${JSON.stringify(t2)})`);
  await page.click("#modelo");
  await page.click('#elegir [data-valor="high"]');
  await page.waitForTimeout(1200);
  const t3 = await delPc();
  debe(t3.esfuerzo === "high" && t3.pastilla === "Sonnet · alto" && !t3.fallo, `un toque cambia el esfuerzo en el PC (${JSON.stringify(t3)})`);
  await page.click("#modelo");
  await page.click("#modelo");
  debe(!(await barra()).abierta, "tocar otra vez la pastilla cierra la barra");

  // 7. «Pantalla» (2026-10-16, la 1 y la 3): a todo el ancho, sin recuadro, la
  //    raya de arriba con el nombre de la sesión, la caja donde se escribe
  //    resaltada debajo y la barra de estado al pie; y dice dónde está lo de antes.
  await page.click('[data-cara="pantalla"]');
  await page.waitForTimeout(600);
  const pant = await page.evaluate(() => {
    const marco = document.getElementById("marco").getBoundingClientRect();
    const pre = document.getElementById("pantalla").getBoundingClientRect();
    return {
      nota: !document.getElementById("nota-pantalla").hidden,
      texto: document.getElementById("pantalla").innerText,
      titulo: document.querySelector(".pantalla .regla-titulo")?.innerText || "",
      entrada: document.querySelector(".pantalla .entrada")?.innerText.trim() ?? null,
      pie: document.querySelector(".pantalla .pie-term")?.innerText.trim() ?? null,
      anchoEntero: Math.round(pre.width) >= Math.round(marco.width) - 1,
      borde: getComputedStyle(document.getElementById("pantalla")).borderTopWidth,
      colores: [...new Set([...document.querySelectorAll(".pantalla span[style]")].map((s) => getComputedStyle(s).color))],
      negrita: getComputedStyle(document.querySelector(".pantalla .b") ?? document.body).fontWeight,
    };
  });
  debe(pant.colores.includes("rgb(78, 186, 101)") && pant.colores.includes("rgb(255, 193, 7)") && pant.negrita === "700", `con los colores y la negrita del PC (${JSON.stringify([pant.colores, pant.negrita])})`);
  // Con historial (`/api/historia`) ya no hace falta la nota del Chat, y la
  // barra de estado de debajo de la caja no se pinta (2026-10-16, la mira
  // entera `movil-pantalla-historia.js`).
  debe(!pant.nota, "con historial, la pantalla no manda al Chat");
  debe(!/[⏵⏸─]/.test(pant.texto), "sin ⏵ ni rayas de texto en la pantalla");
  debe(pant.titulo === "Adeorq: sesiones y terminales", `la raya de arriba con el nombre de la sesión (${pant.titulo})`);
  debe(pant.entrada === "❯" && pant.pie === null && !/auto mode on/.test(pant.texto), `la caja de escribir resaltada y nada debajo (${JSON.stringify([pant.entrada, pant.pie])})`);
  debe(pant.anchoEntero && pant.borde === "0px", `a todo el ancho y sin recuadro (${JSON.stringify([pant.anchoEntero, pant.borde])})`);
  // Sin historial en el disco (la 5), la nota con el camino al Chat.
  await page.goto(`${B}/#terminal=5@111`);
  await page.waitForSelector("#texto");
  await page.click('[data-cara="pantalla"]');
  await page.waitForTimeout(600);
  debe(await page.$eval("#nota-pantalla", (n) => !n.hidden), "sin historial, la pantalla dice que lo de antes está en el Chat");
  await page.click("[data-ir-chat]");
  await page.waitForTimeout(600);
  debe(await page.$eval("#conversa", (c) => !c.hidden), "el enlace de la nota lleva al Chat");

  // 8. Una pregunta con sus opciones; la 2 se manda como «2».
  await page.goto(`${B}/#terminal=4@111`);
  await page.waitForSelector("#ahora:not([hidden])");
  const preg = await page.$eval("#ahora", (x) => ({ tipo: x.dataset.tipo, texto: x.innerText, n: x.querySelectorAll("button[data-num]").length }));
  debe(preg.tipo === "pregunta" && /Do you want to proceed\?/.test(preg.texto) && preg.n === 3, `la pregunta con 3 opciones (${JSON.stringify(preg)})`);
  await page.click('#ahora button[data-num="2"]');
  await page.waitForTimeout(500);
  const escrito = await (await page.request.get(`${B}/api/escrito?panel=4`, { headers: AUT })).json();
  debe(escrito.texto === "2", `la opción 2 manda «2» (${escrito.texto})`);

  // 9. Una consola sin agente: ni pestañas, ni nota, ni «ahora».
  await page.goto(`${B}/#terminal=3@111`);
  await page.waitForSelector("#pantalla .l");
  const consola = await page.evaluate(() => ({
    pestanas: !document.getElementById("pestanas").hidden,
    nota: !document.getElementById("nota-pantalla").hidden,
  }));
  debe(!consola.pestanas && !consola.nota, `la consola sin pestañas ni nota (${JSON.stringify(consola)})`);

  // 10. La mascota del pie está viva: es la del escritorio, con su guion. Cambia
  //     de postura sola, sigue siendo la misma al repintarse el chat, y si la
  //     tocas da un brinco (sube una fila).
  await page.goto(`${B}/#terminal=1@111`);
  await page.waitForSelector("#ahora .masc");
  const masc = () => page.$eval("#ahora .masc", (m) => ({ animo: m.dataset.animo, clave: m.dataset.clave, v: Number(m.dataset.v), cuadros: m.querySelectorAll("rect").length, arriba: Math.min(...[...m.querySelectorAll('rect[fill="#39a9f6"]')].map((q) => Number(q.getAttribute("y")))) }));
  const m0 = await masc();
  debe(m0.animo === "trabaja" && m0.clave === "ahora" && m0.cuadros > 100, `al pie, tecleando (${JSON.stringify(m0)})`);
  await page.waitForTimeout(3600);
  const m1 = await masc();
  debe(m1.v > m0.v + 5, `cambia de postura sola, y repintar el chat no la reinicia (${m0.v} → ${m1.v})`);
  await page.dispatchEvent("#ahora .masc", "pointerdown");
  await page.waitForTimeout(90);
  debe((await masc()).arriba === 1, "al tocarla, brinca");

  // 11. Una terminal que terminó lo dice, y la mascota lo celebra.
  await page.goto(`${B}/#terminal=5@111`);
  await page.waitForSelector('#ahora[data-tipo="termino"]');
  const fin = await page.$eval("#ahora", (x) => ({ texto: x.innerText, animo: x.querySelector(".masc")?.dataset.animo }));
  debe(/Ha terminado/.test(fin.texto) && fin.animo === "lista", `terminó, y se celebra (${JSON.stringify(fin)})`);

  // 12. La portada dice de un vistazo qué pasa: lo que te reclama arriba, cada
  //     terminal con su estado, y la mascota con el ánimo de todo.
  await page.goto(`${B}/`);
  await page.waitForSelector("#portada-term .fila-t");
  const portada = await page.evaluate(() => ({
    resumen: document.getElementById("yo").textContent,
    reclaman: [...document.querySelectorAll("#reclaman .fila-term")].map((b) => b.querySelector("b").textContent),
    terminales: [...document.querySelectorAll("#portada-term .fila-t")].map((b) => b.innerText.replace(/\s+/g, " ")),
    animo: document.querySelector("#masc-portada .masc")?.dataset.animo,
  }));
  debe(/te esperan/.test(portada.resumen) && /1 agente trabajando/.test(portada.resumen), `el resumen de arriba («${portada.resumen}»)`);
  debe(portada.reclaman.some((x) => /codex/.test(x)) && portada.reclaman.some((x) => /Diseño de la web/.test(x)), `arriba, lo que te reclama (${portada.reclaman})`);
  // «En marcha» es lo que trabaja ahora mismo (Munir, 2026-10-15); lo que
  // terminó o está quieto vive en Terminales, en el cajón.
  debe(portada.terminales.join("|") === "claude · Adeorq trabajando", `en marcha, solo la que trabaja (${portada.terminales})`);
  debe(portada.animo === "espera", `la mascota de la portada te llama (${portada.animo})`);
  // Y de ahí se entra a una terminal, y el cajón (como en la app de Claude)
  // lleva de vuelta a la portada, con la terminal marcada como la de ahora.
  await page.click('#portada-term .fila-t[data-panel="1"]');
  await page.waitForSelector("#turnos .turno");
  await page.click("#abrir-cajon");
  await page.waitForSelector('#cajon .fila[data-panel="1"]');
  debe(await page.$eval('#cajon .fila[data-panel="1"]', (b) => b.getAttribute("aria-current")) === "true", "el cajón marca la terminal en la que estás");
  await page.click('#cajon [data-ir="lista"]');
  debe(await page.waitForSelector("#portada-term .fila-t", { timeout: 4000 }).then(() => true, () => false), "el cajón vuelve a la portada desde una terminal");
  debe(await page.evaluate(() => document.body.dataset.cajon === undefined && document.getElementById("cajon").inert), "y se cierra al ir");

  // 13. Al conserje se le escribe desde la portada: lo que mandas abre su
  //     conversación con tu mensaje ya saliendo, y él contesta ahí.
  debe(await page.$eval("#decir-enviar", (b) => b.disabled), "sin texto, la caja de la portada no envía");
  await page.fill("#decir", "Mira por qué se cae el radar");
  await page.click("#decir-enviar");
  await page.waitForSelector("#hilo .turno");
  const alLlegar = await page.evaluate(() => ({
    tuyo: document.querySelector('#hilo .turno[data-rol="tu"]')?.innerText,
    pensando: Boolean(document.querySelector("#hilo .pensando .masc")),
  }));
  debe(alLlegar.tuyo === "Mira por qué se cae el radar" && alLlegar.pensando, `abre la conversación con tu mensaje saliendo (${JSON.stringify(alLlegar)})`);
  await page.waitForSelector('#hilo .turno[data-rol="agente"]', { timeout: 9000 });
  debe((await page.$$eval("#hilo .turno", (t) => t.length)) === 2, "y el conserje contesta en ella, sin repetir tu mensaje");

  return { fallos };
}
