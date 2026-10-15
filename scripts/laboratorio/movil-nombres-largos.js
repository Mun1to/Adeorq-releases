// Con nombres de verdad, nada se sale de su tarjeta ni la página se desliza de
// lado. Munir, 2026-10-15, desde su móvil y con cuatro capturas: con sus
// sesiones («Adeorq: sesiones y terminales · Adeorq», «Orquio · Orquio: webs de
// los negocios · Orquio») el estado («terminó», «hablada») salía por fuera de la
// tarjeta y la vista entera se podía arrastrar a un lado, con las tarjetas
// cortadas por la izquierda. El doble tiene nombres cortos y no lo cazaba: aquí
// se le cambian por los suyos al vuelo (`page.route`), sin tocar el doble.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-nombres-largos.js
//
// A 412 px de ancho, el de su móvil. Devuelve { medidas, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const SUYOS = [
    ["Adeorq: sesiones y terminales", "C:\\proyectos\\Adeorq"],
    ["SESION SUPREMA", "C:\\proyectos"],
    ["Orquio · Orquio: webs de los negocios", "C:\\proyectos\\Orquio"],
    ["Redes sociales", "C:\\proyectos\\MarcaPersonal"],
    ["winshotx-architecture-setup", "C:\\proyectos\\winshotx"],
  ];
  const LARGAS = [
    "Qué frena algo (terminales, cuotas, incidencia) y lo que ya decidí por la recomendada",
    "Estructura de Orquio: estructura de carpetas, nombres y lo que va en cada una",
  ];
  const cambiar = (ruta, arreglar) =>
    page.route(ruta, async (r) => {
      const res = await r.fetch();
      const j = await res.json();
      await r.fulfill({ response: res, json: arreglar(j) });
    });
  await cambiar("**/api/terminales*", (j) => ({
    ...j,
    terminales: j.terminales.map((t, i) => (SUYOS[i] ? { ...t, nombre: SUYOS[i][0], carpeta: SUYOS[i][1] } : t)),
  }));
  await cambiar("**/api/decisiones*", (j) => ({
    ...j,
    decisiones: j.decisiones.map((d, i) => ({ ...d, titulo: LARGAS[i % LARGAS.length] })),
  }));

  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));

  // Lo que se sale: la página o su zona de contenido más ancha que la
  // pantalla, y cada estado más allá del borde de su tarjeta o de la pantalla.
  const medir = () =>
    page.evaluate(() => {
      const fuera = [];
      for (const e of document.querySelectorAll(".estado, .fila-t > span, .fila-term b, .fila-term small, .fila-term .punto")) {
        const r = e.getBoundingClientRect();
        if (!r.width) continue;
        const caja = e.closest(".tarjeta, .grupo")?.getBoundingClientRect();
        if (r.left < -1 || r.right > innerWidth + 1 || (caja && r.right > caja.right + 1)) {
          fuera.push(`«${e.textContent.trim()}» (${Math.round(r.left)}–${Math.round(r.right)}, su caja acaba en ${caja ? Math.round(caja.right) : "-"})`);
        }
      }
      const cuerpos = [...document.querySelectorAll(".cuerpo")].filter((c) => c.offsetParent);
      return {
        pagina: document.documentElement.scrollWidth,
        ancho: innerWidth,
        deslizable: cuerpos.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => `${c.id || "cuerpo"} ${c.scrollWidth}>${c.clientWidth}`),
        fuera,
      };
    });
  const mirar = async (vista, ir) => {
    await ir();
    await page.waitForTimeout(900);
    const m = await medir();
    debe(m.pagina <= m.ancho, `${vista}: la página mide ${m.pagina} px en una pantalla de ${m.ancho}`);
    debe(!m.deslizable.length, `${vista}: se puede arrastrar de lado (${m.deslizable.join(", ")})`);
    debe(!m.fuera.length, `${vista}: se sale de su tarjeta ${m.fuera.join("; ")}`);
    return m;
  };

  const medidas = {};
  medidas.portada = await mirar("la portada", async () => {
    await page.goto(`${B}/?v=1`);
    await page.waitForSelector("#portada-term .fila-t");
  });
  medidas.terminales = await mirar("Terminales", async () => {
    await page.click("#abrir-cajon"); await page.click('#cajon .fila[data-ir="terminales"]');
    await page.waitForSelector("#terminales .fila[data-panel]");
  });
  medidas.decisiones = await mirar("Decisiones", async () => {
    await page.goto(`${B}/?v=2`);
    await page.waitForSelector("#portada-term .fila-t");
    await page.click("#abrir-cajon"); await page.click('#cajon .fila[data-ir="decisiones"]');
    await page.waitForSelector("#decisiones .tarjeta");
  });
  return { medidas, fallos };
}
