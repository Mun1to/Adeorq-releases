// Tocar una opción de una decisión no mueve la pantalla (Munir, 2026-10-16,
// desde el móvil: «le doy click a alguna respuesta y se baja abajo del todo…
// y solo se ve el fondo»). El círculo de cada opción va escondido con
// `position: absolute`; sin un ancestro posicionado DENTRO de la lista que se
// desliza, se quedaba colgado de la página, fuera de ella, y al marcarlo el
// navegador desplazaba la página entera para enseñarlo.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-decision-scroll.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);
  // Una decisión larga, como las de verdad: cuatro preguntas de cinco opciones.
  const letras = ["A", "B", "C", "D"];
  await fetch(`${B}/api/sembrar-decision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "d19a2b3c4f9", titulo: "Ajustes del móvil", proyecto: "Adeorq", panel: 1,
      preguntas: letras.map((id) => ({
        id, titulo: `La pregunta ${id}, con un título largo que ocupa dos líneas en el móvil`,
        opciones: [1, 2, 3, 4, 5].map((n) => ({ texto: `Opción ${n} de ${id}`, detalle: "Lo que implica, en una frase que también ocupa sitio." })),
      })),
    }),
  });
  await page.goto(`${B}/?v=1#decision=d19a2b3c4f9`);
  await page.waitForSelector('.pregunta-d[data-q="D"] .opcion');
  await page.waitForTimeout(600);

  const medir = () => page.evaluate(() => {
    const c = document.querySelector(".cuerpo");
    return {
      pagina: Math.round(document.scrollingElement.scrollTop),
      lista: Math.round(c.scrollTop),
      altoPagina: document.scrollingElement.scrollHeight,
      altoVentana: innerHeight,
    };
  });
  // Abajo del todo de la lista, como quien va por la última pregunta.
  await page.evaluate(() => { const c = document.querySelector(".cuerpo"); c.scrollTop = c.scrollHeight; });
  await page.waitForTimeout(300);
  pasos.antes = await medir();
  const toques = [];
  for (const [q, n] of [["D", 2], ["C", 4], ["A", 1]]) {
    const op = page.locator(`.pregunta-d[data-q="${q}"] .opcion`).nth(n - 1);
    // A mano y sin que Playwright desplace nada: el toque cae donde se ve.
    await op.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(200);
    const antes = await medir();
    const caja = await op.boundingBox();
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.waitForTimeout(400);
    const despues = await medir();
    const marcada = await op.evaluate((el) => el.querySelector("input").checked);
    const visible = await op.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    toques.push({ q, n, antes, despues, marcada, visible });
    debe(marcada, `${q}${n} se marca`);
    debe(despues.pagina === 0, `al tocar ${q}${n} la página no se desplaza (${antes.pagina} → ${despues.pagina})`);
    debe(Math.abs(despues.lista - antes.lista) <= 2, `al tocar ${q}${n} la lista se queda donde estaba (${antes.lista} → ${despues.lista})`);
    debe(visible, `${q}${n} sigue a la vista después de tocarla`);
  }
  pasos.toques = toques;
  pasos.final = await medir();
  debe(pasos.final.altoPagina <= pasos.final.altoVentana + 1, `la página no es más alta que la pantalla (${pasos.final.altoPagina} > ${pasos.final.altoVentana}): no hay fondo vacío al que caer`);
  return { pasos, fallos };
}
