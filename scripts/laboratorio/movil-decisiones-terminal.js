// Lo que te pregunta una terminal sale también en Decisiones (Munir,
// 2026-10-16: «y que también las decisiones que me hace la terminal me
// aparezcan en el móvil»): arriba, con sus opciones leídas de su pantalla y
// contestables con un toque, y cuenta en el globito. En el doble preguntan dos:
// la 4 (un permiso de Claude Code, tres opciones) y la 2 (Codex, dos).
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-decisiones-terminal.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"); });
  const decisiones = (await (await page.request.get(`${B}/api/decisiones`, { headers: AUT })).json()).decisiones;
  const vivas = decisiones.filter((d) => d.vigencia === "viva").length;
  const terminales = (await (await page.request.get(`${B}/api/terminales`, { headers: AUT })).json()).terminales;
  const preguntan = terminales.filter((t) => ["pregunta", "ofrece"].includes(t.estado)).map((t) => t.panel).sort();

  await page.goto(`${B}/?v=1`);
  await page.waitForSelector("#cuenta-dec:not([hidden])");
  await page.waitForTimeout(500);
  pasos.globo = await page.textContent("#cuenta-dec");
  debe(pasos.globo === String(vivas + preguntan.length), `el globito cuenta las ${vivas} decisiones y las ${preguntan.length} terminales que preguntan (${pasos.globo})`);

  await page.click("#abrir-cajon");
  pasos.menu = await page.textContent('#cajon .fila[data-ir="decisiones"] .cuenta-dec');
  debe(pasos.menu === String(vivas + preguntan.length), `y la fila de Decisiones del menú, lo mismo (${pasos.menu})`);
  await page.click('#cajon .fila[data-ir="decisiones"]');
  await page.waitForSelector("#decisiones .preg-term");
  await page.waitForTimeout(400);
  const ver = () => page.evaluate(() => ({
    tarjetas: [...document.querySelectorAll("#decisiones .preg-term")].map((t) => ({
      panel: Number(t.dataset.panel),
      cab: t.querySelector(".tarjeta-cab b")?.textContent,
      que: t.querySelector(".preg-que")?.textContent ?? "",
      ops: [...t.querySelectorAll("button[data-num]")].map((b) => b.innerText.replace(/\s+/g, " ").trim()),
    })),
    // Arriba de todo, antes que las de los agentes.
    primera: document.querySelector("#decisiones .seccion + *")?.className,
    sub: document.getElementById("sub-dec").textContent,
    ancho: document.documentElement.scrollWidth,
  }));
  pasos.lista = await ver();
  const l = pasos.lista;
  debe(JSON.stringify(l.tarjetas.map((x) => x.panel).sort()) === JSON.stringify(preguntan), `una tarjeta por terminal que pregunta (${JSON.stringify(l.tarjetas.map((x) => x.panel))})`);
  const t4 = l.tarjetas.find((x) => x.panel === 4);
  debe(t4 && /Do you want to proceed\?/.test(t4.que) && t4.ops.length === 3 && /^1 Yes$/.test(t4.ops[0]), `la 4 con su pregunta y sus tres opciones (${JSON.stringify(t4)})`);
  const t2 = l.tarjetas.find((x) => x.panel === 2);
  debe(t2 && /cargo check/.test(t2.que) && t2.ops.length === 2, `la 2, de Codex, con las suyas (${JSON.stringify(t2)})`);
  debe(t4?.cab === "claude · Webs", `dice de qué terminal y proyecto es (${t4?.cab})`);
  debe(l.primera === "preg-term", `van arriba de todo (${l.primera})`);
  debe(l.sub === `${vivas + preguntan.length} te esperan`, `el resumen las cuenta (${l.sub})`);
  debe(l.ancho <= 412, `nada se sale por la derecha (${l.ancho})`);
  // Las de los agentes siguen ahí, y se abren como siempre.
  debe((await page.$$("#decisiones .tarjeta[data-id]")).length >= vivas, "las decisiones de los agentes siguen en la lista");

  // Contestar con un toque manda su número a esa terminal.
  await page.click('#decisiones .preg-term[data-panel="4"] button[data-num="2"]');
  await page.waitForTimeout(600);
  const escrito = await (await page.request.get(`${B}/api/escrito?panel=4`, { headers: AUT })).json();
  debe(escrito.texto === "2", `la opción 2 manda «2» a la terminal 4 (${escrito.texto})`);
  // Y «Abrir la terminal» lleva a ella.
  await page.click('#decisiones .preg-term[data-panel="2"] .ir-term');
  await page.waitForSelector("#texto");
  pasos.abierta = await page.textContent("#titulo");
  debe(/codex/.test(pasos.abierta), `«Abrir la terminal» lleva a la 2 (${pasos.abierta})`);
  return { pasos, fallos };
}
