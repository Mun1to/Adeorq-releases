// El inicio del móvil como lo pidió Munir el 2026-10-15, desde su móvil:
//   · «el botón ese de la estrellita no me gusta»: la caja del inicio sin el ✦;
//   · «en marcha, que solo se muestren las que están trabajando ahora mismo»;
//   · «quita lo de decisiones y terminales en el inicio, que ya está a la
//     izquierda»: sin esos dos botones, y lo que te espera en un globito sobre
//     el botón del cajón;
//   · «el destello azul de cuando trabajan»: el hilo de luz del escritorio en
//     lo que trabaja, en el inicio y en el cajón;
//   · «que Adeo se mueva, que está tieso»: se mueve también con «reducir
//     movimiento» encendido en el teléfono.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-inicio.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};

  await page.setViewportSize({ width: 412, height: 915 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${B}/`);
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));
  await page.goto(`${B}/?v=1`);
  await page.waitForSelector("#portada-term .fila-t");
  await page.waitForTimeout(800);

  // Lo que dice el doble, para contar contra él y no contra un número fijo.
  const terminales = (await (await page.request.get(`${B}/api/terminales`, { headers: AUT })).json()).terminales;
  const decisiones = (await (await page.request.get(`${B}/api/decisiones`, { headers: AUT })).json()).decisiones;
  const trabajando = terminales.filter((t) => t.estado === "a_medias").map((t) => String(t.panel));
  const esperan = decisiones.filter((d) => d.vigencia === "viva").length;

  pasos.inicio = await page.evaluate(() => ({
    enMarcha: [...document.querySelectorAll("#portada-term .fila-t")].map((f) => ({ panel: f.dataset.panel, hilo: f.classList.contains("hilo"), giro: getComputedStyle(f, "::before").animationName })),
    botonesDelInicio: document.querySelectorAll("button#decisiones, button#terminales, .atajos").length,
    // Cualquier dibujo en la caja que no sea la flecha de mandar.
    estrellita: [...document.querySelectorAll("#nueva .mandos .avatar, #nueva .mandos svg")].filter((x) => !x.closest(".enviar")).length,
    globo: (() => {
      const g = document.querySelector("#abrir-cajon #cuenta-dec");
      return g ? { visible: !g.hidden && g.getBoundingClientRect().width > 0, texto: g.textContent } : null;
    })(),
  }));
  const i = pasos.inicio;
  debe(
    i.enMarcha.length === trabajando.length && i.enMarcha.every((f) => trabajando.includes(f.panel)),
    `«En marcha» enseña solo las que trabajan (${trabajando.join(", ")}) y enseña ${i.enMarcha.map((f) => f.panel).join(", ")}`,
  );
  debe(i.enMarcha.every((f) => f.hilo && f.giro === "hilo-vuelta"), `las que trabajan llevan el hilo de luz girando (${JSON.stringify(i.enMarcha)})`);
  debe(i.botonesDelInicio === 0, "el inicio ya no tiene los botones de Decisiones y Terminales");
  debe(i.estrellita === 0, "la caja del inicio ya no lleva la estrellita");
  debe(i.globo?.visible && i.globo.texto === String(esperan), `el globito del cajón dice las ${esperan} que te esperan (${JSON.stringify(i.globo)})`);

  // Adeo se mueve aunque el teléfono pida reducir movimiento: su dibujo cambia.
  pasos.adeo = await page.evaluate(async () => {
    const vistos = new Set();
    for (let n = 0; n < 40; n++) {
      vistos.add(document.querySelector("#masc-portada svg")?.innerHTML ?? "");
      await new Promise((r) => setTimeout(r, 150));
    }
    return { posturas: vistos.size, reducir: matchMedia("(prefers-reduced-motion: reduce)").matches };
  });
  debe(pasos.adeo.reducir && pasos.adeo.posturas >= 2, `Adeo se mueve con «reducir movimiento» (${pasos.adeo.posturas} posturas en 6 s)`);

  // El cajón: lo que trabaja lleva el hilo; y por ahí se llega a Terminales y Decisiones.
  await page.click("#abrir-cajon");
  await page.waitForSelector('#cajon .fila[data-ir="terminales"]');
  await page.waitForTimeout(600);
  pasos.cajon = await page.evaluate(() =>
    [...document.querySelectorAll("#cajon .recientes .fila[data-panel]")].map((f) => ({ panel: f.dataset.panel, hilo: f.classList.contains("hilo") })),
  );
  debe(
    pasos.cajon.every((f) => f.hilo === trabajando.includes(f.panel)),
    `en el cajón llevan el hilo justo las que trabajan (${JSON.stringify(pasos.cajon)})`,
  );
  await page.click('#cajon .fila[data-ir="decisiones"]');
  await page.waitForSelector("#decisiones .tarjeta");
  pasos.decisiones = await page.evaluate(() => document.querySelector("#cuenta-dec")?.textContent);
  debe(pasos.decisiones === String(esperan), `en Decisiones el globito sigue diciendo ${esperan} (${pasos.decisiones})`);

  // Terminales, por estado («la 2», 2026-10-15): un apartado por cómo están,
  // cada fila con el icono de su programa y la que trabaja con el hilo.
  await page.click("#abrir-cajon");
  await page.click('#cajon .fila[data-ir="terminales"]');
  await page.waitForSelector("#terminales .fila[data-panel]");
  pasos.terminales = await page.evaluate(() =>
    [...document.querySelectorAll("#terminales .seccion")].map((s) => ({
      titulo: s.textContent.trim(),
      filas: [...s.nextElementSibling.querySelectorAll(".fila[data-panel]")].map((f) => ({
        panel: f.dataset.panel,
        hilo: f.classList.contains("hilo"),
        icono: f.querySelector(".avatar")?.classList.contains("consola") ? "consola" : "agente",
      })),
    })),
  );
  const ESPERADO = { "Te preguntan": "pregunta", Trabajando: "a_medias", Terminaron: "lista", "En reposo": "" };
  debe(
    JSON.stringify(pasos.terminales.map((s) => s.titulo)) === JSON.stringify(Object.keys(ESPERADO).filter((k) => terminales.some((t) => t.estado === ESPERADO[k]))),
    `Terminales va por estado, en su orden (${pasos.terminales.map((s) => s.titulo).join(", ")})`,
  );
  for (const s of pasos.terminales) {
    const suyas = terminales.filter((t) => t.estado === ESPERADO[s.titulo]).map((t) => String(t.panel)).sort();
    debe(JSON.stringify(s.filas.map((f) => f.panel).sort()) === JSON.stringify(suyas), `«${s.titulo}» lleva ${suyas.join(", ")} (${s.filas.map((f) => f.panel).join(", ")})`);
    for (const f of s.filas) {
      const t = terminales.find((x) => String(x.panel) === f.panel);
      debe(f.hilo === (t.estado === "a_medias"), `la ${f.panel} lleva el hilo solo si trabaja`);
      debe(f.icono === (t.agente ? "agente" : "consola"), `la ${f.panel} lleva el icono de su programa`);
    }
  }
  return { pasos, fallos };
}
