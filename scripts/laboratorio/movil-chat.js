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

  // 1. Una terminal de agente se abre en el Chat.
  await page.goto(`${B}/#terminal=1`);
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
  debe(/Una decisión te espera/.test(aviso), `se ve la decisión pendiente (${aviso})`);
  await page.click("#aviso-dec");
  await page.waitForSelector(".pregunta-d");
  await page.click("#atras");
  await page.waitForSelector("#turnos .turno");
  debe(await page.$eval("#titulo", (h) => /claude/.test(h.textContent)), "«atrás» vuelve a la terminal de la que venía");

  // 6. Las teclas, en una sola fila.
  const filasTeclas = await page.$$eval(".teclas .pastilla", (b) => new Set(b.map((x) => x.offsetTop)).size);
  debe(filasTeclas === 1, `las teclas en una fila (${filasTeclas})`);

  // 7. «Pantalla»: avisa de dónde está el historial, sin cajitas ni rayas partidas.
  await page.click('[data-cara="pantalla"]');
  await page.waitForTimeout(600);
  const pant = await page.evaluate(() => ({
    nota: !document.getElementById("nota-pantalla").hidden,
    texto: document.getElementById("pantalla").innerText,
    reglas: document.querySelectorAll(".pantalla .regla").length,
    titulo: document.querySelector(".pantalla .regla-titulo")?.innerText || "",
  }));
  debe(pant.nota, "la pantalla dice que el historial está en el Chat");
  debe(!/[⏵⏸─]/.test(pant.texto), "sin ⏵ ni rayas de texto en la pantalla");
  debe(pant.reglas === 1 && pant.titulo === "Adeorq: sesiones y terminales", `rayas como líneas (${pant.reglas}, ${pant.titulo})`);
  await page.click("[data-ir-chat]");
  await page.waitForTimeout(600);
  debe(await page.$eval("#conversa", (c) => !c.hidden), "el enlace de la nota lleva al Chat");

  // 8. Una pregunta con sus opciones; la 2 se manda como «2».
  await page.goto(`${B}/#terminal=4`);
  await page.waitForSelector("#ahora:not([hidden])");
  const preg = await page.$eval("#ahora", (x) => ({ tipo: x.dataset.tipo, texto: x.innerText, n: x.querySelectorAll("button[data-num]").length }));
  debe(preg.tipo === "pregunta" && /Do you want to proceed\?/.test(preg.texto) && preg.n === 3, `la pregunta con 3 opciones (${JSON.stringify(preg)})`);
  await page.click('#ahora button[data-num="2"]');
  await page.waitForTimeout(500);
  const escrito = await (await page.request.get(`${B}/api/escrito?panel=4`, { headers: AUT })).json();
  debe(escrito.texto === "2", `la opción 2 manda «2» (${escrito.texto})`);

  // 9. Una consola sin agente: ni pestañas, ni nota, ni «ahora».
  await page.goto(`${B}/#terminal=3`);
  await page.waitForSelector("#pantalla .l");
  const consola = await page.evaluate(() => ({
    pestanas: !document.getElementById("pestanas").hidden,
    nota: !document.getElementById("nota-pantalla").hidden,
  }));
  debe(!consola.pestanas && !consola.nota, `la consola sin pestañas ni nota (${JSON.stringify(consola)})`);

  return { fallos };
}
