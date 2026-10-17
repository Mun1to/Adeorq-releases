// Que el detector de cárceles (`carceles.js`) siga cazando lo que tiene que
// cazar y se salte SOLO lo que Munir aprobó (su lista `APROBADAS`).
//
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/carceles-prueba.js
//
// Monta una página de mentira con una pieza de cada clase y pasa el detector
// por ella: una píldora falsa, un tinte hecho con `color-mix` (el punto ciego
// que tuvo), iconos metidos en su cuadro (también un `.mini` de solo icono, que
// la lista de aprobadas no debe tapar), tres aprobadas, y tres que no son
// cárceles (el botón principal relleno, una casilla de datos y una tarjeta).
// Devuelve `fallos` con lo que no salió como debe; vacío, todo bien.
async (page) => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const detector = (0, eval)(readFileSync(join(process.cwd(), "scripts", "laboratorio", "carceles.js"), "utf8"));
  const icono = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7h10" stroke="currentColor"/></svg>';
  await page.setContent(`
    <style>
      body { background: #10141c; color: #e6edfa; font: 14px sans-serif; padding: 20px; display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
      .t-pildora { padding: 2px 8px; border-radius: 999px; background: rgba(255, 196, 107, 0.2); }
      .t-mix { padding: 2px 6px; border-radius: 6px; background: color-mix(in srgb, #4d9fff 20%, transparent); }
      .t-icono, .mini { padding: 4px 8px; border-radius: 6px; border: 1px solid #5a6478; background: none; color: inherit; }
      .ag-cal-celda { padding: 6px; border-radius: 8px; border: none; background: rgba(255, 255, 255, 0.05); color: inherit; }
      kbd { padding: 1px 6px; border-radius: 4px; border: 1px solid #5a6478; }
      .t-principal { padding: 8px 16px; border-radius: 6px; border: none; background: #1f6fe0; color: #fff; }
      .t-celda { padding: 4px; border-radius: 3px; background: rgba(77, 159, 255, 0.4); }
      .t-tarjeta { padding: 12px; border-radius: 8px; border: 1px solid #5a6478; max-width: 240px; }
    </style>
    <span class="t-pildora">beta</span>
    <span class="t-mix">3</span>
    <button class="t-icono">${icono}</button>
    <button class="mini icono t-mini-icono">${icono}</button>
    <button class="mini t-mini-sin-clase">${icono}</button>
    <button class="mini">Importar un tema</button>
    <button class="ag-cal-celda">28</button>
    <kbd>Ctrl+K</kbd>
    <button class="t-principal">Guardar</button>
    <span class="t-celda" data-celda="">5</span>
    <div class="t-tarjeta"><h3>Una tarjeta</h3><p>Con contenido de verdad, varias piezas y más de una línea de texto dentro.</p><p>Otra línea.</p></div>
  `);
  const r = await detector(page);
  const fallos = [];
  const debe = (cond, que) => {
    if (!cond) fallos.push(que);
  };
  const cazada = (trozo) => r.fallos.some((f) => f.includes(trozo));
  const aprobada = (trozo) => r.aprobadas.some((a) => a.includes(trozo));
  debe(cazada("«beta» en span.t-pildora (fondo tintado)"), "no caza la píldora falsa");
  debe(cazada("en span.t-mix (fondo tintado)"), "no caza un tinte hecho con color-mix");
  debe(cazada("un icono en button.t-icono (borde)"), "no caza un icono en su cuadro");
  debe(cazada("un icono en button.mini.icono.t-mini-icono"), "no caza un .mini icono enmarcado");
  debe(cazada("un icono en button.mini.t-mini-sin-clase"), "la aprobación de los .mini con texto tapa uno de solo icono");
  debe(aprobada("«Importar un tema» en button.mini") && !cazada("Importar un tema"), "no se salta el .mini con texto (A)");
  debe(aprobada("en button.ag-cal-celda") && !cazada("ag-cal-celda"), "no se salta el día de la Agenda (C)");
  debe(aprobada("en kbd") && !cazada("en kbd"), "no se salta la tecla dibujada (B)");
  debe(r.aprobadas.every((a) => / · aprobada el 2026-10-17: /.test(a)), "una aprobada no dice su fecha y para qué es");
  debe(!cazada("t-principal"), "caza el botón principal relleno, que no es cárcel");
  debe(!cazada("t-celda"), "caza una casilla de datos (data-celda)");
  debe(!cazada("t-tarjeta"), "caza una tarjeta con contenido de verdad");
  debe(r.fallos.length === 5, `esperaba 5 cárceles y salen ${r.fallos.length}: ${r.fallos.join(" | ")}`);
  return { fallos, detector: r };
}
