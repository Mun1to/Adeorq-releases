// La página del móvil con la app en INGLÉS, a 390 px, contra el doble en inglés
// recién arrancado (contestar y mandar cambian su estado: entre dos pasadas se
// vuelve a arrancar):
//
//   IDIOMA=en node scripts/laboratorio/doble-movil.mjs 4392
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-ingles.js")
//
// Nació el 2026-10-14: la página solo existía en español y con la app en inglés
// sus botones salían en español. Recorre todas las pantallas (emparejar, la
// portada, el conserje, una sesión, las terminales, cada cara de una terminal y
// las decisiones) y en cada una busca español en lo que pinta la PÁGINA: los
// textos, `placeholder`, `aria-label`, `title`, las opciones de los desplegables
// y el rótulo de «Recientes». Lo que escriben los agentes y el conserje (las
// burbujas, la pantalla, los títulos, los encargos) es de ellos y no cuenta: los
// datos del doble están en español a propósito, y así se ve que distingue.
// Su compañero estático, el que va en `pnpm comprobar`: `scripts/movil-idioma-check.mjs`.
//
// Devuelve { fallos, vistas }: `fallos` vacío es que no queda español a la vista.
async (page) => {
  const B = "http://127.0.0.1:4392";
  const fallos = [];
  const vistas = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };

  /* Lo que se ve y es de la página. `suelto` son los elementos que mezclan: su
     texto suelto es del agente (un título, el porqué del router) y lo que lleva
     dentro en <b> o <small>, de la página. */
  const mirar = async (vista, suelto = "") => {
    const malos = await page.evaluate(({ vista, suelto }) => {
      const DATOS = [
        ".burbuja", ".pantalla", ".ahora-que", ".ahora-det", ".opciones-menu span:not(.num)", ".tarjeta-cab > b", ".quien > b",
        ".para", ".fila > b", ".fila-t > b", "legend", ".opcion .txt > b", ".opcion .txt > small",
        ".dec-cab > p:not(.dec-vig):not(.dec-hecha)", ".pregunta-d > p", ".pasos li:not(.antes)", ".pasos summary span", ".herramientas", ".adjunto .que",
      ].join(",");
      // Dentro de una burbuja, pero de la página.
      const UI_EN_DATOS = ".chip-img, .acciones button";
      const MEZCLA = ["#titulo", ".tarjeta[data-clave] .porque", ".aviso-dec > span", suelto].filter(Boolean).join(",");
      // Las tildes cazan «sesión» o «móvil»; la lista, lo que se escribe sin
      // ellas. Sin «decision» ni «session»: sin tilde son inglés.
      const ES = /[áéíóúñ¿¡«»]|\b(de|del|la|las|el|los|que|con|para|una|sin|tus?|te|hay|esta|este|esto|nada|ya|se|lo|al|y|pero|cuando|desde|hace|sus?|por|ninguna?|otra|cosa|sesiones|conserje|decisiones|pantalla|enviar|copiar|volver|panel|terminales|abiert[ao]|cerrada|quieta|trabajando|preguntas?|respuesta|contestar|descartar|modo|teclas|intro|flecha|mejorar|deshacer|avisos|aparato|emparejar|ajustes|recientes|mandar|esperan?|imagen|pasos?)\b/i;
      const visible = (el) => (el.checkVisibility ? el.checkVisibility() : !!el.offsetParent);
      const malos = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.textContent.trim();
        const p = n.parentElement;
        if (!t || !p || p.closest("script,style") || !visible(p)) continue;
        if (p.closest(DATOS) && !p.closest(UI_EN_DATOS)) continue;
        if (MEZCLA && p.matches(MEZCLA)) continue;
        if (ES.test(t)) malos.push(`${vista}: «${t.slice(0, 90)}»`);
      }
      for (const el of document.querySelectorAll("[placeholder],[aria-label],[title]")) {
        for (const a of ["placeholder", "aria-label", "title"]) {
          const v = el.getAttribute(a);
          if (v && ES.test(v)) malos.push(`${vista} [${a}]: «${v}»`);
        }
      }
      for (const o of document.querySelectorAll("option")) if (ES.test(o.textContent)) malos.push(`${vista} <option>: «${o.textContent}»`);
      const filas = document.getElementById("filas");
      if (filas && filas.children.length) {
        const c = getComputedStyle(filas, "::before").content;
        if (ES.test(c) || c === "none") malos.push(`${vista} «Recientes»: ${c}`);
      }
      return malos;
    }, { vista, suelto });
    vistas.push(vista);
    fallos.push(...malos);
  };
  const paso = async (vista, fn) => {
    try { await fn(); } catch (err) { fallos.push(`${vista}: no se pudo recorrer (${String(err.message || err).split("\n")[0]})`); }
  };

  await page.goto(`${B}/`);
  await page.setViewportSize({ width: 780, height: 1600 });
  const k = 780 / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(390 * k), height: Math.round(844 * k) });
  await page.evaluate(() => localStorage.clear());

  // 1. Emparejar, con un código malo (el error viene del PC, traducido) y el bueno.
  await paso("emparejar", async () => {
    await page.goto(`${B}/`);
    debe((await page.getAttribute("html", "lang")) === "en", "el doble sirve la página con lang=en");
    await page.waitForSelector("#codigo");
    await mirar("emparejar");
    await page.fill("#codigo", "000000");
    await page.click("#entrar");
    await page.waitForSelector("#error .nota");
    const mal = await page.textContent("#error .nota");
    debe(mal === "That is not the code.", `el error del PC, traducido («${mal}»)`);
    await mirar("emparejar con error");
    await page.fill("#codigo", "123456");
    await page.click("#entrar");
    await page.waitForSelector("#filas .fila");
  });

  // 2. La portada: lo que te espera, las terminales y lo hablado con el conserje.
  await paso("portada", async () => {
    await page.waitForSelector("#portada-term .fila-t");
    await page.waitForTimeout(400);
    const yo = await page.textContent("#yo");
    debe(/waiting for you|working|all quiet/.test(yo), `el resumen de arriba en inglés («${yo}»)`);
    await mirar("portada");
  });

  // 3. El conserje: una conversación, lo que va haciendo al pensar, el router apagado y «Mejorar».
  await paso("conserje", async () => {
    await page.click("#filas .fila");
    await page.waitForSelector("#hilo .turno");
    await page.waitForTimeout(300);
    await mirar("conserje");
    await page.fill("#texto", "Revisa el móvil");
    await page.click("#enviar");
    await page.waitForSelector("#hilo .pensando");
    const pensando = await page.textContent("#hilo .pensando");
    debe(/Sending it to your PC|Looking at your projects|Thinking/.test(pensando), `lo que hace al pensar, en inglés («${pensando}»)`);
    await mirar("conserje pensando");
    await page.waitForSelector("#hilo .pensando", { state: "detached", timeout: 20000 });
    await page.waitForSelector("#hilo .tarjeta[data-clave]");
    await mirar("conserje con sesiones");
    await page.click("#router");
    await page.waitForSelector("#fijo-caja:not([hidden])");
    await mirar("conserje sin router");
    await page.click("#router");
    await page.fill("#texto", "arregla lo del móvil");
    await page.click("#mejorar");
    await page.waitForSelector("#aviso-mejora:not([hidden])");
    await mirar("conserje mejorado");
  });

  // 4. Una sesión que abrió el conserje, para leerla.
  await paso("sesion", async () => {
    await page.click("#hilo .tarjeta[data-clave]");
    await page.waitForSelector(".solo-lectura");
    await page.waitForTimeout(500);
    await mirar("sesion", ".barra small");
  });

  // 5. Todas las terminales.
  await paso("terminales", async () => {
    await page.goto(`${B}/`);
    await page.click("#abrir-cajon"); await page.click('#cajon .fila[data-ir="terminales"]');
    await page.waitForSelector("#terminales .fila[data-panel]");
    await mirar("terminales");
  });

  // 6. Cada terminal: trabajando (chat, teclas fuera y pantalla), una de Codex
  //    sin transcript, un permiso con su menú, una que terminó y una consola.
  await paso("terminal 1", async () => {
    await page.goto(`${B}/#terminal=1@111`);
    await page.waitForSelector("#turnos .turno");
    await page.waitForTimeout(600);
    const ahora = await page.$eval("#ahora", (x) => x.innerText);
    debe(/Working · 26s/.test(ahora), `«Trabajando», en inglés («${ahora.split("\n")[0]}»)`);
    const sub = await page.textContent("#sub");
    debe(/auto mode/.test(sub), `el modo, en inglés («${sub}»)`);
    await mirar("terminal 1 chat");
    await mirar("terminal 1 mandos");
    await page.click('.pestanas .pastilla[data-cara="pantalla"]');
    // Con lo de antes sacado del transcript (2026-10-16), ya sin la nota del Chat.
    await page.waitForSelector("#pantalla .h-dice");
    await mirar("terminal 1 pantalla");
    await page.click('.pestanas .pastilla[data-cara="conversa"]');
  });
  for (const [panel, que] of [[2, "codex sin transcript"], [4, "permiso"], [5, "terminó"], [3, "consola"]]) {
    await paso(`terminal ${panel}`, async () => {
      await page.goto(`${B}/#terminal=${panel}@111`);
      await page.waitForSelector(panel === 3 ? "#pantalla .l" : "#ahora:not([hidden])");
      await page.waitForTimeout(800);
      await mirar(`terminal ${panel} (${que})`);
    });
  }

  // 7. Las decisiones: la lista, la que te espera (sin contestar: «faltan»), una
  //    huérfana y una contestada.
  await paso("decisiones", async () => {
    await page.goto(`${B}/`);
    await page.click("#abrir-cajon"); await page.click('#cajon .fila[data-ir="decisiones"]');
    await page.waitForSelector("#decisiones .tarjeta");
    await mirar("decisiones");
    await page.click('#decisiones .tarjeta[data-vigencia="viva"]');
    await page.waitForSelector(".pregunta-d");
    await page.waitForTimeout(300);
    const falta = await page.textContent("#estado-envio");
    debe(/still need an answer/.test(falta), `lo que falta, en inglés («${falta}»)`);
    await mirar("decisión viva");
    for (const v of ["huerfana", "contestada"]) {
      await page.click("#atras");
      await page.waitForSelector("#decisiones .tarjeta");
      await page.click(`#decisiones .tarjeta[data-vigencia="${v}"] >> nth=0`);
      await page.waitForSelector(".pregunta-d");
      await page.waitForTimeout(300);
      await mirar(`decisión ${v}`);
    }
  });

  return { fallos, vistas };
}
