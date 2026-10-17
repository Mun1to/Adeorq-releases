// Las preguntas de Claude Code, contestadas desde el móvil como las pinta y
// como responde la v2.1.302 de verdad (Munir, 2026-10-17: «tienes que mejorar
// la parte de lo que te pregunta la terminal porque no va del todo bien»). Las
// pantallas del doble son copia de un panel real (`pantallaDelMenu` en
// doble-movil.mjs). Lo que fija:
//   · la pregunta sale entera, no su última línea; una opción partida, entera;
//     cada opción con su descripción; y las pestañas de una con varias;
//   · en una de casillas, el número marca y «Listo» (la flecha derecha) lleva
//     al repaso, que se envía con su 1: antes no había forma de mandarla;
//   · un permiso dice QUÉ quiere ejecutar, con su comando, y una ruta partida
//     por dentro sale sin hueco;
//   · «Escribir otra respuesta» abre una caja, lo escrito sobrevive a que se
//     repinte, y se manda como lo espera Claude Code (su número y el texto).
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-preguntas-reales.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  const sembrar = (cual) => page.request.post(`${B}/api/sembrar-pregunta`, { headers: AUT, data: { panel: 4, cual } });
  const hecho = async () => (await page.request.get(`${B}/api/menu-hecho?panel=4`, { headers: AUT })).json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${B}/`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"); });

  // 1. En su chat: la pregunta entera, las opciones enteras con su descripción.
  await sembrar("doble");
  await page.goto(`${B}/?r=1#terminal=4@111`);
  await page.waitForSelector('#ahora[data-tipo="pregunta"] .opciones-menu button');
  // La vista entra deslizándose: el ancho se mide ya quieta.
  await page.waitForTimeout(1000);
  const leer = (donde) => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return {
      que: el.querySelector(".ahora-que, .preg-que")?.textContent ?? "",
      ops: [...el.querySelectorAll(".opciones-menu button")].map((b) => ({
        n: b.dataset.num, texto: b.querySelector(".op-txt > span")?.textContent, desc: b.querySelector("small")?.textContent ?? "",
        marcada: b.getAttribute("aria-pressed"), escribir: b.dataset.escribir === "true",
      })),
      pasos: [...el.querySelectorAll(".menu-pasos span")].map((s) => s.textContent),
      ctx: [...el.querySelectorAll(".menu-ctx > *")].map((s) => s.textContent),
      cmd: el.querySelector(".menu-cmd")?.textContent ?? "",
      listo: !!el.querySelector(".menu-listo"),
      ancho: document.documentElement.scrollWidth,
    };
  }, donde);
  pasos.q1 = await leer("#ahora");
  const q1 = pasos.q1;
  debe(q1.que === "¿Dónde quieres que se elijan las partes de la aplicación cuando alguien la instala por primera vez en un ordenador nuevo?", `la pregunta entera, no su última línea (${q1.que})`);
  debe(q1.ops[1]?.texto === "Primer arranque de la aplicación, en una bienvenida con casillas que se pueden cambiar luego" && q1.ops[1]?.desc === "Igual en Windows y Linux", `la opción partida sale entera, con su descripción aparte (${JSON.stringify(q1.ops[1])})`);
  debe(q1.ops[0]?.desc === "Una página con casillas antes de instalar", `cada opción con su descripción (${JSON.stringify(q1.ops[0])})`);
  debe(q1.ops[3]?.escribir && q1.ops[3]?.texto === "Escribir otra respuesta" && q1.ops[4]?.texto === "Hablarlo en el chat", `las dos de Claude Code, dichas en castellano (${JSON.stringify(q1.ops.slice(3))})`);
  debe(JSON.stringify(q1.pasos) === JSON.stringify(["Instalación", "Partes"]) && !q1.listo, `las pestañas de las dos preguntas, sin «Listo» en esta (${JSON.stringify(q1)})`);
  debe(q1.ancho <= 390, `nada se sale por la derecha (${q1.ancho})`);

  // 2. Elegir la 2 pasa a la de casillas: marcar no la envía, «Listo» sí.
  await page.click('#ahora button[data-num="2"]');
  await page.waitForFunction(() => document.querySelector("#ahora .menu-listo"), null, { timeout: 8000 });
  await page.click('#ahora button[data-num="1"]');
  await page.waitForFunction(() => document.querySelector('#ahora button[data-num="1"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 8000 });
  await page.click('#ahora button[data-num="3"]');
  await page.waitForFunction(() => document.querySelector('#ahora button[data-num="3"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 8000 });
  pasos.q2 = await leer("#ahora");
  debe(pasos.q2.listo && pasos.q2.ops.filter((o) => o.marcada === "true").map((o) => o.texto).join() === "Cabina,Memoria", `las casillas se marcan y sale «Listo» (${JSON.stringify(pasos.q2)})`);
  debe(JSON.stringify(pasos.q2.pasos) === JSON.stringify(["✓ Instalación", "✓ Partes"]), `la primera ya contestada (${JSON.stringify(pasos.q2.pasos)})`);
  debe((await hecho()).paso === "q2", "marcar no la envía");
  await page.click("#ahora .menu-listo");
  await page.waitForFunction(() => /Ready to submit/.test(document.querySelector("#ahora .ahora-que")?.textContent ?? ""), null, { timeout: 8000 });
  pasos.repaso = await leer("#ahora");
  debe(pasos.repaso.ctx.includes("→ Cabina, Memoria") && pasos.repaso.ops.map((o) => o.texto).join() === "Enviar respuestas,Cancelar", `«Listo» lleva al repaso, con lo contestado (${JSON.stringify(pasos.repaso)})`);
  await page.click('#ahora button[data-num="1"]');
  await page.waitForTimeout(800);
  pasos.enviada = await hecho();
  debe(pasos.enviada.hecho === "enviadas: 2 · 1,3" && pasos.enviada.recibido.join() === "2,1,3,tecla:right,1", `y su 1 la envía (${JSON.stringify(pasos.enviada)})`);

  // 3. Un permiso en Decisiones: de qué es y su comando, la ruta sin hueco.
  await sembrar("permiso");
  await page.goto(`${B}/?r=2`);
  await page.click("#abrir-cajon");
  await page.click('#cajon .fila[data-ir="decisiones"]');
  await page.waitForSelector('#decisiones .preg-term[data-panel="4"] .menu-cmd');
  await page.waitForTimeout(1000);
  pasos.permiso = await leer('#decisiones .preg-term[data-panel="4"]');
  const p = pasos.permiso;
  debe(p.que === "Do you want to proceed?" && p.cmd === "echo hola mundo desde la prueba de interfaz > prueba-permiso.txt", `el permiso dice qué quiere ejecutar (${JSON.stringify(p)})`);
  debe(p.ctx.join(" | ") === "Bash command | Escribe texto de prueba en prueba-permiso.txt", `y de qué es (${JSON.stringify(p.ctx)})`);
  debe(/\\C--proyectos-Adeorq\\572c3eb8/.test(p.ops[1]?.texto ?? "") && p.ops.length === 4, `la ruta partida por dentro sale sin hueco (${p.ops[1]?.texto})`);
  debe(p.ancho <= 390, `nada se sale por la derecha (${p.ancho})`);
  await page.click('#decisiones .preg-term[data-panel="4"] button[data-num="4"]');
  await page.waitForTimeout(700);
  debe((await hecho()).hecho === "No", "contestar desde Decisiones llega a la terminal");

  // 4. Escribir la tuya: una caja, que aguanta un repintado, y se manda entera.
  await sembrar("doble");
  await page.waitForSelector('#decisiones .preg-term[data-panel="4"] button[data-escribir]', { timeout: 9000 });
  await page.click('#decisiones .preg-term[data-panel="4"] button[data-escribir]');
  await page.fill('#decisiones .preg-term[data-panel="4"] .menu-escribir textarea', "el miércoles, mejor");
  debe((await hecho()).recibido.length === 0, "abrir la caja todavía no le teclea nada");
  // Otra terminal que cambia obliga a Decisiones a repintar la lista entera.
  await page.request.post(`${B}/api/sembrar-estado`, { headers: AUT, data: { panel: 5, estado: "pregunta" } });
  await page.waitForTimeout(6000);
  pasos.tras = await page.$eval('#decisiones .preg-term[data-panel="4"] .menu-escribir', (a) => ({ visible: !a.hidden, texto: a.querySelector("textarea").value }));
  debe(pasos.tras.visible && pasos.tras.texto === "el miércoles, mejor", `lo escrito aguanta el repintado (${JSON.stringify(pasos.tras)})`);
  await page.click('#decisiones .preg-term[data-panel="4"] .menu-mandar');
  await page.waitForTimeout(1200);
  pasos.escrita = await hecho();
  debe(pasos.escrita.recibido.join() === "4,el miércoles, mejor" && pasos.escrita.paso === "q2", `se manda su número y luego el texto, y pasa a la siguiente (${JSON.stringify(pasos.escrita)})`);
  return { pasos, fallos };
}
